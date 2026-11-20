from django.conf import settings
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import PhoneOTP, User
from .phone import is_valid_phone, normalize_phone, pretty_phone


def self_patient(user: User):
    from clinic.models import Patient

    return Patient.objects.filter(account=user, relation="self").order_by("id").first()


def user_payload(user: User) -> dict:
    doctor = getattr(user, "doctor", None) if user.role == User.Role.DOCTOR else None
    me = self_patient(user)
    complete = user.role != User.Role.PATIENT or bool(
        user.first_name and me and me.date_of_birth and me.gender and me.consent_at
    )
    return {
        "id": user.id,
        "name": user.get_full_name() or "",
        "phone": user.phone or "",
        "phone_display": pretty_phone(user.phone or ""),
        "email": user.email or "",
        "role": user.role,
        "gender": me.gender if me else "",
        "date_of_birth": me.date_of_birth.isoformat() if me and me.date_of_birth else None,
        "profile_complete": complete,
        "doctor": {"slug": doctor.slug, "name": doctor.name, "code": doctor.code} if doctor else None,
    }


class ProfileSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    gender = serializers.ChoiceField(choices=["male", "female", "other"])
    date_of_birth = serializers.DateField()
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    consent = serializers.BooleanField()

    def validate_name(self, v):
        v = " ".join(v.split())
        if len(v) < 2:
            raise serializers.ValidationError("Enter your full name.")
        return v

    def validate_date_of_birth(self, v):
        from django.utils import timezone

        today = timezone.localdate()
        if v > today:
            raise serializers.ValidationError("Date of birth can't be in the future.")
        if v.year < today.year - 120:
            raise serializers.ValidationError("Check the year of birth.")
        return v

    def validate_consent(self, v):
        if not v:
            raise serializers.ValidationError("Please agree to share your details with the doctors you book.")
        return v


def apply_profile(user: User, data: dict) -> User:
    """Save the registration details on the account and its 'self' patient."""
    from django.utils import timezone

    from clinic.models import Patient

    user.first_name, _, user.last_name = data["name"].partition(" ")
    if data.get("email") is not None:
        user.email = data.get("email", "")
    user.save(update_fields=["first_name", "last_name", "email"])
    me = self_patient(user) or Patient(account=user, relation="self")
    me.name = data["name"]
    me.gender = data["gender"]
    me.date_of_birth = data["date_of_birth"]
    me.phone = user.phone or me.phone
    if data.get("consent") and not me.consent_at:
        me.consent_at = timezone.now()
    me.save()
    if user.phone:
        Patient.objects.filter(phone=user.phone, account__isnull=True).update(account=user)
    return user


def token_response(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": user_payload(user)}


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not is_valid_phone(value):
            raise serializers.ValidationError("Enter a valid mobile number.")
        return normalize_phone(value)


class RegisterSerializer(ProfileSerializer):
    phone = PhoneField()
    code = serializers.RegexField(r"^\s*\d{6}\s*$", error_messages={"invalid": "The code has 6 digits."})


class OTPRequestSerializer(serializers.Serializer):
    phone = PhoneField()


class OTPVerifySerializer(serializers.Serializer):
    phone = PhoneField()
    code = serializers.RegexField(r"^\s*\d{6}\s*$", error_messages={"invalid": "The code has 6 digits."})
    name = serializers.CharField(required=False, allow_blank=True, max_length=120)


class OTPRequestView(APIView):
    """Send a 6-digit login code to the phone's WhatsApp."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        s = OTPRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = s.validated_data["phone"]
        _, code = PhoneOTP.issue(phone)
        from clinic.notifications import send_otp

        send_otp(phone, code)
        existing = User.objects.filter(phone=phone).first()
        body = {
            "sent": True,
            "phone_display": pretty_phone(phone),
            "is_new": existing is None,
            # False for new numbers and for accounts first made on WhatsApp
            # that haven't filled in the registration form yet.
            "registered": bool(existing and user_payload(existing)["profile_complete"]),
        }
        if settings.CARESLOT["OTP_ECHO"]:
            body["dev_code"] = code  # local development only
        return Response(body)


class OTPVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        s = OTPVerifySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone, code = s.validated_data["phone"], s.validated_data["code"]
        if not PhoneOTP.verify(phone, code):
            return Response({"detail": "That code is wrong or has expired. Request a new one."},
                            status=status.HTTP_400_BAD_REQUEST)
        from clinic.models import Patient
        from clinic.services import ensure_patient_account

        name = (s.validated_data.get("name") or "").strip()
        user = ensure_patient_account(phone, name)
        if not user.is_active:
            return Response({"detail": "This account is disabled."}, status=status.HTTP_403_FORBIDDEN)
        if name and not user.first_name:
            user.first_name, _, user.last_name = name.partition(" ")
            user.save(update_fields=["first_name", "last_name"])
        # Bookings made earlier on WhatsApp or as a walk-in with this phone
        # now belong to the account.
        Patient.objects.filter(phone=phone, account__isnull=True).update(account=user)
        return Response(token_response(user))


class RegisterView(APIView):
    """Create an account (or complete one first made on WhatsApp) in one step:
    verify the WhatsApp code and save the profile."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        existing = User.objects.filter(phone=d["phone"]).first()
        if existing and existing.role != User.Role.PATIENT:
            return Response({"detail": "This number belongs to a doctor or staff login. Sign in instead."},
                            status=status.HTTP_400_BAD_REQUEST)
        if existing and user_payload(existing)["profile_complete"]:
            return Response({"detail": "This number is already registered. Sign in instead.", "code": "already_registered"},
                            status=status.HTTP_400_BAD_REQUEST)
        if not PhoneOTP.verify(d["phone"], d["code"]):
            return Response({"detail": "That code is wrong or has expired. Request a new one."},
                            status=status.HTTP_400_BAD_REQUEST)
        from clinic.services import ensure_patient_account

        user = ensure_patient_account(d["phone"], d["name"])
        apply_profile(user, d)
        return Response(token_response(user), status=status.HTTP_201_CREATED)


class PhoneOrUsernameTokenSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        login = attrs.get(self.username_field, "")
        if is_valid_phone(login) and not User.objects.filter(username=login).exists():
            u = User.objects.filter(phone=normalize_phone(login)).first()
            if u:
                attrs[self.username_field] = u.username
        data = super().validate(attrs)
        data["user"] = user_payload(self.user)
        return data


class PasswordLoginView(TokenObtainPairView):
    """Doctors and admins can also sign in with a username (or phone) and password."""

    serializer_class = PhoneOrUsernameTokenSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(user_payload(request.user))

    def patch(self, request):
        """Complete or update the profile of a signed-in user."""
        s = ProfileSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        apply_profile(request.user, s.validated_data)
        return Response(user_payload(request.user))

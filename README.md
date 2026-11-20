# CareSlot

Appointment booking for doctors who consult privately from home clinics. Patients book through **WhatsApp**, the **website** or the **mobile app**. Doctors manage their day in the **doctor portal** or by sending short WhatsApp commands. All channels share one schedule, so a slot booked anywhere disappears everywhere.

```
backend/   Django + DRF API, booking engine, WhatsApp bot and webhook
web/       Next.js 16 website: patient booking site and doctor portal
mobile/    Expo (React Native) patient app for Android and iOS
demo/      The original clickable HTML demo
```

## Run it locally

You need Python 3.12+ and Node.js 22.13+ (Expo 58 requires it; this PC has 22.12, so update Node before using the mobile app's lint and dev tools).

**1. API** (http://127.0.0.1:8000)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env         # keeps WhatsApp in console mode
python manage.py migrate
python manage.py seed_demo     # admin + 4 sample doctors + sample bookings
python manage.py runserver
```

Sample logins (password `careslot123`): `admin`, and doctors `dr.anitha`, `dr.rahul`, `dr.fathima`, `dr.joseph`. Change these before anything goes online.

**2. Website** (http://localhost:3000)

```bash
cd web
copy .env.example .env.local
npm install
npm run dev
```

Patients sign in with their phone number. In development the OTP is shown on screen, so no WhatsApp is needed. Doctors and admins use **Doctor / staff password** on the sign-in page, then open **Doctor portal**.

**3. Mobile app**

```bash
cd mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env`:
- Android emulator: `http://10.0.2.2:8000/api`
- Real phone on the same Wi-Fi: `http://<your PC's IP>:8000/api` (run Django with `runserver 0.0.0.0:8000` and add the IP to `ALLOWED_HOSTS`)

Scan the QR code with Expo Go, or build installable apps with EAS: `npx eas-cli@latest build -p android`.

## Testing the WhatsApp bot without WhatsApp

While `WHATSAPP_TOKEN` is empty, nothing is sent to Meta. Every message is stored in the message log instead. Sign in as `admin` and open **Doctor portal → WhatsApp tester** to chat with the real bot as any phone number:

- As a patient: send `Hi` or a doctor code like `DR-ANITHA`, then tap through booking.
- As a doctor: use a doctor's registered phone (samples: `919800000001`–`919800000004`) and send `today`, `next`, `block 7pm-8pm`, `leave tomorrow`, `done CS-1042` or `help`.

## Adding a real doctor

1. Django admin (`/admin/`) → **Users** → add a user with role **Doctor**, their name, and their WhatsApp number (`91XXXXXXXXXX`).
2. **Doctors** → add a doctor linked to that user. Fill in specialty, area, address, fee and weekly sessions. Leave code and slug empty; they are generated (e.g. `DR-ANITHA`).
3. The doctor signs in and downloads their QR code from **Profile, link & QR**.

## Going live on WhatsApp

1. Create a Meta Business account and complete **business verification**. This takes 1–2 weeks, so start early.
2. In Meta for Developers, create an app with **WhatsApp**. Add a dedicated phone number that isn't already on the WhatsApp app, and get the display name approved.
3. Create a **permanent system-user token** with `whatsapp_business_messaging` permission.
4. Submit the message templates. To print them, run `python manage.py whatsapp_templates`. Wait until all of them are approved.
5. Set these on the server: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_NUMBER`.
6. Webhook URL: `https://<api-host>/api/whatsapp/webhook/` with the same verify token. Subscribe to the **messages** field.
7. Change the sample doctors' phone numbers to real ones, or delete them. The seed command refuses to run while WhatsApp is live.

## Deploying

- **API + scheduled jobs:** `render.yaml` defines the API, the hourly reminder job and the 7 AM doctor summary. Use a paid, always-on plan: Meta needs fast webhook replies. Point `DATABASE_URL` at Neon.
- **Website:** deploy `web/` on Vercel with `NEXT_PUBLIC_API_BASE_URL=https://<api-host>/api`. Add the site URL to the API's `CORS_ALLOWED_ORIGINS`.
- **App:** build with EAS and publish on Google Play and the App Store.

## Tests

```bash
cd backend && venv\Scripts\python manage.py test   # 28 tests
cd web && npx tsc --noEmit && npx eslint src && npm run build
cd mobile && npx tsc --noEmit && npx eslint src
```

## Privacy (India DPDP Act)

Patients agree to share their details with the doctor when they confirm a booking (`consent_at` is recorded). WhatsApp messages carry only logistics: time, place and booking ID. Never put diagnoses or prescriptions in messages or templates.

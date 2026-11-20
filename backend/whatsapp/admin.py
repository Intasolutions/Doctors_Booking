from django.contrib import admin

from .models import Conversation, MessageLog


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("phone", "profile_name", "last_inbound_at", "updated_at")
    search_fields = ("phone", "profile_name")
    readonly_fields = ("last_inbound_at", "updated_at")


@admin.register(MessageLog)
class MessageLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "direction", "phone", "kind", "status", "short")
    list_filter = ("direction", "kind", "status")
    search_fields = ("phone", "summary", "wa_id")
    readonly_fields = [f.name for f in MessageLog._meta.fields]

    @admin.display(description="Message")
    def short(self, obj):
        return (obj.summary or "")[:80]

    def has_add_permission(self, request):
        return False

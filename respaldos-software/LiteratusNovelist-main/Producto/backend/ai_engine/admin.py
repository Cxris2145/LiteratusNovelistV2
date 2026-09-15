from django.contrib import admin
from .models import AIAvatar, ChatSession, ChatMessage, AssistantConversation, AssistantMessage

class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ['role', 'content', 'created_at']
    can_delete = False

@admin.register(AIAvatar)
class AIAvatarAdmin(admin.ModelAdmin):
    list_display = ['name', 'edition', 'model_name', 'temperature']

@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'avatar', 'created_at']
    search_fields = ['user__email', 'title']
    inlines = [ChatMessageInline]

@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    """
    Registro explícito de ChatMessage para auditoría detallada de
    mensajes individuales del sistema, usuario o IA.
    """
    list_display = ['session', 'role', 'created_at']
    search_fields = ['content', 'session__title', 'session__user__username']
    list_filter = ['role', 'created_at']
    readonly_fields = ['created_at', 'updated_at']


class AssistantMessageInline(admin.TabularInline):
    model = AssistantMessage
    extra = 0
    readonly_fields = ['role', 'content', 'section', 'created_at']
    can_delete = False


@admin.register(AssistantConversation)
class AssistantConversationAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'created_at', 'updated_at']
    search_fields = ['user__email', 'user__username', 'title']
    inlines = [AssistantMessageInline]


@admin.register(AssistantMessage)
class AssistantMessageAdmin(admin.ModelAdmin):
    list_display = ['conversation', 'role', 'section', 'created_at']
    search_fields = ['content', 'conversation__title', 'conversation__user__username']
    list_filter = ['role', 'created_at']
    readonly_fields = ['created_at', 'updated_at']

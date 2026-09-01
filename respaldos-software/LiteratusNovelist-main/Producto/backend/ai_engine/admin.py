from django.contrib import admin
from .models import AIAvatar, ChatSession, ChatMessage

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

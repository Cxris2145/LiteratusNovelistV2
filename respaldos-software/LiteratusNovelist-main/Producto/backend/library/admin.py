from django.contrib import admin
from .models import UserInventory, ReadingProgress, UserBookmark

class ReadingProgressInline(admin.StackedInline):
    model = ReadingProgress
    can_delete = False

@admin.register(UserInventory)
class UserInventoryAdmin(admin.ModelAdmin):
    list_display = ['user', 'edition', 'acquired_at']
    search_fields = ['user__email', 'edition__book__title']
    inlines = [ReadingProgressInline]

@admin.register(UserBookmark)
class UserBookmarkAdmin(admin.ModelAdmin):
    list_display = ['inventory', 'position_cfi', 'created_at']

@admin.register(ReadingProgress)
class ReadingProgressAdmin(admin.ModelAdmin):
    """
    Control de progreso de lectura gestionable desde el propio admin
    para depuración o reseteos manuales si el progreso se corrompe.
    """
    list_display = ['inventory', 'completion_percentage', 'current_page', 'updated_at']
    search_fields = ['inventory__user__username', 'inventory__edition__book__title']
    readonly_fields = ['created_at', 'updated_at']

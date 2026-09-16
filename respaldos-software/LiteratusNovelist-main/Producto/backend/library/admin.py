"""
library/admin.py — Registro de modelos en el Django Admin.
"""
from django.contrib import admin
from .models import (
    UserInventory, ReadingProgress, UserBookmark, UserFavorite,
    ReadingSession, Achievement, UserAchievement,
)


@admin.register(Achievement)
class AchievementAdmin(admin.ModelAdmin):
    list_display = ['code', 'title', 'category', 'threshold', 'ink_reward', 'sort_order']
    list_filter = ['category']
    search_fields = ['code', 'title']
    ordering = ['sort_order', 'category']
    list_editable = ['sort_order', 'ink_reward']


@admin.register(UserAchievement)
class UserAchievementAdmin(admin.ModelAdmin):
    list_display = ['user', 'achievement', 'current_progress', 'is_unlocked_display', 'unlocked_at']
    list_filter = ['achievement__category', 'unlocked_at']
    search_fields = ['user__username', 'achievement__code']
    raw_id_fields = ['user', 'achievement']

    @admin.display(boolean=True, description='Desbloqueado')
    def is_unlocked_display(self, obj):
        return obj.is_unlocked


@admin.register(ReadingSession)
class ReadingSessionAdmin(admin.ModelAdmin):
    list_display = ['user', 'book', 'started_at', 'ended_at', 'chapters_read']
    list_filter = ['started_at']
    search_fields = ['user__username', 'book__title']
    raw_id_fields = ['user', 'book']
    date_hierarchy = 'started_at'


@admin.register(UserInventory)
class UserInventoryAdmin(admin.ModelAdmin):
    list_display = ['user', 'edition', 'acquired_at', 'has_premium_narration']
    list_filter = ['has_premium_narration']
    search_fields = ['user__username', 'edition__book__title']
    raw_id_fields = ['user', 'edition']


@admin.register(ReadingProgress)
class ReadingProgressAdmin(admin.ModelAdmin):
    list_display = ['inventory', 'completion_percentage', 'current_page', 'updated_at']
    search_fields = ['inventory__user__username']


@admin.register(UserBookmark)
class UserBookmarkAdmin(admin.ModelAdmin):
    list_display = ['inventory', 'position_cfi', 'color', 'created_at']
    search_fields = ['inventory__user__username']


@admin.register(UserFavorite)
class UserFavoriteAdmin(admin.ModelAdmin):
    list_display = ['user', 'book', 'created_at']
    search_fields = ['user__username', 'book__title']
    raw_id_fields = ['user', 'book']

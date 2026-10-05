from django.contrib import admin

from .models import Brindis, Friendship


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ['requester', 'addressee', 'status', 'created_at', 'responded_at']
    list_filter = ['status']
    search_fields = ['requester__username', 'addressee__username']


@admin.register(Brindis)
class BrindisAdmin(admin.ModelAdmin):
    list_display = ['giver', 'receiver', 'created_at']
    search_fields = ['giver__username', 'receiver__username']

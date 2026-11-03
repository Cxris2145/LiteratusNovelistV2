from django.contrib import admin
from .models import User, Profile

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['username', 'email', 'role', 'created_at']
    search_fields = ['username', 'email']

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'friend_code', 'country', 'preferred_language', 'infinite_ink']
    list_filter = ['infinite_ink']
    search_fields = ['user__username', 'friend_code']

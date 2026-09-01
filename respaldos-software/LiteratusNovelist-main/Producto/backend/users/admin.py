from django.contrib import admin
from .models import User, Profile

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ['username', 'email', 'role', 'created_at']
    search_fields = ['username', 'email']

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'country', 'preferred_language']

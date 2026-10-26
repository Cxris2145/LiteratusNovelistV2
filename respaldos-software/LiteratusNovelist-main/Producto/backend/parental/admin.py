from django.contrib import admin

from .models import ParentalLink


@admin.register(ParentalLink)
class ParentalLinkAdmin(admin.ModelAdmin):
    list_display = ['parent', 'child', 'origin', 'consent_at', 'created_at']
    list_filter = ['origin']
    search_fields = ['parent__username', 'child__username']

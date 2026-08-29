from django.contrib import admin
from .models import Transaction

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('buy_order', 'user', 'amount', 'status', 'item_type', 'item_reference', 'created_at')
    list_filter = ('status', 'item_type', 'created_at')
    search_fields = ('buy_order', 'token', 'user__username', 'item_reference')
    readonly_fields = ('buy_order', 'token', 'amount', 'metadata', 'user', 'session_id', 'item_type', 'item_reference')

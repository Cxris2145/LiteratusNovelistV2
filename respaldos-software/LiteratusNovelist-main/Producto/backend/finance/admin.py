from django.contrib import admin
from .models import Transaction, SubscriptionPlan, UserSubscription, PayPalWebhook

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('buy_order', 'user', 'amount', 'currency', 'provider', 'status', 'item_type', 'item_reference', 'created_at')
    list_filter = ('status', 'item_type', 'created_at')
    search_fields = ('buy_order', 'token', 'user__username', 'item_reference')
    readonly_fields = ('buy_order', 'token', 'amount', 'metadata', 'user', 'session_id', 'item_type', 'item_reference')


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'price', 'currency', 'daily_token_limit', 'daily_time_limit', 'monthly_ink_bonus', 'active')


@admin.register(UserSubscription)
class UserSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'plan', 'status', 'paid_until', 'cancel_at_period_end')
    readonly_fields = [field.name for field in UserSubscription._meta.fields]


@admin.register(PayPalWebhook)
class PayPalWebhookAdmin(admin.ModelAdmin):
    readonly_fields = ('event_id', 'event_type', 'processed_at')

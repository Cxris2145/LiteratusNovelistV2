from rest_framework import serializers
from .models import Transaction

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ['buy_order', 'amount', 'status', 'item_type', 'item_reference', 'created_at']
        read_only_fields = ['buy_order', 'status', 'created_at']

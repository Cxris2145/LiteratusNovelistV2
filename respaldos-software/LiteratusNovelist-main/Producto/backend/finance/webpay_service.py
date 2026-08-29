"""
finance/webpay_service.py — Abstracción del SDK Transbank Webpay Plus.
"""
from django.conf import settings
from transbank.webpay.webpay_plus.transaction import Transaction
from transbank.common.options import WebpayOptions
from transbank.common.integration_type import IntegrationType


def _get_webpay_transaction():
    """Instancia la conexión Webpay usando la configuración del settings."""
    environment = IntegrationType.LIVE
    if settings.WEBPAY_ENVIRONMENT == 'INTEGRACION':
        environment = IntegrationType.TEST

    options = WebpayOptions(
        commerce_code=settings.WEBPAY_COMMERCE_CODE,
        api_key=settings.WEBPAY_API_KEY,
        integration_type=environment,
    )
    return Transaction(options)


def create_transaction(buy_order: str, session_id: str, amount: int, return_url: str) -> dict:
    """
    Inicia una transacción Webpay Plus.
    Devuelve {'token': str, 'url': str} para construir el POST al formulario.
    """
    tx = _get_webpay_transaction()
    response = tx.create(
        buy_order=buy_order,
        session_id=session_id,
        amount=amount,
        return_url=return_url,
    )
    return {
        'token': response.get('token'),
        'url': response.get('url'),
    }


def confirm_transaction(token: str) -> dict:
    """
    Confirma una transacción Webpay Plus usando su token.
    Devuelve el dict completo de respuesta de Transbank.
    """
    tx = _get_webpay_transaction()
    response = tx.commit(token=token)
    return {
        'vci': response.get('vci'),
        'amount': response.get('amount'),
        'status': response.get('status'),
        'buy_order': response.get('buy_order'),
        'session_id': response.get('session_id'),
        'card_detail': response.get('card_detail'),
        'accounting_date': response.get('accounting_date'),
        'transaction_date': str(response.get('transaction_date')),
        'authorization_code': response.get('authorization_code'),
        'payment_type_code': response.get('payment_type_code'),
        'response_code': response.get('response_code'),
        'installments_number': response.get('installments_number'),
    }

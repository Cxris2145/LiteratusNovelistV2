"""PayPal Subscriptions REST adapter. Never log credentials or raw provider errors."""
import requests
from django.conf import settings


class PayPalError(Exception):
    pass


def configured():
    return all(getattr(settings, key, '') for key in (
        'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_MERCHANT_ID'))


def api(method, path, body=None, request_id=None):
    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise PayPalError('Los pagos PayPal aún no están configurados.')
    host = 'https://api-m.paypal.com' if settings.PAYPAL_ENVIRONMENT == 'live' else 'https://api-m.sandbox.paypal.com'
    try:
        token = requests.post(host + '/v1/oauth2/token',
            auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
            data={'grant_type': 'client_credentials'}, timeout=20)
        token.raise_for_status()
        headers = {'Authorization': 'Bearer ' + token.json()['access_token'], 'Content-Type': 'application/json'}
        if request_id:
            headers['PayPal-Request-Id'] = str(request_id)
        response = requests.request(method, host + path, json=body, headers=headers, timeout=20)
        response.raise_for_status()
        return response.json() if response.content else {}
    except (requests.RequestException, ValueError, KeyError) as exc:
        raise PayPalError('No fue posible confirmar la operación con PayPal. Intenta nuevamente.') from exc


def verify_webhook(headers, event):
    if not configured():
        return False
    fields = {name: headers.get(header, '') for name, header in (
        ('transmission_id', 'PAYPAL-TRANSMISSION-ID'), ('transmission_time', 'PAYPAL-TRANSMISSION-TIME'),
        ('cert_url', 'PAYPAL-CERT-URL'), ('auth_algo', 'PAYPAL-AUTH-ALGO'), ('transmission_sig', 'PAYPAL-TRANSMISSION-SIG'))}
    if not all(fields.values()):
        return False
    result = api('POST', '/v1/notifications/verify-webhook-signature',
        {**fields, 'webhook_id': settings.PAYPAL_WEBHOOK_ID, 'webhook_event': event})
    return result.get('verification_status') == 'SUCCESS'


def approval_url(data):
    return next((link['href'] for link in data.get('links', []) if link.get('rel') == 'approve'), None)

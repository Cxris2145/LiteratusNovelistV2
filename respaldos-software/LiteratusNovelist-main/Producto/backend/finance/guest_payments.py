from rest_framework.response import Response


def guest_no_payments_response():
    """Las cuentas de prueba se borran solas: no pueden pagar con dinero real (PayPal ni Webpay)."""
    return Response({'message': 'Las cuentas de prueba no pueden pagar. Crea una cuenta para comprar o suscribirte.',
                     'code': 'guest_no_payments'}, status=403)

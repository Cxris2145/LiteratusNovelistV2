from rest_framework.response import Response


def child_no_payments_response():
    """Una cuenta a cargo de un tutor (control parental) no paga con dinero real."""
    return Response({'message': 'Las compras de esta cuenta las hace tu padre, madre o tutor.',
                     'code': 'child_no_payments'}, status=403)


def guest_no_payments_response():
    """Las cuentas de prueba se borran solas: no pueden pagar con dinero real (PayPal ni Webpay)."""
    return Response({'message': 'Las cuentas de prueba no pueden pagar. Crea una cuenta para comprar o suscribirte.',
                     'code': 'guest_no_payments'}, status=403)

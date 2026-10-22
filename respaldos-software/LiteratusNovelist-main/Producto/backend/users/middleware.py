from django.conf import settings

from .guests import maybe_sweep_in_background


class GuestSweepMiddleware:
    """
    Borra las cuentas de prueba vencidas sin necesitar un cron: cualquier petición lanza el
    barrido en un hilo aparte, como mucho una vez por minuto (ver users/guests.py).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, 'GUEST_SWEEP_IN_BACKGROUND', True):
            maybe_sweep_in_background()
        return self.get_response(request)

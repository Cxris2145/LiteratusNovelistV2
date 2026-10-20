"""Borrado definitivo de la cuenta, pedido por su dueño desde el perfil."""
import uuid

from django.db import models, transaction
from django.db.models import Q

# Estados de PayPal en los que la suscripción todavía puede cobrar.
BILLABLE_STATUSES = ('APPROVED', 'ACTIVE', 'SUSPENDED')


class SubscriptionCancelError(Exception):
    """PayPal no confirmó la cancelación: la cuenta no se borra para no dejar un cobro huérfano."""


def cancel_paid_subscription(user):
    from finance import paypal
    from finance.models import UserSubscription

    sub = UserSubscription.objects.filter(user=user).first()
    if (sub is None or not sub.provider_subscription_id or sub.cancel_at_period_end
            or sub.status not in BILLABLE_STATUSES):
        return
    try:
        paypal.api('POST', '/v1/billing/subscriptions/' + sub.provider_subscription_id + '/cancel',
                   {'reason': 'Cuenta eliminada por el usuario'}, uuid.uuid4())
    except paypal.PayPalError as exc:
        raise SubscriptionCancelError(str(exc)) from exc
    UserSubscription.objects.filter(pk=sub.pk).update(status='CANCELLED', cancel_at_period_end=True)


def delete_account(user):
    """
    Cancela el plan de pago y borra la cuenta con todo lo que cuelga de ella
    (perfil, biblioteca, progreso, notas, chats, amistades y mensajes).
    Los libros que el usuario envió y sus reportes de errores quedan sin dueño.
    """
    from ai_engine.models import AIUsageEvent
    from finance.models import PayPalSubscriptionBinding

    cancel_paid_subscription(user)
    with transaction.atomic():
        # Estas dos tablas usan PROTECT y frenarían el borrado en cascada.
        AIUsageEvent.objects.filter(Q(user=user) | Q(usage__user=user) | Q(session__user=user)).delete()
        PayPalSubscriptionBinding.objects.filter(subscription__user=user).delete()
        # User hereda el borrado lógico de TimeStampedModel; aquí se borra de verdad
        # para no guardar datos de quien se fue y liberar su correo y su nombre.
        models.Model.delete(user)

"""
finance/views.py — Endpoints de Pago con Webpay Plus.
"""
import uuid
from decimal import Decimal

from django.conf import settings
from django.db import transaction as db_transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from catalog.models import Book, Edition
from library.models import UserInventory
from users.models import Profile
from .models import Transaction
from . import webpay_service


# ---------------------------------------------------------------------------
# PRECIOS FIJOS DE TINTA (protegido del lado del servidor)
# ---------------------------------------------------------------------------
INK_PACKAGES = {
    '200':  Decimal('990'),
    '500':  Decimal('1990'),
    '1200': Decimal('3990'),
}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def initiate_payment(request):
    """
    POST /api/v1/finance/pay/
    Body: { "item_type": "book" | "ink", "item_reference": "<book_slug> | <ink_amount>" }

    Crea una transacción en estado INICIADA y devuelve la URL y token de Webpay
    para que el frontend construya el formulario de redirección.
    """
    item_type = request.data.get('item_type')
    item_reference = request.data.get('item_reference')

    if item_type not in ('book', 'ink'):
        return Response({'error': 'item_type inválido. Debe ser "book" o "ink".'}, status=400)

    # --- Resolver el monto según el tipo de ítem ---
    if item_type == 'book':
        try:
            book = Book.objects.prefetch_related('editions').get(slug=item_reference)
        except Book.DoesNotExist:
            return Response({'error': 'Libro no encontrado.'}, status=404)
        
        edition = book.editions.first()
        if not edition:
            return Response({'error': 'Este libro no tiene edición disponible.'}, status=400)
        
        # Verificar si ya lo posee
        if UserInventory.objects.filter(user=request.user, edition=edition).exists():
            return Response({'error': 'Ya posees este libro.'}, status=400)

        amount = edition.price

    elif item_type == 'ink':
        if item_reference not in INK_PACKAGES:
            return Response({
                'error': f'Paquete de tinta inválido. Opciones: {list(INK_PACKAGES.keys())}'
            }, status=400)
        amount = INK_PACKAGES[item_reference]

    # --- Generar IDs únicos ---
    buy_order = f"LN-{uuid.uuid4().hex[:12].upper()}"
    session_id = f"SES-{request.user.pk}-{uuid.uuid4().hex[:8]}"
    return_url = settings.WEBPAY_RETURN_URL
    final_amount = int(round(float(amount)))

    # --- Lógica de COMPRA GRATUITA ---
    if final_amount == 0:
        # 1. Crear transacción "exitosa" localmente
        txn = Transaction.objects.create(
            user=request.user,
            buy_order=buy_order,
            session_id=session_id,
            token=f"FREE-{uuid.uuid4().hex[:8]}", # token dummy único
            amount=0,
            status='exitosa',
            item_type=item_type,
            item_reference=item_reference,
            response_code='0',
            metadata={'note': 'Free purchase'}
        )
        # 2. Entregar ítem
        _deliver_item(txn)
        # 3. Retornar éxito inmediato
        return Response({
            'status': 'FREE_PURCHASE_SUCCESS',
            'buy_order': buy_order
        }, status=200)

    # --- Iniciar transacción en Webpay ---
    try:
        webpay_result = webpay_service.create_transaction(
            buy_order=buy_order,
            session_id=session_id,
            amount=final_amount,
            return_url=return_url,
        )
    except Exception as e:
        return Response({'error': f'Error al contactar Transbank: {str(e)}'}, status=502)

    return_base_url = request.data.get('return_base_url')

    # --- Guardar transacción en DB ---
    Transaction.objects.create(
        user=request.user,
        buy_order=buy_order,
        session_id=session_id,
        token=webpay_result['token'],
        amount=final_amount,
        status='iniciada',
        item_type=item_type,
        item_reference=item_reference,
        metadata={'return_base_url': return_base_url} if return_base_url else {}
    )

    return Response({
        'token': webpay_result['token'],
        'url': webpay_result['url'],
    }, status=200)


@api_view(['GET', 'POST'])
@db_transaction.atomic
def confirm_payment(request):
    """
    GET/POST /api/v1/finance/confirm/
    Transbank llama a este endpoint con ?token_ws=<token>.
    Confirma el pago y ejecuta la entrega del ítem de forma ATÓMICA.
    Luego redirige al frontend.
    """
    token = request.GET.get('token_ws') or request.POST.get('token_ws')

    if not token:
        return _redirect_to_frontend(settings.FRONTEND_URL, 'failure', 'Token no recibido.')

    # Buscar la transacción local de forma bloqueante
    try:
        local_txn = Transaction.objects.select_for_update().get(token=token)
    except Transaction.DoesNotExist:
        return _redirect_to_frontend(settings.FRONTEND_URL, 'failure', 'Transacción no encontrada.')

    frontend_url = settings.FRONTEND_URL
    if isinstance(local_txn.metadata, dict) and local_txn.metadata.get('return_base_url'):
        frontend_url = local_txn.metadata.get('return_base_url')

    # Confirmar con Transbank
    try:
        wb_response = webpay_service.confirm_transaction(token)
    except Exception as e:
        local_txn.status = 'fallida'
        local_txn.metadata = {'error': str(e)}
        local_txn.save()
        return _redirect_to_frontend(frontend_url, 'failure', str(e))

    response_code = wb_response.get('response_code')
    local_txn.response_code = str(response_code)
    local_txn.metadata = wb_response

    # response_code == 0 significa ÉXITO en Transbank
    if response_code == 0:
        try:
            _deliver_item(local_txn)
            local_txn.status = 'exitosa'
            local_txn.save()
        except Exception as e:
            local_txn.status = 'fallida'
            local_txn.save()
            return _redirect_to_frontend(frontend_url, 'failure', f'Error en entrega: {str(e)}')

        return _redirect_to_frontend(frontend_url, 'success', buy_order=local_txn.buy_order)
    else:
        local_txn.status = 'fallida'
        local_txn.save()
        return _redirect_to_frontend(frontend_url, 'failure', f'Pago rechazado (code: {response_code})')


def _deliver_item(local_txn: Transaction):
    """Entrega atómica del ítem comprado."""
    if local_txn.item_type == 'book':
        book = Book.objects.get(slug=local_txn.item_reference)
        edition = book.editions.first()
        UserInventory.objects.get_or_create(
            user=local_txn.user,
            edition=edition,
        )
    elif local_txn.item_type == 'ink':
        ink_amount = int(local_txn.item_reference)
        profile = Profile.objects.select_for_update().get(user=local_txn.user)
        profile.ink_balance += ink_amount
        profile.save()


def _redirect_to_frontend(base_url: str, result: str, message: str = '', buy_order: str = ''):
    """Redirige al frontend con el resultado del pago."""
    from django.shortcuts import redirect
    if result == 'success':
        return redirect(f"{base_url}/payment/success?buy_order={buy_order}")
    else:
        import urllib.parse
        msg_encoded = urllib.parse.quote(message)
        return redirect(f"{base_url}/payment/failure?reason={msg_encoded}")

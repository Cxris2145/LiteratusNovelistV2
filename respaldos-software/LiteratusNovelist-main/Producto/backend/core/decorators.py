from functools import wraps
from rest_framework.response import Response
from rest_framework import status
from users.models import Profile

def consume_ink(cost=1):
    """
    Decorador para views de DRF (métodos de clase o funciones).
    Verifica que el usuario tenga suficiente tinta, la descuenta si la vista 
    se ejecuta con éxito (devuelve status 2xx), y si no, devuelve 402.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(view_instance, request, *args, **kwargs):
            user = request.user
            if not user.is_authenticated:
                return Response({"error": "No autenticado."}, status=status.HTTP_401_UNAUTHORIZED)
            
            profile, _ = Profile.objects.get_or_create(user=user)
            if profile.ink_balance < cost:
                return Response(
                    {
                        "error": "INSUFFICIENT_INK",
                        "ink_balance": profile.ink_balance,
                        "message": f"Te has quedado sin tinta. Necesitas {cost} para esta acción."
                    },
                    status=status.HTTP_402_PAYMENT_REQUIRED
                )
            
            # Ejecutar la vista
            response = view_func(view_instance, request, *args, **kwargs)
            
            # Si la vista fue exitosa (200-299), descontar la tinta
            if 200 <= response.status_code < 300:
                # Recargar el perfil por si la vista lo modificó
                profile.refresh_from_db()
                profile.ink_balance = max(0, profile.ink_balance - cost)
                profile.save(update_fields=['ink_balance'])
                
                # Inyectar el saldo actualizado en la respuesta si es JSON
                if hasattr(response, 'data') and isinstance(response.data, dict):
                    response.data['ink_balance'] = profile.ink_balance
                    
            return response
        return _wrapped_view
    return decorator

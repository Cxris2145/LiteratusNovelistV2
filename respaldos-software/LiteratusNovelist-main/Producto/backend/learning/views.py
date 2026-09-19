"""
learning/views.py — Vistas y Endpoints REST para la Senda de Aprendizaje, Comprensión Lectora y Bazar.
"""

from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Avg, Sum, Count

from .models import (
    LearningUnit,
    LearningLevel,
    LearningExercise,
    UserLevelProgress,
    UserExerciseAttempt,
    ShopItem
)
from .serializers import (
    LearningUnitListSerializer,
    ExerciseSessionSerializer,
    ExerciseSubmitSerializer,
    ShopItemSerializer
)
from .services import (
    calculate_and_sync_hearts,
    refill_hearts,
    ensure_streak,
    get_streak_details,
    evaluate_and_record_attempt,
    purchase_shop_item,
    equip_cosmetic_item
)
from .ai_generator import ReadingComprehensionAIGenerator


class LearningPathView(APIView):
    """
    GET /api/v1/learning/path/
    Devuelve la ruta completa de unidades, niveles y el estado de progreso del usuario,
    junto con la barra de gamificación (vidas, racha, tinta).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = request.user.profile
        calculate_and_sync_hearts(profile)
        streak_info = get_streak_details(request.user)

        units = LearningUnit.objects.prefetch_related('levels').order_by('order')
        serializer = LearningUnitListSerializer(units, many=True, context={'request': request})

        return Response({
            'user_status': {
                'hearts': profile.hearts,
                'max_hearts': 5,
                'streak_current': profile.streak_current,
                'streak_max': profile.streak_max,
                'streak_shields': profile.streak_shields,
                'is_secured_today': streak_info['is_secured_today'],
                'is_in_danger': streak_info['is_in_danger'],
                'ink_balance': profile.ink_balance,
                'xp': profile.xp,
                'level': profile.level,
                'equipped_frame': profile.equipped_frame,
                'equipped_title': profile.equipped_title,
            },
            'units': serializer.data
        })


class LevelSessionView(APIView):
    """
    GET /api/v1/learning/levels/{pk}/session/
    Retorna el texto y preguntas del nivel (sin revelar respuestas correctas).
    Si el nivel no tiene ejercicio creado aún, lo genera automáticamente con la IA.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        level = get_object_or_404(LearningLevel.objects.select_related('unit'), pk=pk)
        profile = request.user.profile
        calculate_and_sync_hearts(profile)

        if profile.hearts <= 0:
            return Response({
                'error': 'NO_HEARTS',
                'message': 'No tienes corazones disponibles. Espera su recarga o adquiere una en El Bazar.',
                'hearts': 0
            }, status=status.HTTP_403_FORBIDDEN)

        # Buscar o generar ejercicio
        exercise = getattr(level, 'exercise', None)
        if not exercise or not exercise.questions_data:
            generator = ReadingComprehensionAIGenerator()
            unit_focus_map = {
                1: 'comprension_basica',
                2: 'vocabulario',
                3: 'personajes_y_relaciones',
                4: 'secuencia_narrativa',
                5: 'inferencia_y_subtexto',
                6: 'analisis_literario'
            }
            focus = unit_focus_map.get(level.unit.unit_number, 'comprension_general')
            generated = generator.generate_exercise(difficulty=level.difficulty, unit_focus=focus)

            exercise, _ = LearningExercise.objects.update_or_create(
                level=level,
                defaults={
                    'title': generated.get('title', level.title),
                    'author_name': generated.get('author_name', ''),
                    'source_type': generated.get('source_type', 'classic_book'),
                    'content_pages': generated.get('pages', []),
                    'questions_data': generated.get('questions', [])
                }
            )

        data = {
            'level_id': str(level.id),
            'level_title': level.title,
            'unit_title': level.unit.title,
            'unit_number': level.unit.unit_number,
            'difficulty': level.difficulty,
            'required_score': level.required_score,
            'book_title': exercise.book.title if exercise.book else exercise.title,
            'author_name': exercise.author_name,
            'source_type': exercise.source_type,
            'pages': exercise.content_pages,
            'questions_data': exercise.questions_data,
        }

        serializer = ExerciseSessionSerializer(data)
        return Response(serializer.data)


class LevelSubmitView(APIView):
    """
    POST /api/v1/learning/levels/{pk}/submit/
    Recibe las respuestas del usuario, evalúa aciertos, descuenta vidas si falla,
    otorga XP/Tinta si aprueba y registra racha.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        level = get_object_or_404(LearningLevel, pk=pk)
        serializer = ExerciseSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        answers = serializer.validated_data['answers']
        duration = serializer.validated_data.get('duration_seconds', 0)

        result = evaluate_and_record_attempt(
            user=request.user,
            level_id=str(level.id),
            answers_payload=answers,
            duration_seconds=duration
        )

        if result.get('error') == 'NO_HEARTS':
            return Response(result, status=status.HTTP_403_FORBIDDEN)

        return Response(result, status=status.HTTP_200_OK)


class StreakStatusView(APIView):
    """
    GET /api/v1/learning/streak/
    Estado detallado de racha, récord histórico, escudos y calendario de 30 días.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        details = get_streak_details(request.user)
        return Response(details)


class StreakRepairView(APIView):
    """
    POST /api/v1/learning/streak/repair/
    Restaura una racha rota consumiendo 60 de Tinta.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        profile = request.user.profile
        if profile.ink_balance < 60:
            return Response({
                'success': False,
                'error': 'INSUFFICIENT_INK',
                'message': 'Necesitas al menos 60 de Tinta para restaurar tu racha.'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Si racha actual <= 1 y tenía un récord mayor, restaurar
        if profile.streak_max > 1:
            profile.ink_balance -= 60
            profile.streak_current = profile.streak_max
            profile.save(update_fields=['ink_balance', 'streak_current'])
            return Response({
                'success': True,
                'streak_current': profile.streak_current,
                'ink_balance': profile.ink_balance,
                'message': f'¡Tu racha de {profile.streak_current} días ha sido restaurada!'
            })

        return Response({
            'success': False,
            'message': 'No hay racha previa que restaurar.'
        }, status=status.HTTP_400_BAD_REQUEST)


class HeartsStatusView(APIView):
    """
    GET /api/v1/learning/hearts/
    Estado actual de corazones y tiempo en segundos para el siguiente corazón.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = request.user.profile
        current = calculate_and_sync_hearts(profile)
        elapsed = (profile.hearts_last_updated).timestamp()
        
        from django.utils import timezone
        sec_elapsed = (timezone.now() - profile.hearts_last_updated).total_seconds()
        sec_to_next = int(max(0, 1800 - (sec_elapsed % 1800))) if current < 5 else 0

        return Response({
            'hearts': current,
            'max_hearts': 5,
            'seconds_to_next_heart': sec_to_next,
            'can_refill': current < 5,
            'refill_cost_ink': 25
        })


class HeartsRefillView(APIView):
    """
    POST /api/v1/learning/hearts/refill/
    Restaura los corazones al máximo (5) consumiendo 25 de Tinta.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        profile = request.user.profile
        current = calculate_and_sync_hearts(profile)
        if current >= 5:
            return Response({'success': False, 'message': 'Ya tienes tus 5 corazones llenos.'})

        if profile.ink_balance < 25:
            return Response({
                'success': False,
                'error': 'INSUFFICIENT_INK',
                'message': 'Necesitas 25 de Tinta para recargar tus corazones.'
            }, status=status.HTTP_400_BAD_REQUEST)

        profile.ink_balance -= 25
        profile.hearts = 5
        from django.utils import timezone
        profile.hearts_last_updated = timezone.now()
        profile.save(update_fields=['ink_balance', 'hearts', 'hearts_last_updated'])

        return Response({
            'success': True,
            'hearts': 5,
            'ink_balance': profile.ink_balance,
            'message': '¡Tus corazones han sido restaurados al máximo!'
        })


class ShopListView(APIView):
    """
    GET /api/v1/learning/shop/
    Catálogo de consumibles y cosméticos de El Bazar.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        items = ShopItem.objects.filter(is_active=True).order_by('sort_order', 'cost_ink')
        serializer = ShopItemSerializer(items, many=True, context={'request': request})
        return Response(serializer.data)


class ShopBuyView(APIView):
    """
    POST /api/v1/learning/shop/buy/
    Compra un artículo con Tinta.
    Body: { "item_code": "streak_shield" }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        item_code = request.data.get('item_code')
        if not item_code:
            return Response({'error': 'Falta el parámetro item_code'}, status=status.HTTP_400_BAD_REQUEST)

        result = purchase_shop_item(request.user, item_code)
        if not result.get('success'):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)


class ShopEquipView(APIView):
    """
    POST /api/v1/learning/shop/equip/
    Equipa un artículo cosmético adquirido.
    Body: { "item_code": "frame_gold" }
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        item_code = request.data.get('item_code')
        if not item_code:
            return Response({'error': 'Falta el parámetro item_code'}, status=status.HTTP_400_BAD_REQUEST)

        result = equip_cosmetic_item(request.user, item_code)
        if not result.get('success'):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)


class LearningStatsView(APIView):
    """
    GET /api/v1/learning/stats/
    Estadísticas acumuladas de comprensión lectora para el perfil del usuario.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        attempts = UserExerciseAttempt.objects.filter(user=user)
        total_attempts = attempts.count()
        total_passed = attempts.filter(passed=True).count()
        avg_score = attempts.aggregate(avg=Avg('score'))['avg'] or 0
        total_time = attempts.aggregate(time=Sum('duration_seconds'))['time'] or 0

        completed_levels = UserLevelProgress.objects.filter(user=user, is_completed=True)
        total_completed = completed_levels.count()
        total_stars = completed_levels.aggregate(stars=Sum('stars'))['stars'] or 0

        return Response({
            'total_completed_levels': total_completed,
            'total_stars': total_stars,
            'total_attempts': total_attempts,
            'total_passed': total_passed,
            'accuracy_percentage': round(avg_score, 1),
            'total_learning_time_minutes': round(total_time / 60, 1),
            'streak_current': user.profile.streak_current,
            'streak_max': user.profile.streak_max,
        })

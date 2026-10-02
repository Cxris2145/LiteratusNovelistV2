"""
learning/serializers.py — Serializadores para la Senda de Aprendizaje, Preguntas y Bazar.
"""

from rest_framework import serializers
from .models import (
    LearningUnit,
    LearningLevel,
    LearningExercise,
    UserLevelProgress,
    DailyActivityLog,
    ShopItem,
    UserInventoryItem
)
from . import games


class LearningLevelListSerializer(serializers.ModelSerializer):
    stars = serializers.IntegerField(default=0)
    best_score = serializers.IntegerField(default=0)
    is_completed = serializers.BooleanField(default=False)
    is_unlocked = serializers.BooleanField(default=False)
    activities = serializers.SerializerMethodField()

    class Meta:
        model = LearningLevel
        fields = [
            'id', 'level_number', 'order', 'title', 'description',
            'difficulty', 'required_score', 'xp_reward', 'ink_reward',
            'is_exam', 'is_chest', 'icon', 'stars', 'best_score',
            'is_completed', 'is_unlocked', 'activities'
        ]

    def get_activities(self, obj):
        """Qué trae el nivel (Lectura, Une las parejas, Anagrama...), para el mapa."""
        try:
            exercise = obj.exercise
        except LearningExercise.DoesNotExist:
            return []
        kinds = games.activity_kinds(exercise.questions_data)
        if exercise.content_pages:
            kinds.insert(0, 'reading')
        return [{'kind': kind, 'label': games.ACTIVITY_LABELS.get(kind, kind)} for kind in kinds]


class LearningUnitListSerializer(serializers.ModelSerializer):
    """
    Contexto opcional (lo arma LearningPathView para no consultar por unidad):
    - progress_map: {level_id: UserLevelProgress} del usuario.
    - open_unit_ids: unidades cuyo primer nivel ya se puede jugar.
    """
    levels = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()

    class Meta:
        model = LearningUnit
        fields = [
            'id', 'unit_number', 'slug', 'title', 'description',
            'order', 'icon', 'banner_color', 'min_user_level',
            'progress_percentage', 'is_locked', 'levels'
        ]

    def _progress_map(self, obj) -> dict:
        if 'progress_map' in self.context:
            return self.context['progress_map']
        user = self.context.get('request').user if 'request' in self.context else None
        if user and user.is_authenticated:
            return {p.level_id: p for p in UserLevelProgress.objects.filter(user=user, level__unit=obj)}
        return {}

    def get_is_locked(self, obj):
        open_units = self.context.get('open_unit_ids')
        return open_units is not None and obj.id not in open_units

    def get_levels(self, obj):
        user_progress_map = self._progress_map(obj)
        levels_qs = obj.levels.all()

        data = []
        is_previous_completed = not self.get_is_locked(obj)

        for lvl in levels_qs:
            prog = user_progress_map.get(lvl.id)
            is_comp = prog.is_completed if prog else False
            stars = prog.stars if prog else 0
            best_score = prog.best_score if prog else 0
            unlocked = is_previous_completed or is_comp

            activities = []
            try:
                exercise = getattr(lvl, 'exercise', None)
                if exercise and exercise.questions_data:
                    kinds = games.activity_kinds(exercise.questions_data)
                    if exercise.content_pages:
                        kinds.insert(0, 'reading')
                    activities = [{'kind': k, 'label': games.ACTIVITY_LABELS.get(k, k)} for k in kinds]
            except Exception:
                activities = []

            data.append({
                'id': str(lvl.id),
                'level_number': lvl.level_number,
                'order': lvl.order,
                'title': lvl.title,
                'description': lvl.description,
                'difficulty': lvl.difficulty,
                'required_score': lvl.required_score,
                'xp_reward': lvl.xp_reward,
                'ink_reward': lvl.ink_reward,
                'is_exam': lvl.is_exam,
                'is_chest': lvl.is_chest,
                'icon': lvl.icon,
                'stars': stars,
                'best_score': best_score,
                'is_completed': is_comp,
                'is_unlocked': unlocked,
                'activities': activities
            })

            is_previous_completed = is_comp

        return data

    def get_progress_percentage(self, obj):
        user = self.context.get('request').user if 'request' in self.context else None
        if not user or not user.is_authenticated:
            return 0
        levels = list(obj.levels.all())
        if not levels:
            return 0
        progress = self._progress_map(obj)
        completed = sum(1 for lvl in levels if progress.get(lvl.id) and progress[lvl.id].is_completed)
        return min(100, int((completed / len(levels)) * 100))


class ExerciseSessionSerializer(serializers.Serializer):
    """
    Serializa el ejercicio para ser jugado.
    CRÍTICO: Excluye el campo 'is_correct' de las opciones para evitar trampas desde la consola de red.
    """
    level_id = serializers.UUIDField()
    level_title = serializers.CharField()
    unit_title = serializers.CharField()
    unit_number = serializers.IntegerField()
    difficulty = serializers.CharField()
    required_score = serializers.IntegerField()
    book_title = serializers.CharField(allow_blank=True)
    author_name = serializers.CharField(allow_blank=True)
    source_type = serializers.CharField()
    pages = serializers.ListField(child=serializers.CharField(), allow_empty=True)
    questions = serializers.SerializerMethodField()
    # Solo en la prueba de salto: números de las unidades que se saltan.
    skipped_units = serializers.ListField(child=serializers.IntegerField(), required=False)

    def get_questions(self, obj):
        # games.public_question quita respuestas, soluciones y el orden correcto de cada tipo.
        return [games.public_question(q) for q in obj.get('questions_data', []) if games.validate(q)]


class ExerciseSubmitSerializer(serializers.Serializer):
    answers = serializers.DictField(help_text="Mapa de question_id a la respuesta de cada actividad.")
    duration_seconds = serializers.IntegerField(default=0)


class ExerciseCheckSerializer(serializers.Serializer):
    question_id = serializers.CharField()
    # Cada juego responde con su propia forma: id, texto, lista, índice o mapa.
    answer = serializers.JSONField(allow_null=True)


class DailyActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyActivityLog
        fields = ['date', 'chapters_read', 'levels_completed', 'xp_earned', 'ink_earned']


class ShopItemSerializer(serializers.ModelSerializer):
    is_owned = serializers.SerializerMethodField()
    is_equipped = serializers.SerializerMethodField()
    quantity = serializers.SerializerMethodField()

    class Meta:
        model = ShopItem
        fields = [
            'id', 'code', 'name', 'description', 'item_type',
            'cost_ink', 'icon', 'asset_url', 'value', 'sort_order',
            'is_owned', 'is_equipped', 'quantity'
        ]

    def get_is_owned(self, obj):
        user = self.context.get('request').user if 'request' in self.context else None
        if not user or not user.is_authenticated:
            return False
        return UserInventoryItem.objects.filter(user=user, item=obj, quantity__gt=0).exists()

    def get_is_equipped(self, obj):
        user = self.context.get('request').user if 'request' in self.context else None
        if not user or not user.is_authenticated:
            return False
        inv = UserInventoryItem.objects.filter(user=user, item=obj).first()
        return inv.is_equipped if inv else False

    def get_quantity(self, obj):
        user = self.context.get('request').user if 'request' in self.context else None
        if not user or not user.is_authenticated:
            return 0
        inv = UserInventoryItem.objects.filter(user=user, item=obj).first()
        return inv.quantity if inv else 0

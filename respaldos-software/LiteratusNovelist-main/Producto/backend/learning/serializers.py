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


class LearningLevelListSerializer(serializers.ModelSerializer):
    stars = serializers.IntegerField(default=0)
    best_score = serializers.IntegerField(default=0)
    is_completed = serializers.BooleanField(default=False)
    is_unlocked = serializers.BooleanField(default=False)

    class Meta:
        model = LearningLevel
        fields = [
            'id', 'level_number', 'order', 'title', 'description',
            'difficulty', 'required_score', 'xp_reward', 'ink_reward',
            'is_exam', 'is_chest', 'icon', 'stars', 'best_score',
            'is_completed', 'is_unlocked'
        ]


class LearningUnitListSerializer(serializers.ModelSerializer):
    levels = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()

    class Meta:
        model = LearningUnit
        fields = [
            'id', 'unit_number', 'slug', 'title', 'description',
            'order', 'icon', 'banner_color', 'min_user_level',
            'progress_percentage', 'levels'
        ]

    def get_levels(self, obj):
        user = self.context.get('request').user if 'request' in self.context else None
        levels_qs = obj.levels.all().order_by('order')
        
        user_progress_map = {}
        if user and user.is_authenticated:
            progs = UserLevelProgress.objects.filter(user=user, level__unit=obj)
            user_progress_map = {p.level_id: p for p in progs}

        # Determinar desbloqueos de forma secuencial
        data = []
        is_previous_completed = True # El primer nivel siempre arranca desbloqueado (si cumple nivel)

        for lvl in levels_qs:
            prog = user_progress_map.get(lvl.id)
            is_comp = prog.is_completed if prog else False
            stars = prog.stars if prog else 0
            best_score = prog.best_score if prog else 0
            
            # Desbloqueado si el anterior fue completado o si ya se completó este
            unlocked = is_previous_completed or is_comp

            serialized_lvl = LearningLevelListSerializer(lvl).data
            serialized_lvl['stars'] = stars
            serialized_lvl['best_score'] = best_score
            serialized_lvl['is_completed'] = is_comp
            serialized_lvl['is_unlocked'] = unlocked
            data.append(serialized_lvl)

            # Para el siguiente nivel, actualizamos la condición
            is_previous_completed = is_comp

        return data

    def get_progress_percentage(self, obj):
        user = self.context.get('request').user if 'request' in self.context else None
        if not user or not user.is_authenticated:
            return 0
        total = obj.levels.count()
        if total == 0:
            return 0
        completed = UserLevelProgress.objects.filter(user=user, level__unit=obj, is_completed=True).count()
        return min(100, int((completed / total) * 100))


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
    pages = serializers.ListField(child=serializers.CharField())
    questions = serializers.SerializerMethodField()

    def get_questions(self, obj):
        safe_questions = []
        for q in obj.get('questions_data', []):
            safe_q = {
                'id': q.get('id'),
                'type': q.get('type'),
                'prompt': q.get('prompt'),
                'target_word': q.get('target_word', ''),
            }
            if 'options' in q:
                # Omitir is_correct
                safe_q['options'] = [
                    {'id': opt.get('id'), 'text': opt.get('text')}
                    for opt in q.get('options', [])
                ]
            if 'order_items' in q:
                # Mezclar o listar items para ordenar
                import random
                items = list(q.get('order_items', []))
                # Barajamos para que no venga resuelto
                random.shuffle(items)
                safe_q['order_items'] = items

            safe_questions.append(safe_q)
        return safe_questions


class ExerciseSubmitSerializer(serializers.Serializer):
    answers = serializers.DictField(help_text="Mapa de question_id a opción seleccionada o lista ordenada.")
    duration_seconds = serializers.IntegerField(default=0)


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

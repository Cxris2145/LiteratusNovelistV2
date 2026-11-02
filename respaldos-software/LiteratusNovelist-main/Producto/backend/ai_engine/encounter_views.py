"""
Encuentro de personajes: el lector junta a dos personajes (del mismo libro o de libros distintos).

POST  /api/v1/ai/encounters/       {avatar_ids: [a, b], topic?, fresh?} → crea o retoma el encuentro
GET   /api/v1/ai/encounters/<id>/  → personajes, tema y últimos mensajes
PATCH /api/v1/ai/encounters/<id>/  {topic}

Cada turno se envía a POST /api/v1/ai/chat/ con `speaker_id` (usage_views.MeteredChatView), así
que se cobra igual que el chat de un personaje.
"""
import unicodedata
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from catalog.age import ensure_book_access
from .models import AIAvatar, ChatSession
from . import usage

MESSAGES_LIMIT = 60
ENCOUNTER = ChatSession.Kind.ENCOUNTER


class EncounterInput(serializers.Serializer):
    avatar_ids = serializers.ListField(child=serializers.UUIDField(), min_length=2, max_length=2)
    topic = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    fresh = serializers.BooleanField(required=False, default=False)


class TopicInput(serializers.Serializer):
    topic = serializers.CharField(max_length=200, allow_blank=True)


def folded(name):
    text = unicodedata.normalize('NFKD', name or '')
    return ''.join(c for c in text if not unicodedata.combining(c)).casefold().strip()


def participant(avatar, request):
    book = avatar.edition.book
    return {'id': str(avatar.pk), 'name': avatar.name, 'book_title': book.title, 'book_slug': book.slug,
            'avatar_image_url': request.build_absolute_uri(avatar.avatar_image.url) if avatar.avatar_image else None,
            'is_author': avatar.is_author}


def encounter_payload(session, request):
    recent = session.messages.exclude(role='system').order_by('-created_at')[:MESSAGES_LIMIT]
    return {
        'id': str(session.pk), 'title': session.title, 'topic': session.topic,
        'participants': [participant(session.avatar, request), participant(session.partner, request)],
        'messages': [{'id': str(m.pk), 'role': m.role, 'speaker_id': str(m.speaker_id) if m.speaker_id else None,
                      'content': m.content, 'created_at': m.created_at.isoformat()} for m in reversed(list(recent))],
        'created_at': session.created_at.isoformat(),
    }


def check_participant(user, avatar):
    """Las reglas del chat de un personaje; si falta el libro, el mensaje dice cuál."""
    try:
        usage.check_avatar(user, avatar)
    except PermissionDenied as exc:
        if isinstance(exc.detail, dict):  # restricción de edad: ya trae su propio mensaje
            raise
        book = avatar.edition.book
        raise PermissionDenied({'error': 'BOOK_REQUIRED', 'book_slug': book.slug, 'avatar_id': str(avatar.pk),
            'message': f'Añade «{book.title}» a tu biblioteca para conversar con {avatar.name}.'})


def owned_encounter(request, pk):
    session = get_object_or_404(ChatSession.objects.select_related('avatar__edition__book', 'partner__edition__book'),
        pk=pk, user=request.user, kind=ENCOUNTER, partner__isnull=False)
    ensure_book_access(request.user, session.avatar.edition.book)
    ensure_book_access(request.user, session.partner.edition.book)
    return session


class EncounterListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = EncounterInput(data=request.data)
        data.is_valid(raise_exception=True)
        first_id, second_id = data.validated_data['avatar_ids']
        avatars = AIAvatar.objects.select_related('edition__book').in_bulk([first_id, second_id])
        if first_id == second_id or len(avatars) != 2:
            raise ValidationError({'error': 'INVALID_PAIR', 'message': 'Elige dos personajes distintos.'})
        first, second = avatars[first_id], avatars[second_id]
        if folded(first.name) == folded(second.name):
            raise ValidationError({'error': 'INVALID_PAIR', 'message': 'Elige dos personajes distintos.'})
        for avatar in (first, second):
            check_participant(request.user, avatar)

        topic = data.validated_data['topic'].strip()
        session = None
        if not data.validated_data['fresh']:
            session = (ChatSession.objects.filter(user=request.user, kind=ENCOUNTER)
                       .filter(Q(avatar=first, partner=second) | Q(avatar=second, partner=first))
                       .select_related('avatar__edition__book', 'partner__edition__book')
                       .order_by('-updated_at').first())
        created = session is None
        if created:
            session = ChatSession.objects.create(user=request.user, avatar=first, partner=second, kind=ENCOUNTER,
                topic=topic, title=f'{first.name} y {second.name}'[:255])
            AIAvatar.objects.filter(pk__in=[first.pk, second.pk]).update(chat_count=F('chat_count') + 1)
        elif topic and topic != session.topic:
            session.topic = topic
            session.save(update_fields=['topic', 'updated_at'])
        return Response(encounter_payload(session, request), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class EncounterDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        return Response(encounter_payload(owned_encounter(request, pk), request))

    def patch(self, request, pk):
        session = owned_encounter(request, pk)
        data = TopicInput(data=request.data)
        data.is_valid(raise_exception=True)
        session.topic = data.validated_data['topic'].strip()
        session.save(update_fields=['topic', 'updated_at'])
        return Response(encounter_payload(session, request))

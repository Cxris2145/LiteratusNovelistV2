"""
library/notebook.py — Cuaderno flotante: validación de lo que se guarda y resumen de un libro.

El contenido de una pestaña es el documento del editor (JSON de TipTap) y los trazos del dibujo.
Se validan tamaño y forma; los enlaces solo pueden ser http(s) o mailto, así un documento
manipulado no puede inyectar `javascript:` aunque el editor del navegador ya lo bloquee.
"""
import json
import re

from rest_framework import serializers

from catalog import narration
from catalog.models import Chapter

from .models import NotebookTab, UserHighlight, UserPostIt, UserVocabulary

MAX_DEPTH = 40
MAX_STROKES = 4000
MAX_POINTS_PER_STROKE = 5000
SAFE_LINK = re.compile(r'^(https?://|mailto:)', re.IGNORECASE)
HEX_COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
POST_IT_CONTEXT_WORDS = 12


def _json_size(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def _clean_node(node, depth=0):
    """Recorre el documento: corta anidamientos absurdos y quita enlaces que no sean seguros."""
    if depth > MAX_DEPTH:
        raise serializers.ValidationError('El documento tiene demasiados niveles anidados.')
    if not isinstance(node, dict) or not isinstance(node.get('type', ''), str):
        raise serializers.ValidationError('El documento del cuaderno no tiene un formato válido.')
    marks = node.get('marks')
    if marks is not None:
        if not isinstance(marks, list):
            raise serializers.ValidationError('El documento del cuaderno no tiene un formato válido.')
        node['marks'] = [mark for mark in marks if isinstance(mark, dict) and not (
            mark.get('type') == 'link'
            and not SAFE_LINK.match(str((mark.get('attrs') or {}).get('href') or '')))]
    children = node.get('content')
    if children is not None:
        if not isinstance(children, list):
            raise serializers.ValidationError('El documento del cuaderno no tiene un formato válido.')
        for child in children:
            _clean_node(child, depth + 1)
    return node


def clean_content(value):
    if value in (None, ''):
        return {}
    if not isinstance(value, dict) or (value and value.get('type') != 'doc'):
        raise serializers.ValidationError('El documento del cuaderno no tiene un formato válido.')
    if _json_size(value) > NotebookTab.MAX_CONTENT_CHARS:
        raise serializers.ValidationError('La pestaña es demasiado larga. Divide tus apuntes en otra pestaña.')
    return _clean_node(value) if value else {}


def _number(value, low, high):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and low <= value <= high


def clean_drawing(value):
    """Trazos: {c: color, w: grosor, o: opacidad, p: [[x, y, presión], ...]} en proporción al ancho."""
    if value in (None, ''):
        return []
    if not isinstance(value, list) or len(value) > MAX_STROKES:
        raise serializers.ValidationError('El dibujo no tiene un formato válido o tiene demasiados trazos.')
    for stroke in value:
        points = stroke.get('p') if isinstance(stroke, dict) else None
        if (not isinstance(points, list) or not 1 <= len(points) <= MAX_POINTS_PER_STROKE
                or not HEX_COLOR.match(str(stroke.get('c', '')))
                or not _number(stroke.get('w'), 0.0005, 0.2)
                or not _number(stroke.get('o', 1), 0.05, 1)):
            raise serializers.ValidationError('El dibujo no tiene un formato válido.')
        for point in points:
            if (not isinstance(point, list) or len(point) not in (2, 3)
                    or not _number(point[0], -0.05, 1.05) or not _number(point[1], -0.05, 1000)
                    or (len(point) == 3 and not _number(point[2], 0, 1))):
                raise serializers.ValidationError('El dibujo no tiene un formato válido.')
    if _json_size(value) > NotebookTab.MAX_DRAWING_CHARS:
        raise serializers.ValidationError('El dibujo es demasiado grande. Sigue en otra pestaña.')
    return value


def build_digest(inventory):
    """Subrayados, post-its (con el texto que los rodea) y palabras guardadas de un libro."""
    book = inventory.edition.book
    chapters = list(Chapter.objects.filter(book=book).order_by('order').only('id', 'title', 'order'))
    index = {chapter.pk: i for i, chapter in enumerate(chapters)}

    def place(chapter):
        position = index.get(chapter.pk, 0)
        return {'chapter_id': str(chapter.pk), 'chapter_index': position,
                'chapter_title': chapter.title or f'Capítulo {position + 1}'}

    highlights = sorted(
        UserHighlight.objects.filter(inventory=inventory, chapter__in=chapters).select_related('chapter'),
        key=lambda h: (index.get(h.chapter_id, 0), h.start_word))
    post_its = sorted(
        UserPostIt.objects.filter(inventory=inventory, chapter__in=chapters).select_related('chapter'),
        key=lambda p: (index.get(p.chapter_id, 0), p.word))

    words_by_chapter = {}

    def context(post_it):
        if post_it.chapter_id not in words_by_chapter:
            words_by_chapter[post_it.chapter_id] = narration.chapter_words(post_it.chapter.content_html)[0]
        words = words_by_chapter[post_it.chapter_id]
        start = max(0, post_it.word - POST_IT_CONTEXT_WORDS)
        end = post_it.word + POST_IT_CONTEXT_WORDS + 1
        text = ' '.join(words[start:end])
        return ('… ' if start > 0 else '') + text + (' …' if end < len(words) else '')

    vocabulary = (UserVocabulary.objects.filter(user=inventory.user, book=book)
                  .select_related('chapter').order_by('word'))
    authors = ', '.join(link.author.full_name for link in book.book_authors.select_related('author')
                        .filter(role='primary') if link.author.full_name)
    return {
        'inventory_id': str(inventory.pk),
        'book_title': book.title,
        'book_author': authors,
        'highlights': [{**place(h.chapter), 'id': str(h.pk), 'start_word': h.start_word,
                        'end_word': h.end_word, 'text': h.text, 'color': h.color} for h in highlights],
        'post_its': [{**place(p.chapter), 'id': str(p.pk), 'word': p.word, 'text': p.text,
                      'context': context(p)} for p in post_its],
        'words': [{'id': str(v.pk), 'word': v.word, 'definition': v.definition,
                   'context': v.context_sentence, 'is_learned': v.is_learned,
                   'chapter_title': v.chapter.title if v.chapter else ''} for v in vocabulary],
    }

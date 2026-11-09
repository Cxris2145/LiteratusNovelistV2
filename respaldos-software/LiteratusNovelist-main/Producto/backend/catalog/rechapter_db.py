"""
Lo que toca la base al volver a dividir un libro (ver rechapter.py): contar y trasladar todo lo que
apunta a un capítulo o a una posición dentro de él.

Las posiciones del lector son (capítulo, índice de palabra). Se trasladan con `BookPlan.map_word`, que
pasa por el índice de palabra de todo el libro: la palabra marcada sigue siendo la misma.

  - ReadingProgress: `current_page` es el número de capítulo (base 1) y `current_cfi` un JSON con
    `wordId: "word-N"` (o `scrollPercent`, fracción del capítulo).
  - UserBookmark: `position_cfi` = {"v": 1, "cid": id del capítulo, "ch": índice base 0, "w": palabra}.
  - UserHighlight (start_word…end_word), UserPostIt (word), BookErrorReport (palabras y párrafo).
  - UserVocabulary: solo el capítulo (sin palabra): va al capítulo nuevo donde empezaba el viejo.
  - ChapterAudio: la alineación de la voz es del texto del capítulo; si el capítulo no queda idéntico,
    la narración se da de baja (borrado lógico) y se vuelve a generar al pedirla.
  - AIAvatar.unlock_at_chapter (base 0): el capítulo nuevo donde empezaba el viejo.
  - ChapterProgressSummary (resumen «hasta el capítulo N»): se renumera si ese punto del texto sigue
    siendo un final de capítulo; si no, se borra (se vuelve a generar con IA cuando alguien lo pida).
  - Clubes de lectura (capítulo desbloqueado, avance de cada miembro, mensajes por capítulo): el
    capítulo nuevo donde TERMINA el viejo, para no adelantar spoilers a nadie.
"""
from __future__ import annotations

import json
from collections import Counter

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ai_engine.models import AIAvatar
from community.models import ReadingClub, ReadingClubMember, ReadingClubMessage
from library.models import ReadingProgress, UserBookmark, UserHighlight, UserPostIt, UserVocabulary

from .models import BookErrorReport, Chapter, ChapterAudio, ChapterProgressSummary
from .rechapter import BookPlan

TEMP_ORDER_OFFSET = 100_000


def _word_from_id(value) -> int | None:
    try:
        return int(str(value).split('-')[-1])
    except (TypeError, ValueError):
        return None


def reference_counts(book, rows) -> dict:
    """Cuántas cosas guardadas apuntan a capítulos de este libro (solo lectura)."""
    ids = [row.pk for row in rows]
    return {
        'progresos': ReadingProgress.objects.filter(inventory__edition__book=book).exclude(current_page=0).count(),
        'marcadores': UserBookmark.all_objects.filter(inventory__edition__book=book).count(),
        'subrayados': UserHighlight.all_objects.filter(chapter_id__in=ids).count(),
        'post_its': UserPostIt.all_objects.filter(chapter_id__in=ids).count(),
        'vocabulario': UserVocabulary.all_objects.filter(chapter_id__in=ids).count(),
        'reportes': BookErrorReport.all_objects.filter(chapter_id__in=ids).count(),
        'narraciones': ChapterAudio.objects.filter(chapter_id__in=ids).count(),
        'personajes': AIAvatar.all_objects.filter(edition__book=book, unlock_at_chapter__gt=0).count(),
        'resumenes': ChapterProgressSummary.all_objects.filter(book=book).count(),
        'clubes': ReadingClub.all_objects.filter(book=book).count(),
    }


@transaction.atomic
def apply_plan(book, rows, plan: BookPlan) -> Counter:
    """
    Reemplaza los capítulos de `book` por los de `plan` y traslada todo lo que apuntaba a ellos.
    `rows` son los capítulos de la base en orden, los mismos con que se hizo el plan.
    """
    assert plan.ok, plan.reason
    assert len(rows) == len(plan.old_words), 'los capítulos cambiaron desde que se hizo el plan'
    stats = Counter()
    old_index = {row.pk: index for index, row in enumerate(rows)}

    # 1) Capítulos: se reusan las filas en orden (un capítulo idéntico conserva su fila) y se crean las que
    #    falten. El orden pasa primero a un valor temporal por la restricción única (libro, orden).
    Chapter.all_objects.filter(book=book).update(order=F('order') + TEMP_ORDER_OFFSET)
    new_rows = [None] * len(plan.chapters)
    for new_index, chapter in enumerate(plan.chapters):
        if chapter.unchanged_from is not None:
            new_rows[new_index] = rows[chapter.unchanged_from]
    used = {row.pk for row in new_rows if row is not None}
    free_rows = [row for row in rows if row.pk not in used]
    for new_index, chapter in enumerate(plan.chapters):
        row = new_rows[new_index]
        if row is None:
            if free_rows:
                row = free_rows.pop(0)
                stats['capitulos_reusados'] += 1
            else:
                row = Chapter(book=book)
                stats['capitulos_creados'] += 1
            row.title = chapter.title
            row.content_html = chapter.html
        row.order = new_index + 1
        row.save()
        new_rows[new_index] = row
    leftover = free_rows  # filas viejas que sobran (si el libro quedó con menos capítulos)

    def target(old_chapter_id, word):
        new_chapter, new_word = plan.map_word(old_index[old_chapter_id], word)
        return new_rows[new_chapter], new_word

    # 2) Progreso de lectura.
    for progress in ReadingProgress.objects.filter(inventory__edition__book=book).exclude(current_page=0):
        old_chapter = min(max(progress.current_page - 1, 0), len(rows) - 1)
        try:
            data = json.loads(progress.current_cfi) if progress.current_cfi else {}
        except (TypeError, ValueError):
            data = {}
        if not isinstance(data, dict):
            data = {}
        word = _word_from_id(data.get('wordId'))
        if word is None and isinstance(data.get('scrollPercent'), (int, float)):
            word = round(float(data['scrollPercent']) * max(len(plan.old_words[old_chapter]) - 1, 0))
        new_chapter, new_word = plan.map_word(old_chapter, word or 0)
        progress.current_page = new_chapter + 1
        if data or word is not None:
            data.pop('scrollPercent', None)
            data['wordId'] = f'word-{new_word}'
            progress.current_cfi = json.dumps(data)
        progress.save(update_fields=['current_page', 'current_cfi', 'updated_at'])
        stats['progresos'] += 1

    # 3) Marcadores de página.
    for bookmark in UserBookmark.all_objects.filter(inventory__edition__book=book):
        try:
            data = json.loads(bookmark.position_cfi)
        except (TypeError, ValueError):
            stats['marcadores_sin_formato'] += 1
            continue
        if not isinstance(data, dict):
            stats['marcadores_sin_formato'] += 1
            continue
        chapter_id = data.get('cid')
        old_chapter = next((i for pk, i in old_index.items() if str(pk) == str(chapter_id)), None)
        if old_chapter is None and isinstance(data.get('ch'), int):
            old_chapter = min(max(data['ch'], 0), len(rows) - 1)
        if old_chapter is None:
            stats['marcadores_sin_formato'] += 1
            continue
        new_chapter, new_word = plan.map_word(old_chapter, data.get('w') or 0)
        data.update(cid=str(new_rows[new_chapter].pk), ch=new_chapter, w=new_word)
        bookmark.position_cfi = json.dumps(data)
        bookmark.save(update_fields=['position_cfi', 'updated_at'])
        stats['marcadores'] += 1

    # 4) Subrayados y post-its (el subrayado que cruzaba un corte se recorta al final de su capítulo).
    for highlight in UserHighlight.all_objects.filter(chapter_id__in=old_index):
        row, start = target(highlight.chapter_id, highlight.start_word)
        end_row, end = target(highlight.chapter_id, highlight.end_word)
        if end_row.pk != row.pk:
            end = len(plan.chapters[new_rows.index(row)].words) - 1
            stats['subrayados_recortados'] += 1
        highlight.chapter, highlight.start_word, highlight.end_word = row, start, max(start, end)
        highlight.save(update_fields=['chapter', 'start_word', 'end_word', 'updated_at'])
        stats['subrayados'] += 1
    for post_it in UserPostIt.all_objects.filter(chapter_id__in=old_index):
        post_it.chapter, post_it.word = target(post_it.chapter_id, post_it.word)
        post_it.save(update_fields=['chapter', 'word', 'updated_at'])
        stats['post_its'] += 1

    # 5) Vocabulario guardado (solo capítulo) y reportes de errores.
    for item in UserVocabulary.all_objects.filter(chapter_id__in=old_index):
        item.chapter = new_rows[plan.map_chapter_start(old_index[item.chapter_id])]
        item.save(update_fields=['chapter', 'updated_at'])
        stats['vocabulario'] += 1
    for report in BookErrorReport.all_objects.filter(chapter_id__in=old_index):
        row, start = target(report.chapter_id, max(report.start_word_index, 0))
        _, end = target(report.chapter_id, max(report.end_word_index, 0))
        report.chapter, report.start_word_index, report.end_word_index = row, start, max(start, end)
        report.paragraph_index = plan.paragraph_of(new_rows.index(row), start)
        report.save(update_fields=['chapter', 'start_word_index', 'end_word_index', 'paragraph_index', 'updated_at'])
        stats['reportes'] += 1

    # 6) Narraciones: solo siguen las de capítulos que quedan idénticos.
    unchanged = {chapter.unchanged_from: new_rows[i] for i, chapter in enumerate(plan.chapters)
                 if chapter.unchanged_from is not None}
    now = timezone.now()
    for audio in ChapterAudio.objects.filter(chapter_id__in=old_index):
        keep = unchanged.get(old_index[audio.chapter_id])
        if keep is not None:
            if audio.chapter_id != keep.pk:
                audio.chapter = keep
                audio.save(update_fields=['chapter', 'updated_at'])
            stats['narraciones_conservadas'] += 1
        else:
            audio.deleted_at, audio.is_active = now, False
            audio.save(update_fields=['deleted_at', 'is_active', 'updated_at'])
            stats['narraciones_dadas_de_baja'] += 1

    # 7) Personajes que se desbloquean en un capítulo (base 0).
    for avatar in AIAvatar.all_objects.filter(edition__book=book, unlock_at_chapter__gt=0):
        old = min(avatar.unlock_at_chapter, len(rows) - 1)
        avatar.unlock_at_chapter = plan.map_chapter_start(old)
        avatar.save(update_fields=['unlock_at_chapter', 'updated_at'])
        stats['personajes'] += 1

    # 8) Resúmenes «hasta el capítulo N». Primero a un valor temporal (restricción única libro + N); si dos
    #    caen en el mismo N nuevo queda el más reciente.
    summaries = list(ChapterProgressSummary.all_objects.filter(book=book).order_by('-updated_at'))
    original = {summary.pk: summary.up_to_chapter for summary in summaries}
    ChapterProgressSummary.all_objects.filter(book=book).update(up_to_chapter=F('up_to_chapter') + TEMP_ORDER_OFFSET)
    taken = set()
    for summary in summaries:
        new_count = plan.old_boundary_kept(original[summary.pk])
        if new_count and new_count not in taken:
            summary.up_to_chapter = new_count
            summary.save(update_fields=['up_to_chapter', 'updated_at'])
            taken.add(new_count)
            stats['resumenes_renumerados'] += 1
        else:
            summary.hard_delete()
            stats['resumenes_borrados'] += 1

    # 9) Clubes de lectura: capítulo nuevo donde termina el viejo (número base 1).
    def club_chapter(old_number):
        return plan.map_chapter_end(min(max(old_number, 1), len(rows)) - 1) + 1
    for club in ReadingClub.all_objects.filter(book=book):
        if club.unlocked_until_chapter:
            club.unlocked_until_chapter = club_chapter(club.unlocked_until_chapter)
            club.save(update_fields=['unlocked_until_chapter', 'updated_at'])
        for member in ReadingClubMember.all_objects.filter(club=club):
            member.current_chapter = club_chapter(member.current_chapter)
            member.save(update_fields=['current_chapter', 'updated_at'])
            stats['clubes_miembros'] += 1
        for message in ReadingClubMessage.all_objects.filter(club=club):
            message.chapter_order = club_chapter(message.chapter_order)
            message.save(update_fields=['chapter_order', 'updated_at'])
            stats['clubes_mensajes'] += 1

    # 10) Filas viejas que sobran (ya no les apunta nada).
    for row in leftover:
        row.hard_delete()
        stats['capitulos_borrados'] += 1
    return stats

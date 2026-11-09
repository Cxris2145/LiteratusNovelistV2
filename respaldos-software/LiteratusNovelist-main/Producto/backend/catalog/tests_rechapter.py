"""Volver a dividir libros con capítulos gigantes (catalog/rechapter.py y split_long_chapters)."""
import json
from io import StringIO
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from ai_engine.models import AIAvatar
from community.models import ReadingClub, ReadingClubMember, ReadingClubMessage
from library.models import ReadingProgress, UserBookmark, UserHighlight, UserInventory, UserPostIt, UserVocabulary

from .models import Book, BookErrorReport, Chapter, ChapterAudio, ChapterProgressSummary, Edition
from .narration import chapter_words
from .rechapter import plan_book, verify
from .rechapter_db import apply_plan

User = get_user_model()
MIN_CHARS = 1500


def words(prefix, count):
    """Palabras únicas (p17, p18…) para saber exactamente adónde fue a parar cada una."""
    return ' '.join(f'{prefix}{n}' for n in range(count))


def para(prefix, count):
    return f'<p>{words(prefix, count)}.</p>'


def book_html():
    """Un libro como los que dejó la importación: portada, dos capítulos gigantes cortados por tamaño y el final."""
    cover = '<p>Portada del libro</p>'
    giant_a = ('<html><head><title>x</title></head><body>'
               '<h2>I</h2>' + para('a', 120) + para('b', 120)
               + '<h2 id="calibre_pb_0">trozo de una línea</h2>' + para('c', 100)
               + '<p>\xa0</p><h2>II</h2>' + para('d', 150) + para('e', 150) + '</body></html>')
    giant_b = ('<body>' + para('f', 60)  # sigue el capítulo II: el corte de la base fue por tamaño
               + '<p><a id="9"></a> <i>Capítulo III</i></p><p><i>El subtítulo</i></p>' + para('g', 150) + para('h', 120)
               + '<h3>VOLUMEN II</h3><p>Nota breve.</p><h4>CARTA V</h4>' + para('k', 160) + '</body>')
    end = '<h2>Fin</h2><p>Fin del libro.</p>'
    return [('Portada', cover), ('Capítulo 2', giant_a), ('Capítulo 3', giant_b), ('Fin', end)]


def as_rows(parts):
    return [SimpleNamespace(title=title, content_html=html) for title, html in parts]


class PlanTests(TestCase):
    def setUp(self):
        self.plan = plan_book(as_rows(book_html()), MIN_CHARS)

    def test_cuts_at_real_headings_and_keeps_the_text_word_by_word(self):
        self.assertTrue(self.plan.ok, self.plan.reason)
        self.assertTrue(verify(self.plan))
        self.assertEqual([c.title for c in self.plan.chapters],
                         ['Portada', 'I', 'II', 'Capítulo III · El subtítulo', 'VOLUMEN II · CARTA V', 'Fin'])

    def test_calibre_page_breaks_and_size_cuts_are_not_chapters(self):
        chapter_two = self.plan.chapters[2]
        text = ' '.join(chapter_two.words)
        self.assertIn('d0', text)
        self.assertIn('f59', text)  # el comienzo del capítulo 3 de la base vuelve al capítulo II
        self.assertIn('c0', ' '.join(self.plan.chapters[1].words))  # el <h2 calibre_pb> no cortó

    def test_untouched_chapters_stay_identical(self):
        self.assertEqual(self.plan.chapters[0].unchanged_from, 0)
        self.assertEqual(self.plan.chapters[-1].unchanged_from, 3)
        self.assertEqual(self.plan.chapters[0].html, book_html()[0][1])

    def test_every_saved_word_points_to_the_same_word(self):
        for old, old_words in enumerate(self.plan.old_words):
            for word in range(0, len(old_words), 7):
                new, new_word = self.plan.map_word(old, word)
                self.assertEqual(self.plan.chapters[new].words[new_word], old_words[word])

    def test_chapter_start_and_end_follow_the_text(self):
        self.assertEqual(self.plan.map_chapter_start(2), 2)   # el capítulo 3 de la base empezaba dentro de II
        self.assertEqual(self.plan.map_chapter_end(2), 4)     # y terminaba en «VOLUMEN II · CARTA V»
        self.assertEqual(self.plan.old_boundary_kept(1), 1)   # después de la portada sigue habiendo un corte
        self.assertIsNone(self.plan.old_boundary_kept(2))     # el corte por tamaño ya no existe

    def test_books_without_giants_or_headings_are_left_alone(self):
        small = plan_book(as_rows([('Uno', para('a', 50)), ('Dos', para('b', 50))]), MIN_CHARS)
        flat = plan_book(as_rows([('Todo', '<body>' + para('a', 600) + '</body>')]), MIN_CHARS)
        self.assertFalse(small.ok)
        self.assertFalse(flat.ok)
        self.assertIn('sin títulos claros', flat.reason)


class ApplyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='lectora', email='l@example.com', password='x-pass-123')
        self.book = Book.objects.create(title='Libro largo', slug='libro-largo', status=Book.StatusChoices.PUBLISHED,
                                        is_published=True)
        self.rows = [Chapter.objects.create(book=self.book, order=i + 1, title=title, content_html=html)
                     for i, (title, html) in enumerate(book_html())]
        self.edition = Edition.objects.create(book=self.book, price=0)
        self.inventory = UserInventory.objects.create(user=self.user, edition=self.edition)
        self.old_words = [chapter_words(row.content_html)[0] for row in self.rows]

    def word_at(self, chapter, index):
        return chapter_words(Chapter.objects.get(pk=chapter.pk).content_html)[0][index]

    def apply(self):
        rows = list(self.book.chapters.order_by('order'))
        plan = plan_book(rows, MIN_CHARS)
        return plan, apply_plan(self.book, rows, plan)

    def test_moves_every_saved_position_to_the_same_word(self):
        g = self.rows[2]  # capítulo 3 de la base
        target = self.old_words[2].index('g10')
        progress, _ = ReadingProgress.objects.get_or_create(inventory=self.inventory)
        progress.current_page, progress.current_cfi = 3, json.dumps({'percentage': 10, 'wordId': f'word-{target}'})
        progress.save()
        bookmark = UserBookmark.objects.create(inventory=self.inventory,
                                               position_cfi=json.dumps({'v': 1, 'cid': str(g.pk), 'ch': 2, 'w': target}))
        cross_start = self.old_words[2].index('f55')   # cruza el corte entre II y Capítulo III
        cross_end = self.old_words[2].index('g3')
        highlight = UserHighlight.objects.create(inventory=self.inventory, chapter=g, start_word=cross_start,
                                                 end_word=cross_end, text='…')
        post_it = UserPostIt.objects.create(inventory=self.inventory, chapter=g, word=self.old_words[2].index('k5'), text='Nota')
        vocab = UserVocabulary.objects.create(user=self.user, book=self.book, chapter=g, word='palabra')
        report = BookErrorReport.objects.create(book=self.book, chapter=g, error_type='typo',
                                                start_word_index=target, end_word_index=target + 2, paragraph_index=5)

        plan, stats = self.apply()

        new = list(self.book.chapters.order_by('order'))
        self.assertEqual([c.title for c in new], [c.title for c in plan.chapters])
        progress.refresh_from_db()
        chapter = new[progress.current_page - 1]
        word = int(json.loads(progress.current_cfi)['wordId'].split('-')[1])
        self.assertEqual(self.word_at(chapter, word), 'g10')
        data = json.loads(UserBookmark.objects.get(pk=bookmark.pk).position_cfi)
        self.assertEqual(self.word_at(new[data['ch']], data['w']), 'g10')
        self.assertEqual(data['cid'], str(new[data['ch']].pk))
        highlight.refresh_from_db()
        self.assertEqual(self.word_at(highlight.chapter, highlight.start_word), 'f55')
        self.assertEqual(stats['subrayados_recortados'], 1)
        post_it.refresh_from_db()
        self.assertEqual(self.word_at(post_it.chapter, post_it.word), 'k5')
        vocab.refresh_from_db()
        self.assertEqual(vocab.chapter_id, new[2].pk)  # donde empezaba el capítulo 3 de la base
        report.refresh_from_db()
        self.assertEqual(self.word_at(report.chapter, report.start_word_index), 'g10')

    def test_unchanged_chapters_keep_their_row_and_narration(self):
        cover_audio = ChapterAudio.objects.create(chapter=self.rows[0], voice_name='A', audio_file='x.mp3',
                                                  alignment_data={'meta': {}})
        giant_audio = ChapterAudio.objects.create(chapter=self.rows[1], voice_name='A', audio_file='y.mp3',
                                                  alignment_data={'meta': {}})
        _, stats = self.apply()
        new = list(self.book.chapters.order_by('order'))
        self.assertEqual(new[0].pk, self.rows[0].pk)
        self.assertEqual(new[-1].pk, self.rows[3].pk)
        self.assertTrue(ChapterAudio.objects.filter(pk=cover_audio.pk).exists())
        self.assertFalse(ChapterAudio.objects.filter(pk=giant_audio.pk).exists())  # dada de baja
        self.assertTrue(ChapterAudio.all_objects.filter(pk=giant_audio.pk).exists())
        self.assertEqual(stats['narraciones_dadas_de_baja'], 1)

    def test_characters_summaries_and_clubs_follow_the_text(self):
        avatar = AIAvatar.objects.create(edition=self.edition, name='Personaje', system_prompt='x', unlock_at_chapter=2)
        kept = ChapterProgressSummary.objects.create(book=self.book, up_to_chapter=1)
        gone = ChapterProgressSummary.objects.create(book=self.book, up_to_chapter=2)
        club = ReadingClub.objects.create(name='Club', book=self.book, host=self.user, unlocked_until_chapter=3)
        member = ReadingClubMember.objects.create(club=club, user=self.user, current_chapter=2)
        message = ReadingClubMessage.objects.create(club=club, user=self.user, chapter_order=3, content='¡Qué capítulo!')

        self.apply()

        avatar.refresh_from_db()
        self.assertEqual(avatar.unlock_at_chapter, 2)  # el capítulo nuevo donde empezaba el 3 de la base
        kept.refresh_from_db()
        self.assertEqual(kept.up_to_chapter, 1)
        self.assertFalse(ChapterProgressSummary.all_objects.filter(pk=gone.pk).exists())
        club.refresh_from_db()
        member.refresh_from_db()
        message.refresh_from_db()
        self.assertEqual(club.unlocked_until_chapter, 5)   # donde termina el capítulo 3 de la base
        self.assertEqual(member.current_chapter, 3)        # donde termina el 2 de la base (II)
        self.assertEqual(message.chapter_order, 5)


class CommandTests(TestCase):
    def setUp(self):
        self.book = Book.objects.create(title='Libro largo', slug='libro-largo', status=Book.StatusChoices.PUBLISHED,
                                        is_published=True)
        for i, (title, html) in enumerate(book_html()):
            Chapter.objects.create(book=self.book, order=i + 1, title=title, content_html=html)

    def test_simulates_by_default_and_applies_only_with_the_flag(self):
        out = StringIO()
        call_command('split_long_chapters', '--book', 'libro-largo', '--min-kb', '1', stdout=out)
        self.assertIn('SIMULACIÓN', out.getvalue())
        self.assertEqual(self.book.chapters.count(), 4)

        call_command('split_long_chapters', '--book', 'libro-largo', '--min-kb', '1', '--apply', stdout=StringIO())
        self.assertEqual(self.book.chapters.count(), 4)  # tiene avisos (capítulos cortos): no se aplica solo

        call_command('split_long_chapters', '--book', 'libro-largo', '--min-kb', '1', '--apply', '--include-flagged',
                     stdout=StringIO())
        self.assertEqual(self.book.chapters.count(), 6)
        self.assertEqual(list(self.book.chapters.order_by('order').values_list('order', flat=True)), [1, 2, 3, 4, 5, 6])

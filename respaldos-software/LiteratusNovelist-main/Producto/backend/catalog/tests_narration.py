import re
import shutil
import tempfile
import threading
import time
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import SimpleTestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from ai_engine import azure_tts
from catalog import narration
from catalog.models import Book, Chapter, ChapterAudio, Edition
from library.models import UserInventory

User = get_user_model()

# Un cuadro MP3 real: MPEG-2 Layer III, 48 kbps, 24 kHz, mono -> 144 bytes y 24 ms.
MP3_FRAME = b'\xff\xf3\x64\xc0' + b'\x00' * 140


class ChapterWordsTests(SimpleTestCase):
    """Las palabras y sus índices deben coincidir con los `word-N` del lector."""

    def test_paragraphs_get_a_pause_between_them(self):
        words, pauses = narration.chapter_words('<p>Hola mundo.</p>\n<p>Adiós.</p>')
        self.assertEqual(words, ['Hola', 'mundo.', 'Adiós.'])
        self.assertEqual(pauses, [0, narration.BLOCK_PAUSE_MS, 0])

    def test_loose_body_text_is_skipped_like_the_reader(self):
        words, _ = narration.chapter_words('Texto suelto <p>Uno dos</p>')
        self.assertEqual(words, ['Uno', 'dos'])

    def test_text_of_a_block_with_block_children_is_skipped(self):
        words, _ = narration.chapter_words('<div>Intro <p>Uno</p></div>')
        self.assertEqual(words, ['Uno'])

    def test_inline_children_of_a_container_are_kept(self):
        words, _ = narration.chapter_words('<div><span>Dentro</span><p>Uno</p></div>')
        self.assertEqual(words, ['Dentro', 'Uno'])

    def test_line_break_adds_a_short_pause(self):
        words, pauses = narration.chapter_words('<p>Verso uno<br>verso dos</p>')
        self.assertEqual(words, ['Verso', 'uno', 'verso', 'dos'])
        self.assertEqual(pauses[1], narration.LINE_BREAK_PAUSE_MS)

    def test_non_breaking_space_separates_words(self):
        words, _ = narration.chapter_words('<p>Hola&nbsp;mundo</p>')
        self.assertEqual(words, ['Hola', 'mundo'])

    def test_comments_styles_and_head_are_not_read(self):
        html = ('<html><head><title>T</title><style>p{color:red}</style></head>'
                '<body><p>Hola <!-- nota --> mundo</p></body></html>')
        words, _ = narration.chapter_words(html)
        self.assertEqual(words, ['Hola', 'mundo'])


class ChunkingTests(SimpleTestCase):
    def test_chunks_cover_every_word_and_cut_between_sentences(self):
        words = 'Uno dos tres. Cuatro cinco seis. Siete ocho nueve.'.split()
        pauses = [0] * len(words)
        chunks = narration.split_chunks(words, pauses, max_chars=40)
        self.assertEqual(chunks, [(0, 6), (6, 9)])

    def test_a_sentence_longer_than_a_chunk_is_split_by_words(self):
        words = ['palabra'] * 10
        chunks = narration.split_chunks(words, [0] * 10, max_chars=20)
        self.assertEqual(chunks[0][0], 0)
        self.assertEqual(chunks[-1][1], 10)
        for (_, end), (start, _) in zip(chunks, chunks[1:]):
            self.assertEqual(end, start)

    def test_body_escapes_text_and_adds_breaks_inside_the_chunk(self):
        body = narration.chunk_body(['A&B', 'fin.', 'Otro'], [0, 500, 0], 0, 3)
        self.assertEqual(body, 'A&amp;B fin. <break time="500ms"/> Otro')


class WordTimingTests(SimpleTestCase):
    @staticmethod
    def timing(text, start, end):
        return azure_tts.WordTiming(text, start, end)

    def test_exact_words_get_their_times_plus_offset(self):
        starts, ends = narration.map_word_timings(
            ['Había', 'una', 'vez.'],
            [self.timing('Había', 0.05, 0.4), self.timing('una', 0.44, 0.6), self.timing('vez', 0.65, 0.85)],
            offset=10.0,
        )
        self.assertEqual([round(s, 3) for s in starts], [10.05, 10.44, 10.65])
        self.assertEqual([round(e, 3) for e in ends], [10.4, 10.6, 10.85])

    def test_one_reader_word_can_span_several_azure_words(self):
        starts, ends = narration.map_word_timings(
            ['dijo—¡Hola!'], [self.timing('dijo', 1.0, 1.3), self.timing('Hola', 1.4, 1.7)])
        self.assertEqual((starts[0], ends[0]), (1.0, 1.7))

    def test_dates_grouped_by_azure_are_split_across_the_reader_words(self):
        starts, ends = narration.map_word_timings(
            ['El', '1', 'de', 'enero', 'de', '1864,', 'llegó.'],
            [self.timing('El', 0.0, 0.2), self.timing('1 de enero de 1864', 0.3, 1.8), self.timing('llegó', 2.0, 2.4)])
        self.assertNotIn(None, starts)
        self.assertEqual(round(starts[1], 3), 0.3)
        self.assertEqual(round(ends[5], 3), 1.8)
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(starts[6], 2.0)

    def test_loose_punctuation_is_filled_from_the_previous_word(self):
        starts, ends = narration.map_word_timings(
            ['Hola', '—', 'dijo'], [self.timing('Hola', 0.0, 0.3), self.timing('dijo', 0.5, 0.8)])
        self.assertIsNone(starts[1])
        starts_ms, ends_ms = narration.fill_gaps(starts, ends)
        self.assertEqual(starts_ms, [0, 300, 500])
        self.assertEqual(ends_ms, [300, 300, 800])

    def test_extra_azure_words_do_not_shift_the_rest(self):
        starts, _ = narration.map_word_timings(
            ['Uno', 'dos', 'tres'],
            [self.timing('Uno', 0.0, 0.2), self.timing('eh', 0.3, 0.4),
             self.timing('dos', 0.5, 0.7), self.timing('tres', 0.8, 1.0)])
        self.assertEqual(starts, [0.0, 0.5, 0.8])

    def test_mp3_duration_counts_frames(self):
        self.assertAlmostEqual(narration.mp3_duration_seconds(MP3_FRAME * 10), 0.24)
        id3 = b'ID3\x04\x00\x00\x00\x00\x00\x05' + b'\x00' * 5
        self.assertAlmostEqual(narration.mp3_duration_seconds(id3 + MP3_FRAME * 5), 0.12)


class CharacterVoiceTests(SimpleTestCase):
    @staticmethod
    def avatar(name, description='', voice='af_bella', pk='3f2b8c1e-0000-0000-0000-000000000001'):
        return SimpleNamespace(pk=pk, name=name, description=description, kokoro_voice_id=voice)

    def test_gender_comes_from_names_and_descriptions(self):
        self.assertEqual(azure_tts.guess_gender('La Princesa', 'Hija del rey'), 'female')
        self.assertEqual(azure_tts.guess_gender('John Watson', 'Narrador y compañero de Holmes, médico'), 'male')
        self.assertEqual(azure_tts.guess_gender('Emilia Pardo Bazán', 'Autora de la obra.'), 'female')
        self.assertIsNone(azure_tts.guess_gender('Koskoosh', 'Protagonista de la historia'))

    def test_an_azure_voice_written_in_the_avatar_is_used_as_is(self):
        self.assertEqual(azure_tts.voice_for_avatar(self.avatar('X', voice='es-MX-JorgeNeural')), 'es-MX-JorgeNeural')

    def test_a_hand_picked_kokoro_voice_keeps_its_gender(self):
        self.assertIn(azure_tts.voice_for_avatar(self.avatar('X', voice='em_alex')), azure_tts.MALE_VOICES)

    def test_the_same_character_always_gets_the_same_voice(self):
        watson = self.avatar('John Watson', 'Narrador y compañero de Holmes')
        self.assertEqual(azure_tts.voice_for_avatar(watson), azure_tts.voice_for_avatar(watson))
        self.assertIn(azure_tts.voice_for_avatar(watson), azure_tts.MALE_VOICES)


class FakeSession:
    """
    Reemplaza el WebSocket de Azure: cada palabra dura 0,3 s y cada una produce un cuadro MP3.
    `delays` hace que los fragmentos que contienen cierta palabra tarden más (para mezclar el orden).
    """
    calls = active = max_active = 0
    delays = {}
    _lock = threading.Lock()

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def synthesize(self, ssml, on_words=None):
        with FakeSession._lock:
            FakeSession.calls += 1
            FakeSession.active += 1
            FakeSession.max_active = max(FakeSession.max_active, FakeSession.active)
        try:
            body = re.sub(r'<break[^>]*/>', ' ', ssml.split('>', 2)[2].rsplit('</voice>', 1)[0])
            words = body.split()
            if on_words:
                on_words(len(words) // 2)  # Azure va mandando los tiempos mientras lee
            for keyword, seconds in FakeSession.delays.items():
                if keyword in body:
                    time.sleep(seconds)
            timings = [azure_tts.WordTiming(w.strip('.,;:!?'), i * 0.3, i * 0.3 + 0.25) for i, w in enumerate(words)]
            return MP3_FRAME * (len(words) * 13), timings  # 13 cuadros ≈ 0,31 s por palabra
        finally:
            with FakeSession._lock:
                FakeSession.active -= 1


@override_settings(AZURE_SPEECH_KEY='test-key', AZURE_SPEECH_REGION='westus',
                   AZURE_TTS_MONTHLY_BOOK_CHARS=100000, AZURE_TTS_USER_DAILY_CHAPTERS=5)
class ChapterNarrationAPITests(APITestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        media_override = override_settings(MEDIA_ROOT=self.media)
        media_override.enable()
        self.addCleanup(media_override.disable)

        for target, replacement in (
            ('catalog.narration.azure_tts.SynthesisSession', FakeSession),
            # La generación corre en el mismo hilo para que el test la vea terminada.
            ('catalog.narration._start_background', narration.generate_narration),
            ('catalog.narration.upload_to_supabase_if_configured', lambda *a, **k: False),
        ):
            patcher = mock.patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        FakeSession.calls = FakeSession.active = FakeSession.max_active = 0
        FakeSession.delays = {}

        self.user = User.objects.create_user(username='lector', email='lector@example.com', password='x-pass-123')
        self.book = Book.objects.create(title='El farol', status=Book.StatusChoices.PUBLISHED, is_published=True)
        self.edition = Edition.objects.create(book=self.book, price=0)
        self.chapter = Chapter.objects.create(
            book=self.book, order=1, title='Uno',
            content_html='<h2>Capítulo uno</h2><p>Había una vez un farol. La ciudad dormía.</p>')
        self.inventory = UserInventory.objects.create(user=self.user, edition=self.edition)
        self.url = f'/api/v1/library/inventory/{self.inventory.pk}/chapters/{self.chapter.pk}/narration/'
        self.client.force_authenticate(self.user)

    def test_first_request_generates_once_and_then_it_is_reused(self):
        first = self.client.post(self.url)
        self.assertEqual(first.status_code, status.HTTP_202_ACCEPTED)

        ready = self.client.post(self.url)
        self.assertEqual(ready.status_code, status.HTTP_200_OK)
        words, _ = narration.chapter_words(self.chapter.content_html)
        alignment = ready.data['alignment']
        self.assertEqual(alignment['format'], narration.WORD_TIMES_FORMAT)
        self.assertEqual(alignment['word_count'], len(words))
        self.assertEqual(alignment['word_starts_ms'], sorted(alignment['word_starts_ms']))
        self.assertNotIn('meta', alignment)

        again = self.client.post(self.url)
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(FakeSession.calls, 1)  # un solo fragmento, sintetizado una sola vez

        audio = self.client.get(ready.data['audio_url'])
        self.assertEqual(audio.status_code, status.HTTP_200_OK)
        self.assertEqual(audio['Content-Type'], 'audio/mpeg')
        self.assertTrue(b''.join(audio.streaming_content).startswith(MP3_FRAME[:4]))
        audio.close()

    def test_local_audio_answers_range_requests_so_the_player_can_seek(self):
        self.client.post(self.url)
        audio_url = self.client.post(self.url).data['audio_url']

        partial = self.client.get(audio_url, HTTP_RANGE='bytes=144-287')
        self.assertEqual(partial.status_code, status.HTTP_206_PARTIAL_CONTENT)
        self.assertEqual(b''.join(partial.streaming_content), MP3_FRAME)  # el segundo cuadro
        self.assertTrue(partial['Content-Range'].startswith('bytes 144-287/'))
        self.assertEqual(partial['Accept-Ranges'], 'bytes')
        partial.close()

        tail = self.client.get(audio_url, HTTP_RANGE='bytes=-144')
        self.assertEqual(b''.join(tail.streaming_content), MP3_FRAME)
        tail.close()

    def test_chapter_list_shows_only_finished_audio_without_alignment(self):
        ChapterAudio.objects.create(chapter=self.chapter, voice_name=narration.narrator_voice_name(),
                                    alignment_data={'meta': {'engine': 'azure', 'status': 'generating'}})
        listed = self.client.get(f'/api/v1/library/inventory/{self.inventory.pk}/chapters/')
        self.assertEqual(listed.data['chapters'][0]['audios'], [])

        ChapterAudio.all_objects.all().delete()
        self.client.post(self.url)
        listed = self.client.get(f'/api/v1/library/inventory/{self.inventory.pk}/chapters/')
        audios = listed.data['chapters'][0]['audios']
        self.assertEqual(len(audios), 1)
        self.assertTrue(audios[0]['has_alignment'])
        self.assertNotIn('alignment_data', audios[0])

    def test_hand_uploaded_audio_wins_and_costs_nothing(self):
        curated = ChapterAudio(chapter=self.chapter, voice_name='Carito - Colombiana',
                               alignment_data={'characters': ['a'], 'character_start_times_seconds': [0],
                                               'character_end_times_seconds': [0.1]})
        curated.audio_file.save('carito.mp3', ContentFile(MP3_FRAME), save=True)

        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['voice_name'], 'Carito - Colombiana')
        self.assertEqual(FakeSession.calls, 0)

    @override_settings(AZURE_TTS_MONTHLY_BOOK_CHARS=10)
    def test_monthly_budget_stops_new_chapters(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['reason'], 'monthly_budget')
        self.assertEqual(FakeSession.calls, 0)

    @override_settings(AZURE_TTS_USER_DAILY_CHAPTERS=0)
    def test_daily_limit_applies_to_readers_but_not_to_staff(self):
        response = self.client.post(self.url)
        self.assertEqual(response.data['reason'], 'daily_limit')

        self.user.is_staff = True
        self.user.save()
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)

    @override_settings(AZURE_SPEECH_KEY='')
    def test_without_azure_the_reader_is_told_to_use_the_standard_voice(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data['reason'], 'not_configured')

    def test_quota_errors_are_reported_and_not_retried_immediately(self):
        with mock.patch.object(FakeSession, 'synthesize', side_effect=azure_tts.AzureTTSQuotaError('sin cupo')):
            self.client.post(self.url)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['reason'], 'quota')

    def test_each_voice_is_generated_and_kept_apart(self):
        self.client.post(self.url)
        catalina = self.client.post(self.url)
        self.assertEqual(catalina.data['voice_name'], 'Azure · es-CL-CatalinaNeural')

        self.client.post(self.url, {'voice': 'es-MX-JorgeNeural'}, format='json')
        jorge = self.client.post(self.url, {'voice': 'es-MX-JorgeNeural'}, format='json')
        self.assertEqual(jorge.status_code, status.HTTP_200_OK)
        self.assertEqual(jorge.data['voice_name'], 'Azure · es-MX-JorgeNeural')
        self.assertNotEqual(jorge.data['audio_url'], catalina.data['audio_url'])
        self.assertEqual(FakeSession.calls, 2)

    def test_unknown_voices_fall_back_to_the_default_one(self):
        self.client.post(self.url, {'voice': 'en-US-JennyNeural'}, format='json')
        response = self.client.post(self.url, {'voice': 'en-US-JennyNeural'}, format='json')
        self.assertEqual(response.data['voice_name'], 'Azure · es-CL-CatalinaNeural')

    def test_voice_list_starts_with_the_default_voice(self):
        response = self.client.get('/api/v1/library/inventory/narration-voices/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['default'], 'es-CL-CatalinaNeural')
        self.assertEqual(response.data['voices'][0]['id'], 'es-CL-CatalinaNeural')
        self.assertIn('es-MX-JorgeNeural', [v['id'] for v in response.data['voices']])

    def test_regenerating_a_lost_mp3_still_counts_what_it_cost(self):
        self.client.post(self.url)
        first_cost = narration.monthly_chars_used()
        self.assertGreater(first_cost, 0)

        audio = ChapterAudio.objects.get(chapter=self.chapter)
        audio.audio_file.storage.delete(audio.audio_file.name)  # Render reinició y se perdió el MP3
        self.client.post(self.url)
        self.assertEqual(FakeSession.calls, 2)
        self.assertEqual(narration.monthly_chars_used(), first_cost * 2)

    def _long_chapter(self):
        """Capítulo de ~4.000 caracteres: se reparte en varios fragmentos."""
        sentences = [f'La oración número {n} cuenta algo distinto del puerto.' for n in range(1, 81)]
        sentences[0] = 'Primera oración del capítulo, que Azure tarda en leer.'
        self.chapter.content_html = '<p>' + ' '.join(sentences[:40]) + '</p><p>' + ' '.join(sentences[40:]) + '</p>'
        self.chapter.save()
        words, pauses = narration.chapter_words(self.chapter.content_html)
        return words, narration.chapter_chunks(words, pauses)

    def test_long_chapters_are_read_in_parallel_and_rebuilt_in_order(self):
        words, chunks = self._long_chapter()
        self.assertGreaterEqual(len(chunks), 2)
        FakeSession.delays = {'Primera': 0.2, 'número': 0.05}  # el primer fragmento termina último

        self.client.post(self.url)
        ready = self.client.post(self.url)
        self.assertEqual(ready.status_code, status.HTTP_200_OK)
        self.assertEqual(FakeSession.calls, len(chunks))
        self.assertGreater(FakeSession.max_active, 1)

        alignment = ready.data['alignment']
        self.assertEqual(alignment['word_count'], len(words))
        self.assertEqual(alignment['word_starts_ms'], sorted(alignment['word_starts_ms']))
        self.assertEqual(alignment['word_starts_ms'][0], 0)  # la primera palabra abre el audio

    def test_progress_is_saved_while_azure_reads(self):
        self._long_chapter()
        FakeSession.delays = {'Primera': 0.15, 'número': 0.15}
        saved = []
        real_set_meta = narration._set_meta

        def record(audio, meta, **changes):
            if 'progress' in changes and 'status' not in changes:
                saved.append(changes['progress'])
            return real_set_meta(audio, meta, **changes)

        with mock.patch.object(narration, 'PROGRESS_SAVE_SECONDS', 0.01),                 mock.patch.object(narration, '_set_meta', side_effect=record):
            self.client.post(self.url)

        self.assertTrue(saved)
        self.assertEqual(saved, sorted(saved))
        self.assertTrue(all(0 < p < 1 for p in saved))
        self.assertEqual(self.client.post(self.url).status_code, status.HTTP_200_OK)

    def test_a_failing_fragment_marks_the_chapter_as_failed(self):
        self._long_chapter()
        real_synthesize = FakeSession.synthesize

        def flaky(session, ssml, on_words=None):
            if 'número 50' in ssml:
                raise azure_tts.AzureTTSQuotaError('sin cupo')
            return real_synthesize(session, ssml, on_words)

        with mock.patch.object(FakeSession, 'synthesize', flaky):
            self.client.post(self.url)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data['reason'], 'quota')

    def test_other_readers_cannot_use_this_inventory(self):
        stranger = User.objects.create_user(username='otro', email='otro@example.com', password='x-pass-123')
        self.client.force_authenticate(stranger)
        self.assertEqual(self.client.post(self.url).status_code, status.HTTP_404_NOT_FOUND)

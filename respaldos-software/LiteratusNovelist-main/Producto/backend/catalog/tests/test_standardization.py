"""Pruebas de catalog.standardization (sinopsis + portada estandarizada).

Toda la IA está mockeada: no se hace ninguna llamada real.
"""

from __future__ import annotations

import tempfile
from io import BytesIO
from pathlib import Path
from unittest import mock

from django.test import TestCase
from PIL import Image

from catalog.models import Author, BookAuthor, Book, Chapter, Genre
from catalog import standardization as S
from catalog.local_synopsis import LocalSynopsis, build_local_synopsis
from ai_engine.generation import GenResult

GOOD_SYNOPSIS = (
    "Gregorio Samsa despierta una mañana convertido en un insecto enorme. "
    "Encerrado en su habitación, trata de entender qué le ocurre mientras su familia, "
    "que vivía de su sueldo de viajante, reacciona primero con desconcierto y luego "
    "con rechazo. La vida doméstica se reorganiza sin él y su lugar en la casa se "
    "vuelve cada vez más incierto. Es un relato inquietante sobre el aislamiento, la "
    "identidad y los lazos familiares que se tensan hasta romperse."
)


def _png_bytes(size=(1024, 1536), color=(40, 30, 60), varied=True) -> bytes:
    img = Image.new("RGB", size, color)
    if varied:
        from PIL import ImageDraw
        d = ImageDraw.Draw(img)
        width, height = size
        d.ellipse(
            [int(width * 0.20), int(height * 0.13),
             int(width * 0.80), int(height * 0.65)],
            fill=(150, 90, 190),
        )
        d.rectangle([0, int(height * 0.78), width, height], fill=(15, 12, 25))
    buf = BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


class StandardizationBase(TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        tmp = Path(self._tmp.name)
        self.enterContext(mock.patch.object(S, "MEDIA_ROOT", tmp))
        self.enterContext(mock.patch.object(S, "CHECKPOINT_PATH", tmp / "chk.json"))
        self.enterContext(mock.patch.object(S, "REPORT_PATH", tmp / "report.md"))

        self.author = Author.objects.create(full_name="Franz Kafka")
        self.genre = Genre.objects.create(name="Ficción clásica")
        self.book = self._make_book("la-metamorfosis-test", "La metamorfosis")

    def tearDown(self):
        self._tmp.cleanup()

    def _make_book(self, slug, title, *, chapters=3, author=True, genre=True, synopsis=""):
        b = Book.objects.create(title=title, slug=slug, synopsis=synopsis,
                                status=Book.StatusChoices.PUBLISHED, is_published=True)
        if author:
            BookAuthor.objects.create(book=b, author=self.author, role="primary")
        if genre:
            b.genres.add(self.genre)
        for i in range(1, chapters + 1):
            Chapter.objects.create(
                book=b, order=i, title=f"Capítulo {i}",
                content_html="<p>" + ("Gregorio Samsa recorría la ciudad con su muestrario "
                                      "de telas, pensando en su familia y en las deudas. " * 12) + "</p>")
        return b

    def _run(self, book, **kw):
        kw.setdefault("do_cover", True)
        kw.setdefault("do_synopsis", True)
        return S.standardize_book(book, **kw)


class SynopsisTests(StandardizationBase):
    def test_generates_synopsis_when_empty(self):
        with mock.patch.object(S, "generate_text",
                               return_value=GenResult(True, GOOD_SYNOPSIS, "gemini_1", "gemini-2.5-flash")):
            res = self._run(self.book, do_cover=False)
        self.book.refresh_from_db()
        self.assertEqual(res.synopsis_status, "generated")
        self.assertEqual(res.synopsis_source, "gemini_1")
        self.assertEqual(self.book.synopsis, GOOD_SYNOPSIS)
        self.assertFalse(res.needs_review)

    def test_keeps_good_existing_synopsis_without_calling_ai(self):
        self.book.synopsis = GOOD_SYNOPSIS
        self.book.save(update_fields=["synopsis"])
        with mock.patch.object(S, "generate_text") as gen:
            res = self._run(self.book, do_cover=False)
        gen.assert_not_called()
        self.assertEqual(res.synopsis_status, "kept")
        self.assertEqual(res.synopsis_source, "existing")

    def test_all_providers_fail_keeps_book_published(self):
        with mock.patch.object(S, "generate_text",
                               return_value=GenResult(False, None, "none", "", "boom")):
            res = self._run(self.book, do_cover=False)
        self.book.refresh_from_db()
        self.assertEqual(res.synopsis_status, "failed")
        self.assertTrue(res.needs_review)
        self.assertEqual(self.book.synopsis, "")
        self.assertTrue(self.book.is_published)

    def test_qc_too_short_triggers_retry(self):
        short = "Un hombre despierta transformado."
        with mock.patch.object(S, "generate_text",
                               side_effect=[GenResult(True, short, "gemini_1", "m"),
                                            GenResult(True, GOOD_SYNOPSIS, "gemini_1", "m")]) as gen:
            res = self._run(self.book, do_cover=False)
        self.assertEqual(gen.call_count, 2)
        self.book.refresh_from_db()
        self.assertEqual(self.book.synopsis, GOOD_SYNOPSIS)
        self.assertEqual(res.synopsis_status, "generated")

    def test_qc_flags_non_spanish(self):
        english = ("A young salesman wakes up one morning transformed into a giant insect and "
                   "must face his family while trapped inside his own bedroom, unable to speak "
                   "or work, as the household slowly turns against him and forgets who he was "
                   "before this strange and unexplained change happened to him overnight today.")
        ok, hard, soft = S.qc_synopsis(english, set())
        self.assertFalse(ok)
        self.assertIn("no parece estar en español", " ".join(hard))

    def test_qc_flags_duplicate(self):
        seen = {S._normalize_syn(GOOD_SYNOPSIS)}
        ok, hard, _ = S.qc_synopsis(GOOD_SYNOPSIS, seen)
        self.assertFalse(ok)
        self.assertIn("duplicada", " ".join(hard))

    def test_thin_source_marks_review(self):
        poem = self._make_book("rima-test", "Rima LIII", chapters=1)
        poem.chapters.update(content_html="<p>Volverán las oscuras golondrinas.</p>")  # muy corto
        with mock.patch.object(S, "generate_text",
                               return_value=GenResult(True, GOOD_SYNOPSIS, "deepseek", "deepseek-chat")):
            res = self._run(poem, do_cover=False)
        self.assertEqual(res.synopsis_status, "generated")
        self.assertTrue(res.needs_review)

    def test_offline_does_not_call_ai(self):
        with mock.patch.object(S, "generate_text") as gen:
            res = self._run(self.book, do_cover=False, offline=True)
        gen.assert_not_called()
        self.assertEqual(res.synopsis_status, "failed")  # vacía y sin IA

    def test_local_synopsis_persists_without_calling_ai(self):
        local = LocalSynopsis(GOOD_SYNOPSIS, "local_chapters", 4200)
        with mock.patch.object(S, "generate_local_synopsis", return_value=local), \
             mock.patch.object(S, "generate_text") as gen:
            res = self._run(self.book, do_cover=False, local_synopsis=True)
        gen.assert_not_called()
        self.book.refresh_from_db()
        self.assertEqual(self.book.synopsis, GOOD_SYNOPSIS)
        self.assertEqual(res.synopsis_source, "local_chapters")
        self.assertEqual(res.synopsis_status, "generated")

    def test_local_synopsis_repairs_long_existing_draft(self):
        self.book.synopsis = GOOD_SYNOPSIS + " " + GOOD_SYNOPSIS
        self.book.save(update_fields=["synopsis"])
        local = LocalSynopsis(GOOD_SYNOPSIS, "local_chapters", 4200, ("fuente local breve",))
        with mock.patch.object(S, "generate_local_synopsis", return_value=local), \
             mock.patch.object(S, "generate_text") as gen:
            res = self._run(self.book, do_cover=False, local_synopsis=True)
        gen.assert_not_called()
        self.book.refresh_from_db()
        self.assertEqual(res.synopsis_source, "existing_edited")
        self.assertLessEqual(S._word_count(self.book.synopsis), S.MAX_WORDS)
        self.assertTrue(S.qc_synopsis(self.book.synopsis, set())[0])
        self.assertFalse(res.needs_review)

    def test_local_builder_filters_editorial_boilerplate(self):
        text, reasons = build_local_synopsis(
            title="La metamorfosis",
            authors="Franz Kafka",
            genres="Ficción clásica",
            documents=[
                "Categoría(s): Ficción.\nAcerca de Franz Kafka: biografía editorial.\n"
                + GOOD_SYNOPSIS
            ],
        )
        self.assertNotIn("Categoría", text)
        self.assertTrue(S.qc_synopsis(text, set())[0])
        self.assertNotIn("contenido local insuficiente", " ".join(reasons))

    def test_local_builder_metadata_fallback_is_valid(self):
        text, reasons = build_local_synopsis(
            title="Recuerdos",
            authors="Autora de prueba",
            genres="Poesía",
            documents=[],
            chapter_titles=["Índice", "Primer soneto"],
        )
        self.assertTrue(S.qc_synopsis(text, set())[0])
        self.assertTrue(reasons)


class CoverTests(StandardizationBase):
    def test_hybrid_cover_when_gemini_ok(self):
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, _png_bytes(), "gemini_1", "gemini-2.5-flash-image")):
            res = self._run(self.book, do_synopsis=False)
        self.book.refresh_from_db()
        self.assertEqual(res.cover_status, "generated")
        self.assertEqual(res.cover_source, "gemini_1")
        self.assertEqual(self.book.cover_image.name, "books/la-metamorfosis-test/cover_literatus.webp")
        out = S.MEDIA_ROOT / self.book.cover_image.name
        with Image.open(out) as im:
            self.assertEqual(im.size, (600, 900))
            self.assertEqual((im.format or "").upper(), "WEBP")
        self.assertFalse(res.needs_review)

    def test_procedural_fallback_when_gemini_fails(self):
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(False, None, "none", "m", "quota")):
            res = self._run(self.book, do_synopsis=False)
        self.book.refresh_from_db()
        self.assertEqual(res.cover_status, "fallback_procedural")
        self.assertTrue(res.needs_review)
        out = S.MEDIA_ROOT / self.book.cover_image.name
        with Image.open(out) as im:
            self.assertEqual(im.size, (600, 900))

    def test_junk_bytes_rejected_then_procedural(self):
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, b"not-an-image", "gemini_1", "m")):
            res = self._run(self.book, do_synopsis=False)
        self.assertEqual(res.cover_status, "fallback_procedural")

    def test_solid_color_image_rejected(self):
        solid = _png_bytes(color=(20, 20, 20), varied=False)
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, solid, "gemini_1", "m")):
            res = self._run(self.book, do_synopsis=False)
        self.assertEqual(res.cover_status, "fallback_procedural")

    def test_backs_up_previous_cover(self):
        # coloca una portada previa en disco y en el modelo
        prev_dir = S.MEDIA_ROOT / "books" / self.book.slug
        prev_dir.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (600, 900), (10, 20, 30)).save(prev_dir / "cover_optimized.webp", "WEBP")
        self.book.cover_image = f"books/{self.book.slug}/cover_optimized.webp"
        self.book.save(update_fields=["cover_image"])
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, _png_bytes(), "gemini_1", "m")):
            self._run(self.book, do_synopsis=False)
        backup = S.MEDIA_ROOT / S.COVER_BACKUP_DIRNAME / f"{self.book.slug}__cover_optimized.webp"
        self.assertTrue(backup.exists())
        manifest = S.MEDIA_ROOT / S.COVER_BACKUP_DIRNAME / "BOOK_COVER_BACKUP.json"
        self.assertIn(self.book.slug, manifest.read_text(encoding="utf-8"))
        # el archivo original no se borra
        self.assertTrue((prev_dir / "cover_optimized.webp").exists())

    def test_book_without_genre_or_author(self):
        bare = self._make_book("anon-test", "Título sin género — ¿y qué?", author=False, genre=False)
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(False, None, "none", "m", "x")):
            res = self._run(bare, do_synopsis=False)
        bare.refresh_from_db()
        self.assertEqual(res.cover_status, "fallback_procedural")
        out = S.MEDIA_ROOT / bare.cover_image.name
        self.assertTrue(out.exists())

    def test_duplicate_title_different_seed(self):
        b1 = self._make_book("quijote-1-test", "Don Quijote de la Mancha")
        b2 = self._make_book("quijote-2-test", "Don Quijote de la Mancha")
        from catalog.covers import build_cover_context
        self.assertNotEqual(build_cover_context(b1)["seed"], build_cover_context(b2)["seed"])

    def test_dry_run_writes_nothing(self):
        before = self.book.cover_image.name or ""
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, _png_bytes(), "gemini_1", "m")):
            self._run(self.book, do_synopsis=False, dry_run=True,
                      preview_dir=S.MEDIA_ROOT / "_preview")
        self.book.refresh_from_db()
        self.assertEqual(self.book.cover_image.name or "", before)
        self.assertFalse((S.MEDIA_ROOT / "books" / self.book.slug / "cover_literatus.webp").exists())
        self.assertTrue((S.MEDIA_ROOT / "_preview" / f"{self.book.slug}.webp").exists())

    def test_idempotent_second_run_keeps(self):
        with mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, _png_bytes(), "gemini_1", "m")) as gen:
            self._run(self.book, do_synopsis=False)
            res2 = self._run(self.book, do_synopsis=False)
        self.assertEqual(gen.call_count, 1)  # la 2ª vez no vuelve a llamar
        self.assertEqual(res2.cover_status, "kept")

    def test_local_art_is_composed_without_calling_ai(self):
        art_dir = S.MEDIA_ROOT / "incoming_art"
        art_dir.mkdir()
        art_path = art_dir / f"{self.book.slug}.png"
        art_path.write_bytes(_png_bytes())
        audit = S.inspect_art_directory(art_dir)

        with mock.patch.object(S, "generate_cover_image") as generate:
            res = self._run(
                self.book, do_synopsis=False, regenerate=True,
                art_index=audit["paths"],
            )

        generate.assert_not_called()
        self.book.refresh_from_db()
        self.assertEqual(res.cover_status, "generated")
        self.assertEqual(res.cover_source, "local_art")
        self.assertEqual(self.book.cover_image.name,
                         f"books/{self.book.slug}/cover_literatus.webp")
        metadata = (S.MEDIA_ROOT / "books" / self.book.slug / "metadata.json").read_text(
            encoding="utf-8"
        )
        self.assertIn(art_path.name, metadata)
        self.assertIn("art_sha256", metadata)

    def test_art_directory_flags_exact_duplicate_illustrations(self):
        art_dir = S.MEDIA_ROOT / "duplicate_art"
        art_dir.mkdir()
        data = _png_bytes()
        (art_dir / f"{self.book.slug}.png").write_bytes(data)
        (art_dir / "otro-libro.png").write_bytes(data)

        audit = S.inspect_art_directory(art_dir)

        self.assertEqual(len(audit["exact_duplicate_groups"]), 1)
        self.assertEqual(len(audit["perceptual_duplicate_groups"]), 1)

    def test_art_directory_flags_wrong_aspect_ratio(self):
        art_dir = S.MEDIA_ROOT / "square_art"
        art_dir.mkdir()
        (art_dir / f"{self.book.slug}.png").write_bytes(_png_bytes(size=(1024, 1024)))

        audit = S.inspect_art_directory(art_dir)

        self.assertEqual(audit["valid"], 0)
        self.assertIn("proporción distinta de 2:3", audit["invalid_items"][0]["reason"])


class BatchTests(StandardizationBase):
    def test_library_run_writes_report_and_checkpoint(self):
        self._make_book("segundo-test", "Segundo libro")
        with mock.patch.object(S, "generate_text",
                               return_value=GenResult(True, GOOD_SYNOPSIS, "gemini_1", "m")), \
             mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, _png_bytes(), "gemini_1", "m")), \
             mock.patch.object(S, "backup_sqlite_database", return_value=None):
            out = S.standardize_library(
                selector={"all": True}, do_cover=True, do_synopsis=True,
                regenerate=False, dry_run=False, sleep=0)
        self.assertEqual(out["counters"]["done"], 2)
        self.assertTrue(S.REPORT_PATH.exists())
        self.assertTrue(S.CHECKPOINT_PATH.exists())
        import json
        chk = json.loads(S.CHECKPOINT_PATH.read_text(encoding="utf-8"))
        self.assertIn("la-metamorfosis-test", chk["books"])
        self.assertEqual(chk["stage"], "COMPLETE")

    def test_one_failure_does_not_stop_batch(self):
        self._make_book("tercero-test", "Tercero")
        seq = [GenResult(False, None, "none", "", "boom"),
               GenResult(True, GOOD_SYNOPSIS, "gemini_1", "m")]
        with mock.patch.object(S, "generate_text", side_effect=seq * 5), \
             mock.patch.object(S, "generate_cover_image",
                               return_value=GenResult(True, _png_bytes(), "gemini_1", "m")), \
             mock.patch.object(S, "backup_sqlite_database", return_value=None):
            out = S.standardize_library(
                selector={"all": True}, do_cover=True, do_synopsis=True,
                regenerate=False, dry_run=False, sleep=0)
        self.assertEqual(out["counters"]["done"], 2)
        self.assertGreaterEqual(out["counters"]["synopsis_failed"], 1)

    def test_art_dir_preflight_rejects_missing_selected_book_before_backup(self):
        second = self._make_book("segundo-art-test", "Segundo libro")
        art_dir = S.MEDIA_ROOT / "partial_art"
        art_dir.mkdir()
        (art_dir / f"{self.book.slug}.png").write_bytes(_png_bytes())

        with mock.patch.object(S, "backup_sqlite_database") as backup:
            with self.assertRaisesRegex(ValueError, "Faltan 1 ilustración"):
                S.standardize_library(
                    selector={"slugs": [self.book.slug, second.slug]},
                    do_cover=True, do_synopsis=False, regenerate=True, dry_run=False,
                    sleep=0, art_dir=art_dir,
                )

        backup.assert_not_called()

"""Portrait workflow tests use isolated Django settings and temporary media only."""
from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
from unittest.mock import Mock, patch

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from PIL import Image

from ai_engine.models import AIAvatar
from ai_engine.portraits import (
    PortraitError, contained_path, database_fingerprint, export_manifest,
    import_manifest, webp_bytes,
)
from catalog.models import Author, Book, BookAuthor, Edition


class PortraitWorkflowTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix=".tmp-portraits-", dir=settings.BASE_DIR)
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.images = self.root / "images"
        self.images.mkdir()
        self.media = self.root / "media"
        self.settings_context = override_settings(MEDIA_ROOT=self.media, MEDIA_URL="/media/")
        self.settings_context.enable()
        self.addCleanup(self.settings_context.disable)
        self.book = Book.objects.create(title="La Ilíada")
        self.edition = Edition.objects.create(book=self.book, price=0)
        self.avatar = AIAvatar.objects.create(
            edition=self.edition, name="Aquiles", system_prompt="PRIVATE SYSTEM",
            description="NARRATIVE REVELATION", behavioral_context="HIDDEN BETRAYAL", unlock_at_chapter=3,
        )
        Image.new("RGB", (128, 192), "navy").save(self.images / "portrait.png")

    def manifest(self):
        manifest = export_manifest()
        manifest["avatars"][0]["output_image"] = "portrait.png"
        return manifest

    def run_import(self, manifest=None, **kwargs):
        return import_manifest(manifest or self.manifest(), self.images,
                               expected_fingerprint=database_fingerprint(), **kwargs)

    def test_export_private_metadata_not_prompt(self):
        manifest = export_manifest(profiles={str(self.avatar.pk): {"clothing": "bronze armor", "hair": "curly"}})
        record = manifest["avatars"][0]
        self.assertEqual(record["description"], "NARRATIVE REVELATION")
        self.assertEqual(record["behavioral_context"], "HIDDEN BETRAYAL")
        self.assertNotIn("NARRATIVE REVELATION", record["prompt"])
        self.assertNotIn("HIDDEN BETRAYAL", record["prompt"])
        self.assertNotIn("PRIVATE SYSTEM", json.dumps(manifest))
        self.assertIn("bronze armor", record["prompt"])
        self.assertEqual(record["profile_status"], "curated")
        self.assertIsNone(record["output_image"])
        self.assertEqual(record["unlock_at_chapter"], 3)

    def test_unreviewed_profile_stays_explicit(self):
        record = export_manifest()["avatars"][0]
        self.assertEqual(record["profile_status"], "needs_appearance_review")
        self.assertEqual(record["status"], "pending")
        with self.assertRaises(PortraitError):
            export_manifest(profiles={str(self.avatar.pk): {"behavioral_context": "secret"}})

    def test_same_book_same_name_deduplicates_but_cross_book_does_not(self):
        other_edition = Edition.objects.create(book=self.book, language="en", price=0)
        duplicate = AIAvatar.objects.create(edition=other_edition, name=" AQUILES ", system_prompt="x")
        second_book = Book.objects.create(title="Otro libro")
        separate = AIAvatar.objects.create(edition=Edition.objects.create(book=second_book, price=0), name="Aquiles", system_prompt="x")
        records = {item["avatar_id"]: item for item in export_manifest()["avatars"]}
        self.assertEqual(records[str(self.avatar.pk)]["identity_key"], records[str(duplicate.pk)]["identity_key"])
        self.assertNotEqual(records[str(self.avatar.pk)]["identity_key"], records[str(separate.pk)]["identity_key"])
        records[str(self.avatar.pk)]["output_image"] = "portrait.png"
        manifest = export_manifest()
        for record in manifest["avatars"]:
            record["output_image"] = records[record["avatar_id"]]["output_image"]
        report = self.run_import(manifest, apply=True)
        self.assertEqual(report["counts"], {"linked": 2, "pending": 1})
        duplicate.refresh_from_db()
        self.avatar.refresh_from_db()
        self.assertEqual(duplicate.avatar_image.name, self.avatar.avatar_image.name)

    def test_authors_share_only_catalog_author_identity(self):
        author = Author.objects.create(full_name="Homero")
        BookAuthor.objects.create(book=self.book, author=author)
        historical = AIAvatar.objects.create(edition=self.edition, name="Homero", is_author=True, system_prompt="x")
        second_book = Book.objects.create(title="Odisea")
        BookAuthor.objects.create(book=second_book, author=author)
        second = AIAvatar.objects.create(edition=Edition.objects.create(book=second_book, price=0), name="Homero", is_author=True, system_prompt="x")
        unrelated = AIAvatar.objects.create(edition=self.edition, name="Desconocido", is_author=True, system_prompt="x")
        unrelated_two = AIAvatar.objects.create(edition=self.edition, name="Desconocido", is_author=True, system_prompt="x")
        records = {item["avatar_id"]: item for item in export_manifest()["avatars"]}
        self.assertEqual(records[str(historical.pk)]["identity_key"], f"author:{author.pk}")
        self.assertEqual(records[str(second.pk)]["identity_key"], f"author:{author.pk}")
        self.assertNotEqual(records[str(unrelated.pk)]["identity_key"], records[str(unrelated_two.pk)]["identity_key"])

    def test_dry_run_writes_no_media_or_database_or_network(self):
        with patch("ai_engine.portraits.requests.get") as get, patch("ai_engine.portraits.upload_to_supabase_if_configured") as upload:
            report = self.run_import(upload=True)
        self.assertEqual(report["counts"], {"ready": 1})
        self.assertEqual(report["results"][0]["upload"], "would_upload")
        self.assertFalse(self.media.exists())
        self.avatar.refresh_from_db()
        self.assertFalse(self.avatar.avatar_image)
        get.assert_not_called()
        upload.assert_not_called()

    def test_apply_real_webp_idempotent_and_preserves_unlock(self):
        first = self.run_import(apply=True)
        result = first["results"][0]
        self.assertEqual(result["status"], "linked")
        destination = self.media / result["media_path"]
        with Image.open(destination) as image:
            self.assertEqual(image.format, "WEBP")
        self.avatar.refresh_from_db()
        self.assertEqual(self.avatar.unlock_at_chapter, 3)
        second = self.run_import(apply=True)
        self.assertEqual(second["results"][0]["local"], "already_saved")
        self.assertEqual(second["counts"], {"already_linked": 1})
        self.assertEqual(len(list(self.media.rglob("*.webp"))), 1)

    def test_convert_resizes_real_format_even_misnamed_input(self):
        Image.new("RGBA", (1600, 2400), (0, 0, 100, 120)).save(self.images / "wrong.webp", format="PNG")
        data = webp_bytes(self.images / "wrong.webp")
        with Image.open(io.BytesIO(data)) as image:
            self.assertEqual(image.format, "WEBP")
            self.assertEqual(image.size, (683, 1024))
            self.assertEqual(image.mode, "RGBA")

    def test_invalid_image_missing_file_and_escape_not_linked(self):
        (self.images / "invalid.png").write_text("this is not an image", encoding="utf-8")
        for output in ("invalid.png", "missing.png", "../portrait.png", "C:/outside.png", "\\outside.png"):
            manifest = self.manifest()
            manifest["avatars"][0]["output_image"] = output
            with self.subTest(output=output):
                report = self.run_import(manifest, apply=True)
                self.assertEqual(report["counts"], {"failed": 1})
        self.avatar.refresh_from_db()
        self.assertFalse(self.avatar.avatar_image)
        self.assertFalse(self.media.exists())

    def test_existing_portrait_preserved_and_replace_changes_pointer_only(self):
        self.media.mkdir()
        prior = self.media / "previous.png"
        Image.new("RGB", (128, 128), "red").save(prior)
        self.avatar.avatar_image = "previous.png"
        self.avatar.save(update_fields=["avatar_image"])
        report = self.run_import(apply=True)
        self.assertEqual(report["counts"], {"preserved_existing": 1})
        self.assertEqual(len(list(self.media.iterdir())), 1)
        replaced = self.run_import(apply=True, replace=True)
        self.assertEqual(replaced["counts"], {"linked": 1})
        self.assertTrue(prior.exists())

    def test_identity_and_context_changed_reject_stale_manifest(self):
        for key, value in (("name", "Aquiles cambiado"), ("book_id", str(self.edition.pk)), ("identity_key", "author:anyone")):
            manifest = self.manifest()
            manifest["avatars"][0][key] = value
            with self.subTest(key=key):
                self.assertEqual(self.run_import(manifest, apply=True)["counts"], {"failed": 1})
        self.assertFalse(self.media.exists())

    def test_duplicate_uuid_and_wrong_database_rejected_before_writes(self):
        manifest = self.manifest()
        manifest["avatars"].append(deepcopy(manifest["avatars"][0]))
        with self.assertRaises(PortraitError):
            self.run_import(manifest, apply=True)
        for fingerprint in (None, "wrong"):
            with self.assertRaises(PortraitError):
                import_manifest(self.manifest(), self.images, apply=True, expected_fingerprint=fingerprint)
        manifest = self.manifest()
        manifest["database_fingerprint"] = "wrong-source"
        with self.assertRaises(PortraitError):
            self.run_import(manifest, apply=True)
        self.assertFalse(self.media.exists())

    @override_settings(MEDIA_URL="https://remote.example/media/")
    def test_remote_media_requires_explicit_upload(self):
        with self.assertRaises(PortraitError):
            self.run_import(apply=True)
        self.assertFalse(self.media.exists())

    @override_settings(SUPABASE_URL="https://storage.example", SUPABASE_SERVICE_KEY="test-secret", SUPABASE_KEY="")
    def test_failed_upload_leaves_local_asset_but_never_links(self):
        missing = Mock(status_code=404, content=b"")
        with patch("ai_engine.portraits.requests.get", return_value=missing), patch("ai_engine.portraits.upload_to_supabase_if_configured", return_value=False):
            result = self.run_import(apply=True, upload=True)["results"][0]
        self.assertEqual(result["local"], "saved")
        self.assertEqual(result["upload"], "failed")
        self.assertEqual(result["database"], "not_linked")
        self.avatar.refresh_from_db()
        self.assertFalse(self.avatar.avatar_image)

    @override_settings(SUPABASE_URL="https://storage.example", SUPABASE_SERVICE_KEY="test-secret", SUPABASE_KEY="")
    def test_successful_upload_requires_matching_public_content_and_resumes(self):
        data = webp_bytes(self.images / "portrait.png")
        missing = Mock(status_code=404, content=b"")
        matching = Mock(status_code=200, content=data)
        with patch("ai_engine.portraits.requests.get", side_effect=[missing, matching]), patch("ai_engine.portraits.upload_to_supabase_if_configured", return_value=True) as upload:
            report = self.run_import(apply=True, upload=True)
        self.assertEqual(report["results"][0]["upload"], "uploaded")
        self.assertEqual(report["counts"], {"linked": 1})
        upload.assert_called_once()
        with patch("ai_engine.portraits.requests.get", return_value=matching), patch("ai_engine.portraits.upload_to_supabase_if_configured") as upload:
            report = self.run_import(apply=True, upload=True)
        self.assertEqual(report["results"][0]["upload"], "already_uploaded")
        self.assertEqual(report["counts"], {"already_linked": 1})
        upload.assert_not_called()

    @override_settings(SUPABASE_URL="https://storage.example", SUPABASE_SERVICE_KEY="test-secret", SUPABASE_KEY="")
    def test_upload_verification_failure_never_links(self):
        mismatch = Mock(status_code=200, content=b"different-image")
        with patch("ai_engine.portraits.requests.get", return_value=mismatch), patch("ai_engine.portraits.upload_to_supabase_if_configured", return_value=True):
            report = self.run_import(apply=True, upload=True)
        self.assertEqual(report["counts"], {"failed": 1})
        self.avatar.refresh_from_db()
        self.assertFalse(self.avatar.avatar_image)

    def test_identity_shared_image_uploaded_and_verified_only_once_per_batch(self):
        duplicate = AIAvatar.objects.create(edition=self.edition, name="Aquiles", system_prompt="x")
        manifest = export_manifest()
        manifest["avatars"][0]["output_image"] = "portrait.png"
        with patch("ai_engine.portraits._upload_verified", return_value="uploaded") as upload:
            report = self.run_import(manifest, apply=True, upload=True)
        self.assertEqual(report["counts"], {"linked": 2})
        upload.assert_called_once()
        self.avatar.refresh_from_db()
        duplicate.refresh_from_db()
        self.assertEqual(self.avatar.avatar_image.name, duplicate.avatar_image.name)

    def test_management_commands_export_and_default_import_are_dry(self):
        manifest_path = self.root / "manifest.json"
        output = io.StringIO()
        call_command("export_portraits", output=str(manifest_path), stdout=output)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["avatars"][0]["output_image"] = "portrait.png"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        report_path = self.root / "report.json"
        call_command("import_portraits", str(manifest_path), images_root=str(self.images), report=str(report_path), stdout=io.StringIO())
        self.assertTrue(json.loads(report_path.read_text(encoding="utf-8"))["dry_run"])
        self.assertFalse(self.media.exists())

    def test_missing_output_stays_pending(self):
        report = self.run_import(export_manifest(), apply=True)
        self.assertEqual(report["counts"], {"pending": 1})
        self.assertEqual(report["results"][0]["reason"], "missing_output")
        self.assertFalse(self.media.exists())

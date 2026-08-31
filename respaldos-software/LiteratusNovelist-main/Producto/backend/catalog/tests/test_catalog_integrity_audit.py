from django.core.management import call_command
from django.test import TestCase, override_settings

from catalog.management.commands.audit_catalog_integrity import normalized_name, run_audit
from catalog.models import Author, Book, BookAuthor


class CatalogIntegrityAuditTests(TestCase):
    def test_normalized_name_removes_accents_case_and_punctuation(self):
        self.assertEqual(normalized_name("  Jose-Maria Vargas Vila! "), "jose maria vargas vila")

    @override_settings(MEDIA_ROOT="/tmp/literatus-test-media")
    def test_run_audit_detects_author_duplicates_cover_gap_and_principito_candidate(self):
        author_a = Author.objects.create(full_name="Antoine de Saint-Exupery")
        author_b = Author.objects.create(full_name="Saint Exupery, Antoine de")
        other_author = Author.objects.create(full_name="Mary Shelley")

        principito = Book.objects.create(
            title="El Principito",
            slug="el-principito-antoine-de-saint-exupery",
            is_published=True,
        )
        BookAuthor.objects.create(book=principito, author=author_a)

        missing_cover = Book.objects.create(
            title="Frankenstein",
            slug="frankenstein-mary-shelley",
            is_published=True,
        )
        BookAuthor.objects.create(book=missing_cover, author=other_author)

        BookAuthor.objects.create(book=Book.objects.create(title="Vuelo Nocturno"), author=author_b)

        result = run_audit()

        self.assertEqual(result["counts"]["books"], 3)
        self.assertEqual(result["counts"]["missing_cover_assignments"], 3)
        self.assertEqual(len(result["author_duplicate_groups"]), 1)
        self.assertEqual(result["author_duplicate_groups"][0]["signature"], "antoine de exupery saint")
        self.assertEqual(len(result["el_principito_db_candidates"]), 1)
        self.assertEqual(result["el_principito_db_candidates"][0]["slug"], principito.slug)

    def test_management_command_no_report_prints_summary(self):
        Author.objects.create(full_name="Author One")
        Book.objects.create(title="Book One", slug="book-one")

        call_command("audit_catalog_integrity", "--no-report")

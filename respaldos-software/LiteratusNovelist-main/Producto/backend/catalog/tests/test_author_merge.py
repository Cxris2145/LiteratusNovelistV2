from django.core.management import call_command
from django.test import TestCase

from catalog.models import Author, Book, BookAuthor


class MergeDuplicateAuthorsTests(TestCase):
    def test_dry_run_does_not_change_authors_or_relations(self):
        canonical = Author.objects.create(full_name="Víctor Hugo", slug="victor-hugo")
        alias = Author.objects.create(full_name="Hugo Victor", slug="hugo-victor")
        book = Book.objects.create(title="Notre-Dame", slug="notre-dame")
        BookAuthor.objects.create(book=book, author=alias)

        call_command(
            "merge_duplicate_authors",
            "--group",
            "victor-hugo:hugo-victor",
            "--no-backup",
            "--no-report",
        )

        self.assertTrue(Author.objects.filter(pk=alias.pk).exists())
        self.assertTrue(BookAuthor.objects.filter(book=book, author=alias).exists())
        self.assertFalse(BookAuthor.objects.filter(book=book, author=canonical).exists())

    def test_apply_moves_relations_and_soft_deletes_alias(self):
        canonical = Author.objects.create(full_name="Víctor Hugo", slug="victor-hugo")
        alias = Author.objects.create(full_name="Hugo Victor", slug="hugo-victor")
        book = Book.objects.create(title="Notre-Dame", slug="notre-dame")
        BookAuthor.objects.create(book=book, author=alias)

        call_command(
            "merge_duplicate_authors",
            "--group",
            "victor-hugo:hugo-victor",
            "--apply",
            "--no-backup",
            "--no-report",
        )

        self.assertFalse(Author.objects.filter(pk=alias.pk).exists())
        self.assertTrue(Author.all_objects.filter(pk=alias.pk, deleted_at__isnull=False).exists())
        self.assertTrue(BookAuthor.objects.filter(book=book, author=canonical).exists())

    def test_apply_skips_duplicate_book_author_relation(self):
        canonical = Author.objects.create(full_name="Anónimo", slug="anonimo")
        alias = Author.objects.create(full_name="Anonimo", slug="anonimo-1")
        book = Book.objects.create(title="Popol Vuh", slug="popol-vuh")
        BookAuthor.objects.create(book=book, author=canonical)
        alias_relation = BookAuthor.objects.create(book=book, author=alias)

        call_command(
            "merge_duplicate_authors",
            "--group",
            "anonimo:anonimo-1",
            "--apply",
            "--no-backup",
            "--no-report",
        )

        self.assertEqual(BookAuthor.objects.filter(book=book, author=canonical).count(), 1)
        self.assertFalse(BookAuthor.objects.filter(pk=alias_relation.pk).exists())

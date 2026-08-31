import os
import sys
import time
import django

# Add backend directory to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client
from django.db import connection, reset_queries
from django.conf import settings
from catalog.models import Book, Author, Genre
from users.models import User, Profile
from library.models import UserInventory, Edition

def run_benchmarks():
    client = Client()
    
    # Ensure debug is True to capture query counts
    settings.DEBUG = True
    if 'testserver' not in settings.ALLOWED_HOSTS:
        settings.ALLOWED_HOSTS.append('testserver')
        settings.ALLOWED_HOSTS.append('*')
    
    # Check dataset statistics
    book_count = Book.objects.count()
    author_count = Author.objects.count()
    genre_count = Genre.objects.count()
    print(f"=== DATASET: {book_count} Books, {author_count} Authors, {genre_count} Genres ===")
    
    # Pick a sample book, author, and inventory
    sample_book = Book.objects.filter(is_published=True).first()
    sample_slug = sample_book.slug if sample_book else 'el-principito'
    
    heavy_book = Book.objects.filter(slug='los-nueve-libros-de-la-historia-herodoto').first()
    if not heavy_book:
        heavy_book = sample_book
    heavy_slug = heavy_book.slug
    
    sample_author = Author.objects.first()
    sample_author_slug = sample_author.slug if sample_author else 'antoine-de-saint-exupery'
    
    # Test user and inventory
    user, _ = User.objects.get_or_create(username='bench_user', defaults={'email': 'bench@example.com'})
    profile, _ = Profile.objects.get_or_create(user=user, defaults={'ink_balance': 500})
    edition = sample_book.editions.first() if sample_book else None
    if edition:
        inv, _ = UserInventory.objects.get_or_create(user=user, edition=edition)
        inv_id = str(inv.id)
    else:
        inv_id = None

    endpoints = [
        ("GET /api/v1/catalog/books/ (p1 default)", "/api/v1/catalog/books/", False),
        ("GET /api/v1/catalog/books/?compact=true", "/api/v1/catalog/books/?compact=true", False),
        ("GET /api/v1/catalog/books/?page=2", "/api/v1/catalog/books/?page=2", False),
        ("GET /api/v1/catalog/books/?genres__slug=cuentos", "/api/v1/catalog/books/?genres__slug=cuentos", False),
        ("GET /api/v1/catalog/books/?search=garcia", "/api/v1/catalog/books/?search=garcia", False),
        ("GET /api/v1/catalog/books/?ordering=title", "/api/v1/catalog/books/?ordering=title", False),
        ("GET /api/v1/catalog/genres/", "/api/v1/catalog/genres/", False),
        (f"GET /api/v1/catalog/books/{sample_slug}/", f"/api/v1/catalog/books/{sample_slug}/", False),
        (f"GET /api/v1/catalog/books/{sample_slug}/details/", f"/api/v1/catalog/books/{sample_slug}/details/", False),
        (f"GET /api/v1/catalog/books/{heavy_slug}/details/ (heavy)", f"/api/v1/catalog/books/{heavy_slug}/details/", False),
        ("GET /api/v1/catalog/books/recommendations/ (anon)", "/api/v1/catalog/books/recommendations/", False),
        ("GET /api/v1/catalog/authors/ (p1 default)", "/api/v1/catalog/authors/", False),
        ("GET /api/v1/catalog/authors/?page=2", "/api/v1/catalog/authors/?page=2", False),
        (f"GET /api/v1/catalog/authors/{sample_author_slug}/", f"/api/v1/catalog/authors/{sample_author_slug}/", False),
    ]

    if inv_id:
        endpoints.extend([
            ("GET /api/v1/library/inventory/ (auth user)", "/api/v1/library/inventory/", True),
            (f"GET /api/v1/library/inventory/{inv_id}/chapters/?include_content=false", f"/api/v1/library/inventory/{inv_id}/chapters/?include_content=false", True),
            (f"GET /api/v1/library/inventory/{inv_id}/chapters/?order=1", f"/api/v1/library/inventory/{inv_id}/chapters/?order=1", True),
        ])

    print("\n| Endpoint | Status | Queries | Times (ms: t1, t2, t3 -> min / median) | Payload (bytes) | Items/Count |")
    print("|---|---|---|---|---|---|")

    for name, url, auth in endpoints:
        if auth:
            client.force_login(user)
        else:
            client.logout()

        # Warmup run
        _ = client.get(url)
        
        times = []
        q_count = 0
        payload_size = 0
        resp_status = 0
        summary_info = ""

        for _ in range(3):
            reset_queries()
            t0 = time.perf_counter()
            resp = client.get(url)
            t1 = time.perf_counter()
            times.append((t1 - t0) * 1000)
            q_count = len(connection.queries)
            resp_status = resp.status_code
            payload_size = len(resp.content)
            
            if hasattr(resp, 'data') and isinstance(resp.data, dict):
                if 'count' in resp.data:
                    summary_info = f"count={resp.data['count']}"
                elif 'results' in resp.data:
                    summary_info = f"results={len(resp.data['results'])}"
                elif 'chapters' in resp.data:
                    summary_info = f"chapters={len(resp.data['chapters'])}"
            elif hasattr(resp, 'data') and isinstance(resp.data, list):
                summary_info = f"len={len(resp.data)}"

        min_t = min(times)
        med_t = sorted(times)[1]
        print(f"| `{name}` | {resp_status} | {q_count} | {min_t:.1f} / {med_t:.1f} ({times[0]:.1f}, {times[1]:.1f}, {times[2]:.1f}) | {payload_size} B | {summary_info} |")

if __name__ == '__main__':
    run_benchmarks()

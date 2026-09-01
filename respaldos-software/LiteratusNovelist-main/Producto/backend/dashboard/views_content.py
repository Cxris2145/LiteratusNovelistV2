"""
Dashboard Content Views
Endpoints para la gestión de libros, autores y personajes.
"""
import os
import json
from io import BytesIO

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from django.utils.text import slugify
from django.db import transaction
from django.core.files.base import ContentFile

from catalog.models import Author, Book, BookAuthor, Edition, Chapter, Tag, Genre
from django.conf import settings
import requests

def upload_to_supabase_if_configured(file_data, upload_path, content_type):
    supabase_url = getattr(settings, 'SUPABASE_URL', os.getenv('SUPABASE_URL'))
    supabase_key = getattr(settings, 'SUPABASE_KEY', os.getenv('SUPABASE_KEY'))
    if not supabase_url or not supabase_key:
        return
        
    url = f"{supabase_url}/storage/v1/object/literatus-media/{upload_path}"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": content_type
    }
    try:
        requests.post(url, headers=headers, data=file_data)
    except Exception as e:
        print(f"Error subiendo a Supabase: {e}")

def backup_book_to_media(book):
    book_dir = os.path.join(settings.MEDIA_ROOT, 'books', str(book.pk))
    os.makedirs(book_dir, exist_ok=True)
    
    meta = {
        'id': str(book.pk),
        'title': book.title,
        'slug': book.slug,
        'synopsis': book.synopsis,
        'authors': [a.full_name for a in book.authors.all()],
        'tags': [t.name for t in book.tags.all()],
        'chapters_count': book.chapters.count()
    }
    with open(os.path.join(book_dir, 'metadata.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        
    chapters_dir = os.path.join(book_dir, 'chapters')
    os.makedirs(chapters_dir, exist_ok=True)
    for chap in book.chapters.all():
        chap_path = os.path.join(chapters_dir, f'chapter_{chap.order}.html')
        with open(chap_path, 'w', encoding='utf-8') as f:
            f.write(f"<h1>{chap.title}</h1>\n{chap.content_html}")



# ─────────────────────────────────────────────
# LIBROS
# ─────────────────────────────────────────────

class BookListAdminView(APIView):
    """
    GET  /api/dashboard/books/        → Listado completo de libros para el admin
    POST /api/dashboard/books/create/ → Crear libro básico (sin EPUB)
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from django.db.models import Count
        books = Book.objects.annotate(
            anno_editions_count=Count('editions', distinct=True),
            anno_chapters_count=Count('chapters', distinct=True)
        ).prefetch_related('authors').order_by('-created_at')
        
        data = [
            {
                'id': str(b.pk),
                'title': b.title,
                'slug': b.slug,
                'is_published': b.is_published,
                'is_featured': b.is_featured,
                'authors': [a.full_name for a in b.authors.all()],
                'cover': request.build_absolute_uri(b.cover_image.url) if b.cover_image else None,
                'editions_count': b.anno_editions_count,
                'chapters_count': b.anno_chapters_count,
                'view_count': b.view_count,
            }
            for b in books
        ]
        return Response(data)


class EpubParseView(APIView):
    """
    POST /api/dashboard/books/parse-epub/
    Recibe un archivo EPUB y devuelve sus capítulos en JSON para edición.
    NO guarda nada en la base de datos aún.
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        epub_file = request.FILES.get('epub')
        if not epub_file:
            return Response({'error': 'No se recibió ningún archivo EPUB.'}, status=400)

        try:
            content = epub_file.read()
            book_epub = epub.read_epub(BytesIO(content))
            meta_title = book_epub.get_metadata('DC', 'title')
            meta_author = book_epub.get_metadata('DC', 'creator')

            chapters = []
            order = 1
            for item in book_epub.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                name = item.get_name().lower()
                if any(x in name for x in ['cover', 'titlepage', 'nav', 'toc']):
                    continue

                raw = item.get_body_content().decode('utf-8', errors='ignore')
                soup = BeautifulSoup(raw, 'html.parser')
                text_only = soup.get_text(separator=' ', strip=True)

                if len(text_only) > 100:
                    title_tag = soup.find('h1') or soup.find('h2') or soup.find('h3')
                    chapter_title = title_tag.text.strip() if title_tag else f'Capítulo {order}'
                    chapters.append({
                        'order': order,
                        'title': chapter_title[:200],
                        'content_html': str(soup),
                        'word_count': len(text_only.split()),
                    })
                    order += 1

            return Response({
                'detected_title': meta_title[0][0] if meta_title else '',
                'detected_author': meta_author[0][0] if meta_author else '',
                'chapters_count': len(chapters),
                'chapters': chapters,
            })
        except Exception as e:
            return Response({'error': str(e)}, status=500)


class BookSaveView(APIView):
    """
    POST /api/dashboard/books/save/
    Guarda un libro completo con EPUB, metadatos, capítulos y portada.
    Estructura: media/books/{book_id}/cover.jpg, book.epub, chapters/
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        data = request.data
        epub_file = request.FILES.get('epub')
        cover_file = request.FILES.get('cover')
        pdf_file = request.FILES.get('pdf_file')

        if not epub_file:
            return Response({'error': 'Se requiere el archivo EPUB.'}, status=400)

        try:
            chapters_json = data.get('chapters', '[]')
            if isinstance(chapters_json, str):
                chapters_raw = json.loads(chapters_json)
            else:
                chapters_raw = chapters_json

            with transaction.atomic():
                # 1. Autor
                author_id = data.get('author_id')
                if author_id:
                    try:
                        author = Author.objects.get(pk=author_id)
                    except Author.DoesNotExist:
                        return Response({'error': 'Autor seleccionado no existe.'}, status=400)
                else:
                    author_name = data.get('author_name', 'Anónimo')
                    author, _ = Author.objects.get_or_create(
                        slug=slugify(author_name),
                        defaults={
                            'full_name': author_name,
                            'bio': data.get('author_bio', ''),
                        }
                    )
    

                # 2. Libro
                title = data.get('title', 'Sin título')
                base_slug = slugify(title)
                book_slug = base_slug
                counter = 1
                while Book.objects.filter(slug=book_slug).exists():
                    book_slug = f"{base_slug}-{counter}"
                    counter += 1

                book = Book.objects.create(
                    title=title,
                    slug=book_slug,
                    synopsis=data.get('synopsis', ''),
                    status=data.get('status', Book.StatusChoices.DRAFT),
                    difficulty_level=data.get('difficulty_level', Book.DifficultyChoices.INTERMEDIATE),
                    copyright_notice=data.get('copyright_notice', ''),
                    is_published=data.get('is_published', 'true').lower() == 'true',
                    is_featured=data.get('is_featured', 'false').lower() == 'true',
                )

                # PDF Opcional
                if pdf_file:
                    book.pdf_file.save(f'book_{book.pk}.pdf', pdf_file, save=True)
                    # upload_to_supabase_if_configured(pdf_file.read(), book.pdf_file.name, pdf_file.content_type)

                # Portada
                if cover_file:
                    book.cover_image.save(f'cover_{book.pk}.jpg', cover_file, save=True)
                    cover_file.seek(0)
                    upload_to_supabase_if_configured(cover_file.read(), book.cover_image.name, cover_file.content_type)

                BookAuthor.objects.get_or_create(book=book, author=author)

                # Tags
                tags_raw = data.get('tags', '')
                if tags_raw:
                    for tag_name in [t.strip() for t in tags_raw.split(',') if t.strip()]:
                        t_slug = slugify(tag_name)[:150]
                        if t_slug:
                            tag, _ = Tag.objects.get_or_create(
                                slug=t_slug,
                                defaults={'name': tag_name[:150]}
                            )
                            book.tags.add(tag)
                
                # Géneros (Categorías)
                genres_json = data.get('genres')
                if genres_json:
                    try:
                        genre_ids = json.loads(genres_json) if isinstance(genres_json, str) else genres_json
                        if genre_ids:
                            book.genres.set(genre_ids)
                    except Exception as ge:
                        print(f"Error procesando géneros: {ge}")

                # 3. Edición con EPUB
                epub_bytes = epub_file.read()
                edition = Edition.objects.create(
                    book=book,
                    format=Edition.FormatChoices.EPUB,
                    language=data.get('language', 'es')[:10],
                    price=float(data.get('price', 990)),
                    publisher=data.get('publisher', 'Literatus Novelist'),
                )
                edition.file.save(f'book_{book.pk}.epub', ContentFile(epub_bytes), save=True)

                # 4. Capítulos
                for chap in chapters_raw:
                    Chapter.objects.create(
                        book=book,
                        title=chap.get('title', 'Sin título')[:200],
                        order=chap.get('order', 1),
                        content_html=chap.get('content_html', ''),
                    )

                backup_book_to_media(book)

            return Response({
                'success': True,
                'book_id': str(book.pk),
                'book_slug': book.slug,
                'chapters_saved': len(chapters_raw),
                'message': f'"{title}" guardado exitosamente con {len(chapters_raw)} capítulos.',
            }, status=201)

        except Exception as e:
            return Response({'error': str(e)}, status=500)


class BookDetailAdminView(APIView):
    """
    GET  /api/dashboard/books/{pk}/  → Detalle completo para edición
    PUT  /api/dashboard/books/{pk}/  → Actualizar metadatos
    DELETE /api/dashboard/books/{pk}/ → Eliminar libro
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        try:
            book = Book.objects.prefetch_related(
                'authors', 'editions__avatars', 'chapters', 'tags'
            ).get(pk=pk)
        except Book.DoesNotExist:
            return Response({'error': 'Libro no encontrado'}, status=404)

        # Edición principal para metadatos
        main_edition = book.editions.first()

        # Obtener personajes de TODAS las ediciones del libro
        avatars = []
        for ed in book.editions.all():
            for av in ed.avatars.all():
                avatars.append({
                    'id': str(av.pk),
                    'edition_id': str(ed.pk),
                    'name': str(av.name),
                    'description': str(av.description),
                    'system_prompt': str(av.system_prompt),
                    'behavioral_context': str(av.behavioral_context),
                    'sample_dialogues': str(av.sample_dialogues),
                    'greeting_message': str(av.greeting_message),
                    'unlock_at_chapter': av.unlock_at_chapter,
                    'is_major_character': av.is_major_character,
                    'is_author': av.is_author,
                    'avatar_image': request.build_absolute_uri(av.avatar_image.url) if av.avatar_image else None,
                })

        return Response({
            'id': str(book.pk),
            'title': book.title,
            'slug': book.slug,
            'synopsis': book.synopsis,
            'difficulty_level': book.difficulty_level,
            'copyright_notice': book.copyright_notice,
            'is_published': book.is_published,
            'is_featured': book.is_featured,
            'cover': request.build_absolute_uri(book.cover_image.url) if book.cover_image else None,
            'pdf_file': request.build_absolute_uri(book.pdf_file.url) if book.pdf_file else None,
            'authors': [{'id': str(a.pk), 'name': a.full_name} for a in book.authors.all()],
            'tags': [t.name for t in book.tags.all()],
            'chapters': [
                {
                    'id': str(c.pk), 
                    'order': c.order, 
                    'title': c.title,
                    'content_html': c.content_html,
                    'word_count': len(c.content_html.split()) if c.content_html else 0
                }
                for c in book.chapters.order_by('order')
            ],
            'avatars': avatars,
            'edition': {
                'id': str(main_edition.pk),
                'format': main_edition.format,
                'price': str(main_edition.price),
                'language': main_edition.language,
            } if main_edition else None,
        })

    def put(self, request, pk):
        try:
            book = Book.objects.get(pk=pk)
        except Book.DoesNotExist:
            return Response({'error': 'Libro no encontrado'}, status=404)

        data = request.data
        
        with transaction.atomic():
            if 'title' in data:
                book.title = data['title']
            if 'synopsis' in data:
                book.synopsis = data['synopsis']
            
            if 'is_published' in data:
                book.is_published = str(data['is_published']).lower() == 'true'
            if 'is_featured' in data:
                book.is_featured = str(data['is_featured']).lower() == 'true'
            if 'status' in data:
                book.status = data['status']
            if 'difficulty_level' in data:
                book.difficulty_level = data['difficulty_level']
            if 'copyright_notice' in data:
                book.copyright_notice = data['copyright_notice']
            
            # PDF Opcional
            pdf_file = request.FILES.get('pdf_file')
            if pdf_file:
                book.pdf_file.save(f'book_{book.pk}.pdf', pdf_file, save=True)
                pdf_file.seek(0)
                upload_to_supabase_if_configured(pdf_file.read(), book.pdf_file.name, pdf_file.content_type)
            
            # Actualizar autor
            author_id = data.get('author_id')
            if author_id:
                try:
                    author = Author.objects.get(pk=author_id)
                    # Por ahora reemplazamos todos los autores por este (simplificación)
                    BookAuthor.objects.filter(book=book).delete()
                    BookAuthor.objects.create(book=book, author=author)
                except Author.DoesNotExist:
                    pass

            # Actualizar géneros
            genres_json = data.get('genres')
            if genres_json:
                try:
                    genre_ids = json.loads(genres_json) if isinstance(genres_json, str) else genres_json
                    book.genres.set(genre_ids)
                except Exception as ge:
                    print(f"Error actualizando géneros: {ge}")

            book.save()

            # Actualizar metadatos de la edición (Precio e Idioma)
            edition = book.editions.first()
            if edition:
                if 'price' in data:
                    try:
                        # Limpiamos el valor (por si viene con coma de la UI) y convertimos a float
                        price_val = str(data['price']).replace(',', '.')
                        edition.price = float(price_val)
                    except (ValueError, TypeError):
                        pass
                if 'language' in data:
                    edition.language = data['language'][:10]
                edition.save()

            # Portada
            cover_file = request.FILES.get('cover')
            if cover_file:
                book.cover_image.save(f'cover_{book.pk}.jpg', cover_file, save=True)
                cover_file.seek(0)
                upload_to_supabase_if_configured(cover_file.read(), book.cover_image.name, cover_file.content_type)

            # EPUB
            epub_file = request.FILES.get('epub')
            if epub_file:
                edition = book.editions.first()
                if not edition:
                    edition = Edition.objects.create(
                        book=book,
                        format=Edition.FormatChoices.EPUB,
                        language=data.get('language', 'es')[:10],
                        price=float(data.get('price', 990))
                    )
                edition.file.save(f'book_{book.pk}.epub', ContentFile(epub_file.read()), save=True)

            # Actualizar capítulos
            chapters_json = data.get('chapters')
            if chapters_json:
                if isinstance(chapters_json, str):
                    chapters_raw = json.loads(chapters_json)
                else:
                    chapters_raw = chapters_json
                
                # Obtenemos los capítulos actuales mapeados por orden para comparar
                existing_chapters = {c.order: c for c in book.chapters.all()}
                new_orders = []

                for chap in chapters_raw:
                    order = chap.get('order', 1)
                    new_orders.append(order)
                    if order in existing_chapters:
                        # Actualizar existente
                        c = existing_chapters[order]
                        c.title = chap.get('title', 'Sin título')[:200]
                        c.content_html = chap.get('content_html', '')
                        c.save()
                    else:
                        # Crear nuevo
                        Chapter.objects.create(
                            book=book,
                            title=chap.get('title', 'Sin título')[:200],
                            order=order,
                            content_html=chap.get('content_html', ''),
                        )
                
                # Eliminar los que ya no vienen en la lista
                chapters_to_delete = [c.pk for order, c in existing_chapters.items() if order not in new_orders]
                if chapters_to_delete:
                    Chapter.objects.filter(pk__in=chapters_to_delete).delete()

            backup_book_to_media(book)

        return Response({'success': True, 'message': 'Libro actualizado y sincronizado correctamente.'})

    def delete(self, request, pk):
        try:
            book = Book.objects.get(pk=pk)
            title = book.title
            book.delete()
            return Response({'success': True, 'message': f'"{title}" eliminado.'})
        except Book.DoesNotExist:
            return Response({'error': 'Libro no encontrado'}, status=404)


# ─────────────────────────────────────────────
# AUTORES
# ─────────────────────────────────────────────

class AuthorListAdminView(APIView):
    """GET/POST /api/dashboard/authors/"""
    permission_classes = [IsAdminUser]

    def get(self, request):
        authors = Author.objects.annotate(books_count=Count('books')).order_by('full_name')
        return Response([
            {
                'id': str(a.pk),
                'full_name': a.full_name,
                'slug': a.slug,
                'bio': a.bio,
                'nationality': a.nationality,
                'birth_year': a.birth_year,
                'death_year': a.death_year,
                'wikipedia_url': a.wikipedia_url,
                'themes': a.themes,
                'books_count': a.books_count,
                'photo': request.build_absolute_uri(a.photo.url) if hasattr(a, 'photo') and a.photo else None,
            }
            for a in authors
        ])

    def post(self, request):
        name = request.data.get('full_name', '').strip()
        if not name:
            return Response({'error': 'El nombre es requerido.'}, status=400)
            
        author_data = {
            'full_name': name,
            'bio': request.data.get('bio', ''),
            'nationality': request.data.get('nationality', ''),
            'birth_year': request.data.get('birth_year') or None,
            'death_year': request.data.get('death_year') or None,
            'wikipedia_url': request.data.get('wikipedia_url', ''),
            'themes': request.data.get('themes', ''),
        }
        
        # Si viene ID, intentamos recuperar
        author_id = request.data.get('id')
        if author_id:
            try:
                author = Author.objects.get(pk=author_id)
                for key, value in author_data.items():
                    setattr(author, key, value)
                author.save()
                created = False
            except Author.DoesNotExist:
                return Response({'error': 'Autor no encontrado.'}, status=404)
        else:
            author, created = Author.objects.get_or_create(
                slug=slugify(name),
                defaults=author_data
            )
            
        # Procesar foto si viene
        photo = request.FILES.get('photo')
        if photo:
            author.photo.save(f'author_{author.pk}.jpg', photo, save=True)
            
        return Response({
            'id': str(author.pk),
            'full_name': author.full_name,
            'created': created,
        }, status=201 if created else 200)

class AuthorDetailAdminView(APIView):
    """GET/PUT/DELETE /api/dashboard/authors/{pk}/"""
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        try:
            a = Author.objects.annotate(books_count=Count('books')).get(pk=pk)
            # Obtener libros del autor para el preview
            books_data = [
                {
                    'id': str(b.pk),
                    'title': b.title,
                    'cover': request.build_absolute_uri(b.cover_image.url) if b.cover_image else None,
                    'synopsis': b.synopsis[:200] + '...' if len(b.synopsis) > 200 else b.synopsis
                }
                for b in a.books.all()
            ]
            
            return Response({
                'id': str(a.pk),
                'full_name': a.full_name,
                'slug': a.slug,
                'bio': a.bio,
                'nationality': a.nationality,
                'birth_year': a.birth_year,
                'death_year': a.death_year,
                'wikipedia_url': a.wikipedia_url,
                'themes': a.themes,
                'books_count': a.books_count,
                'books': books_data,
                'photo': request.build_absolute_uri(a.photo.url) if a.photo else None,
            })
        except Author.DoesNotExist:
            return Response({'error': 'Autor no encontrado.'}, status=404)

    def put(self, request, pk):
        try:
            author = Author.objects.get(pk=pk)
        except Author.DoesNotExist:
            return Response({'error': 'Autor no encontrado.'}, status=404)
            
        data = request.data
        if 'full_name' in data: author.full_name = data['full_name']
        if 'bio' in data: author.bio = data['bio']
        if 'nationality' in data: author.nationality = data['nationality']
        if 'birth_year' in data: author.birth_year = data['birth_year'] or None
        if 'death_year' in data: author.death_year = data['death_year'] or None
        if 'wikipedia_url' in data: author.wikipedia_url = data['wikipedia_url']
        if 'themes' in data: author.themes = data['themes']
        
        author.save()
        
        photo = request.FILES.get('photo')
        if photo:
            author.photo.save(f'author_{author.pk}.jpg', photo, save=True)
            photo.seek(0)
            upload_to_supabase_if_configured(photo.read(), author.photo.name, photo.content_type)
            
        return Response({'success': True})

    def delete(self, request, pk):
        try:
            Author.objects.get(pk=pk).delete()
            return Response({'success': True})
        except Author.DoesNotExist:
            return Response({'error': 'Autor no encontrado.'}, status=404)
    


# ─────────────────────────────────────────────
# AVATARES / PERSONAJES
# ─────────────────────────────────────────────

class AvatarAdminView(APIView):
    """
    POST /api/dashboard/avatars/         → Crear personaje
    PUT  /api/dashboard/avatars/{pk}/    → Editar personaje
    DELETE /api/dashboard/avatars/{pk}/ → Eliminar personaje
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        from ai_engine.models import AIAvatar
        edition_id = request.data.get('edition_id')
        if not edition_id:
            return Response({'error': 'edition_id requerido.'}, status=400)
        try:
            edition = Edition.objects.get(pk=edition_id)
        except Edition.DoesNotExist:
            return Response({'error': 'Edición no encontrada.'}, status=404)

        avatar = AIAvatar.objects.create(
            edition=edition,
            name=request.data.get('name', 'Personaje')[:100],
            description=request.data.get('description', ''),
            system_prompt=request.data.get('system_prompt', ''),
            behavioral_context=request.data.get('behavioral_context', ''),
            sample_dialogues=request.data.get('sample_dialogues', ''),
            greeting_message=request.data.get('greeting_message', '¡Hola!'),
            unlock_at_chapter=int(request.data.get('unlock_at_chapter', 0)),
            is_major_character=request.data.get('is_major_character', 'true').lower() == 'true',
            is_author=request.data.get('is_author', 'false').lower() == 'true',
        )
        img = request.FILES.get('avatar_image')
        if img:
            avatar.avatar_image.save(f'avatar_{avatar.pk}.jpg', img, save=True)
            img.seek(0)
            upload_to_supabase_if_configured(img.read(), avatar.avatar_image.name, img.content_type)

        return Response({'id': str(avatar.pk), 'name': avatar.name}, status=201)

    def get(self, request, pk):
        from ai_engine.models import AIAvatar
        try:
            av = AIAvatar.objects.select_related('edition').get(pk=pk)
        except AIAvatar.DoesNotExist:
            return Response({'error': 'Personaje no encontrado.'}, status=404)

        avatar_url = request.build_absolute_uri(av.avatar_image.url) if av.avatar_image and av.avatar_image.name else None
        sp1 = request.build_absolute_uri(av.image_speaking_1.url) if av.image_speaking_1 and av.image_speaking_1.name else None
        sp2 = request.build_absolute_uri(av.image_speaking_2.url) if av.image_speaking_2 and av.image_speaking_2.name else None
        sp3 = request.build_absolute_uri(av.image_speaking_3.url) if av.image_speaking_3 and av.image_speaking_3.name else None
        thk = request.build_absolute_uri(av.image_thinking.url) if av.image_thinking and av.image_thinking.name else None

        if avatar_url and 'manga_assets' in avatar_url:
            base_url = avatar_url.rsplit('/', 1)[0] + '/'
            if not sp1: sp1 = base_url + 'talking_1.webp'
            if not sp2: sp2 = base_url + 'talking_2.webp'
            if not sp3: sp3 = base_url + 'talking_3.webp'
            if not thk: thk = base_url + 'thinking.webp'

        return Response({
            'id': str(av.pk),
            'edition_id': str(av.edition.pk),
            'name': str(av.name),
            'description': str(av.description),
            'system_prompt': str(av.system_prompt),
            'behavioral_context': str(av.behavioral_context),
            'sample_dialogues': str(av.sample_dialogues),
            'greeting_message': str(av.greeting_message),
            'temperature': float(av.temperature),
            'model_name': str(av.model_name),
            'unlock_at_chapter': av.unlock_at_chapter,
            'is_major_character': av.is_major_character,
            'is_author': av.is_author,
            'chat_count': av.chat_count,
            'avatar_image': avatar_url,
            'image_speaking_1': sp1,
            'image_speaking_2': sp2,
            'image_speaking_3': sp3,
            'image_thinking': thk,
        })

    def put(self, request, pk):
        from ai_engine.models import AIAvatar
        try:
            avatar = AIAvatar.objects.get(pk=pk)
        except AIAvatar.DoesNotExist:
            return Response({'error': 'Personaje no encontrado.'}, status=404)

        avatar.name = request.data.get('name', avatar.name)[:100]
        avatar.description = request.data.get('description', avatar.description)
        avatar.system_prompt = request.data.get('system_prompt', avatar.system_prompt)
        avatar.behavioral_context = request.data.get('behavioral_context', avatar.behavioral_context)
        avatar.sample_dialogues = request.data.get('sample_dialogues', avatar.sample_dialogues)
        avatar.greeting_message = request.data.get('greeting_message', avatar.greeting_message)
        if 'unlock_at_chapter' in request.data:
            avatar.unlock_at_chapter = int(request.data['unlock_at_chapter'])
        if 'is_major_character' in request.data:
            avatar.is_major_character = str(request.data['is_major_character']).lower() == 'true'
        if 'temperature' in request.data:
            try:
                avatar.temperature = float(request.data['temperature'])
            except (ValueError, TypeError):
                pass
        if 'model_name' in request.data:
            avatar.model_name = request.data['model_name'][:100]
        avatar.save()

        img = request.FILES.get('avatar_image')
        if img:
            avatar.avatar_image.save(f'avatar_{avatar.pk}.jpg', img, save=True)
            img.seek(0)
            upload_to_supabase_if_configured(img.read(), avatar.avatar_image.name, img.content_type)

        img_speaking_1 = request.FILES.get('image_speaking_1')
        if img_speaking_1:
            avatar.image_speaking_1.save(f'avatar_speaking_1_{avatar.pk}.jpg', img_speaking_1, save=True)
            img_speaking_1.seek(0)
            upload_to_supabase_if_configured(img_speaking_1.read(), avatar.image_speaking_1.name, img_speaking_1.content_type)

        img_speaking_2 = request.FILES.get('image_speaking_2')
        if img_speaking_2:
            avatar.image_speaking_2.save(f'avatar_speaking_2_{avatar.pk}.jpg', img_speaking_2, save=True)
            img_speaking_2.seek(0)
            upload_to_supabase_if_configured(img_speaking_2.read(), avatar.image_speaking_2.name, img_speaking_2.content_type)

        img_speaking_3 = request.FILES.get('image_speaking_3')
        if img_speaking_3:
            avatar.image_speaking_3.save(f'avatar_speaking_3_{avatar.pk}.jpg', img_speaking_3, save=True)
            img_speaking_3.seek(0)
            upload_to_supabase_if_configured(img_speaking_3.read(), avatar.image_speaking_3.name, img_speaking_3.content_type)

        img_thinking = request.FILES.get('image_thinking')
        if img_thinking:
            avatar.image_thinking.save(f'avatar_thinking_{avatar.pk}.jpg', img_thinking, save=True)
            img_thinking.seek(0)
            upload_to_supabase_if_configured(img_thinking.read(), avatar.image_thinking.name, img_thinking.content_type)

        return Response({'success': True})

    def delete(self, request, pk):
        from ai_engine.models import AIAvatar
        try:
            AIAvatar.objects.get(pk=pk).delete()
            return Response({'success': True})
        except AIAvatar.DoesNotExist:
            return Response({'error': 'Personaje no encontrado.'}, status=404)


# Importar Count que faltaba arriba
from django.db.models import Count

class AvatarListGlobalAdminView(APIView):
    """
    GET /api/dashboard/avatars/all/
    Lista todos los personajes independientemente del libro o edición.
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from ai_engine.models import AIAvatar
        avatars = AIAvatar.objects.select_related('edition__book').order_by('-created_at')
        return Response([
            {
                'id': str(av.pk),
                'name': av.name,
                'book_title': av.edition.book.title if av.edition and av.edition.book else 'Sin Libro',
                'book_id': str(av.edition.book.pk) if av.edition and av.edition.book else None,
                'is_major_character': av.is_major_character,
                'chat_count': av.chat_count,
                'avatar_image': request.build_absolute_uri(av.avatar_image.url) if av.avatar_image else None,
            }
            for av in avatars
        ])

from django.core.files.storage import default_storage
import uuid

class UploadChapterImageView(APIView):
    """
    POST /api/dashboard/books/upload-image/
    Sube una imagen de escena para inyectar en el contenido del capítulo.
    """
    permission_classes = [IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        img_file = request.FILES.get('image')
        if not img_file:
            return Response({'error': 'No image provided'}, status=400)
            
        ext = img_file.name.split('.')[-1]
        filename = f"chapter_scenes/scene_{uuid.uuid4().hex}.{ext}"
        
        saved_path = default_storage.save(filename, img_file)
        
        # Sincronizar con Supabase si está configurado
        img_file.seek(0)
        upload_to_supabase_if_configured(img_file.read(), saved_path, img_file.content_type)
        
        # Devolver URL absoluta
        url = request.build_absolute_uri(f"{settings.MEDIA_URL}{saved_path}")
        
        return Response({'url': url}, status=201)

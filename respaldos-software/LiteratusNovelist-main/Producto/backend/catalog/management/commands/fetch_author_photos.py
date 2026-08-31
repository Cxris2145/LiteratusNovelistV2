"""
catalog/management/commands/fetch_author_photos.py

Busca, descarga, optimiza y asocia fotos y retratos para todos los autores
en Literatus Novelist utilizando Wikipedia / Wikimedia Commons y fuentes de dominio público.
"""

import os
import sys
import json
import time
import re
import urllib.request
import urllib.parse
from io import BytesIO
from pathlib import Path
from PIL import Image

from django.core.management.base import BaseCommand
from django.conf import settings
from catalog.models import Author


class Command(BaseCommand):
    help = "Busca, descarga y asigna retratos fotográficos a todos los autores del catálogo."

    def add_arguments(self, parser):
        parser.add_argument('--all', action='store_true', help='Re-procesa autores aunque ya tengan foto.')
        parser.add_argument('--dry-run', action='store_true', help='Simula la búsqueda sin guardar archivos ni BD.')
        parser.add_argument('--limit', type=int, default=None, help='Límite de autores a procesar.')
        parser.add_argument('--slug', type=str, default=None, help='Procesa solo un autor específico por slug.')
        parser.add_argument('--fill-bio', action='store_true', default=True, help='Rellena biografía y Wikipedia URL si están vacías.')

    def safe_write(self, msg, style_func=None):
        try:
            if style_func:
                self.stdout.write(style_func(msg))
            else:
                self.stdout.write(msg)
        except UnicodeEncodeError:
            clean_msg = msg.encode('ascii', errors='replace').decode('ascii')
            if style_func:
                self.stdout.write(style_func(clean_msg))
            else:
                self.stdout.write(clean_msg)

    def normalize_name_for_search(self, raw_name):
        """Normaliza nombres invertidos tipo 'Pérez Galdós, Benito' -> 'Benito Pérez Galdós'."""
        name = raw_name.strip()
        if ',' in name:
            parts = [p.strip() for p in name.split(',', 1)]
            if len(parts) == 2 and parts[0] and parts[1]:
                return f"{parts[1]} {parts[0]}"
        return name

    def fetch_wikipedia_portrait(self, name):
        """
        Busca un retrato en Wikipedia en español e inglés.
        Retorna (image_url, wiki_page_title, wiki_url, extract_bio, birth_year, death_year)
        """
        headers = {
            'User-Agent': 'LiteratusNovelistBot/1.0 (https://literatus.app; contact: info@literatus.app)'
        }
        
        search_candidates = [name]
        normalized = self.normalize_name_for_search(name)
        if normalized != name:
            search_candidates.insert(0, normalized)

        # Si tiene 'de' o minúsculas, probar con Title Case
        title_cased = name.title()
        if title_cased not in search_candidates:
            search_candidates.append(title_cased)

        for candidate in search_candidates:
            for lang in ['es', 'en']:
                # 1. Intento directo por Page Summary
                sum_url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(candidate)}"
                try:
                    req = urllib.request.Request(sum_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=6) as resp:
                        if resp.status == 200:
                            data = json.loads(resp.read().decode('utf-8'))
                            img_url = data.get('thumbnail', {}).get('source') or data.get('originalimage', {}).get('source')
                            if img_url:
                                page_url = data.get('content_urls', {}).get('desktop', {}).get('page', '')
                                extract = data.get('extract', '')
                                return img_url, data.get('title', candidate), page_url, extract
                except Exception:
                    pass

                # 2. Búsqueda semántica en la API de Wikipedia
                search_url = f"https://{lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(candidate)}&utf8=&format=json"
                try:
                    req = urllib.request.Request(search_url, headers=headers)
                    with urllib.request.urlopen(req, timeout=6) as resp:
                        if resp.status == 200:
                            data = json.loads(resp.read().decode('utf-8'))
                            search_results = data.get('query', {}).get('search', [])
                            if search_results:
                                page_title = search_results[0]['title']
                                sum2_url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(page_title)}"
                                req2 = urllib.request.Request(sum2_url, headers=headers)
                                with urllib.request.urlopen(req2, timeout=6) as resp2:
                                    sum_data = json.loads(resp2.read().decode('utf-8'))
                                    img_url = sum_data.get('thumbnail', {}).get('source') or sum_data.get('originalimage', {}).get('source')
                                    if img_url:
                                        page_url = sum_data.get('content_urls', {}).get('desktop', {}).get('page', '')
                                        extract = sum_data.get('extract', '')
                                        return img_url, page_title, page_url, extract
                except Exception:
                    pass

        return None, None, None, None

    def optimize_and_save_portrait(self, img_url, author_slug, photos_dir):
        """
        Descarga la imagen remota, la recorta/redimensiona manteniendo proporciones
        y la guarda como un WebP de alta calidad en authors/photos/<slug>.webp
        """
        headers = {'User-Agent': 'LiteratusNovelistBot/1.0 (contact: info@literatus.app)'}
        req = urllib.request.Request(img_url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=10) as resp:
            img_data = resp.read()

        img = Image.open(BytesIO(img_data))
        
        # Convertir a RGB si es necesario (RGBA, P, etc.)
        if img.mode in ('RGBA', 'LA', 'P'):
            rgb_img = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            rgb_img.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = rgb_img
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Redimensionar a retrato estándar (400x500 px aprox, max ancho 500)
        target_width = 400
        target_height = 500

        # Smart center-crop manteniendo proporción 4:5
        orig_w, orig_h = img.size
        aspect_target = target_width / target_height
        aspect_orig = orig_w / orig_h

        if aspect_orig > aspect_target:
            # Muy ancha: recortar laterales
            new_w = int(orig_h * aspect_target)
            offset_x = (orig_w - new_w) // 2
            img = img.crop((offset_x, 0, offset_x + new_w, orig_h))
        else:
            # Muy alta: recortar más abajo (para enfocar rostro superior)
            new_h = int(orig_w / aspect_target)
            offset_y = int((orig_h - new_h) * 0.25) # 25% arriba, 75% abajo
            if offset_y + new_h > orig_h:
                offset_y = orig_h - new_h
            img = img.crop((0, offset_y, orig_w, offset_y + new_h))

        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

        out_filename = f"{author_slug}.webp"
        out_path = photos_dir / out_filename
        img.save(out_path, format='WEBP', quality=85, method=6)
        
        return f"authors/photos/{out_filename}"

    def handle(self, *args, **options):
        try:
            if hasattr(sys.stdout, 'reconfigure'):
                sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

        all_authors = options['all']
        dry_run = options['dry_run']
        limit = options['limit']
        slug = options['slug']
        fill_bio = options['fill_bio']

        media_root = Path(settings.MEDIA_ROOT)
        photos_dir = media_root / 'authors' / 'photos'
        if not dry_run:
            photos_dir.mkdir(parents=True, exist_ok=True)

        qs = Author.objects.all().order_by('full_name')
        if slug:
            qs = qs.filter(slug=slug)
        elif not all_authors:
            qs = qs.filter(photo='').exclude(full_name__iexact='Unknown').exclude(full_name__iexact='Desconocido')

        if limit:
            qs = qs[:limit]

        total_to_process = qs.count()
        self.safe_write(f"Iniciando descarga de retratos de autores ({total_to_process} autores seleccionados)...\n")

        found_count = 0
        missing_count = 0
        skipped_count = 0
        log_entries = []

        for idx, author in enumerate(qs, 1):
            name = author.full_name.strip()
            if not name or name.lower() in ('unknown', 'desconocido', 'autor desconocido', 'anonimo', 'anónimo'):
                skipped_count += 1
                continue

            self.safe_write(f"[{idx}/{total_to_process}] Buscando retrato para: {name} ({author.slug})...")

            img_url, wiki_title, wiki_url, extract_bio = self.fetch_wikipedia_portrait(name)

            if img_url:
                found_count += 1
                self.safe_write(f"  -> Encontrado en Wikipedia: '{wiki_title}'", self.style.SUCCESS)
                
                if not dry_run:
                    try:
                        rel_path = self.optimize_and_save_portrait(img_url, author.slug, photos_dir)
                        author.photo = rel_path
                        if fill_bio and extract_bio and not author.bio:
                            author.bio = extract_bio
                        if fill_bio and wiki_url and not author.wikipedia_url:
                            author.wikipedia_url = wiki_url
                        author.save()
                        self.safe_write(f"  -> Guardado: {rel_path}", self.style.SUCCESS)
                        log_entries.append({
                            'name': name,
                            'slug': author.slug,
                            'status': 'FOUND',
                            'photo': rel_path,
                            'wiki_title': wiki_title,
                            'wiki_url': wiki_url,
                        })
                    except Exception as e:
                        self.safe_write(f"  -> Error al guardar imagen: {e}", self.style.ERROR)
                        log_entries.append({
                            'name': name,
                            'slug': author.slug,
                            'status': 'ERROR',
                            'error': str(e)
                        })
                else:
                    self.safe_write(f"  -> [DRY-RUN] Foto encontrada: {img_url}")
            else:
                missing_count += 1
                self.safe_write(f"  -> No se encontró retrato automático.", self.style.WARNING)
                log_entries.append({
                    'name': name,
                    'slug': author.slug,
                    'status': 'NOT_FOUND'
                })

            time.sleep(0.15) # Cortesía hacia la API de Wikipedia

        # Escribir AUTHOR_PHOTOS_LOG.md
        if not dry_run:
            log_path = Path(settings.BASE_DIR).parent.parent / 'AUTHOR_PHOTOS_LOG.md'
            md_lines = [
                "# AUTHOR_PHOTOS_LOG.md",
                "## Registro de Asignación de Fotos y Retratos de Autores — Literatus Novelist\n",
                f"**Total procesados:** {total_to_process}  ",
                f"**Retratos asignados exitosamente:** {found_count}  ",
                f"**Sin retrato en Wikipedia:** {missing_count}  ",
                f"**Omitidos (anónimos/desconocidos):** {skipped_count}\n",
                "---\n",
                "| Autor | Slug | Estado | Retrato | Wikipedia |",
                "|---|---|---|---|---|",
            ]
            for entry in log_entries:
                st = entry.get('status', '')
                ph = f"`{entry.get('photo', '')}`" if entry.get('photo') else "-"
                wu = f"[{entry.get('wiki_title', 'Wiki')}]({entry.get('wiki_url', '')})" if entry.get('wiki_url') else "-"
                md_lines.append(f"| {entry.get('name')} | `{entry.get('slug')}` | `{st}` | {ph} | {wu} |")

            try:
                log_path.write_text("\n".join(md_lines), encoding='utf-8')
            except Exception:
                pass

        self.safe_write("\n" + "=" * 10 + " RESUMEN RETRATOS AUTORES " + "=" * 10)
        self.safe_write(f"Total autores procesados: {total_to_process}")
        self.safe_write(f"Retratos asignados: {found_count}", self.style.SUCCESS)
        self.safe_write(f"No encontrados: {missing_count}", self.style.WARNING)
        self.safe_write(f"Omitidos (Desconocidos): {skipped_count}\n")

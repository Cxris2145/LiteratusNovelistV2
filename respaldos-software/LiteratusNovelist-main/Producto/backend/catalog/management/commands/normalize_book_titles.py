import re
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify
from catalog.models import Book, Author, BookAuthor

ACCURATE_UPDATES = {
    # ── 11 LIBROS TEMPORALES (TMP) ──────────────────────────────────
    'fantasmagoria-carroll-lewis': {
        'title': 'Fantasmagoría',
        'author': 'Lewis Carroll',
    },
    'la-caza-del-snark-carroll-lewis': {
        'title': 'La caza del Snark',
        'author': 'Lewis Carroll',
    },
    'maria-antonieta-zweig-stefan': {
        'title': 'María Antonieta',
        'author': 'Stefan Zweig',
    },
    'rima-del-anciano-marinero-samuel-taylor-coleridge': {
        'title': 'Rima del anciano marinero',
        'author': 'Samuel Taylor Coleridge',
    },
    'para-verdades-el-tiempo-y-para-justicia-dios-zorrilla-jose': {
        'title': 'Para verdades el tiempo y para justicia Dios',
        'author': 'José Zorrilla',
    },
    'la-libertad-del-espiritu-valery-paul': {
        'title': 'La libertad del espíritu',
        'author': 'Paul Valéry',
    },
    'la-lucha-contra-el-demonio-zweig-stefan': {
        'title': 'La lucha contra el demonio',
        'author': 'Stefan Zweig',
    },
    'la-esfinge-de-los-hielos-verne-julio': {
        'title': 'La esfinge de los hielos',
        'author': 'Julio Verne',
    },
    'fernando-de-magallanes-zweig-stefan': {
        'title': 'Fernando de Magallanes',
        'author': 'Stefan Zweig',
    },
    'la-mujer-negra-zorrilla-jose': {
        'title': 'La mujer negra',
        'author': 'José Zorrilla',
    },
    'las-indias-negras-verne-julio': {
        'title': 'Las indias negras',
        'author': 'Julio Verne',
    },

    # ── AMBROSE BIERCE ───────────────────────────────────────────────
    'una-escaramuza-en-los-puestos-de-avanzada-bierce-ambrose': {
        'title': 'Una escaramuza en los puestos de avanzada',
        'author': 'Ambrose Bierce',
    },
    'una-pelea-dura-bierce-ambrose': {
        'title': 'Una pelea dura',
        'author': 'Ambrose Bierce',
    },
    'un-jinete-por-el-cielo-bierce-ambrose': {
        'title': 'Un jinete por el cielo',
        'author': 'Ambrose Bierce',
    },
    'un-camino-a-la-luz-de-la-luna-bierce-ambrose': {
        'title': 'Un camino a la luz de la luna',
        'author': 'Ambrose Bierce',
    },
    'parker-adderson-filosofo-bierce-ambrose': {
        'title': 'Parker Adderson, filósofo',
        'author': 'Ambrose Bierce',
    },
    'pueden-suceder-tales-cosas-bierce-ambrose': {
        'title': '¿Pueden suceder tales cosas?',
        'author': 'Ambrose Bierce',
    },
    'la-muerte-de-halpin-frayser-bierce-ambrose': {
        'title': 'La muerte de Halpin Frayser',
        'author': 'Ambrose Bierce',
    },
    'una-dama-de-redhorse-bierce-ambrose': {
        'title': 'Una dama de Redhorse',
        'author': 'Ambrose Bierce',
    },

    # ── CALDERÓN DE LA BARCA ─────────────────────────────────────────
    'la-vida-es-sueno-calderon-de-la-barca-pedro': {
        'title': 'La vida es sueño',
        'author': 'Calderón de la Barca',
    },
    'los-encantos-de-la-culpa-calderon-de-la-barca-pedro': {
        'title': 'Los encantos de la culpa',
        'author': 'Pedro Calderón de la Barca',
    },
    'no-hay-instante-sin-milagro-calderon-de-la-barca-pedro': {
        'title': 'No hay instante sin milagro',
        'author': 'Pedro Calderón de la Barca',
    },
    'pleito-matrimonial-del-cuerpo-y-alma-calderon-de-la-barca-pedro': {
        'title': 'El pleito matrimonial del cuerpo y el alma',
        'author': 'Pedro Calderón de la Barca',
    },
    'no-hay-burlas-con-el-amor-calderon-de-la-barca-pedro': {
        'title': 'No hay burlas con el amor',
        'author': 'Pedro Calderón de la Barca',
    },
    'la-aurora-en-copacabana-calderon-de-la-barca-pedro': {
        'title': 'La aurora en Copacabana',
        'author': 'Pedro Calderón de la Barca',
    },
    'los-cabellos-de-absalon-calderon-de-la-barca-pedro': {
        'title': 'Los cabellos de Absalón',
        'author': 'Pedro Calderón de la Barca',
    },
    'triunfar-muriendo-calderon-de-la-barca-pedro': {
        'title': 'Triunfar muriendo',
        'author': 'Pedro Calderón de la Barca',
    },

    # ── ESQUILO ──────────────────────────────────────────────────────
    'las-coeforas-esquilo': {
        'title': 'Las Coéforas',
        'author': 'Esquilo',
    },
    'las-eumenides-esquilo': {
        'title': 'Las Euménides',
        'author': 'Esquilo',
    },
    'las-suplicantes-esquilo': {
        'title': 'Las Suplicantes',
        'author': 'Esquilo',
    },

    # ── ROSALÍA DE CASTRO ────────────────────────────────────────────
    'follas-novas-rosalia-de-castro': {
        'title': 'Follas novas',
        'author': 'Rosalía de Castro',
    },
    'padron-y-las-inundaciones-rosalia-de-castro': {
        'title': 'Padrón y las inundaciones',
        'author': 'Rosalía de Castro',
    },

    # ── OTRAS OBRAS CLÁSICAS ─────────────────────────────────────────
    'fabulas-literarias-tomas-de-iriarte': {
        'title': 'Fábulas literarias',
        'author': 'Tomás de Iriarte',
    },
    'thanatopia-ruben-dario': {
        'title': 'Thanatopia',
        'author': 'Rubén Darío',
    },
    'la-ciudad-de-las-calaveras-robert-e-howard': {
        'title': 'La ciudad de las calaveras',
        'author': 'Robert Ervin Howard',
    },
    'memorias-de-un-medico-jose-balsamo-alejandro-dumas-padre': {
        'title': 'Memorias de un médico: Joseph Bálsamo',
        'author': 'Alejandro Dumas',
    },
    'la-corbeta-gloria-scott-conan-doyle-arthur': {
        'title': 'La corbeta "Gloria Scott"',
        'author': 'Arthur Conan Doyle',
    },
    'nota-sobre-la-supresion-general-de-los-partidos-politicos-simone-weil': {
        'title': 'Nota sobre la supresión general de los partidos políticos',
        'author': 'Simone Weil',
    },
    'la-importancia-de-llamarse-ernesto-wilde-oscar': {
        'title': 'La importancia de llamarse Ernesto',
        'author': 'Oscar Wilde',
    },
    'la-peste-escarlata-jack-london': {
        'title': 'La peste escarlata',
        'author': 'Jack London',
    },
    'mendizabal-benito-perez-galdos': {
        'title': 'Mendizábal: Episodios Nacionales',
        'author': 'Benito Pérez Galdós',
    },
    'un-voluntario-realista-benito-perez-galdos': {
        'title': 'Un voluntario realista: Episodios Nacionales',
        'author': 'Benito Pérez Galdós',
    },
}


class Command(BaseCommand):
    help = 'Normaliza titulos de libros eliminando guiones y nombres de autor residuales'

    def handle(self, *args, **options):
        self.stdout.write("Iniciando normalizacion de titulos de libros...\n")

        updated_count = 0

        with transaction.atomic():
            for slug, data in ACCURATE_UPDATES.items():
                target_title = data['title']
                author_name = data.get('author')

                # Buscar por slug exacto
                books = Book.objects.filter(slug=slug)
                if not books.exists():
                    # Si no encuentra por slug, buscar por título aproximado
                    books = Book.objects.filter(slug__startswith=slug[:25])

                for b in books:
                    old_title = b.title
                    if old_title != target_title:
                        # Actualizar título directo sin sobreescribir el slug existente
                        Book.objects.filter(pk=b.pk).update(title=target_title)
                        updated_count += 1
                        self.stdout.write(self.style.SUCCESS(
                            f"  [OK] [{str(b.id)[:8]}] '{old_title}' -> '{target_title}'"
                        ))

                    # Si tiene un autor asignado, verificar o asociar autor real
                    if author_name:
                        current_authors = [a.full_name for a in b.authors.all()]
                        # Si no tiene autor o es 'Autor Desconocido' / 'Unknown'
                        needs_author = (
                            len(current_authors) == 0 or
                            any(a.lower() in ('autor desconocido', 'unknown', 'desconocido') for a in current_authors)
                        )
                        if needs_author:
                            author_obj = Author.objects.filter(full_name__iexact=author_name).first()
                            if not author_obj:
                                author_obj = Author.objects.create(
                                    full_name=author_name,
                                    slug=slugify(author_name)
                                )
                            # Limpiar autores desconocidos
                            BookAuthor.objects.filter(
                                book=b,
                                author__full_name__in=['Autor Desconocido', 'Unknown', 'desconocido']
                            ).delete()
                            # Asignar autor real
                            BookAuthor.objects.get_or_create(
                                book=b,
                                author=author_obj,
                                defaults={'role': BookAuthor.RoleChoices.PRIMARY}
                            )
                            self.stdout.write(f"      + Autor asignado: {author_name}")

            # Casos especiales de autores adjuntos con coma o 'by'
            special_cases = [
                ('Dramas: La Esmeralda, Victor Hugo', 'Dramas: La Esmeralda', 'Victor Hugo'),
                ('María Tudor by Victor Hugo', 'María Tudor', 'Victor Hugo'),
                ('Los deseos ridículos, Charles Perrault', 'Los deseos ridículos', 'Charles Perrault'),
            ]
            for old_t, new_t, auth_n in special_cases:
                matches = Book.objects.filter(title__icontains=old_t[:15])
                for mb in matches:
                    if old_t.lower() in mb.title.lower():
                        Book.objects.filter(pk=mb.pk).update(title=new_t)
                        updated_count += 1
                        self.stdout.write(self.style.SUCCESS(f"  [OK] [{str(mb.id)[:8]}] '{mb.title}' -> '{new_t}'"))
                        # Asignar autor si no tiene o es desconocido
                        auth_obj = Author.objects.filter(full_name__iexact=auth_n).first()
                        if not auth_obj:
                            auth_obj = Author.objects.create(full_name=auth_n, slug=slugify(auth_n))
                        BookAuthor.objects.filter(book=mb, author__full_name__in=['Autor Desconocido', 'Unknown']).delete()
                        BookAuthor.objects.get_or_create(book=mb, author=auth_obj, defaults={'role': BookAuthor.RoleChoices.PRIMARY})

            # Limpieza adicional para cualquier libro con dobles espacios o prefijo 'by '
            extra_books = Book.objects.filter(title__contains='  ')
            for eb in extra_books:
                cleaned = re.sub(r'\s+', ' ', eb.title).strip()
                if cleaned != eb.title:
                    Book.objects.filter(pk=eb.pk).update(title=cleaned)
                    updated_count += 1
                    self.stdout.write(self.style.SUCCESS(f"  [OK] Espacios corregidos: '{eb.title}' -> '{cleaned}'"))

        self.stdout.write(self.style.SUCCESS(
            f"\nNormalizacion completada con exito! Total de libros actualizados: {updated_count}\n"
        ))

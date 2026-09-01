import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django

# Configurar el entorno de Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Author, Book, BookAuthor, Genre, Edition
from ai_engine.models import AIAvatar
from django.core.files.base import ContentFile

def seed_data():
    print("Iniciando la carga de datos (Seeding)...")

    # 1. Crear Género
    genre_cuento, _ = Genre.objects.get_or_create(
        name="Cuento Clásico",
        slug="cuento-clasico"
    )

    # 2. Crear Autor: Oscar Wilde
    author_wilde, created = Author.objects.get_or_create(
        full_name="Oscar Wilde",
        defaults={
            'bio': (
                "Oscar Fingal O'Flahertie Wills Wilde (Dublín, 1854 - París, 1900) fue un escritor, "
                "poeta y dramaturgo irlandés. Considerado uno de los dramaturgos más destacados del "
                "Londres victoriano tardío; además, fue una celebridad de la época debido a su gran "
                "ingenio y estética."
            )
        }
    )
    if created:
        print(f"Autor '{author_wilde.full_name}' creado.")

    # 3. Crear Libro: El Príncipe Feliz
    book_principe, created = Book.objects.get_or_create(
        title="El Príncipe Feliz",
        defaults={
            'synopsis': (
                "Una estatua dorada de un príncipe, cansado de ver el sufrimiento desde su pedestal, "
                "pide a una golondrina que reparta sus tesoros entre los pobres de la ciudad."
            )
        }
    )
    book_principe.genres.set([genre_cuento])
    if created:
        print(f"Libro '{book_principe.title}' creado.")

    # Relacionar Autor con Libro
    BookAuthor.objects.get_or_create(book=book_principe, author=author_wilde, role='primary')

    # 4. Crear Edición Digital
    edition_text, created = Edition.objects.get_or_create(
        book=book_principe,
        format='pdf', 
        is_active=True,
        language='es',
        defaults={
            'isbn': '9780123456789',
            'price': 0.00
        }
    )
    
    # Simular un archivo de texto para el lector (aunque el modelo pida FileField)
    # Solo lo hacemos si no tiene archivo para no sobre-escribir
    if not edition_text.file:
        content = (
            "CAPÍTULO I\n\n"
            "Alta sobre la ciudad, en una columna alta, se alzaba la estatua del Príncipe Feliz. "
            "Estaba toda cubierta de finas láminas de oro puro, por ojos tenía dos brillantes zafiros, "
            "y un gran rubí rojo ardía en el puño de su espada.\n\n"
            "Era muy admirado, en verdad. 'Es tan hermoso como un gallo meteorológico', observó uno "
            "de los concejales que deseaba ganar reputación de tener gustos artísticos; 'solo que no "
            "es tan útil', añadió, por temor a que la gente pensara que era poco práctico, lo cual "
            "realmente no era."
        )
        edition_text.file.save('principe_feliz.txt', ContentFile(content))
        print("Archivo de texto para la edición digital creado.")

    # 5. Crear Avatar de IA para esta edición
    AIAvatar.objects.get_or_create(
        edition=edition_text,
        name="Oscar Wilde (Avatar)",
        defaults={
            'system_prompt': (
                "Eres Oscar Wilde. Responde siempre con elegancia, cinismo y una apreciación profunda "
                "por la estética. Tu ingenio debe ser cortante pero refinado."
            ),
            'behavioral_context': (
                "Te encuentras en una etapa de reflexión sobre la belleza y el sacrificio, "
                "inspirado por tu propia obra. Te aburre lo mundano y lo práctico."
            ),
            'sample_dialogues': (
                "Usuario: ¿Qué es el arte?\n"
                "Wilde: El arte es la única cosa seria en el mundo. Y el artista es la única persona que nunca está seria.\n"
                "Usuario: ¿Qué opinas de la utilidad?\n"
                "Wilde: No hay nada tan inútil como una persona educada que no tiene nada que decir."
            ),
            'greeting_message': "Estimado lector, ¿buscáis la belleza o simplemente pasáis el tiempo?",
            'temperature': 0.85
        }
    )
    print("Avatar de Oscar Wilde configurado.")
    print("Seeding completado con éxito.")

if __name__ == "__main__":
    seed_data()

import os
import sys
import os
# Add parent directory to path to allow importing django config
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import django
import sys
from django.core.management import call_command
from django.conf import settings

# Configurar Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from catalog.models import Book, Edition
from ai_engine.models import AIAvatar

def prepare_migration():
    print("=========================================")
    print(" INICIANDO PREPARACIÓN DE MIGRACIÓN")
    print("=========================================\n")

    # 1. Exportar la base de datos (El Cerebro)
    print("1. Exportando el cerebro de Literatus (Base de Datos)...")
    
    # Vamos a guardar el JSON directamente en la carpeta media para que te lo lleves todo junto
    export_path = os.path.join(settings.MEDIA_ROOT, 'literatus_brain.json')
    
    try:
        # Exportar los datos de las apps principales usando dumpdata
        with open(export_path, 'w', encoding='utf-8') as f:
            call_command('dumpdata', 'catalog', 'ai_engine', 'library', indent=2, stdout=f)
        print(f"   [ÉXITO] Base de datos exportada en: {export_path}")
    except Exception as e:
        print(f"   [ERROR] No se pudo exportar la base de datos: {e}")
        return

    # 2. Verificar archivos físicos (Media)
    print("\n2. Verificando archivos físicos en la carpeta media...")
    missing_files = []

    # Chequear portadas de libros
    books = Book.objects.all()
    print(f"   Revisando {books.count()} libros...")
    for book in books:
        if book.cover_image:
            # book.cover_image almacena la ruta relativa dentro de media/
            full_path = os.path.join(settings.MEDIA_ROOT, str(book.cover_image))
            if not os.path.exists(full_path):
                missing_files.append(f"Falta portada del libro '{book.title}': {book.cover_image}")

    # Chequear EPUBs de ediciones
    editions = Edition.objects.filter(format='EPUB')
    print(f"   Revisando {editions.count()} ediciones EPUB...")
    for ed in editions:
        if ed.file:
            full_path = os.path.join(settings.MEDIA_ROOT, str(ed.file))
            if not os.path.exists(full_path):
                missing_files.append(f"Falta archivo EPUB de '{ed.book.title}': {ed.file}")

    # Chequear imágenes de Avatares
    avatars = AIAvatar.objects.all()
    print(f"   Revisando {avatars.count()} avatares de IA...")
    for avatar in avatars:
        if avatar.avatar_image:
            full_path = os.path.join(settings.MEDIA_ROOT, str(avatar.avatar_image))
            if not os.path.exists(full_path):
                missing_files.append(f"Falta imagen del avatar '{avatar.name}': {avatar.avatar_image}")

    # Resumen
    print("\n=========================================")
    if missing_files:
        print(" ADVERTENCIA: Algunos archivos físicos faltan en tu carpeta media/")
        print(" Si migras ahora, estos elementos se verán rotos en producción:")
        for missing in missing_files:
            print(f"   - {missing}")
    else:
        print(" ¡TODO PERFECTO! No falta ningún archivo.")
        print("\n INSTRUCCIONES PARA MIGRAR:")
        print(" 1. Comprime tu carpeta 'backend/media/' en un archivo .zip.")
        print(" 2. Cópiala a tu Google Drive.")
        print(" 3. En la nueva computadora, descomprímela en la misma ruta.")
        print(" 4. Ejecuta: python manage.py loaddata media/literatus_brain.json")
    print("=========================================")

if __name__ == "__main__":
    prepare_migration()

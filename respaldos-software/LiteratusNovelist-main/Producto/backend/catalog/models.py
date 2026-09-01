"""
catalog/models.py — Modelos del catálogo de obras y autores.

DISEÑO 3NF (Tercera Forma Normal):
    Verificación formal del cumplimiento para cada entidad:

    Author:
        - 1NF: Cada columna tiene un valor atómico (full_name no es una lista).
        - 2NF: PK simple (uuid), no hay dependencias parciales posibles.
        - 3NF: No hay dependencias transitivas. 'nationality' no depende de
               'full_name'; depende directamente del autor (la PK).
               'slug' es derivado de 'full_name' pero en DB lo tratamos como
               campo calculado-y-almacenado por performance (razón documentada).

    Genre:
        - Cumple 3NF trivialmente. Solo name + slug, ambos del género.

    Book:
        - 1NF: synopsis es texto atómico. genres y authors son relaciones
               externas (M2M), NO listas dentro del registro → cumple 1NF.
        - 3NF: title, synopsis, cover_image → todos dependen del Book (PK).
               El diseño ERD separa autores y géneros en tablas propias,
               eliminando redundancia. Si un autor escribe 10 libros, su
               nombre aparece UNA vez en Author, no 10 en Book.

    BookAuthor (tabla intermedia explícita):
        - Motivación 3NF: Si guardáramos el campo 'role' (autor, traductor)
          directamente en Book o Author, crearíamos una dependencia transitiva:
          role dependería de (book_id, author_id), no de una sola PK.
          La tabla explícita tiene PK propia y 'role' depende SOLO de esa PK.

    Edition (separada de Book):
        - Motivación 1NF: Un Book puede publicarse en PDF, EPUB y audio.
          Guardar esos formatos como campos FORMAT_PDF, FORMAT_EPUB en Book
          violaría 1NF (grupos repetidos). Edition crea una fila por formato.
        - price está en Edition, NO en Book. Razón: el precio de una edición
          puede cambiar; además, distintos formatos tienen distintos precios.
          Si estuviera en Book, habría dependencia transitiva: price → format.
"""

from django.db import models
from django.utils.text import slugify
from django.conf import settings
from core.models import TimeStampedModel
import json


class Author(TimeStampedModel):
    """
    Entidad autor normalizada. Se desacopla del libro para evitar redundancia
    (3NF): si un autor escribe múltiples libros, sus datos persisten una sola
    vez y se referencian vía BookAuthor.
    """
    full_name = models.CharField(max_length=255) # Nombre completo del autor.
    # -------------------------------------------------------------------------
    # SLUG: Identificador amigable para URLs (ej. /autores/gabriel-garcia-marquez)
    # blank=True porque lo generamos automáticamente en save() si está vacío.
    # unique=True para garantizar que no haya dos autores con el mismo slug.
    # -------------------------------------------------------------------------
    slug = models.SlugField(max_length=255, unique=True, blank=True) # Identificador en formato URL amigable generado a partir del nombre.
    bio = models.TextField(blank=True, default='') # Biografía o descripción de la vida y obra del autor.
    nationality = models.CharField(max_length=100, blank=True, default='') # Nacionalidad del autor.
    birth_year = models.IntegerField(null=True, blank=True) # Año de nacimiento
    death_year = models.IntegerField(null=True, blank=True) # Año de fallecimiento
    wikipedia_url = models.URLField(max_length=500, blank=True, default='') # Link a Wikipedia o perfil externo
    
    
    # Nuevos campos para la Ficha de Autor
    photo = models.ImageField(upload_to='authors/photos/', max_length=512, blank=True, null=True) # Imagen del autor
    themes = models.TextField(blank=True, default='') # Temas recurrentes en su obra
    # Referencia al libro recomendado para iniciar. Usamos un string para el modelo para evitar dependencias circulares antes de definir Book.
    recommended_book = models.ForeignKey('Book', on_delete=models.SET_NULL, null=True, blank=True, related_name='recommended_for_author')
    
    class Meta:
        verbose_name = 'Author'
        verbose_name_plural = 'Authors'
        indexes = [
            models.Index(fields=['slug'])
        ]

    def save(self, *args, **kwargs):
        """
        Generación automática de slug en el método save().
        Si el slug está vacío (nuevo registro o se borró manualmente),
        lo generamos desde full_name usando slugify() de Django.

        Ejemplo: "Gabriel García Márquez" → "gabriel-garcia-marquez"

        slugify() maneja: acentos (á→a), espacios (→-), mayúsculas (→lower).
        Luego sanitizamos unicidad añadiendo un sufijo numérico si colisiona.
        """
        if not self.slug:
            base_slug = slugify(self.full_name)
            self.slug = self._unique_slug(base_slug)
        super().save(*args, **kwargs)

    def _unique_slug(self, base_slug):
        """Garantiza slug único añadiendo sufijo numérico si hay colisión."""
        slug = base_slug
        counter = 1
        # Excluimos el registro propio al actualizar (usando pk)
        while Author.all_objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    def __str__(self):
        return self.full_name


class Genre(TimeStampedModel):
    """
    Género literario. Entidad independiente que cumple 3NF:
    cada atributo depende directamente de la PK (el género en sí).
    """
    name = models.CharField(max_length=100) # Nombre del género (Ej. Fantasía, Ciencia Ficción).
    slug = models.SlugField(max_length=100, unique=True, blank=True) # Identificador URL amigable del género.
    cover_image = models.ImageField(upload_to='category_covers/', max_length=255, null=True, blank=True) # Imagen de fondo de la categoría

    class Meta:
        verbose_name = 'Genre'
        verbose_name_plural = 'Genres'
        indexes = [
            models.Index(fields=['slug'])
        ]

    def save(self, *args, **kwargs):
        """Auto-genera slug desde name si está vacío."""
        if not self.slug:
            base_slug = slugify(self.name)
            self.slug = self._unique_slug(base_slug)
        super().save(*args, **kwargs)

    def _unique_slug(self, base_slug):
        """Garantiza slug único con sufijo numérico."""
        slug = base_slug
        counter = 1
        while Genre.all_objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    def __str__(self):
        return self.name


class Tag(TimeStampedModel):
    """
    Etiqueta temática generada por IA o curada manualmente para recomendación semántica.
    """
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=150, unique=True, blank=True)

    class Meta:
        verbose_name = 'Tag'
        verbose_name_plural = 'Tags'
        indexes = [
            models.Index(fields=['slug'])
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            self.slug = self._unique_slug(base_slug)
        super().save(*args, **kwargs)

    def _unique_slug(self, base_slug):
        slug = base_slug
        counter = 1
        while Tag.objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    def __str__(self):
        return self.name


class Book(TimeStampedModel):
    """
    El concepto abstracto de una obra (e.g. "Cien años de soledad").
    NO contiene precio, formato ni archivo — violaria 1NF y 3NF.
    Esas responsabilidades son de Edition.
    """
    title = models.CharField(max_length=255) # Título de la obra literaria.
    slug = models.SlugField(max_length=512, unique=True, blank=True) # Identificador URL amigable derivado del título.
    synopsis = models.TextField(blank=True, default='') # Resumen de la trama de la obra.

    class StatusChoices(models.TextChoices):
        DRAFT = 'draft', 'Borrador'
        PUBLISHED = 'published', 'Publicado'
        ARCHIVED = 'archived', 'Archivado'

    status = models.CharField(
        max_length=20,
        choices=StatusChoices.choices,
        default=StatusChoices.DRAFT,
        help_text="Estado de la obra en el flujo de trabajo."
    )
    

    class DifficultyChoices(models.TextChoices):
        BEGINNER = 'beginner', 'Principiante'
        INTERMEDIATE = 'intermediate', 'Intermedio'
        ADVANCED = 'advanced', 'Avanzado'
        MASTER = 'master', 'Maestro'

    difficulty_level = models.CharField(
        max_length=20,
        choices=DifficultyChoices.choices,
        default=DifficultyChoices.INTERMEDIATE,
        help_text="Nivel de dificultad de lectura."
    ) # Nivel estimado de complejidad de la lectura.
    is_published = models.BooleanField(
        default=True,
        help_text="Si está publicado, aparece en el catálogo."
    ) # Estado de visibilidad pública de la obra.
    
    copyright_notice = models.TextField(
        blank=True,
        default="Este libro electrónico está libre de restricciones de derechos de autor en Chile (según la Ley N° 17.336 de Propiedad Intelectual). Si no se encuentra en Chile, debe consultar las leyes locales para verificar que el contenido de este libro electrónico esté libre de restricciones en su país de residencia. Literatus Novelist promueve el acceso a la cultura respetando siempre los derechos vigentes.",
        help_text="Aviso legal sobre derechos de autor y dominio público."
    ) # Información legal personalizada sobre la propiedad intelectual de la obra.
    
    # Campo para destacar libros en la Landing Page
    is_featured = models.BooleanField(
        default=False,
        help_text="Marcar como True para destacar este libro en la Landing Page."
    ) # Flag para determinar si la obra aparece destacada en la página principal.

    pdf_file = models.FileField(
        upload_to='protected/pdf_downloads/',
        blank=True,
        null=True,
        help_text="Versión PDF de la obra para descarga directa de usuarios que la posean."
    ) # Archivo PDF opcional para descarga.

    view_count = models.PositiveIntegerField(default=0, help_text="Número total de visualizaciones de la ficha del libro.")
    download_count = models.PositiveIntegerField(default=0, help_text="Número total de descargas de la obra.")


    cover_image = models.ImageField(
        upload_to='book_covers/',
        max_length=512,
        null=True,
        blank=True
    ) # Imagen de portada de la obra.
    # M2M simple (sin datos extra en la relación)
    genres = models.ManyToManyField(Genre, related_name='books', blank=True) # Relación de muchos-a-muchos con Géneros (una obra puede tener varios géneros).
    # M2M con tabla intermedia explícita para soportar el campo 'role'
    authors = models.ManyToManyField(Author, through='BookAuthor', related_name='books') # Relación con Autores mediada por la tabla BookAuthor para detallar el rol.

    # Recomendación Temática
    tags = models.ManyToManyField(Tag, related_name='books', blank=True)
    
    class Meta:
        verbose_name = 'Book'
        verbose_name_plural = 'Books'
        indexes = [
            models.Index(fields=['slug'])
        ]

    def save(self, *args, **kwargs):
        """Auto-genera slug desde title si está vacío."""
        if not self.slug:
            base_slug = slugify(self.title)
            self.slug = self._unique_slug(base_slug)
        super().save(*args, **kwargs)

    def _unique_slug(self, base_slug):
        """Garantiza slug único con sufijo numérico."""
        slug = base_slug
        counter = 1
        while Book.all_objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        return slug

    @property
    def get_similar_books(self):
        """
        Retorna hasta 5 libros similares ordenados por cantidad de tags en común.
        Utiliza puro SQL de agregación para rendimiento máximo.
        """
        from django.db.models import Count
        return Book.objects.exclude(id=self.id).filter(
            tags__in=self.tags.all()
        ).annotate(
            shared_tags=Count('tags')
        ).order_by('-shared_tags')[:5]

    @staticmethod
    def get_recommended_for_user(user):
        """
        Calcula los géneros favoritos del usuario basados en su historial 
        y recomienda libros no leídos de esos géneros y tags similares.
        """
        from library.models import UserInventory
        from django.db.models import Count, Q

        # Obtener IDs de libros que el usuario ya tiene
        user_book_ids = UserInventory.objects.filter(user=user).values_list('edition__book_id', flat=True)

        if not user_book_ids:
            return Book.objects.filter(is_published=True, is_featured=True)[:5]

        # Obtener los géneros de los libros que posee
        favorite_genres = Genre.objects.filter(
            books__id__in=user_book_ids
        ).annotate(
            genre_count=Count('books')
        ).order_by('-genre_count')

        if not favorite_genres.exists():
            # Si no hay géneros, intentar con tags
            user_tags = Tag.objects.filter(books__id__in=user_book_ids).distinct()
            return Book.objects.filter(
                is_published=True,
                tags__in=user_tags
            ).exclude(id__in=user_book_ids).distinct()[:5]

        # Recomendar libros que compartan los géneros favoritos del usuario
        # Ordenados por la cantidad de géneros favoritos que tienen en común y vistas
        genre_ids = favorite_genres.values_list('id', flat=True)
        return Book.objects.filter(
            genres__id__in=genre_ids,
            is_published=True
        ).exclude(
            id__in=user_book_ids
        ).annotate(
            shared_genre_count=Count('genres', filter=Q(genres__id__in=genre_ids))
        ).order_by('-shared_genre_count', '-view_count').distinct()[:5]

    def __str__(self):
        return self.title


class BookAuthor(TimeStampedModel):
    """
    Tabla intermedia EXPLÍCITA para la relación M2M Book-Author.

    FUNDAMENTO 3NF: Si el campo 'role' (autor principal, traductor, editor)
    estuviera directamente en Book o Author, causaría una dependencia transitiva:
        role → dependería de (book_id, author_id), no de la PK de Book ni de Author.
    Al crear BookAuthor con su propio UUID PK, 'role' depende únicamente de
    esta PK, satisfaciendo 3NF formalmente.

    Fundamento adicional: permite que el mismo autor aparezca en el mismo libro
    con roles distintos (ej. traductor Y prologuista).
    """
    class RoleChoices(models.TextChoices):
        PRIMARY = 'primary', 'Primary Author'
        TRANSLATOR = 'translator', 'Translator'
        EDITOR = 'editor', 'Editor'

    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='book_authors') # Referencia al Libro.
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='author_books') # Referencia al Autor.
    role = models.CharField(max_length=20, choices=RoleChoices.choices, default=RoleChoices.PRIMARY) # Rol del autor en este libro específico (Ej. Escritor, Traductor).

    class Meta:
        unique_together = ('book', 'author', 'role')

    def __str__(self):
        return f"{self.author} ({self.get_role_display()}) → {self.book}"


class Edition(TimeStampedModel):
    """
    Una publicación específica de una obra: formato + precio + asset.

    FUNDAMENTO 1NF: Un libro puede publicarse en PDF, EPUB y audio.
    Almacenar esos formatos como columnas en Book (FORMAT_PDF, FORMAT_EPUB...)
    violaría 1NF al crear grupos repetidos. Edition crea una fila por formato.

    FUNDAMENTO 3NF: 'price' está aquí y NO en Book porque el precio es un
    atributo de la edición específica (puede variar entre formatos y cambiar
    en el tiempo), no del libro abstracto.

    PROTECCIÓN DE ARCHIVOS:
    Los archivos (PDF/EPUB/audio) se almacenan en 'book_files/' que debe ser
    configurado como directorio PRIVADO (fuera de MEDIA_ROOT público).
    El acceso se controla a través de la API (view requiere autenticación +
    verificación de UserInventory). Ver configuración en config/settings.py.
    """
    class FormatChoices(models.TextChoices):
        EPUB = 'epub', 'EPUB'
        PDF = 'pdf', 'PDF'
        AUDIO = 'audio', 'Audiobook'

    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='editions') # Referencia a la obra general a la que pertenece esta edición.
    language = models.CharField(max_length=10, default='es') # Idioma específico de esta edición.

    # ISBN: identificador estándar de la industria editorial. Puede ser NULL
    # para obras sin ISBN formal (e.g., autopublicaciones).
    isbn = models.CharField(max_length=13, unique=True, null=True, blank=True) # Código identificador único internacional del libro.

    format = models.CharField(max_length=10, choices=FormatChoices.choices, default=FormatChoices.EPUB) # Formato digital de esta edición (EPUB, PDF, etc).

    # DecimalField para dinero: NUNCA usar FloatField para valores monetarios.
    # FloatField usa punto flotante binario y acumula errores de redondeo
    # (0.1 + 0.2 ≠ 0.3 en IEEE 754). DecimalField es exacto.
    price = models.DecimalField(max_digits=10, decimal_places=2) # Precio de compra o valor en moneda de esta edición concreta.

    # -------------------------------------------------------------------------
    # PROTECCIÓN DE ARCHIVOS DIGITALES
    # upload_to='protected/book_files/' → directorio 'protected/' que se
    # configura en settings.py como PRIVATE_MEDIA_ROOT (fuera de MEDIA_URL).
    # Django nunca servirá estos archivos directamente desde MEDIA_ROOT.
    # El acceso requiere pasar por una view autenticada que:
    #   1. Verifica JWT del usuario.
    #   2. Verifica que UserInventory.objects.filter(user=req.user, edition=edition).exists()
    #   3. Solo entonces devuelve el archivo con X-Accel-Redirect (Nginx) o
    #      sendfile (para producción) / FileResponse (para desarrollo).
    # -------------------------------------------------------------------------
    file = models.FileField(
        upload_to='protected/book_files/',
        max_length=512,
        help_text=(
            "Archivo del libro. Almacenado en directorio protegido. "
            "Nunca servir directamente desde MEDIA_URL; usar la view "
            "de descarga autenticada en library/views.py."
        )
    ) # El archivo físico del libro (EPUB/PDF), almacenado en un directorio protegido.

    published_date = models.DateField(null=True, blank=True) # Fecha de publicación de esta edición.
    publisher = models.CharField(max_length=255, blank=True, default='') # Nombre de la editorial que publicó esta versión.

    class Meta:
        verbose_name = 'Edition'
        verbose_name_plural = 'Editions'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price__gte=0),
                name='price_gte_0',
                # El precio puede ser 0 para obras gratuitas, pero nunca negativo.
                violation_error_message="El precio no puede ser negativo."
            )
        ]

    def __str__(self):
        return f"{self.book.title} [{self.get_format_display()}] - {self.language}"


class Chapter(TimeStampedModel):
    """
    Representa un capítulo individual de un libro con su contenido HTML procesado.
    """
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='chapters') # Referencia al libro al que pertenece este capítulo.
    title = models.CharField(max_length=255, blank=True, default='') # Título o nombre del capítulo.
    order = models.PositiveIntegerField() # Número que define el orden secuencial de los capítulos.
    content_html = models.TextField() # Contenido del capítulo en formato HTML listo para renderizar en el lector web.

    class Meta:
        verbose_name = 'Chapter'
        verbose_name_plural = 'Chapters'
        ordering = ['order']
        constraints = [
            # Garantiza que un libro no tenga dos capítulos con el mismo número de orden.
            # Sin esta constraint, un error en la importación podría crear dos "Capítulo 1"
            # y romper el flujo de lectura del usuario.
            models.UniqueConstraint(
                fields=['book', 'order'],
                name='unique_chapter_order',
                violation_error_message="Este libro ya tiene un capítulo con ese número de orden."
            )
        ]

    def __str__(self):
        return f"{self.book.title} - {self.title or f'Chapter {self.order}'}"


class Review(TimeStampedModel):
    """
    Reseña de un libro escrita por un usuario.
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews') # Referencia al usuario que escribe la reseña.
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name='reviews') # Referencia a la obra reseñada.
    rating = models.PositiveSmallIntegerField(default=5, help_text="Puntuación de 1 a 5.") # Calificación en estrellas (generalmente 1 a 5).
    comment = models.TextField(blank=True, default='') # Texto libre con la opinión del usuario.

    class Meta:
        verbose_name = 'Review'
        verbose_name_plural = 'Reviews'
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1) & models.Q(rating__lte=5),
                name='rating_range',
                violation_error_message="La puntuación debe estar entre 1 y 5."
            ),
            # CONSTRAINT PARCIAL (Soft Delete aware):
            # Si usáramos una constraint simple, un usuario que soft-deletea su reseña
            # no podría volver a reseñar el mismo libro (la constraint seguiría activa).
            # condition=deleted_at__isnull=True hace que la constraint SOLO aplique
            # sobre registros activos, ignorando los eliminados lógicamente.
            models.UniqueConstraint(
                fields=['user', 'book'],
                condition=models.Q(deleted_at__isnull=True),
                name='unique_active_review_per_book',
                violation_error_message="El usuario ya ha reseñado activamente este libro."
            )
        ]
        indexes = [
            models.Index(fields=['book', '-created_at'])
        ]

    def __str__(self):
        return f"Review by {self.user} for {self.book}"


class ChapterAudio(TimeStampedModel):
    """
    Audio pregrabado de un capítulo con sus timestamps de sincronización (Efecto Spotify).
    """
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name='audios')
    voice_name = models.CharField(max_length=100, help_text="Ej: 'Carito - Colombiana'")
    audio_file = models.FileField(upload_to='protected/chapter_audios/')
    sync_file = models.FileField(
        upload_to='temp_sync/', 
        blank=True, 
        null=True, 
        help_text="Sube un archivo JSON de alineación. El sistema lo leerá y guardará en alignment_data automáticamente."
    )
    alignment_data = models.JSONField(blank=True, null=True, help_text="Datos de alineación extraídos del JSON.")

    class Meta:
        verbose_name = 'Chapter Audio'
        verbose_name_plural = 'Chapter Audios'
        ordering = ['chapter', 'voice_name']
        constraints = [
            # Impide registrar la misma voz dos veces para el mismo capítulo.
            # Sin esta constraint, una re-importación duplicaría el audio disponible
            # en el lector, confundiendo al usuario con opciones repetidas.
            models.UniqueConstraint(
                fields=['chapter', 'voice_name'],
                name='unique_chapter_audio_voice',
                violation_error_message="Ya existe un audio con esa voz para este capítulo."
            )
        ]

    def save(self, *args, **kwargs):
        if self.sync_file:
            try:
                self.sync_file.open(mode='r')
                # Leer el contenido del archivo subido
                data = json.load(self.sync_file.file)
                self.alignment_data = data
                self.sync_file.close()
                # Limpiar el campo del archivo temporal sin hacer un save() recursivo
                self.sync_file = None
            except Exception as e:
                # Si falla, se podría loguear, por ahora simplemente no lo cargamos
                pass
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Audio: {self.chapter} ({self.voice_name})"


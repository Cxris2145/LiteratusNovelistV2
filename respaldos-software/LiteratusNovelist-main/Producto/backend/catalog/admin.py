from django.contrib import admin
from django.utils.html import format_html
import json
from .models import Author, Genre, Book, Edition, BookAuthor, Chapter, ChapterAudio, Tag

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['name']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Author)
class AuthorAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'nationality']
    prepopulated_fields = {'slug': ('full_name',)}


@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    list_display = ['name']
    prepopulated_fields = {'slug': ('name',)}


class BookAuthorInline(admin.TabularInline):
    model = BookAuthor
    extra = 1


class EditionInline(admin.TabularInline):
    model = Edition
    extra = 1


class ChapterInline(admin.TabularInline):
    """
    Muestra los capítulos del libro desde la vista de edición del Book.
    Solo visualización rápida — para editar el HTML completo, ir al ChapterAdmin.
    """
    model = Chapter
    fields = ['order', 'title']
    extra = 0
    ordering = ['order']
    show_change_link = True


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ['title', 'is_published', 'is_featured', 'difficulty_level']
    list_filter = ['is_published', 'is_featured', 'difficulty_level']
    search_fields = ['title', 'synopsis']
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ['tags', 'genres']
    inlines = [BookAuthorInline, EditionInline, ChapterInline]


@admin.register(Edition)
class EditionAdmin(admin.ModelAdmin):
    """
    Registro independiente de Edition en el panel de administración
    para gestionar formatos, precios y archivos directamente.
    """
    list_display = ['book', 'format', 'language', 'price']
    search_fields = ['book__title', 'isbn', 'publisher']
    list_filter = ['format', 'language']


class ChapterAudioInline(admin.StackedInline):
    """
    Permite subir audios de un capítulo directamente desde la vista del capítulo.
    """
    model = ChapterAudio
    fields = ['voice_name', 'audio_file', 'sync_file', 'alignment_preview']
    readonly_fields = ['alignment_preview']
    extra = 1

    def alignment_preview(self, obj):
        """Muestra un resumen de cuántos caracteres tiene el JSON de alineación cargado."""
        if obj.alignment_data:
            chars = obj.alignment_data.get('characters', [])
            return format_html(
                '<span style="color:#22d3ee; font-weight:bold;">✓ {} caracteres alineados</span>',
                len(chars)
            )
        return format_html('<span style="color:#f87171;">Sin datos de alineación</span>')
    alignment_preview.short_description = 'Estado de Alineación'


@admin.register(Chapter)
class ChapterAdmin(admin.ModelAdmin):
    """
    Administra capítulos individuales con su contenido HTML.
    Incluye los audios asociados como inline para gestionar la sincronización.
    """
    list_display = ['book', 'order', 'title', 'has_audio']
    list_filter = ['book']
    search_fields = ['book__title', 'title']
    ordering = ['book', 'order']
    inlines = [ChapterAudioInline]

    def has_audio(self, obj):
        """Indicador visual de si el capítulo tiene audio cargado."""
        count = obj.audios.count()
        if count > 0:
            return format_html(
                '<span style="color:#22d3ee;">🔊 {} voz(es)</span>', count
            )
        return format_html('<span style="color:#64748b;">Sin audio</span>')
    has_audio.short_description = 'Narración'


@admin.register(ChapterAudio)
class ChapterAudioAdmin(admin.ModelAdmin):
    """
    Vista dedicada para gestionar audios de capítulos.

    FLUJO DE IMPORTACIÓN DE ALINEACIÓN:
    1. Sube el archivo .json de alineación en el campo 'sync_file'.
    2. Al guardar, el sistema lee el JSON automáticamente y lo vuelca en 'alignment_data'.
    3. El campo 'sync_file' se limpia solo. El JSON queda en la BD listo para el lector.
    """
    list_display = ['chapter', 'voice_name', 'alignment_status']
    list_filter = ['chapter__book']
    search_fields = ['chapter__title', 'chapter__book__title', 'voice_name']
    ordering = ['chapter__book', 'chapter__order']

    # sync_file es el campo temporal de importación; alignment_data es de solo lectura
    readonly_fields = ['alignment_status', 'alignment_data_preview']
    fields = [
        'chapter', 'voice_name', 'audio_file',
        'sync_file',
        'alignment_status',
        'alignment_data_preview',
    ]

    def alignment_status(self, obj):
        """Indicador visual del estado de la alineación en la lista y el formulario."""
        if obj.alignment_data:
            chars = obj.alignment_data.get('characters', [])
            return format_html(
                '<span style="color:#22d3ee; font-weight:bold;">✓ Sincronizado — {} caracteres</span>',
                len(chars)
            )
        return format_html(
            '<span style="color:#f87171;">⚠ Sin datos — sube un archivo JSON en sync_file y guarda</span>'
        )
    alignment_status.short_description = 'Estado de Sincronización (Efecto Spotify)'

    def alignment_data_preview(self, obj):
        """Muestra las primeras 5 entradas del JSON de alineación como confirmación."""
        if not obj.alignment_data:
            return '—'
        chars   = obj.alignment_data.get('characters', [])[:10]
        starts  = obj.alignment_data.get('character_start_times_seconds', [])[:10]
        preview = ' | '.join(
            f"'{c}' @{s:.3f}s" for c, s in zip(chars, starts)
        )
        return format_html('<code style="font-size:0.8em;">{}</code>...', preview)
    alignment_data_preview.short_description = 'Vista Previa de Alineación'


"""
ai_engine/models.py — Modelos de IA conversacional y contexto narrativo.

DISEÑO 3NF:

    AIAvatar:
        - FK a Edition (no a Book): el avatar es específico a la edición porque
          el contexto narrativo puede variar entre idiomas o traducciones.
          Un avatar del El Quijote en español tiene un system_prompt diferente
          al de la versión en inglés. Tener FK a Book generalizaría incorrectamente.

    ChatSession:
        - Agrupa mensajes bajo un avatar+usuario. Permite múltiples conversaciones
          paralelas del mismo usuario con diferentes avatares.
        - FK a AIAvatar (no a Edition ni Book): la sesión es con un avatar específico,
          que ya sabe a qué edición pertenece.

    ChatMessage:
        - Entidad más atómica. Cada mensaje es independiente.
        - 'role' distingue quién habló (user/assistant/system) — necesario para
          reconstruir el historial de conversación para el LLM.
        - ordering = ['created_at']: por defecto, los mensajes se devuelven en
          orden cronológico. Crítico para la correcta reconstrucción del contexto.
        - Índice en (session, created_at): la query más frecuente es
          "dame los últimos N mensajes de esta sesión".
"""

from django.db import models
from core.models import TimeStampedModel
from users.models import User
from catalog.models import Edition


class AIAvatar(TimeStampedModel):
    """
    Perfil de IA para una edición específica.
    Define la personalidad, instrucciones (system_prompt) y configuración
    del modelo LLM que encarna a un personaje o narrador del libro.
    """
    edition = models.ForeignKey(
        Edition,
        on_delete=models.CASCADE,
        related_name='avatars'
    ) # Referencia a la edición del libro a la que pertenece este avatar IA.
    name = models.CharField(max_length=255) # Nombre del personaje o IA.
    # Descripción breve para mostrar en la ficha del personaje en el lector.
    description = models.TextField(
        blank=True,
        default='',
        help_text="Descripción breve del personaje para mostrar en su ficha de perfil."
    ) # Descripción que los usuarios ven sobre el personaje antes de chatear.
    # Instrucciones base para el LLM.
    system_prompt = models.TextField() # El "Prompt del Sistema" que define la personalidad y conocimiento de la IA.
    temperature = models.DecimalField(
        max_digits=3,
        decimal_places=2,
        default=0.70,
        help_text="Creatividad del LLM. 0.0 = determinista, 1.0 = máxima creatividad."
    ) # Controla qué tan creativas (o erráticas) son las respuestas de la IA.
    model_name = models.CharField(
        max_length=255,
        default='gemini-2.0-flash',
        help_text="Identificador del modelo LLM (e.g. 'gemini-2.0-flash', 'gpt-4o')."
    ) # Especifica el modelo subyacente que responderá (ej. gemini, gpt).
    avatar_image = models.ImageField(
        upload_to='ai_avatars/',
        null=True,
        blank=True,
        help_text="Imagen neutral/Idle del avatar mostrada en la interfaz."
    )
    image_speaking_1 = models.ImageField(
        upload_to='ai_avatars/states/',
        null=True,
        blank=True,
        help_text="Fotograma 1 de la animación de habla (ej. boca cerrada)."
    )
    image_speaking_2 = models.ImageField(
        upload_to='ai_avatars/states/',
        null=True,
        blank=True,
        help_text="Fotograma 2 de la animación de habla (ej. boca entreabierta)."
    )
    image_speaking_3 = models.ImageField(
        upload_to='ai_avatars/states/',
        null=True,
        blank=True,
        help_text="Fotograma 3 de la animación de habla (ej. boca abierta)."
    )
    image_thinking = models.ImageField(
        upload_to='ai_avatars/states/',
        null=True,
        blank=True,
        help_text="Imagen mostrada mientras la IA genera una respuesta."
    )
    # SISTEMA DE DESBLOQUEO POR PROGRESO
    # El avatar se activa cuando el usuario llega a este capítulo (índice base-0).
    # unlock_at_chapter=0 significa disponible desde el inicio.
    unlock_at_chapter = models.PositiveIntegerField(
        default=0,
        help_text="Capítulo (base 0) a partir del cual el usuario puede chatear con este personaje."
    ) # Define en qué momento de la lectura se vuelve accesible este avatar.
    is_major_character = models.BooleanField(
        default=True,
        help_text="Si es un personaje principal, aparece destacado en el panel."
    ) # Destaca a este personaje sobre los secundarios en la UI.
    # AUTOR: avatar del autor real de la obra (aparece en sección propia en el panel)
    # Siempre disponible desde el inicio (unlock_at_chapter=0 se ignora si is_author=True).
    is_author = models.BooleanField(
        default=False,
        help_text="Si True, este avatar representa al autor de la obra y aparece en sección propia."
    ) # Identifica si la IA toma el rol del Autor (ej. Gabriel García Márquez).
    # INMERSIÓN COMPLETA
    greeting_message = models.TextField(
        default="Hola, viajero.",
        help_text="Mensaje introductorio fijo que arranca la sesión."
    ) # El primer mensaje que envía el avatar al abrir un chat nuevo.
    behavioral_context = models.TextField(
        blank=True,
        help_text="Motivaciones secretas, situación emocional actual de este personaje."
    ) # Contexto adicional oculto para que el LLM entienda el estado actual del personaje.
    sample_dialogues = models.TextField(
        blank=True,
        help_text="Bloques literales de la obra para guiar el estilo de respuesta."
    ) # Ejemplos de cómo habla el personaje para que el LLM imite su estilo de escritura.

    # ESTADÍSTICAS
    chat_count = models.PositiveIntegerField(
        default=0,
        help_text="Número total de conversaciones iniciadas con este personaje."
    ) # Se usa para el ranking de 'Más Destacados'.

    # VOZ TTS (Kokoro-82M)
    kokoro_voice_id = models.CharField(
        max_length=50,
        default='af_bella',
        help_text="ID de voz de Kokoro-82M para TTS (e.g. 'af_bella', 'af_nicole', 'em_alex', 'em_santa')."
    ) # Voz asignada al personaje para la narración en tiempo real.

    class Meta:
        verbose_name = 'AI Avatar'
        verbose_name_plural = 'AI Avatars'
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(temperature__gte=0.00) &
                    models.Q(temperature__lte=1.00)
                ),
                name='valid_temperature',
                violation_error_message="La temperatura debe estar entre 0.0 y 1.0."
            )
        ]

    def __str__(self):
        return f"{self.name} [{self.edition.book.title}]"


class ChatSession(TimeStampedModel):
    """
    Sesión de conversación entre un usuario y un AIAvatar.
    Agrupa mensajes con un título para identificar el hilo de conversación.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chat_sessions') # Referencia al usuario dueño del chat.
    avatar = models.ForeignKey(AIAvatar, on_delete=models.CASCADE, related_name='sessions') # Referencia al Avatar de IA con el que se chatea.
    title = models.CharField(max_length=255, blank=True, default='Nueva Conversación') # Título automático o personalizado para el historial.

    class Meta:
        verbose_name = 'Chat Session'
        verbose_name_plural = 'Chat Sessions'
        indexes = [
            # Permite recuperar eficientemente "las sesiones del usuario X"
            # ordenadas por actividad más reciente.
            models.Index(fields=['user', 'created_at'])
        ]

    def __str__(self):
        return f"[{self.user.username}] {self.title} — {self.avatar.name}"


class ChatMessage(TimeStampedModel):
    """
    Mensaje individual dentro de una ChatSession.

    DISEÑO DE RENDIMIENTO:
    El índice en (session_id, created_at) es crítico. Cada request del chat
    recupera los últimos N mensajes de la sesión para enviarlos al LLM como
    contexto. Sin este índice, esa query haría un sequential scan en una tabla
    que puede tener millones de mensajes.
    """
    class RoleChoices(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'
        SYSTEM = 'system', 'System'

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages') # Referencia a la sesión a la que pertenece este mensaje.
    # role sigue el estándar de la API de OpenAI/Gemini para compatibilidad directa.
    role = models.CharField(max_length=20, choices=RoleChoices.choices) # Indica si el mensaje es del usuario o del asistente (IA).
    content = models.TextField() # El contenido del texto real intercambiado.

    class Meta:
        verbose_name = 'Chat Message'
        verbose_name_plural = 'Chat Messages'
        indexes = [
            # Índice compuesto (session, created_at): ver justificación en docstring.
            models.Index(fields=['session', 'created_at'])
        ]
        # ordering por defecto: cronológico ascendente.
        # Permite usar ChatMessage.objects.filter(session=s) y obtener historial en orden.
        ordering = ['created_at']

    def __str__(self):
        preview = self.content[:50] + '...' if len(self.content) > 50 else self.content
        return f"[{self.get_role_display()}] {preview}"

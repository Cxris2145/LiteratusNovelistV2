# Informe de Avance N°1 — Literatus Novelist

**Instituto Profesional DUOC — Escuela de Informática**

| Campo | Detalle |
|---|---|
| **Proyecto** | Literatus Novelist |
| **Tipo** | Plataforma tecnológica web comercial |
| **Profesor** | [Nombre del Profesor] |
| **Integrantes** | Benjamin Norambuena / Josué Ticona |
| **Carrera** | Analista Programador |
| **Lugar y Fecha** | Santiago, Chile — 2026 |

---

## Tabla de Contenidos

1. Introducción
2. Contexto y Diagnóstico
3. Análisis de Mercado
4. Estado del Arte y Homologación
5. Definición del Proyecto
6. Planificación
7. Definición Tecnológica y Factibilidad
8. Conceptualización y Metodología
9. Avance Actual de Desarrollo
10. Conclusiones

---

## 1. Introducción

El presente informe detalla la fase inicial de planificación, diagnóstico y primer avance de desarrollo del proyecto **Literatus Novelist**, una plataforma digital que redefine la experiencia de lectura tradicional mediante la integración de Inteligencia Artificial generativa, síntesis de voz y herramientas de análisis literario.

El núcleo de la propuesta es transformar las obras de dominio público en **experiencias interactivas e inmersivas**, donde el lector no solo consume contenido, sino que participa activamente dialogando con los personajes de las obras, recibiendo narración sincronizada y accediendo a análisis literario contextualizado.

El proyecto surge como respuesta a tres problemáticas clave identificadas en el mercado de lectura digital actual:

1. **Baja adherencia a la lectura profunda** en entornos digitales saturados de entretenimiento de consumo rápido (redes sociales, streaming).
2. **Experiencias pasivas** en las plataformas de lectura existentes, que no aprovechan las capacidades de la IA para enriquecer la comprensión del texto.
3. **Falta de innovación** en la distribución y acceso a la literatura clásica de dominio público.

A lo largo de este documento se desglosa el diagnóstico del problema, el análisis de mercado, la factibilidad técnica de la solución propuesta y la planificación estratégica del desarrollo.

---

## 2. Contexto y Diagnóstico

### 2.1 Modelo de Solución para Procesos de Negocio

La solución propuesta automatiza y enriquece tres procesos clave de la cadena de valor de la lectura digital:

**Acceso y Distribución de Literatura:** La plataforma centraliza un catálogo de obras de dominio público, procesa los archivos EPUB y los sirve como experiencias de lectura web enriquecidas, eliminando la necesidad de aplicaciones de descarga o lectores externos.

**Comprensión e Interacción Literaria:** El motor de IA (Art-Engine) dota a cada obra de avatares conversacionales con personalidad propia, permitiendo al usuario dialogar con los personajes, obtener análisis temáticos y aclarar dudas de comprensión en tiempo real.

**Monetización y Sostenibilidad Cultural:** La plataforma integra un sistema de pagos reales (Transbank) y una economía virtual ("Tinta") que permite financiar el acceso a contenido premium, garantizando la sostenibilidad del modelo de negocio.

### 2.2 Descripción del Problema: Causas y Efectos

| Análisis | Descripción Detallada |
|---|---|
| **Causa Raíz** | Inexistencia de plataformas de lectura que integren IA generativa para crear una experiencia interactiva y personalizada. |
| **Efecto** | El lector percibe la lectura clásica como una actividad pasiva y poco atractiva frente a otros medios digitales. |
| **Causa Raíz** | Plataformas de lectura existentes (Kindle, Kobo) ofrecen solo texto estático sin contexto ni acompañamiento. |
| **Efecto** | Baja comprensión lectora profunda, especialmente en obras literarias con contexto histórico complejo. |
| **Causa Raíz** | Las obras de dominio público están disponibles en formatos crudos (Project Gutenberg) sin valor agregado. |
| **Efecto** | El lector no tiene incentivos para acceder a literatura clásica frente a contenidos digitales más atractivos. |

*(Ver Diagrama de Ishikawa en la carpeta `01_Definicion_del_Problema/`)*

---

## 3. Análisis de Mercado

### 3.1 Estado del Arte

El mercado de plataformas de lectura digital se divide en tres grandes categorías:

**Plataformas de Lectura Estática:** Amazon Kindle, Kobo y Apple Books dominan el mercado con amplios catálogos pero sin integración de IA conversacional. Su experiencia es puramente de consumo pasivo.

**Plataformas Educativas con IA:** Herramientas como Khanmigo (Khan Academy) integran IA para apoyo educativo en lectura, pero están enfocadas en el ámbito escolar formal y no en la literatura general.

**Asistentes de IA Generativa:** ChatGPT y Gemini pueden responder preguntas sobre literatura, pero no están integrados con un lector de libros ni ofrecen la experiencia inmersiva de dialogar "como personaje".

### 3.2 Tabla de Homologación

| Atributo | Literatus Novelist | Amazon Kindle | Wattpad | Character.AI |
|---|---|---|---|---|
| **Lector EPUB integrado** | ✅ Sí (propio) | ✅ Sí | ✅ Sí | ❌ No |
| **Chat con personajes de IA** | ✅ Sí (Gemini 2.0) | ❌ No | ❌ No | ✅ Sí |
| **Narración TTS sincronizada** | ✅ Sí (karaoke) | ✅ Sí (básico) | ❌ No | ❌ No |
| **Literatura de dominio público** | ✅ Sí (1,800+ obras) | ✅ Sí | ❌ No | ❌ No |
| **Sistema económico virtual** | ✅ Sí (Tinta) | ❌ No | ✅ Sí | ❌ No |
| **Pagos reales integrados** | ✅ Sí (Transbank) | ✅ Sí | ✅ Sí | ✅ Sí |
| **Avatares animados de personajes** | ✅ En desarrollo | ❌ No | ❌ No | ✅ Sí |
| **Panel de administración** | ✅ Sí (Nexus) | N/A | ✅ Sí | N/A |
| **Gratuito con opciones premium** | ✅ Sí | Parcial | ✅ Sí | Parcial |

---

## 4. Definición del Proyecto

### 4.1 Situación Inicial del Cliente

El cliente identifica una oportunidad de mercado en la intersección de la tecnología de IA generativa y la distribución digital de literatura clásica. Actualmente, los lectores que desean acceder a obras como *El Principito*, *La Metamorfosis* o *El Gato Negro* lo hacen a través de plataformas que ofrecen el texto crudo sin ningún valor agregado educativo o interactivo.

La propuesta de valor de Literatus Novelist es proveer una experiencia de lectura aumentada donde la IA actúa como puente entre el lector moderno y la literatura clásica, haciendo la experiencia tan inmersiva y atractiva como cualquier otro medio digital.

### 4.2 Objetivo General

Desarrollar una plataforma web inteligente que facilite el acceso, la comprensión e interacción con obras literarias de dominio público mediante tecnologías de Inteligencia Artificial generativa, síntesis de voz y un sistema de economía digital, generando una experiencia de lectura inmersiva y sostenible.

### 4.3 Objetivos Específicos

1. **Implementar un catálogo digital escalable:** Desarrollar un sistema de gestión de más de 1,800 obras de dominio público con metadatos enriquecidos, sinopsis generadas por IA y sistema de búsqueda/filtrado avanzado.

2. **Integrar un motor de IA conversacional:** Conectar Google Gemini 2.0 Flash para permitir conversaciones inmersivas con avatares de personajes literarios, respetando su personalidad, estilo de habla e historia dentro de la obra.

3. **Desarrollar un sistema de narración sincronizada:** Implementar un pipeline de narración con Piper TTS y alineación temporal word-by-word mediante Whisper para lograr efecto karaoke en el lector.

4. **Construir un ecosistema económico y de pagos:** Integrar Transbank Webpay Plus para transacciones reales y diseñar el sistema de moneda virtual "Tinta" para incentivos de uso y acceso a contenido premium.

5. **Generar un sistema de avatares expresivos:** Crear un conjunto de imágenes estilo manga/novela visual para los personajes de las obras seleccionadas, con múltiples expresiones faciales para enriquecer el chat conversacional.

### 4.4 Alcance del Proyecto

El proyecto contempla el diseño, planificación y desarrollo de un producto mínimo viable (MVP) con los siguientes módulos:

- Catálogo de obras de dominio público (1,800+ libros)
- Sistema de lectura web con lector EPUB propio
- Descarga de libros en formato PDF/EPUB
- Sistema de autenticación (JWT) y perfiles de usuario
- Biblioteca personal del usuario
- Motor de IA conversacional con avatares de personajes (Gemini 2.0)
- Síntesis de voz por personaje (Piper TTS)
- Narración sincronizada audio-texto (Whisper alignment)
- Pasarela de pagos real (Transbank Webpay Plus)
- Sistema económico "La Taberna" (moneda Tinta)
- Panel administrativo "Literatus Nexus"
- Sistema de avatares manga con expresiones (Visual Novel)

### 4.5 Restricciones y Límites

- El proyecto no incluye el desarrollo de una aplicación móvil nativa (solo web responsive).
- Las APIs de IA externas (Gemini, DeepSeek) están sujetas a cuotas gratuitas durante el período académico.
- La generación de imágenes con Stable Diffusion XL se realiza en Google Colab por limitaciones de hardware local.
- El despliegue en la nube (producción) queda fuera del alcance académico de esta iteración.

---

## 5. Planificación

*(Ver documento detallado en `02_Planificacion_y_Cronograma/Planificación y Cronograma.md`)*

La planificación se organiza en 7 Sprints de 1-2 semanas cada uno, con un total estimado de 12 semanas de desarrollo activo. Se utiliza metodología Scrum con tablero Kanban para el seguimiento de tareas.

**Distribución de carga:**
- **Josué Ticona:** Arquitectura backend, API REST, motor de IA, pipelines de audio y automatización. (50%)
- **Benjamin Norambuena:** Frontend Angular, UI/UX, componentes de lector, QA y documentación. (50%)

---

## 6. Definición Tecnológica y Factibilidad

### 6.1 Lenguajes y Tecnologías de Desarrollo

| Capa | Tecnología | Justificación |
|---|---|---|
| **Backend** | Python 3.13 + Django 6.x + DRF | Ecosistema maduro para APIs REST, ORM potente, excelente integración con librerías de IA (Whisper, Piper). |
| **Base de Datos** | PostgreSQL | Robustez en producción, soporte nativo de UUIDs, transacciones ACID para pagos. |
| **Frontend** | Angular 18+ + TypeScript | Framework empresarial con tipado estático, ideal para aplicaciones SPA complejas con múltiples módulos. |
| **IA Conversacional** | Google Gemini 2.0 Flash | Mejor relación calidad/precio para chat contextual largo con temperatura configurable. |
| **IA Generativa Batch** | DeepSeek API | Modelo económico ideal para generación masiva de sinopsis y perfiles de personaje. |
| **Síntesis de Voz** | Piper TTS | Motor TTS local de alta calidad, sin costo por llamada, voces expresivas en español. |
| **Alineación Audio** | OpenAI Whisper | Alineación word-level para sincronización karaoke del lector. |
| **Generación de Imágenes** | Stable Diffusion XL (Animagine XL 3.1) | Modelo de anime/manga de código abierto de referencia para la generación de avatares de personajes. |
| **Pagos** | Transbank SDK Webpay Plus | Pasarela de pago oficial para el mercado chileno. |

### 6.2 Análisis de Factibilidad

**Técnica:** El stack tecnológico seleccionado es completamente open-source o tiene planes gratuitos suficientes para el desarrollo académico. El equipo tiene dominio demostrado en todas las tecnologías seleccionadas.

**Económica:** El desarrollo no requiere inversión en infraestructura durante la fase académica. Los costos se limitan a cuotas de API (Gemini, DeepSeek) que se mantienen dentro del rango gratuito para el volumen de uso esperado.

**Operacional:** El sistema se puede desplegar localmente en cualquier equipo con Python 3.13+ y Node.js 20+ instalados, facilitando las pruebas y demostraciones al cliente.

---

## 7. Conceptualización y Metodología

### 7.1 Propósito de la Solución

Literatus Novelist actúa como puente entre la literatura clásica de dominio público y el lector digital moderno. Su propuesta de valor se basa en tres pilares:

1. **Accesibilidad:** Catálogo gratuito de más de 1,800 obras procesadas y listas para leer en el navegador.
2. **Inmersión:** Avatares de personajes con IA conversacional, voz sintética y expresiones visuales que hacen la experiencia tan atractiva como un videojuego o una serie.
3. **Sostenibilidad:** Modelo de negocio híbrido con contenido gratuito y premium, respaldado por pagos reales y economía virtual.

### 7.2 Valor Agregado

- **Chat Conversacional con Personajes:** El usuario puede dialogar directamente con "El Principito", "Gregor Samsa" o "El Gato Negro", obteniendo respuestas coherentes con la personalidad y el contexto de la obra.
- **Narración Tipo Karaoke:** El texto se subraya en tiempo real mientras el narrador TTS lo lee, mejorando la comprensión y la experiencia de lectura simultánea.
- **Sistema Económico Gamificado:** La moneda "Tinta" incentiva la lectura y el uso de la plataforma, creando un ciclo de recompensa que aumenta la retención de usuarios.

### 7.3 Marco de Trabajo Ágil (Scrum)

Se adopta Scrum como metodología de trabajo dado que:

- Permite validar incrementos funcionales cada 1-2 semanas.
- Facilita la adaptación a cambios de requerimientos del cliente.
- Garantiza visibilidad constante del progreso a través del tablero Kanban.

---

## 8. Avance Actual de Desarrollo

A la fecha del presente informe, el proyecto cuenta con los siguientes módulos **completamente implementados y funcionales**:

| Módulo | Estado | Descripción |
|---|---|---|
| API REST Backend | ✅ Completado | Endpoints para catálogo, usuarios, pagos, IA y contenido multimedia. |
| Autenticación JWT | ✅ Completado | Login, registro, refresh token, guards de rutas en Angular. |
| Catálogo de Libros | ✅ Completado | Más de 1,800 obras de dominio público con metadatos y sinopsis. |
| Panel Admin (Nexus) | ✅ Completado | Gestión de libros, autores, ediciones y carga masiva de EPUB. |
| Lector EPUB | ✅ Completado | Lector web propio con navegación por capítulos y modo oscuro. |
| Narración Audio-Sync | ✅ Completado | Karaoke word-by-word con Whisper + Piper TTS. |
| Chat con Personajes | ✅ Completado | Gemini 2.0 Flash con personalidad de AIAvatar por obra. |
| Llamada de Voz | ✅ Completado | Web Speech API + síntesis de voz TTS en llamada interactiva. |
| Pagos Transbank | ✅ Completado | Webpay Plus con transacciones atómicas. |
| La Taberna (Tinta) | ✅ Completado | Sistema de moneda virtual y tienda de contenido premium. |
| Avatares Manga | 🔄 En Progreso | Generación con Stable Diffusion XL (Animagine XL 3.1) en Colab. |
| QA Completo | 🔄 En Progreso | Plan de pruebas en ejecución. |

---

## 9. Conclusiones

El proyecto Literatus Novelist ha completado exitosamente sus fases de fundamentos, construcción del núcleo y la mayoría de las integraciones de IA en el período académico planificado. El sistema demuestra una propuesta de valor sólida y diferenciada en el mercado de lectura digital, combinando acceso gratuito a literatura clásica con experiencias inmersivas potenciadas por IA generativa.

Los principales logros del período incluyen:
- Un catálogo funcional de más de 1,800 obras de dominio público.
- Un sistema de chat conversacional con personajes literarios basado en Gemini 2.0 con personalidades únicas.
- Un lector EPUB propio con narración sincronizada al estilo karaoke.
- Una pasarela de pagos real con Transbank y un sistema económico virtual gamificado.

Los próximos pasos se centran en completar la generación de avatares manga tipo visual novel, finalizar el ciclo de QA y preparar la documentación y entrega final al cliente.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

La app Angular 17 es SPA/PWA; el build Android con Capacitor envuelve la misma web, por lo que su lenguaje de diseño sigue siendo web.

## Users

Estudiantes (enseñanza media y universidad, principalmente en Chile) que deben leer clásicos del plan lector y buscan que esa lectura sea más llevadera: leer el texto completo, escucharlo, entenderlo conversando con sus personajes y adaptar la lectura a su forma de leer (TDAH, dislexia, fatiga visual). Leen en notebook o celular, a menudo de noche.

## Product Purpose

Literatus Novelist reduce la fricción de entrada a la lectura profunda de obras clásicas de dominio público en español. Éxito: que un estudiante encuentre la obra que necesita, empiece a leerla en segundos y vuelva hasta terminarla.

## Positioning

Clásicos íntegros en español que se pueden leer, escuchar con narración por voz y comprender conversando con sus personajes (avatares de IA por obra), con modos de lectura asistida para lectores neurodivergentes. Todo en una misma biblioteca, hoy sin costo de lectura.

## Operating Context

- Biblioteca personal con progreso de lectura, marcadores y "continuar leyendo".
- Lector por capítulos HTML con temas visuales, tipografías de lectura y narración cacheada por capítulo.
- Chat con personajes y autores asociados a cada edición.
- Gamificación: racha diaria, niveles, logros, misiones (La Senda, El Enigma, Logros).
- Economía virtual "Tinta" para interacciones con IA y extras; recargas vía Transbank Webpay Plus.
- Panel administrativo para gestionar libros, autores, géneros y avatares.

## Capabilities and Constraints

- **Hoy todos los libros del catálogo se leen gratis.** Las ediciones tienen campo `price` en la base, pero no se cobra la lectura.
- **Futuro (no implementado, no prometer):** que usuarios se registren como autores, publiquen sus libros y fijen su precio de venta.
- Idioma de la interfaz y del catálogo: español.
- Temas de accesibilidad existentes que toda superficie debe respetar: `neon`, `light-gallery`, `high-contrast-dark`, `high-contrast-light`, `sepia` (`src/styles.css`).
- Stack: Angular 17.3 + Angular CDK; backend Django REST; base PostgreSQL (Supabase compartida); voz con Azure Speech (F0, cupo limitado: no generar audio por visita).

## Brand Commitments

- Nombre "Literatus Novelist" y su logotipo actual (Cinzel) son obligatorios.
- Todo lo demás (mascota Maguito, vocabulario Tinta / La Taberna / La Senda / El Enigma, paleta, tipografías) puede replantearse.

## Evidence on Hand

- Catálogo real: el contador de la portada muestra 1.046 obras (dato vivo de la API).
- Listado de libros y personajes con su psicología: `respaldos-software/LiteratusNovelist-main/Producto/listado_completo_libros_y_personajes.md`.
- Portadas reales en Supabase Storage.
- Demo pública: https://www.novelatus.tech/
- No hay testimonios, reseñas de prensa, cifras de usuarios ni alianzas con colegios: no inventarlas.

## Product Principles

1. Leer primero: toda superficie acerca al estudiante a abrir un libro; lo demás es apoyo.
2. Demostrar, no prometer: mostrar la voz, los personajes y la lectura asistida funcionando de verdad.
3. Lenguaje llano: el estudiante entiende cada botón sin aprender jerga del producto.
4. Accesible por defecto: cada función respeta los temas de alto contraste, teclado y movimiento reducido.

## Accessibility & Inclusion

- Lectores con TDAH, dislexia o fatiga visual son público explícito (modos enfoque, lectura biónica, fuente para dislexia, narración).
- Temas de alto contraste nocturno y diurno obligatorios; respetar `prefers-reduced-motion`.
- Objetivo WCAG 2.1 AA (7:1 en temas de alto contraste).

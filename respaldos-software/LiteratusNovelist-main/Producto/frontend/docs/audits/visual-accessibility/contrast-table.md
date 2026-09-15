# Tabla de contraste WCAG 2.2 AA

Generada por `npm run audit:contrast`. Los colores con alfa se componen sobre el fondo indicado antes de calcular luminancia relativa.

| Componente | Elemento | Antes (texto/fondo) | Contraste anterior | Requisito | Problema | Corrección | Contraste final |
|---|---|---|---:|---:|---|---|---:|
| Público | Bordes de tarjetas | `#DED5D5` / `#FAF6F0` | 1.34:1 | 3.0:1 | El borde no delimitaba la superficie. | Token --color-border. `#8F8289` / `#FAF6F0` | 3.41:1 |
| Panel | Navegación lateral | `#64748B` / `#020617` | 4.24:1 | 4.5:1 | Texto normal bajo AA. | Token --color-text-secondary. `#C9BEB0` / `#0A1914` | 9.88:1 |
| Panel | Etiqueta de sección | `rgba(74,85,104,.8)` / `#020617` | 2.10:1 | 4.5:1 | Etiqueta casi invisible. | Texto secundario opaco. `#C9BEB0` / `#0A1914` | 9.88:1 |
| Panel | Placeholder | `#334155` / `#0F172A` | 1.72:1 | 4.5:1 | Ayuda de campo ilegible. | Token --color-text-disabled. `#A99B8C` / `#0F211A` | 6.19:1 |
| Panel | Versión del sistema | `#1E293B` / `#020617` | 1.38:1 | 4.5:1 | Texto informativo de bajo contraste. | Token --color-text-disabled. `#A99B8C` / `#0A1914` | 6.67:1 |
| Lector oscuro | Placeholder | `rgba(255,255,255,.35)` / `#1A1A2E` | 3.21:1 | 4.5:1 | Instrucción de entrada tenue. | Texto opaco accesible. `#A9B3C1` / `#1A1A2E` | 8.05:1 |
| Lector claro | Texto secundario | `rgba(30,41,59,.6)` / `#F8FAFC` | 3.99:1 | 4.5:1 | Metadatos bajo AA. | Gris opaco accesible. `#4E5968` / `#F8FAFC` | 6.80:1 |
| Lector sepia | Texto secundario | `rgba(74,59,50,.6)` / `#F4ECD8` | 3.19:1 | 4.5:1 | Metadatos bajo AA. | Tinta sepia reforzada. `#66513F` / `#F4ECD8` | 6.34:1 |
| Lector gris | Placeholder | `rgba(43,46,51,.5)` / `#D9DADD` | 2.68:1 | 4.5:1 | Placeholder bajo AA. | Gris de apoyo opaco. `#595E65` / `#D9DADD` | 4.67:1 |
| Lector nocturno | Placeholder OLED | `rgba(232,232,232,.3)` / `#0A0A0A` | 2.33:1 | 4.5:1 | Placeholder bajo AA. | Gris OLED accesible. `#A3A3A3` / `#0A0A0A` | 7.85:1 |
| Marca | Tinta sobre pergamino | `#5C5259` / `#EDDBC4` | 5.53:1 | 4.5:1 | Par de marca válido. | Reservado para texto normal. `#5C5259` / `#EDDBC4` | 5.53:1 |
| Marca | Tinta sobre salvia | `#FFFFFF` / `#A3C9A7` | 1.83:1 | 4.5:1 | Blanco sobre salvia falla. | Tinta #40383E. `#40383E` / `#A3C9A7` | 6.19:1 |
| Marca | Tinta sobre ámbar | `#FFFFFF` / `#FFB353` | 1.78:1 | 4.5:1 | Blanco sobre ámbar falla. | Tinta #40383E. `#40383E` / `#FFB353` | 6.38:1 |
| Marca | Tinta sobre coral | `#FFFFFF` / `#FF6E4A` | 2.77:1 | 4.5:1 | Blanco sobre coral falla. | Tinta #2A2025. `#2A2025` / `#FF6E4A` | 5.69:1 |
| Light Gallery | Acción primaria | `#FFFFFF` / `#5C5259` | 7.48:1 | 4.5:1 | Par ya válido; se normaliza a superficie. | Token --color-on-primary. `#FFFCF8` / `#5C5259` | 7.32:1 |
| Classic Dark | Acción primaria | `#1C1607` / `#D4AF37` | 8.56:1 | 4.5:1 | Par válido. | Tokens primary/on-primary. `#1C1607` / `#D4AF37` | 8.56:1 |
| Cyber Neon | Acción primaria | `#0B0F1A` / `#93C5FD` | 10.61:1 | 4.5:1 | Par válido. | Tokens primary/on-primary. `#0B0F1A` / `#93C5FD` | 10.61:1 |
| Estado claro | Éxito | `#2F6B3E` / `#EAF3EA` | 5.62:1 | 4.5:1 | Par semántico. | Tokens success. `#2F6B3E` / `#EAF3EA` | 5.62:1 |
| Estado claro | Advertencia | `#754915` / `#FFF1D6` | 6.91:1 | 4.5:1 | Par semántico. | Tokens warning. `#754915` / `#FFF1D6` | 6.91:1 |
| Estado claro | Información | `#275D74` / `#E6F2F6` | 6.33:1 | 4.5:1 | Par semántico. | Tokens info. `#275D74` / `#E6F2F6` | 6.33:1 |
| Estado claro | Error | `#96352E` / `#FBE9E6` | 6.29:1 | 4.5:1 | Par semántico. | Tokens error. `#96352E` / `#FBE9E6` | 6.29:1 |

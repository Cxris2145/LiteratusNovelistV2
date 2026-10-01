# La Taberna de Tinta — implementación y lanzamiento

Leer sigue siendo gratis. La suscripción amplía la forma en que interactúas con las historias.

## Oferta de la primera versión

| Plan | Mensualidad PayPal | Conversación activa diaria | Tokens diarios | Tinta mensual | Cosméticos |
| --- | --- | --- | --- | --- | --- |
| Aprendiz | US$7,99 | 5 horas | 100.000 | 0 | Opciones actuales |
| Maestro | US$14,99 | Sin límite horario | 300.000 | 500 por pago confirmado | Insignia y marco durante el período pagado |

Maestro está sujeto al cupo diario de tokens. Ambos planes respetan el progreso de lectura y el acceso a personajes y autores. El asistente general sigue gratis, incluso sin suscripción ni saldo. El audio conserva sus reglas anteriores. No se agregan resúmenes, temas premium, acceso anticipado, estadísticas avanzadas ni protectores mensuales.

La migración carga los planes sin activar cobros. La Taberna muestra la disponibilidad del servidor y deshabilita la contratación hasta completar la configuración de PayPal.

## Qué cambió

- Taberna compacta con planes, cuenta, consumo, saldo, historial, Bazar, recompensa diaria, recargas y preguntas frecuentes.
- Medidor compartido en los chats del lector y de personajes/autores. El envío pasa por un único servicio de suscripción y consentimiento.
- Cuota compartida por cuenta, reservada antes de generar y liquidada con el consumo real. Mensajes e instrucciones/contexto cuentan; el razonamiento facturable queda separado.
- Solicitudes UUID idempotentes: una respuesta completada se recupera desde el evento, sin otra llamada al proveedor ni otro cargo. Un mensaje simultáneo en la misma sesión espera al anterior.
- Cotizaciones de Tinta de dos minutos, vinculadas a cuenta, sesión y mensaje. El envío aceptado conserva ese precio aunque responda otro proveedor. Precio actual: 2 Tinta con Gemini configurado, 1 con sólo DeepSeek.
- Fallos y reservas vencidas liberan cuota o devuelven saldo. Las respuestas inválidas que reportan uso conservan su costo estimado para el piloto.
- Pagos PayPal deduplicados por notificación y por transacción. La aprobación o el estado ACTIVE por sí solos no entregan beneficios. Se verifica la firma con PayPal y se confirma la transacción mediante la API de la cuenta Business propietaria de la suscripción; además se rechaza cualquier receptor explícito distinto del merchant configurado.
- Cambio de plan con aprobación en PayPal, efectivo tras pagar la siguiente mensualidad. Cancelar conserva período y Tinta. Se conservan asociaciones históricas para notificaciones retrasadas de un contrato anterior.
- Marco Maestro con restauración del anterior disponible o del predeterminado al vencer. La insignia depende del período pagado.
- Cofres del servidor: 200/$990, 500/$1.990 y 1.200/$3.990 CLP. Taberna, carrito y checkout consultan ese catálogo. Se retiraron descuentos simulados que Webpay no aplicaba; el carrito explica que cada artículo se paga por separado.
- El endpoint de Tinta del anuncio simulado devuelve 410. La recompensa diaria y las compras del Bazar se ejecutan con bloqueo del saldo; alcanzar el máximo de escudos ya no descuenta Tinta.
- Los chats mantienen XP, misiones y logros, pero no el antiguo bono automático de 5 Tinta por respuesta, que superaba su precio y permitía fabricar saldo. Lectura, recompensas diarias, misiones, logros y rachas conservan sus recompensas.

## Reloj y reinicio diario

El cliente envía actividad cada 30 segundos con chat visible, foco y actividad en los últimos dos minutos. Pausa al ocultar, perder foco o destruir el chat. El servidor une los intervalos entre pestañas y dispositivos, sin multiplicarlos, y conserva fracciones de segundo entre consultas.

Una señal dura como máximo 35 segundos: si el navegador desaparece sin poder enviar la pausa, la reserva de actividad vence sola. La medianoche divide los intervalos entre los dos días. Los límites se calculan en `America/Santiago`, incluyendo días de 23 y 25 horas; los tokens reservados en una solicitud pertenecen al día en que empezó.

La reserva de tokens usa un máximo conservador del contexto UTF-8 más el límite de generación de 512 tokens. Se cobra sólo el uso real; cerca del límite una solicitud puede necesitar Tinta si no cabe su contexto y la reserva máxima. La interfaz explica este caso antes del cargo.

## Configuración de sandbox

Usar una base de datos de staging separada. No mezclar contratos, planes ni pagos de sandbox con producción.

Configurar en el backend:

```dotenv
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=<client-id de la aplicación Business sandbox>
PAYPAL_CLIENT_SECRET=<secreto, sólo en el servidor>
PAYPAL_MERCHANT_ID=<merchant/payer-id de esa misma cuenta Business>
PAYPAL_WEBHOOK_ID=<id del webhook creado para esa aplicación>
PAYPAL_PRODUCT_ID=<producto mensual; opcional antes de aprovisionar>
FRONTEND_URL=https://<frontend-staging>
GOOGLE_API_KEY=<clave del servidor>
GOOGLE_API_KEY_2=<respaldo opcional>
DEEPSEEK_API_KEY=<respaldo opcional>
AI_SUBSCRIPTION_MODEL=gemini-2.5-flash
AI_DEEPSEEK_MODEL=deepseek-flash
AI_GEMINI_INPUT_USD_PER_MILLION=0.30
AI_GEMINI_OUTPUT_USD_PER_MILLION=2.50
AI_DEEPSEEK_INPUT_USD_PER_MILLION=0.30
AI_DEEPSEEK_OUTPUT_USD_PER_MILLION=1.20
```

Los costos son estimaciones conservadoras; las tarifas son configurables y deben coincidir con el modelo contratado. Comparar el piloto con las facturas reales, incluyendo caché y horarios de tarifa del proveedor.

En el directorio `backend`, usando el Python del entorno del proyecto:

```powershell
python manage.py migrate
python manage.py provision_subscription_plans
```

El comando crea ambos planes bajo un único producto, guarda sus identificadores y valida producto, frecuencia y precio al ejecutarlo otra vez. Conservar en configuración el `PAYPAL_PRODUCT_ID` que imprime. Si ya existe el producto, pasar `--product-id <id>`.

Registrar el webhook HTTPS público:

```text
https://<backend>/api/v1/finance/paypal/webhook/
```

Eventos: `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`, `BILLING.SUBSCRIPTION.CREATED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED` y `BILLING.SUBSCRIPTION.PAYMENT.FAILED`.

Configurar en el servicio de despliegue estas tareas de mantenimiento:

```powershell
# Cada minuto: liberar reservas y restaurar marcos vencidos.
python manage.py maintain_subscriptions
# Periódicamente: recuperar pagos/notificaciones retrasadas.
python manage.py reconcile_subscriptions --days 31
# Después de una interrupción larga: hasta 365 días de recuperación.
python manage.py reconcile_subscriptions --days 365
```

La vuelta de PayPal también reconcilia el último mes. Una firma válida con un pago todavía ausente en la API devuelve un error reintentable; no entrega beneficios antes de confirmarlo.

## Interfaces

| Método | Ruta bajo `/api/v1/` | Uso |
| --- | --- | --- |
| GET | `finance/plans/` | Catálogo público y disponibilidad |
| GET | `finance/subscription/` | Plan, período, renovación, saldo y cosméticos |
| POST | `finance/subscription/subscribe/` | `plan_code`; devuelve aprobación PayPal |
| POST | `finance/subscription/change/` | `plan_code`; pide nueva aprobación |
| POST | `finance/subscription/cancel/` | Detiene renovaciones |
| POST | `finance/subscription/refresh/` | Reconcilia estado y pagos |
| POST | `finance/subscription/frame/` | Equipa marco Maestro vigente |
| GET | `finance/history/` | Pagos propios, con moneda y proveedor |
| GET | `finance/ink-packages/` | Cofres reales en CLP |
| GET | `ai/usage/` | Uso, reservas, saldo y siguiente reinicio |
| POST | `ai/usage/heartbeat/` | `session_id`, `client_id`, `active` |
| POST | `ai/chat/quote/` | `session_id`, `message`; cotización vinculada |
| POST | `ai/chat/` | `session_id`, `message`, `request_id`, `payment_mode`; `quote_id` al usar Tinta |

El frontend recibe cuotas/saldo actualizados tras el envío. Precio, límites, derechos y saldo se validan en Django. El chat de demostración mantiene las tres pruebas para visitantes y no sirve para saltarse el consumo de una cuenta autenticada.

## Verificación local

`config.test_settings` usa SQLite en memoria y no conecta a Supabase. Para un preview persistente, `LITERATUS_TEST_DB` acepta una ruta de SQLite. No usar estos settings en producción.

```powershell
python manage.py test ai_engine.test_usage ai_engine.test_concurrency finance.test_subscriptions learning.tests --settings=config.test_settings
python manage.py check --settings=config.test_settings
python manage.py makemigrations --check --dry-run --settings=config.test_settings
```

Las dos pruebas de concurrencia con hilos requieren PostgreSQL real. Para ejecutarlas, configurar `LITERATUS_TEST_DATABASE_URL` con una base aislada cuyo nombre empiece con `literatus_test`, y un usuario capaz de crear la base temporal de Django. SQLite no permite comprobar `SELECT FOR UPDATE` y esas dos pruebas se omiten allí.

En `frontend`:

```powershell
npm run build
npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/core/services/subscription.service.spec.ts --include=src/app/core/components/ai-usage-meter/ai-usage-meter.component.spec.ts --include=src/app/library/tavern/tavern.component.spec.ts
node scripts/tavern-audit.mjs
```

El último comando usa un navegador sin interfaz y fixtures aisladas; no compra ni escribe cuentas reales. Produce capturas de 1440 y 390 px en los seis temas y un informe de desbordamiento, contenido y contraste en `frontend/docs/audits/taberna/`. Las cifras de esas capturas son exclusivamente datos de QA. El producto consulta siempre la cuenta real.

Verificación realizada el 30 de septiembre de 2026: 70 pruebas de backend y 9 de frontend aprobadas; las dos pruebas que requieren PostgreSQL quedaron omitidas en SQLite. La compilación de producción, la comprobación de Django y la comprobación de migraciones pasaron. La auditoría visual cubrió 12 combinaciones de tema y ancho, sin desbordamiento horizontal y con contraste mínimo de 5,02:1 en los elementos evaluados. Los flujos de PayPal se probaron con respuestas controladas; la validación externa en sandbox y PostgreSQL sigue pendiente.

## Piloto de 30 días y publicación

```powershell
python manage.py export_subscription_pilot --days 30 > piloto-suscripciones.json
```

El informe incluye costos/consumo por usuario, personaje y plan, modalidad/resultados, actividad, días de agotamiento, pagos, ingreso USD, conversión desde contratación iniciada, cancelaciones actuales y movimientos de Tinta. Cada solicitud conserva el plan vigente al reservar, incluso si después cambia la suscripción. No se ajusta automáticamente ningún precio ni límite.

Antes de publicar, completar en PayPal sandbox las compras de ambos planes, renovaciones, cambios aprobados y abandonados, cancelaciones y cobros rechazados. Repetir notificaciones duplicadas/desordenadas; comprobar bono único, período pagado y marco restaurado. Ejecutar las pruebas concurrentes contra PostgreSQL de staging y una conversación real de cada proveedor, con fallos controlados y costo contrastado con su panel.

La cuenta PayPal Business de producción debe estar habilitada. Crear producto/planes/webhook de producción con sus credenciales y `PAYPAL_ENVIRONMENT=live`; no reutilizar identificadores de sandbox. Aplicar migraciones y mantenimiento en producción sólo después de esas verificaciones. Esta implementación no publica ni modifica la base compartida por sí sola.

Referencias oficiales: [tokens de Gemini](https://ai.google.dev/gemini-api/docs/tokens), [cambios de plan PayPal](https://developer.paypal.com/subscriptions/tiers), [webhooks de suscripción](https://developer.paypal.com/subscriptions/webhooks), [transacciones confirmadas](https://developer.paypal.com/api/subscriptions/v1/definitions/transaction/), [modelos y tarifas de DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/).

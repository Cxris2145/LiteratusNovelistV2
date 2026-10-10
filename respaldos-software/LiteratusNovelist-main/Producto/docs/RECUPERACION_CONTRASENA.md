# Recuperación de contraseña por correo

El enlace «¿Olvidaste tu contraseña?» abre un flujo de tres pasos: correo, código de seis dígitos y contraseña nueva con confirmación. El servidor rechaza la contraseña actual, contraseñas débiles y confirmaciones diferentes. Después del cambio se vuelve al inicio de sesión y se envía un aviso por correo sin incluir la contraseña.

## API

- `POST /api/v1/users/password-reset/`: `{ "email": "lector@example.com" }`. Respuesta genérica para cuentas existentes, desconocidas e inactivas. Incluye `expires_in: 600` y `resend_after: 60`.
- `POST /api/v1/users/password-reset-verify/`: `{ "email": "lector@example.com", "code": "123456" }`. Un código válido se consume y devuelve `reset_token` con vigencia de 10 minutos.
- `POST /api/v1/users/password-reset-confirm/`: correo, `reset_token`, `new_password` y `confirm_password`. Rechaza intentos sin verificar primero el código. Los enlaces anteriores llevan a solicitar un código nuevo.

## Controles

Los códigos se generan con `secrets`, duran 10 minutos y admiten cinco intentos fallidos. Reenviar reemplaza el código y cualquier permiso anterior; espera mínima de 60 segundos y cinco envíos por cuenta por hora. La base guarda HMAC con una clave del servidor, nunca el código o permiso en claro. El estado persiste entre workers; las operaciones se serializan bloqueando la cuenta en PostgreSQL. Los límites adicionales por IP usan la caché de Django (10 solicitudes/hora y 30 verificaciones/minuto).

El permiso para cambiar la contraseña dura otros 10 minutos, queda solamente en memoria del frontend y se consume al guardar. Las respuestas llevan `Cache-Control: no-store`. Cambiar el correo o la contraseña invalida la recuperación pendiente. La comparación de la contraseña anterior usa el hash del servidor. Se conservan los validadores de Django usados al registrarse.

Se activa `CHECK_REVOKE_TOKEN` de SimpleJWT y se comprueba también el hash al refrescar tokens. Una contraseña cambiada invalida las sesiones anteriores. Al desplegar esta configuración, las sesiones creadas antes de incorporar ese dato deberán iniciar sesión de nuevo.

Se consultó la [guía de recuperación de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) para los controles de caducidad, uso único, límites y confirmación.

## Correo real y despliegue

Se reutiliza el transporte existente de Literatus. Una `EMAIL_HOST_PASSWORD` de Resend (`re_…`) usa su API; otras credenciales usan SMTP (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_SSL`, `EMAIL_USE_TLS`). `DEFAULT_FROM_EMAIL` debe ser un remitente autorizado por el proveedor. Guardar las credenciales en el entorno del servidor o el `.env` local; nunca en Git ni en la conversación.

La configuración local tiene una clave de Resend guardada únicamente en el `.env` ignorado por Git y usa `Literatus <onboarding@resend.dev>` como remitente de prueba. Resend aceptó un correo de prueba enviado a la dirección indicada por el usuario, quien confirmó su recepción. La clave permite enviar mensajes; no permite consultar su estado. La aceptación por la API por sí sola no confirma que el mensaje esté en la bandeja de entrada.

El dominio `resend.dev` solo permite enviar al correo de la cuenta de Resend. Para entregar recuperaciones a otros usuarios, verificar un dominio propio y cambiar `DEFAULT_FROM_EMAIL` a una dirección de ese dominio. Véase la [limitación del remitente de prueba de Resend](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

La auditoría con `config.test_settings` guarda los mensajes en `backend/.tmp-achievements-preview/mail/`; no los entrega a bandejas reales. Los backends de prueba de Django nunca llaman a Resend, aunque haya una clave configurada.

El backend local quedó iniciado con `--settings=config.preview_settings` para envíos reales con SQLite. Este modo usa las credenciales de `.env` sin cambiar de base; los enlaces de verificación apuntan al frontend local en `http://127.0.0.1:4300`. Las cuentas nuevas usan los hashers normales de Django y las cuentas ficticias anteriores pueden iniciar sesión con su hash de prueba. Sin credencial configurada, la recuperación devuelve `503 EMAIL_UNAVAILABLE` y la página permanece en el paso de correo. Las cuentas de la base compartida no existen automáticamente en esta SQLite: el correo debe pertenecer a una cuenta local activa.

Migración nueva: `users/0013_password_reset_challenge.py`. Se aplicó únicamente a la SQLite aislada. Para publicar, desplegar backend y frontend, configurar el correo y ejecutar las migraciones del servidor. No se modificó la base compartida de Supabase.

## Validación y reproducción local

Pasaron las pruebas de usuarios, comunidad, aprendizaje y biblioteca; 26 pruebas nuevas cubren recuperación, incluido el servicio de correo sin configurar. También pasaron el compilador Angular y la compilación de producción. Esta última mantiene las advertencias existentes de tamaño de bundle, CommonJS y selectores de transiciones.

La auditoría `frontend/scripts/audit-password-recovery.mjs` usa un navegador real contra la API y correos aislados. Comprueba solicitud, verificación, código incorrecto, confirmación distinta, contraseña anterior, contraseña débil, guardado, login y acceso directo sin permiso. Genera 20 capturas en 1440 px y 390 px, con los temas oscuro y claro; sin errores de JavaScript ni desbordamiento horizontal. Resultados en `frontend/docs/audits/password-recovery/audit.json`.

1. Desde `backend`, ejecutar `.venv/Scripts/python.exe scripts/preview_password_recovery.py` para migrar la SQLite y preparar la cuenta ficticia de auditoría. Solo reinicia la contraseña de esa cuenta de prueba.
2. Iniciar Django con `--settings=config.test_settings --noreload` en `127.0.0.1:8010`, definiendo `LITERATUS_TEST_DB` como la ruta absoluta de `backend/.tmp-achievements-preview/preview.sqlite3` y `LITERATUS_PREVIEW_EMAIL_DIR` como la ruta absoluta de `backend/.tmp-achievements-preview/mail`.
3. Iniciar Angular con `ng serve --configuration preview --port 4300 --host 127.0.0.1`.
4. Desde `frontend`, ejecutar `node scripts/audit-password-recovery.mjs`.

Las pruebas automatizadas usan `config.test_settings` sin esas variables de vista previa y nunca conectan a Supabase.

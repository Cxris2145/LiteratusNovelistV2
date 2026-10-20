# Enviar los correos de Literatus desde tu Gmail (Google Apps Script)

Los códigos de recuperación de contraseña, los enlaces de verificación de cuenta y el aviso de
"tu contraseña cambió" salen desde tu Gmail. Es gratis, no necesita un dominio propio y funciona
en Render gratis: el backend llama al script por HTTPS, y Render solo bloquea SMTP.

Cómo funciona: el backend hace un POST a una app web de Apps Script con el destinatario, el
asunto, el texto y una clave secreta. El script revisa la clave y envía el correo con tu Gmail.
Si `APPS_SCRIPT_MAIL_URL` y `APPS_SCRIPT_MAIL_SECRET` están configuradas, tienen prioridad sobre
Resend. Si quitas cualquiera de las dos, el backend vuelve a usar Resend.

## 1. Crear el proyecto

1. Entra a <https://script.google.com> con el Gmail desde el que quieres enviar los correos.
2. Pulsa **Nuevo proyecto**. Arriba a la izquierda, cambia "Proyecto sin título" por
   `Literatus correos`.
3. Borra todo el contenido de `Código.gs`, pega el de [`Codigo.gs`](Codigo.gs) (en esta misma
   carpeta) y guarda con **Ctrl + S**.

## 2. Guardar la clave secreta

1. En la barra izquierda, abre **Configuración del proyecto** (el engranaje).
2. Al final de la página, en **Propiedades de secuencia de comandos**, pulsa
   **Agregar propiedad de secuencia de comandos**.
3. En **Propiedad** escribe `MAIL_SECRET`. En **Valor** pega el valor de
   `APPS_SCRIPT_MAIL_SECRET` del archivo `backend/.env`: es una clave larga que ya viene generada.
4. Pulsa **Guardar propiedades de secuencia de comandos**.

## 3. Dar permiso y probar

1. Vuelve al **Editor** (el icono `< >`).
2. En el menú de funciones de arriba, elige `probarEnvio` y pulsa **Ejecutar**.
3. Google pide permisos: **Revisar permisos**, elige tu cuenta y luego verás
   "Google no verificó esta app". Es normal, porque el script es tuyo: pulsa **Configuración
   avanzada**, luego **Ir a Literatus correos (no seguro)** y después **Permitir**.
4. Revisa tu Gmail: tiene que llegar "Prueba de Literatus Novelist". En el **Registro de
   ejecución** debe decir "MAIL_SECRET está configurado".

## 4. Publicarlo como aplicación web

1. Arriba a la derecha, pulsa **Implementar** y luego **Nueva implementación**.
2. Junto a "Seleccionar tipo", pulsa el engranaje y elige **Aplicación web**.
3. Completa así:
   - **Descripción:** `v1`
   - **Ejecutar como:** **Yo** (tu correo)
   - **Quién tiene acceso:** **Cualquier usuario**. No elijas "Cualquier usuario con cuenta de
     Google": el backend no inicia sesión en Google, y con esa opción el envío falla.
4. Pulsa **Implementar** y copia la **URL de la aplicación web**. Termina en `/exec`.

## 5. Conectar el backend

- **Local:** en `backend/.env`, pega la URL en `APPS_SCRIPT_MAIL_URL=` y reinicia el backend.
  `runserver` no relee el `.env` por sí solo.
- **Render:** en el servicio, abre **Environment** y agrega `APPS_SCRIPT_MAIL_URL` (la URL) y
  `APPS_SCRIPT_MAIL_SECRET` (el mismo valor que pusiste en `MAIL_SECRET`). Guarda: Render
  vuelve a desplegar el servicio.

Para probarlo, abre `/forgot-password` y pide un código para una cuenta registrada con
cualquier Gmail.

## Bueno saber

- **Límite:** un Gmail personal puede enviar a 100 destinatarios al día desde Apps Script. Cada
  recuperación gasta 2 (el código y el aviso de cambio), y cada registro gasta 1. El cupo se
  libera 24 horas después del primer envío.
- Los correos se envían desde tu Gmail con el nombre "Literatus", y una copia queda en tu
  carpeta **Enviados**.
- **Si cambias el código del script:** ve a **Implementar**, luego a **Administrar
  implementaciones**, pulsa el lápiz, elige **Versión: Nueva versión** e **Implementar**. La URL
  no cambia. Si no haces esto, la URL sigue usando el código anterior.
- **No compartas la URL ni la clave.** Con las dos, cualquiera podría enviar correos desde tu
  Gmail. Si se filtran, cambia `MAIL_SECRET` en el script y `APPS_SCRIPT_MAIL_SECRET` en el
  backend al mismo valor nuevo (al menos 32 caracteres).

## Si algo falla

El backend registra el error en su log (por ejemplo, "No se pudo enviar el código de
recuperación"). Al usuario siempre se le muestra el mismo mensaje, para no revelar qué cuentas
existen.

| Error en el log | Qué revisar |
|---|---|
| `Apps Script no respondió JSON` | El acceso no está en **Cualquier usuario**, o la URL no termina en `/exec` |
| `unauthorized` | `MAIL_SECRET` y `APPS_SCRIPT_MAIL_SECRET` no son iguales |
| `secret_not_configured` | Falta la propiedad `MAIL_SECRET`, o tiene menos de 32 caracteres |
| `daily_quota_exceeded` | Ya se usaron los 100 envíos del día |
| `send_failed` | Gmail rechazó el envío; el detalle viene en el mismo mensaje |

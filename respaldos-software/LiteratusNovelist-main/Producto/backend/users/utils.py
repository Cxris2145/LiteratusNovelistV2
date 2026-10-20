import os
import json
import urllib.request
from email.utils import parseaddr
from django.core.mail import send_mail as django_send_mail
from django.conf import settings
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.html import escape


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """
    Generador de tokens para verificación de correo.
    No incluye last_login en el hash para evitar que el token se invalide
    si el usuario intenta hacer login antes de verificar su cuenta.
    """
    def _make_hash_value(self, user, timestamp):
        # Solo usar pk, is_active y timestamp (excluir last_login)
        return f"{user.pk}{user.is_active}{timestamp}"


# Instancia del generador personalizado para verificación de correo
email_verification_token = EmailVerificationTokenGenerator()

SMTP_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'


def apps_script_is_configured():
    """Envío desde un Gmail con la app web de Google Apps Script (docs/correo-gmail-apps-script)."""
    return bool(settings.APPS_SCRIPT_MAIL_URL and settings.APPS_SCRIPT_MAIL_SECRET)


def email_is_configured():
    """Hay forma de enviar correos: Apps Script, una clave (Resend o SMTP) o un backend que no sea SMTP (tests, consola)."""
    return (apps_script_is_configured() or bool(settings.EMAIL_HOST_PASSWORD)
            or settings.EMAIL_BACKEND != SMTP_BACKEND)


def send_mail_via_apps_script(subject, message, from_email, recipient_list, html_message=None):
    """
    Pide a la app web de Apps Script que envíe el correo desde el Gmail de su dueño.
    Va por HTTPS, así que funciona en Render gratis (que bloquea SMTP), y no necesita dominio propio.
    Apps Script siempre responde 200: el resultado real viene en el JSON {ok, error}.
    """
    sender_name = parseaddr(from_email or '')[0] or 'Literatus Novelist'
    for recipient in recipient_list:
        payload = {
            'secret': settings.APPS_SCRIPT_MAIL_SECRET,
            'to': recipient,
            'subject': subject,
            'text': message,
            'html': html_message or '',
            'name': sender_name,
        }
        req = urllib.request.Request(
            settings.APPS_SCRIPT_MAIL_URL, data=json.dumps(payload).encode('utf-8'), method='POST',
            headers={'Content-Type': 'application/json', 'User-Agent': 'LiteratusNovelist/1.0'})
        try:
            # Google contesta el POST con una redirección; urllib la sigue con GET, que es lo esperado.
            with urllib.request.urlopen(req, timeout=20) as response:
                body = response.read().decode('utf-8', errors='ignore')
        except Exception as e:
            raise Exception(f'Fallo al enviar correo via Apps Script: {e}') from e
        try:
            result = json.loads(body)
        except ValueError:
            raise Exception('Apps Script no respondió JSON: revisa que la app web esté implementada '
                            'con acceso "Cualquier usuario" y que la URL termine en /exec.')
        if not result.get('ok'):
            raise Exception(f"Apps Script no envió el correo: {result.get('error')} {result.get('detail', '')}".strip())


def send_app_email(subject, message, from_email, recipient_list, html_message=None):
    """
    Envía los correos de la app por HTTPS, porque Render gratis bloquea los puertos SMTP (465/587):
    primero con Apps Script si está configurado, si no con la API REST de Resend.
    Sin ninguno de los dos (o en tests y consola) usa el backend de correo de Django.
    """
    if settings.EMAIL_BACKEND == SMTP_BACKEND and apps_script_is_configured():
        return send_mail_via_apps_script(subject, message, from_email, recipient_list, html_message)

    api_key = settings.EMAIL_HOST_PASSWORD
    if (settings.EMAIL_BACKEND == SMTP_BACKEND
            and api_key and api_key.startswith('re_')):
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "LiteratusNovelist/1.0"
        }
        data = {
            "from": from_email,
            "to": recipient_list,
            "subject": subject,
            "text": message
        }
        if html_message:
            data["html"] = html_message
            
        req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                return True
        except Exception as e:
            error_msg = str(e)
            if hasattr(e, 'read'):
                error_msg += f" - {e.read().decode('utf-8', errors='ignore')}"
            print(f"Error en Resend REST API: {error_msg}")
            # NO hacemos fallback a SMTP aquí porque Render lo bloqueará y causará un Timeout 504.
            # Mejor que falle rápido para no colgar el servidor.
            raise Exception(f"Fallo al enviar correo via Resend API: {error_msg}")
            
    # Fallback a SMTP clásico solo si NO estamos usando Resend
    django_send_mail(
        subject=subject,
        message=message,
        from_email=from_email,
        recipient_list=recipient_list,
        html_message=html_message,
        fail_silently=False,
    )

def send_verification_email(user):
    """
    Envía el correo de verificación de cuenta al usuario.
    """
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    # Usar el generador personalizado que no incluye last_login
    token = email_verification_token.make_token(user)
    
    frontend_url = settings.FRONTEND_URL
    verify_url = f"{frontend_url}/verify-email?uid={uid}&token={token}"
    
    subject = "Verifica tu cuenta en Literatus Novelist"
    
    # Plantilla HTML Básica y minimalista para Literatus
    html_message = f"""
    <html>
    <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 40px 0; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="padding: 40px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                <h1 style="margin: 0; font-size: 24px; color: #0f172a; font-family: Georgia, serif;">Literatus Novelist</h1>
            </div>
            <div style="padding: 40px;">
                <h2 style="margin-top: 0; font-size: 20px;">¡Bienvenido/a, {user.username}!</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #475569;">
                    Gracias por unirte a Literatus Novelist. Estás a un solo paso de poder conversar con los personajes literarios más grandes de la historia.
                </p>
                <p style="font-size: 16px; line-height: 1.6; color: #475569;">
                    Por favor, confirma tu dirección de correo electrónico haciendo clic en el siguiente botón:
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verify_url}" style="background-color: #0f172a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Verificar mi cuenta</a>
                </div>
                <p style="font-size: 14px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                    Si no creaste esta cuenta, puedes ignorar este correo sin problemas.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_message = f"Bienvenido a Literatus Novelist.\nPara verificar tu cuenta, copia y pega el siguiente enlace en tu navegador:\n{verify_url}"
    
    send_app_email(
        subject=subject,
        message=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        html_message=html_message
    )

def send_password_reset_code_email(user, code, expires_minutes):
    """El código solo viaja al correo del dueño de la cuenta."""
    plain_message = (
        f'Hola {user.username},\n\nTu código de recuperación de Literatus es: {code}\n'
        f'Ingresa este código en la página de recuperación. Caduca en {expires_minutes} minutos '
        'y solo se puede usar una vez. No lo compartas.\n\n'
        'Si no solicitaste este cambio, ignora este correo. Tu contraseña no se ha cambiado.'
    )
    html_message = f"""
    <html lang="es"><body style="font-family: Arial, sans-serif; background: #f1f5fb; padding: 32px 16px; color: #15233b;">
      <div style="max-width: 520px; margin: auto; background: white; padding: 32px; border-radius: 12px;">
        <h1 style="font-family: Georgia, serif; font-size: 26px;">Literatus Novelist</h1>
        <h2 style="font-size: 20px;">Tu código de recuperación</h2>
        <p>Hola, {escape(user.username)}. Ingresa este código en la página de recuperación:</p>
        <p style="font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 20px; background: #dee7f4; text-align: center;">{code}</p>
        <p>Caduca en {expires_minutes} minutos y solo se puede usar una vez. No lo compartas.</p>
        <p style="font-size: 14px; color: #466699;">Si no solicitaste este cambio, ignora este correo. Tu contraseña no se ha cambiado.</p>
      </div>
    </body></html>"""
    send_app_email('Tu código de recuperación - Literatus Novelist', plain_message,
                           settings.DEFAULT_FROM_EMAIL, [user.email], html_message=html_message)


def send_password_changed_email(user):
    send_app_email(
        'Tu contraseña se ha actualizado - Literatus Novelist',
        f'Hola {user.username},\n\nLa contraseña de tu cuenta en Literatus se ha actualizado. '
        'Ya puedes iniciar sesión con tu contraseña nueva.\n\n'
        'Si no fuiste tú, solicita un código de recuperación para proteger tu cuenta.',
        settings.DEFAULT_FROM_EMAIL, [user.email])

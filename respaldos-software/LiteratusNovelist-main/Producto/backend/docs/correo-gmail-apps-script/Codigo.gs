/**
 * Literatus Novelist: envía los correos de la app (códigos de recuperación, verificación de
 * cuenta) desde tu Gmail. Se publica como app web; el backend le hace POST con JSON
 * {secret, to, subject, text, html, name} y recibe {ok: true} o {ok: false, error}.
 *
 * El secreto se guarda en Configuración del proyecto > Propiedades de secuencia de comandos,
 * con el nombre MAIL_SECRET, y debe ser igual a APPS_SCRIPT_MAIL_SECRET del backend.
 * Gmail personal: máximo 100 destinatarios al día.
 * Guía completa: README.md en esta misma carpeta.
 */

const MAX_BODY_CHARS = 100000;
const EMAIL_PATTERN = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return reply({ ok: false, error: 'invalid_json' });
  }

  const secret = PropertiesService.getScriptProperties().getProperty('MAIL_SECRET');
  if (!secret || secret.length < 32) return reply({ ok: false, error: 'secret_not_configured' });
  if (data.secret !== secret) return reply({ ok: false, error: 'unauthorized' });

  // Un solo destinatario por llamada: el backend nunca manda a varios a la vez.
  const to = String(data.to || '').trim();
  const subject = String(data.subject || '').trim().slice(0, 200);
  const text = String(data.text || '');
  const html = String(data.html || '');
  if (!EMAIL_PATTERN.test(to)) return reply({ ok: false, error: 'invalid_recipient' });
  if (!subject || !text || text.length > MAX_BODY_CHARS || html.length > MAX_BODY_CHARS) {
    return reply({ ok: false, error: 'invalid_message' });
  }
  if (MailApp.getRemainingDailyQuota() < 1) return reply({ ok: false, error: 'daily_quota_exceeded' });

  const message = { to: to, subject: subject, body: text, name: String(data.name || 'Literatus Novelist').slice(0, 60) };
  if (html) message.htmlBody = html;
  try {
    MailApp.sendEmail(message);
  } catch (err) {
    return reply({ ok: false, error: 'send_failed', detail: String(err).slice(0, 300) });
  }
  return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Ejecútala una vez desde el editor (botón "Ejecutar"): pide el permiso para enviar correos
 * y te manda un correo de prueba a ti mismo.
 */
function probarEnvio() {
  const me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail(me, 'Prueba de Literatus Novelist', 'Si lees esto, el script ya puede enviar correos desde tu Gmail.');
  Logger.log('Correo de prueba enviado a ' + me + '. Te quedan ' + MailApp.getRemainingDailyQuota() + ' envíos hoy.');
  const secret = PropertiesService.getScriptProperties().getProperty('MAIL_SECRET');
  Logger.log(secret && secret.length >= 32
    ? 'MAIL_SECRET está configurado.'
    : 'Falta MAIL_SECRET (o tiene menos de 32 caracteres) en las propiedades del proyecto.');
}

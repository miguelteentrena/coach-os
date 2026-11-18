/**
 * COACH OS — Sincronización del CRM «CRM DE CLIENTES TMT» → COACH OS
 *
 * Instalación (una vez):
 *  1. Abre la hoja → Extensiones → Apps Script → pega este archivo.
 *  2. En «Servicios» (+) añade «Google Sheets API» (servicio avanzado, identificador: Sheets).
 *  3. Configuración del proyecto → Propiedades del script:
 *       COACHOS_URL    = https://coach-os-pearl-tau.vercel.app/api/webhooks/crm
 *       COACHOS_SECRET = <mismo valor que CRM_WEBHOOK_SECRET en Vercel>
 *  4. Ejecuta instalar() una vez y acepta los permisos.
 *
 * Qué hace: cuando cambias la hoja (editar, añadir filas, pegar) envía el CRM completo,
 * firmado con HMAC-SHA256, a COACH OS. Además envía un respaldo cada hora.
 * Usa la API avanzada para leer también los enlaces de los chips (informes de Google Docs).
 */
var SHEET_NAME = 'Gestión de Clientes';

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  var ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('alCambiar').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('alCambiar').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('enviarCRM').timeBased().everyHours(1).create();
  enviarCRM();
}

// Agrupa ráfagas de ediciones: espera 20 s antes de enviar
function alCambiar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { Utilities.sleep(20000); enviarCRM(); } finally { lock.releaseLock(); }
}

function enviarCRM() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('COACHOS_URL'), secret = props.getProperty('COACHOS_SECRET');
  if (!url || !secret) throw new Error('Faltan COACHOS_URL / COACHOS_SECRET en Propiedades del script');
  var id = SpreadsheetApp.getActive().getId();
  var res = Sheets.Spreadsheets.get(id, {
    ranges: ["'" + SHEET_NAME + "'!A1:AE1000"],
    includeGridData: true,
    fields: 'sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue,chipRuns)'
  });
  var rows = (res.sheets[0].data[0].rowData || []);
  var body = JSON.stringify({ rows: rows, sentAt: new Date().toISOString() });
  var sig = Utilities.computeHmacSha256Signature(body, secret, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json; charset=utf-8', payload: body,
    headers: { 'X-CoachOS-Signature': sig }, muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) {
    console.error('COACH OS respondió ' + r.getResponseCode() + ': ' + r.getContentText());
    throw new Error('Sincronización fallida: ' + r.getResponseCode());
  }
  console.log('COACH OS OK: ' + r.getContentText());
}

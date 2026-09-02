/**
 * BACKEND PARA "PLANIFICACIÓN DE VACACIONES · ENFERMERÍA"
 *
 * Este script se vincula al Google Spreadsheet que contiene (o va a
 * contener, se crean solas si faltan) las pestañas:
 *   - "enfermeros"    -> nombres del personal, uno por fila en columna A
 *   - "vacaciones"    -> se escribe y lee automáticamente
 *   - "feriados"      -> se escribe y lee automáticamente
 *   - "configuracion" -> pares Clave/Valor: sector, turno, cicloInicio
 *
 * Instalación (una sola vez):
 * 1) Abrí tu Google Sheet -> Extensiones -> Apps Script
 * 2) Pegá TODO este archivo reemplazando el contenido de ejemplo
 * 3) Implementar -> Nueva implementación -> tipo "Aplicación web"
 *    Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 * 4) Copiá la URL que termina en /exec
 * 5) Pegala UNA VEZ en app.js, en la constante API_URL (arriba del todo)
 */

const SHEET_NURSES = 'enfermeros';
const SHEET_VAC = 'vacaciones';
const SHEET_HOL = 'feriados';
const SHEET_CFG = 'configuracion';

// El ciclo va de octubre a julio. Si "configuracion" no trae un año
// definido, se calcula solo a partir de la fecha de hoy, para que la
// app siga funcionando ciclo tras ciclo sin tocar código nunca más.
function defaultCycleYear_() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  return m >= 10 ? y : y - 1;
}

function doGet(e) {
  return json_(getState_());
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'saveState':
        saveState_(body.state || {});
        return json_({ok:true, message:'Estado guardado'});
      case 'addNurse':
        return json_(addNurse_(body.name));
      case 'deleteNurse':
        return json_(deleteNurse_(body.name));
      default:
        return json_({ok:false, message:'Acción no reconocida'});
    }
  } catch (err) {
    return json_({ok:false, message:String(err)});
  }
}

function getStaff_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NURSES);
  if (!sh) return [];
  const values = sh.getRange(1,1,Math.max(sh.getLastRow(),1),1).getDisplayValues()
    .flat().map(x => String(x).trim()).filter(Boolean);
  // Ignora un encabezado habitual si lo hubiera.
  return values.filter(x => !/^(enfermeros?|nombre|apellido y nombre)$/i.test(x));
}

function addNurse_(name) {
  name = String(name || '').trim();
  if (!name) return {ok:false, message:'El nombre está vacío'};
  const existing = getStaff_();
  if (existing.some(n => n.toLowerCase() === name.toLowerCase())) {
    return {ok:false, message:'Ese enfermero ya está en la lista'};
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NURSES);
  if (!sh) sh = ss.insertSheet(SHEET_NURSES);
  sh.appendRow([name]);
  return {ok:true};
}

function deleteNurse_(name) {
  name = String(name || '').trim();
  if (!name) return {ok:false, message:'El nombre está vacío'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sh = ss.getSheetByName(SHEET_NURSES);
  if (sh) {
    const values = sh.getRange(1,1,Math.max(sh.getLastRow(),1),1).getDisplayValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]).trim().toLowerCase() === name.toLowerCase()) {
        sh.deleteRow(i + 1);
      }
    }
  }

  // Cascada: también borra las vacaciones ya cargadas de esa persona.
  const vac = ss.getSheetByName(SHEET_VAC);
  if (vac && vac.getLastRow() > 1) {
    const data = vac.getDataRange().getValues();
    const header = data[0];
    const rest = data.slice(1).filter(r => String(r[0]).trim().toLowerCase() !== name.toLowerCase());
    vac.clearContents();
    vac.getRange(1,1,1,header.length).setValues([header]);
    if (rest.length) vac.getRange(2,1,rest.length,header.length).setValues(rest);
  }
  return {ok:true};
}

function normKey_(k) {
  return String(k || '').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
}

function getConfig_() {
  const rows = readSheet_(SHEET_CFG);
  const map = {};
  rows.forEach(r => {
    const k = normKey_(r[0]);
    if (k) map[k] = r[1];
  });
  const cycleRaw = map['cicloinicio'] || map['ciclo'] || map['anio'] || map['ano'] || map['cyclestartyear'] || '';
  return {
    sector: (map['sector'] || 'PISO ADULTO').toString(),
    shift: (map['turno'] || map['shift'] || 'SADOFE').toString(),
    cycleStartYear: cycleRaw ? Number(cycleRaw) : defaultCycleYear_()
  };
}

function getState_() {
  const staff = getStaff_();
  const vac = readSheet_(SHEET_VAC);
  const hol = readSheet_(SHEET_HOL);
  const cfg = getConfig_();
  return {
    staff: staff,
    assignments: vac.slice(1).filter(r => r[0] && r[1]).map(r => ({
      nurse: String(r[0]), date: formatDate_(r[1]), note: r[2] || ''
    })),
    holidays: hol.slice(1).filter(r => r[0]).map(r => ({
      date: formatDate_(r[0]), name: r[1] || ''
    })),
    cycleStartYear: cfg.cycleStartYear,
    sector: cfg.sector,
    shift: cfg.shift
  };
}

function saveState_(state) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let vac = ss.getSheetByName(SHEET_VAC);
  if (!vac) vac = ss.insertSheet(SHEET_VAC);
  vac.clearContents();
  vac.getRange(1,1,1,3).setValues([['Enfermero','Fecha','Observación']]);
  const va = (state.assignments || []).map(a => [a.nurse, a.date, a.note || '']);
  if (va.length) vac.getRange(2,1,va.length,3).setValues(va);

  let hol = ss.getSheetByName(SHEET_HOL);
  if (!hol) hol = ss.insertSheet(SHEET_HOL);
  hol.clearContents();
  hol.getRange(1,1,1,2).setValues([['Fecha','Feriado']]);
  const ha = (state.holidays || []).map(h => [h.date, h.name || '']);
  if (ha.length) hol.getRange(2,1,ha.length,2).setValues(ha);

  let cfg = ss.getSheetByName(SHEET_CFG);
  if (!cfg) cfg = ss.insertSheet(SHEET_CFG);
  cfg.clearContents();
  cfg.getRange(1,1,1,2).setValues([['Clave','Valor']]);
  cfg.getRange(2,1,3,2).setValues([
    ['sector', state.sector || 'PISO ADULTO'],
    ['turno', state.shift || 'SADOFE'],
    ['cicloInicio', state.cycleStartYear || defaultCycleYear_()]
  ]);
}

function readSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return [];
  return sh.getDataRange().getValues();
}

function formatDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  return m ? `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}` : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

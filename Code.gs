/**
 * BACKEND MULTI-SERVICIO · PLANIFICACIÓN DE VACACIONES
 *
 * Pestañas (las crea el menú Vacaciones > Migrar):
 *   usuarios      -> usuario, nombre, rol, servicio, salt, hash, activo
 *   servicios     -> id, sector, turno
 *   enfermeros    -> Nombre, Servicio
 *   vacaciones    -> Personal, Fecha, Observación, Servicio
 *   feriados      -> Fecha, Feriado (globales)
 *   configuracion -> Clave/Valor (cicloInicio)
 *
 * Implementar como Aplicación web: Ejecutar como "Yo", acceso "Cualquier usuario".
 * La seguridad la da el login: sin token válido el servidor no devuelve datos.
 */
const SH = {USERS:'usuarios', SERV:'servicios', NURSES:'enfermeros', VAC:'vacaciones', HOL:'feriados', CFG:'configuracion'};
const DEFAULT_SERVICE = 'SADOFE';   // servicio al que se asignan los datos actuales al migrar
const SESSION_SECONDS = 21600;      // 6 h (máximo de CacheService)
const MAX_FAILS = 5, LOCK_SECONDS = 900, HASH_ROUNDS = 300;

// Qué puede hacer cada rol. Cambiá true/false a gusto.
const PERMISOS = {
  superusuario: {verTodo:true,  asignar:true, personal:true,  feriados:true,  ciclo:true},
  supervisor:   {verTodo:false, asignar:true, personal:true,  feriados:true,  ciclo:false},
  referente:    {verTodo:false, asignar:true, personal:false, feriados:false, ciclo:false}
};

/* ============ MENÚ DEL SHEET ============ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Vacaciones')
    .addItem('1) Migrar a multi-servicio (una sola vez)', 'migrar')
    .addItem('2) Crear o cambiar usuario', 'crearUsuario')
    .addToUi();
}

function migrar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), ui = SpreadsheetApp.getUi();
  const cfg = {};
  readSheet_(SH.CFG).forEach(r => { cfg[normKey_(r[0])] = r[1]; });

  if (!ss.getSheetByName(SH.SERV)) {
    const sv = ss.insertSheet(SH.SERV);
    sv.getRange(1,1,1,3).setValues([['id','sector','turno']]);
    sv.appendRow([DEFAULT_SERVICE, cfg['sector'] || 'PISO ADULTO', cfg['turno'] || 'SADOFE']);
  }
  if (!ss.getSheetByName(SH.USERS)) {
    const u = ss.insertSheet(SH.USERS);
    u.getRange(1,1,1,7).setValues([['usuario','nombre','rol','servicio','salt','hash','activo']]);
    u.getRange('E:F').setNumberFormat('@');
  }

  let dups = 0;
  const en = ss.getSheetByName(SH.NURSES) || ss.insertSheet(SH.NURSES);
  const a1 = String(en.getRange(1,1).getValue()).trim().toLowerCase();
  const b1 = String(en.getRange(1,2).getValue()).trim().toLowerCase();
  if (!(a1 === 'nombre' && b1 === 'servicio')) {
    const seen = {}, rows = [];
    readSheet_(SH.NURSES).forEach(r => {
      const n = String(r[0]).trim();
      if (!n || /^(enfermeros?|personal|nombre|apellido y nombre)$/i.test(n)) return;
      if (seen[n.toLowerCase()]) { dups++; return; }
      seen[n.toLowerCase()] = 1;
      rows.push([n, DEFAULT_SERVICE]);
    });
    en.clearContents();
    en.getRange(1,1,1,2).setValues([['Nombre','Servicio']]);
    if (rows.length) en.getRange(2,1,rows.length,2).setValues(rows);
  }

  const va = ss.getSheetByName(SH.VAC) || ss.insertSheet(SH.VAC);
  if (va.getLastRow() < 1) va.getRange(1,1,1,3).setValues([['Personal','Fecha','Observación']]);
  va.getRange(1,4).setValue('Servicio');
  if (va.getLastRow() > 1) {
    const n = va.getLastRow() - 1;
    const col = va.getRange(2,4,n,1).getValues().map(r => [String(r[0]).trim() || DEFAULT_SERVICE]);
    va.getRange(2,4,n,1).setValues(col);
  }
  if (!ss.getSheetByName(SH.HOL)) ss.insertSheet(SH.HOL).getRange(1,1,1,2).setValues([['Fecha','Feriado']]);

  ui.alert('Migración lista', 'Datos actuales asignados al servicio "' + DEFAULT_SERVICE + '".' +
    (dups ? '\nSe quitaron ' + dups + ' nombre(s) repetido(s).' : '') +
    '\nAhora creá tu usuario superusuario con la opción 2.', ui.ButtonSet.OK);
}

function crearUsuario() {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.USERS);
  if (!sh) { ui.alert('Primero ejecutá "1) Migrar" del menú Vacaciones.'); return; }
  const ask = t => { const r = ui.prompt(t); return r.getSelectedButton() === ui.Button.OK ? r.getResponseText().trim() : null; };

  const usuario = ask('Usuario (sin espacios, ej. mgomez)'); if (!usuario) return;
  const nombre = ask('Nombre y apellido para mostrar'); if (nombre === null) return;
  const rol = (ask('Rol: superusuario, supervisor o referente') || '').toLowerCase();
  if (!PERMISOS[rol]) { ui.alert('Rol no válido.'); return; }
  let servicio = '*';
  if (rol !== 'superusuario') {
    const ids = getServices_().map(s => s.id);
    servicio = ask('Servicio. Opciones: ' + ids.join(', ')) || '';
    if (ids.indexOf(servicio) < 0) { ui.alert('Servicio no válido.'); return; }
  }
  const pw = ask('Contraseña (mínimo 8 caracteres)') || '';
  if (pw.length < 8) { ui.alert('La contraseña es muy corta.'); return; }

  const salt = Utilities.getUuid();
  const row = [usuario.toLowerCase(), nombre, rol, servicio, salt, hashPw_(salt, pw), 'SI'];
  const names = sh.getLastRow() > 1 ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues() : [];
  const i = names.findIndex(r => String(r[0]).trim().toLowerCase() === row[0]);
  if (i >= 0) sh.getRange(i+2,1,1,7).setValues([row]); else sh.appendRow(row);
  ui.alert(i >= 0 ? 'Usuario actualizado.' : 'Usuario creado.');
}

/* ============ AUTENTICACIÓN ============ */
function toHex_(bytes) { return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join(''); }

function hashPw_(salt, pw) {
  let h = salt + pw;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    h = toHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  }
  return h;
}

function publicUser_(s) { return {usuario:s.usuario, nombre:s.nombre, rol:s.rol, servicio:s.servicio}; }

function availableServices_(s, perm) {
  const all = getServices_();
  return perm.verTodo ? all : all.filter(x => x.id === s.servicio);
}

function login_(usuario, password) {
  usuario = String(usuario || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache(), failKey = 'fail:' + usuario;
  if (!SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SH.USERS))
    return {ok:false, message:'El sistema todavía no fue migrado.'};
  if (Number(cache.get(failKey) || 0) >= MAX_FAILS)
    return {ok:false, message:'Demasiados intentos. Esperá 15 minutos.'};

  const u = readSheet_(SH.USERS).slice(1).find(r =>
    String(r[0]).trim().toLowerCase() === usuario && String(r[6]).trim().toUpperCase() !== 'NO');
  if (!u || hashPw_(String(u[4]), String(password || '')) !== String(u[5])) {
    cache.put(failKey, String(Number(cache.get(failKey) || 0) + 1), LOCK_SECONDS);
    return {ok:false, message:'Usuario o contraseña incorrectos'};
  }
  cache.remove(failKey);
  const s = {usuario:String(u[0]), nombre:String(u[1] || u[0]), rol:String(u[2]).trim().toLowerCase(), servicio:String(u[3]).trim()};
  const perm = PERMISOS[s.rol];
  if (!perm) return {ok:false, message:'Rol no válido. Avisá al administrador.'};
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('sess:' + token, JSON.stringify(s), SESSION_SECONDS);
  return {ok:true, token:token, user:publicUser_(s), services:availableServices_(s, perm)};
}

/* ============ API ============ */
function doGet() { return json_({ok:false, message:'Acceso solo por la aplicación.'}); }

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.action === 'login') return json_(login_(b.usuario, b.password));

    const cache = CacheService.getScriptCache();
    const raw = b.token ? cache.get('sess:' + b.token) : null;
    if (!raw) return json_({ok:false, noAuth:true, message:'Tu sesión venció. Ingresá de nuevo.'});
    const s = JSON.parse(raw), perm = PERMISOS[s.rol];
    if (!perm) return json_({ok:false, noAuth:true, message:'Rol no válido.'});

    const services = availableServices_(s, perm);
    if (b.action === 'logout') { cache.remove('sess:' + b.token); return json_({ok:true}); }
    if (b.action === 'me') return json_({ok:true, user:publicUser_(s), services:services});

    // Un usuario común siempre queda fijado a su servicio; solo el superusuario elige.
    const svc = perm.verTodo ? String(b.servicio || '') : s.servicio;
    if (!services.some(x => x.id === svc)) return json_({ok:false, message:'Servicio no válido.'});

    switch (b.action) {
      case 'getState':
        return json_(getState_(svc));
      case 'saveState':
        if (!perm.asignar) return denied_();
        return json_(locked_(() => saveState_(svc, b.state || {}, perm)));
      case 'addNurse':
        if (!perm.personal) return denied_();
        return json_(locked_(() => addNurse_(svc, b.name)));
      case 'deleteNurse':
        if (!perm.personal) return denied_();
        return json_(locked_(() => deleteNurse_(svc, b.name)));
      default:
        return json_({ok:false, message:'Acción no reconocida'});
    }
  } catch (err) {
    return json_({ok:false, message:String(err)});
  }
}

function denied_() { return json_({ok:false, message:'Tu rol no tiene permiso para esta acción.'}); }

function locked_(fn) {
  const l = LockService.getScriptLock();
  l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}

/* ============ DATOS ============ */
function getServices_() {
  return readSheet_(SH.SERV).slice(1).filter(r => r[0]).map(r => ({
    id:String(r[0]).trim(), sector:String(r[1] || '').trim(), turno:String(r[2] || '').trim()
  }));
}

function getStaff_(svc) {
  return readSheet_(SH.NURSES).slice(1)
    .filter(r => String(r[0]).trim() && String(r[1]).trim() === svc)
    .map(r => String(r[0]).trim());
}

function getState_(svc) {
  const sv = getServices_().find(x => x.id === svc) || {sector:svc, turno:''};
  return {
    ok: true,
    servicio: svc,
    staff: getStaff_(svc),
    assignments: readSheet_(SH.VAC).slice(1)
      .filter(r => r[0] && r[1] && String(r[3]).trim() === svc)
      .map(r => ({nurse:String(r[0]), date:formatDate_(r[1]), note:r[2] || ''})),
    holidays: readSheet_(SH.HOL).slice(1).filter(r => r[0])
      .map(r => ({date:formatDate_(r[0]), name:r[1] || ''})),
    cycleStartYear: getConfig_().cycleStartYear,
    sector: sv.sector,
    shift: sv.turno
  };
}

function saveState_(svc, state, perm) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Vacaciones: reemplaza SOLO las filas de este servicio y conserva las demás.
  const vac = ss.getSheetByName(SH.VAC) || ss.insertSheet(SH.VAC);
  const all = vac.getLastRow() > 1 ? vac.getRange(2,1,vac.getLastRow()-1,4).getValues() : [];
  const others = all.filter(r => (r[0] || r[1]) && String(r[3]).trim() !== svc);
  const valid = {};
  getStaff_(svc).forEach(n => { valid[n] = 1; });
  const mine = (state.assignments || []).filter(a => valid[a.nurse]).map(a => [a.nurse, a.date, a.note || '', svc]);
  vac.clearContents();
  vac.getRange(1,1,1,4).setValues([['Personal','Fecha','Observación','Servicio']]);
  const out = others.concat(mine);
  if (out.length) vac.getRange(2,1,out.length,4).setValues(out);

  if (perm.feriados) {
    const hol = ss.getSheetByName(SH.HOL) || ss.insertSheet(SH.HOL);
    hol.clearContents();
    hol.getRange(1,1,1,2).setValues([['Fecha','Feriado']]);
    const ha = (state.holidays || []).map(h => [h.date, h.name || '']);
    if (ha.length) hol.getRange(2,1,ha.length,2).setValues(ha);
  }
  if (perm.ciclo && state.cycleStartYear) saveCycle_(Number(state.cycleStartYear));
  return {ok:true};
}

function addNurse_(svc, name) {
  name = String(name || '').trim();
  if (!name) return {ok:false, message:'El nombre está vacío'};
  if (getStaff_(svc).some(n => n.toLowerCase() === name.toLowerCase()))
    return {ok:false, message:'Esa persona ya está en la lista'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  (ss.getSheetByName(SH.NURSES) || ss.insertSheet(SH.NURSES)).appendRow([name, svc]);
  return {ok:true};
}

function deleteNurse_(svc, name) {
  name = String(name || '').trim().toLowerCase();
  if (!name) return {ok:false, message:'El nombre está vacío'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sh = ss.getSheetByName(SH.NURSES);
  if (sh && sh.getLastRow() > 1) {
    const v = sh.getRange(1,1,sh.getLastRow(),2).getDisplayValues();
    for (let i = v.length - 1; i >= 1; i--) {
      if (String(v[i][0]).trim().toLowerCase() === name && String(v[i][1]).trim() === svc) sh.deleteRow(i + 1);
    }
  }
  const vac = ss.getSheetByName(SH.VAC);
  if (vac && vac.getLastRow() > 1) {
    const data = vac.getRange(2,1,vac.getLastRow()-1,4).getValues();
    const rest = data.filter(r => !(String(r[0]).trim().toLowerCase() === name && String(r[3]).trim() === svc));
    vac.getRange(2,1,data.length,4).clearContent();
    if (rest.length) vac.getRange(2,1,rest.length,4).setValues(rest);
  }
  return {ok:true};
}

/* ============ UTILIDADES ============ */
function defaultCycleYear_() {
  const n = new Date();
  return n.getMonth() + 1 >= 10 ? n.getFullYear() : n.getFullYear() - 1;
}
function normKey_(k) { return String(k || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }

function getConfig_() {
  const map = {};
  readSheet_(SH.CFG).forEach(r => { const k = normKey_(r[0]); if (k) map[k] = r[1]; });
  const raw = map['cicloinicio'] || map['ciclo'] || '';
  return {cycleStartYear: raw ? Number(raw) : defaultCycleYear_()};
}

function saveCycle_(year) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SH.CFG) || ss.insertSheet(SH.CFG);
  const keys = sh.getLastRow() > 0 ? sh.getRange(1,1,sh.getLastRow(),1).getValues() : [];
  const i = keys.findIndex(r => normKey_(r[0]) === 'cicloinicio');
  if (i >= 0) sh.getRange(i+1,2).setValue(year); else sh.appendRow(['cicloInicio', year]);
}

function readSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return [];
  return sh.getDataRange().getValues();
}

function formatDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  return m ? m[3] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0') : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

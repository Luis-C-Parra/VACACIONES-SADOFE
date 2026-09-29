/* ==========================================================
   SPLASH + LOGIN + ROLES
   Se carga DESPUÉS de app.js. El servidor es quien decide qué
   datos ve cada usuario; acá solo se ajusta la interfaz.
   ========================================================== */
const SESSION = {token:null, user:null, servicio:null, services:[]};
const IDLE_MS = 20 * 60 * 1000;   // cierre automático por inactividad
let idleTimer = null;

function byId(id){return document.getElementById(id)}

// Igual que fetch, pero agrega token y servicio a cada pedido.
async function apiFetch(body){
  const r = await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({...body,token:SESSION.token,servicio:SESSION.servicio})});
  const data = await r.json();
  if(data && data.noAuth) doLogout(true,data.message);
  return {ok:r.ok,json:async()=>data};
}

function loginMsg(t){const m=byId('loginMsg');m.textContent=t||'';m.style.display=t?'block':'none'}
function showLogin(msg){byId('login').style.display='flex';loginMsg(msg);byId('loginUser').focus()}

async function doLogin(){
  const u=byId('loginUser').value.trim(), p=byId('loginPass').value;
  if(!u||!p)return loginMsg('Ingresá usuario y contraseña');
  const btn=byId('loginBtn');btn.disabled=true;loginMsg('');btn.textContent='Verificando…';
  try{
    const r=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'login',usuario:u,password:p})});
    const d=await r.json();
    if(!d.ok)return loginMsg(d.message||'No se pudo ingresar');
    startSession(d);
  }catch(e){console.error(e);loginMsg('No se pudo conectar. Revisá tu conexión.')}
  finally{btn.disabled=false;btn.textContent='Ingresar';byId('loginPass').value=''}
}

function startSession(d){
  SESSION.token=d.token;SESSION.user=d.user;SESSION.services=d.services||[];
  const isSuper=d.user.rol==='superusuario', saved=sessionStorage.getItem('vac_svc');
  SESSION.servicio=isSuper
    ? (SESSION.services.some(s=>s.id===saved)?saved:(SESSION.services[0]||{}).id)
    : d.user.servicio;
  sessionStorage.setItem('vac_token',d.token);
  enterApp();
}

function enterApp(){
  const u=SESSION.user, isSuper=u.rol==='superusuario';
  document.body.className='r-'+u.rol;
  byId('login').style.display='none';
  byId('whoami').textContent=`${u.nombre} · ${u.rol}`;
  const sel=byId('svcSelect');
  sel.style.display=isSuper?'inline-block':'none';
  sel.innerHTML=SESSION.services.map(s=>`<option value="${esc(s.id)}" ${s.id===SESSION.servicio?'selected':''}>${esc(s.sector)} · ${esc(s.turno)}</option>`).join('');
  byId('cycleYear').disabled=!isSuper;
  document.querySelector('.tab[data-view=dashboard]').click();
  loadGoogle(true);
  resetIdle();
}

// Solo el superusuario puede cambiar de servicio.
async function changeService(v){
  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;await saveGoogle(true)}
  SESSION.servicio=v;sessionStorage.setItem('vac_svc',v);
  state=emptyState();renderAll();
  await loadGoogle(true);
}

async function doLogout(expired,msg){
  if(!SESSION.token&&!expired)return;
  if(!expired){
    if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;await saveGoogle(true)}
    try{await apiFetch({action:'logout'})}catch(e){}
  }
  SESSION.token=null;SESSION.user=null;SESSION.servicio=null;
  sessionStorage.clear();
  state=emptyState();renderAll();setConnStatus('','');
  document.body.className='locked';
  showLogin(msg||'');
}

function resetIdle(){
  clearTimeout(idleTimer);
  if(SESSION.token)idleTimer=setTimeout(()=>doLogout(false,'Sesión cerrada por inactividad.'),IDLE_MS);
}
['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,resetIdle));

async function boot(){
  const t=sessionStorage.getItem('vac_token');
  const wait=new Promise(r=>setTimeout(r,1600));
  let info=null;
  if(t){SESSION.token=t;try{const d=await(await apiFetch({action:'me'})).json();if(d.ok)info=d}catch(e){}}
  await wait;
  byId('splash').classList.add('hide');setTimeout(()=>byId('splash').remove(),500);
  if(info)startSession({token:t,user:info.user,services:info.services});
  else{SESSION.token=null;sessionStorage.clear();showLogin()}
}
boot();

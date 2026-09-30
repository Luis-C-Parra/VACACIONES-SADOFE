/* ==========================================================
   PLANIFICACIÓN DE VACACIONES
   Todos los datos (personal, feriados, vacaciones, configuración)
   viven SIEMPRE en el Google Sheet conectado vía Apps Script.
   No hay datos de ejemplo precargados.

   ÚNICA CONFIGURACIÓN MANUAL: pegar acá abajo, una sola vez, la
   URL que te da Google al implementar Code.gs como Aplicación Web
   (termina en /exec). No hace falta tocar nada más ni pegarla en
   la interfaz de la app.
   ========================================================== */
const API_URL = 'https://script.google.com/macros/s/AKfycbzeuF2b7tvxulXgmcefG5yMcLzwAVEEz8l5hWYsu3wiZyhNK8Il4FNzPW-NKLqLcnJG/exec';

const KEY = 'vacaciones_enfermeria_sadofe_v2';

// Ciclo por defecto: octubre -> julio. Se calcula solo según la fecha
// de hoy, así la app sigue funcionando para siempre sin tocar código.
function computeDefaultCycle(){
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth() + 1; // 1-12
  return m >= 10 ? y : y - 1;
}

function emptyState(){
  return {
    staff: [],
    holidays: [],
    assignments: [],
    cycleStartYear: computeDefaultCycle(),
    sector: 'PISO ADULTO',
    shift: 'SADOFE'
  };
}

function apiConfigured(){
  return typeof API_URL === 'string' && /^https:\/\/script\.google\.com\/.+\/exec$/.test(API_URL.trim());
}

// El localStorage se usa solo como caché de trabajo (por si se corta
// la conexión), nunca como fuente de datos de ejemplo.
let state = emptyState();  // sin caché local: los equipos del hospital son compartidos
let cycleStartYear = Number(state.cycleStartYear || computeDefaultCycle());

const monthsES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const monthNums=[10,11,12,1,2,3,4,5,6,7];

function persistLocal(){updateStats();}
let autoSaveTimer=null;
function save(){
  persistLocal();
  // Autoguardado: cada cambio (asignar, quitar día, feriado, ciclo)
  // se sincroniza solo con el Google Sheet, sin botones manuales.
  clearTimeout(autoSaveTimer);
  autoSaveTimer=setTimeout(()=>{autoSaveTimer=null;saveGoogle(true)},600);
}
function toast(s){const t=document.getElementById('toast');t.textContent=s;t.style.display='block';clearTimeout(window._toast);window._toast=setTimeout(()=>t.style.display='none',2200)}
function iso(y,m,d){return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
function dateObj(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function inCycle(s){const d=dateObj(s);const start=new Date(cycleStartYear,9,1), end=new Date(cycleStartYear+1,6,31,23,59,59);return d>=start&&d<=end}
function cycleMonths(){return monthNums.map(m=>({m,y:m>=10?cycleStartYear:cycleStartYear+1}))}
function monthLabel(m){return monthsES[m-1]}
function daysIn(y,m){return new Date(y,m,0).getDate()}
function isWeekend(s){const d=dateObj(s);return d.getDay()===0||d.getDay()===6}
function holiday(s){return state.holidays.find(h=>h.date===s)}
function hasVac(n,s){return state.assignments.some(a=>a.nurse===n&&a.date===s)}
function namesWithVac(y,m){return state.staff.filter(n=>state.assignments.some(a=>a.nurse===n&&dateObj(a.date).getFullYear()===y&&dateObj(a.date).getMonth()+1===m))}

function populateSelects(){
  const opts=state.staff.map(n=>`<option>${esc(n)}</option>`).join('');
  ['assignNurse','quickNurse'].forEach(id=>{const e=document.getElementById(id),prev=e.value;e.innerHTML=opts;if(prev&&state.staff.includes(prev))e.value=prev});
  const cy=document.getElementById('cycleYear'); cy.innerHTML=[cycleStartYear-1,cycleStartYear,cycleStartYear+1,cycleStartYear+2].map(y=>`<option value="${y}" ${y===cycleStartYear?'selected':''}>${y}-${y+1}</option>`).join('');
  document.getElementById('cycleTitle').textContent=`Ciclo Octubre ${cycleStartYear} – Julio ${cycleStartYear+1} · ${state.sector||'PISO ADULTO'} · ${state.shift||'SADOFE'}`;
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function renderCalendar(){
  let html='';
  const filter=document.getElementById('staffFilter').value, sel=document.getElementById('quickNurse').value;
  for(const {m,y} of cycleMonths()){
    let people=filter==='vac'?namesWithVac(y,m):filter==='one'?state.staff.filter(n=>n===sel):state.staff.slice();
    const n=daysIn(y,m);
    html+=`<div class="calendar-wrap" style="margin-bottom:16px"><table class="cal"><tr class="month-title"><th class="name" colspan="2">${monthLabel(m)} ${y}</th>${Array.from({length:n},(_,i)=>`<th class="day">${i+1}</th>`).join('')}</tr>`;
    html+=`<tr><th class="name">PERSONAL</th><th class="name"></th>`;
    for(let d=1;d<=n;d++){const s=iso(y,m,d), h=holiday(s), we=isWeekend(s); html+=`<th class="day ${h?'holiday-head':we?'weekend-head':''}" title="${h?esc(h.name||'Feriado'):we?'Fin de semana':''}">${d}</th>`}
    html+='</tr>';
    if(!people.length) html+=`<tr><td colspan="${n+2}" class="empty">Sin personal para mostrar</td></tr>`;
    for(const nurse of people){
      html+=`<tr class="${nurse===sel?'sel-row':''}"><td class="name" colspan="2">${esc(nurse)}</td>`;
      for(let d=1;d<=n;d++){
        const s=iso(y,m,d), h=holiday(s), we=isWeekend(s), v=hasVac(nurse,s);
        html+=`<td class="day ${v?'vac':h?'holiday-cell':we?'weekend-cell':''}" onclick="cellClick('${esc(nurse).replace(/'/g,"&#039;")}','${s}')" title="${v?'Vacaciones · '+nurse:h?h.name||'Feriado':we?'Fin de semana':'Asignar vacaciones'}">${v?'x':''}</td>`;
      }
      html+='</tr>';
    }
    html+='</table></div>';
  }
  document.getElementById('calendar').innerHTML=html || `<div class="empty">No hay personal cargado todavía. Agregalo desde la pestaña "Personal".</div>`;
}
function onPickPerson(){renderCalendar();const r=document.querySelector('#calendar tr.sel-row');if(r)r.scrollIntoView({behavior:'smooth',block:'center'})}
function cellClick(nurse,s){
  if(!document.getElementById('quickNurse').value || document.getElementById('quickNurse').value!==nurse){document.getElementById('quickNurse').value=nurse}
  if(!inCycle(s)) return;
  const idx=state.assignments.findIndex(a=>a.nurse===nurse&&a.date===s);
  if(idx>=0){state.assignments.splice(idx,1);toast('Día quitado de vacaciones')}
  else{state.assignments.push({nurse,date:s});toast('Día asignado')}
  save();renderAll();
}
function assignRange(){
  const nurse=document.getElementById('assignNurse').value, from=document.getElementById('fromDate').value, to=document.getElementById('toDate').value, note=document.getElementById('assignNote').value.trim();
  if(!nurse||!from||!to)return toast('Complete la persona y las fechas');
  let a=dateObj(from), b=dateObj(to); if(a>b)[a,b]=[b,a];
  let count=0;
  for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)){
    const s=iso(d.getFullYear(),d.getMonth()+1,d.getDate());
    if(!inCycle(s)) continue;
    if(!hasVac(nurse,s)){state.assignments.push({nurse,date:s,note});count++}
  }
  save(); renderAll(); toast(`${count} días asignados`);
}
function addHoliday(){
  const d=document.getElementById('holDate').value,n=document.getElementById('holName').value.trim();
  if(!d)return toast('Indique la fecha');
  if(!inCycle(d))return toast('El feriado debe estar dentro del ciclo');
  const old=state.holidays.find(h=>h.date===d);
  if(old)old.name=n||old.name; else state.holidays.push({date:d,name:n});
  state.holidays.sort((a,b)=>a.date.localeCompare(b.date));save();renderAll();toast('Feriado guardado');
}
function deleteHoliday(d){state.holidays=state.holidays.filter(h=>h.date!==d);save();renderAll()}

// --- Personal: van directo contra el Sheet, no por el guardado genérico ---
async function addStaff(){
  const input=document.getElementById('newStaff');
  const n=input.value.trim();
  if(!n)return;
  if(state.staff.some(x=>x.toLowerCase()===n.toLowerCase()))return toast('Ya está en la lista');
  if(!apiConfigured())return toast('Falta configurar la conexión con Google Sheets (ver app.js)');
  input.disabled=true;
  try{
    const r=await apiFetch({action:'addNurse',name:n});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    if(!data.ok){toast(data.message||'No se pudo agregar');return}
    state.staff.push(n);state.staff.sort((a,b)=>a.localeCompare(b,'es'));
    persistLocal();renderAll();input.value='';toast('Persona agregada');
    setConnStatus('ok','Conectado a Google Sheets.');
  }catch(e){console.error(e);toast('No se pudo conectar con Google Sheets');setConnStatus('error','No se pudo conectar con Google Sheets. Revisá la implementación del Apps Script.')}
  finally{input.disabled=false}
}
async function deleteStaff(n){
  if(!confirm(`¿Eliminar a ${n}? Las vacaciones existentes de esta persona también se eliminarán.`))return;
  if(!apiConfigured())return toast('Falta configurar la conexión con Google Sheets (ver app.js)');
  try{
    const r=await apiFetch({action:'deleteNurse',name:n});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    if(!data.ok){toast(data.message||'No se pudo eliminar');return}
    state.staff=state.staff.filter(x=>x!==n);state.assignments=state.assignments.filter(a=>a.nurse!==n);
    persistLocal();renderAll();toast('Persona eliminada');
    setConnStatus('ok','Conectado a Google Sheets.');
  }catch(e){console.error(e);toast('No se pudo conectar con Google Sheets');setConnStatus('error','No se pudo conectar con Google Sheets. Revisá la implementación del Apps Script.')}
}

function changeCycle(v){cycleStartYear=Number(v);state.cycleStartYear=cycleStartYear;save();renderAll()}

function updateStats(){
  document.getElementById('statStaff').textContent=state.staff.length;
  document.getElementById('statVac').textContent=new Set(state.assignments.map(a=>a.nurse)).size;
  document.getElementById('statDays').textContent=state.assignments.filter(a=>inCycle(a.date)).length;
  document.getElementById('statHol').textContent=state.holidays.filter(h=>inCycle(h.date)).length;
}
function renderRecent(){
  const grouped={};
  state.assignments.forEach(a=>{if(!inCycle(a.date))return;(grouped[a.nurse]??=[]).push(a.date)});
  let rows=[];
  for(const n of Object.keys(grouped)) {
    const ds=grouped[n].sort(); rows.push(`<tr><td>${esc(n)}</td><td>${ds.length} días</td><td>${formatRanges(ds)}</td></tr>`);
  }
  document.getElementById('recentAssignments').innerHTML=rows.length?`<table class="report"><thead><tr><th>Personal</th><th>Días</th><th>Períodos</th></tr></thead><tbody>${rows.join('')}</tbody></table>`:'<div class="empty">No hay asignaciones.</div>';
}
function formatRanges(ds){
  if(!ds.length)return '';
  let out=[],start=ds[0],prev=ds[0];
  for(let i=1;i<ds.length;i++){const cur=ds[i], p=dateObj(prev), c=dateObj(cur);p.setDate(p.getDate()+1);if(p.toDateString()===c.toDateString())prev=cur;else{out.push(rangeText(start,prev));start=prev=cur}}
  out.push(rangeText(start,prev));return out.join(' · ');
}
function rangeText(a,b){return a===b?humanDate(a):`${humanDate(a)} al ${humanDate(b)}`}
function humanDate(s){const d=dateObj(s);return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`}
function getPeriods(){
  const rows=state.assignments.filter(a=>inCycle(a.date)).slice().sort((a,b)=>a.nurse.localeCompare(b.nurse,'es')||a.date.localeCompare(b.date));
  const periods=[]; let cur=null;
  for(const a of rows){
    if(cur && cur.nurse===a.nurse){
      const next=dateObj(cur.end); next.setDate(next.getDate()+1);
      if(next.toDateString()===dateObj(a.date).toDateString()){ cur.end=a.date; if(!cur.note && a.note) cur.note=a.note; continue }
    }
    if(cur) periods.push(cur);
    cur={nurse:a.nurse, start:a.date, end:a.date, note:a.note||''};
  }
  if(cur) periods.push(cur);
  return periods;
}
function renderAssignmentsEditor(){
  const periods=getPeriods();
  document.getElementById('assignmentsEditor').innerHTML = periods.length
    ? `<table class="report"><thead><tr><th>Personal</th><th>Desde</th><th>Hasta</th><th>Observación</th><th></th></tr></thead><tbody>${periods.map(renderPeriodRow).join('')}</tbody></table>`
    : '<div class="empty">No hay vacaciones asignadas en este ciclo.</div>';
}
function renderPeriodRow(p){
  const n=esc(p.nurse).replace(/'/g,"&#039;");
  return `<tr><td class="cell-nurse">${esc(p.nurse)}</td><td class="cell-start">${humanDate(p.start)}</td><td class="cell-end">${humanDate(p.end)}</td><td class="cell-note">${esc(p.note||'')}</td><td class="cell-actions"><button class="ghost" onclick="startEditPeriod(this,'${n}','${p.start}','${p.end}')">Editar</button> <button class="danger" onclick="deletePeriod('${n}','${p.start}','${p.end}')">Eliminar</button></td></tr>`;
}
function startEditPeriod(btn,nurse,start,end){
  const p=getPeriods().find(x=>x.nurse===nurse&&x.start===start&&x.end===end);
  if(!p)return;
  const row=btn.closest('tr');
  const nurseOpts=state.staff.map(nm=>`<option ${nm===nurse?'selected':''}>${esc(nm)}</option>`).join('');
  row.querySelector('.cell-nurse').innerHTML=`<select id="editPeriodNurse">${nurseOpts}</select>`;
  row.querySelector('.cell-start').innerHTML=`<input type="date" id="editPeriodStart" value="${start}">`;
  row.querySelector('.cell-end').innerHTML=`<input type="date" id="editPeriodEnd" value="${end}">`;
  row.querySelector('.cell-note').innerHTML=`<input type="text" id="editPeriodNote" value="${esc(p.note||'')}">`;
  row.querySelector('.cell-actions').innerHTML=`<button class="primary" onclick="confirmEditPeriod('${nurse.replace(/'/g,"\\'")}','${start}','${end}')">Guardar</button> <button class="ghost" onclick="renderAssignmentsEditor()">Cancelar</button>`;
}
function removePeriodDates(nurse,start,end){
  const s=dateObj(start), e=dateObj(end);
  state.assignments=state.assignments.filter(a=>{
    if(a.nurse!==nurse)return true;
    const d=dateObj(a.date);
    return !(d>=s&&d<=e);
  });
}
function confirmEditPeriod(oldNurse,oldStart,oldEnd){
  const newNurse=document.getElementById('editPeriodNurse').value;
  const newNote=document.getElementById('editPeriodNote').value.trim();
  let a=dateObj(document.getElementById('editPeriodStart').value), b=dateObj(document.getElementById('editPeriodEnd').value);
  if(!newNurse||isNaN(a)||isNaN(b))return toast('Complete la persona y las fechas');
  if(a>b)[a,b]=[b,a];
  removePeriodDates(oldNurse,oldStart,oldEnd);
  let count=0;
  for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)){
    const s=iso(d.getFullYear(),d.getMonth()+1,d.getDate());
    if(!inCycle(s))continue;
    if(!hasVac(newNurse,s)){state.assignments.push({nurse:newNurse,date:s,note:newNote});count++}
  }
  save();renderAll();toast('Período modificado');
}
function deletePeriod(nurse,start,end){
  if(!confirm('¿Eliminar todo el período de vacaciones seleccionado?'))return;
  removePeriodDates(nurse,start,end);
  save();renderAll();toast('Período eliminado');
}
function renderHolidays(){
  const hs=state.holidays.filter(h=>inCycle(h.date));
  document.getElementById('holidayList').innerHTML=hs.length?`<table class="report"><thead><tr><th>Fecha</th><th>Feriado</th><th></th></tr></thead><tbody>${hs.map(h=>`<tr><td>${humanDate(h.date)}</td><td>${esc(h.name||'Feriado')}</td><td><button class="danger" onclick="deleteHoliday('${h.date}')">Eliminar</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No hay feriados cargados en este ciclo.</div>';
}
function renderStaff(){
  document.getElementById('staffList').innerHTML=state.staff.length?`<div class="chips">${state.staff.map(n=>`<span class="chip">${esc(n)} <button title="Eliminar" onclick="deleteStaff('${esc(n).replace(/'/g,"&#039;")}')">×</button></span>`).join('')}</div>`:'<div class="empty">No hay personal cargado todavía.</div>';
}
function renderReportControls(){
  const t=document.getElementById('reportType').value, box=document.getElementById('reportControls');
  if(t==='month')box.innerHTML=`<div class="field"><label>MES</label><select id="reportMonth">${cycleMonths().map(x=>`<option value="${x.y}-${x.m}">${monthLabel(x.m)} ${x.y}</option>`).join('')}</select></div>`;
  else if(t==='week')box.innerHTML=`<div class="field"><label>SEMANA (CUALQUIER DÍA)</label><input id="reportWeek" type="date" value="${iso(cycleStartYear,10,1)}"></div>`;
  else if(t==='nurse')box.innerHTML=`<div class="field"><label>PERSONAL</label><select id="reportNurse">${state.staff.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div>`;
  else box.innerHTML='';
}
function getRangeForReport(){
  const t=document.getElementById('reportType').value;
  if(t==='month'){const [y,m]=document.getElementById('reportMonth').value.split('-').map(Number);return {start:iso(y,m,1),end:iso(y,m,daysIn(y,m)),title:`${monthLabel(m)} ${y}`}}
  if(t==='week'){const s=document.getElementById('reportWeek').value;if(!s)return null;let d=dateObj(s), day=d.getDay()||7;let st=new Date(d);st.setDate(d.getDate()-day+1);let en=new Date(st);en.setDate(st.getDate()+6);return {start:iso(st.getFullYear(),st.getMonth()+1,st.getDate()),end:iso(en.getFullYear(),en.getMonth()+1,en.getDate()),title:`Semana ${humanDate(iso(st.getFullYear(),st.getMonth()+1,st.getDate()))} al ${humanDate(iso(en.getFullYear(),en.getMonth()+1,en.getDate()))}`}}
  return null;
}
function renderReport(){
  const t=document.getElementById('reportType').value;let rows=[],title='';
  if(t==='annual'){
    title=`Ciclo Octubre ${cycleStartYear} – Julio ${cycleStartYear+1}`;
    state.staff.forEach(n=>{const ds=state.assignments.filter(a=>a.nurse===n&&inCycle(a.date)).map(a=>a.date).sort();if(ds.length)rows.push([n,ds.length,formatRanges(ds)])});
  } else if(t==='nurse'){
    const n=document.getElementById('reportNurse').value;title=`Vacaciones de ${n}`;
    const ds=state.assignments.filter(a=>a.nurse===n&&inCycle(a.date)).map(a=>a.date).sort();rows=ds.length?[[n,ds.length,formatRanges(ds)]]:[];
  } else {
    const r=getRangeForReport(); if(!r)return;
    title=r.title;
    state.staff.forEach(n=>{const ds=state.assignments.filter(a=>a.nurse===n&&a.date>=r.start&&a.date<=r.end).map(a=>a.date).sort();if(ds.length)rows.push([n,ds.length,formatRanges(ds)])});
  }
  document.getElementById('reportResult').innerHTML=`<h2>${esc(title)}</h2>${rows.length?`<table class="report"><thead><tr><th>PERSONAL</th><th>DÍAS</th><th>PERÍODOS</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No hay vacaciones asignadas para el criterio seleccionado.</div>'}`;
}
function printReport(){window.print()}

async function exportExcel(){
  const wb=new ExcelJS.Workbook();wb.creator='Planificación de Vacaciones';wb.created=new Date();
  const ws=wb.addWorksheet(`Planificación ${cycleStartYear}-${String(cycleStartYear+1).slice(-2)}`);
  ws.views=[{state:'frozen',xSplit:2,ySplit:4}];ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:ws.PAPERSIZE_A3};
  ws.getColumn(1).width=2;ws.getColumn(2).width=25;for(let c=3;c<=33;c++)ws.getColumn(c).width=4;
  ws.mergeCells('B1:AG1');ws.getCell('A1').value='FERIADO';ws.getCell('B1').value=`SECTOR: ${state.sector||'PISO ADULTO'}                                      TURNO:${state.shift||'SADOFE'}`;
  ws.mergeCells('B2:AG2');ws.getCell('B2').value=`PLANIFICACION ${cycleStartYear}`;
  [ws.getCell('A1'),ws.getCell('B1')].forEach(c=>{c.font={bold:true};c.alignment={vertical:'middle',horizontal:'center'}});
  ws.getCell('B2').font={bold:true,size:16};ws.getCell('B2').alignment={horizontal:'center',vertical:'middle'};
  ws.getRow(2).height=25; ws.getRow(1).height=22;
  let row=4;
  for(const {m,y} of cycleMonths()){
    const n=daysIn(y,m);
    ws.mergeCells(row,1,row,2);const mc=ws.getCell(row,1);mc.value=monthLabel(m);mc.font={bold:true,size:13};mc.alignment={horizontal:'center',vertical:'middle'};mc.fill={type:'pattern',pattern:'solid',fgColor:{argb:'DCEBC7'}};
    for(let d=1;d<=n;d++){const c=ws.getCell(row,d+2);c.value=d;c.font={bold:true};c.alignment={horizontal:'center'};const s=iso(y,m,d);if(holiday(s))c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FCD5B5'}};else if(isWeekend(s))c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFF66'}}}
    for(let d=n+1;d<=31;d++){ws.getCell(row,d+2).value='';}
    row++;
    const people=namesWithVac(y,m);
    for(const nurse of people){
      ws.getCell(row,2).value=nurse;
      for(let d=1;d<=n;d++){const c=ws.getCell(row,d+2),s=iso(y,m,d);if(hasVac(nurse,s)){c.value='x';c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF66FF99'}};c.alignment={horizontal:'center'}}}
      row++;
    }
    row+=2;
  }
  ws.eachRow(r=>r.eachCell(c=>{c.border={top:{style:'thin',color:{argb:'222222'}},left:{style:'thin',color:{argb:'222222'}},bottom:{style:'thin',color:{argb:'222222'}},right:{style:'thin',color:{argb:'222222'}}};c.alignment={vertical:'middle',horizontal:c.column===2?'left':'center'}}));
  const buf=await wb.xlsx.writeBuffer();saveAs(new Blob([buf]),`Planificacion_Vacaciones_${cycleStartYear}-${cycleStartYear+1}.xlsx`);toast('Excel exportado');
}
async function exportPDF(){
  const {jsPDF}=window.jspdf;const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'});
  let first=true;
  for(const {m,y} of cycleMonths()){
    if(!first)doc.addPage();first=false;
    doc.setFontSize(14);doc.text(`PLANIFICACION DE VACACIONES · ${monthLabel(m)} ${y}`,12,12);
    doc.setFontSize(8);doc.text(`SECTOR: ${state.sector||'PISO ADULTO'} · TURNO: ${state.shift||'SADOFE'}`,12,18);
    const head=['PERSONAL'];for(let d=1;d<=daysIn(y,m);d++)head.push(String(d));
    const body=namesWithVac(y,m).map(n=>[n,...Array.from({length:daysIn(y,m)},(_,i)=>hasVac(n,iso(y,m,i+1))?'x':'')]);
    doc.autoTable({head:[head],body,startY:22,margin:{left:8,right:8},theme:'grid',styles:{fontSize:6,cellPadding:1,halign:'center',valign:'middle'},headStyles:{fontSize:6,fillColor:[220,235,199],textColor:[0,0,0]},columnStyles:{0:{cellWidth:38,halign:'left'}}});
  }
  doc.save(`Planificacion_Vacaciones_${cycleStartYear}-${cycleStartYear+1}.pdf`);toast('PDF exportado');
}

function setConnStatus(kind,msg){
  document.querySelectorAll('.conn-status').forEach(box=>{
    box.className='notice conn-status '+(kind||'');
    box.textContent=msg;
    box.style.display=msg?'block':'none';
  });
}

async function loadGoogle(silent){
  if(!apiConfigured()){setConnStatus('error','Falta configurar la conexión con Google Sheets: pegá la URL de Apps Script en API_URL, dentro de app.js.');return}
  try{
    const r=await apiFetch({action:'getState'}); if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    if(data.ok===false)throw new Error(data.message||'Error');
    state.staff = data.staff || [];
    state.holidays = data.holidays || [];
    state.assignments = data.assignments || [];
    state.cycleStartYear = data.cycleStartYear || computeDefaultCycle();
    state.sector = data.sector || state.sector || 'PISO ADULTO';
    state.shift = data.shift || state.shift || 'SADOFE';
    cycleStartYear=Number(state.cycleStartYear);
    persistLocal();renderAll();
    setConnStatus('ok','Conectado a Google Sheets. Datos sincronizados.');
    if(!silent) toast('Datos cargados desde Google Sheets');
  }catch(e){
    console.error(e);
    setConnStatus('error','No se pudo leer Google Sheets. Revisá la implementación del Apps Script.');
    if(!silent) toast('No se pudo leer Google Sheets.');
  }
}
async function saveGoogle(silent, _retry){
  if(!apiConfigured()){if(!silent)setConnStatus('error','Falta configurar la conexión con Google Sheets: pegá la URL de Apps Script en API_URL, dentro de app.js.');return}
  try{
    const r=await apiFetch({action:'saveState',state});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const sd=await r.json();
    if(sd.ok===false){setConnStatus('error',sd.message||'No se pudo guardar');if(!silent)toast(sd.message||'No se pudo guardar');return}
    if(sd.feriados===undefined){const m='El Apps Script publicado está desactualizado: los feriados no se guardan en el Sheet. En Apps Script: Implementar > Administrar implementaciones > editar > Nueva versión.';setConnStatus('error',m);toast('Servidor desactualizado: los feriados no se guardan en el Sheet.');return}
    setConnStatus('ok','Conectado a Google Sheets. Última sincronización correcta.');
    if(!silent) toast('Planificación guardada en Google Sheets');
  }catch(e){
    console.error(e);
    if(!_retry){ setTimeout(()=>saveGoogle(silent,true), 1500); return; }
    setConnStatus('error','No se pudo guardar en Google Sheets. Revisá la implementación del Apps Script.');
    if(!silent)toast('No se pudo guardar en Google Sheets.');
  }
}

function renderAll(){
  populateSelects();updateStats();renderCalendar();renderRecent();renderAssignmentsEditor();renderHolidays();renderStaff();renderReportControls();renderReport();
}

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.view).classList.add('active')}));

renderAll();
// Los datos se cargan desde auth.js una vez que el usuario ingresa.

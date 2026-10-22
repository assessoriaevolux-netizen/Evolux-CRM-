// ─── CALENDÁRIO ───────────────────────────────────────────────────────────────
let calYear=new Date().getFullYear(),calMonth=new Date().getMonth();
let eventos=[];
window.eventos = eventos; // mesma referência
let nextEventoId=1;
window.nextEventoId = nextEventoId;

function renderCalendario(){
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('cal-title').textContent=`${meses[calMonth]} ${calYear}`;
  // popular select de leads
  const ls=document.getElementById('cal-lead-sel');
  if(ls){
    const v=ls.value;
    const vis=getVisiveisParaMim(), gestor=isGestor();
    ls.innerHTML=`<option value="">Selecionar lead...</option>`+leads.filter(l=>gestor||vis.has(l.responsavelId)).map(l=>`<option value="${l.id}">${esc(l.nome)} · ${esc(l.tipo)}</option>`).join('');
    ls.value=v;
  }
  // data padrão = hoje (no fuso local)
  const di=document.getElementById('cal-data');
  if(di&&!di.value) di.value=hojeISO();
  // renderizar células
  renderCalCells();
  renderCalAgenda();
  // atualizar painel Google
  renderGcalPanel();
}
function renderCalCells(){
  const container=document.getElementById('cal-cells');
  const hoje=new Date();
  const primeiro=new Date(calYear,calMonth,1);
  const ultimo=new Date(calYear,calMonth+1,0);
  const startDow=primeiro.getDay(); // 0=dom
  const totalCells=Math.ceil((startDow+ultimo.getDate())/7)*7;
  let html='';
  for(let i=0;i<totalCells;i++){
    const dayNum=i-startDow+1;
    const d=new Date(calYear,calMonth,dayNum);
    const isThis=dayNum>=1&&dayNum<=ultimo.getDate();
    const isHoje=d.toDateString()===hoje.toDateString();
    const dStr=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    const evs=eventos.filter(e=>e.data===dStr);
    const tipoClass={reuniao:'reuniao',followup:'followup',lance:'lance'};
    const tipoLabel={reuniao:'Reunião','followup':'Follow-up',lance:'Lance'};
    html+=`<div class="cal-cell${isHoje?' today':''}${!isThis?' other-month':''}" onclick="calSelectDay('${dStr}')">
      <div class="cal-day">${isThis?dayNum:''}</div>
      ${evs.map(e=>`<div class="cal-event ${tipoClass[e.tipo]||'reuniao'}" title="${esc(e.leadNome)} - ${esc(e.horaIni)}" onclick="event.stopPropagation();calEditEvento(${e.id})">${tipoLabel[e.tipo]||''} ${esc(e.horaIni)}</div>`).join('')}
    </div>`;
  }
  container.outerHTML=`<div id="cal-cells" style="display:contents">${html}</div>`;
}
function renderCalAgenda(){
  const hoje=hojeISO();
  const prox=eventos.filter(e=>e.data>=hoje).sort((a,b)=>a.data.localeCompare(b.data)).slice(0,6);
  const cores={reuniao:'var(--g)',followup:'var(--b)',lance:'var(--y)'};
  const labels={reuniao:'Reunião',followup:'Follow-up',lance:'Lance'};
  const el=document.getElementById('cal-agenda-list');
  if(!el)return;
  el.innerHTML=prox.length?prox.map(e=>`
    <div class="cal-agenda-item">
      <div class="cal-agenda-dot" style="background:${cores[e.tipo]||'var(--g)'}"></div>
      <div>
        <div class="cal-agenda-title">${esc(e.leadNome)}</div>
        <div class="cal-agenda-sub">${labels[e.tipo]||''} · ${esc(e.data.split('-').reverse().join('/'))} ${esc(e.horaIni)}–${esc(e.horaFim)}</div>
        ${e.obs?`<div class="cal-agenda-sub" style="margin-top:1px;font-style:italic">${esc(e.obs)}</div>`:''}
        <button onclick="openProtocoloEvento(${e.id});event.stopPropagation()" style="margin-top:5px;background:var(--g);color:#fff;border:none;border-radius:5px;padding:3px 9px;font-size:10.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px"><i class="ti ti-file-text" style="font-size:11px"></i>Protocolo PDF</button>
      </div>
    </div>`).join(''):'<p style="font-size:12px;color:var(--tm)">Nenhum evento próximo.</p>';
}
// Protocolo a partir do evento (sem colocar textos digitados dentro do onclick)
function openProtocoloEvento(id){
  const e=eventos.find(ev=>ev.id===id);
  if(!e)return;
  openProtocolo(e.leadId,e.data,e.horaIni,e.horaFim,e.obs||'');
}
function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendario();}
function calToday(){calYear=new Date().getFullYear();calMonth=new Date().getMonth();renderCalendario();}
function calSelectDay(dStr){
  const di=document.getElementById('cal-data');
  if(di) di.value=dStr;
}
function calEditEvento(id){
  const e=eventos.find(ev=>ev.id===id);
  if(!e)return;
  const ls=document.getElementById('cal-lead-sel');
  const ts=document.getElementById('cal-tipo-sel');
  const di=document.getElementById('cal-data');
  const hi=document.getElementById('cal-hora-ini');
  const hf=document.getElementById('cal-hora-fim');
  const ob=document.getElementById('cal-obs');
  if(ls) ls.value=e.leadId;
  if(ts) ts.value=e.tipo;
  if(di) di.value=e.data;
  if(hi) hi.value=e.horaIni;
  if(hf) hf.value=e.horaFim;
  if(ob) ob.value=e.obs||'';
}
function calAgendar(){
  const lid=parseInt(document.getElementById('cal-lead-sel').value);
  const tipo=document.getElementById('cal-tipo-sel').value;
  const data=document.getElementById('cal-data').value;
  const hi=document.getElementById('cal-hora-ini').value;
  const hf=document.getElementById('cal-hora-fim').value;
  const obs=document.getElementById('cal-obs').value.trim();
  if(!lid){showToast('Selecione um lead.','ti-alert-triangle','#d97706');return;}
  if(!data){showToast('Selecione uma data.','ti-alert-triangle','#d97706');return;}
  const lead=leads.find(l=>l.id===lid);
  const novoEvt={id:nextEventoId++,leadId:lid,leadNome:lead?lead.nome:'—',tipo,data,horaIni:hi,horaFim:hf,obs};
  eventos.push(novoEvt);
  if(window._syncEvento) window._syncEvento(novoEvt).catch(e=>console.warn(e));
  if(window._saveAtividade)window._saveAtividade('ti-calendar-check',`Reunião agendada com ${lead?lead.nome:'cliente'} — ${data.split('-').reverse().join('/')} ${hi}`);
  renderCalendario();
  showToast('Evento agendado! Deseja gerar o protocolo?', 'ti-calendar');
  // Sincroniza com Google Calendar automaticamente se token disponível
  if(window._gcalToken){
    const labels={reuniao:'Reunião',followup:'Follow-up',lance:'Lance'};
    const titulo=`${labels[tipo]||'Reunião'}${lead?' — '+lead.nome:''}`;
    const desc=obs||(lead?`Consórcio de ${lead.tipo} · ${fmtR(lead.credito)}`:'');
    const dataHoraInicio=`${data}T${hi||'09:00'}:00`;
    const [h1,m1]=(hi||'09:00').split(':').map(Number);
    const [h2,m2]=(hf||'10:00').split(':').map(Number);
    const duracaoMin=Math.max(15,(h2*60+m2)-(h1*60+m1));
    gcalCriarEvento(titulo,desc,dataHoraInicio,duracaoMin).then(ok=>{
      if(ok) showToast('Evento enviado para o Google Calendar ✅','ti-brand-google');
    }).catch(()=>{});
  }
  // Pergunta se quer gerar protocolo
  setTimeout(()=>openProtocolo(lid,data,hi,hf,obs),400);
}
async function calAbrirGoogle(){
  const lid=parseInt(document.getElementById('cal-lead-sel').value);
  const tipo=document.getElementById('cal-tipo-sel').value;
  const data=document.getElementById('cal-data').value;
  const hi=document.getElementById('cal-hora-ini').value||'09:00';
  const hf=document.getElementById('cal-hora-fim').value||'10:00';
  const obs=document.getElementById('cal-obs').value.trim();
  if(!data){showToast('Selecione uma data antes de agendar.','ti-alert-triangle');return;}
  const lead=lid?leads.find(l=>l.id===lid):null;
  const labels={reuniao:'Reunião',followup:'Follow-up',lance:'Lance'};
  const titulo=`${labels[tipo]||'Reunião'}${lead?' — '+lead.nome:''}`;
  const desc=obs||(lead?`Consórcio de ${lead.tipo} · ${fmtR(lead.credito)}`:'');
  // Se tem token Google → usa API REST para criar evento diretamente
  if(window._gcalToken){
    const dataHoraInicio=`${data}T${hi}:00`;
    const [h1,m1]=hi.split(':').map(Number);
    const [h2,m2]=hf.split(':').map(Number);
    const duracaoMin=Math.max(15,(h2*60+m2)-(h1*60+m1));
    const ok=await gcalCriarEvento(titulo,desc,dataHoraInicio,duracaoMin);
    if(ok) return;
    // Se falhou por token expirado, cai para URL
  }
  // Fallback: abre Google Calendar na web com dados pré-preenchidos
  // Formato Google: YYYYMMDDTHHMMSS (6 dígitos de hora, sem separadores)
  const fmt=(d,t)=>d.replace(/-/g,'')+'T'+(t||'09:00').replace(':','')+'00';
  const ini=fmt(data,hi);
  const fim2=fmt(data,hf);
  const url=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo)}&dates=${ini}/${fim2}&details=${encodeURIComponent(desc)}`;
  window.open(url,'_blank');
}


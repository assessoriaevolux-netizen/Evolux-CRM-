// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
function renderWhatsapp(){
  // lista de números
  const nl=document.getElementById('wa-num-list');
  nl.innerHTML=waNumbers.map((n,i)=>{
    const u=users.find(u=>u.id===n.userId)||{nome:n.nome};
    const ini=u.nome[0].toUpperCase();
    return `<div class="wa-num">
      <div class="wa-num-avatar">${ini}</div>
      <div class="wa-num-info">
        <div class="wa-num-name">${u.nome}</div>
        <div class="wa-num-phone">${n.phone}</div>
      </div>
      <span class="wa-badge demo">Demo</span>
    </div>`;
  }).join('') || '<p style="font-size:12px;color:var(--tm)">Nenhum número conectado ainda.</p>';
  // permissões
  const pl=document.getElementById('wa-perms-list');
  pl.innerHTML=waNumbers.map((n,i)=>{
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--c1)">
      <span style="font-size:12.5px;font-weight:600;color:var(--tx);flex:1">${n.nome}</span>
      <span style="font-size:11.5px;color:var(--tm)">Visível para: <strong style="color:var(--g)">Representante+</strong></span>
    </div>`;
  }).join('') || '<p style="font-size:12px;color:var(--tm)">Nenhum número para configurar.</p>';
  // grid de leads — filtra pelos visíveis para o usuário logado
  waSelected=new Set();
  const _waVisiveis=getVisiveisParaMim();
  const _waLeads=leads.filter(l=>_waVisiveis.has(l.responsavelId));
  const gr=document.getElementById('wa-leads-grid');
  gr.innerHTML=_waLeads.map(l=>`
    <div class="wa-lead-item" id="wai-${l.id}" onclick="waToggle(${l.id})">
      <input type="checkbox" id="wac-${l.id}" onchange="waToggle(${l.id})">
      <div>
        <div class="wa-lead-name">${l.nome}</div>
        <div class="wa-lead-info">${l.tipo} · ${fmtR(l.credito)}</div>
      </div>
    </div>`).join('');
  waUpdateBar();
}
function _waLeadsVisiveis(){const v=getVisiveisParaMim();return leads.filter(l=>v.has(l.responsavelId));}
function waToggle(id){
  if(waSelected.has(id)) waSelected.delete(id);
  else waSelected.add(id);
  const el=document.getElementById('wai-'+id);
  const cb=document.getElementById('wac-'+id);
  if(el) el.classList.toggle('sel',waSelected.has(id));
  if(cb) cb.checked=waSelected.has(id);
  waUpdateBar();waPreview();
}
function waSelectAll(){_waLeadsVisiveis().forEach(l=>waSelected.add(l.id));renderWaGrid();}
function waSelectNone(){waSelected.clear();renderWaGrid();}
function renderWaGrid(){
  _waLeadsVisiveis().forEach(l=>{
    const el=document.getElementById('wai-'+l.id);
    const cb=document.getElementById('wac-'+l.id);
    if(el) el.classList.toggle('sel',waSelected.has(l.id));
    if(cb) cb.checked=waSelected.has(l.id);
  });
  waUpdateBar();waPreview();
}
function waUpdateBar(){
  const n=waSelected.size;
  document.getElementById('wa-sel-count').textContent=`${n} lead${n!==1?'s':''} selecionado${n!==1?'s':''}`;
  document.getElementById('wa-send-count').textContent=n;
  const tot=leads.filter(l=>waSelected.has(l.id)).reduce((s,l)=>s+l.credito,0);
  document.getElementById('wa-sel-credits').textContent=n?'· '+fmtR(tot)+' em crédito':'';
}
function insertVar(v){
  const t=document.getElementById('wa-msg');
  const s=t.selectionStart,e=t.selectionEnd;
  t.value=t.value.substring(0,s)+v+t.value.substring(e);
  t.selectionStart=t.selectionEnd=s+v.length;
  t.focus();waPreview();
}
function waPreview(){
  const msg=document.getElementById('wa-msg').value;
  const pv=document.getElementById('wa-preview');
  if(!msg.trim()){pv.textContent='Escreva a mensagem acima para ver a prévia aqui com os dados do primeiro lead selecionado.';return;}
  const ids=[...waSelected];
  const _wlv=_waLeadsVisiveis();
  const lead=ids.length?leads.find(l=>l.id===ids[0]):_wlv[0];
  if(!lead){pv.textContent=msg;return;}
  const txt=msg
    .replace(/\{\{nome\}\}/gi,lead.nome)
    .replace(/\{\{tipo\}\}/gi,lead.tipo)
    .replace(/\{\{cr[eé]dito\}\}/gi,fmtR(lead.credito))
    .replace(/\{\{etapa\}\}/gi,lead.etapa);
  pv.textContent=txt;
}
function waDemoSend(){
  const n=waSelected.size;
  if(!n){showToast('Selecione pelo menos um lead para disparar.','ti-alert-triangle','#d97706');return;}
  const msg=document.getElementById('wa-msg').value.trim();
  if(!msg){showToast('Escreva a mensagem antes de disparar.','ti-alert-triangle','#d97706');return;}
  showToast(`Disparo simulado para ${n} lead(s) — integração real ativa após deploy.`, 'ti-brand-whatsapp');
  if(window._saveAtividade)window._saveAtividade('ti-brand-whatsapp',`Disparo demo: ${n} mensagens enviadas via WhatsApp`);
}
function openWaConnect(){
  const sel=document.getElementById('wa-user-sel');
  sel.innerHTML=users.map(u=>`<option value="${u.id}">${u.nome} (${u.role})</option>`).join('');
  document.getElementById('wa-phone').value='';
  document.getElementById('wa-modal').classList.add('open');
}
function closeWaModal(){document.getElementById('wa-modal').classList.remove('open');}
function saveWaConnect(){
  const uid=parseInt(document.getElementById('wa-user-sel').value);
  const ph=document.getElementById('wa-phone').value.trim()||'(demo)';
  const u=users.find(u=>u.id===uid);
  if(!u)return;
  waNumbers.push({userId:uid,nome:u.nome,phone:ph,status:'demo'});
  closeWaModal();renderWhatsapp();
}



// ─── LANCES ───────────────────────────────────────────────────────────────────
// Lead fechado ganha um lance automático criado pelo banco (e o lance some se a
// venda for desfeita). Aqui a pessoa completa, marca como ofertado ou remove.
function _lanceData(l){
  const s=String(l.dataOferta||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d);
}
function renderLances(){
  const elMes=document.getElementById('lance-mes'); if(elMes) elMes.textContent=mesAtual();
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const em3=new Date(hoje);em3.setDate(em3.getDate()+3);
  const ativos=lances.filter(l=>!l._removido);
  let u=0,b=0,ok=0;
  ativos.filter(l=>!l.ofertado).forEach(l=>{const d=_lanceData(l); if(!d||d<=hoje)u++; else if(d<=em3)b++; else ok++;});
  const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
  set('l-urgente',u); set('l-breve',b); set('l-ok',ok);
  const lista=document.getElementById('lances-lista');
  if(!lista) return;
  if(!ativos.length){lista.innerHTML='<p style="color:var(--tm);font-size:13px">Nenhum lance cadastrado. Leads "Fechado / Convertido" aparecem aqui automaticamente para cadastro de lance.</p>';return;}
  const podeEditar=can('lances_edit');
  const sorted=[...ativos].sort((a,b)=>((_lanceData(a)||0)-(_lanceData(b)||0)));
  lista.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">'+sorted.map(l=>{
    const autoTag=l._auto?`<span style="font-size:9px;padding:2px 6px;border-radius:20px;background:rgba(1,107,60,.12);color:var(--g);font-weight:700;margin-left:4px">AUTO</span>`:'';
    const btnRem=podeEditar?`<button class="btn bd bsm" onclick="removeLance(${l.id})" title="Remover"><i class="ti ti-${l.ofertado?'trash':'x'}"></i></button>`:'';
    if(l.ofertado) return `<div class="lance-card done"><div class="lance-n">${esc(l.clienteNome)}${autoTag}</div><div class="lance-i">Lance: ${fmtR(l.valor)} (${esc(l.pct)}%) · ${esc(l.assem)}</div><div class="lance-foot"><span class="lbadge lb-d">✓ Ofertado</span>${btnRem}</div></div>`;
    const d=_lanceData(l);
    let cls='ok',bcls='lb-ok',lbl='Em dia';
    if(!d||d<=hoje){cls='urgente';bcls='lb-u';lbl='⚠️ Ofertar HOJE';}
    else if(d<=em3){cls='hoje';bcls='lb-h';lbl='🔔 Em breve';}
    if(l._auto&&!l.pct) lbl='📋 Cadastre o lance';
    return `<div class="lance-card ${cls}">
      <div class="lance-n">${esc(l.clienteNome)}${autoTag}</div>
      <div class="lance-i">${l.pct?`Lance: ${fmtR(l.valor)} (${esc(l.pct)}%)`:`Crédito: ${fmtR(l.valor||0)}`} · ${esc(l.assem)}${l.obs?` · ${esc(l.obs)}`:''}</div>
      <div class="lance-i">Data para ofertar: ${d?toDate(d):'—'}</div>
      <div class="lance-foot">
        <span class="lbadge ${bcls}">${lbl}</span>
        ${podeEditar?`<div style="display:flex;gap:5px">
          <button class="btn bp bsm" onclick="editarLanceAuto(${l.id})"><i class="ti ti-pencil"></i>Editar</button>
          <button class="btn bp bsm" onclick="marcarOfertado(${l.id})"><i class="ti ti-check"></i>Ofertado</button>
          ${btnRem}
        </div>`:''}
      </div>
    </div>`;
  }).join('')+'</div>';
}
function _preencherLanceModal(l){
  document.getElementById('lValor').value=l&&l.valor?Math.round(l.valor).toLocaleString('pt-BR'):'';
  document.getElementById('lPct').value=l&&l.pct?l.pct:'';
  document.getElementById('lData').value=l&&_lanceData(l)?hojeISO(_lanceData(l)):hojeISO();
  document.getElementById('lAssem').value=l?(l.assem||''):'';
  document.getElementById('lObs').value=l?(l.obs||''):'';
}
function editarLanceAuto(id){
  if(!can('lances_edit')){showToast('Você não tem permissão para editar lances.','ti-lock');return;}
  const l=lances.find(x=>x.id===id);if(!l)return;
  populateSelects();
  const cl=document.getElementById('lCliente');
  if(cl&&l.leadId){
    if(![...cl.options].some(o=>o.value===String(l.leadId))){
      const o=document.createElement('option');o.value=l.leadId;o.textContent=l.clienteNome;cl.appendChild(o);
    }
    cl.value=l.leadId;
  }
  _preencherLanceModal(l);
  window._editandoLanceId=id;
  document.getElementById('lance-modal').classList.add('open');
}
function openLanceModal(leadId){
  if(!can('lances_create')){showToast('Você não tem permissão para cadastrar lances.','ti-lock');return;}
  populateSelects();
  window._editandoLanceId=null;
  _preencherLanceModal(null);
  const cl=document.getElementById('lCliente');
  if(cl&&leadId) cl.value=leadId;
  document.getElementById('lance-modal').classList.add('open');
}
function closeLanceModal(){document.getElementById('lance-modal').classList.remove('open');window._editandoLanceId=null;}
let _salvandoLance=false;
async function saveLance(){
  if(_salvandoLance)return;
  const leadId=parseInt(document.getElementById('lCliente').value);
  const lead=leads.find(l=>l.id===leadId);
  if(!lead){showToast('Selecione um cliente.','ti-alert-triangle','#d97706');return;}
  const valor=unM(document.getElementById('lValor').value);
  const pct=parseFloat(String(document.getElementById('lPct').value).replace(',','.'))||0;
  const dataOferta=document.getElementById('lData').value||hojeISO();
  const assem=document.getElementById('lAssem').value.trim()||mesAtual();
  const obs=document.getElementById('lObs').value;
  // Editando, ou o lead já tem o lance automático em aberto: completa esse em vez de duplicar
  let l=window._editandoLanceId?lances.find(x=>x.id===window._editandoLanceId):null;
  if(!l) l=lances.find(x=>x.leadId===leadId&&x._auto&&!x._removido&&!x.ofertado)||null;
  const novo=!l;
  if(novo&&!can('lances_create')){showToast('Você não tem permissão para cadastrar lances.','ti-lock');return;}
  if(!novo&&!can('lances_edit')){showToast('Você não tem permissão para editar lances.','ti-lock');return;}
  const antes=l?{...l}:null;
  if(novo){ l={id:nextLanceId++,ofertado:false}; lances.push(l); }
  Object.assign(l,{leadId,clienteNome:lead.nome,valor,pct,dataOferta,assem,obs});
  _salvandoLance=true;
  const ok=await window._syncLance(l);
  _salvandoLance=false;
  if(!ok&&!window._pendentes.has('lance:'+l.id)){
    if(novo){ const i=lances.indexOf(l); if(i!==-1) lances.splice(i,1); }
    else Object.assign(l,antes);
    renderLances();
    return;
  }
  if(window._saveAtividade)window._saveAtividade('ti-gavel',`Lance ${novo?'cadastrado':'atualizado'}: ${lead.nome} — ${fmtR(valor)} (${pct}%)`);
  closeLanceModal();
  _preencherLanceModal(null);
  renderLances();
}
async function marcarOfertado(id){
  if(!can('lances_edit')){showToast('Você não tem permissão para editar lances.','ti-lock');return;}
  const l=lances.find(x=>x.id===id);if(!l)return;
  l.ofertado=true;
  renderLances();
  const ok=await window._syncLance(l);
  if(!ok&&!window._pendentes.has('lance:'+l.id)){ l.ofertado=false; renderLances(); return; }
  if(window._saveAtividade)window._saveAtividade('ti-gavel',`Lance de ${l.clienteNome} ofertado`);
}
function removeLance(id){
  if(!can('lances_edit')){showToast('Você não tem permissão para remover lances.','ti-lock');return;}
  const l=lances.find(x=>x.id===id);if(!l)return;
  showConfirm(`Remover o lance de ${l.clienteNome}?`,async function(){
    if(l._auto){
      // automático: fica marcado como removido à mão (o banco não recria)
      l._removido=true; l._removidoManual=true;
      renderLances();
      const ok=await window._syncLance(l);
      if(!ok&&!window._pendentes.has('lance:'+l.id)){ l._removido=false; l._removidoManual=false; renderLances(); return; }
    } else if(l.sb_id){
      const {data,error}=await window._sb.from('lances').delete().eq('id',l.sb_id).select('id');
      if(error||!data||!data.length){
        showToast('Não foi possível remover o lance'+(error?': '+error.message:' (sem permissão).'),'ti-alert-triangle','#dc2626');
        return;
      }
      const i=lances.indexOf(l); if(i!==-1) lances.splice(i,1);
    } else {
      const i=lances.indexOf(l); if(i!==-1) lances.splice(i,1);
    }
    if(window._saveAtividade)window._saveAtividade('ti-trash',`Lance de ${l.clienteNome} removido`);
    renderLances();
  });
}

// ─── TABELA ───────────────────────────────────────────────────────────────────
function populateSelects(){
  const fe=document.getElementById('fEtapa');if(fe)fe.innerHTML='<option value="">Todas as etapas</option>'+ETAPAS.map(e=>`<option value="${e}">${ETAPAS_LABEL[e]||e}</option>`).join('');
  const fe2=document.getElementById('fEtapa2');if(fe2)fe2.innerHTML=ETAPAS.map(e=>`<option value="${e}">${ETAPAS_LABEL[e]||e}</option>`).join('');
  const fr=document.getElementById('fResp');if(fr)fr.innerHTML=users.map(u=>`<option value="${u.id}">${u.nome} (${getHierLabel(u)})</option>`).join('');
  // Filtro por consultor — visível apenas para gestor, representante, master e superadmin
  const fConsSel=document.getElementById('fConsultor');
  if(fConsSel){
    const me=getMe();
    const rolesComAcesso=['gestor','master','superadmin','admin','representante'];
    if(me&&rolesComAcesso.includes(me.role)){
      const vis=getVisiveisParaMim();
      const consultores=users.filter(u=>vis.has(u.id)&&['vendedor','supervisor','representante'].includes(u.role));
      fConsSel.innerHTML='<option value="">Todos os consultores</option>'+consultores.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
      fConsSel.style.display='';
    } else {
      fConsSel.style.display='none';
    }
  }
  // vvend é populado exclusivamente por rankAtualizarSidebar() com as regras de permissão corretas — NÃO sobrescrever aqui
  const _visLc=getVisiveisParaMim();
  const _leadsLc=leads.filter(l=>_visLc.has(l.responsavelId));
  const lc=document.getElementById('lCliente');if(lc)lc.innerHTML=_leadsLc.map(l=>`<option value="${l.id}">${l.nome}</option>`).join('');
  const sl=document.getElementById('sLeadSel');if(sl)sl.innerHTML='<option value="">Selecionar lead existente...</option>'+_leadsLc.map(l=>`<option value="${l.id}">${l.nome} — ${l.tipo} · ${fmtR(l.credito)}</option>`).join('');
  // Atualiza selects de hierarquia em todo o CRM
  const hierOpts='<option value="">Hierarquia...</option>'+hierarquias.slice().sort((a,b)=>a.ordem-b.ordem).map(h=>`<option value="${h.id}">${h.nome}</option>`).join('');
  const uHier=document.getElementById('uHierarquia');if(uHier)uHier.innerHTML=hierOpts;
  // Selects de hierarquia na lista de usuários
  document.querySelectorAll('.ulist-hier-sel').forEach(function(sel){
    const uid=parseInt(sel.getAttribute('data-uid'));
    const u=users.find(x=>x.id===uid);
    sel.innerHTML='<option value="">Hierarquia...</option>'+hierarquias.slice().sort((a,b)=>a.ordem-b.ordem).map(h=>`<option value="${h.id}"${u&&(u.hierarquiaId===h.sb_id||u.hierarquiaId===h.id)?' selected':''}>${h.nome}</option>`).join('');
  });
}
// Paginação da tabela de leads
const TABLE_PAGE_SIZE=50;
let tableCurrentPage=0;
let _rtTimer=null;

function renderTable(){
  tableCurrentPage=0; // reset ao filtrar
  if(_rtTimer)clearTimeout(_rtTimer);
  _rtTimer=setTimeout(_renderTableImediato,16);
}
function _renderTableImediato(){
  const q=(document.getElementById('srch').value||'').toLowerCase();
  const ft=document.getElementById('fTipo').value,fe=document.getElementById('fEtapa').value,fo=document.getElementById('fOrigem').value;
  const fc=document.getElementById('fConsultor')?.value||'';
  const vis=getVisiveisParaMim();
  const fl=leads.filter(l=>vis.has(l.responsavelId)&&(!q||l.nome.toLowerCase().includes(q)||(l.tel||'').includes(q))&&(!ft||l.tipo===ft)&&(!fe||l.etapa===fe)&&(!fo||l.origem===fo)&&(!fc||l.responsavelId===fc));
  const tbody=document.getElementById('leads-body');
  if(!fl.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:22px;color:var(--tm)">Nenhum lead encontrado.</td></tr>`;
    const pag=document.getElementById('table-paginacao');if(pag)pag.style.display='none';
    return;
  }
  const inicio=tableCurrentPage*TABLE_PAGE_SIZE;
  const pagina=fl.slice(inicio,inicio+TABLE_PAGE_SIZE);
  tbody.innerHTML=pagina.map(l=>{
    const si=ETAPAS.indexOf(l.etapa);
    const resp=users.find(u=>u.id===l.responsavelId);
    const isSel=selectedLeads.has(l.id);
    return `<tr class="${distribMode&&isSel?'lead-check-row sel':''}">
      <td><div style="display:flex;align-items:center;gap:8px">${distribMode?`<input type="checkbox" ${isSel?'checked':''} onchange="toggleLeadSelect(${l.id})" style="accent-color:var(--g);width:14px;height:14px">`:''}<span style="font-weight:600">${l.nome}</span></div></td>
      <td style="color:var(--tm)">${l.tel||'—'}</td>
      <td><span class="tag ${TMAP[l.tipo]||'ts3'}">${l.tipo}</span></td>
      <td style="font-weight:700;color:var(--g)">${fmtR(l.credito)}</td>
      <td><span class="ob">${l.origem||'—'}</span></td>
      <td style="font-size:12px;color:var(--tm)">${resp?resp.nome:'—'}</td>
      <td><span class="sb ${ES[si]||'s0'}">${l.etapa}</span></td>
      <td style="color:var(--tm);font-size:12px">${l.data}</td>
      <td style="display:flex;gap:4px">
        <button class="btn bsm" style="background:var(--c2);color:var(--tx);border:1px solid var(--c3)" onclick="openLeadDetalhe(${l.id})" title="Editar lead"><i class="ti ti-pencil"></i></button>
        <button class="btn bg bsm" onclick="simFromLead(${l.id})" title="Simular"><i class="ti ti-calculator"></i></button>
        <button class="btn bd bsm" onclick="removeLead(${l.id})" title="Remover"><i class="ti ti-trash"></i></button>
      </td></tr>`;}).join('');
  // Paginação
  const totalPags=Math.ceil(fl.length/TABLE_PAGE_SIZE);
  let pag=document.getElementById('table-paginacao');
  if(!pag){
    pag=document.createElement('div');pag.id='table-paginacao';
    pag.style.cssText='display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;font-size:13px;color:var(--tm)';
    tbody.closest('table')?.after(pag);
  }
  if(totalPags<=1){pag.style.display='none';return;}
  pag.style.display='flex';
  pag.innerHTML=`
    <button class="btn bsm" style="background:var(--c2);color:var(--tx);border:1px solid var(--c3)" ${tableCurrentPage===0?'disabled':''} onclick="tableIrPagina(${tableCurrentPage-1})"><i class="ti ti-chevron-left"></i></button>
    <span>Página ${tableCurrentPage+1} de ${totalPags} · ${fl.length} leads</span>
    <button class="btn bsm" style="background:var(--c2);color:var(--tx);border:1px solid var(--c3)" ${tableCurrentPage>=totalPags-1?'disabled':''} onclick="tableIrPagina(${tableCurrentPage+1})"><i class="ti ti-chevron-right"></i></button>`;
}
function tableIrPagina(p){
  tableCurrentPage=p;
  _renderTableImediato();
  document.querySelector('.tab-content[data-tab="lista"]')?.scrollIntoView({behavior:'smooth',block:'start'});
}

// ─── MODAL LEAD ───────────────────────────────────────────────────────────────
function openModal(){populateSelects();document.getElementById('modal').classList.add('open');}
function closeModal(){document.getElementById('modal').classList.remove('open');}
function saveLead(){
  const nome=document.getElementById('fNome').value.trim();if(!nome){showToast('Informe o nome do lead.','ti-alert-triangle','#d97706');return;}
  const credito=unM(document.getElementById('fCredito').value);
  const respId=parseInt(document.getElementById('fResp').value)||(getMe()||users[0]||{}).id||1;
  const lead={id:nextLeadId++,nome,tel:document.getElementById('fTel').value,tipo:document.getElementById('fTipo2').value,credito,etapa:document.getElementById('fEtapa2').value,origem:document.getElementById('fOrigem2').value,responsavelId:respId,data:toDate(),obs:document.getElementById('fObs').value};
  leads.push(lead);
  if(window._syncLead) window._syncLead(lead).catch(e=>console.warn(e));
  const resp=users.find(u=>u.id===respId);
  if(window._saveAtividade)window._saveAtividade('ti-user-plus',`Novo lead: ${nome} → ${resp?resp.nome:'—'}`);
  // Se cadastrado já como Fechado, atualiza stats do responsável
  if(lead.etapa==='Fechado / Convertido'){
    const rr=users.find(u=>u.id===respId);
    if(rr){rr.vendas=(rr.vendas||0)+1;rr.credito=(rr.credito||0)+credito;if(window._syncUser) window._syncUser(rr).catch(e=>console.warn(e));}
    if(window._registrarVenda) window._registrarVenda(lead,respId).catch(e=>console.warn(e));
    if(window._saveAtividade)window._saveAtividade('ti-circle-check',`${nome} fechado — ${fmtR(credito)}`);
    setTimeout(()=>alertarCadastroLance(nome, lead.id), 300);
  }
  closeModal();['fNome','fTel','fObs'].forEach(id=>document.getElementById(id).value='');document.getElementById('fCredito').value='';
  renderKanban();renderTable();renderDashboard();renderNotifPanel();
}
function removeLead(id){showConfirm('Remover este lead? Esta ação não pode ser desfeita.',function(){const _rl=leads.find(l=>l.id===id); if(_rl?.sb_id&&window._deleteLead) window._deleteLead(_rl.sb_id);const _rlIdx=leads.findIndex(l=>l.id===id);if(_rlIdx!==-1)leads.splice(_rlIdx,1);renderKanban();renderTable();renderDashboard();});}
function simFromLead(id){
  showTab('simulador',document.querySelectorAll('.nb')[3]);
  setTimeout(()=>{
    const sl=document.getElementById('sLeadSel');
    if(sl){sl.value=id;simLoadLead();}
  },50);
}


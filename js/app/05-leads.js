// ─── SELECTS COMPARTILHADOS ───────────────────────────────────────────────────
// Pessoas que podem receber/ser responsáveis por leads de quem está logado
function pessoasAtribuiveis(){
  const me=getMe();
  if(isGestor(me)) return users.slice();
  const vis=getVisiveisParaMim();
  return users.filter(u=>vis.has(u.id));
}
// Cargos que quem está logado pode dar a outra pessoa (sempre abaixo do seu)
function hierarquiasAtribuiveis(){
  const me=getMe();
  const ativas=hierarquias.filter(h=>h.status!=='inativa').sort((a,b)=>a.ordem-b.ordem);
  if(isGestor(me)) return ativas;
  const n=nivelDe(me);
  return ativas.filter(h=>(h.ordem||99)>n&&slugToRole(h)!=='gestor');
}
function populateSelects(){
  const optEtapas=ETAPAS.map(e=>`<option value="${esc(e)}">${esc(etapaLabel(e))}</option>`).join('');
  const fe=document.getElementById('fEtapa');if(fe){const v=fe.value;fe.innerHTML='<option value="">Todas as etapas</option>'+optEtapas;fe.value=v;}
  const fe2=document.getElementById('fEtapa2');if(fe2)fe2.innerHTML=optEtapas;
  const me=getMe();
  const pessoas=pessoasAtribuiveis().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const fr=document.getElementById('fResp');
  if(fr){
    fr.innerHTML=pessoas.map(u=>`<option value="${u.id}">${esc(u.nome)} (${esc(getHierLabel(u))})</option>`).join('');
    if(me&&pessoas.some(u=>u.id===me.id)) fr.value=me.id;
  }
  // Filtro por consultor — para quem enxerga leads de outras pessoas
  const fConsSel=document.getElementById('fConsultor');
  if(fConsSel){
    if(pessoas.length>1){
      const v=fConsSel.value;
      fConsSel.innerHTML='<option value="">Todos os consultores</option>'+pessoas.map(u=>`<option value="${u.id}">${esc(u.nome)}</option>`).join('');
      fConsSel.value=v;
      fConsSel.style.display='';
    } else {
      fConsSel.value='';
      fConsSel.style.display='none';
    }
  }
  // vvend é preenchido por rankAtualizarSidebar() (regras de venda) — não mexer aqui
  const vis=getVisiveisParaMim();
  const gestor=isGestor(me);
  const leadsVis=leads.filter(l=>gestor||vis.has(l.responsavelId));
  const lc=document.getElementById('lCliente');if(lc)lc.innerHTML=leadsVis.map(l=>`<option value="${l.id}">${esc(l.nome)}</option>`).join('');
  const sl=document.getElementById('sLeadSel');if(sl)sl.innerHTML='<option value="">Selecionar lead existente...</option>'+leadsVis.map(l=>`<option value="${l.id}">${esc(l.nome)} — ${esc(l.tipo)} · ${fmtR(l.credito)}</option>`).join('');
  // Cargos que a pessoa pode atribuir (cadastro de usuário)
  const hierOpts='<option value="">Hierarquia...</option>'+hierarquiasAtribuiveis().map(h=>`<option value="${esc(h.sb_id||h.id)}">${esc(h.nome)}</option>`).join('');
  const uHier=document.getElementById('uHierarquia');if(uHier){const v=uHier.value;uHier.innerHTML=hierOpts;uHier.value=v;}
}

// ─── TABELA DE LEADS ──────────────────────────────────────────────────────────
const TABLE_PAGE_SIZE=50;
let tableCurrentPage=0;
let _rtTimer=null;

function renderTable(){
  tableCurrentPage=0; // volta para a 1ª página ao filtrar
  if(_rtTimer)clearTimeout(_rtTimer);
  _rtTimer=setTimeout(_renderTableImediato,16);
}
function _nomeResponsavel(l,porId){
  const r=porId.get(l.responsavelId);
  if(r) return r.nome;
  const ina=l.responsavelSbId&&window.usersInativos&&window.usersInativos[l.responsavelSbId];
  return ina?`${ina.nome} (removido)`:'—';
}
function _renderTableImediato(){
  const tbody=document.getElementById('leads-body');
  if(!tbody)return;
  const q=(document.getElementById('srch')?.value||'').trim().toLowerCase();
  const qDig=q.replace(/\D/g,'');
  const ft=document.getElementById('fTipo')?.value||'',fe=document.getElementById('fEtapa')?.value||'',fo=document.getElementById('fOrigem')?.value||'';
  const fc=parseInt(document.getElementById('fConsultor')?.value)||0;
  const vis=getVisiveisParaMim();
  const gestor=isGestor();
  const fl=leads.filter(l=>(gestor||vis.has(l.responsavelId))
    &&(!q||l.nome.toLowerCase().includes(q)||(qDig.length>=3&&(l.tel||'').includes(qDig)))
    &&(!ft||l.tipo===ft)&&(!fe||l.etapa===fe)&&(!fo||l.origem===fo)&&(!fc||l.responsavelId===fc));
  const pag0=document.getElementById('table-paginacao');
  if(!fl.length){
    tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:22px;color:var(--tm)">Nenhum lead encontrado.</td></tr>`;
    if(pag0)pag0.style.display='none';
    return;
  }
  const totalPags=Math.ceil(fl.length/TABLE_PAGE_SIZE);
  if(tableCurrentPage>=totalPags)tableCurrentPage=totalPags-1;
  const inicio=tableCurrentPage*TABLE_PAGE_SIZE;
  const pagina=fl.slice(inicio,inicio+TABLE_PAGE_SIZE);
  const porId=new Map(users.map(u=>[u.id,u]));
  const podeSim=can('simulador_view'), podeExcluir=can('leads_delete');
  tbody.innerHTML=pagina.map(l=>{
    const si=ETAPAS.indexOf(l.etapa);
    const isSel=selectedLeads.has(l.id);
    return `<tr class="${distribMode&&isSel?'lead-check-row sel':''}">
      <td><div style="display:flex;align-items:center;gap:8px">${distribMode?`<input type="checkbox" ${isSel?'checked':''} onchange="toggleLeadSelect(${l.id})" style="accent-color:var(--g);width:14px;height:14px">`:''}<span style="font-weight:600">${esc(l.nome)}</span></div></td>
      <td style="color:var(--tm)">${esc(formatTelefone(l.tel)||'—')}</td>
      <td><span class="tag ${TMAP[l.tipo]||'ts3'}">${esc(l.tipo)}</span></td>
      <td style="font-weight:700;color:var(--g)">${fmtR(l.credito)}</td>
      <td><span class="ob">${esc(l.origem||'—')}</span></td>
      <td style="font-size:12px;color:var(--tm)">${esc(_nomeResponsavel(l,porId))}</td>
      <td><span class="sb ${ES[si]||'s0'}">${esc(etapaLabel(l.etapa))}</span></td>
      <td style="color:var(--tm);font-size:12px">${esc(l.data)}</td>
      <td style="display:flex;gap:4px">
        <button class="btn bsm" style="background:var(--c2);color:var(--tx);border:1px solid var(--c3)" onclick="openLeadDetalhe(${l.id})" title="Abrir lead"><i class="ti ti-pencil"></i></button>
        ${podeSim?`<button class="btn bg bsm" onclick="simFromLead(${l.id})" title="Simular"><i class="ti ti-calculator"></i></button>`:''}
        ${podeExcluir?`<button class="btn bd bsm" onclick="removeLead(${l.id})" title="Remover"><i class="ti ti-trash"></i></button>`:''}
      </td></tr>`;}).join('');
  let pag=pag0;
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
  tableCurrentPage=Math.max(0,p);
  _renderTableImediato();
  document.getElementById('tab-leads')?.scrollIntoView({behavior:'smooth',block:'start'});
}

// ─── NOVO LEAD ────────────────────────────────────────────────────────────────
function openModal(etapa){
  if(!can('leads_create')){showToast('Você não tem permissão para cadastrar leads.','ti-lock');return;}
  populateSelects();
  const fe2=document.getElementById('fEtapa2');
  if(fe2) fe2.value=(typeof etapa==='string'&&ETAPAS.includes(etapa))?etapa:ETAPAS[0];
  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.getElementById('fNome')?.focus(),50);
}
function closeModal(){document.getElementById('modal').classList.remove('open');}
let _salvandoLead=false;
async function saveLead(){
  if(_salvandoLead)return;
  if(!can('leads_create')){showToast('Você não tem permissão para cadastrar leads.','ti-lock');return;}
  const nome=document.getElementById('fNome').value.trim();
  if(!nome){showToast('Informe o nome do lead.','ti-alert-triangle','#d97706');return;}
  const me=getMe();
  const pessoas=pessoasAtribuiveis();
  const resp=pessoas.find(u=>u.id===parseInt(document.getElementById('fResp').value))||me;
  if(!resp){showToast('Escolha o responsável.','ti-alert-triangle','#d97706');return;}
  const tel=normalizaTelefone(document.getElementById('fTel').value);
  const chave=chaveTelefone(tel);
  if(chave){
    // telefone repetido? confere na tela e na empresa inteira (sem expor dados de outras equipes)
    _salvandoLead=true;
    let aviso=null;
    const igual=leads.find(l=>chaveTelefone(l.tel)===chave);
    if(igual) aviso=`Já existe um lead com este telefone: ${igual.nome}.`;
    else{
      const {data}=await window._rpc('crm_leads_existentes',{p_meta_ids:[],p_chaves:[chave]});
      if(data&&data.length) aviso='Já existe um lead com este telefone na empresa (de outro consultor).';
    }
    _salvandoLead=false;
    if(aviso){ showConfirm(`${aviso} Cadastrar mesmo assim?`,()=>_salvarNovoLead(nome,tel,resp)); return; }
  }
  _salvarNovoLead(nome,tel,resp);
}
async function _salvarNovoLead(nome,tel,resp){
  _salvandoLead=true;
  const lead={id:nextLeadId++,nome,tel,tipo:document.getElementById('fTipo2').value,credito:unM(document.getElementById('fCredito').value),
    etapa:document.getElementById('fEtapa2').value||ETAPAS[0],origem:document.getElementById('fOrigem2').value,
    responsavelId:resp.id,data:toDate(),obs:document.getElementById('fObs').value,atendimento:''};
  leads.unshift(lead);
  closeModal();
  renderKanban();renderTable();
  const ok=await window._syncLead(lead);
  _salvandoLead=false;
  if(!ok&&!window._leadPendente(lead)){
    const i=leads.indexOf(lead); if(i!==-1) leads.splice(i,1);
    renderKanban();renderTable();
    document.getElementById('modal').classList.add('open'); // devolve o formulário preenchido
    return;
  }
  ['fNome','fTel','fObs'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const fc=document.getElementById('fCredito');if(fc)fc.value='';
  if(window._saveAtividade)window._saveAtividade('ti-user-plus',`Novo lead: ${nome} → ${resp.nome}`);
  if(lead.etapa==='Fechado / Convertido'){
    // o banco registra a venda e o lance automático
    if(window._saveAtividade)window._saveAtividade('ti-circle-check',`${nome} fechado — ${fmtR(lead.credito)}`);
    _atualizarAposVenda();
    setTimeout(()=>showCelebra(resp.nome,lead.credito),100);
  }
  renderKanban();renderTable();renderDashboard();renderNotifPanel();
}

// ─── EXCLUIR LEAD ─────────────────────────────────────────────────────────────
function removeLead(id,doDetalhe){
  const l=leads.find(x=>x.id===id);
  if(!l)return;
  if(!can('leads_delete')||!_leadVisivel(l)){showToast('Você não tem permissão para excluir este lead.','ti-lock');return;}
  showConfirm(`Remover o lead "${l.nome}"? Esta ação não pode ser desfeita.`,async function(){
    const ok=await window._deleteLead(l.sb_id);
    if(!ok){showToast('Não foi possível excluir: sem permissão ou sem conexão.','ti-alert-triangle','#dc2626');return;}
    const i=leads.indexOf(l); if(i!==-1) leads.splice(i,1);
    if(doDetalhe) closeLeadDetalhe();
    if(window._saveAtividade)window._saveAtividade('ti-trash',`Lead excluído: ${l.nome}`);
    if(l.etapa==='Fechado / Convertido') _atualizarAposVenda();
    renderKanban();renderTable();renderDashboard();renderNotifPanel();
    showToast('Lead removido.','ti-trash','#e53e3e');
  });
}
function simFromLead(id){
  if(!podeAba('simulador')){showToast('Você não tem acesso ao Simulador.','ti-lock');return;}
  showTab('simulador');
  setTimeout(()=>{
    const sl=document.getElementById('sLeadSel');
    if(sl){sl.value=id;simLoadLead();}
  },50);
}

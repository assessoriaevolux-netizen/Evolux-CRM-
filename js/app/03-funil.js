// ─── FUNIL SELECAO ────────────────────────────────────────────────────────────
let funilSelMode=false;
let funilSelected=new Set();

function toggleFunilFiltros(){
  const bar=document.getElementById('funil-filtros-bar');
  const isOpen=bar.style.display==='flex';
  bar.style.display=isOpen?'none':'flex';
  // popula consultor
  const fc=document.getElementById('ff-consultor');
  // Popula apenas usuários visíveis para o usuário logado
  const vis=getVisiveisParaMim();
  const usersVisiveis=users.filter(u=>vis.has(u.id));
  if(fc)fc.innerHTML='<option value="">Todos os consultores</option>'+usersVisiveis.map(u=>`<option value="${u.id}">${esc(u.nome)}</option>`).join('');
}
function limparFiltrosFunil(){
  ['ff-consultor','ff-origem','ff-tipo','ff-atendimento'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderKanban();
}
// ─── FILTRO DE PERÍODO DO FUNIL ──────────────────────────────────────────────
let funilPeriodo='max'; // 'max' | 'mes' | '7dias' | 'hoje' | 'mes_custom'
let funilMesCustom=''; // 'YYYY-MM'

function setFunilPeriodo(p,btn){
  funilPeriodo=p;
  document.querySelectorAll('.periodo-tab-funil').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const inp=document.getElementById('fp-month-input');
  if(p==='mes_custom'){
    inp.style.display='inline-block';
    if(!funilMesCustom){
      const hoje=new Date();
      funilMesCustom=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
      inp.value=funilMesCustom;
      document.getElementById('fp-custom-label').textContent=_fmtMesLabel(funilMesCustom);
    }
  } else {
    inp.style.display='none';
  }
  renderKanban();
}
function onFunilMonthChange(val){
  funilMesCustom=val;
  document.getElementById('fp-custom-label').textContent=_fmtMesLabel(val);
  renderKanban();
}
function _fmtMesLabel(ym){
  if(!ym)return 'Escolher mês';
  const [y,m]=ym.split('-');
  const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${meses[parseInt(m)-1]}/${y}`;
}
function _funilDateRange(){
  const hoje=new Date();
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  if(funilPeriodo==='hoje') return {de:fmt(hoje),ate:fmt(hoje)};
  if(funilPeriodo==='7dias'){const d=new Date(hoje);d.setDate(d.getDate()-6);return{de:fmt(d),ate:fmt(hoje)};}
  if(funilPeriodo==='mes'){const ini=new Date(hoje.getFullYear(),hoje.getMonth(),1);return{de:fmt(ini),ate:fmt(hoje)};}
  if(funilPeriodo==='mes_custom'&&funilMesCustom){
    const [y,m]=funilMesCustom.split('-').map(Number);
    const ini=new Date(y,m-1,1);
    const fim=new Date(y,m,0);
    return{de:fmt(ini),ate:fmt(fim)};
  }
  return null; // max = sem filtro
}
// Converte data do lead (dd/mm/yyyy ou yyyy-mm-dd) para yyyy-mm-dd para comparação
function _leadDataISO(l){
  const d=l.data||'';
  if(!d)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d;
  const p=d.split('/');
  if(p.length===3)return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  return d;
}

function getFunilFiltros(){
  return {
    consultor:document.getElementById('ff-consultor')?.value||'',
    origem:document.getElementById('ff-origem')?.value||'',
    tipo:document.getElementById('ff-tipo')?.value||'',
    atendimento:document.getElementById('ff-atendimento')?.value||''
  };
}
function _atualizarContagemSel(){
  const n=funilSelected.size;
  document.getElementById('funil-sel-count').textContent=`${n} lead${n!==1?'s':''} selecionado${n!==1?'s':''}`;
}
function toggleFunilSelMode(){
  if(!funilSelMode&&!can('leads_transfer')&&!can('leads_delete')&&!can('whatsapp_bulk')){
    showToast('Você não tem permissão para transferir, excluir ou disparar para leads.','ti-lock');
    return;
  }
  funilSelMode=!funilSelMode;
  funilSelected.clear();
  _atualizarContagemSel();
  const bar=document.getElementById('funil-transfer-bar');
  bar.style.display=funilSelMode?'flex':'none';
  const podeTransf=can('leads_transfer');
  const dest=document.getElementById('funil-transfer-dest');
  // Transferência pode ir para qualquer pessoa ativa da empresa (o banco confere a permissão)
  if(dest){
    dest.style.display=podeTransf?'':'none';
    dest.innerHTML='<option value="">Transferir para...</option>'+users.map(u=>`<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  }
  const bt=document.getElementById('btn-funil-transferir'); if(bt) bt.style.display=podeTransf?'':'none';
  const bx=document.getElementById('btn-funil-excluir'); if(bx) bx.style.display=can('leads_delete')?'':'none';
  const bw=document.getElementById('btn-funil-wa'); if(bw) bw.style.display=can('whatsapp_bulk')?'':'none';
  renderKanban();
}
function cancelarSelecaoFunil(){funilSelMode=false;funilSelected.clear();document.getElementById('funil-transfer-bar').style.display='none';renderKanban();}
// Leva os leads selecionados no funil para o disparo em massa do WhatsApp
function funilDispararWhatsApp(){
  if(funilSelected.size===0){showToast('Selecione ao menos um lead.','ti-alert-triangle','#d97706');return;}
  if(typeof WA==='undefined'){showToast('A aba WhatsApp ainda não carregou.','ti-alert-triangle','#d97706');return;}
  const ids=[...funilSelected].map(id=>leads.find(x=>x.id===id)).filter(l=>l&&l.sb_id).map(l=>String(l.sb_id));
  WA.disp.sel=new Set(ids);
  WA.disp.filtros={etapa:'',tipo:'',resp:'',origem:'',busca:''};
  WA.disp.confirmando=false;WA.disp.acompanhar=null;
  WA.aba='disparo';
  cancelarSelecaoFunil();
  showTab('whatsapp');
}
function toggleFunilCard(id){
  if(funilSelected.has(id))funilSelected.delete(id);else funilSelected.add(id);
  _atualizarContagemSel();
  renderKanban();
}
function toggleSelectColuna(etapa){
  // Respeita o filtro de período e demais filtros ativos
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const col=leads.filter(l=>l.etapa===etapa&&applyFunilFilter(l,f,vis));
  const allSel=col.every(l=>funilSelected.has(l.id));
  col.forEach(l=>allSel?funilSelected.delete(l.id):funilSelected.add(l.id));
  _atualizarContagemSel();
  renderKanban();
}
function selectAllFunil(){
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const filtrados=leads.filter(l=>applyFunilFilter(l,f,vis));
  const allSel=filtrados.every(l=>funilSelected.has(l.id));
  filtrados.forEach(l=>allSel?funilSelected.delete(l.id):funilSelected.add(l.id));
  _atualizarContagemSel();
  renderKanban();
}
// Transfere leads (inclusive para outra equipe) pelo servidor, que confere a permissão
async function transferirLeadsPara(ids,dest){
  const sbIds=ids.map(id=>leads.find(x=>x.id===id)).filter(l=>l&&l.sb_id).map(l=>l.sb_id);
  if(!sbIds.length) return 0;
  const {data,error}=await window._rpc('crm_transferir_leads',{p_ids:sbIds,p_destino:dest.sb_id});
  if(error){ showToast('Não foi possível transferir: '+error.message,'ti-alert-triangle','#dc2626'); return -1; }
  if(window._saveAtividade) window._saveAtividade('ti-arrows-right-left',`${data} lead${data!==1?'s':''} transferido${data!==1?'s':''} para ${dest.nome}`);
  await window._loadLeads();
  return data||0;
}
async function transferirSelecionados(){
  if(!can('leads_transfer')){showToast('Sem permissão para transferir leads.','ti-lock');return;}
  const destId=parseInt(document.getElementById('funil-transfer-dest').value)||0;
  if(!destId){showToast('Selecione para quem transferir.','ti-alert-triangle','#d97706');return;}
  if(funilSelected.size===0){showToast('Selecione ao menos um lead.','ti-alert-triangle','#d97706');return;}
  const dest=users.find(u=>u.id===destId);
  if(!dest||!dest.sb_id){showToast('Consultor não encontrado.','ti-alert-triangle','#d97706');return;}
  const n=await transferirLeadsPara([...funilSelected],dest);
  if(n<0) return;
  cancelarSelecaoFunil();
  showToast(`${n} lead${n!==1?'s':''} transferido${n!==1?'s':''} para ${dest.nome}.`,'ti-check','#1db954');
  renderKanban();renderDashboard();renderTable();renderNotifPanel();
}
function excluirSelecionados(){
  if(!can('leads_delete')){showToast('Sem permissão para excluir leads.','ti-lock');return;}
  if(funilSelected.size===0){showToast('Selecione ao menos um lead.','ti-alert-triangle','#d97706');return;}
  const qtd=funilSelected.size;
  showConfirm(`Excluir ${qtd} lead${qtd!==1?'s':''} selecionado${qtd!==1?'s':''}? Essa ação não pode ser desfeita.`,async function(){
    const alvo=[...funilSelected].map(id=>leads.find(x=>x.id===id)).filter(Boolean);
    const sbIds=alvo.filter(l=>l.sb_id).map(l=>l.sb_id);
    let excluidos=new Set();
    for(let i=0;i<sbIds.length;i+=200){
      const {data,error}=await window._sb.from('leads').delete().in('id',sbIds.slice(i,i+200)).select('id');
      if(error){showToast('Erro ao excluir: '+error.message,'ti-alert-triangle','#dc2626');break;}
      (data||[]).forEach(r=>excluidos.add(r.id));
    }
    alvo.forEach(l=>{ if(!l.sb_id||excluidos.has(l.sb_id)){ const i=leads.indexOf(l); if(i!==-1) leads.splice(i,1); } });
    const n=alvo.filter(l=>!l.sb_id||excluidos.has(l.sb_id)).length;
    cancelarSelecaoFunil();
    if(n<qtd) showToast(`${n} excluído${n!==1?'s':''}; ${qtd-n} sem permissão.`,'ti-alert-triangle','#d97706');
    else showToast(`${n} lead${n!==1?'s':''} excluído${n!==1?'s':''}.`,'ti-trash','#e53e3e');
    if(window._saveAtividade&&n) window._saveAtividade('ti-trash',`${n} lead${n!==1?'s':''} excluído${n!==1?'s':''}`);
    renderKanban();renderDashboard();renderTable();renderNotifPanel();
  });
}
function applyFunilFilter(l,f,vis){
  // Visibilidade hierárquica: só mostra leads que o usuário pode ver
  if(!vis) vis=getVisiveisParaMim();
  if(!isGestor()&&!vis.has(l.responsavelId)) return false;
  if(f.consultor&&l.responsavelId!==parseInt(f.consultor))return false;
  if(f.origem&&l.origem!==f.origem)return false;
  if(f.tipo&&l.tipo!==f.tipo)return false;
  if(f.atendimento&&(l.atendimento||'')!==f.atendimento)return false;
  // Filtro de período
  const range=_funilDateRange();
  if(range){
    // vale a data do lead (formulário/planilha) OU o dia em que ele entrou no CRM
    const noPeriodo=d=>!!d&&d>=range.de&&d<=range.ate;
    if(!noPeriodo(_leadDataISO(l))&&!noPeriodo(l.entrada))return false;
  }
  return true;
}

// ─── KANBAN + DRAG ────────────────────────────────────────────────────────────
// Cada coluna mostra 50 cards por vez (botão "Ver mais" carrega o resto aos poucos)
const KANBAN_PAGE_SIZE=50;
let kanbanColPage={}; // { etapa: número de cards visíveis }
const ATD_LABEL={aguardando:'⏳ Aguardando',em_andamento:'🔵 Em andamento',finalizado:'✅ Finalizado'};

function renderKanbanColuna(etapa,i,f,vis,ctx){
  const todosCards=leads.filter(l=>l.etapa===etapa&&applyFunilFilter(l,f,vis));
  const limite=kanbanColPage[etapa]||KANBAN_PAGE_SIZE;
  const cards=todosCards.slice(0,limite);
  const allColSel=cards.length>0&&cards.every(l=>funilSelected.has(l.id));
  const restantes=todosCards.length-cards.length;
  return `<div class="col" ondragover="onDragOver(event,this)" ondragleave="onDragLeave(event,this)" ondrop="onDrop(event,${i})">
    <div class="col-hdr">
      <span class="cn2"><span class="cdot" style="background:${EC[i]}"></span>${esc(etapaLabel(etapa))}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="ccnt">${todosCards.length}</span>
        ${funilSelMode?`<input type="checkbox" title="Selecionar coluna" ${allColSel?'checked':''} onclick="event.stopPropagation();toggleSelectColuna(ETAPAS[${i}])" style="accent-color:var(--b);cursor:pointer">`:''}
      </div>
    </div>
    ${cards.map(l=>{
      const isSel=funilSelected.has(l.id);
      const resp=ctx.usersPorId.get(l.responsavelId);
      const podeDrag=ctx.podeMover&&!funilSelMode;
      return `<div class="kcard${isSel?' kcard-sel':''}${!ctx.podeAbrir?' kcard-readonly':''}" draggable="${podeDrag}" data-id="${l.id}"
        ondragstart="${podeDrag?`onDragStart(event,${l.id})`:'return false'}"
        onclick="${funilSelMode?`toggleFunilCard(${l.id})`:`openLeadDetalhe(${l.id})`}">
        ${funilSelMode?`<input type="checkbox" ${isSel?'checked':''} onclick="event.stopPropagation();toggleFunilCard(${l.id})" style="accent-color:var(--b);float:right;margin-left:4px;cursor:pointer">`:''}
        <div class="kcard-n">${esc(l.nome)}</div>
        <div class="kcard-i">${esc(formatTelefone(l.tel)||'—')}${resp?` · <span style="color:var(--b)">${esc(resp.nome.split(' ')[0])}</span>`:''}</div>
        ${l.atendimento?`<div style="font-size:10px;color:var(--tm);margin-bottom:4px">${ATD_LABEL[l.atendimento]||''}</div>`:''}
        <div class="kcard-b"><span class="tag ${TMAP[l.tipo]||'ts3'}">${esc(l.tipo)}</span><span class="kcard-v">${fmtR(l.credito)}</span></div>
      </div>`;
    }).join('')}
    ${restantes>0?`<button class="add-col-btn" style="width:100%;margin-top:4px" onclick="kanbanVerMais(${i})"><i class="ti ti-chevron-down"></i>Ver mais (${restantes})</button>`:''}
    <div style="display:flex;gap:4px;margin-top:4px">
      ${ctx.podeCriar?`<button class="add-col-btn" style="flex:1" onclick="openModal(ETAPAS[${i}])"><i class="ti ti-plus"></i>Adicionar</button>`:''}
      ${funilSelMode?`<button class="add-col-btn" style="flex:0 0 auto;padding:6px 8px" title="Selecionar todos nesta coluna" onclick="toggleSelectColuna(ETAPAS[${i}])"><i class="ti ti-select-all"></i></button>`:''}
    </div>
  </div>`;
}

function kanbanVerMais(i){
  const etapa=ETAPAS[i];
  kanbanColPage[etapa]=(kanbanColPage[etapa]||KANBAN_PAGE_SIZE)+KANBAN_PAGE_SIZE*2;
  renderKanban();
}

// Debounce para evitar múltiplos renders em cascata
let _rkTimer=null;
function renderKanban(){
  if(_rkTimer)clearTimeout(_rkTimer);
  _rkTimer=setTimeout(_renderKanbanImediato,16);
}
function _renderKanbanImediato(){
  const el=document.getElementById('kanban');
  if(!el)return;
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const ctx={
    usersPorId:new Map(users.map(u=>[u.id,u])),
    podeMover:can('funil_move'),
    podeAbrir:can('leads_edit')||can('funil_move'),
    podeCriar:can('leads_create'),
  };
  const totalFiltrado=leads.filter(l=>applyFunilFilter(l,f,vis)).length;
  document.getElementById('funil-total').textContent=totalFiltrado;
  el.innerHTML=ETAPAS.map((etapa,i)=>renderKanbanColuna(etapa,i,f,vis,ctx)).join('');
}
// ─── EDITAR FUNIL (só o nome exibido de cada etapa; o banco guarda por empresa) ──
function openEditarFunil(){
  if(!can('funil_edit')){showToast('Você não tem permissão para editar o funil.','ti-lock');return;}
  const list=document.getElementById('funil-etapas-list');
  list.innerHTML=ETAPAS.map((e,i)=>`
    <div style="display:flex;align-items:center;gap:8px">
      <span class="cdot" style="background:${EC[i]};flex-shrink:0"></span>
      <input type="text" class="fi" value="${esc(etapaLabel(e))}" id="ef-${i}" maxlength="40" placeholder="${esc(ETAPAS_LABEL_PADRAO[e]||e)}" style="flex:1">
    </div>`).join('')+`<div style="font-size:11.5px;color:var(--tm);margin-top:6px">Muda só o nome que aparece. Os leads continuam nas mesmas etapas.</div>`;
  document.getElementById('modal-editar-funil').classList.add('open');
}
function closeEditarFunil(){document.getElementById('modal-editar-funil').classList.remove('open');}
async function salvarEditarFunil(){
  const labels={};
  for(let i=0;i<ETAPAS.length;i++){
    const inp=document.getElementById(`ef-${i}`);
    const v=(inp?inp.value:'').trim();
    if(!v){showToast('O nome da etapa não pode ficar vazio.','ti-alert-triangle','#d97706');return;}
    if(v!==(ETAPAS_LABEL_PADRAO[ETAPAS[i]]||ETAPAS[i])) labels[ETAPAS[i]]=v.slice(0,40);
  }
  const {error}=await window._rpc('crm_salvar_etapas',{p_labels:labels});
  if(error){showToast('Não foi possível salvar: '+error.message,'ti-alert-triangle','#dc2626');return;}
  aplicarEtapasLabels(labels);
  closeEditarFunil();
  showToast('Nomes das etapas salvos.','ti-check');
  renderKanban();renderDashboard();populateSelects();
}

// ─── DETALHE / EDIÇÃO DO LEAD ─────────────────────────────────────────────────
let _leadDetalheId=null;
// Mantém valores que não estão na lista (ex.: origem "Simulador") para não apagá-los ao salvar
function _garantirOpcao(sel,valor){
  if(!sel)return;
  sel.querySelectorAll('option[data-extra]').forEach(o=>o.remove());
  if(valor&&![...sel.options].some(o=>o.value===valor)){
    const o=document.createElement('option');
    o.value=valor;o.textContent=valor;o.setAttribute('data-extra','1');
    sel.appendChild(o);
  }
  sel.value=valor||'';
}
function openLeadDetalhe(id){
  _leadDetalheId=id;
  const l=leads.find(x=>x.id===id);if(!l)return;
  const vis=getVisiveisParaMim();
  const podeEd=podeEditarLead(l,vis);
  const podeMov=podeMoverLead(l,vis);
  const podeTransf=can('leads_transfer')&&(isGestor()||vis.has(l.responsavelId));
  const tit=document.getElementById('lead-det-titulo');
  tit.innerHTML='<i class="ti ti-user" style="color:var(--b)"></i> ';
  tit.appendChild(document.createTextNode(l.nome));
  document.getElementById('ld-nome').value=l.nome;
  document.getElementById('ld-tel').value=formatTelefone(l.tel)||'';
  _garantirOpcao(document.getElementById('ld-tipo'),l.tipo);
  document.getElementById('ld-credito').value=l.credito?l.credito.toLocaleString('pt-BR'):'';
  const ldEtapa=document.getElementById('ld-etapa');
  ldEtapa.innerHTML=ETAPAS.map(e=>`<option value="${esc(e)}"${e===l.etapa?' selected':''}>${esc(etapaLabel(e))}</option>`).join('');
  _garantirOpcao(document.getElementById('ld-origem'),l.origem||'');
  const ldResp=document.getElementById('ld-resp');
  const usersOpt=users.filter(u=>isGestor()||vis.has(u.id));
  ldResp.innerHTML=(l.responsavelId?'':'<option value="" selected>— sem responsável —</option>')+
    usersOpt.map(u=>`<option value="${u.id}"${u.id===l.responsavelId?' selected':''}>${esc(u.nome)}</option>`).join('');
  document.getElementById('ld-atendimento').value=l.atendimento||'';
  document.getElementById('ld-obs').value=l.obs||'';
  ['ld-nome','ld-tel','ld-tipo','ld-credito','ld-origem','ld-atendimento','ld-obs'].forEach(cid=>{const el=document.getElementById(cid);if(el)el.disabled=!podeEd;});
  ldEtapa.disabled=!podeMov;
  ldResp.disabled=!podeTransf;
  const btnSave=document.getElementById('btn-save-lead-det');
  const btnRem=document.getElementById('btn-rem-lead-det');
  if(btnSave)btnSave.style.display=(podeEd||podeMov||podeTransf)?'':'none';
  if(btnRem)btnRem.style.display=(can('leads_delete')&&(isGestor()||vis.has(l.responsavelId)))?'':'none';
  const btnWa=document.getElementById('btn-wa-lead-det');
  if(btnWa)btnWa.style.display=(can('whatsapp_view')&&l.sb_id&&integNumeros().length)?'':'none';
  document.getElementById('modal-lead-detalhe').classList.add('open');
}
function closeLeadDetalhe(){
  document.getElementById('modal-lead-detalhe').classList.remove('open');
  _leadDetalheId=null;
  ['ld-nome','ld-tel','ld-tipo','ld-credito','ld-etapa','ld-origem','ld-resp','ld-atendimento','ld-obs'].forEach(cid=>{const el=document.getElementById(cid);if(el)el.disabled=false;});
  const btnSave=document.getElementById('btn-save-lead-det');const btnRem=document.getElementById('btn-rem-lead-det');
  if(btnSave)btnSave.style.display='';if(btnRem)btnRem.style.display='';
}
// Depois de fechar/reabrir venda: o banco já acertou vendas e lances; atualiza a tela
function _atualizarAposVenda(){
  if(window._invalidarRanking) window._invalidarRanking();
  setTimeout(()=>{ window._loadProfiles&&window._loadProfiles(); window._loadLances&&window._loadLances(); },600);
}
async function saveLeadDetalhe(){
  const l=leads.find(x=>x.id===_leadDetalheId);if(!l)return;
  const vis=getVisiveisParaMim();
  const podeEd=podeEditarLead(l,vis), podeMov=podeMoverLead(l,vis), podeTransf=can('leads_transfer')&&(isGestor()||vis.has(l.responsavelId));
  const antes={...l};
  if(podeEd){
    const nome=document.getElementById('ld-nome').value.trim();
    if(!nome){showToast('Informe o nome.','ti-alert-triangle','#d97706');return;}
    l.nome=nome;
    l.tel=normalizaTelefone(document.getElementById('ld-tel').value);
    l.tipo=document.getElementById('ld-tipo').value;
    l.credito=unM(document.getElementById('ld-credito').value)||l.credito;
    l.origem=document.getElementById('ld-origem').value;
    l.atendimento=document.getElementById('ld-atendimento').value;
    l.obs=document.getElementById('ld-obs').value;
  }
  if(podeMov) l.etapa=document.getElementById('ld-etapa').value;
  if(podeTransf) l.responsavelId=parseInt(document.getElementById('ld-resp').value)||l.responsavelId;
  const ok=await window._syncLead(l);
  if(!ok&&!window._leadPendente(l)){ Object.assign(l,antes); renderKanban();renderTable(); return; }
  if(antes.etapa!==l.etapa){
    if(window._saveAtividade)window._saveAtividade('ti-arrows-right-left',`${l.nome}: ${etapaLabel(antes.etapa)} → ${etapaLabel(l.etapa)}`);
    if(l.etapa==='Fechado / Convertido'){
      const r=users.find(u=>u.id===l.responsavelId);
      setTimeout(()=>showCelebra(r?r.nome:'Vendedor',l.credito),100);
    }
    if(antes.etapa==='Fechado / Convertido'||l.etapa==='Fechado / Convertido') _atualizarAposVenda();
  } else if(l.etapa==='Fechado / Convertido'&&(antes.credito!==l.credito||antes.responsavelId!==l.responsavelId)) _atualizarAposVenda();
  if(antes.responsavelId!==l.responsavelId&&window._saveAtividade){
    const d=users.find(u=>u.id===l.responsavelId);
    window._saveAtividade('ti-arrows-right-left',`${l.nome} transferido para ${d?d.nome:'—'}`);
  }
  closeLeadDetalhe();
  renderKanban();renderDashboard();renderTable();renderNotifPanel();
}
function removeLeadDetalhe(){
  const l=leads.find(x=>x.id===_leadDetalheId);
  if(!l)return;
  removeLead(l.id,true);
}

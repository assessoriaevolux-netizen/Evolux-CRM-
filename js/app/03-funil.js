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
  if(fc)fc.innerHTML='<option value="">Todos os consultores</option>'+usersVisiveis.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
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
function toggleFunilSelMode(){
  funilSelMode=!funilSelMode;
  funilSelected.clear();
  const bar=document.getElementById('funil-transfer-bar');
  bar.style.display=funilSelMode?'flex':'none';
  const dest=document.getElementById('funil-transfer-dest');
  // Para transferência: mostra todos os usuários da mesma empresa (não restringe por hierarquia)
  const me=getMe();
  const usersTransf=users.filter(u=>!me||u.empresaId===me.empresaId||me.role==='superadmin'||me.role==='master');
  if(dest)dest.innerHTML='<option value="">Selecionar consultor...</option>'+usersTransf.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
  renderKanban();
}
function cancelarSelecaoFunil(){funilSelMode=false;funilSelected.clear();document.getElementById('funil-transfer-bar').style.display='none';renderKanban();}
function toggleFunilCard(id){
  if(funilSelected.has(id))funilSelected.delete(id);else funilSelected.add(id);
  document.getElementById('funil-sel-count').textContent=`${funilSelected.size} lead${funilSelected.size!==1?'s':''} selecionado${funilSelected.size!==1?'s':''}`;
  renderKanban();
}
function toggleSelectColuna(etapa){
  // Respeita o filtro de período e demais filtros ativos
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const col=leads.filter(l=>l.etapa===etapa&&applyFunilFilter(l,f,vis));
  const allSel=col.every(l=>funilSelected.has(l.id));
  col.forEach(l=>allSel?funilSelected.delete(l.id):funilSelected.add(l.id));
  document.getElementById('funil-sel-count').textContent=`${funilSelected.size} lead${funilSelected.size!==1?'s':''} selecionado${funilSelected.size!==1?'s':''}`;
  renderKanban();
}
function selectAllFunil(){
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const filtrados=leads.filter(l=>applyFunilFilter(l,f,vis));
  const allSel=filtrados.every(l=>funilSelected.has(l.id));
  filtrados.forEach(l=>allSel?funilSelected.delete(l.id):funilSelected.add(l.id));
  document.getElementById('funil-sel-count').textContent=`${funilSelected.size} lead${funilSelected.size!==1?'s':''} selecionado${funilSelected.size!==1?'s':''}`;
  renderKanban();
}
function transferirSelecionados(){
  const destId=parseInt(document.getElementById('funil-transfer-dest').value)||0;
  if(!destId){showToast('Selecione um consultor de destino.','ti-alert-triangle','#d97706');return;}
  if(funilSelected.size===0){showToast('Selecione ao menos um lead.','ti-alert-triangle','#d97706');return;}
  const dest=users.find(u=>u.id===destId);
  if(!dest){showToast('Consultor não encontrado.','ti-alert-triangle','#d97706');return;}
  if(!dest.sb_id){showToast('Consultor sem ID válido no banco.','ti-alert-triangle','#d97706');return;}
  const destSbId=dest.sb_id;
  funilSelected.forEach(id=>{
    const l=leads.find(x=>x.id===id);
    if(l&&l.sb_id){
      l.responsavelId=destId;
      // UPDATE direto só do responsavel_id — mais seguro que _syncLead completo
      window._sb.from('leads')
        .update({responsavel_id:destSbId,updated_at:new Date().toISOString()})
        .eq('id',l.sb_id)
        .then(({error})=>{
          if(error) console.error('[transferir] erro ao salvar no banco:',error);
          else console.log('[transferir] lead',l.nome,'→',dest.nome,'salvo no banco');
        });
      if(window._saveAtividade) window._saveAtividade('ti-arrows-right-left',`${l.nome} transferido para ${dest.nome}`);
    }
  });
  const qtd=funilSelected.size;
  cancelarSelecaoFunil();
  showToast(`${qtd} lead${qtd!==1?'s':''} transferido${qtd!==1?'s':''} para ${dest.nome}.`,'ti-check','#1db954');
  renderKanban();renderDashboard();renderTable();renderNotifPanel();
}
function excluirSelecionados(){
  if(funilSelected.size===0){showToast('Selecione ao menos um lead.','ti-alert-triangle','#d97706');return;}
  const qtd=funilSelected.size;
  if(!confirm(`Excluir ${qtd} lead${qtd!==1?'s':''} selecionado${qtd!==1?'s':''}? Essa ação não pode ser desfeita.`))return;
  const idsParaExcluir=[...funilSelected];
  idsParaExcluir.forEach(id=>{
    const idx=leads.findIndex(x=>x.id===id);
    if(idx!==-1){
      const l=leads[idx];
      leads.splice(idx,1);
      if(l.sb_id&&window._deleteLead) window._deleteLead(l.sb_id).catch(e=>console.warn(e));
    }
  });
  cancelarSelecaoFunil();
  showToast(`${qtd} lead${qtd!==1?'s':''} excluído${qtd!==1?'s':''}.`,'ti-trash','#e53e3e');
  renderKanban();renderDashboard();renderTable();renderNotifPanel();
}
function applyFunilFilter(l,f,vis){
  // Visibilidade hierárquica: só mostra leads que o usuário pode ver
  if(!vis) vis=getVisiveisParaMim();
  if(!vis.has(l.responsavelId)) return false;
  if(f.consultor&&l.responsavelId!==parseInt(f.consultor))return false;
  if(f.origem&&l.origem!==f.origem)return false;
  if(f.tipo&&l.tipo!==f.tipo)return false;
  if(f.atendimento&&(l.atendimento||'')!==f.atendimento)return false;
  // Filtro de período
  const range=_funilDateRange();
  if(range){
    const dataLead=_leadDataISO(l);
    if(!dataLead||dataLead<range.de||dataLead>range.ate)return false;
  }
  return true;
}

// ─── KANBAN + DRAG ────────────────────────────────────────────────────────────
// Paginação por coluna: quantos cards mostrar por etapa
const KANBAN_PAGE_SIZE=99999; // sem paginação — mostra todos os leads rolando
let kanbanColPage={}; // { etapa: número de cards visíveis }

function renderKanbanColuna(etapa,i,f,vis){
  const atdLabel={aguardando:'⏳ Aguardando',em_andamento:'🔵 Em andamento',finalizado:'✅ Finalizado'};
  const todosCards=leads.filter(l=>l.etapa===etapa&&applyFunilFilter(l,f,vis));
  const limite=kanbanColPage[etapa]||KANBAN_PAGE_SIZE;
  const cards=todosCards.slice(0,limite);
  const allColSel=cards.length>0&&cards.every(l=>funilSelected.has(l.id));
  const temMais=todosCards.length>limite;
  const etapaEsc=etapa.replace(/'/g,"\\'");
  return `<div class="col" ondragover="onDragOver(event,this)" ondragleave="onDragLeave(event,this)" ondrop="onDrop(event,'${etapaEsc}')">
    <div class="col-hdr">
      <span class="cn2"><span class="cdot" style="background:${EC[i]}"></span>${ETAPAS_LABEL[etapa]||etapa}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="ccnt">${todosCards.length}</span>
        ${funilSelMode?`<input type="checkbox" title="Selecionar coluna" ${allColSel?'checked':''} onclick="event.stopPropagation();toggleSelectColuna('${etapaEsc}');renderKanban()" style="accent-color:var(--b);cursor:pointer">`:''}
      </div>
    </div>
    ${cards.map(l=>{
      const isSel=funilSelected.has(l.id);
      const resp=users.find(u=>u.id===l.responsavelId);
      const podeEditar=podeEditarLead(l);
      const podeDrag=podeEditar&&!funilSelMode;
      return `<div class="kcard${isSel?' kcard-sel':''}${!podeEditar?' kcard-readonly':''}" draggable="${podeDrag}" data-id="${l.id}"
        ondragstart="${podeDrag?`onDragStart(event,${l.id})`:'return false'}"
        onclick="${podeEditar?`funilSelMode?toggleFunilCard(${l.id}):openLeadDetalhe(${l.id})`:`openLeadDetalhe(${l.id})`}">
        ${funilSelMode&&podeEditar?`<input type="checkbox" ${isSel?'checked':''} onclick="event.stopPropagation();toggleFunilCard(${l.id})" style="accent-color:var(--b);float:right;margin-left:4px;cursor:pointer">`:''}
        <div class="kcard-n">${l.nome}</div>
        <div class="kcard-i">${l.tel||'—'}${resp?` · <span style="color:var(--b)">${resp.nome.split(' ')[0]}</span>`:''}</div>
        ${l.atendimento?`<div style="font-size:10px;color:var(--tm);margin-bottom:4px">${atdLabel[l.atendimento]||''}</div>`:''}
        <div class="kcard-b"><span class="tag ${TMAP[l.tipo]||'ts3'}">${l.tipo}</span><span class="kcard-v">${fmtR(l.credito)}</span></div>
      </div>`;
    }).join('')}
    <div style="display:flex;gap:4px;margin-top:4px">
      <button class="add-col-btn" style="flex:1" onclick="openModal()"><i class="ti ti-plus"></i>Adicionar</button>
      ${funilSelMode?`<button class="add-col-btn" style="flex:0 0 auto;padding:6px 8px" title="Selecionar todos nesta coluna" onclick="toggleSelectColuna('${etapaEsc}')"><i class="ti ti-select-all"></i></button>`:''}
    </div>
  </div>`;
}

function kanbanVerMais(etapa){
  kanbanColPage[etapa]=(kanbanColPage[etapa]||KANBAN_PAGE_SIZE)+KANBAN_PAGE_SIZE;
  renderKanban();
}

// Debounce para evitar múltiplos renders em cascata
let _rkTimer=null;
function renderKanban(){
  if(_rkTimer)clearTimeout(_rkTimer);
  _rkTimer=setTimeout(_renderKanbanImediato,16);
}
function _renderKanbanImediato(){
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const totalFiltrado=leads.filter(l=>applyFunilFilter(l,f,vis)).length;
  document.getElementById('funil-total').textContent=totalFiltrado;
  document.getElementById('kanban').innerHTML=ETAPAS.map((etapa,i)=>renderKanbanColuna(etapa,i,f,vis)).join('');
}
// ─── EDITAR FUNIL ─────────────────────────────────────────────────────────────
function openEditarFunil(){
  const list=document.getElementById('funil-etapas-list');
  list.innerHTML=ETAPAS.map((e,i)=>`
    <div style="display:flex;align-items:center;gap:8px">
      <span class="cdot" style="background:${EC[i]};flex-shrink:0"></span>
      ${i<=4
        ?`<input type="text" class="fi" value="${e}" id="ef-${i}" style="flex:1">`
        :`<span class="fi" style="flex:1;background:var(--c1);color:var(--tm);cursor:not-allowed">${e}</span>`}
    </div>`).join('');
  document.getElementById('modal-editar-funil').classList.add('open');
}
function closeEditarFunil(){document.getElementById('modal-editar-funil').classList.remove('open');}
function salvarEditarFunil(){
  for(let i=0;i<=4;i++){
    const inp=document.getElementById(`ef-${i}`);
    if(!inp)continue;
    const novo=inp.value.trim();
    if(!novo){showToast('O nome da etapa não pode estar vazio.','ti-alert-triangle','#d97706');return;}
    const old=ETAPAS[i];
    if(novo!==old){
      leads.forEach(l=>{if(l.etapa===old)l.etapa=novo;});
      ETAPAS[i]=novo;
    }
  }
  closeEditarFunil();
  renderKanban();renderDashboard();
}

// ─── DETALHE / EDIÇÃO DO LEAD ─────────────────────────────────────────────────
let _leadDetalheId=null;
function openLeadDetalhe(id){
  _leadDetalheId=id;
  const l=leads.find(x=>x.id===id);if(!l)return;
  const podeEd=podeEditarLead(l);
  document.getElementById('lead-det-titulo').innerHTML=`<i class="ti ti-user" style="color:var(--b)"></i> ${l.nome}`;
  document.getElementById('ld-nome').value=l.nome;
  document.getElementById('ld-tel').value=l.tel||'';
  document.getElementById('ld-tipo').value=l.tipo;
  document.getElementById('ld-credito').value=l.credito?l.credito.toLocaleString('pt-BR'):'';
  const ldEtapa=document.getElementById('ld-etapa');
  ldEtapa.innerHTML=ETAPAS.map(e=>`<option value="${e}"${e===l.etapa?' selected':''}>${ETAPAS_LABEL[e]||e}</option>`).join('');
  document.getElementById('ld-origem').value=l.origem||'';
  const ldResp=document.getElementById('ld-resp');
  // Popula com usuários visíveis (quem pode ser responsável)
  const vis=getVisiveisParaMim();
  const usersOpt=users.filter(u=>vis.has(u.id));
  ldResp.innerHTML=usersOpt.map(u=>`<option value="${u.id}"${u.id===l.responsavelId?' selected':''}>${u.nome}</option>`).join('');
  document.getElementById('ld-atendimento').value=l.atendimento||'';
  document.getElementById('ld-obs').value=l.obs||'';
  // Bloqueia campos se não pode editar
  const campos=['ld-nome','ld-tel','ld-tipo','ld-credito','ld-etapa','ld-origem','ld-resp','ld-atendimento','ld-obs'];
  campos.forEach(cid=>{const el=document.getElementById(cid);if(el)el.disabled=!podeEd;});
  const btnSave=document.getElementById('btn-save-lead-det');
  const btnRem=document.getElementById('btn-rem-lead-det');
  if(btnSave)btnSave.style.display=podeEd?'':'none';
  if(btnRem)btnRem.style.display=podeEd?'':'none';
  document.getElementById('modal-lead-detalhe').classList.add('open');
}
function closeLeadDetalhe(){
  document.getElementById('modal-lead-detalhe').classList.remove('open');
  _leadDetalheId=null;
  // Reenabilita campos para próxima abertura
  ['ld-nome','ld-tel','ld-tipo','ld-credito','ld-etapa','ld-origem','ld-resp','ld-atendimento','ld-obs'].forEach(cid=>{const el=document.getElementById(cid);if(el)el.disabled=false;});
  const btnSave=document.getElementById('btn-save-lead-det');const btnRem=document.getElementById('btn-rem-lead-det');
  if(btnSave)btnSave.style.display='';if(btnRem)btnRem.style.display='';
}
function saveLeadDetalhe(){
  const l=leads.find(x=>x.id===_leadDetalheId);if(!l)return;
  const nome=document.getElementById('ld-nome').value.trim();
  if(!nome){showToast('Informe o nome.','ti-alert-triangle','#d97706');return;}
  const oldEtapa=l.etapa;
  const newEtapa=document.getElementById('ld-etapa').value;
  const newResp=parseInt(document.getElementById('ld-resp').value)||l.responsavelId;
  const newCredito=unM(document.getElementById('ld-credito').value)||l.credito;
  // Sync user stats se etapa mudou
  if(oldEtapa!==newEtapa){
    if(oldEtapa==='Fechado / Convertido'){const r=users.find(u=>u.id===l.responsavelId);if(r){r.vendas=Math.max(0,(r.vendas||0)-1);r.credito=Math.max(0,(r.credito||0)-l.credito);if(window._syncUser) window._syncUser(r).catch(e=>console.warn(e));}if(window._estornarVenda) window._estornarVenda(l).catch(e=>console.warn(e));}
    if(newEtapa==='Fechado / Convertido'){const r=users.find(u=>u.id===newResp);if(r){r.vendas=(r.vendas||0)+1;r.credito=(r.credito||0)+newCredito;if(window._syncUser) window._syncUser(r).catch(e=>console.warn(e));}if(window._registrarVenda) window._registrarVenda(l,newResp).catch(e=>console.warn(e));setTimeout(()=>showCelebra(users.find(u=>u.id===newResp)?.nome||'Vendedor',newCredito),100);}
    if(window._saveAtividade)window._saveAtividade('ti-arrows-right-left',`${nome}: ${oldEtapa} → ${newEtapa}`);
  }
  l.nome=nome;l.tel=document.getElementById('ld-tel').value;l.tipo=document.getElementById('ld-tipo').value;
  l.credito=newCredito;l.etapa=newEtapa;l.origem=document.getElementById('ld-origem').value;
  l.responsavelId=newResp;l.atendimento=document.getElementById('ld-atendimento').value;
  l.obs=document.getElementById('ld-obs').value;
  if(window._syncLead) window._syncLead(l).catch(e=>console.warn(e));
  closeLeadDetalhe();
  renderKanban();renderDashboard();renderTable();renderNotifPanel();
}
function removeLeadDetalhe(){
  showConfirm('Remover este lead? Esta ação não pode ser desfeita.',function(){
    const _rld=leads.find(l=>l.id===_leadDetalheId); if(_rld?.sb_id&&window._deleteLead) window._deleteLead(_rld.sb_id);
    const _rldIdx=leads.findIndex(l=>l.id===_leadDetalheId); if(_rldIdx!==-1) leads.splice(_rldIdx,1);
    closeLeadDetalhe();renderKanban();renderDashboard();renderTable();
  });
}


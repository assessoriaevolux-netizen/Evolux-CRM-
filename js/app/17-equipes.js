// ─── EQUIPES ───────────────────────────────────────────────────
let _eqMbTmp=[];

// Quem pode criar/editar equipes
function podeCriarEquipe(){ return isGestor()||can('config_teams'); }
function podeGerenciarEquipe(eq){
  const me=getMe(); if(!me||!eq) return false;
  if(isGestor(me)||can('config_teams',me)) return true;
  return can('equipe_edit',me)&&(eq.supervisorId===me.id||eq.representanteId===me.id);
}
// Quem pode entrar na equipe: o gestor escolhe qualquer pessoa; quem só cuida da
// própria equipe escolhe pessoas abaixo do seu cargo que ainda não estão em outra equipe.
function _candidatosMembro(eqIdAtual){
  const me=getMe();
  if(isGestor(me)||can('config_teams',me)) return users.slice();
  const meuNivel=nivelDe(me);
  return users.filter(u=>{
    if(u.id===me.id) return true;
    if(nivelDe(u)<=meuNivel) return false;
    const eq=getEqDeUser(u);
    return !eq||eq.id===eqIdAtual;
  });
}

function openEqModal(id){
  const eqAtual=id?equipes.find(e=>e.id===id):null;
  if(id&&!podeGerenciarEquipe(eqAtual)){showToast('Sem permissão para editar esta equipe.','ti-lock','#dc3545');return;}
  if(!id&&!podeCriarEquipe()){showToast('Sem permissão para criar equipes.','ti-lock','#dc3545');return;}
  _eqMbTmp=[];
  const m=document.getElementById('equipe-modal');
  if(!m)return;
  const gestorTotal=isGestor()||can('config_teams');
  const sS=document.getElementById('eq-sup');
  const sG=document.getElementById('eq-gest');
  const sR=document.getElementById('eq-rep');
  const sM=document.getElementById('eq-mb-sel');
  const opt=u=>`<option value="${u.id}">${esc(u.nome)} (${esc(getHierLabel(u))})</option>`;
  if(sS) sS.innerHTML='<option value="">Nenhum</option>'+users.filter(u=>u.role==='supervisor'||isGestor(u)||u.role==='representante').map(opt).join('');
  if(sG) sG.innerHTML='<option value="">Selecionar gestor...</option>'+users.filter(u=>isGestor(u)).map(u=>`<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  if(sR) sR.innerHTML='<option value="">Nenhum</option>'+users.filter(u=>u.role==='representante').map(u=>`<option value="${u.id}">${esc(u.nome)}</option>`).join('');
  if(sM) sM.innerHTML='<option value="">+ Adicionar membro...</option>'+_candidatosMembro(id||null).map(opt).join('');
  // quem não é gestor não troca os responsáveis da equipe
  [sS,sG,sR].forEach(el=>{if(el) el.disabled=!gestorTotal;});

  document.getElementById('eq-modal-tit').textContent = id ? 'Editar equipe' : 'Nova equipe';
  document.getElementById('eq-edit-id').value = id||'';
  document.getElementById('eq-foto-data').value = '';
  document.getElementById('eq-nome').value = '';
  document.getElementById('eq-desc').value = '';
  document.getElementById('eq-status').value = 'ativa';
  if(document.getElementById('eq-meta')) document.getElementById('eq-meta').value='';
  if(document.getElementById('eq-periodo')) document.getElementById('eq-periodo').value='mensal';
  if(sS) sS.value=''; if(sG) sG.value=''; if(sR) sR.value='';
  const fp=document.getElementById('eq-foto-prev');
  if(fp) fp.innerHTML='<i class="ti ti-camera" style="font-size:22px;color:#fff"></i>';

  if(eqAtual){
    const eq=eqAtual;
    document.getElementById('eq-nome').value=eq.nome||'';
    document.getElementById('eq-desc').value=eq.descricao||'';
    document.getElementById('eq-status').value=eq.status||'ativa';
    if(sS) sS.value=eq.supervisorId||'';
    if(sG) sG.value=eq.gestorId||'';
    if(sR) sR.value=eq.representanteId||'';
    document.getElementById('eq-foto-data').value=eq.foto||'';
    if(eq.foto&&fp&&safeUrl(eq.foto)) fp.innerHTML=`<img src="${safeUrl(eq.foto)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
    if(document.getElementById('eq-meta')&&eq.meta) document.getElementById('eq-meta').value=fmtMetaVal(eq.meta);
    if(document.getElementById('eq-periodo')) document.getElementById('eq-periodo').value=eq.periodo||'mensal';
    _eqMbTmp=[...(eq.membroIds||[])];
  }
  renderEqMbList();
  m.classList.add('open');
}
function closeEqModal(){
  const m=document.getElementById('equipe-modal');
  if(m) m.classList.remove('open');
}
function equipeFotoUp(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    const d=ev.target.result;
    document.getElementById('eq-foto-data').value=d;
    const fp=document.getElementById('eq-foto-prev');
    if(fp&&safeUrl(d)) fp.innerHTML=`<img src="${safeUrl(d)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
  };
  r.readAsDataURL(f);
}
function removerFotoEq(){
  document.getElementById('eq-foto-data').value='';
  const fp=document.getElementById('eq-foto-prev');
  if(fp) fp.innerHTML='<i class="ti ti-camera" style="font-size:22px;color:#fff"></i>';
  const fi=document.getElementById('eq-foto-inp');
  if(fi) fi.value='';
}
function addMembroEq(){
  const s=document.getElementById('eq-mb-sel');
  const id=parseInt(s.value);
  if(!id||_eqMbTmp.includes(id)){s.value='';return;}
  _eqMbTmp.push(id);
  s.value='';
  renderEqMbList();
}
function removeEqMbTmp(id){
  _eqMbTmp=_eqMbTmp.filter(x=>x!==id);
  renderEqMbList();
}
function renderEqMbList(){
  const el=document.getElementById('eq-mb-list');
  if(!el)return;
  el.innerHTML=_eqMbTmp.map(id=>{
    const u=users.find(x=>x.id===id);if(!u)return'';
    const foto=safeUrl(u.foto);
    return `<div style="display:flex;align-items:center;gap:6px;background:var(--c0);border:1px solid var(--c2);border-radius:8px;padding:5px 9px;font-size:12px;color:var(--ts)">
      <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden">${foto?`<img src="${foto}" style="width:100%;height:100%;object-fit:cover">`:esc(u.nome.charAt(0))}</div>
      <span>${esc(u.nome)}</span>
      <button onclick="removeEqMbTmp(${id})" style="width:16px;height:16px;border-radius:50%;background:var(--rs);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--r);font-size:9px"><i class="ti ti-x"></i></button>
    </div>`;
  }).join('');
}
async function saveEquipe(){
  const nome=document.getElementById('eq-nome').value.trim();
  if(!nome){showToast('Informe o nome da equipe.','ti-alert-triangle','#d97706');return;}
  const editId=parseInt(document.getElementById('eq-edit-id').value)||null;
  const atual=editId?equipes.find(e=>e.id===editId):null;
  if(editId?!podeGerenciarEquipe(atual):!podeCriarEquipe()){showToast('Sem permissão.','ti-lock','#dc3545');return;}
  const gestorTotal=isGestor()||can('config_teams');
  const gestorVal=gestorTotal?(parseInt(document.getElementById('eq-gest').value)||null):(atual?.gestorId||null);
  if(gestorTotal&&!gestorVal){showToast('Selecione um gestor responsável.','ti-alert-triangle','#d97706');return;}
  const obj={
    nome,
    descricao:document.getElementById('eq-desc').value.trim(),
    supervisorId:gestorTotal?(parseInt(document.getElementById('eq-sup').value)||null):(atual?.supervisorId||null),
    gestorId:gestorVal,
    representanteId:gestorTotal?(parseInt(document.getElementById('eq-rep')?.value)||null):(atual?.representanteId||null),
    status:document.getElementById('eq-status').value,
    membroIds:[..._eqMbTmp],
    foto:document.getElementById('eq-foto-data').value||null,
    meta:unM((document.getElementById('eq-meta')||{value:''}).value),
    periodo:(document.getElementById('eq-periodo')||{value:'mensal'}).value||'mensal',
  };
  let alvo;
  if(atual){
    alvo={...atual,...obj};
  } else {
    alvo={...obj,id:nextEquipeId++};
  }
  const ok=window._syncEquipe?await window._syncEquipe(alvo):false;
  if(!ok) return;
  if(atual) Object.assign(atual,alvo); else equipes.push(alvo);
  await window._loadEquipes();
  await window._loadLeads();
  closeEqModal();
  showToast(`Equipe "${obj.nome}" salva!`,'ti-check');
  cfgShow('equipes');
}
function deleteEquipe(id){
  const eq=equipes.find(e=>e.id===id);
  if(!eq) return;
  if(!podeGerenciarEquipe(eq)){showToast('Sem permissão para excluir esta equipe.','ti-lock','#dc3545');return;}
  showConfirm('Excluir esta equipe? Os membros não serão removidos, apenas desvinculados.',function(){
    _deleteEquipeExec(id);
  });
}
async function _deleteEquipeExec(id){
  const _deq=equipes.find(e=>e.id===id);
  if(!_deq){showToast('Equipe não encontrada.','ti-alert-triangle','#d97706');return;}
  if(_deq.sb_id){
    const {data,error}=await window._sb.from('equipes').delete().eq('id',_deq.sb_id).select('id');
    if(error||!data||!data.length){
      showToast('Não foi possível excluir a equipe'+(error?': '+error.message:' (sem permissão).'),'ti-alert-circle','#dc3545');
      return;
    }
  }
  const i=equipes.findIndex(e=>e.id===id);
  if(i!==-1) equipes.splice(i,1);
  await window._loadLeads();
  showToast('Equipe excluída.','ti-check');
  cfgRenderSection();
}
async function removeMembro(eqId,uid){
  const eq=equipes.find(e=>e.id===eqId);
  if(!eq) return;
  if(!podeGerenciarEquipe(eq)){showToast('Sem permissão para alterar esta equipe.','ti-lock','#dc3545');return;}
  const alvo={...eq,membroIds:(eq.membroIds||[]).filter(x=>x!==uid)};
  if(await window._syncEquipe(alvo)){ eq.membroIds=alvo.membroIds; await window._loadLeads(); }
  cfgRenderSection();
}
function toast(msg){ showToast(msg,'ti-check','#016b3c'); }

// ─── EQUIPE HELPERS ────────────────────────────────────────────
function getEqDeUser(u){ return equipes.find(e=>(e.membroIds||[]).includes(u.id))||null; }
function getSupDeUser(u){ const eq=getEqDeUser(u); return eq?users.find(x=>x.id===eq.supervisorId)||null:null; }

// ─── HIERARQUIA: VISIBILIDADE DE LEADS ────────────────────────
// Nível hierárquico (menor = mais alto): plataforma 0, gestor 1, depois a ordem do cargo
function getNivelHier(u){ return nivelDe(u); }

// IDs das pessoas cujos leads o usuário logado enxerga (mesma regra do banco):
// gestor → todos; representante → equipes que representa ou de que participa;
// supervisor → equipes que supervisiona; demais → só os próprios.
function getVisiveisParaMim(){
  const me=getMe();
  if(!me) return new Set();
  if(isGestor(me)) return new Set(users.map(u=>u.id));
  const ids=new Set([me.id]);
  if(me.role==='representante'){
    equipes.filter(e=>e.representanteId===me.id||(e.membroIds||[]).includes(me.id))
      .forEach(e=>(e.membroIds||[]).forEach(mid=>ids.add(mid)));
  } else if(me.role==='supervisor'){
    equipes.filter(e=>e.supervisorId===me.id).forEach(e=>(e.membroIds||[]).forEach(mid=>ids.add(mid)));
  }
  return ids;
}
window.getVisiveisParaMim=getVisiveisParaMim;

// Pode mexer neste lead? (o lead precisa estar na sua visão)
function _leadVisivel(lead,vis){
  if(isGestor()) return true;
  vis=vis||getVisiveisParaMim();
  return vis.has(lead.responsavelId);
}
function podeEditarLead(lead,vis){ return can('leads_edit')&&_leadVisivel(lead,vis); }
function podeMoverLead(lead,vis){ return can('funil_move')&&_leadVisivel(lead,vis); }
function podeAbrirLead(lead,vis){ return (can('leads_edit')||can('funil_move'))&&_leadVisivel(lead,vis); }

// ─── RANK VIEW ─────────────────────────────────────────────────
function setRankView(v,btn){
  rankView=v;
  document.querySelectorAll('.rv-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderRanking();
}


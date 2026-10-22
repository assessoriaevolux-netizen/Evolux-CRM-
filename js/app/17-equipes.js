// ─── EDITAR USUÁRIO (nome + foto) ─────────────────────────────────────────────
function openEditUser(id) {
  const u = users.find(x=>x.id===id); if(!u) return;
  document.getElementById('edit-user-id').value = id;
  document.getElementById('edit-user-nome').value = u.nome;
  document.getElementById('edit-user-email').value = u.email||'';
  document.getElementById('edit-user-role').value = u.role;
  document.getElementById('edit-user-foto-data').value = u.foto||'';
  document.getElementById('edit-user-inicial').textContent = u.nome.charAt(0).toUpperCase();
  const prev = document.getElementById('edit-user-foto-preview');
  if(u.foto) {
    prev.innerHTML = `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    prev.innerHTML = `<span id="edit-user-inicial">${u.nome.charAt(0).toUpperCase()}</span>`;
  }
  document.getElementById('edit-user-modal').classList.add('open');
}
function closeEditUser() {
  document.getElementById('edit-user-modal').classList.remove('open');
}
function editUserFotoPreview(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    const data = ev.target.result;
    document.getElementById('edit-user-foto-data').value = data;
    document.getElementById('edit-user-foto-preview').innerHTML =
      `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}
function saveEditUser() {
  const id = parseInt(document.getElementById('edit-user-id').value);
  const u = users.find(x=>x.id===id); if(!u) return;
  const nome = document.getElementById('edit-user-nome').value.trim();
  const email = document.getElementById('edit-user-email').value.trim();
  const role = document.getElementById('edit-user-role').value;
  const foto = document.getElementById('edit-user-foto-data').value;
  if(!nome){showToast('Informe o nome.','ti-alert-triangle','#d97706');return;}
  u.nome = nome;
  u.email = email;
  u.role = role;
  if(foto) u.foto = foto;
  // Atualizar avatares
  if(id===1) updateSbUser();
  // Sincroniza com Supabase (todos verão a foto atualizada em tempo real)
  if(window._syncUser) window._syncUser(u).catch(e=>console.warn('[editUser]',e));
  closeEditUser();
  renderUserList();
  renderRanking();
  if(window._saveAtividade)window._saveAtividade('ti-user-edit',`Perfil de ${nome} atualizado`);
  // toast
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:24px;right:24px;background:#017A45;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  t.innerHTML='<i class="ti ti-check" style="margin-right:6px"></i>Usuário atualizado!';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}


// função toggleSidebar definida acima (linha ~1789)


function novoUserFoto(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){
    const data=ev.target.result;
    document.getElementById('novo-user-foto-data').value=data;
    const prev=document.getElementById('novo-user-foto-prev');
    prev.innerHTML=`<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}


// ─── RANKING: ADICIONAR PESSOA ─────────────────────────────────────────────────
function rankFotoPreview(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){
    const data=ev.target.result;
    const fd=document.getElementById('rank-foto-data');
    const fp=document.getElementById('rank-foto-prev');
    if(fd) fd.value=data;
    if(fp) fp.innerHTML=`<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
}
function addPessoaRanking(){
  const nomeEl=document.getElementById('rank-nome-inp');
  const hierEl=document.getElementById('rank-role-inp');
  const fotoEl=document.getElementById('rank-foto-data');
  const metaEl=document.getElementById('rank-meta-inp');
  if(!nomeEl||!hierEl){showToast('Formulário de ranking não encontrado.','ti-alert-triangle');return;}
  const nome=nomeEl.value.trim();
  const hierIdStr=hierEl.value;
  const foto=fotoEl?.value||null;
  const metaRaw=unM(metaEl?.value)||500000;
  if(!nome){showToast('Informe o nome da pessoa.','ti-alert-triangle');return;}
  if(!hierIdStr){showToast('Selecione a hierarquia.','ti-alert-triangle');return;}
  const hierarquiaLocalId=parseInt(hierIdStr);
  const h=getHier(hierarquiaLocalId);
  const role=slugToRole(h);
  const hperms=h?{...h.perms}:{};
  // Armazena UUID do Supabase (sb_id), nunca o ID local numérico
  const hierarquiaUUID=h?.sb_id||null;
  // Bug #19: usuário sem email nunca persistia no DB (_syncUser abortava).
  // Gera email fictício único para poder salvar — admin pode corrigir depois.
  const _fakeEmail='usuario_'+Date.now()+'@evolux.local';
  const _newU={id:nextUserId++,nome,email:_fakeEmail,role,managerId:null,hierarquiaId:hierarquiaUUID,
    vendas:0,credito:0,foto,meta:metaRaw,hperms,perms:{...DPERMS[role]||DPERMS.vendedor},
    empresaId:window._empresaIdDireto||null};
  users.push(_newU);
  if(window._syncUser) window._syncUser(_newU).catch(e=>console.warn('[addPessoaRanking] sync error:',e));
  // limpar form
  if(nomeEl) nomeEl.value='';
  if(metaEl) metaEl.value='';
  if(fotoEl) fotoEl.value='';
  const fotoInp=document.getElementById('rank-foto-inp');
  const fotoPrev=document.getElementById('rank-foto-prev');
  if(fotoInp) fotoInp.value='';
  if(fotoPrev) fotoPrev.innerHTML='<i class="ti ti-camera" style="font-size:24px;color:rgba(255,255,255,.9)"></i>';
  // toast
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:24px;right:24px;background:#016b3c;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:8px';
  t.innerHTML='<i class="ti ti-check" style="font-size:15px"></i>'+nome+' adicionado ao ranking!';
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
  renderRanking();
  populateSelects();
  if(window._saveAtividade)window._saveAtividade('ti-user-plus',nome+' adicionado ao ranking');
}


// ─── EQUIPES ───────────────────────────────────────────────────
let _eqMbTmp=[];

function openEqModal(id){
  _eqMbTmp=[];
  const m=document.getElementById('equipe-modal');
  if(!m)return;
  // popular selects
  const sS=document.getElementById('eq-sup');
  const sG=document.getElementById('eq-gest');
  const sR=document.getElementById('eq-rep');
  const sM=document.getElementById('eq-mb-sel');
  if(sS) sS.innerHTML='<option value="">Nenhum</option>'+users.map(u=>`<option value="${u.id}">${u.nome} (${RL[u.role]||u.role})</option>`).join('');
  if(sG) sG.innerHTML='<option value="">Selecionar gestor...</option>'+users.filter(u=>u.role==='gestor'||u.role==='administrador'||u.role==='master').map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
  if(sR) sR.innerHTML='<option value="">Nenhum</option>'+users.filter(u=>u.role==='representante').map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
  if(sM) sM.innerHTML='<option value="">+ Adicionar membro...</option>'+users.map(u=>`<option value="${u.id}">${u.nome} (${RL[u.role]||u.role})</option>`).join('');

  document.getElementById('eq-modal-tit').textContent = id ? 'Editar equipe' : 'Nova equipe';
  document.getElementById('eq-edit-id').value = id||'';
  document.getElementById('eq-foto-data').value = '';
  document.getElementById('eq-nome').value = '';
  document.getElementById('eq-desc').value = '';
  document.getElementById('eq-status').value = 'ativa';
  if(document.getElementById('eq-meta')) document.getElementById('eq-meta').value='';
  if(document.getElementById('eq-periodo')) document.getElementById('eq-periodo').value='mensal';
  if(sS) sS.value=''; if(sG) sG.value=''; if(sR) sR.value='';
  // reset foto preview
  const fp=document.getElementById('eq-foto-prev');
  if(fp) fp.innerHTML='<i class="ti ti-camera" style="font-size:22px;color:#fff"></i>';

  if(id){
    const eq=equipes.find(e=>e.id===id);
    if(!eq)return;
    document.getElementById('eq-nome').value=eq.nome||'';
    document.getElementById('eq-desc').value=eq.descricao||'';
    document.getElementById('eq-status').value=eq.status||'ativa';
    if(sS) sS.value=eq.supervisorId||'';
    if(sG) sG.value=eq.gestorId||'';
    if(sR) sR.value=eq.representanteId||'';
    document.getElementById('eq-foto-data').value=eq.foto||'';
    if(eq.foto&&fp) fp.innerHTML=`<img src="${eq.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
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
    if(fp) fp.innerHTML=`<img src="${d}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
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
    return `<div style="display:flex;align-items:center;gap:6px;background:var(--c0);border:1px solid var(--c2);border-radius:8px;padding:5px 9px;font-size:12px;color:var(--ts)">
      <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden">${u.foto?`<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover">`:u.nome.charAt(0)}</div>
      <span>${u.nome}</span>
      <button onclick="removeEqMbTmp(${id})" style="width:16px;height:16px;border-radius:50%;background:var(--rs);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--r);font-size:9px"><i class="ti ti-x"></i></button>
    </div>`;
  }).join('');
}
async function saveEquipe(){
  const nome=document.getElementById('eq-nome').value.trim();
  if(!nome){showToast('Informe o nome da equipe.','ti-alert-triangle','#d97706');return;}
  const gestorVal=parseInt(document.getElementById('eq-gest').value)||null;
  if(!gestorVal){showToast('Selecione um gestor responsável.','ti-alert-triangle','#d97706');return;}
  const editId=parseInt(document.getElementById('eq-edit-id').value)||null;
  const obj={
    nome,
    descricao:document.getElementById('eq-desc').value.trim(),
    supervisorId:parseInt(document.getElementById('eq-sup').value)||null,
    gestorId:gestorVal,
    representanteId:parseInt(document.getElementById('eq-rep')?.value)||null,
    status:document.getElementById('eq-status').value,
    membroIds:[..._eqMbTmp],
    foto:document.getElementById('eq-foto-data').value||null,
    meta:(()=>{const v=(document.getElementById('eq-meta')||{value:''}).value.replace(/\./g,'').replace(',','.');return parseFloat(v)||0;})(),
    periodo:(document.getElementById('eq-periodo')||{value:'mensal'}).value||'mensal',
  };
  if(editId){
    const i=equipes.findIndex(e=>e.id===editId);
    if(i>=0){
      equipes[i]={...equipes[i],...obj};
      // Passa a referência real do array para _syncEquipe receber o sb_id
      if(window._syncEquipe) await window._syncEquipe(equipes[i]).catch(e=>console.warn(e));
    }
  } else {
    obj.id=nextEquipeId++;
    equipes.push(obj);
    // Passa a referência real (último item do array) para que sb_id seja gravado nela
    if(window._syncEquipe) await window._syncEquipe(equipes[equipes.length-1]).catch(e=>console.warn(e));
  }
  closeEqModal();
  toast(obj.nome+' salva!');
  cfgShow('equipes');
}
function deleteEquipe(id){
  const me=getMe();
  const eq=equipes.find(e=>e.id===id);
  if(!eq||!me) return;
  const podeExcluir=me.role==='master'||me.role==='superadmin'||me.role==='admin'||me.role==='administrador'||me.role==='gestor'
    ||(me.role==='supervisor'&&eq.supervisorId===me.id)
    ||(me.role==='representante'&&eq.representanteId===me.id);
  if(!podeExcluir){showToast('Sem permissão para excluir esta equipe.','ti-lock','#dc3545');return;}
  showConfirm('Excluir esta equipe? Os membros não serão removidos, apenas desvinculados.',function(){
    _deleteEquipeExec(id);
  });
}
async function _deleteEquipeExec(id){
  const _deq=equipes.find(e=>e.id===id);
  if(!_deq){showToast('Equipe não encontrada.','ti-alert-triangle','#d97706');return;}
  if(_deq.sb_id&&window._sb){
    try{
      const {error}=await window._sb.from('equipes').delete().eq('id',_deq.sb_id);
      if(error){
        showToast('Erro ao excluir equipe: '+error.message,'ti-alert-circle','#dc3545');
        console.error('[deleteEquipe]',error);
        return;
      }
    }catch(e){
      showToast('Erro inesperado ao excluir equipe.','ti-alert-circle','#dc3545');
      console.error('[deleteEquipe]',e);
      return;
    }
  }
  equipes=equipes.filter(e=>e.id!==id);
  showToast('Equipe excluída.','ti-check');
  cfgRenderSection();
}
function removeMembro(eqId,uid){
  const eq=equipes.find(e=>e.id===eqId);
  if(eq){eq.membroIds=(eq.membroIds||[]).filter(x=>x!==uid);if(window._syncEquipe) window._syncEquipe(eq).catch(e=>console.warn(e));}
  cfgRenderSection();
}
function toast(msg){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:24px;right:24px;background:#016b3c;color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);display:flex;align-items:center;gap:8px';
  t.innerHTML='<i class="ti ti-check" style="font-size:15px"></i>'+msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),3000);
}

// ─── HIERARQUIA TOGGLE ─────────────────────────────────────────
function hierToggle(uid){
  const el=document.getElementById(uid);
  const exp=document.getElementById('exp-'+uid);
  if(el) el.classList.toggle('open');
  if(exp) exp.classList.toggle('open');
}

// ─── EQUIPE HELPERS ────────────────────────────────────────────
function getEqDeUser(u){ return equipes.find(e=>(e.membroIds||[]).includes(u.id))||null; }
function getSupDeUser(u){ const eq=getEqDeUser(u); return eq?users.find(x=>x.id===eq.supervisorId)||null:null; }

// ─── HIERARQUIA: VISIBILIDADE DE LEADS ────────────────────────
// Retorna o nível hierárquico de um usuário (menor = mais alto).
// Gestor=1, Representante=2, Supervisor=3, Vendedor=4, desconhecido=99
function getNivelHier(u){
  if(!u) return 99;
  const h=u.hierarquiaId?hierarquias.find(x=>x.id===u.hierarquiaId):null;
  return h?h.ordem:99;
}

// Retorna Set com IDs de todos os usuários que o user logado pode ver.
// Gestor vê todos. Representante/Supervisor: vê membros das equipes que supervisiona
// + membros abaixo na hierarquia. Vendedor: só a si mesmo.
function getVisiveisParaMim(){
  const me=getMe();
  if(!me) return new Set();
  // superadmin/master vê todos (cross-empresa)
  if(me.role==='superadmin'||me.role==='master') return new Set(users.map(u=>u.id));
  // usuários da mesma empresa
  const usersEmpresa=users.filter(u=>u.empresaId===me.empresaId);
  const meuNivel=getNivelHier(me);
  // Gestor/Admin (nível 1 ou role admin/gestor) vê TODOS da empresa
  if(meuNivel===1||me.role==='admin'||me.role==='gestor') return new Set(usersEmpresa.map(u=>u.id));
  // Representante: vê leads de todos os membros das equipes que ele é responsável ou membro
  if(me.role==='representante'){
    const minhasEquipes=(window.equipes||[]).filter(e=>e.representanteId===me.id||(e.membroIds||[]).includes(me.id));
    const ids=new Set([me.id]);
    minhasEquipes.forEach(e=>(e.membroIds||[]).forEach(mid=>ids.add(mid)));
    return ids;
  }
  // Supervisor: vê leads dos membros das equipes que ele supervisiona
  if(me.role==='supervisor'){
    const minhasEquipes=(window.equipes||[]).filter(e=>e.supervisorId===me.id);
    const ids=new Set([me.id]);
    minhasEquipes.forEach(e=>(e.membroIds||[]).forEach(mid=>ids.add(mid)));
    return ids;
  }
  // Vendedor/consultor: só os próprios
  return new Set([me.id]);
}

// Verifica se o usuário logado pode editar/mover um lead
function podeEditarLead(lead){
  const me=getMe();if(!me)return false;
  const meuNivel=getNivelHier(me);
  if(meuNivel===1)return true; // gestor pode tudo
  const visiv=getVisiveisParaMim();
  return visiv.has(lead.responsavelId)||lead.responsavelId===me.id;
}

// ─── RANK VIEW ─────────────────────────────────────────────────
function setRankView(v,btn){
  rankView=v;
  document.querySelectorAll('.rv-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderRanking();
}


// ─── USUÁRIOS ──────────────────────────────────────────────────────────────────
// Cadastrar: função create-user (o servidor confere cargo, empresa e equipe).
// Editar: crm_atualizar_membro. Remover: crm_remover_membro (passa os leads para
// outra pessoa, tira das equipes e bloqueia o login). As regras abaixo só decidem
// o que aparece na tela — o banco confere tudo de novo.
function _podeCadastrarUsuario(){ return isGestor()||can('config_users')||can('equipe_add'); }
function _podeEditarUsuario(u){
  const me=getMe();
  if(!me||!u||u.id===me.id) return false;           // o próprio perfil é em "Minha conta"
  if(isPlataforma(u)&&!isPlataforma(me)) return false;
  if(isGestor(me)) return true;
  if(!(can('config_users')||can('equipe_edit'))) return false;
  return nivelDe(u)>nivelDe(me)&&getVisiveisParaMim().has(u.id);
}
function _podeRemoverUsuario(u){
  const me=getMe();
  if(!me||!u||u.id===me.id||isPlataforma(u)) return false;
  if(isGestor(me)) return true;
  const ok=can('equipe_remove')||can('config_users')||(me.role==='supervisor'&&u.role==='vendedor');
  return ok&&nivelDe(u)>nivelDe(me)&&getVisiveisParaMim().has(u.id);
}
// Equipes em que quem está logado pode colocar alguém
function _equipesAtribuiveis(){
  const me=getMe();
  if(!me) return [];
  if(isGestor(me)||can('config_teams')) return equipes.slice();
  return equipes.filter(e=>e.supervisorId===me.id||e.representanteId===me.id);
}
function _usuariosDaLista(){
  const me=getMe();
  if(!me) return [];
  if(isGestor(me)||can('config_users')) return users.slice();
  const vis=getVisiveisParaMim();
  return users.filter(u=>vis.has(u.id));
}

let _cadastrando=false;
async function inviteUser(){
  if(_cadastrando)return;
  if(!_podeCadastrarUsuario()){showToast('Você não tem permissão para cadastrar usuários.','ti-lock');return;}
  const nomeVal=document.getElementById('uNome').value.trim();
  const email=document.getElementById('uEmail').value.trim().toLowerCase();
  const senha=document.getElementById('uSenha').value;
  const senhaConf=document.getElementById('uSenhaConf').value;
  if(!nomeVal){showToast('Informe o nome completo.','ti-alert-triangle','#d97706');return;}
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){showToast('E-mail inválido.','ti-alert-triangle','#d97706');return;}
  if(!senha||senha.length<6){showToast('A senha deve ter pelo menos 6 caracteres.','ti-alert-triangle','#d97706');return;}
  if(senha!==senhaConf){showToast('As senhas não coincidem. Verifique e tente novamente.','ti-alert-triangle','#dc3545');return;}
  if(users.find(u=>(u.email||'').toLowerCase()===email)){showToast('Este e-mail já está cadastrado no sistema.','ti-alert-triangle','#d97706');return;}
  const hierSel=document.getElementById('uHierarquia');
  const selH=hierarquiasAtribuiveis().find(h=>String(h.sb_id)===String(hierSel?.value));
  if(!selH){showToast('Selecione a hierarquia do usuário.','ti-alert-triangle','#d97706');return;}
  const metaEl=document.getElementById('uMeta');
  const metaRaw=metaEl?unM(metaEl.value)||0:0;
  if(!metaRaw){showToast('Informe a meta do usuário.','ti-alert-triangle','#d97706');return;}
  const equipeEl=document.getElementById('uEquipe');
  const eq=_equipesAtribuiveis().find(e=>e.id===parseInt(equipeEl?.value));
  const btn=document.getElementById('btn-invite-user');
  _cadastrando=true;
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i>Cadastrando...';}
  let json={},status=0;
  try{
    const {data:{session}}=await window._sb.auth.getSession();
    const res=await fetch(`${window._sbUrl}/functions/v1/create-user`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${session?.access_token||''}`},
      body:JSON.stringify({email,senha,nome:nomeVal,meta:metaRaw,hierarquia_id:selH.sb_id,equipe_id:eq?.sb_id||null})
    });
    status=res.status;
    try{json=await res.json();}catch(e){json={error:`Resposta inválida do servidor (HTTP ${res.status}).`};}
  }catch(err){
    json={error:'Sem conexão com o servidor de cadastro. Tente novamente.'};
  }
  _cadastrando=false;
  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-user-plus"></i>Cadastrar usuário';}
  const toast=document.getElementById('invite-toast');
  if(!json.ok){
    if(toast){
      toast.style.display='block';
      toast.style.background='rgba(220,38,38,.1)';toast.style.borderColor='rgba(220,38,38,.3)';toast.style.color='#dc2626';
      toast.innerHTML=`<i class="ti ti-alert-circle"></i> Erro ao cadastrar: ${esc(json.error||(status===404?'a função create-user não foi encontrada no Supabase.':'tente novamente.'))}`;
      setTimeout(()=>{toast.style.display='none';},9000);
    }
    return;
  }
  // E-mail de boas-vindas (se a função existir no Supabase)
  try{
    const {data:{session}}=await window._sb.auth.getSession();
    fetch(`${window._sbUrl}/functions/v1/send-welcome-email`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${session?.access_token||''}`},
      body:JSON.stringify({nome:nomeVal,email,senha,empresaNome:(window.empresa&&window.empresa.nome)||''})
    }).then(r=>r.json()).then(d=>{if(!d.ok)console.warn('E-mail de boas-vindas não enviado:',d.error);}).catch(()=>{});
  }catch(e){}
  ['uNome','uEmail','uSenha','uSenhaConf'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  if(metaEl)metaEl.value='';
  if(hierSel)hierSel.value='';
  if(equipeEl)equipeEl.value='';
  await window._loadProfiles();
  await window._loadEquipes();
  if(window._saveAtividade) window._saveAtividade('ti-user-plus',`${nomeVal} ${json.reativado?'foi reativado(a)':'entrou na equipe'} (${selH.nome})`);
  if(toast){
    toast.style.display='block';toast.style.background='';toast.style.borderColor='';toast.style.color='';
    toast.innerHTML=`<i class="ti ti-user-check"></i> <strong>${esc(nomeVal)}</strong> ${json.reativado?'reativado(a)':'cadastrado(a)'} com sucesso! Já pode entrar com o e-mail <strong>${esc(email)}</strong> e a senha definida.`;
    setTimeout(()=>toast.style.display='none',9000);
  }
  renderUserList();populateSelects();renderRanking();
}

function renderUserList(){
  const list=document.getElementById('user-list');if(!list)return;
  const hierOpts=hierarquiasAtribuiveis();
  const lista=_usuariosDaLista().sort((a,b)=>nivelDe(a)-nivelDe(b)||a.nome.localeCompare(b.nome,'pt-BR'));
  if(!lista.length){list.innerHTML='<div style="color:var(--tm);font-size:13px;padding:12px 0">Nenhum usuário para mostrar.</div>';return;}
  const me=getMe();
  list.innerHTML=lista.map(u=>{
    const hier=u.hierarquiaId?getHier(u.hierarquiaId):null;
    const eq=getEqDeUser(u);
    const foto=safeUrl(u.foto);
    const avatarStyle=foto?`background:url('${foto}') center/cover no-repeat`:`background:linear-gradient(135deg,var(--g),var(--gc))`;
    const editar=_podeEditarUsuario(u), remover=_podeRemoverUsuario(u);
    const meta=u.meta?`<span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:var(--c1);color:var(--tm);font-weight:600"><i class="ti ti-target" style="font-size:10px"></i> ${fmtR(u.meta)}</span>`:'';
    return `<div class="ucard">
      <div class="utop">
        <div class="uav" style="${avatarStyle}">${foto?'':esc(u.nome.charAt(0).toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div class="uname">${esc(u.nome)}${me&&u.id===me.id?' <span style="font-size:10px;color:var(--tm);font-weight:600">(você)</span>':''}${isPlataforma(u)?' <span style="font-size:10px;color:var(--g);font-weight:700">● Plataforma</span>':''}</div>
          <div class="uemail">${esc(u.email)}</div>
          <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap">
            ${hier?`<span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(1,107,60,.1);color:var(--g);font-weight:600"><i class="ti ti-sitemap" style="font-size:10px"></i> ${esc(hier.nome)}</span>`:''}
            ${eq?`<span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(37,99,235,.1);color:#2563eb;font-weight:600"><i class="ti ti-users-group" style="font-size:10px"></i> ${esc(eq.nome)}</span>`:''}
            ${meta}
          </div>
        </div>
        ${(editar||remover)?`<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${editar?`<select class="fi ulist-hier-sel" data-uid="${u.id}" style="font-size:11.5px;padding:4px 8px;height:auto">
              <option value="">Hierarquia...</option>
              ${hierOpts.map(h=>`<option value="${esc(h.sb_id)}"${String(u.hierarquiaId)===String(h.sb_id)?' selected':''}>${esc(h.nome)}</option>`).join('')}
            </select>
            <button class="ulist-hier-save-btn" data-uid="${u.id}" title="Salvar hierarquia" style="padding:4px 10px;font-size:12px;border-radius:6px;border:none;background:#016b3c;color:#fff;cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:600"><i class="ti ti-check"></i> Salvar</button>
            <button class="btn bd bsm ulist-edit-btn" data-uid="${u.id}" title="Editar usuário" style="color:var(--g);border-color:var(--g)"><i class="ti ti-pencil"></i></button>`:''}
          ${remover?`<button class="btn bd bsm ulist-remove-btn" data-uid="${u.id}" title="Remover usuário"><i class="ti ti-trash"></i></button>`:''}
        </div>`:''}
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.ulist-edit-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();abrirModalEditarUsuario(parseInt(btn.getAttribute('data-uid')));}));
  list.querySelectorAll('.ulist-remove-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();removeUser(parseInt(btn.getAttribute('data-uid')));}));
  list.querySelectorAll('.ulist-hier-sel').forEach(sel=>sel.addEventListener('change',()=>{
    const btn=sel.parentElement&&sel.parentElement.querySelector('.ulist-hier-save-btn');
    if(btn) btn.style.background='var(--g)';
  }));
  list.querySelectorAll('.ulist-hier-save-btn').forEach(btn=>btn.addEventListener('click',async e=>{
    e.stopPropagation();
    const uid=parseInt(btn.getAttribute('data-uid'));
    const sel=btn.parentElement&&btn.parentElement.querySelector('.ulist-hier-sel');
    if(!sel||!sel.value){showToast('Selecione uma hierarquia primeiro','ti-alert-circle');return;}
    btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Salvando...';
    try{
      await changeUserHier(uid,sel.value);
      showToast('Hierarquia salva!','ti-check');
    }catch(err){
      showToast('Não foi possível salvar: '+err.message,'ti-alert-circle','#dc2626');
      btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Salvar';
    }
  }));
}

async function _atualizarMembro(u,params){
  const {data,error}=await window._rpc('crm_atualizar_membro',{p_alvo:u.sb_id,...params});
  if(error) throw new Error(error.message);
  await window._loadProfiles();
  await window._loadEquipes();
  try{window._ensureMeHperms&&window._ensureMeHperms();}catch(e){}
  return data;
}
async function changeUserHier(userId,hierSbId){
  const u=users.find(x=>x.id===userId);
  if(!u||!u.sb_id) throw new Error('Usuário não encontrado.');
  if(!_podeEditarUsuario(u)) throw new Error('Você não pode alterar este usuário.');
  const h=hierarquiasAtribuiveis().find(x=>String(x.sb_id)===String(hierSbId));
  if(!h) throw new Error('Você só pode atribuir cargos abaixo do seu.');
  await _atualizarMembro(u,{p_hierarquia:h.sb_id});
  if(window._saveAtividade) window._saveAtividade('ti-sitemap',`${u.nome} agora é ${h.nome}`);
  renderUserList();
  try{renderRanking();}catch(e){}
}

function abrirModalEditarUsuario(uid){
  const u=users.find(x=>x.id===uid);
  if(!u)return;
  if(!_podeEditarUsuario(u)){showToast('Você não pode editar este usuário.','ti-lock');return;}
  const metaFmt=u.meta?Math.round(u.meta).toLocaleString('pt-BR'):'';
  const hierOpts=hierarquiasAtribuiveis().map(h=>`<option value="${esc(h.sb_id)}"${String(u.hierarquiaId)===String(h.sb_id)?' selected':''}>${esc(h.nome)}</option>`).join('');
  const eqAtual=getEqDeUser(u);
  const eqs=_equipesAtribuiveis();
  if(eqAtual&&!eqs.includes(eqAtual)) eqs.unshift(eqAtual);
  const eqOpts=`<option value="">Nenhuma</option>`+eqs.map(e=>`<option value="${e.id}"${eqAtual&&eqAtual.id===e.id?' selected':''}>${esc(e.nome)}</option>`).join('');
  const html=`<div id="modal-edit-user" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w,#1a1a2e);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:17px;font-weight:800;color:var(--tx)"><i class="ti ti-user-edit" style="color:var(--g)"></i> Editar usuário</div>
        <button onclick="document.getElementById('modal-edit-user')?.remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--tm)"><i class="ti ti-x"></i></button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Nome completo</label>
          <input id="eu-nome" class="fi" value="${esc(u.nome||'')}" placeholder="Nome completo" style="width:100%;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Meta (R$)</label>
          <input id="eu-meta" class="fi" value="${esc(metaFmt)}" placeholder="Meta em reais" oninput="maskMeta(this)" style="width:100%;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Hierarquia</label>
          <select id="eu-hier" class="fi" style="width:100%;box-sizing:border-box">${hierOpts}</select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Equipe</label>
          <select id="eu-equipe" class="fi" style="width:100%;box-sizing:border-box">${eqOpts}</select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:20px">
        <button id="eu-salvar-btn" onclick="salvarEdicaoUsuario(${uid})" style="flex:2;padding:12px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:14px;font-weight:700;cursor:pointer"><i class="ti ti-check"></i> Salvar alterações</button>
        <button onclick="document.getElementById('modal-edit-user')?.remove()" style="flex:1;padding:12px;border:1px solid var(--c2);border-radius:8px;background:transparent;color:var(--tx);font-size:14px;cursor:pointer">Cancelar</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modal-edit-user')?.remove();
  document.body.insertAdjacentHTML('beforeend',html);
}

async function salvarEdicaoUsuario(uid){
  const u=users.find(x=>x.id===uid);
  if(!u)return;
  const nomeVal=document.getElementById('eu-nome')?.value.trim();
  const metaVal=unM(document.getElementById('eu-meta')?.value)||0;
  const hierVal=document.getElementById('eu-hier')?.value||null;
  const eqSel=parseInt(document.getElementById('eu-equipe')?.value)||null;
  if(!nomeVal){showToast('Informe o nome.','ti-alert-triangle','#d97706');return;}
  const eqAtual=getEqDeUser(u);
  const novaEq=eqSel?equipes.find(e=>e.id===eqSel):null;
  const mudouEquipe=(eqAtual?eqAtual.id:null)!==(novaEq?novaEq.id:null);
  const params={p_nome:nomeVal,p_meta:metaVal};
  if(hierVal&&String(hierVal)!==String(u.hierarquiaId)) params.p_hierarquia=hierVal;
  if(mudouEquipe){ params.p_mudar_equipe=true; params.p_equipe=novaEq?novaEq.sb_id:null; }
  const btn=document.getElementById('eu-salvar-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Salvando...';}
  try{
    await _atualizarMembro(u,params);
    document.getElementById('modal-edit-user')?.remove();
    showToast('Usuário atualizado!','ti-check','#016b3c');
    renderUserList();
    try{renderRanking();}catch(e){}
    try{renderKanban();renderTable();}catch(e){}
  }catch(err){
    showToast('Não foi possível salvar: '+err.message,'ti-alert-circle','#dc3545');
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Salvar alterações';}
  }
}

// Remover: escolhe quem recebe os leads, desativa o acesso e mantém o histórico
function removeUser(id){
  const u=users.find(x=>x.id===id);
  if(!u)return;
  if(!_podeRemoverUsuario(u)){showToast('Você não pode remover este usuário.','ti-lock');return;}
  const me=getMe();
  const destinos=(isGestor(me)?users:users.filter(x=>getVisiveisParaMim().has(x.id))).filter(x=>x.id!==u.id)
    .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const qtd=leads.filter(l=>l.responsavelId===u.id).length;
  document.getElementById('modal-remover-user')?.remove();
  const html=`<div id="modal-remover-user" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:26px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="font-size:17px;font-weight:800;color:var(--tx);margin-bottom:6px"><i class="ti ti-user-x" style="color:#dc2626"></i> Remover ${esc(u.nome)}</div>
      <div style="font-size:13px;color:var(--tm);line-height:1.55;margin-bottom:16px">O acesso ao CRM é bloqueado na hora. As vendas continuam no histórico e no ranking.${qtd?` Os <strong>${qtd} lead${qtd!==1?'s':''}</strong> que você vê dessa pessoa (e os demais dela) vão para:`:' Os leads dessa pessoa (se houver) vão para:'}</div>
      <select id="ru-destino" class="fi" style="width:100%;margin-bottom:18px">
        ${destinos.map(x=>`<option value="${x.id}"${me&&x.id===me.id?' selected':''}>${esc(x.nome)} (${esc(getHierLabel(x))})</option>`).join('')}
      </select>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-remover-user')?.remove()" style="flex:1;padding:11px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="ru-btn" onclick="_removerUsuarioExec(${u.id})" style="flex:2;padding:11px;border:none;border-radius:8px;background:#dc2626;color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-trash"></i> Remover usuário</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}
async function _removerUsuarioExec(id){
  const u=users.find(x=>x.id===id);
  const dest=users.find(x=>x.id===parseInt(document.getElementById('ru-destino')?.value));
  if(!u||!dest){showToast('Escolha quem recebe os leads.','ti-alert-triangle','#d97706');return;}
  const btn=document.getElementById('ru-btn'); if(btn){btn.disabled=true;btn.textContent='Removendo...';}
  const {data,error}=await window._rpc('crm_remover_membro',{p_alvo:u.sb_id,p_transferir_para:dest.sb_id});
  if(error){
    showToast('Não foi possível remover: '+error.message,'ti-alert-triangle','#dc2626');
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i> Remover usuário';}
    return;
  }
  document.getElementById('modal-remover-user')?.remove();
  const n=(data&&data.leads_transferidos)||0;
  if(window._saveAtividade) window._saveAtividade('ti-user-x',`${u.nome} foi removido(a)${n?` — ${n} lead${n!==1?'s':''} para ${dest.nome}`:''}`);
  await window._loadProfiles();
  await window._loadEquipes();
  await window._loadLeads();
  showToast(`${u.nome} removido(a).${n?` ${n} lead${n!==1?'s':''} passaram para ${dest.nome}.`:''}`,'ti-user-x','#dc2626');
  if(data&&data.aviso) setTimeout(()=>showToast(data.aviso,'ti-alert-triangle','#d97706'),2500);
  renderUserList();populateSelects();
  try{renderKanban();renderTable();renderRanking();renderDashboard();}catch(e){}
}

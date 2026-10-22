// ─── USUÁRIOS ──────────────────────────────────────────────────────────────────
async function inviteUser(){
  const nomeVal=document.getElementById('uNome').value.trim();
  const email=document.getElementById('uEmail').value.trim();
  const senha=document.getElementById('uSenha').value;
  const senhaConf=document.getElementById('uSenhaConf').value;
  if(!nomeVal){showToast('Informe o nome completo.','ti-alert-triangle','#d97706');return;}
  if(!email||!email.includes('@')){showToast('E-mail inválido.','ti-alert-triangle','#d97706');return;}
  if(!senha||senha.length<6){showToast('A senha deve ter pelo menos 6 caracteres.','ti-alert-triangle','#d97706');return;}
  if(senha!==senhaConf){showToast('As senhas não coincidem. Verifique e tente novamente.','ti-alert-triangle','#dc3545');return;}
  if(users.find(u=>u.email===email)){showToast('Este e-mail já está cadastrado no sistema.','ti-alert-triangle','#d97706');return;}
  const hierSel=document.getElementById('uHierarquia');
  const hierLocalId=hierSel?parseInt(hierSel.value)||null:null;
  if(!hierLocalId){showToast('Selecione a hierarquia do usuário.','ti-alert-triangle','#d97706');return;}
  const selH=getHier(hierLocalId);
  // Sempre usa UUID do banco para armazenar/enviar ao Supabase
  const hierarquiaId=selH?(selH.sb_id||selH.id):hierLocalId;
  const metaEl=document.getElementById('uMeta');
  const metaRaw=metaEl?unM(metaEl.value)||0:0;
  if(!metaRaw){showToast('Informe a meta do usuário.','ti-alert-triangle','#d97706');return;}
  const equipeEl=document.getElementById('uEquipe');
  const equipeId=equipeEl?parseInt(equipeEl.value)||null:null;
  const role=slugToRole(selH);
  const btn=document.getElementById('btn-invite-user');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i>Cadastrando...';}
  let sbUserId=null;
  let criado=false;
  let errMsg='';

  // 1ª tentativa: Edge Function com senha definida pelo admin
  // Garante token fresco direto do Supabase
  let _freshToken = window._session?.access_token || '';
  try{
    const {data:{session:_fs}}=await window._sb.auth.getSession();
    if(_fs?.access_token) _freshToken=_fs.access_token;
  }catch(e){}
  try{
    const res=await fetch('https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/create-user',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${_freshToken}`},
      body:JSON.stringify({email,senha,nome:nomeVal,role,meta:metaRaw,hierarquia_id:hierarquiaId,equipe_id:equipeId})
    });
    let json={};
    try{json=await res.json();}catch(e){console.warn('Edge Function retornou resposta não-JSON, status:',res.status);}
    console.log('[create-user] status:',res.status,'json:',json);
    if(json.id){sbUserId=json.id;criado=true;}
    else if(json.error) errMsg=json.error;
    if(!res.ok&&!criado) throw new Error(json.error||json.message||`HTTP ${res.status}`);
  }catch(err){
    console.warn('Edge Function create-user falhou:',err.message);
    // 2ª tentativa: admin API direto via SDK (só funciona com service_role key configurada)
    try{
      const {data:adm,error:admErr}=await window._sb.auth.admin.createUser({
        email,password:senha,email_confirm:true,
        user_metadata:{nome:nomeVal,role}
      });
      if(admErr) throw new Error(admErr.message);
      if(adm?.user?.id){sbUserId=adm.user.id;criado=true;console.log('[create-user] criado via admin API:',sbUserId);}
      else throw new Error('admin.createUser não retornou ID');
    }catch(err2){
      console.warn('admin.createUser também falhou:',err2.message);
      errMsg = err2.message.includes('not allowed')||err2.message.includes('service_role')
        ? 'A Edge Function de cadastro está indisponível. Verifique o deploy no Supabase Dashboard → Edge Functions → create-user.'
        : (err2.message||'Serviço de cadastro indisponível. Verifique sua conexão e tente novamente.');
    }
  }

  if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-user-plus"></i>Cadastrar usuário';}
  const toast=document.getElementById('invite-toast');
  toast.style.display='block';

  if(!criado){
    toast.style.background='rgba(220,38,38,.1)';
    toast.style.borderColor='rgba(220,38,38,.3)';
    toast.style.color='#dc2626';
    toast.innerHTML=`<i class="ti ti-alert-circle"></i> Erro ao cadastrar: ${errMsg||'Tente novamente.'}`;
    setTimeout(()=>{toast.style.display='none';toast.style='';},8000);
    return;
  }

  // Cria usuário localmente no CRM
  const _meInv=getMe();
  const newU={id:nextUserId++,nome:nomeVal,email,role,sb_id:sbUserId||null,managerId:null,vendas:0,credito:0,meta:metaRaw,hierarquiaId,equipeId,empresaId:_meInv?.empresaId||null,
    perms:{...DPERMS[role]||DPERMS.vendedor},hperms:selH?{...selH.perms}:{}};
  users.push(newU);
  if(window._syncUser) await window._syncUser(newU);
  // Adiciona à equipe DEPOIS de ter sb_id, para que _syncEquipe consiga persistir o membro
  if(equipeId){
    const eq=equipes.find(e=>e.id===equipeId);
    if(eq){
      eq.membroIds=eq.membroIds||[];
      if(!eq.membroIds.includes(newU.id)) eq.membroIds.push(newU.id);
      if(window._syncEquipe) await window._syncEquipe(eq);
    }
  }

  // Envia email de boas-vindas com credenciais via Edge Function
  try{
    const _meEmail=getMe();
    // _empresasCache é o array correto (window.empresas não existe)
    const _empCache=window._empresasCache||[];
    const empresaEmail=_empCache.find(e=>e.id===(_meEmail?.empresaId));
    fetch('https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/send-welcome-email',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${window._session?.access_token||''}`},
      body:JSON.stringify({nome:nomeVal,email,senha,empresaNome:empresaEmail?.nome||''})
    }).then(r=>r.json()).then(d=>{if(!d.ok)console.warn('Email não enviado:',d.error);else console.log('Email enviado:',d.id);}).catch(e=>console.warn('Erro email:',e.message));
  }catch(e){console.warn('Erro ao chamar send-welcome-email:',e.message);}

  // Limpa formulário
  document.getElementById('uNome').value='';
  document.getElementById('uEmail').value='';
  document.getElementById('uSenha').value='';
  document.getElementById('uSenhaConf').value='';
  if(metaEl)metaEl.value='';
  if(hierSel)hierSel.value='';
  if(equipeEl)equipeEl.value='';

  renderRanking();
  toast.style.background='';toast.style.borderColor='';toast.style.color='';
  toast.innerHTML=`<i class="ti ti-user-check"></i> <strong>${nomeVal}</strong> cadastrado com sucesso! Já pode entrar com o e-mail <strong>${email}</strong> e a senha definida.`;
  setTimeout(()=>toast.style.display='none',9000);
  renderUserList();populateSelects();
}
function togglePerm(userId,perm){
  const u=users.find(x=>x.id===userId);
  if(!u||u.role==='admin')return; // FIX bug#6: protege por role, não por id
  u.perms[perm]=!u.perms[perm];renderUserList();
}
function changeRole(userId,newRole){
  const u=users.find(x=>x.id===userId);
  if(!u||u.role==='admin')return; // FIX bug#6
  u.role=newRole;u.perms={...DPERMS[newRole]};renderUserList();
}
function renderUserList(){
  const list=document.getElementById('user-list');if(!list)return;
  const _meUL=getMe();const _empUL=_meUL?.empresaId;
  const _usersUL=_empUL?users.filter(u=>u.empresaId===_empUL):users;
  // Hierarquias disponíveis para atribuição dependem do nível de quem está logado:
  // Gestor → todas; outros → só hierarquias de nível INFERIOR ao seu (ordem maior)
  const isGestorUL=_meUL&&(_meUL.role==='gestor'||_meUL.role==='admin'||_meUL.role==='master'||_meUL.role==='superadmin');
  const meuNivelUL=isGestorUL?0:getNivelHier(_meUL);
  const hierDisponiveisUL=hierarquias.filter(h=>isGestorUL||(h.ordem>meuNivelUL)).sort((a,b)=>a.ordem-b.ordem);
  list.innerHTML=_usersUL.map(u=>{
    const hier=u.hierarquiaId?getHier(u.hierarquiaId):null;
    const eq=u.equipeId?equipes.find(e=>e.id===u.equipeId):null;
    const avatarStyle=u.foto?`background:url('${u.foto}') center/cover no-repeat`:`background:linear-gradient(135deg,var(--g),var(--gc))`;
    return `<div class="ucard">
      <div class="utop">
        <div class="uav" style="${avatarStyle}">${u.foto?'':u.nome.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="uname">${u.nome}${u.role==='admin'?' <span style="font-size:10px;color:var(--g);font-weight:700">● Admin</span>':''}</div>
          <div class="uemail">${u.email}</div>
          <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap">
            ${hier?`<span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(1,107,60,.1);color:var(--g);font-weight:600"><i class="ti ti-sitemap" style="font-size:10px"></i> ${hier.nome}</span>`:''}
            ${eq?`<span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(37,99,235,.1);color:#2563eb;font-weight:600"><i class="ti ti-users-group" style="font-size:10px"></i> ${eq.nome}</span>`:''}
          </div>
        </div>
        ${u.role!=='admin'?`
          <div style="display:flex;align-items:center;gap:6px">
            <select class="fi ulist-hier-sel" data-uid="${u.id}" style="font-size:11.5px;padding:4px 8px;height:auto">
              <option value="">Hierarquia...</option>
              ${hierDisponiveisUL.map(h=>`<option value="${h.id}" ${(u.hierarquiaId&&(String(u.hierarquiaId)===String(h.sb_id)||String(u.hierarquiaId)===String(h.id)))?'selected':''}>${h.nome}</option>`).join('')}
            </select>
            <button class="ulist-hier-save-btn" data-uid="${u.id}" title="Salvar hierarquia" style="padding:4px 10px;font-size:12px;border-radius:6px;border:none;background:#016b3c;color:#fff;cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:600"><i class="ti ti-check"></i> Salvar</button>
            <button class="btn bd bsm ulist-edit-btn" data-uid="${u.id}" title="Editar usuário" style="color:var(--g);border-color:var(--g)"><i class="ti ti-pencil"></i></button>
            ${(()=>{
              // Gestor/master/superadmin: pode remover qualquer um
              if(isGestorUL||(_meUL&&(_meUL.role==='master'||_meUL.role==='superadmin'))) return `<button class="btn bd bsm ulist-remove-btn" data-uid="${u.id}" title="Remover usuário"><i class="ti ti-trash"></i></button>`;
              // Supervisor: pode remover apenas vendedores (nível abaixo dele)
              if(_meUL&&_meUL.role==='supervisor'&&u.role==='vendedor') return `<button class="btn bd bsm ulist-remove-btn" data-uid="${u.id}" title="Remover usuário"><i class="ti ti-trash"></i></button>`;
              return '';
            })()}
          </div>
        `:`<span class="rbadge rg">Administrador</span>`}
      </div>
    </div>`;
  }).join('');
  // bind events via delegation — no inline onclick/onchange
  list.querySelectorAll('.ulist-edit-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      const uid=parseInt(btn.getAttribute('data-uid'));
      abrirModalEditarUsuario(uid);
    });
  });
  list.querySelectorAll('.ulist-remove-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      const uid=parseInt(btn.getAttribute('data-uid'));
      removeUser(uid);
    });
  });
  list.querySelectorAll('.ulist-hier-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      // Só marca visualmente que mudou; save é pelo botão ✓
      const btn=sel.parentElement&&sel.parentElement.querySelector('.ulist-hier-save-btn');
      if(btn) btn.style.background='var(--g)';
    });
  });
  list.querySelectorAll('.ulist-hier-save-btn').forEach(function(btn){
    btn.addEventListener('click',async function(e){
      e.stopPropagation();
      const uid=parseInt(btn.getAttribute('data-uid'));
      const sel=btn.parentElement&&btn.parentElement.querySelector('.ulist-hier-sel');
      if(!sel||!sel.value){showToast('Selecione uma hierarquia primeiro','ti-alert-circle');return;}
      btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Salvando...';
      try{
        await changeUserHier(uid,sel.value);
        btn.innerHTML='<i class="ti ti-check"></i> Salvo!';
        btn.style.background='#15803d';
        showToast('Hierarquia salva com sucesso!','ti-check');
        setTimeout(()=>{btn.innerHTML='<i class="ti ti-check"></i> Salvar';btn.style.background='#016b3c';btn.disabled=false;},2000);
      }catch(err){
        console.error('[save-hier] erro:',err);
        btn.innerHTML='<i class="ti ti-x"></i> Erro';
        btn.style.background='#dc2626';
        showToast('Erro ao salvar: '+err.message,'ti-alert-circle');
        setTimeout(()=>{btn.innerHTML='<i class="ti ti-check"></i> Salvar';btn.style.background='#016b3c';btn.disabled=false;},3000);
      }
    });
  });
}
async function changeUserHier(userId,hierIdStr){
  const u=users.find(x=>x.id===userId);
  if(!u||u.role==='admin') throw new Error('Usuário não encontrado ou é admin');
  const hid=parseInt(hierIdStr)||null;
  const h=hid?getHier(hid):null;
  if(!h) throw new Error('Hierarquia não encontrada (id='+hierIdStr+')');
  if(!h.sb_id) throw new Error('Hierarquia ainda não tem ID do banco (sb_id ausente). Recarregue a página e tente novamente.');
  // Regra de hierarquia: só gestor pode promover para qualquer nível.
  // Representante/Supervisor só pode atribuir hierarquias de nível INFERIOR ao seu.
  const quemFaz=getMe();
  const isGestorFaz=quemFaz&&(quemFaz.role==='gestor'||quemFaz.role==='admin'||quemFaz.role==='master'||quemFaz.role==='superadmin');
  if(!isGestorFaz){
    const meuNivel=getNivelHier(quemFaz)||99;
    const nivelDestino=h.ordem||99;
    if(nivelDestino<=meuNivel){
      throw new Error('Você não pode atribuir uma hierarquia igual ou superior à sua. Apenas o gestor pode fazer isso.');
    }
  }
  console.log('[changeUserHier] user='+u.nome+' sb_id='+u.sb_id+' hier='+h.nome+' hier_sb_id='+h.sb_id);
  // Sempre usa o UUID do banco (sb_id) como hierarquiaId — nunca ID local numérico
  u.hierarquiaId=h.sb_id;
  if(h.perms) u.hperms={...h.perms};
  u.role=slugToRole(h);
  u.perms={...DPERMS[u.role]||DPERMS.vendedor};
  if(!window._syncUser) throw new Error('_syncUser não disponível');
  // Para outros usuários: chama Edge Function diretamente com UUID já resolvido
  if(u.sb_id && u.sb_id !== window._currentUserId){
    const token=window._session?.access_token;
    if(!token) throw new Error('Sem token de autenticação');
    const body={
      target_id: u.sb_id,
      nome: u.nome,
      role: u.role||'vendedor',
      hierarquia_id: h.sb_id, // UUID da hierarquia no banco
      perms: u.perms?JSON.stringify(u.perms):null,
      hperms: u.hperms?JSON.stringify(u.hperms):null,
    };
    console.log('[changeUserHier] enviando para Edge Function:', JSON.stringify(body));
    const res=await fetch('https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/update-profile',{
      method:'POST',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    const json=await res.json();
    if(!res.ok){
      // Se o erro é tipo integer (coluna ainda não migrada), tenta salvar sem hierarquia_id
      // e avisa o usuário que precisa migrar o banco
      const errMsg=(json.error||'');
      if(errMsg.includes('integer')||errMsg.includes('uuid')||errMsg.includes('syntax')){
        throw new Error('⚠️ Banco de dados desatualizado: a coluna hierarquia_id precisa ser migrada para UUID. Rode o SQL de migração no Supabase Dashboard.');
      }
      console.error('[changeUserHier] Edge Function error:',json);
      throw new Error(json.error||'Erro ao salvar no servidor');
    }
    console.log('[changeUserHier] salvo via Edge Function! hierarquia_id='+h.sb_id+' role='+u.role);
  } else {
    await window._syncUser(u);
    console.log('[changeUserHier] salvo! hierarquiaId='+u.hierarquiaId+' role='+u.role);
  }
  // Se for o próprio usuário logado, aplica permissões imediatamente sem precisar recarregar
  if(u.sb_id===window._currentUserId){
    try{window._ensureMeHperms&&window._ensureMeHperms();}catch(e){}
    try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
    try{window.renderConfig&&window.renderConfig();}catch(e){}
  }
  renderUserList();
}

function abrirModalEditarUsuario(uid){
  const u=users.find(x=>x.id===uid);
  if(!u)return;
  const metaFmt=u.meta?u.meta.toLocaleString('pt-BR'):'';
  const hierOpts=hierarquias.map(h=>`<option value="${h.id}" ${(u.hierarquiaId&&(String(u.hierarquiaId)===String(h.sb_id)||String(u.hierarquiaId)===String(h.id)))?'selected':''}>${h.nome}</option>`).join('');
  const eqOpts=`<option value="">Nenhuma</option>`+equipes.map(e=>`<option value="${e.id}" ${String(u.equipeId)===String(e.id)?'selected':''}>${e.nome}</option>`).join('');
  const html=`<div id="modal-edit-user" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w,#1a1a2e);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:17px;font-weight:800;color:var(--tx)"><i class="ti ti-user-edit" style="color:var(--g)"></i> Editar usuário</div>
        <button onclick="document.getElementById('modal-edit-user')?.remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--tm)"><i class="ti ti-x"></i></button>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Nome completo</label>
          <input id="eu-nome" class="fi" value="${u.nome||''}" placeholder="Nome completo" style="width:100%;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Meta (R$)</label>
          <input id="eu-meta" class="fi" value="${metaFmt}" placeholder="Meta em reais" oninput="maskMeta(this)" style="width:100%;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Hierarquia</label>
          <select id="eu-hier" class="fi" style="width:100%;box-sizing:border-box">
            <option value="">Selecione...</option>
            ${hierOpts}
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:4px">Equipe</label>
          <select id="eu-equipe" class="fi" style="width:100%;box-sizing:border-box">
            ${eqOpts}
          </select>
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
  const hierVal=document.getElementById('eu-hier')?.value;
  const equipeVal=document.getElementById('eu-equipe')?.value;
  if(!nomeVal){showToast('Informe o nome.','ti-alert-triangle','#d97706');return;}
  const btn=document.getElementById('eu-salvar-btn');
  if(btn){btn.disabled=true;btn.innerHTML='<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Salvando...';}

  try{
    const h=hierVal?getHier(parseInt(hierVal)):null;
    const updates={
      nome:nomeVal,
      meta:metaVal,
      equipe_id:equipeVal?parseInt(equipeVal):null,
    };
    if(h&&h.sb_id){
      updates.hierarquia_id=h.sb_id;
      const _novoRole=slugToRole(h);
      // Proteção: nunca rebaixa role de maior privilégio
      let _roleDbAtual=u.role||null;
      try{const _rr=await window._sb.from('profiles').select('role').eq('id',u.sb_id).single();_roleDbAtual=_rr.data?.role||_roleDbAtual;}catch(e){}
      updates.role=window._roleSeguro?window._roleSeguro(_novoRole,_roleDbAtual):_novoRole;
    }
    // Salva no banco
    if(u.sb_id){
      const token=window._session?.access_token;
      // Tenta Edge Function primeiro
      let salvoViaEdge=false;
      try{
        const res=await fetch('https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/update-profile',{
          method:'POST',
          headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({target_id:u.sb_id,...updates})
        });
        if(res.ok) salvoViaEdge=true;
      }catch(e){console.warn('Edge Function update-profile falhou, usando direto');}
      // Fallback: salva direto na tabela profiles
      if(!salvoViaEdge){
        await window._sb.from('profiles').update(updates).eq('id',u.sb_id);
      }
    }
    // Atualiza objeto local
    u.nome=nomeVal;
    u.meta=metaVal;
    if(equipeVal) u.equipeId=parseInt(equipeVal); else u.equipeId=null;
    if(h&&h.sb_id){u.hierarquiaId=h.sb_id;u.role=slugToRole(h);}
    document.getElementById('modal-edit-user')?.remove();
    showToast('Usuário atualizado com sucesso!','ti-check','#016b3c');
    renderUserList();
    try{window.renderRanking&&window.renderRanking();}catch(e){}
  }catch(err){
    console.error('[salvarEdicaoUsuario]',err);
    showToast('Erro ao salvar: '+err.message,'ti-alert-circle','#dc3545');
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Salvar alterações';}
  }
}

function removeUser(id){
  const u=users.find(x=>x.id===id);
  if(!u)return;
  showConfirm(`Remover o usuário "${u.nome}"?\n\nEsta ação revogará o acesso ao CRM permanentemente.`,async function(){
    showToast('Removendo usuário...','ti-loader','#6366f1');
    // Tenta remover do Auth via Edge Function (pode falhar se quem chama não for gestor)
    if(u.sb_id){
      try{
        const res=await fetch('https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/delete-user',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${window._session?.access_token||''}`},
          body:JSON.stringify({userId:u.sb_id})
        });
        if(!res.ok) console.warn('[removeUser] Edge Function negou — removendo só do profiles');
      }catch(err){
        console.warn('[removeUser] Edge Function inacessível — removendo só do profiles');
      }
    }
    // Sempre remove do profiles — isso basta para bloquear o acesso ao CRM
    if(u.sb_id&&window._sb){
      const {error}=await window._sb.from('profiles').delete().eq('id',u.sb_id);
      if(error){
        showToast('Erro ao remover usuário. Tente novamente.','ti-alert-triangle','#dc2626');
        return;
      }
    }
    users=users.filter(x=>x.id!==id);
    equipes.forEach(eq=>{eq.membroIds=(eq.membroIds||[]).filter(mid=>mid!==id);});
    showToast(`Usuário "${u.nome}" removido com sucesso.`,'ti-user-x','#dc2626');
    renderUserList();populateSelects();
  });
}

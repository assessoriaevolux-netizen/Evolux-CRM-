// ─── EMPRESAS (superadmin) ────────────────────────────────────────────────────
let _empresasCache=[];
async function loadEmpresas(){
  try{
    const {data}=await window._sb.from('empresas').select('*').order('criado_em');
    if(data) _empresasCache=data;
  }catch(e){console.warn('loadEmpresas:',e);}
}
async function renderEmpresas(){
  await loadEmpresas();
  const list=document.getElementById('empresas-list');if(!list)return;
  if(!_empresasCache.length){list.innerHTML='<p style="color:var(--fg2)">Nenhuma empresa cadastrada ainda.</p>';return;}
  const base=window.location.origin+window.location.pathname.replace('crm.html','index.html');
  list.innerHTML=_empresasCache.map(e=>{
    const link=`${base}?convite=${e.id}&empresa=${encodeURIComponent(e.nome)}`;
    return `<div style="background:var(--w);border:1px solid var(--c2);border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="width:48px;height:48px;border-radius:10px;background:var(--gs);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--g);flex-shrink:0">${e.nome.charAt(0)}</div>
      <div style="flex:1;min-width:160px">
        <div style="font-weight:700;font-size:14px">${e.nome}</div>
        <div style="font-size:12px;color:var(--tm);margin-top:2px">Plano: <strong>${e.plano||'básico'}</strong> · ${e.ativo?'<span style="color:var(--g)">● Ativo</span>':'<span style="color:#dc2626">● Inativo</span>'}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px;background:var(--c0);border:1px solid var(--c2);border-radius:7px;padding:6px 10px">
          <i class="ti ti-link" style="font-size:13px;color:var(--tm);flex-shrink:0"></i>
          <span style="font-size:11px;color:var(--tm);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${link}</span>
          <button onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('Link copiado!','ti-check'))" style="border:none;background:var(--g);color:#fff;border-radius:5px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0"><i class="ti ti-copy"></i> Copiar</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0">
        <button class="btn bd bsm" onclick="openEditarEmpresaModal('${e.id}')" title="Editar empresa"><i class="ti ti-pencil"></i></button>
        <button class="btn bd bsm" onclick="toggleEmpresaAtivo('${e.id}',${e.ativo})" style="flex-shrink:0">${e.ativo?'Desativar':'Ativar'}</button>
      </div>
    </div>`;
  }).join('');
}
async function openNovaEmpresaModal(){
  // Modal bonito ao invés de prompt
  const html=`<div id="modal-nova-empresa" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px">Nova empresa</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">Preencha os dados da empresa cliente</div>
      <div class="field" style="margin-bottom:12px"><label>Nome da empresa</label><input type="text" id="ne-nome" class="fi" placeholder="Ex: Corretor Silva Consórcios" autofocus></div>
      <div class="field" style="margin-bottom:20px"><label>Plano</label><select id="ne-plano" class="fi"><option value="basico">Básico</option><option value="pro">Pro</option><option value="master">Master</option></select></div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-nova-empresa')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="criarEmpresaConfirm()" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-building-plus"></i> Criar empresa</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(()=>document.getElementById('ne-nome')?.focus(),100);
}
async function criarEmpresaConfirm(){
  const nome=document.getElementById('ne-nome')?.value.trim();
  const plano=document.getElementById('ne-plano')?.value||'basico';
  if(!nome){showToast('Informe o nome da empresa.','ti-alert-triangle','#d97706');return;}
  // Usa Edge Function para contornar RLS (service_role no servidor)
  let data=null;
  try{
    let _token=window._session?.access_token||'';
    try{const {data:{session:_fs}}=await window._sb.auth.getSession();if(_fs?.access_token)_token=_fs.access_token;}catch(e){}
    const res=await fetch(`${window._sbUrl}/functions/v1/create-empresa`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${_token}`},
      body:JSON.stringify({nome,plano})
    });
    const json=await res.json();
    if(!res.ok||json.error){showToast('Erro: '+(json.error||`HTTP ${res.status}`),'ti-alert-circle','#dc3545');return;}
    data=json.data;
  }catch(err){showToast('Erro ao criar empresa: '+err.message,'ti-alert-circle','#dc3545');return;}
  // NÃO altera empresa_id do master — ele permanece na própria empresa
  // O gestor convidado ficará vinculado a esta nova empresa ao aceitar o convite
  document.getElementById('modal-nova-empresa')?.remove();
  // Gera link de convite com empresa_id
  const base=window.location.origin+window.location.pathname.replace('crm.html','index.html');
  const link=`${base}?convite=${data.id}&empresa=${encodeURIComponent(nome)}`;
  // Modal com link de convite
  const html2=`<div id="modal-convite" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="width:56px;height:56px;background:rgba(29,185,84,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px"><i class="ti ti-check" style="font-size:26px;color:var(--g)"></i></div>
        <div style="font-size:17px;font-weight:800">Empresa criada!</div>
        <div style="font-size:13px;color:var(--tm);margin-top:4px">Compartilhe o link abaixo com o gestor da <strong>${nome}</strong></div>
      </div>
      <div style="background:var(--c0);border:1px solid var(--c2);border-radius:10px;padding:12px 14px;font-size:12px;word-break:break-all;color:var(--tx);margin-bottom:14px;font-family:monospace">${link}</div>
      <div style="display:flex;gap:10px">
        <button onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('Link copiado!','ti-check'));document.getElementById('modal-convite')?.remove();renderEmpresas();" style="flex:2;padding:11px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-copy"></i> Copiar link</button>
        <button onclick="document.getElementById('modal-convite')?.remove();renderEmpresas();" style="flex:1;padding:11px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Fechar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html2);
}
async function toggleEmpresaAtivo(id,atual){
  const novoStatus=!atual;
  const me=getMe();
  if(!me||!['master','superadmin'].includes(me.role)){
    showToast('Sem permissão para alterar status de empresa.','ti-ban',4000);
    return;
  }
  showToast((novoStatus?'Ativando':'Desativando')+' empresa...','ti-loader-2',2000);
  // Tenta via Edge Function (tem service_role, bypassa RLS)
  let ok=false;
  try{
    // Sempre busca sessão fresca para garantir token válido
    let _token='';
    try{const {data:{session:_fs}}=await window._sb.auth.getSession();_token=_fs?.access_token||'';}catch(e){}
    if(!_token) _token=window._session?.access_token||'';
    const res=await fetch(`${window._sbUrl}/functions/v1/create-empresa`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${_token}`},
      body:JSON.stringify({action:'toggle_ativo',empresa_id:id,ativo:novoStatus})
    });
    if(res.ok){ok=true;}
    else{
      // Fallback: tenta direto no banco
      const {error}=await window._sb.from('empresas').update({ativo:novoStatus}).eq('id',id);
      if(!error) ok=true;
      else{ console.error('[toggleEmpresaAtivo] RLS bloqueou:',error); showToast('Erro: '+error.message+'. Execute o SQL de policy no Supabase.','ti-alert-circle',6000); return; }
    }
  }catch(e){
    const {error}=await window._sb.from('empresas').update({ativo:novoStatus}).eq('id',id);
    if(!error) ok=true;
    else{ console.error('[toggleEmpresaAtivo] erro:',e,error); showToast('Erro ao alterar status da empresa.','ti-alert-circle',5000); return; }
  }
  if(ok){
    showToast('Empresa '+(novoStatus?'ativada':'desativada')+' com sucesso!','ti-check',3000);
    renderEmpresas();
  }
}

async function openEditarEmpresaModal(id){
  const e=_empresasCache.find(x=>x.id===id);
  if(!e)return;
  const html=`<div id="modal-editar-empresa" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px">Editar empresa</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">Altere os dados da empresa</div>
      <div class="field" style="margin-bottom:12px"><label>Nome da empresa</label><input type="text" id="ee-nome" class="fi" value="${e.nome.replace(/"/g,'&quot;')}"></div>
      <div class="field" style="margin-bottom:12px"><label>Plano</label>
        <select id="ee-plano" class="fi">
          <option value="basico" ${(e.plano||'basico')==='basico'?'selected':''}>Básico</option>
          <option value="pro" ${e.plano==='pro'?'selected':''}>Pro</option>
          <option value="master" ${e.plano==='master'?'selected':''}>Master</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:20px"><label>Observações internas</label><textarea id="ee-obs" class="fi" rows="2" placeholder="Anotações sobre este cliente...">${e.obs||''}</textarea></div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-editar-empresa')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="salvarEdicaoEmpresa('${id}')" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-device-floppy"></i> Salvar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(()=>document.getElementById('ee-nome')?.focus(),100);
}
async function salvarEdicaoEmpresa(id){
  const nome=document.getElementById('ee-nome')?.value.trim();
  const plano=document.getElementById('ee-plano')?.value||'basico';
  const obs=document.getElementById('ee-obs')?.value.trim()||null;
  if(!nome){showToast('Informe o nome da empresa.','ti-alert-triangle','#d97706');return;}
  showToast('Salvando...','ti-loader-2',2000);
  try{
    let _token='';
    try{const {data:{session:_fs}}=await window._sb.auth.getSession();_token=_fs?.access_token||'';}catch(e){}
    if(!_token) _token=window._session?.access_token||'';
    // Tenta via Edge Function primeiro
    const res=await fetch(`${window._sbUrl}/functions/v1/create-empresa`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${_token}`},
      body:JSON.stringify({action:'editar',empresa_id:id,nome,plano,obs})
    });
    if(!res.ok){
      // Fallback direto no banco
      const {error}=await window._sb.from('empresas').update({nome,plano,obs}).eq('id',id);
      if(error){showToast('Erro ao salvar: '+error.message,'ti-alert-circle','#dc2626');return;}
    }
    document.getElementById('modal-editar-empresa')?.remove();
    showToast('Empresa atualizada!','ti-check','#16a34a');
    renderEmpresas();
  }catch(err){
    showToast('Erro: '+err.message,'ti-alert-circle','#dc2626');
  }
}

function updateSbUser(){
  const me = getMe(); if(!me) return;
  const sbAv = document.getElementById('sb-av');
  const tpAv = document.getElementById('tp-av');
  const sbName = document.getElementById('sb-user-name');
  const sbRole = document.getElementById('sb-user-role');
  const avatarHtml = me.foto ? `<img src="${me.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (me.nome||'U').charAt(0).toUpperCase();
  if(sbAv) sbAv.innerHTML = avatarHtml;
  if(tpAv) tpAv.innerHTML = avatarHtml;
  if(sbName) sbName.textContent = me.nome;
  if(sbRole) sbRole.textContent = 'Evolux CRM';
}
window.updateSbUser=updateSbUser;
// Expõe funções globais para _loadProfiles poder chamá-las após profiles carregarem
window.renderDashboard=renderDashboard;
window._aplicarFiltroVendas=_aplicarFiltroVendas;
window._rankVendasCache=_rankVendasCache;
// renderRanking, renderUserList, renderConfig, applyNavPermissions são
// function declarations e já são globais — não precisam ser re-atribuídas

function mvMaskValor(el){
  let v=el.value.replace(/\D/g,'');
  if(!v){el.value='';return;}
  v=parseInt(v,10);
  el.value='R$ '+(v/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function maskTelConta(el){
  let v=el.value.replace(/\D/g,'');
  if(v.length>11) v=v.slice(0,11);
  if(v.length>10) v=v.replace(/^(\d{2})(\d{5})(\d{4})$/,'($1) $2-$3');
  else if(v.length>6) v=v.replace(/^(\d{2})(\d{4,5})(\d{0,4})$/,'($1) $2-$3');
  else if(v.length>2) v=v.replace(/^(\d{2})(\d+)$/,'($1) $2');
  else if(v.length>0) v=v.replace(/^(\d+)$/,'($1');
  el.value=v;
}
function maskCpfSim(el){
  let v=el.value.replace(/\D/g,'');
  if(v.length>11) v=v.slice(0,11);
  v=v.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3}\.\d{3})(\d)/,'$1.$2').replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/,'$1-$2');
  el.value=v;
}
function maskCnpjInt(el){
  let v=el.value.replace(/\D/g,'');
  if(v.length>14) v=v.slice(0,14);
  v=v.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2}\.\d{3})(\d)/,'$1.$2').replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/,'$1/$2').replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/,'$1-$2');
  el.value=v;
}

function salvarConfiguracoesConta(){
  const nomeEl = document.getElementById('accNome');
  const sobrenomeEl = document.getElementById('accSobrenome');
  const instaEl = document.getElementById('accInstagram');
  const waEl = document.getElementById('accWhatsapp');
  const nome = nomeEl ? nomeEl.value.trim() : '';
  const sobrenome = sobrenomeEl ? sobrenomeEl.value.trim() : '';
  const nomeCompleto = (nome + (sobrenome ? ' ' + sobrenome : '')).trim();

  // Atualiza foto da conta se houver preview
  const fotoPreviewEl = document.getElementById('foto-preview-conta');
  const fotoImg = fotoPreviewEl ? fotoPreviewEl.querySelector('img') : null;
  const fotoSrc = fotoImg ? fotoImg.src : '';

  // Atualiza usuário logado
  const me = getMe(); // FIX: nunca usa users[0]
  if(me){
    if(nomeCompleto) me.nome = nomeCompleto;
    if(fotoSrc) me.foto = fotoSrc;
    if(waEl) me.whatsapp = waEl.value.trim();
    // Bug #9: salvar instagram no objeto usuário para persistir no DB
    if(instaEl) me.instagram = instaEl.value.trim();
    // Garante que email e sb_id estão no objeto me para _syncUser não abortar
    if(!me.email && window._session?.user?.email) me.email = window._session.user.email;
    if(!me.sb_id && window._currentUserId) me.sb_id = window._currentUserId;
  }
  // Salva no localStorage como camada extra de persistência (independente do Supabase)
  try{
    const _lsKey = 'evolux_cfg_' + (window._currentUserId||'default');
    const _cfg = JSON.parse(localStorage.getItem(_lsKey)||'{}');
    _cfg.whatsapp = waEl?.value.trim()||'';
    _cfg.instagram = instaEl?.value.trim()||'';
    localStorage.setItem(_lsKey, JSON.stringify(_cfg));
  }catch(e){}

  // Atualiza sidebar e topbar imediatamente
  const sbName = document.getElementById('sb-user-name');
  const sbAv = document.getElementById('sb-av');
  const tpAv = document.getElementById('tp-av');
  if(sbName && nomeCompleto) sbName.textContent = nomeCompleto;
  const avatarHtml = fotoSrc
    ? `<img src="${fotoSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : (nomeCompleto ? nomeCompleto.charAt(0).toUpperCase() : 'E');
  if(sbAv) sbAv.innerHTML = avatarHtml;
  if(tpAv) tpAv.innerHTML = avatarHtml;

  // Salva dados da empresa
  const empNomeEl=document.getElementById('empNome');
  const empWaEl=document.getElementById('empWhatsapp');
  const empEmailEl=document.getElementById('empEmail');
  if(empNomeEl) empresa.nome=empNomeEl.value.trim()||empresa.nome;
  if(empWaEl) empresa.whatsapp=empWaEl.value.trim();
  if(empEmailEl) empresa.email=empEmailEl.value.trim();
  console.log('[salvarConfig] me=', me, 'role=', me?.role, 'sb_id=', me?.sb_id);
  if(window._syncUser&&me) window._syncUser(me).catch(e=>console.warn('[salvarConfig] _syncUser error:',e));
  if(window._syncEmpresa) window._syncEmpresa().catch(e=>console.warn('[salvarConfig] _syncEmpresa error:',e));

  // Atualiza o dashboard se estiver visível
  const dashTab = document.getElementById('tab-dashboard');
  if(dashTab && dashTab.classList.contains('active')) renderDashboard();

  showToast('Configurações salvas!', 'ti-check');
}

function uploadLogoEmpresa(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=ev=>{
    empresa.logo=ev.target.result;
    const prev=document.getElementById('emp-logo-preview');
    if(prev)prev.innerHTML=`<img src="${empresa.logo}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    if(window._syncEmpresa) window._syncEmpresa().catch(e=>console.warn(e));
    showToast('Logo da empresa atualizada!','ti-check');
  };
  r.readAsDataURL(file);
}



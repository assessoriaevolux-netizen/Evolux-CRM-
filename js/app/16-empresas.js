// ─── EMPRESAS (administrador da plataforma) ───────────────────────────────────
// Tudo passa por funções do servidor que conferem se quem chama é da plataforma.
let _empresasCache=[];
async function loadEmpresas(){
  const r=await window._sb.from('empresas').select('*').order('nome');
  if(r.error){ console.warn('loadEmpresas:',r.error); showToast('Não foi possível carregar as empresas: '+r.error.message,'ti-alert-triangle','#dc2626'); return; }
  _empresasCache=r.data||[];
}
function _linkConvite(token){
  const base=window.location.origin+window.location.pathname.replace(/crm\.html$/,'index.html');
  return `${base}?convite=${encodeURIComponent(token)}`;
}
async function renderEmpresas(){
  if(!isPlataforma()) return;
  await loadEmpresas();
  const list=document.getElementById('empresas-list');if(!list)return;
  if(!_empresasCache.length){list.innerHTML='<p style="color:var(--tm)">Nenhuma empresa cadastrada ainda.</p>';return;}
  list.innerHTML=_empresasCache.map(e=>{
    const ativo=e.ativo!==false;
    return `<div style="background:var(--w);border:1px solid var(--c2);border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="width:48px;height:48px;border-radius:10px;background:var(--gs);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--g);flex-shrink:0">${esc((e.nome||'?').charAt(0))}</div>
      <div style="flex:1;min-width:160px">
        <div style="font-weight:700;font-size:14px">${esc(e.nome)}</div>
        <div style="font-size:12px;color:var(--tm);margin-top:2px">Plano: <strong>${esc(e.plano||'básico')}</strong> · ${ativo?'<span style="color:var(--g)">● Ativa</span>':'<span style="color:#dc2626">● Suspensa (ninguém da empresa consegue entrar)</span>'}</div>
        ${e.obs?`<div style="font-size:11.5px;color:var(--tm);margin-top:4px">${esc(e.obs)}</div>`:''}
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
        <button class="btn bg bsm" onclick="gerarConviteEmpresa('${esc(e.id)}')" title="Gerar link de convite para o gestor"><i class="ti ti-link"></i>Convite</button>
        <button class="btn bd bsm" onclick="openEditarEmpresaModal('${esc(e.id)}')" title="Editar empresa"><i class="ti ti-pencil"></i></button>
        <button class="btn bd bsm" onclick="toggleEmpresaAtivo('${esc(e.id)}',${ativo})" style="flex-shrink:0">${ativo?'Suspender':'Reativar'}</button>
      </div>
    </div>`;
  }).join('');
}
function _modalConvite(nomeEmpresa,token,titulo){
  document.getElementById('modal-convite')?.remove();
  const link=_linkConvite(token);
  window._ultimoLinkConvite=link;
  const html=`<div id="modal-convite" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="text-align:center;margin-bottom:18px">
        <div style="width:56px;height:56px;background:rgba(29,185,84,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px"><i class="ti ti-check" style="font-size:26px;color:var(--g)"></i></div>
        <div style="font-size:17px;font-weight:800">${esc(titulo)}</div>
        <div style="font-size:13px;color:var(--tm);margin-top:4px">Envie o link abaixo para o gestor da <strong>${esc(nomeEmpresa)}</strong>.<br>Vale por 7 dias e para 1 cadastro.</div>
      </div>
      <div style="background:var(--c0);border:1px solid var(--c2);border-radius:10px;padding:12px 14px;font-size:12px;word-break:break-all;color:var(--tx);margin-bottom:14px;font-family:monospace;user-select:all">${esc(link)}</div>
      <div style="display:flex;gap:10px">
        <button onclick="copiarLinkConvite()" style="flex:2;padding:11px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-copy"></i> Copiar link</button>
        <button onclick="document.getElementById('modal-convite')?.remove();renderEmpresas();" style="flex:1;padding:11px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Fechar</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}
function copiarLinkConvite(){
  const link=window._ultimoLinkConvite||'';
  if(navigator.clipboard&&link) navigator.clipboard.writeText(link).then(()=>showToast('Link copiado!','ti-check')).catch(()=>showToast('Selecione o link e copie manualmente.','ti-info-circle'));
}
async function gerarConviteEmpresa(id){
  const e=_empresasCache.find(x=>String(x.id)===String(id));
  const {data,error}=await window._rpc('crm_admin_criar_convite',{p_empresa:String(id),p_role:'gestor',p_dias:7,p_max_usos:1});
  if(error){showToast('Não foi possível gerar o convite: '+error.message,'ti-alert-triangle','#dc2626');return;}
  _modalConvite(e?e.nome:'empresa',data,'Novo link de convite');
}
async function openNovaEmpresaModal(){
  if(!isPlataforma()){showToast('Somente o administrador da plataforma cria empresas.','ti-lock');return;}
  document.getElementById('modal-nova-empresa')?.remove();
  const html=`<div id="modal-nova-empresa" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px">Nova empresa</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">Preencha os dados da empresa cliente</div>
      <div class="field" style="margin-bottom:12px"><label>Nome da empresa</label><input type="text" id="ne-nome" class="fi" placeholder="Ex: Corretor Silva Consórcios"></div>
      <div class="field" style="margin-bottom:20px"><label>Plano</label><select id="ne-plano" class="fi"><option value="basico">Básico</option><option value="pro">Pro</option><option value="master">Master</option></select></div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-nova-empresa')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="ne-btn" onclick="criarEmpresaConfirm()" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-building-plus"></i> Criar empresa</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
  setTimeout(()=>document.getElementById('ne-nome')?.focus(),100);
}
let _criandoEmpresa=false;
async function criarEmpresaConfirm(){
  if(_criandoEmpresa)return;
  const nome=document.getElementById('ne-nome')?.value.trim();
  const plano=document.getElementById('ne-plano')?.value||'basico';
  if(!nome){showToast('Informe o nome da empresa.','ti-alert-triangle','#d97706');return;}
  _criandoEmpresa=true;
  const btn=document.getElementById('ne-btn'); if(btn) btn.disabled=true;
  const {data,error}=await window._rpc('crm_admin_criar_empresa',{p_nome:nome,p_plano:plano});
  _criandoEmpresa=false;
  if(btn) btn.disabled=false;
  if(error){showToast('Erro ao criar empresa: '+error.message,'ti-alert-circle','#dc3545');return;}
  document.getElementById('modal-nova-empresa')?.remove();
  _modalConvite(nome,data.token,'Empresa criada!');
  renderEmpresas();
}
async function toggleEmpresaAtivo(id,atual){
  if(!isPlataforma()){showToast('Sem permissão para alterar status de empresa.','ti-ban');return;}
  const e=_empresasCache.find(x=>String(x.id)===String(id));
  const novo=!atual;
  const executar=async()=>{
    const {error}=await window._rpc('crm_admin_ativar_empresa',{p_id:String(id),p_ativo:novo});
    if(error){showToast('Erro ao alterar a empresa: '+error.message,'ti-alert-circle','#dc2626');return;}
    showToast('Empresa '+(novo?'reativada':'suspensa')+'.','ti-check');
    renderEmpresas();
  };
  if(novo) executar();
  else showConfirm(`Suspender a ${e?e.nome:'empresa'}? Ninguém dela conseguirá entrar no CRM até você reativar.`,executar);
}
async function openEditarEmpresaModal(id){
  const e=_empresasCache.find(x=>String(x.id)===String(id));
  if(!e)return;
  document.getElementById('modal-editar-empresa')?.remove();
  const html=`<div id="modal-editar-empresa" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px">Editar empresa</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">Altere os dados da empresa</div>
      <div class="field" style="margin-bottom:12px"><label>Nome da empresa</label><input type="text" id="ee-nome" class="fi" value="${esc(e.nome)}"></div>
      <div class="field" style="margin-bottom:12px"><label>Plano</label>
        <select id="ee-plano" class="fi">
          <option value="basico" ${(e.plano||'basico')==='basico'?'selected':''}>Básico</option>
          <option value="pro" ${e.plano==='pro'?'selected':''}>Pro</option>
          <option value="master" ${e.plano==='master'?'selected':''}>Master</option>
        </select>
      </div>
      <div class="field" style="margin-bottom:20px"><label>Observações internas</label><textarea id="ee-obs" class="fi" rows="2" placeholder="Anotações sobre este cliente...">${esc(e.obs||'')}</textarea></div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-editar-empresa')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="salvarEdicaoEmpresa('${esc(e.id)}')" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-device-floppy"></i> Salvar</button>
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
  const {error}=await window._rpc('crm_admin_editar_empresa',{p_id:String(id),p_nome:nome,p_plano:plano,p_obs:obs});
  if(error){showToast('Erro ao salvar: '+error.message,'ti-alert-circle','#dc2626');return;}
  document.getElementById('modal-editar-empresa')?.remove();
  showToast('Empresa atualizada!','ti-check','#16a34a');
  renderEmpresas();
}

function updateSbUser(){
  const me = getMe(); if(!me) return;
  const sbAv = document.getElementById('sb-av');
  const tpAv = document.getElementById('tp-av');
  const sbName = document.getElementById('sb-user-name');
  const sbRole = document.getElementById('sb-user-role');
  const foto = safeUrl(me.foto);
  const avatarHtml = foto ? `<img src="${foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : esc((me.nome||'U').charAt(0).toUpperCase());
  if(sbAv) sbAv.innerHTML = avatarHtml;
  if(tpAv) tpAv.innerHTML = avatarHtml;
  if(sbName) sbName.textContent = me.nome;
  if(sbRole) sbRole.textContent = 'Evolux CRM';
}
window.updateSbUser=updateSbUser;
// Expõe funções globais para _loadProfiles poder chamá-las após profiles carregarem
window.renderDashboard=renderDashboard;
window._aplicarFiltroVendas=_aplicarFiltroVendas;
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

let _salvandoConta=false;
async function salvarConfiguracoesConta(){
  if(_salvandoConta)return;
  const nomeEl = document.getElementById('accNome');
  const sobrenomeEl = document.getElementById('accSobrenome');
  const instaEl = document.getElementById('accInstagram');
  const waEl = document.getElementById('accWhatsapp');
  const nome = nomeEl ? nomeEl.value.trim() : '';
  const sobrenome = sobrenomeEl ? sobrenomeEl.value.trim() : '';
  const nomeCompleto = (nome + (sobrenome ? ' ' + sobrenome : '')).trim();
  const fotoImg = document.getElementById('foto-preview-conta')?.querySelector('img');
  const fotoSrc = fotoImg ? fotoImg.getAttribute('src') : '';
  const me = getMe();
  if(!me){showToast('Sessão não identificada. Recarregue a página.','ti-alert-triangle','#dc2626');return;}
  const antes = {nome:me.nome,foto:me.foto,whatsapp:me.whatsapp,instagram:me.instagram};
  if(nomeCompleto) me.nome = nomeCompleto;
  if(fotoSrc) me.foto = fotoSrc;
  if(waEl) me.whatsapp = waEl.value.trim();
  if(instaEl) me.instagram = instaEl.value.trim();
  if(!me.sb_id && window._currentUserId) me.sb_id = window._currentUserId;
  _salvandoConta=true;
  let ok = await window._syncUser(me);
  if(!ok && !window._pendentes.has('perfil')) Object.assign(me,antes);
  // Dados da empresa: só o gestor altera
  if(isGestor(me)){
    const empNomeEl=document.getElementById('empNome');
    const empWaEl=document.getElementById('empWhatsapp');
    const empEmailEl=document.getElementById('empEmail');
    const empAntes={...empresa};
    if(empNomeEl) empresa.nome=empNomeEl.value.trim()||empresa.nome;
    if(empWaEl) empresa.whatsapp=empWaEl.value.trim();
    if(empEmailEl) empresa.email=empEmailEl.value.trim();
    const okEmp = await window._syncEmpresa();
    if(!okEmp){ Object.assign(empresa,empAntes); ok=false; }
  }
  _salvandoConta=false;
  updateSbUser();
  const dashTab = document.getElementById('tab-dashboard');
  if(dashTab && dashTab.classList.contains('active')) renderDashboard();
  if(ok) showToast('Configurações salvas!', 'ti-check');
}

function uploadLogoEmpresa(e){
  const file=e.target.files[0];if(!file)return;
  if(!isGestor()){showToast('Somente o gestor altera a logo da empresa.','ti-lock');return;}
  const r=new FileReader();
  r.onload=ev=>{
    empresa.logo=ev.target.result;
    const prev=document.getElementById('emp-logo-preview');
    const logo=safeUrl(empresa.logo);
    if(prev&&logo)prev.innerHTML=`<img src="${logo}" style="max-width:100%;max-height:100%;object-fit:contain">`;
    window._syncEmpresa().then(ok=>{ if(ok) showToast('Logo da empresa atualizada!','ti-check'); });
  };
  r.readAsDataURL(file);
}



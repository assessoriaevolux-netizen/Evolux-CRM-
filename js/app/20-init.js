// ─── INIT ─────────────────────────────────────────────────────────────────────
function sendPrompt(txt){
  showToast('Recurso de IA disponível na versão com integração Supabase.','ti-sparkles');
}
// Restaurar tema salvo
const savedTheme = localStorage.getItem('evolux-theme');
if(savedTheme==='dark') document.documentElement.setAttribute('data-theme','dark');

// ── Telas de bloqueio (conta sem empresa / empresa suspensa / removido) ─────
async function _sairDoCRM(motivo){
  try{ await window._sb.auth.signOut(); }catch(e){}
  window.location.href='index.html'+(motivo?'?motivo='+encodeURIComponent(motivo):'');
}
function _telaBloqueio(titulo,mensagem){
  const ov=document.createElement('div');
  ov.id='evx-bloqueio';
  ov.style.cssText='position:fixed;inset:0;z-index:100000;background:var(--bg,#f4f6f9);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=`<div style="max-width:440px;width:100%;background:var(--card,#fff);border-radius:16px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,.15);text-align:center">
    <div style="width:56px;height:56px;border-radius:50%;background:rgba(217,119,6,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><i class="ti ti-lock" style="font-size:26px;color:#d97706"></i></div>
    <div style="font-size:18px;font-weight:800;color:var(--tx,#111);margin-bottom:8px"></div>
    <div style="font-size:14px;line-height:1.6;color:var(--tm,#555);margin-bottom:22px;white-space:pre-line"></div>
    <button class="btn bp" style="width:100%;justify-content:center"><i class="ti ti-logout"></i>Sair</button>
  </div>`;
  ov.querySelector('div > div:nth-child(2)').textContent=titulo;
  ov.querySelector('div > div:nth-child(3)').textContent=mensagem;
  ov.querySelector('button').onclick=()=>_sairDoCRM();
  document.body.appendChild(ov);
}

// Renderiza o que está na tela depois de carregar/recarregar os dados
window._renderTudo=function(){
  try{updateSbUser();}catch(e){}
  try{populateSelects();}catch(e){}
  try{renderNotifPanel();}catch(e){}
  const ativa=document.querySelector('.content.active');
  const id=ativa&&ativa.id?ativa.id.replace('tab-',''):'dashboard';
  const r={dashboard:()=>renderDashboard(),funil:()=>renderKanban(),leads:()=>renderTable(),ranking:()=>{_aplicarFiltroVendas();},
    relatorios:()=>renderRelatorios(),lances:()=>renderLances(),minhasvendas:()=>renderMinhasVendas(),simulador:()=>{syncSim();calcSim();},
    whatsapp:()=>renderWhatsapp(),ia:()=>renderIA(),anuncios:()=>renderAnuncios(),calendario:()=>renderCalendario(),configuracoes:()=>renderConfig(),empresas:()=>{try{renderEmpresas();}catch(e){}}};
  try{(r[id]||r.dashboard)();}catch(e){console.warn('[render]',e);}
  try{renderAdminList();}catch(e){}
};

// ── INIT assíncrono: aguarda a sessão e o perfil antes de renderizar ─────────
async function _initCRM(){
  try{ await window._profilesLoadPromise; }catch(e){ console.warn('profilesLoad err:',e); }
  if(!window._session) return; // indo para o login (ou recuperação de senha)
  if(window._isPasswordRecovery&&window._isPasswordRecovery()) return;

  const acesso=window._acesso||null;
  if(acesso&&acesso.ativo===false){ await _sairDoCRM('desativado'); return; }

  window._mergeProfiles(window._pendingProfiles||[]);
  delete window._pendingProfiles;

  // O próprio usuário sempre aparece na lista (mesmo antes de ter empresa)
  let me=users.find(u=>u.sb_id===window._currentUserId);
  if(!me){
    me={id:nextUserId++,sb_id:window._currentUserId,email:window._session.user.email||'',
        nome:acesso?.nome||window._session.user.user_metadata?.nome||(window._session.user.email||'').split('@')[0]||'Usuário',
        role:(acesso?.role||'vendedor'),managerId:null,vendas:0,credito:0,foto:null,meta:0,
        hierarquiaId:null,equipeId:null,empresaId:window._empresaIdDireto||null,ativo:true,perms:{},hperms:{}};
    users.push(me);
  }

  const plataforma=isPlataforma(me);
  if(!window._empresaIdDireto&&!plataforma){
    _telaBloqueio('Conta ainda sem empresa',
      (window._erroConvite?window._erroConvite+'\n\n':'')+
      'Sua conta ainda não está ligada a nenhuma empresa. Peça ao gestor um link de convite novo ou que ele cadastre você em Configurações → Usuários.');
    return;
  }
  if(acesso&&acesso.empresa_ativa===false&&!plataforma){
    _telaBloqueio('Acesso suspenso',`O acesso da empresa ${acesso.empresa_nome||''} está suspenso no momento.\nFale com a Evolux para reativar.`);
    return;
  }

  updateSbUser();
  populateSelects();
  try{if(localStorage.getItem('sb_collapsed')==='1'){const sbEl=document.getElementById('sidebar');const btn=document.getElementById('sb-toggle');if(sbEl)sbEl.classList.add('collapsed');if(btn){btn.style.left='60px';btn.classList.add('collapsed');}}}catch(e){}

  // ── Aba inicial: a última usada, se a pessoa ainda puder ver ──
  let tabInicial='dashboard';
  try{
    const salva=localStorage.getItem('evolux_last_tab');
    if(salva&&document.getElementById('tab-'+salva)) tabInicial=salva;
  }catch(e){}
  if(plataforma&&!window._empresaIdDireto) tabInicial='empresas';
  else if(!podeAba(tabInicial,me)) tabInicial=primeiraAbaPermitida();
  document.querySelectorAll('.content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+tabInicial)?.classList.add('active');
  document.querySelector(`.nb[onclick*="'${tabInicial}'"]`)?.classList.add('active');

  try{applyNavPermissions();}catch(e){}
  try{syncSim();}catch(e){}
  if(window._loadAllData) await window._loadAllData();
  try{applyNavPermissions();}catch(e){}
  window._renderTudo();
  window.__crmPronto=true;

  // Se voltou do OAuth do Google Calendar, mostra mensagem de sucesso agora que o CRM está pronto
  if(window._gcalJustConnected){
    const pendingTab=window._gcalJustConnected.tab||'calendario';
    delete window._gcalJustConnected;
    setTimeout(()=>{
      showToast('Google Calendar conectado com sucesso! ✅','ti-circle-check');
      if(typeof renderGcalPanel==='function') renderGcalPanel();
      if(typeof showTab==='function'&&podeAba(pendingTab)) showTab(pendingTab);
      if(typeof cfgRenderSection==='function') cfgRenderSection();
    },300);
  }
}
// _initCRM() é chamado em 99-inicio.js, depois que todos os arquivos carregaram

// bindHierModal movido para após o modal HTML no final do arquivo


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

// ── Plano suspenso: o CRM abre só para consulta ──────────────────────────────
// A pessoa entra e vê os dados, mas um aviso fica fixo no topo e qualquer ação que
// grava (novo lead, mover no funil, salvar, excluir…) é barrada aqui e no banco.
window._planoSuspenso=false;
function _ajustarAlturaSuspenso(){
  const b=document.getElementById('evx-suspenso');
  if(b) document.documentElement.style.setProperty('--susp-h',b.offsetHeight+'px');
}
function _aplicarModoSuspenso(on,nomeEmpresa){
  window._planoSuspenso=!!on;
  document.documentElement.classList.toggle('crm-suspenso',!!on);
  let b=document.getElementById('evx-suspenso');
  if(!on){ if(b) b.remove(); document.documentElement.style.removeProperty('--susp-h'); return; }
  if(!b){
    b=document.createElement('div');
    b.id='evx-suspenso';
    b.setAttribute('role','alert');
    b.innerHTML='<i class="ti ti-lock"></i><div><strong>Plano suspenso.</strong> <span></span></div><button type="button"><i class="ti ti-logout"></i>Sair</button>';
    b.querySelector('button').addEventListener('click',()=>_sairDoCRM());
    document.body.prepend(b);
    window.addEventListener('resize',_ajustarAlturaSuspenso);
  }
  b.querySelector('span').textContent=`O CRM ${nomeEmpresa?'da '+nomeEmpresa+' ':''}está liberado só para consulta: dá para ver os dados, mas nada pode ser criado, alterado ou excluído. Fale com a Evolux para reativar o plano.`;
  _ajustarAlturaSuspenso();
}
let _avisoSuspensoEm=0;
function _avisoSuspenso(){
  if(Date.now()-_avisoSuspensoEm<2500) return;
  _avisoSuspensoEm=Date.now();
  showToast('Plano suspenso: o CRM está liberado só para consulta. Fale com a Evolux para reativar.','ti-lock','#dc2626');
}
// Ações que só mostram ou calculam (continuam liberadas com o plano suspenso)
const _SUSP_LIVRE=/^(showTab|cfgShow|openLeadDetalhe|closeLeadDetalhe|closeModal|close\w*|fechar\w*|cancelar\w*|set\w*Periodo|setRankView|setTV\w*|openTV|toggleTVTheme|\w*VerMais|tableIrPagina|toggleFunilFiltros|limparFiltrosFunil|calNav|calToday|calSelectDay|calEditEvento|calCancelarEdicao|rankCal\w*|toggleNotifPanel|readNotif|markAllRead|toggleSidebar|fazerLogout|toggleDarkMode|mv\w*|renderMinhasVendas|IND\.|ind(Render|AbrirLead|Copiar\w*|EnviarWa|FecharModal)|calcSim|sim\w*|syncSim|gerar\w*PDF|gerarPdf\w*|openProtocolo\w*|exportarLeadsCSV|downloadRelatorio|selectAdmin|copiar\w*|document\.getElementById\(['"][\w-]+['"]\)\??\.remove\(\))/;
function _suspPermitido(el){
  if(el.closest('#evx-suspenso,#sidebar,.topbar,.cfg-nav,#cfg-nav,#notif-panel')) return true;
  const oc=(el.getAttribute('onclick')||'').replace(/^\s*(event\.(stopPropagation|preventDefault)\(\);?\s*)+/,'').trim();
  if(oc) return _SUSP_LIVRE.test(oc);
  if(el.matches('.modal-close,.bcn,._conf_cancel,.periodo-tab,.periodo-tab-funil,.rv-tab,.ind-tab,.tv-mtab,.tv-ftab,.tv-etab,.hier-card,.dl-row,#evx-bloqueio button')) return true;
  if(el.querySelector&&el.querySelector('input[onchange*="toggleDarkMode"]')) return true;
  return /^(cancelar|fechar|voltar|concluir|ok)$/i.test((el.textContent||'').trim());
}
window.addEventListener('click',function(e){
  if(!window._planoSuspenso) return;
  const el=e.target&&e.target.closest&&e.target.closest('button,[onclick],a,label,input[type=checkbox],input[type=radio],input[type=file]');
  if(!el||_suspPermitido(el)) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  _avisoSuspenso();
},true);
window.addEventListener('dragstart',function(e){
  if(!window._planoSuspenso) return;
  e.preventDefault(); e.stopPropagation();
  _avisoSuspenso();
},true);

// Confere de tempos em tempos se o acesso mudou (plano suspenso/reativado,
// pessoa removida) — sem precisar recarregar a página
let _conferindoAcesso=false;
async function _conferirAcesso(){
  if(_conferindoAcesso||!window._session||!window.__crmPronto) return;
  _conferindoAcesso=true;
  try{
    const a=await window._carregarAcesso();
    if(!a||a._legado) return;
    window._acesso=a;
    if(a.ativo===false){ await _sairDoCRM('desativado'); return; }
    // plano mudou (ex.: Pro → Master)? libera ou esconde IA e Indicador na hora
    const planoAntes=window.empresa&&window.empresa.plano;
    await window._loadEmpresa();
    if(window.empresa&&window.empresa.plano!==planoAntes){ try{applyNavPermissions();window._renderTudo();}catch(e){} }
    if(isPlataforma(getMe())) return;
    const susp=a.empresa_ativa===false;
    if(susp!==window._planoSuspenso){
      _aplicarModoSuspenso(susp,a.empresa_nome);
      showToast(susp?'O plano da empresa foi suspenso. O CRM agora está liberado só para consulta.':'Plano reativado! Tudo liberado de novo.',
        susp?'ti-lock':'ti-lock-open',susp?'#dc2626':'#16a34a');
    }
  }catch(e){ console.warn('[acesso]',e); }
  finally{ _conferindoAcesso=false; }
}
window._conferirAcesso=_conferirAcesso;
setInterval(_conferirAcesso,60000);
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') _conferirAcesso(); });

// Renderiza o que está na tela depois de carregar/recarregar os dados
window._renderTudo=function(){
  try{updateSbUser();}catch(e){}
  try{populateSelects();}catch(e){}
  try{renderNotifPanel();}catch(e){}
  const ativa=document.querySelector('.content.active');
  const id=ativa&&ativa.id?ativa.id.replace('tab-',''):'dashboard';
  const r={dashboard:()=>renderDashboard(),funil:()=>renderKanban(),leads:()=>renderTable(),ranking:()=>{_aplicarFiltroVendas();},
    indicador:()=>renderIndicador(),
    token:()=>renderToken(),
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
  // Plano suspenso: abre normalmente, mas só para consulta (aviso fixo no topo)
  if(acesso&&acesso.empresa_ativa===false&&!plataforma) _aplicarModoSuspenso(true,acesso.empresa_nome);

  updateSbUser();
  populateSelects();
  // No celular a barra lateral começa recolhida (só ícones) para sobrar espaço
  try{if(localStorage.getItem('sb_collapsed')==='1'||window.innerWidth<=640){const sbEl=document.getElementById('sidebar');const btn=document.getElementById('sb-toggle');if(sbEl)sbEl.classList.add('collapsed');if(btn){btn.style.left='60px';btn.classList.add('collapsed');}}}catch(e){}

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


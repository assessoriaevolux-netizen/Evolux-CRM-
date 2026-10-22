// ─── TOAST CENTRAL ────────────────────────────────────────────────────────────
function showToast(msg, icon='ti-check', cor='#1db954'){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:24px;right:24px;background:'+cor+';color:#fff;padding:12px 20px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;max-width:340px;animation:fadeInUp .25s ease';
  t.innerHTML='<i class="ti '+icon+'" style="font-size:16px;flex-shrink:0"></i><span>'+msg+'</span>';
  document.body.appendChild(t);
  setTimeout(()=>{t.style.transition='opacity .4s';t.style.opacity='0';setTimeout(()=>t.remove(),400);},3000);
}

// ── Modal de confirmação visual (substitui confirm() nativo) ──────────────────
function showConfirm(msg, onOk, onCancel){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease';
  overlay.innerHTML=`
    <div style="background:var(--card,#1a1a2e);border-radius:14px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.4);text-align:center">
      <div style="width:48px;height:48px;border-radius:50%;background:rgba(220,53,69,.15);display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
        <i class="ti ti-alert-triangle" style="font-size:22px;color:#dc3545"></i>
      </div>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:var(--fg,#e0e0e0)">${msg}</p>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="_conf_cancel" style="padding:10px 24px;border:1.5px solid var(--bord,#333);background:transparent;color:var(--fg,#e0e0e0);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="_conf_ok" style="padding:10px 24px;border:none;background:#dc3545;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  function fechar(){overlay.style.opacity='0';overlay.style.transition='opacity .15s';setTimeout(()=>overlay.remove(),150);}
  overlay.querySelector('#_conf_ok').onclick=()=>{fechar();if(onOk)onOk();};
  overlay.querySelector('#_conf_cancel').onclick=()=>{fechar();if(onCancel)onCancel();};
  overlay.addEventListener('click',e=>{if(e.target===overlay){fechar();if(onCancel)onCancel();}});
}

// ─── INTEGRAÇÕES: estado e ações ──────────────────────────────────────────────
const integState={meta:false,whatsapp:false,google:false};

function integConectar(tipo){
  const msgs={
    meta:{icon:'ti-brand-facebook',ok:'Configuração Meta salva — conecte o webhook no Meta for Developers para ativar.'},
    whatsapp:{icon:'ti-brand-whatsapp',ok:'Configuração WhatsApp salva — ative o webhook no Meta Business para receber mensagens.'},
    google:{icon:'ti-brand-google',ok:'Google Agenda — conecte via OAuth após o deploy no Vercel para sincronizar reuniões.'},
    senha:{icon:'ti-lock',ok:'Senha atualizada com sucesso! (ativo após integração com Supabase Auth)'},
    stripe:{icon:'ti-receipt',ok:'Histórico de faturas disponível após integração com Stripe no deploy.'},
  };
  const m=msgs[tipo]||{icon:'ti-plug',ok:'Configuração salva!'};
  // Valida campos obrigatórios por tipo
  if(tipo==='meta'){
    const tok=document.querySelector('#cfg-main-panel input[placeholder="EAAxxxxx..."]');
    if(tok&&!tok.value.trim()){showToast('Informe o Token de acesso antes de conectar.','ti-alert-triangle','#d97706');return;}
  }
  if(tipo==='whatsapp'){
    const tok=document.querySelector('#cfg-main-panel input[placeholder="Bearer EAAxxxxx..."]');
    if(tok&&!tok.value.trim()){showToast('Informe o Token da API WhatsApp antes de salvar.','ti-alert-triangle','#d97706');return;}
  }
  if(tipo==='senha'){
    const nova=document.querySelectorAll('#cfg-main-panel input[type="password"]');
    if(nova.length>=2&&nova[1].value&&nova[1].value!==nova[2]?.value){showToast('As senhas não conferem.','ti-alert-triangle','#dc2626');return;}
  }
  integState[tipo]=true;
  showToast(m.ok, m.icon);
}

// ─── GOOGLE CALENDAR OAUTH ───────────────────────────────────────────────────
window._gcalToken=null;
// Client ID padrão do projeto Evolux
const GCAL_CLIENT_ID='646017395786-ihp6roomh1bbceoi68rd4r9qa2vlae0t.apps.googleusercontent.com';
// Pré-preencher client_id se ainda não salvo
(function(){try{if(!localStorage.getItem('evolux_gcal_client_id'))localStorage.setItem('evolux_gcal_client_id',GCAL_CLIENT_ID);}catch(e){}})();

// Verificar se voltou com token no hash (fluxo implícito OAuth)
(function(){
  try{
    const h=window.location.hash;
    if(h&&h.includes('access_token=')){
      const params=new URLSearchParams(h.slice(1));
      const tok=params.get('access_token');
      const expiresIn=parseInt(params.get('expires_in')||'3600');
      if(tok){
        window._gcalToken=tok;
        const expiry=Date.now()+(expiresIn*1000);
        try{
          localStorage.setItem('evolux_gcal_token',tok);
          localStorage.setItem('evolux_gcal_token_expiry',expiry.toString());
        }catch(e){}
        history.replaceState(null,'',window.location.pathname+window.location.search);
        // Após OAuth, volta para a aba que estava
        const returnTab=localStorage.getItem('evolux_gcal_return_tab')||'calendar';
        try{localStorage.removeItem('evolux_gcal_return_tab');}catch(e){}
        // Guarda flag para _initCRM executar após a inicialização completa
        window._gcalJustConnected={tab:returnTab};
      }
    } else {
      // Verifica token salvo e se ainda não expirou
      const saved=localStorage.getItem('evolux_gcal_token');
      const expiry=parseInt(localStorage.getItem('evolux_gcal_token_expiry')||'0');
      if(saved && (!expiry || Date.now()<expiry)){
        window._gcalToken=saved;
      } else if(saved){
        // Token expirado — limpar
        try{localStorage.removeItem('evolux_gcal_token');localStorage.removeItem('evolux_gcal_token_expiry');}catch(e){}
      }
    }
  }catch(e){}
})();
function gcalIniciarOAuth(){
  // Usa Client ID fixo do projeto Evolux, ou o salvo nas configurações
  const CLIENT_ID_PADRAO='646017395786-ihp6roomh1bbceoi68rd4r9qa2vlae0t.apps.googleusercontent.com';
  const clientId=(document.getElementById('gcal-client-id')||{}).value
    || localStorage.getItem('evolux_gcal_client_id')
    || CLIENT_ID_PADRAO;
  // Salva para uso futuro
  try{localStorage.setItem('evolux_gcal_client_id', clientId);}catch(e){}
  const redirectUri=window.location.origin+window.location.pathname;
  // Salva aba atual para voltar após OAuth
  try{localStorage.setItem('evolux_gcal_return_tab', localStorage.getItem('evolux_last_tab')||'calendar');}catch(e){}
  const scope=encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly');
  const url=`https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&prompt=consent&include_granted_scopes=true`;
  // Redireciona a janela principal (o token volta no hash após autenticação)
  window.location.href=url;
}
function renderGcalPanel(){
  const el=document.getElementById('gcal-panel-inner');
  if(!el)return;
  if(window._gcalToken){
    el.innerHTML=`<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:rgba(1,122,69,.08);border:1px solid rgba(1,122,69,.2);margin-bottom:10px">
      <i class="ti ti-circle-check" style="color:var(--g);font-size:16px"></i>
      <div style="flex:1;font-size:12px;font-weight:600;color:var(--tx)">Conectado ao Google Calendar</div>
      <button class="btn bd bsm" onclick="gcalDesconectar()" style="font-size:11px;padding:3px 8px"><i class="ti ti-unlink"></i></button>
    </div>
    <div style="font-size:11.5px;color:var(--tm)">Reuniões agendadas aqui serão criadas automaticamente no seu Google Calendar.</div>`;
  } else {
    el.innerHTML=`<p style="font-size:12.5px;color:var(--tm);margin:0 0 10px">Conecte para sincronizar reuniões automaticamente com seu Google Calendar.</p>
    <button class="gcal-btn" onclick="gcalIniciarOAuth()" style="width:100%;justify-content:center">
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Conectar com Google
    </button>`;
  }
}
function gcalDesconectar(){
  window._gcalToken=null;
  try{
    localStorage.removeItem('evolux_gcal_token');
    localStorage.removeItem('evolux_gcal_token_expiry');
  }catch(e){}
  showToast('Google Calendar desconectado.','ti-unlink');
  renderGcalPanel();
  cfgRenderSection();
}

// Cria evento no Google Calendar via API REST (requer token OAuth)
async function gcalCriarEvento(titulo,descricao,dataHoraInicio,duracaoMin){
  if(!window._gcalToken){showToast('Conecte o Google Calendar primeiro nas Configurações.','ti-brand-google');return false;}
  const inicio=new Date(dataHoraInicio).toISOString();
  const fim=new Date(new Date(dataHoraInicio).getTime()+(duracaoMin||60)*60000).toISOString();
  try{
    const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{
      method:'POST',
      headers:{'Authorization':'Bearer '+window._gcalToken,'Content-Type':'application/json'},
      body:JSON.stringify({summary:titulo,description:descricao||'',start:{dateTime:inicio,timeZone:'America/Sao_Paulo'},end:{dateTime:fim,timeZone:'America/Sao_Paulo'}})
    });
    if(res.status===401){
      // Token expirado — limpar e pedir novo login
      window._gcalToken=null;try{localStorage.removeItem('evolux_gcal_token');}catch(e){}
      showToast('Token do Google expirado. Reconecte o Google Calendar nas Configurações.','ti-alert-triangle');
      return false;
    }
    if(!res.ok){const e=await res.json();showToast('Erro ao criar evento: '+(e.error?.message||res.status),'ti-alert-triangle');return false;}
    showToast('Evento criado no Google Calendar!','ti-calendar-check');
    return true;
  }catch(e){showToast('Falha ao conectar ao Google Calendar: '+e.message,'ti-alert-triangle');return false;}
}


// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const ETAPAS=['Novo lead','Primeiro contato','Aguardando resposta','Proposta enviada','Negociação','Fechado / Convertido','Perdido'];
// Labels visuais das etapas (mesmo índice que ETAPAS) — não altera as chaves do banco
const ETAPAS_LABEL={'Negociação':'Negociação/Agendamento'};
const EC=['#1a6e3c','#c8870a','#5b3db0','#1e3a6e','#a06010','#22954f','#c0392b'];
const ES=['s0','s1','s2','s3','s4','s5','s6'];
const TMAP={Imóvel:'ti',Automóvel:'ta',Moto:'tm3','Serviço':'ts3'};
const TC={Imóvel:'#1a6e3c',Automóvel:'#1e3a6e',Moto:'#b8720a','Serviço':'#5b3db0'};
const OC={'Meta Ads':'#1a6e3c',Indicação:'#1e3a6e',Orgânico:'#5b3db0'};
// RL e RC são agora funções dinâmicas — consultam hierarquias em tempo real
// Mantemos o objeto legado como fallback para compatibilidade com código existente
const RL_STATIC={gestor:'Gestor',representante:'Representante',supervisor:'Supervisor',vendedor:'Vendedor'};
const RC_STATIC={gestor:'rg',representante:'rr',supervisor:'rs',vendedor:'rv'};
// RL[x] ainda funciona via Proxy — retorna nome da hierarquia pelo slug ou role
const RL=new Proxy(RL_STATIC,{get(t,k){
  if(typeof k!=='string')return t[k];
  // primeiro tenta achar nos slugs das hierarquias dinâmicas
  const h=hierarquias&&hierarquias.find(x=>x.slug===k||x.nome.toLowerCase()===k.toLowerCase());
  if(h)return h.nome;
  return t[k]||k;
}});
const RC=new Proxy(RC_STATIC,{get(t,k){
  if(typeof k!=='string')return t[k];
  return t[k]||'rv';
}});
// Helper: label e classe CSS de hierarquia para um user
function getHierLabel(u){
  if(u.hierarquiaId){const h=hierarquias&&hierarquias.find(x=>x.sb_id===u.hierarquiaId||x.id===u.hierarquiaId);if(h)return h.nome;}
  return RL_STATIC[u.role]||u.role||'—';
}
function getHierClass(u){return RC_STATIC[u.role]||'rv';}
const PDEFS={leads:'Leads',funil:'Funil',simulador:'Sim.',modelos:'Modelos',lances:'Lances',ranking:'Ranking',relatorios:'Rel.',config:'Config.'};
const DPERMS={
  gestor:{leads:true,funil:true,simulador:true,modelos:true,lances:true,ranking:true,relatorios:true,config:true},
  supervisor:{leads:true,funil:true,simulador:true,modelos:false,lances:true,ranking:true,relatorios:false,config:true},
  representante:{leads:true,funil:true,simulador:true,modelos:true,lances:true,ranking:true,relatorios:true,config:false},
  vendedor:{leads:true,funil:true,simulador:true,modelos:false,lances:true,ranking:true,relatorios:false,config:false}
};

// ─── HIERARQUIAS (cargos) ─────────────────────────────────────────────────────
// Módulos e permissões disponíveis
const HPERM_MODULES=[
  {id:'dashboard',label:'Dashboard',perms:[
    {id:'dashboard_view',label:'Visualizar dashboard'},
  ]},
  {id:'leads',label:'Leads',perms:[
    {id:'leads_view',label:'Visualizar leads'},
    {id:'leads_create',label:'Criar leads'},
    {id:'leads_edit',label:'Editar leads'},
    {id:'leads_delete',label:'Excluir leads'},
  ]},
  {id:'funil',label:'Funil de Vendas',perms:[
    {id:'funil_view',label:'Visualizar funil'},
    {id:'funil_move',label:'Mover leads no funil'},
  ]},
  {id:'vendas',label:'Vendas',perms:[
    {id:'vendas_view',label:'Visualizar vendas'},
    {id:'vendas_create',label:'Registrar venda'},
    {id:'vendas_edit',label:'Editar venda'},
    {id:'vendas_delete',label:'Excluir venda'},
  ]},
  {id:'equipe',label:'Equipe',perms:[
    {id:'equipe_view',label:'Visualizar equipe'},
    {id:'equipe_view_sellers',label:'Visualizar vendedores'},
    {id:'equipe_add',label:'Adicionar vendedores'},
    {id:'equipe_edit',label:'Editar vendedores'},
    {id:'equipe_remove',label:'Remover vendedores'},
  ]},
  {id:'ranking',label:'Ranking',perms:[
    {id:'ranking_view',label:'Visualizar ranking'},
    {id:'ranking_team',label:'Visualizar ranking da própria equipe'},
    {id:'ranking_all',label:'Visualizar ranking geral'},
  ]},
  {id:'relatorios',label:'Relatórios',perms:[
    {id:'relatorios_view',label:'Visualizar relatórios'},
    {id:'relatorios_generate',label:'Gerar relatórios'},
    {id:'relatorios_export',label:'Exportar relatórios'},
  ]},
  {id:'simulador',label:'Simulador',perms:[
    {id:'simulador_view',label:'Usar simulador'},
    {id:'simulador_models',label:'Gerenciar modelos'},
  ]},
  {id:'lances',label:'Lances',perms:[
    {id:'lances_view',label:'Visualizar lances'},
    {id:'lances_create',label:'Registrar lances'},
    {id:'lances_edit',label:'Editar lances'},
  ]},
  {id:'config',label:'Configurações',perms:[
    {id:'config_view',label:'Acessar configurações'},
    {id:'config_users',label:'Gerenciar usuários'},
    {id:'config_teams',label:'Gerenciar equipes'},
    {id:'config_hierarchy',label:'Gerenciar hierarquias'},
    {id:'config_permissions',label:'Gerenciar permissões'},
  ]},
  {id:'notificacoes',label:'Notificações',perms:[
    {id:'notif_view',label:'Visualizar notificações'},
    {id:'notif_team',label:'Visualizar notificações da equipe'},
    {id:'notif_manage',label:'Gerenciar notificações'},
  ]},
];

// Helper: all perm ids flat
function allHPermIds(){return HPERM_MODULES.flatMap(m=>m.perms.map(p=>p.id));}

// Default permissions per cargo slug
const HPERM_DEFAULTS={
  gestor: Object.fromEntries(allHPermIds().map(id=>[id,true])),
  representante: Object.fromEntries(allHPermIds().map(id=>[id,false])),
  supervisor: Object.fromEntries(allHPermIds().map(id=>[id,false])),
  vendedor: Object.fromEntries(allHPermIds().map(id=>[id,false])),
};

// Hierarquias (cargos configuráveis)
let hierarquias=[
  {id:1,slug:'gestor',nome:'Gestor',descricao:'Administrador da operação',ordem:1,superiorId:null,status:'ativa',
   perms:{...HPERM_DEFAULTS.gestor}},
  {id:2,slug:'representante',nome:'Representante',descricao:'Responsável pela operação comercial',ordem:2,superiorId:1,status:'ativa',
   perms:{...HPERM_DEFAULTS.representante}},
  {id:3,slug:'supervisor',nome:'Supervisor',descricao:'Responsável pela equipe',ordem:3,superiorId:2,status:'ativa',
   perms:{...HPERM_DEFAULTS.supervisor}},
  {id:4,slug:'vendedor',nome:'Vendedor',descricao:'Responsável pelas vendas',ordem:4,superiorId:3,status:'ativa',
   perms:{...HPERM_DEFAULTS.vendedor}},
];
window.hierarquias = hierarquias; // mesma referência
let nextHierArquiaId=5;

function getHier(id){return hierarquias.find(h=>h.id===id||h.sb_id===id);}
function getHierBySlug(slug){return hierarquias.find(h=>h.slug===slug);}
// Mapeia slug/ordem de hierarquia para role do sistema, suportando slugs customizados
function slugToRole(h){
  if(!h) return 'vendedor';
  const s=(h.slug||'').toLowerCase();
  if(s==='gestor'||s.includes('gestor')||s.includes('diretor')||s.includes('master')) return 'gestor';
  if(s==='supervisor'||s.includes('supervisor')||s.includes('coordenador')) return 'supervisor';
  if(s==='representante'||s.includes('representante')||s.includes('consultor')) return 'representante';
  // Fallback por ordem: menor ordem = maior cargo
  const ord=h.ordem||99;
  if(ord===1) return 'gestor';
  if(ord===2) return 'supervisor';
  if(ord===3) return 'representante';
  return 'vendedor';
}
window.slugToRole=slugToRole; // expõe para _ensureMeHperms (definida antes)
function hierUsersCount(hId){const h=getHier(hId);if(!h)return 0;return users.filter(u=>u.hierarquiaId===h.sb_id||u.hierarquiaId===h.id).length;}
function hierPermCount(h){return h.perms?Object.values(h.perms).filter(Boolean).length:0;}
function hierAtivas(){return hierarquias.filter(h=>h.status==='ativa').sort((a,b)=>a.ordem-b.ordem);}
function applyHierToUser(u){
  const h=u.hierarquiaId?getHier(u.hierarquiaId):null;
  if(h&&h.perms) u.hperms={...h.perms};
}
function applyHierToAll(hId){
  const h=getHier(hId);if(!h)return;
  users.filter(u=>u.hierarquiaId===h.sb_id||u.hierarquiaId===h.id).forEach(u=>{
    u.hperms={...h.perms};
    if(window._syncUser) window._syncUser(u).catch(e=>console.warn('[applyHierToAll]',e));
  });
  try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
}

// ─── ESTADO ───────────────────────────────────────────────────────────────────
// Estrutura nova: cada administradora tem grupos com crédito, prazo, vagas
let empresa={nome:'Minha Empresa',logo:null,whatsapp:'',email:''};
window.empresa = empresa;
let administradoras=[];
window.administradoras = administradoras;
let taxaFin=2.42,nextAdminId=1;
window.nextAdminId = nextAdminId;
function getAdmin(){return administradoras.find(a=>a.ativa)||administradoras[0]||null;}

let users=[
  // Array começa vazio — todos os usuários vêm do Supabase via _initCRM
  // O usuário logado é identificado por window._currentUserId após auth
];
window.users = users; // mesma referência — window.users === users
let nextUserId=2;
window.nextUserId = nextUserId;
let equipes=[];
window.equipes = equipes;
let nextEquipeId=1;
window.nextEquipeId = nextEquipeId;
let rankView='loja';

let leads=[];
window.leads = leads; // mesma referência — window.leads === leads
let nextLeadId=1;
window.nextLeadId = nextLeadId;

let activities=[];

let lances=[];
window.lances = lances; // mesma referência — window.lances === lances
let nextLanceId=1;
window.nextLanceId = nextLanceId;
let dragId=null;
let waNumbers=[];
let waSelected=new Set();
let nextWaId=1;
let rankPeriodo='mes';
let relPeriodo='mes';
let distribMode=false;
let selectedLeads=new Set();

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────
function fmt(n){return Math.round(n).toLocaleString('pt-BR');}
function fmtR(n){return 'R$ '+fmt(n);}
function fmtMetaInput(el){
  let v=el.value.replace(/[^\d]/g,'');
  if(!v){el.value='';return;}
  const n=parseInt(v,10)/100;
  el.value=n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function fmtMetaVal(v){
  if(!v||v===0)return '';
  return (v/1).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function maskM(el){
  let v=el.value.replace(/\D/g,'');
  if(!v){el.value='';return;}
  // Insere ponto a cada 3 dígitos da direita durante a digitação
  el.value=v.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function unM(v){return parseFloat((v||'0').toString().replace(/\./g,'').replace(',','.'))||0;}
function maskMeta(el){maskM(el);}
function toDate(){const d=new Date();return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
function getAdminById(id){return administradoras.find(a=>a.id===id)||null;}
function mesAtual(){const m=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];const d=new Date();return `${m[d.getMonth()]} ${d.getFullYear()}`;}

// ─── SIDEBAR TOGGLE ───────────────────────────────────────────────────────────
// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
// Usa sb_id da atividade como chave — índice muda quando chega nova notificação
let notifRead=new Set();

function _notifKey(act){ return act.sb_id||act.text; }

function getNotifIconClass(icon){
  if(icon==='ti-trophy') return 'ni-trophy';
  if(icon==='ti-circle-check') return 'ni-check';
  if(icon==='ti-user-plus') return 'ni-user';
  if(icon==='ti-x') return 'ni-x';
  if(icon==='ti-brand-whatsapp') return 'ni-wa';
  return '';
}

function renderNotifPanel(){
  const list=document.getElementById('notif-list');
  const dot=document.getElementById('bell-dot');
  if(!list) return;
  const items=[...(window.activities||activities||[])].slice(0,20);
  const unreadCount=items.filter(act=>!notifRead.has(_notifKey(act))).length;
  if(dot) dot.style.display=unreadCount>0?'block':'none';
  if(items.length===0){
    list.innerHTML='<div class="notif-empty"><i class="ti ti-bell-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.35"></i>Nenhuma notificação</div>';
    return;
  }
  list.innerHTML=items.map((act)=>{
    const key=_notifKey(act);
    const read=notifRead.has(key);
    const cls=getNotifIconClass(act.icon);
    return `<div class="notif-item${read?'':' unread'}" onclick="readNotif('${key.toString().replace(/'/g,'\\')}')">
      <div class="notif-icon ${cls}"><i class="ti ${act.icon}"></i></div>
      <div class="notif-body">
        <div class="notif-text">${act.text}</div>
        <div class="notif-time">${act.time}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── BUSCA GLOBAL ─────────────────────────────────────────────────────────────
function globalSearch(q){
  if(!q||q.trim().length<2){
    // clear any highlight, just re-render current tab
    return;
  }
  q=q.trim().toLowerCase();
  // Switch to leads tab and filter
  const leadsBtn=document.querySelector('.nb[onclick*="leads"]');
  showTab('leads',leadsBtn);
  // Set the leads search field
  const srch=document.getElementById('srch');
  if(srch){srch.value=q;renderTable();}
}

function toggleNotifPanel(){
  const panel=document.getElementById('notif-panel');
  if(!panel) return;
  const isOpen=panel.classList.contains('open');
  // close any other open panels
  document.querySelectorAll('.notif-panel.open').forEach(p=>p.classList.remove('open'));
  if(!isOpen){
    renderNotifPanel();
    panel.classList.add('open');
  }
}

function readNotif(key){
  notifRead.add(key);
  renderNotifPanel();
}

function markAllRead(){
  const items=[...(window.activities||activities||[])].slice(0,20);
  items.forEach(act=>notifRead.add(_notifKey(act)));
  renderNotifPanel();
  const panel=document.getElementById('notif-panel');
  if(panel) panel.classList.remove('open');
}

// Close notif panel when clicking outside
document.addEventListener('click',function(e){
  const wrap=document.querySelector('.tp-bell-wrap');
  if(wrap&&!wrap.contains(e.target)){
    const panel=document.getElementById('notif-panel');
    if(panel) panel.classList.remove('open');
  }
});

function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const btn=document.getElementById('sb-toggle');
  const collapsed=sb.classList.toggle('collapsed');
  btn.style.left=collapsed?'60px':'210px';
  btn.classList.toggle('collapsed',collapsed);
  try{localStorage.setItem('sb_collapsed',collapsed?'1':'0');}catch(e){}
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
// Mapa: tab id → chave em DPERMS (null = sempre acessível)
const TAB_PERM_MAP={dashboard:null,funil:'funil',leads:'leads',simulador:'simulador',lances:'lances',ranking:'ranking',relatorios:'relatorios',whatsapp:'whatsapp',calendario:'calendario',configuracoes:'config',empresas:null};
function _getMeRole(){
  // FIX bug#1: nunca usa users[0] como fallback — retorna null se não identificado
  return getMe()||null;
}
// Mapa: chave do TAB_PERM_MAP → chave de hperms (permissão mínima para acessar a aba)
const TAB_TO_HPERM={
  leads:'leads_view', funil:'funil_view', simulador:'simulador_view',
  lances:'lances_view', ranking:'ranking_view', relatorios:'relatorios_view',
  whatsapp:'whatsapp_view', calendario:'agenda_view', config:'config_view'
};
function _hasTabPerm(me,permKey){
  if(!permKey) return true;
  if(!me) return false;
  // master/gestor/superadmin sempre têm acesso total
  if(me.role==='master'||me.role==='gestor'||me.role==='superadmin') return true;
  // Configurações: todo usuário autenticado pode acessar (para editar próprio perfil/foto/senha)
  if(permKey==='config') return true;
  // Traduz a chave de aba para a chave granular de hperms
  const hpermKey=TAB_TO_HPERM[permKey]||permKey;
  // Chave simples do DPERMS (ex: 'leads', 'funil') — para compatibilidade
  const dpermsKey=permKey;
  // 1. Se hperms (da hierarquia) tem a chave explícita → usa ela como verdade
  if(me.hperms&&typeof me.hperms[hpermKey]==='boolean') return me.hperms[hpermKey];
  // 2. Fallback para perms (DPERMS por role)
  if(me.perms&&typeof me.perms[dpermsKey]==='boolean') return me.perms[dpermsKey];
  // 3. Sem permissão definida → supervisor pode, vendedor não pode
  if(me.role==='supervisor'||me.role==='representante') return true;
  return false;
}
function showTab(id,btn){
  const me=_getMeRole();
  const permKey=TAB_PERM_MAP[id];
  if(!_hasTabPerm(me,permKey)){
    showToast('Você não tem permissão para acessar esta aba.','ti-lock');
    return;
  }
  document.querySelectorAll('.content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  if(btn) btn.classList.add('active');
  // Persiste aba ativa para restaurar após reload
  try{localStorage.setItem('evolux_last_tab',id);}catch(e){}
  ({dashboard:renderDashboard,funil:renderKanban,leads:renderTable,simulador:()=>{syncSim();calcSim();},lances:renderLances,minhasvendas:()=>renderMinhasVendas(),ranking:()=>{_rankVendasCache={periodo:null,data:null,resultado:null};_aplicarFiltroVendas();},relatorios:renderRelatorios,whatsapp:renderWhatsapp,calendario:renderCalendario,configuracoes:renderConfig,empresas:()=>{try{renderEmpresas();}catch(e){}}})[id]?.();
}
// Oculta/mostra botões do nav de acordo com permissões do usuário logado
function applyNavPermissions(){
  // Mostra itens exclusivos do superadmin
  // Checa getMe() OU role direto da sessão (caso master sem empresa ainda carregada)
  const _meRole=getMe()?.role||window._session?.user?.user_metadata?.role||'';
  const isSuperAdmin=_meRole==='superadmin'||_meRole==='master';
  document.querySelectorAll('.sb-superadmin-only').forEach(el=>{el.style.display=isSuperAdmin?'':'none';});
  const me=_getMeRole();
  if(!me) return;
  Object.entries(TAB_PERM_MAP).forEach(([tabId,permKey])=>{
    if(!permKey) return; // sempre visível
    const navBtn=document.querySelector(`.nb[onclick*="'${tabId}'"]`);
    if(!navBtn) return;
    const allowed=_hasTabPerm(me,permKey);
    navBtn.style.display=allowed?'':'none';
  });
}


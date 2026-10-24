// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const ETAPAS=['Novo lead','Primeiro contato','Aguardando resposta','Proposta enviada','Negociação','Fechado / Convertido','Perdido'];
// Labels visuais das etapas (mesmo índice que ETAPAS) — não altera as chaves do banco.
// Cada empresa pode renomear as etapas (Editar funil); o nome fica salvo em empresas.etapas_labels.
const ETAPAS_LABEL={'Negociação':'Negociação/Agendamento'};
const ETAPAS_LABEL_PADRAO={...ETAPAS_LABEL};
function aplicarEtapasLabels(obj){
  Object.keys(ETAPAS_LABEL).forEach(k=>delete ETAPAS_LABEL[k]);
  Object.assign(ETAPAS_LABEL,ETAPAS_LABEL_PADRAO);
  if(obj&&typeof obj==='object'){
    ETAPAS.forEach(e=>{const v=obj[e];if(typeof v==='string'&&v.trim())ETAPAS_LABEL[e]=v.trim().slice(0,40);});
  }
}
function etapaLabel(e){return ETAPAS_LABEL[e]||e;}
const EC=['#1a6e3c','#c8870a','#5b3db0','#1e3a6e','#a06010','#22954f','#c0392b'];
const ES=['s0','s1','s2','s3','s4','s5','s6'];
const TMAP={Imóvel:'ti',Automóvel:'ta',Moto:'tm3','Serviço':'ts3'};
const TC={Imóvel:'#1a6e3c',Automóvel:'#1e3a6e',Moto:'#b8720a','Serviço':'#5b3db0'};
const OC={'Meta Ads':'#1a6e3c',Indicação:'#1e3a6e',Orgânico:'#5b3db0',WhatsApp:'#128c7e'};
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
  {id:'dashboard',label:'Painel',perms:[
    {id:'dashboard_view',label:'Ver o Painel (dashboard)'},
  ]},
  {id:'leads',label:'Leads',perms:[
    {id:'leads_view',label:'Ver a aba Leads'},
    {id:'leads_create',label:'Criar leads'},
    {id:'leads_edit',label:'Editar dados dos leads'},
    {id:'leads_delete',label:'Excluir leads'},
    {id:'leads_import',label:'Importar leads (CSV)'},
    {id:'leads_transfer',label:'Transferir / distribuir leads'},
  ]},
  {id:'funil',label:'Funil de Vendas',perms:[
    {id:'funil_view',label:'Ver o Funil'},
    {id:'funil_move',label:'Mover leads entre etapas'},
    {id:'funil_edit',label:'Renomear etapas do funil'},
  ]},
  {id:'vendas',label:'Vendas',perms:[
    {id:'vendas_view',label:'Ver Minhas Vendas'},
    {id:'vendas_create',label:'Registrar venda manual'},
    {id:'vendas_edit',label:'Editar venda'},
    {id:'vendas_delete',label:'Excluir venda'},
  ]},
  {id:'equipe',label:'Equipe e usuários',perms:[
    {id:'equipe_view',label:'Ver equipes (Configurações)'},
    {id:'equipe_view_sellers',label:'Ver usuários (Configurações)'},
    {id:'equipe_add',label:'Cadastrar usuários abaixo do seu cargo'},
    {id:'equipe_edit',label:'Editar usuários e a própria equipe'},
    {id:'equipe_remove',label:'Remover usuários abaixo do seu cargo'},
  ]},
  {id:'ranking',label:'Ranking',perms:[
    {id:'ranking_view',label:'Ver o Ranking'},
    {id:'ranking_team',label:'Ver o ranking da própria equipe'},
    {id:'ranking_all',label:'Ver o ranking geral da empresa'},
  ]},
  {id:'relatorios',label:'Relatórios',perms:[
    {id:'relatorios_view',label:'Ver Relatórios'},
    {id:'relatorios_generate',label:'Mudar o período dos relatórios'},
    {id:'relatorios_export',label:'Baixar relatórios'},
  ]},
  {id:'simulador',label:'Simulador',perms:[
    {id:'simulador_view',label:'Usar o Simulador'},
    {id:'simulador_models',label:'Gerenciar administradoras e tabelas'},
  ]},
  {id:'lances',label:'Lances',perms:[
    {id:'lances_view',label:'Ver Lances'},
    {id:'lances_create',label:'Cadastrar lances'},
    {id:'lances_edit',label:'Editar, marcar ofertado e remover lances'},
  ]},
  // WhatsApp (conversas, envio e disparo) é liberado para todos — não entra no editor de permissões.
  {id:'ia',label:'IA de atendimento (plano Master)',perms:[
    {id:'ia_view',label:'Ver a aba IA e as conversas da IA'},
    {id:'ia_manage',label:'Editar, ligar e testar os roteiros da IA'},
  ]},
  {id:'anuncios',label:'Anúncios',perms:[
    {id:'anuncios_view',label:'Ver o Gerenciador de Anúncios'},
  ]},
  {id:'agenda',label:'Calendário',perms:[
    {id:'agenda_view',label:'Ver o Calendário'},
  ]},
  {id:'config',label:'Configurações',perms:[
    {id:'config_view',label:'Ver integrações da empresa'},
    {id:'config_users',label:'Gerenciar todos os usuários'},
    {id:'config_teams',label:'Gerenciar todas as equipes'},
    {id:'config_hierarchy',label:'Gerenciar cargos (abaixo do seu)'},
    {id:'config_permissions',label:'Alterar permissões dos cargos'},
  ]},
  {id:'notificacoes',label:'Notificações',perms:[
    {id:'notif_view',label:'Ver notificações'},
    {id:'notif_team',label:'Ver notificações da equipe'},
    {id:'notif_manage',label:'Configurar notificações'},
  ]},
];

// Helper: all perm ids flat
function allHPermIds(){return HPERM_MODULES.flatMap(m=>m.perms.map(p=>p.id));}

// Permissões padrão (iguais às do banco: crm_garantir_hierarquias_empresa)
const _PERMS_VEND=['dashboard_view','leads_view','leads_create','leads_edit','funil_view','funil_move','simulador_view',
  'lances_view','lances_create','lances_edit','ranking_view','ranking_team','ranking_all','vendas_view','vendas_create','notif_view'];
const _PERMS_REP=[..._PERMS_VEND,'leads_import','leads_transfer','notif_team','whatsapp_view','whatsapp_send','ia_view','agenda_view'];
const _PERMS_SUP=[..._PERMS_REP,'simulador_models','config_view','equipe_view','equipe_view_sellers','equipe_add','equipe_edit','equipe_remove'];
function _permsDe(lista){return Object.fromEntries(allHPermIds().map(id=>[id,lista.includes(id)]));}
const HPERM_DEFAULTS={
  gestor: Object.fromEntries(allHPermIds().map(id=>[id,true])),
  representante: _permsDe(_PERMS_REP),
  supervisor: _permsDe(_PERMS_SUP),
  vendedor: _permsDe(_PERMS_VEND),
};

// ─── PERMISSÕES — regra única usada no CRM inteiro (espelha o banco) ─────────
// Nível: 0 plataforma (master), 1 gestor, 2 representante, 3 supervisor, 4 vendedor
const ROLE_NIVEL={master:0,superadmin:0,gestor:1,admin:1,administrador:1,representante:2,supervisor:3,vendedor:4};
function roleNivel(role){const n=ROLE_NIVEL[(role||'').toLowerCase()];return n===undefined?4:n;}
function isPlataforma(u){u=u||getMe();return !!u&&roleNivel(u.role)===0;}
function isGestor(u){u=u||getMe();return !!u&&roleNivel(u.role)<=1;}
function nivelDe(u){
  if(!u)return 99;
  const rn=roleNivel(u.role);
  if(rn<=1)return rn;
  const h=u.hierarquiaId?getHier(u.hierarquiaId):null;
  return Math.max(h&&h.ordem?h.ordem:rn,rn);
}
function _permsPadraoRole(role){
  const r=(role||'').toLowerCase();
  if(r==='supervisor'||r==='representante')return _permsDe([..._PERMS_REP,'config_view']);
  return _permsDe(_PERMS_VEND);
}
// Permissões novas que, quando o cargo ainda não tem a chave, seguem outra (igual ao banco: integ_tem_perm_de)
const PERM_SEGUE={ia_view:'whatsapp_view'};
// WhatsApp: todo mundo da empresa vê as conversas dos próprios leads, envia e faz disparo (custo da Meta é da empresa)
const PERM_LIVRE=new Set(['whatsapp_view','whatsapp_send','whatsapp_bulk']);
// IA: só empresas no plano Master (liberado pelo administrador da plataforma no painel Empresas)
const PERM_IA=new Set(['ia_view','ia_manage']);
function iaLiberada(){const e=window.empresa;return !!e&&String(e.plano||'').toLowerCase()==='master';}
window.iaLiberada=iaLiberada;
// Pode fazer X? (gestor e plataforma podem tudo; o resto segue o cargo)
function can(perm,u){
  u=u||getMe();
  if(!u)return false;
  if(PERM_IA.has(perm)&&!iaLiberada())return false;
  if(PERM_LIVRE.has(perm))return true;
  if(isGestor(u))return true;
  const h=u.hierarquiaId?getHier(u.hierarquiaId):null;
  const p=h&&h.perms;
  if(p&&typeof p[perm]==='boolean')return p[perm];
  if(PERM_SEGUE[perm])return can(PERM_SEGUE[perm],u);
  return !!_permsPadraoRole(u.role)[perm];
}
window.can=can;

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
  // As permissões vêm sempre da hierarquia (não são copiadas para o perfil de cada pessoa)
  const h=getHier(hId);if(!h)return;
  users.filter(u=>u.hierarquiaId===h.sb_id||u.hierarquiaId===h.id).forEach(u=>{u.hperms={...h.perms};});
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
// Lê valor em reais em qualquer formato: "R$ 1.234,56", "1.234", "1234,5", 1234
function unM(v){
  if(typeof v==='number')return isFinite(v)?v:0;
  let s=String(v||'').replace(/[^\d,.-]/g,'');
  if(!s)return 0;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if((s.match(/\./g)||[]).length>1||/\.\d{3}$/.test(s))s=s.replace(/\./g,'');
  return parseFloat(s)||0;
}
function maskMeta(el){maskM(el);}
function toDate(d){d=d||new Date();return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
// Data de hoje no fuso local (toISOString usa UTC e vira o dia depois das 21h)
function hojeISO(d){d=d||new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

// ─── PROTEÇÃO CONTRA CÓDIGO MALICIOSO EM TEXTOS (nome de lead etc.) ──────────
// Todo texto vindo de usuário/importação passa por esc() antes de ir para innerHTML.
function esc(v){
  if(v===null||v===undefined)return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Só aceita imagens http(s) ou data:image — bloqueia "javascript:" e aspas
function safeUrl(u){
  if(!u||typeof u!=='string')return '';
  const t=u.trim();
  if(/^https?:\/\//i.test(t)||/^data:image\/[a-z+.-]+;base64,[a-z0-9+/=\s]+$/i.test(t))return esc(t);
  return '';
}

// ─── TELEFONE ────────────────────────────────────────────────────────────────
// Padrão salvo: 55 + DDD + número (só dígitos). Igual à função do banco.
function normalizaTelefone(raw){
  if(!raw)return '';
  let s=String(raw).trim();
  if(/^p:/i.test(s))s=s.slice(2);
  if(/^\d[\d.]*[eE][+\-]\d+$/.test(s))s=Number(s).toFixed(0); // notação científica do Excel
  const d=s.replace(/\D/g,'');
  if(d.length===10||d.length===11)return '55'+d;
  if((d.length===12||d.length===13)&&d.startsWith('55'))return d;
  return d.length>=8?d:s;
}
// Chave para achar duplicado: DDD + 8 últimos dígitos (pega número com e sem o 9)
function chaveTelefone(raw){
  let d=String(raw||'').replace(/\D/g,'');
  if(d.length>=12&&d.startsWith('55'))d=d.slice(2);
  return d.length>=10?d.slice(0,2)+d.slice(-8):null;
}
// Exibição: +55 (19) 98936-7759
function formatTelefone(raw){
  if(!raw)return '';
  let d=String(raw).replace(/\D/g,'');
  if(d.length>=12&&d.startsWith('55'))d=d.slice(2);
  if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return String(raw);
}
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

// Atividades que a pessoa pode ver no sininho (equipe só com permissão)
function _atividadesVisiveis(){
  const me=getMe();
  const todas=window.activities||activities||[];
  if(!me||isGestor(me))return todas;
  if(can('notif_team')){
    const vis=new Set([...getVisiveisParaMim()].map(id=>(users.find(u=>u.id===id)||{}).sb_id).filter(Boolean));
    return todas.filter(a=>!a._userId||vis.has(a._userId));
  }
  return todas.filter(a=>!a._userId||a._userId===me.sb_id);
}
function renderNotifPanel(){
  const list=document.getElementById('notif-list');
  const dot=document.getElementById('bell-dot');
  const wrap=document.querySelector('.tp-bell-wrap');
  if(wrap) wrap.style.display=can('notif_view')?'':'none';
  if(!list) return;
  const items=_atividadesVisiveis().slice(0,20);
  window._notifItens=items;
  const unreadCount=items.filter(act=>!notifRead.has(_notifKey(act))).length;
  if(dot) dot.style.display=unreadCount>0?'block':'none';
  if(items.length===0){
    list.innerHTML='<div class="notif-empty"><i class="ti ti-bell-off" style="font-size:28px;display:block;margin-bottom:8px;opacity:.35"></i>Nenhuma notificação</div>';
    return;
  }
  list.innerHTML=items.map((act,i)=>{
    const read=notifRead.has(_notifKey(act));
    const cls=getNotifIconClass(act.icon);
    return `<div class="notif-item${read?'':' unread'}" onclick="readNotif(${i})">
      <div class="notif-icon ${cls}"><i class="ti ${esc(act.icon)}"></i></div>
      <div class="notif-body">
        <div class="notif-text">${esc(act.text)}</div>
        <div class="notif-time">${esc(act.time)}</div>
      </div>
    </div>`;
  }).join('');
}

// ─── BUSCA GLOBAL ─────────────────────────────────────────────────────────────
// Espera a pessoa parar de digitar; só troca de aba uma vez.
let _buscaTimer=null;
function globalSearch(q){
  if(_buscaTimer)clearTimeout(_buscaTimer);
  _buscaTimer=setTimeout(()=>_globalSearchAgora(q),400);
}
function _globalSearchAgora(q){
  q=(q||'').trim().toLowerCase();
  const srch=document.getElementById('srch');
  if(q.length<2){
    if(srch&&srch.value&&document.getElementById('tab-leads')?.classList.contains('active')){srch.value='';renderTable();}
    return;
  }
  if(!can('leads_view'))return;
  if(!document.getElementById('tab-leads')?.classList.contains('active')){
    showTab('leads',document.querySelector('.nb[onclick*="\'leads\'"]'));
  }
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

function readNotif(i){
  const act=(window._notifItens||[])[i];
  if(act) notifRead.add(_notifKey(act));
  renderNotifPanel();
}

function markAllRead(){
  _atividadesVisiveis().slice(0,20).forEach(act=>notifRead.add(_notifKey(act)));
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
// Aba → permissão necessária (null = qualquer pessoa logada)
const TAB_PERM={dashboard:'dashboard_view',funil:'funil_view',leads:'leads_view',simulador:'simulador_view',
  lances:'lances_view',minhasvendas:'vendas_view',ranking:'ranking_view',relatorios:'relatorios_view',
  whatsapp:'whatsapp_view',ia:'ia_view',anuncios:'anuncios_view',calendario:'agenda_view',configuracoes:null,empresas:'__plataforma'};
function podeAba(id,me){
  me=me||getMe();
  if(!me)return false;
  const p=TAB_PERM[id];
  if(p===undefined||p===null)return true;
  if(p==='__plataforma')return isPlataforma(me);
  return can(p,me);
}
function primeiraAbaPermitida(){
  return ['dashboard','funil','leads','minhasvendas','ranking','simulador','lances','calendario','whatsapp','ia','anuncios','relatorios','configuracoes']
    .find(id=>podeAba(id))||'configuracoes';
}
function showTab(id,btn){
  if(!podeAba(id)){
    showToast('Você não tem permissão para acessar esta aba.','ti-lock');
    return;
  }
  const tab=document.getElementById('tab-'+id);
  if(!tab)return;
  document.querySelectorAll('.content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(el=>el.classList.remove('active'));
  tab.classList.add('active');
  btn=btn||document.querySelector(`.nb[onclick*="'${id}'"]`);
  if(btn) btn.classList.add('active');
  // Persiste aba ativa para restaurar após reload
  try{localStorage.setItem('evolux_last_tab',id);}catch(e){}
  ({dashboard:renderDashboard,funil:renderKanban,leads:renderTable,simulador:()=>{syncSim();calcSim();},lances:renderLances,minhasvendas:()=>renderMinhasVendas(),ranking:()=>{_invalidarRanking();_aplicarFiltroVendas();},relatorios:renderRelatorios,whatsapp:renderWhatsapp,ia:renderIA,anuncios:renderAnuncios,calendario:renderCalendario,configuracoes:renderConfig,empresas:()=>{try{renderEmpresas();}catch(e){}}})[id]?.();
}
// Mostra/esconde abas e botões conforme as permissões da pessoa logada.
// Botões fixos do HTML usam data-perm="chave" (ou várias separadas por "|": basta uma).
function applyNavPermissions(){
  const me=getMe();
  document.querySelectorAll('.sb-superadmin-only').forEach(el=>{el.style.display=isPlataforma(me)?'':'none';});
  if(!me) return;
  Object.keys(TAB_PERM).forEach(tabId=>{
    if(tabId==='empresas')return;
    const navBtn=document.querySelector(`.nb[onclick*="'${tabId}'"]`);
    if(navBtn) navBtn.style.display=podeAba(tabId,me)?'':'none';
  });
  document.querySelectorAll('[data-perm]').forEach(el=>{
    const ok=el.getAttribute('data-perm').split('|').some(p=>can(p.trim(),me));
    el.style.display=ok?'':'none';
  });
  // Se a aba aberta deixou de ser permitida, vai para a primeira permitida
  const ativa=document.querySelector('.content.active');
  const idAtiva=ativa&&ativa.id?ativa.id.replace('tab-',''):null;
  if(idAtiva&&!podeAba(idAtiva,me)) showTab(primeiraAbaPermitida());
  try{renderNotifPanel();}catch(e){}
}

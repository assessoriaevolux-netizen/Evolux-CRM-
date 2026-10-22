// ─── INIT ─────────────────────────────────────────────────────────────────────
function sendPrompt(txt){
  showToast('Recurso de IA disponível na versão com integração Supabase.','ti-sparkles');
}
// Restaurar tema salvo
const savedTheme = localStorage.getItem('evolux-theme');
if(savedTheme==='dark') document.documentElement.setAttribute('data-theme','dark');

// ── INIT assíncrono: aguarda profiles do Supabase antes de renderizar ────────
async function _initCRM(){
  // Aguarda o carregamento de profiles (getSession + fetch profiles)
  try{ await window._profilesLoadPromise; }catch(e){ console.warn('profilesLoad err:',e); }

  // PASSO 1: Associa o usuário logado ao array users
  // O array começa vazio — usuários vêm todos do Supabase
  const _uid = window._currentUserId;
  const _email = window._session?.user?.email;
  if(_uid && _email) {
    // Procura por email ou sb_id nos dados já carregados
    let meLocal = users.find(u => u.sb_id === _uid || u.email === _email);
    // Se não encontrou (usuário novo sem profile ainda), cria entrada mínima
    if(!meLocal) {
      const _nome = window._session?.user?.user_metadata?.nome || _email?.split('@')[0] || 'Usuário';
      // Prioriza role dos pending profiles (banco) — mais confiável que metadados Auth
      const _pendingMe = window._pendingProfiles?.find(p => p.id === _uid || p.email === _email);
      const _role = _pendingMe?.role || window._session?.user?.user_metadata?.role || 'vendedor';
      meLocal = {
        id: nextUserId++,
        sb_id: _uid,
        email: _email,
        nome: _pendingMe?.nome || _nome,
        role: _role,
        managerId: null, vendas: 0, credito: 0, foto: null, meta: 500000,
        hierarquiaId: null, equipeId: null, empresaId: window._empresaIdDireto || null,
        perms: {}, hperms: {}
      };
      users.push(meLocal);
    } else {
      meLocal.sb_id = _uid;
      if(!meLocal.email) meLocal.email = _email;
    }
  }

  // PASSO 2: Busca profile completo do Supabase e aplica em todos os users
  function applyRows(data){
    if(!data||!data.length)return;
    data.forEach(function(row){
      const local=users.find(u=>u.sb_id===row.id||u.email===row.email);
      if(local){
        local.nome=row.nome||local.nome;
        local.foto=row.foto_url||local.foto;
        local.meta=row.meta||local.meta;
        local.vendas=row.vendas||0;
        local.credito=row.credito||0;
        local.role=row.role||local.role;
        local.hierarquiaId=row.hierarquia_id||local.hierarquiaId;
        local.equipeId=row.equipe_id||local.equipeId;
        local.sb_id=row.id;
        local.empresaId=row.empresa_id||local.empresaId;
        if(row.perms){try{local.perms=JSON.parse(row.perms);}catch(e){}}
        // hperms sempre vem da hierarquia — não do snapshot do banco
        if(local.hierarquiaId && window.hierarquias){
          const _h=window.hierarquias.find(x=>x.sb_id===local.hierarquiaId||x.id===local.hierarquiaId);
          if(_h&&_h.perms) local.hperms={..._h.perms};
        }
      } else {
        const maxId=Math.max(...users.map(u=>u.id),99);
        const _hierUUID=row.hierarquia_id||null;
        const _hDef=window.hierarquias&&_hierUUID?window.hierarquias.find(x=>x.sb_id===_hierUUID||x.id===_hierUUID):null;
        const newU={
          id:maxId+1, sb_id:row.id, nome:row.nome||'', email:row.email||'',
          role:row.role||'vendedor', hierarquiaId:_hierUUID,
          equipeId:row.equipe_id||null, managerId:null,
          vendas:row.vendas||0, credito:row.credito||0, meta:row.meta||500000,
          foto:row.foto_url||null,
          empresaId:row.empresa_id||null,
          perms:row.perms?JSON.parse(row.perms):{},
          hperms:_hDef?{..._hDef.perms}:(row.hperms?JSON.parse(row.hperms):{})
        };
        users.push(newU);
        if(nextUserId<=newU.id) nextUserId=newU.id+1;
      }
    });
  }

  try{
    const _empIdInit=window._empresaIdDireto;
    let _initPQ=window._sb.from('profiles').select('*').order('credito',{ascending:false});
    if(_empIdInit) _initPQ=_initPQ.eq('empresa_id',_empIdInit);
    const {data}=await _initPQ;
    if(data&&data.length) applyRows(data);
  }catch(e){console.warn('_initCRM profiles fetch:',e);}
  delete window._pendingProfiles;

  // PASSO 3: Garante sb_id e empresaId do usuário atual (após merge)
  const meCheck = users.find(u => u.sb_id === _uid || u.email === _email);
  if(meCheck){
    if(_uid) meCheck.sb_id = _uid; // sempre força o auth UID correto
    // Aplica empresa_id do profilesLoad se disponível
    if(!meCheck.empresaId && window._empresaIdDireto){
      meCheck.empresaId = window._empresaIdDireto;
    }
    if(!meCheck.empresaId){
      try{
        const {data:profData}=await window._sb.from('profiles').select('empresa_id').eq('id',_uid).single();
        if(profData?.empresa_id){
          meCheck.empresaId=profData.empresa_id;
          window._empresaIdDireto=profData.empresa_id;
        }
      }catch(e){}
    }
  }

  // PASSO 4 (master): se ainda sem empresa, busca a empresa mais antiga no banco e vincula
  if(meCheck && !meCheck.empresaId && meCheck.role==='master'){
    try{
      const {data:emps}=await window._sb.from('empresas').select('id,nome').eq('ativo',true).order('created_at',{ascending:true}).limit(1);
      if(emps&&emps.length){
        const empId=emps[0].id;
        meCheck.empresaId=empId;
        window._empresaIdDireto=empId;
        // Persiste no profile para próximas sessões não precisarem reprocessar
        await window._sb.from('profiles').update({empresa_id:empId}).eq('id',_uid);
        console.log('[_initCRM] master vinculado à empresa existente:', empId, emps[0].nome);
      }
    }catch(e){console.warn('[_initCRM] fallback empresa master:',e);}
  }

  // PASSO 5: Auto-promoção — primeiro usuário da empresa deve ser gestor
  // Cobre casos de usuários criados antes da correção do trigger
  if(meCheck && meCheck.empresaId && meCheck.role === 'vendedor'){
    try{
      const {data:allProfs}=await window._sb.from('profiles').select('id,role').eq('empresa_id',meCheck.empresaId);
      const gestores=allProfs?allProfs.filter(p=>['gestor','supervisor','master','superadmin'].includes(p.role)):[];
      if(gestores.length===0){
        // É o único/primeiro usuário e não há gestor — promove para gestor
        await window._sb.from('profiles').update({role:'gestor'}).eq('id',meCheck.sb_id||_uid);
        meCheck.role='gestor';
      }
    }catch(e){console.warn('[_initCRM] auto-promoção gestor:',e);}
  }

  // Agora renderiza com o usuário correto
  updateSbUser();
  populateSelects();

  // ── Restaura aba ativa ANTES de qualquer render para evitar piscar o Painel ──
  let _tabInicial='dashboard';
  try{
    const _saved=localStorage.getItem('evolux_last_tab');
    if(_saved&&document.getElementById('tab-'+_saved)) _tabInicial=_saved;
  }catch(e){}
  // Ativa a aba visualmente sem chamar showTab (que faria render antecipado)
  document.querySelectorAll('.content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(el=>el.classList.remove('active'));
  const _tabElInicial=document.getElementById('tab-'+_tabInicial);
  const _btnInicial=document.querySelector(`.nb[onclick*="'${_tabInicial}'"]`);
  if(_tabElInicial) _tabElInicial.classList.add('active');
  if(_btnInicial) _btnInicial.classList.add('active');

  renderNotifPanel();
  try{if(localStorage.getItem('sb_collapsed')==='1'){const sb=document.getElementById('sidebar');const btn=document.getElementById('sb-toggle');if(sb)sb.classList.add('collapsed');if(btn){btn.style.left='60px';btn.classList.add('collapsed');}}}catch(e){}
  syncSim();
  renderAdminList();
  try{applyNavPermissions();}catch(e){}
  try{renderUserList();}catch(e){}

  // Renderiza apenas a aba inicial (evita renderizar tudo de uma vez)
  const _initRenders={dashboard:()=>renderDashboard(),funil:()=>renderKanban(),leads:()=>renderTable(),ranking:()=>{_aplicarFiltroVendas();},relatorios:()=>renderRelatorios(),lances:()=>renderLances(),minhasvendas:()=>renderMinhasVendas(),simulador:()=>{syncSim();calcSim();},whatsapp:()=>renderWhatsapp(),calendario:()=>renderCalendario(),configuracoes:()=>renderConfig(),empresas:()=>{try{renderEmpresas();}catch(e){}}};
  try{(_initRenders[_tabInicial]||_initRenders.dashboard)();}catch(e){try{renderDashboard();}catch(e2){}}
  // Carrega dados persistidos do Supabase após profiles prontos
  if(window._loadAllData) await window._loadAllData();
  // Garante hierarquias padrão para a empresa (cria se não existir nenhuma)
  try{ if(window._ensureHierarquiasPadrao) await window._ensureHierarquiasPadrao(); }catch(e){ console.warn('ensureHierarquias err:',e); }
  // Sincroniza vendas históricas (leads convertidos sem linha na tabela vendas)
  try{ if(window._sincronizarVendasHistoricas) window._sincronizarVendasHistoricas(); }catch(e){ console.warn('sincVendas err:',e); }

  // Se voltou do OAuth do Google Calendar, mostra mensagem de sucesso agora que o CRM está pronto
  if(window._gcalJustConnected){
    const pendingTab=window._gcalJustConnected.tab||'calendar';
    delete window._gcalJustConnected;
    setTimeout(()=>{
      showToast('Google Calendar conectado com sucesso! ✅','ti-circle-check');
      if(typeof renderGcalPanel==='function') renderGcalPanel();
      if(typeof showTab==='function') showTab(pendingTab);
      if(typeof cfgRenderSection==='function') cfgRenderSection();
    },300);
  }
}
// _initCRM() é chamado em 99-inicio.js, depois que todos os arquivos carregaram

// bindHierModal movido para após o modal HTML no final do arquivo


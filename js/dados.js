// Camada de dados (Supabase): sessão, carregamento, salvamento e tempo real.
(function(){
  const SB_URL='https://uekeeutycmqsswrhspwv.supabase.co';
  const SB_KEY='sb_publishable_nJ-BnFkD8sG8mv4f7Uc-Uw_v87ZOIl9';
  const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVla2VldXR5Y21xc3N3cmhzcHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDYyNDgsImV4cCI6MjEwNjk4MjI0OH0.h3YeJbSPCbWfEYF-bjV71-KA-WQ9bAf9mBxO4EWtUBs';
  window._sbUrl=SB_URL;
  window._sbAnon=SB_ANON;
  window._sb=supabase.createClient(SB_URL,SB_KEY);

  // ── INATIVIDADE OBRIGATÓRIA — 30 dias sem uso → logout ────────────────────
  (function(){
    const INATIV_KEY='evolux_last_active';
    const INATIV_LIMIT=30*24*60*60*1000;
    const agora=Date.now();
    const ultimo=parseInt(localStorage.getItem(INATIV_KEY)||'0');
    if(ultimo&&(agora-ultimo)>INATIV_LIMIT){
      localStorage.removeItem(INATIV_KEY);
      window._sb.auth.signOut().finally(()=>{window.location.href='index.html?motivo=inatividade';});
      return;
    }
    function atualizarAtividade(){localStorage.setItem(INATIV_KEY,Date.now().toString());}
    atualizarAtividade();
    ['click','keydown','mousemove','touchstart'].forEach(ev=>{
      document.addEventListener(ev,atualizarAtividade,{passive:true});
    });
    setInterval(function(){
      const ts=parseInt(localStorage.getItem(INATIV_KEY)||'0');
      if(ts&&(Date.now()-ts)>INATIV_LIMIT){
        window._sb.auth.signOut().finally(()=>{window.location.href='index.html?motivo=inatividade';});
      }
    },60*60*1000);
  })();

  // ── Helpers de sync ────────────────────────────────────────────────────────
  function sbRowToUser(row,idx){
    const _permsRaw=row.perms?JSON.parse(row.perms):{};
    const _wa=row.whatsapp||_permsRaw._whatsapp||null;
    const _ig=row.instagram||_permsRaw._instagram||null;
    return {
      id: row.crm_id||idx+100,
      sb_id: row.id,
      nome: row.nome||'',
      email: row.email||'',
      role: row.role||'vendedor',
      hierarquiaId: row.hierarquia_id||null,
      equipeId: row.equipe_id||null,
      managerId: null,
      vendas: row.vendas||0,
      credito: row.credito||0,
      meta: row.meta||500000,
      foto: row.foto_url||null,
      whatsapp: _wa,
      instagram: _ig,
      empresaId: row.empresa_id||null,
      perms: _permsRaw,
      hperms: row.hperms?JSON.parse(row.hperms):{}
    };
  }

  // Merge linhas do Supabase no array users local
  // NOTA: users é variável local do script principal; window.users === users (mesma ref)
  function mergeProfilesIntoUsers(data){
    if(!data||!data.length)return;
    // Se window.users ainda não está disponível, usa a referência local se possível
    const arr = window.users || [];
    if(!arr.length && !window.users) return;
    data.forEach(function(row,idx){
      const local=arr.find(u=>u.sb_id===row.id||u.email===row.email);
      if(local){
        local.nome=row.nome||local.nome;
        local.foto=row.foto_url||local.foto;
        local.meta=row.meta||local.meta;
        local.vendas=row.vendas||0;
        local.credito=row.credito||0;
        local.role=row.role||local.role;
        // Banco é a fonte da verdade — sempre usa o valor do banco se definido
        if(row.hierarquia_id!==undefined) local.hierarquiaId=row.hierarquia_id||local.hierarquiaId;
        if(row.equipe_id!==undefined) local.equipeId=row.equipe_id||local.equipeId;
        local.sb_id=row.id;
        local.empresaId=row.empresa_id||local.empresaId;
        if(row.whatsapp!==undefined) local.whatsapp=row.whatsapp||local.whatsapp;
        if(row.instagram!==undefined) local.instagram=row.instagram||local.instagram;
        if(row.perms){
          try{
            local.perms=JSON.parse(row.perms);
            // Fallback: recupera whatsapp/instagram guardados dentro de perms se colunas dedicadas estiverem vazias
            if(!local.whatsapp && local.perms._whatsapp) local.whatsapp=local.perms._whatsapp;
            if(!local.instagram && local.perms._instagram) local.instagram=local.perms._instagram;
          }catch(e){}
        }
        // hperms do banco NÃO é aplicado aqui — sempre vem da hierarquia via _ensureMeHperms/_loadAllData
        // Isso garante que permissões refletem a hierarquia atual, não snapshot antigo do banco
      } else {
        const maxId=Math.max(...arr.map(u=>u.id),99);
        const newU=sbRowToUser(row,idx);
        newU.id=maxId+1;
        arr.push(newU);
      }
    });
  }

  // ── 1. Guard + carregamento inicial de profiles ────────────────────────────
  // Executa ANTES do DOM estar pronto; guarda promise para init aguardar

  // ── RECUPERAÇÃO DE SENHA — intercepta link do e-mail ─────────────────────
  // Detecta token de recuperação na URL (Supabase coloca no hash)
  var _isPasswordRecovery = window.location.hash.includes('type=recovery')
    || window.location.hash.includes('type=signup');
  window._sb.auth.onAuthStateChange(function(event, session){
    if(event==='PASSWORD_RECOVERY'){
      _isPasswordRecovery = true;
      // Mostra modal e esconde o CRM
      function _showRecoveryModal(){
        var modal = document.getElementById('modal-nova-senha');
        if(modal){
          modal.style.display='flex';
          // Esconde sidebar e conteúdo principal para não aparecer por baixo
          var sb=document.getElementById('sidebar');
          var main=document.querySelector('.main-content');
          if(sb) sb.style.visibility='hidden';
          if(main) main.style.visibility='hidden';
        }
      }
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded', _showRecoveryModal);
      } else {
        _showRecoveryModal();
      }
      return;
    }
    // SIGNED_IN disparado por signUp de outro usuário (cadastro de novo membro):
    // se já há um usuário logado e o evento é SIGNED_IN com uid diferente,
    // rejeita a troca de sessão para não expulsar o admin.
    if(event==='SIGNED_IN' && window._currentUserId && session && session.user.id !== window._currentUserId){
      console.warn('[Auth] signUp de novo usuário disparou SIGNED_IN — revertendo sessão do admin');
      // Restaura a sessão anterior (o getSession() volta com o token do admin que ainda está salvo)
      window._sb.auth.getSession().then(function(r){
        if(r.data.session && r.data.session.user.id !== window._currentUserId){
          // A sessão já trocou — força signOut do novo usuário e recarrega
          window._sb.auth.signOut().then(function(){ window.location.reload(); });
        }
      });
    }
  });

  window._profilesLoadPromise = window._sb.auth.getSession().then(async function(res){
    const session=res.data.session;
    // Se for recuperação de senha, não redireciona — aguarda o evento PASSWORD_RECOVERY
    if(!session){
      if(!_isPasswordRecovery) window.location.href='index.html';
      return;
    }
    window._session=session;
    window._currentUserId=session.user.id;

    const email=session.user.email;
    const nome=session.user.user_metadata?.nome||email?.split('@')[0]||'Usuário';
    const role=session.user.user_metadata?.role||'vendedor';
    const meta=session.user.user_metadata?.meta||500000;

    // Garante que o profile do usuário logado existe
    try{
      const {data:existing}=await window._sb.from('profiles').select('*').eq('id',session.user.id).single();

      // Empresa e role: prioriza banco, fallback nos metadados do Auth
      const empresaIdExistente = existing?.empresa_id
        || session.user.user_metadata?.empresa_id
        || null;
      // Roles com maior privilégio nunca são sobrescritos por metadados
      const ROLES_PRIORITY = ['master','superadmin','gestor','admin','administrador','supervisor','representante','vendedor'];
      const _roleDb = existing?.role || null;
      const _roleMeta = session.user.user_metadata?.role || null;
      // Se já tem role no banco, usa ele — a menos que seja vendedor e o metadado diga diferente
      const roleCorreto = (()=>{
        if(!_roleDb) return _roleMeta || 'vendedor';
        if(!_roleMeta) return _roleDb;
        // Nunca rebaixa um role de privilégio alto por causa dos metadados
        const dbIdx = ROLES_PRIORITY.indexOf(_roleDb);
        const metaIdx = ROLES_PRIORITY.indexOf(_roleMeta);
        return (dbIdx <= metaIdx) ? _roleDb : _roleMeta; // menor índice = maior privilégio
      })();

      if(!existing){
        // Cria profile completo com empresa_id e role corretos
        await window._sb.from('profiles').upsert({
          id:session.user.id,
          email,
          nome,
          role: roleCorreto,
          meta,
          vendas:0,
          credito:0,
          empresa_id: empresaIdExistente || null
        },{onConflict:'id'});
      } else if(!existing.empresa_id && empresaIdExistente) {
        // Profile existe mas sem empresa_id — corrige agora (sem alterar role)
        await window._sb.from('profiles').update({
          empresa_id: empresaIdExistente
        }).eq('id', session.user.id);
      } else if(existing.role !== roleCorreto) {
        // Só atualiza role se o roleCorreto for de maior ou igual privilégio
        await window._sb.from('profiles').update({
          role: roleCorreto
        }).eq('id', session.user.id);
      }

      if(empresaIdExistente){
        window._empresaIdDireto = empresaIdExistente;
      }

    }catch(e){console.warn('Profile upsert:',e);}

    // Carrega profiles da empresa do usuário logado (antes do init renderizar)
    // NUNCA carrega sem empresa_id — isolamento multi-tenant obrigatório
    try{
      // Garante empresa_id — busca direto do banco se ainda não tiver
      let _empId=window._empresaIdDireto;
      if(!_empId){
        const {data:prof}=await window._sb.from('profiles').select('empresa_id').eq('id',session.user.id).single();
        if(prof?.empresa_id){
          _empId=prof.empresa_id;
          window._empresaIdDireto=_empId;
        }
      }
      if(_empId){
        const {data,error}=await window._sb.from('profiles').select('*').eq('empresa_id',_empId).order('credito',{ascending:false});
        if(!error&&data&&data.length){
          window._pendingProfiles=data; // _initCRM vai aplicar após users estar pronto
        }
      } else {
        // Sem empresa_id: carrega apenas o próprio profile para não misturar dados
        const {data,error}=await window._sb.from('profiles').select('*').eq('id',session.user.id);
        if(!error&&data&&data.length) window._pendingProfiles=data;
      }
    }catch(e){console.warn('Load profiles:',e);}
  });

  // ── 2. _loadProfiles: recarrega e re-renderiza (chamado pelo realtime) ─────
  window._loadProfiles=async function(){
    try{
      const _empIdP=window._empresaIdDireto;
      if(!_empIdP){console.warn('[_loadProfiles] sem empresa_id — abortando para não vazar dados');return;}
      const {data,error}=await window._sb.from('profiles').select('*').eq('empresa_id',_empIdP).order('credito',{ascending:false});
      if(error||!data||!data.length)return;
      mergeProfilesIntoUsers(data);
      // Garante hperms do usuário logado sempre sincronizado com hierarquia
      window._ensureMeHperms&&window._ensureMeHperms();
      // Re-renderiza tudo com o usuário correto
      try{window.updateSbUser&&window.updateSbUser();}catch(e){}
      try{window.renderDashboard&&window.renderDashboard();}catch(e){}
      try{window.renderRanking&&window.renderRanking();}catch(e){}
      try{window.renderUserList&&window.renderUserList();}catch(e){}
      try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
      // Atualiza página de configurações se estiver aberta
      try{
        const contaTab=document.querySelector('.nav-item[data-section="config"]');
        const configSec=document.getElementById('config-section');
        if(configSec&&configSec.style.display!=='none'){
          window.renderConfig&&window.renderConfig();
        }
      }catch(e){}
    }catch(e){console.warn('loadProfiles error:',e);}
  };

  // Garante que o usuário logado tem hperms aplicados da sua hierarquia
  // Chamado após merge de profiles e após carregar hierarquias
  window._ensureMeHperms=function(){
    const me=window.getMe&&window.getMe();
    if(!me||me.role==='master'||me.role==='gestor'||me.role==='superadmin') return;
    if(!window.hierarquias||!window.hierarquias.length) return;
    const h=window.hierarquias.find(x=>x.sb_id===me.hierarquiaId||String(x.id)===String(me.hierarquiaId));
    if(!h||!h.perms) return;
    // SEMPRE reaplicar hperms da hierarquia — sobrescreve qualquer versão desatualizada do banco
    // As permissões são da hierarquia, não do usuário individual
    me.hperms={...h.perms};
    console.log('[_ensureMeHperms] aplicou hperms da hierarquia "'+h.nome+'" para '+me.nome, me.hperms);
    // Sempre garante role correto baseado na hierarquia
    if(typeof window.slugToRole==='function'){
      const roleCorreto=window.slugToRole(h);
      if(me.role!==roleCorreto&&me.role!=='master'&&me.role!=='gestor'){
        me.role=roleCorreto;
        console.log('[_ensureMeHperms] corrigiu role para '+roleCorreto);
      }
    }
  };


  // ── 3. Salva/atualiza um user no Supabase ─────────────────────────────────
  // Hierarquia de roles — índice menor = maior privilégio
  // Nunca permite que um role de menor privilégio sobrescreva um de maior
  window._ROLES_PRIORITY=['master','superadmin','gestor','admin','administrador','supervisor','representante','vendedor'];
  window._roleSeguro=function(rolePretendido, roleAtualNoBanco){
    if(!rolePretendido) return roleAtualNoBanco||'vendedor';
    if(!roleAtualNoBanco) return rolePretendido;
    const idxPretendido=window._ROLES_PRIORITY.indexOf(rolePretendido);
    const idxAtual=window._ROLES_PRIORITY.indexOf(roleAtualNoBanco);
    // Se o role pretendido tiver menor índice (maior privilégio) ou igual, aceita
    // Se for rebaixamento, mantém o atual
    return (idxPretendido<=idxAtual||idxPretendido===-1) ? rolePretendido : roleAtualNoBanco;
  };

  window._syncUser=async function(u){
    if(!u||!u.email)return;
    // Garante que sb_id está correto — usa o auth UID se for o usuário atual
    if((!u.sb_id || u.sb_id.length < 10) && window._currentUserId && u.email===window._session?.user?.email){
      u.sb_id = window._currentUserId;
    }
    const hasSbId = u.sb_id && typeof u.sb_id === 'string' && u.sb_id.length > 10;
    // Se ainda não tem sb_id, não conseguimos salvar com segurança
    if(!hasSbId){
      console.warn('[_syncUser] sb_id inválido para', u.email, '— abortando');
      return;
    }
    // Se for outro usuário, usa Edge Function update-profile (roda com service role, ignora RLS)
    if(u.sb_id !== window._currentUserId){
      try{
        const token=window._session?.access_token;
        if(!token){console.warn('[_syncUser] sem token para chamar edge function');return;}
        // Resolve UUID da hierarquia — hierarquiaId pode ser ID local numérico ou UUID direto
        const _hierLocal2=window.hierarquias&&window.hierarquias.find(h=>h.sb_id===u.hierarquiaId||String(h.id)===String(u.hierarquiaId));
        const _hierUUID2=_hierLocal2?.sb_id||(typeof u.hierarquiaId==='string'&&u.hierarquiaId.length>10?u.hierarquiaId:null);
        // Proteção anti-rebaixamento de role via Edge Function
        let _roleAtualDbEF=null;
        try{const _rrEF=await window._sb.from('profiles').select('role').eq('id',u.sb_id).single();_roleAtualDbEF=_rrEF.data?.role||null;}catch(e){}
        const _roleFinalEF=window._roleSeguro?window._roleSeguro(u.role||'vendedor',_roleAtualDbEF):(u.role||'vendedor');
        const body={
          target_id:u.sb_id,
          nome:u.nome,
          role:_roleFinalEF,
          foto_url:u.foto||null,
          whatsapp:u.whatsapp||null,
          instagram:u.instagram||null,
          meta:u.meta||0,
          equipe_id:u.equipeId||null,
          perms:(()=>{const _p2=Object.assign({},u.perms||{});if(u.whatsapp)_p2._whatsapp=u.whatsapp;else delete _p2._whatsapp;if(u.instagram)_p2._instagram=u.instagram;else delete _p2._instagram;return JSON.stringify(_p2);})(),
          hperms:u.hperms?JSON.stringify(u.hperms):null,
        };
        // Bug #7: só inclui hierarquia_id no payload se temos um UUID real
        // — não enviar null evita sobrescrever valor correto no DB
        if(_hierUUID2) body.hierarquia_id=_hierUUID2;
        const res=await fetch('https://uekeeutycmqsswrhspwv.supabase.co/functions/v1/update-profile',{
          method:'POST',
          headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify(body)
        });
        const json=await res.json();
        if(!res.ok){console.warn('[_syncUser] edge fn error:',json);}
        else{console.log('[_syncUser] profile atualizado via edge fn:',u.email);}
      }catch(e){console.warn('[_syncUser] edge fn exception:',e);}
      return;
    }
    // Garante empresa_id
    if(!u.empresaId && window._empresaIdDireto) u.empresaId = window._empresaIdDireto;
    // Resolve UUID real da hierarquia (hierarquiaId pode ser ID local numérico OU UUID do banco)
    const _hierLocal=window.hierarquias&&window.hierarquias.find(h=>h.id===u.hierarquiaId||h.sb_id===u.hierarquiaId);
    const _hierUUID=_hierLocal?.sb_id||(typeof u.hierarquiaId==='string'&&u.hierarquiaId.length>10?u.hierarquiaId:null);
    // Busca role atual no banco antes de sobrescrever (proteção anti-rebaixamento)
    let _roleAtualDb=null;
    try{const _rr=await window._sb.from('profiles').select('role').eq('id',u.sb_id).single();_roleAtualDb=_rr.data?.role||null;}catch(e){}
    const _roleFinal=window._roleSeguro?window._roleSeguro(u.role||'vendedor',_roleAtualDb):(u.role||'vendedor');
    const payload={
      id: u.sb_id, // SEMPRE inclui o UUID correto
      email:u.email,
      nome:u.nome,
      role:_roleFinal,
      // Bug #7: só inclui hierarquia_id se temos UUID real — null sobrescreveria dado correto
      ...(_hierUUID?{hierarquia_id:_hierUUID}:{}),
      equipe_id:u.equipeId||null,
      meta:u.meta||0,
      // NUNCA inclui vendas/credito aqui — esses campos só são alterados por
      // _registrarVenda/_estornarVenda com incremento atômico, para evitar
      // race condition onde salvar foto/perfil sobrescreve vendas registradas
      foto_url:u.foto||null,
      empresa_id:u.empresaId||window._empresaIdDireto||null,
      perms:u.perms?JSON.stringify(u.perms):null,
      hperms:u.hperms?JSON.stringify(u.hperms):null,
      updated_at:new Date().toISOString()
    };
    if(u.whatsapp!==undefined) payload.whatsapp=u.whatsapp||null;
    // Bug #9: instagram nunca era incluído no payload — agora salva junto ao perfil
    if(u.instagram!==undefined) payload.instagram=u.instagram||null;
    // Fallback de persistência: guarda whatsapp e instagram dentro de perms também,
    // para o caso de as colunas dedicadas não existirem na tabela do Supabase.
    {
      const _mergedPerms=Object.assign({},u.perms||{});
      if(u.whatsapp) _mergedPerms._whatsapp=u.whatsapp; else delete _mergedPerms._whatsapp;
      if(u.instagram) _mergedPerms._instagram=u.instagram; else delete _mergedPerms._instagram;
      payload.perms=JSON.stringify(_mergedPerms);
    }
    console.log('[_syncUser] upserting id='+payload.id, 'email='+payload.email, 'empresa_id='+payload.empresa_id);
    const {data,error}=await window._sb.from('profiles').upsert(payload,{onConflict:'id'}).select().single();
    if(error){console.warn('Erro ao salvar profile:',error);return;}
    if(data){
      u.sb_id=data.id;
      if(data.empresa_id){
        u.empresaId=data.empresa_id;
        if(!window._empresaIdDireto) window._empresaIdDireto=data.empresa_id;
      }
    }
  };

  window._syncAllUsers=async function(){
    const arr = window.users || [];
    for(const u of arr){await window._syncUser(u);}
  };

  // ── LEADS ──────────────────────────────────────────────────────────────────
  window._syncLead = async function(lead) {
    // Se o lead já tem empresa_id (foi carregado do DB), usa ele diretamente
    let empresaId = lead.empresa_id || await window._getEmpresaId();
    if (!empresaId) {
      // Último recurso: busca a primeira empresa ativa do banco
      try {
        const {data:emp} = await window._sb.from('empresas').select('id').eq('ativo',true).limit(1).single();
        if (emp?.id) {
          empresaId = emp.id;
          window._empresaIdDireto = empresaId;
          // Atualiza o profile do usuário com esta empresa
          await window._sb.from('profiles').update({empresa_id:empresaId}).eq('id',window._currentUserId);
          const me = window.users && window.users.find(u => u.sb_id === window._currentUserId);
          if (me) me.empresaId = empresaId;
        }
      } catch(e) {}
    }
    if (!empresaId) { console.warn('[_syncLead] sem empresaId mesmo após fallback, abortando'); return; }
    const resp = users.find(u => u.id === lead.responsavelId);
    const payload = {
      empresa_id: empresaId,
      responsavel_id: resp?.sb_id || null,
      nome: lead.nome || '',
      telefone: lead.tel || '',
      tipo: lead.tipo || 'Imóvel',
      credito: lead.credito || 0,
      etapa: lead.etapa || 'Novo lead',
      origem: lead.origem || '',
      atendimento: lead.atendimento || '',
      obs: lead.obs || '',
      // Bug #11: administradora vinculada ao lead agora persistida no banco
      administradora: lead.admin || null,
      // ID do Meta Ads — usado para deduplicação em importações futuras
      meta_id: lead.metaId || null,
      data_criacao: lead.data ? lead.data.split('/').reverse().join('-') : new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    };
    if (lead.sb_id) {
      payload.id = lead.sb_id;
      const { data, error } = await window._sb.from('leads').upsert(payload, { onConflict: 'id' }).select().single();
      if (!error && data) lead.sb_id = data.id;
    } else {
      const { data, error } = await window._sb.from('leads').insert(payload).select().single();
      if (!error && data) lead.sb_id = data.id;
    }
  };

  window._deleteLead = async function(sb_id) {
    if (!sb_id) return;
    await window._sb.from('leads').delete().eq('id', sb_id);
  };

  window._loadLeads = async function() {
    try {
      // Sempre filtra por empresa — isolamento multi-tenant CRÍTICO
      const empresaId = await window._getEmpresaId();
      if (!empresaId) { console.error('[Security] _loadLeads: empresaId null — abortando query para evitar vazamento entre tenants'); return; }
      let query = window._sb.from('leads').select('*').order('created_at', { ascending: false });
      query = query.eq('empresa_id', empresaId); // SEMPRE filtra, nunca opcional
      const { data, error } = await query;
      if (error || !data) { console.warn('[_loadLeads] erro:', error); return; }
      data.forEach(row => {
        const existing = leads.find(l => l.sb_id === row.id);
        const resp = users.find(u => u.sb_id === row.responsavel_id);
        const mapped = {
          id: existing ? existing.id : (nextLeadId++),
          sb_id: row.id,
          empresa_id: row.empresa_id || null, // preserva para _syncLead reusar
          empresaId: row.empresa_id || null,  // camelCase para filtros de render
          nome: row.nome || '',
          tel: row.telefone || '',
          tipo: row.tipo || 'Imóvel',
          credito: parseFloat(row.credito) || 0,
          etapa: row.etapa || 'Novo lead',
          origem: row.origem || '',
          atendimento: row.atendimento || '',
          obs: row.obs || '',
          // Bug #11: restaura administradora salva no banco
          admin: row.administradora || null,
          // ID do Meta Ads para deduplicação em re-importações
          metaId: row.meta_id || null,
          data: row.data_criacao ? row.data_criacao.split('-').reverse().join('/') : '',
          responsavelId: resp ? resp.id : null,
        };
        // Também atualiza _empresaIdDireto se ainda não tiver (aproveita empresa do lead)
        if (row.empresa_id && !window._empresaIdDireto) window._empresaIdDireto = row.empresa_id;
        if (existing) { Object.assign(existing, mapped); }
        else { leads.push(mapped); }
      });
      window.nextLeadId = nextLeadId;
    } catch(e) { console.warn('loadLeads error:', e); }
  };

  // ── LANCES ─────────────────────────────────────────────────────────────────
  window._syncLance = async function(lance) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) { console.warn('[_syncLance] sem empresaId, abortando'); return; }
    const lead = leads.find(l => l.id === lance.leadId);
    const payload = {
      empresa_id: empresaId,
      lead_id: lead?.sb_id || null,
      cliente_nome: lance.clienteNome || '',
      valor: lance.valor || 0,
      pct: lance.pct || 0,
      data_oferta: lance.dataOferta || new Date().toISOString().split('T')[0],
      assembleia: lance.assem || '',
      obs: lance.obs || '',
      ofertado: lance.ofertado || false,
      removido: lance._removido || false,
      updated_at: new Date().toISOString()
    };
    if (lance.sb_id) {
      payload.id = lance.sb_id;
      const { data, error } = await window._sb.from('lances').upsert(payload, { onConflict: 'id' }).select().single();
      if (!error && data) lance.sb_id = data.id;
    } else {
      const { data, error } = await window._sb.from('lances').insert(payload).select().single();
      if (!error && data) lance.sb_id = data.id;
    }
  };

  window._loadLances = async function() {
    try {
      const _empIdL=await window._getEmpresaId();
      if(!_empIdL){console.error('[Security] _loadLances: empresaId null — abortando');return;}
      let _lq=window._sb.from('lances').select('*').order('created_at',{ascending:false});
      _lq=_lq.eq('empresa_id',_empIdL); // SEMPRE filtra
      const { data, error } = await _lq;
      if (error || !data) return;
      data.forEach(row => {
        const existing = lances.find(la => la.sb_id === row.id);
        const lead = leads.find(l => l.sb_id === row.lead_id);
        const mapped = {
          id: existing ? existing.id : (nextLanceId++),
          sb_id: row.id,
          leadId: lead ? lead.id : null,
          clienteNome: row.cliente_nome || '',
          valor: parseFloat(row.valor) || 0,
          pct: parseFloat(row.pct) || 0,
          dataOferta: row.data_oferta || '',
          assem: row.assembleia || '',
          obs: row.obs || '',
          ofertado: row.ofertado || false,
          _removido: row.removido || false,
        };
        if (existing) { Object.assign(existing, mapped); }
        else { lances.push(mapped); }
      });
      window.nextLanceId = nextLanceId;
    } catch(e) { console.warn('loadLances error:', e); }
  };

  // ── EQUIPES ────────────────────────────────────────────────────────────────
  window._syncEquipe = async function(equipe) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) { showToast('Erro: empresa não identificada.','ti-alert-circle','#dc3545'); return; }
    const membros = (equipe.membroIds || []).map(mid => {
      const u = users.find(x => x.id === mid);
      return u?.sb_id || null;
    }).filter(Boolean);
    // Colunas confirmadas: empresa_id, nome, descrição (com acento), membros_sb_ids
    const gestorUser=users.find(u=>u.id===equipe.gestorId);
    const repUser=users.find(u=>u.id===equipe.representanteId);
    const supUser=users.find(u=>u.id===equipe.supervisorId);
    const payload = {
      empresa_id: empresaId,
      nome: equipe.nome || '',
      descricao: equipe.descricao || '',
      membros_sb_ids: membros,
      foto_url: equipe.foto || null,
      gestor_sb_id: gestorUser?.sb_id || null,
      representante_sb_id: repUser?.sb_id || null,
      supervisor_sb_id: supUser?.sb_id || null,
      meta: equipe.meta || 0,
      periodo: equipe.periodo || 'mensal',
      status: equipe.status || 'ativa',
    };
    // Payload mínimo garantido (colunas que sempre existem)
    const payloadBase = {
      empresa_id: empresaId,
      nome: equipe.nome || '',
      descricao: equipe.descricao || '',
      membros_sb_ids: membros,
      foto_url: equipe.foto || null,
    };
    if (equipe.sb_id) {
      // Tenta com payload completo primeiro
      let { data, error } = await window._sb.from('equipes').update(payload).eq('id', equipe.sb_id).select().single();
      if (error) {
        console.warn('[_syncEquipe] update completo falhou, tentando payload base:', error.message);
        // Fallback: só campos base
        const r2 = await window._sb.from('equipes').update(payloadBase).eq('id', equipe.sb_id).select().single();
        if (r2.error) {
          console.error('[_syncEquipe] update base também falhou:', r2.error);
          showToast('Erro ao salvar equipe: '+r2.error.message,'ti-alert-circle','#dc3545');
          return;
        }
        console.log('[_syncEquipe] updated (base) ok:', r2.data);
        showToast('Equipe salva (execute o SQL no Supabase para salvar meta/período/gestor).','ti-alert-triangle','#d97706');
      } else {
        console.log('[_syncEquipe] updated ok:', data);
      }
    } else {
      let { data, error } = await window._sb.from('equipes').insert(payload).select().single();
      if (error) {
        console.warn('[_syncEquipe] insert completo falhou, tentando payload base:', error.message);
        const r2 = await window._sb.from('equipes').insert(payloadBase).select().single();
        if (r2.error) {
          console.error('[_syncEquipe] insert base também falhou:', r2.error);
          showToast('Erro ao criar equipe: '+r2.error.message,'ti-alert-circle','#dc3545');
          return;
        }
        if (r2.data) equipe.sb_id = r2.data.id;
        console.log('[_syncEquipe] inserted (base) ok:', r2.data);
      } else {
        if (data) equipe.sb_id = data.id;
        console.log('[_syncEquipe] inserted ok:', data);
      }
    }
  };

  window._loadEquipes = async function() {
    try {
      const _empIdEq=await window._getEmpresaId();
      if(!_empIdEq){console.error('[Security] _loadEquipes: empresaId null — abortando');return;}
      let _eqQ=window._sb.from('equipes').select('*').order('nome');
      _eqQ=_eqQ.eq('empresa_id',_empIdEq); // SEMPRE filtra
      const { data, error } = await _eqQ;
      console.log('[_loadEquipes] empresa_id:', _empIdEq, '| rows do banco:', data?.length, '| error:', error);
      if (error || !data) return;
      // NUNCA reatribuir equipes = ... pois quebra a referência window.equipes
      // Limpa mantendo a referência (splice) e repopula
      const sbIdsNoBanco = data.map(r => r.id);
      // Remove itens que sumiram do banco (splice in place, sem reatribuir)
      for(let i = equipes.length - 1; i >= 0; i--){
        if(equipes[i].sb_id && !sbIdsNoBanco.includes(equipes[i].sb_id)){
          equipes.splice(i, 1);
        }
      }
      data.forEach(row => {
        const existing = equipes.find(e => e.sb_id === row.id);
        const membroIds = (row.membros_sb_ids || []).map(sbId => {
          const u = users.find(x => x.sb_id === sbId);
          return u ? u.id : null;
        }).filter(Boolean);
        const gestorLocal=users.find(u=>u.sb_id===row.gestor_sb_id);
        const repLocal=users.find(u=>u.sb_id===row.representante_sb_id);
        const supLocal=users.find(u=>u.sb_id===row.supervisor_sb_id);
        const mapped = {
          id: existing ? existing.id : (nextEquipeId++),
          sb_id: row.id,
          nome: row.nome || '',
          descricao: row.descricao || '',
          membroIds,
          foto: row.foto_url || null,
          gestorId: gestorLocal?.id || null,
          representanteId: repLocal?.id || null,
          supervisorId: supLocal?.id || existing?.supervisorId || null,
          meta: parseFloat(row.meta) || 0,
          periodo: row.periodo || 'mensal',
          status: row.status || 'ativa',
        };
        if (existing) { Object.assign(existing, mapped); }
        else { equipes.push(mapped); }
      });
      window.nextEquipeId = nextEquipeId;
    } catch(e) { console.warn('loadEquipes error:', e); }
  };

  // ── HIERARQUIAS ────────────────────────────────────────────────────────────
  window._syncHierarquia = async function(h) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return;
    const payload = {
      empresa_id: empresaId,
      slug: h.slug || '',
      nome: h.nome || '',
      descricao: h.descricao || '',
      ordem: h.ordem || 1,
      superior_id: h.superiorId || null,
      status: h.status || 'ativa',
      perms: h.perms ? JSON.stringify(h.perms) : null,
      updated_at: new Date().toISOString()
    };
    if (h.sb_id) {
      payload.id = h.sb_id;
      const { data, error } = await window._sb.from('hierarquias').upsert(payload, { onConflict: 'id' }).select().single();
      if (!error && data) h.sb_id = data.id;
    } else {
      const { data, error } = await window._sb.from('hierarquias').insert(payload).select().single();
      if (!error && data) h.sb_id = data.id;
    }
  };

  window._loadHierarquias = async function() {
    try {
      const _empIdH=await window._getEmpresaId();
      if(!_empIdH){console.error('[Security] _loadHierarquias: empresaId null — abortando');return;}
      let _hQ=window._sb.from('hierarquias').select('*').order('ordem');
      _hQ=_hQ.eq('empresa_id',_empIdH); // SEMPRE filtra
      const { data, error } = await _hQ;
      if (error || !data || !data.length) return;
      // Bug #4: preserva IDs locais existentes para não invalidar referências por hierarquiaId numérico
      const oldHiers=hierarquias.slice();
      hierarquias.splice(0);
      data.forEach((row) => {
        // Tenta reusar ID local existente pelo sb_id
        const existing=oldHiers.find(h=>h.sb_id===row.id);
        const localId=existing?existing.id:(nextHierArquiaId++);
        hierarquias.push({
          id: localId,
          sb_id: row.id,
          slug: row.slug || '',
          nome: row.nome || '',
          descricao: row.descricao || '',
          ordem: row.ordem || localId,
          superiorId: row.superior_id || null,
          status: row.status || 'ativa',
          perms: row.perms ? JSON.parse(row.perms) : {},
        });
      });
    } catch(e) { console.warn('loadHierarquias error:', e); }
  };

  // ── ADMINISTRADORAS ────────────────────────────────────────────────────────
  window._syncAdministradora = async function(a) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return;
    const payload = {
      empresa_id: empresaId,
      nome: a.nome || '',
      logo_url: a.logo || null,
      grupos: a.grupos ? JSON.stringify(a.grupos) : null,
      ativa: a.ativa !== false,
      taxa_fin: a.taxaFin || 2.42,
      updated_at: new Date().toISOString()
    };
    if (a.sb_id) {
      payload.id = a.sb_id;
      const { data, error } = await window._sb.from('administradoras').upsert(payload, { onConflict: 'id' }).select().single();
      if (!error && data) a.sb_id = data.id;
    } else {
      const { data, error } = await window._sb.from('administradoras').insert(payload).select().single();
      if (!error && data) a.sb_id = data.id;
    }
  };

  window._loadAdministradoras = async function() {
    try {
      const _empIdA=await window._getEmpresaId();
      if(!_empIdA){console.error('[Security] _loadAdministradoras: empresaId null — abortando');return;}
      let _aQ=window._sb.from('administradoras').select('*').order('nome');
      _aQ=_aQ.eq('empresa_id',_empIdA); // SEMPRE filtra
      const { data, error } = await _aQ;
      if (error || !data || !data.length) return;
      administradoras.splice(0); // limpa sem quebrar referência
      data.forEach((row, idx) => {
        administradoras.push({
          id: idx + 1,
          sb_id: row.id,
          nome: row.nome || '',
          logo: row.logo_url || null,
          grupos: row.grupos ? JSON.parse(row.grupos) : [],
          ativa: row.ativa !== false,
          taxaFin: parseFloat(row.taxa_fin) || 2.42,
        });
      });
      nextAdminId = administradoras.length + 1;
      window.nextAdminId = nextAdminId;
    } catch(e) { console.warn('loadAdministradoras error:', e); }
  };

  // ── EVENTOS DO CALENDÁRIO ──────────────────────────────────────────────────
  window._syncEvento = async function(ev) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) { console.warn('[_syncEvento] sem empresaId, abortando'); return; }
    const lead = leads.find(l => l.id === ev.leadId);
    const payload = {
      empresa_id: empresaId,
      user_id: window._currentUserId || null,
      lead_id: lead?.sb_id || null,
      lead_nome: ev.leadNome || '',
      tipo: ev.tipo || 'reuniao',
      data: ev.data || new Date().toISOString().split('T')[0],
      hora_ini: ev.horaIni || '',
      hora_fim: ev.horaFim || '',
      obs: ev.obs || '',
      updated_at: new Date().toISOString()
    };
    if (ev.sb_id) {
      payload.id = ev.sb_id;
      const { data, error } = await window._sb.from('eventos_calendario').upsert(payload, { onConflict: 'id' }).select().single();
      if (!error && data) ev.sb_id = data.id;
    } else {
      const { data, error } = await window._sb.from('eventos_calendario').insert(payload).select().single();
      if (!error && data) ev.sb_id = data.id;
    }
  };

  window._deleteEvento = async function(sb_id) {
    if (!sb_id) return;
    await window._sb.from('eventos_calendario').delete().eq('id', sb_id);
  };

  window._loadEventos = async function() {
    try {
      const _empIdEv=await window._getEmpresaId();
      if(!_empIdEv){console.error('[Security] _loadEventos: empresaId null — abortando');return;}
      let _evQ=window._sb.from('eventos_calendario').select('*').order('data');
      _evQ=_evQ.eq('empresa_id',_empIdEv); // SEMPRE filtra
      const { data, error } = await _evQ;
      if (error || !data) return;
      eventos.splice(0); nextEventoId = 1;
      data.forEach(row => {
        const lead = leads.find(l => l.sb_id === row.lead_id);
        eventos.push({
          id: nextEventoId++,
          sb_id: row.id,
          leadId: lead ? lead.id : null,
          leadNome: row.lead_nome || '',
          tipo: row.tipo || 'reuniao',
          data: row.data || '',
          horaIni: row.hora_ini || '',
          horaFim: row.hora_fim || '',
          obs: row.obs || '',
        });
      });
      window.nextEventoId = nextEventoId;
    } catch(e) { console.warn('loadEventos error:', e); }
  };

  // ── VENDAS (histórico) ─────────────────────────────────────────────────────
  window._registrarVenda = async function(lead, userId) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return;
    const user = users.find(u => u.id === userId);
    const userSbId = user?.sb_id || null;
    const valorCredito = lead?.credito || 0;

    // 1) Registra a venda na tabela de histórico
    await window._sb.from('vendas').insert({
      empresa_id: empresaId,
      user_id: userSbId,
      lead_id: lead?.sb_id || null,
      cliente_nome: lead?.nome || '',
      valor_credito: valorCredito,
      data_fechamento: new Date().toISOString().split('T')[0],
    });

    // 2) Incrementa atomicamente no banco
    if(userSbId){
      const {error:rpcError} = await window._sb.rpc('increment_user_stats', {
        p_user_id: userSbId,
        p_vendas: 1,
        p_credito: valorCredito
      });
      if(rpcError){
        const {data:cur}=await window._sb.from('profiles').select('vendas,credito').eq('id',userSbId).single();
        if(cur){
          await window._sb.from('profiles').update({
            vendas:(cur.vendas||0)+1,
            credito:(cur.credito||0)+valorCredito,
            updated_at:new Date().toISOString()
          }).eq('id',userSbId);
        }
      }
    }
  };

  // Sincroniza leads "Fechado / Convertido" que não têm linha na tabela vendas
  // Roda uma vez após o carregamento para corrigir histórico incompleto
  window._sincronizarVendasHistoricas = async function() {
    const empresaId = await window._getEmpresaId().catch(()=>null);
    if(!empresaId||!window._sb) return;
    // Busca todos os leads convertidos da empresa
    const {data:leadsConv,error:e1} = await window._sb.from('leads')
      .select('id,responsavel_id,credito,updated_at,created_at')
      .eq('empresa_id', empresaId)
      .eq('etapa', 'Fechado / Convertido');
    if(e1||!leadsConv||!leadsConv.length) return;
    // Busca todos os lead_id já registrados na tabela vendas
    const {data:vendasExist,error:e2} = await window._sb.from('vendas')
      .select('lead_id')
      .eq('empresa_id', empresaId)
      .not('lead_id','is',null);
    if(e2) return;
    const jaRegistrados = new Set((vendasExist||[]).map(v=>v.lead_id));
    // Filtra os que ainda não têm registro
    const faltando = leadsConv.filter(l => !jaRegistrados.has(l.id));
    if(!faltando.length){ console.log('[SincVendas] Tudo ok, nada faltando.'); return; }
    console.log('[SincVendas] Inserindo',faltando.length,'vendas históricas faltando...');
    // Insere em lote
    const inserts = faltando.map(l => ({
      empresa_id: empresaId,
      user_id: l.responsavel_id || null,
      lead_id: l.id,
      cliente_nome: '',
      valor_credito: l.credito || 0,
      // usa updated_at do lead como data de fechamento (melhor estimativa)
      data_fechamento: (l.updated_at || l.created_at || new Date().toISOString()).split('T')[0],
    }));
    const {error:e3} = await window._sb.from('vendas').insert(inserts);
    if(e3) console.warn('[SincVendas] Erro ao inserir histórico:',e3);
    else {
      console.log('[SincVendas] Histórico sincronizado com sucesso.');
      // Invalida cache para refletir os novos registros
      _rankVendasCache={periodo:null,data:null,resultado:null};
      _rankOverride=null;
      if(document.getElementById('tab-ranking')?.classList.contains('active')){
        _aplicarFiltroVendas();
      }
    }
  };

  window._estornarVenda = async function(lead) {
    if (!lead?.sb_id) return;
    // Busca a venda antes de deletar para estornar o valor correto
    let vendaRow = null;
    try{ const r=await window._sb.from('vendas').select('user_id,valor_credito').eq('lead_id',lead.sb_id).single(); vendaRow=r.data; }catch(e){}
    await window._sb.from('vendas').delete().eq('lead_id', lead.sb_id);
    // Decrementa atomicamente no banco
    if(vendaRow?.user_id){
      let cur = null;
      try{ const r=await window._sb.from('profiles').select('vendas,credito').eq('id',vendaRow.user_id).single(); cur=r.data; }catch(e){}
      if(cur){
        await window._sb.from('profiles').update({
          vendas:Math.max(0,(cur.vendas||0)-1),
          credito:Math.max(0,(cur.credito||0)-(vendaRow.valor_credito||0)),
          updated_at:new Date().toISOString()
        }).eq('id',vendaRow.user_id);
      }
    }
  };

  // ── ATIVIDADES (histórico sincronizado) ────────────────────────────────────
  // Salva uma atividade no banco e adiciona ao array local
  window._saveAtividade = async function(icon, text, targetUserId) {
    try {
      const empresaId = await window._getEmpresaId();
      if (!empresaId) return;
      const me = window.getMe ? window.getMe() : null;
      const payload = {
        empresa_id: empresaId,
        user_id: targetUserId || me?.sb_id || null,
        icon: icon || 'ti-activity',
        text: text || '',
      };
      await window._sb.from('atividades').insert(payload);
      // Adiciona local imediatamente para quem gerou (feedback instantâneo)
      if (window.activities) {
        window.activities.unshift({ icon, text, time: 'Agora', _userId: payload.user_id });
        try { window.renderNotifPanel && window.renderNotifPanel(); } catch(e) {}
        try { window.renderDashboard && window.renderDashboard(); } catch(e) {}
      }
    } catch(e) { console.warn('[_saveAtividade]', e); }
  };

  // Carrega atividades do banco (respeitando visibilidade por role)
  window._loadAtividades = async function() {
    try {
      const empresaId = await window._getEmpresaId();
      if (!empresaId) return;
      const me = window.getMe ? window.getMe() : null;
      const role = me?.role || 'vendedor';

      let q = window._sb.from('atividades').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(50);

      if (['master','admin','gestor'].includes(role)) {
        // Gestor, admin e master: veem TUDO da empresa — sem filtro adicional

      } else if (role === 'supervisor') {
        // Supervisor: vê atividades dos membros das equipes que supervisiona + as próprias
        const minhasEquipes = (window.equipes||[]).filter(e => e.supervisorId === me?.id);
        const membrosIds = minhasEquipes.flatMap(e => e.membroIds||[]);
        const todosIds = [...new Set([me?.id, ...membrosIds].filter(Boolean))];
        // Busca sb_ids desses usuários locais
        const sbIds = todosIds.map(lid => (window.users||[]).find(u=>u.id===lid)?.sb_id).filter(Boolean);
        if (sbIds.length) q = q.in('user_id', sbIds);
        else if (me?.sb_id) q = q.eq('user_id', me.sb_id);

      } else if (role === 'representante') {
        // Representante: vê as próprias + dos supervisores das equipes que participa
        const minhaEquipe = (window.equipes||[]).find(e=>(e.membroIds||[]).includes(me?.id));
        const supLocal = minhaEquipe ? (window.users||[]).find(u=>u.id===minhaEquipe.supervisorId) : null;
        const ids = [me?.sb_id, supLocal?.sb_id].filter(Boolean);
        if (ids.length) q = q.in('user_id', ids);
        else if (me?.sb_id) q = q.eq('user_id', me.sb_id);

      } else {
        // Vendedor / consultor / outros: só as próprias
        if (me?.sb_id) q = q.eq('user_id', me.sb_id);
      }

      const { data, error } = await q;
      if (error || !data) return;
      // Mapeia timestamps para label legível
      function _ageLabel(ts) {
        if (!ts) return 'Agora';
        const d = new Date(ts), now = new Date(), diff = Math.floor((now - d) / 60000);
        if (diff < 1) return 'Agora';
        if (diff < 60) return `${diff}min atrás`;
        if (diff < 1440) return `${Math.floor(diff/60)}h atrás`;
        return `${Math.floor(diff/1440)}d atrás`;
      }
      window.activities = data.map(r => ({ sb_id: r.id, icon: r.icon, text: r.text, time: _ageLabel(r.created_at), _userId: r.user_id }));
      try { window.renderNotifPanel && window.renderNotifPanel(); } catch(e) {}
      try { window.renderDashboard && window.renderDashboard(); } catch(e) {}
    } catch(e) { console.warn('[_loadAtividades]', e); }
  };

  // ── EMPRESA (dados gerais) ─────────────────────────────────────────────────
  window._syncEmpresa = async function() {
    const empresaId = await window._getEmpresaId();
    if (!empresaId || !window.empresa) return;
    await window._sb.from('empresas').update({
      nome: window.empresa.nome || '',
      logo_url: window.empresa.logo || null,
      whatsapp: window.empresa.whatsapp || '',
      email: window.empresa.email || '',
      updated_at: new Date().toISOString()
    }).eq('id', empresaId);
  };

  window._loadEmpresa = async function() {
    try {
      // usa _getEmpresaId que já tem fallback ao banco
      const empresaId = await window._getEmpresaId();
      if (!empresaId) return;
      const { data, error } = await window._sb.from('empresas').select('*').eq('id', empresaId).single();
      if (error || !data) return;
      window.empresa = {
        nome: data.nome || 'Minha Empresa',
        logo: data.logo_url || null,
        whatsapp: data.whatsapp || '',
        email: data.email || '',
      };
    } catch(e) { console.warn('loadEmpresa error:', e); }
  };

  // ── CARREGAMENTO INICIAL COMPLETO ──────────────────────────────────────────
  window._loadAllData = async function() {
    // Limpa os arrays SEM trocar a referência (splice preserva window.X === localVar)
    leads.splice(0); window.nextLeadId = 1; nextLeadId = 1;
    lances.splice(0); window.nextLanceId = 1; nextLanceId = 1;
    equipes.splice(0); window.nextEquipeId = 1; nextEquipeId = 1;
    eventos.splice(0); window.nextEventoId = 1; nextEventoId = 1;

    await window._loadEmpresa().catch(e=>console.warn('[_loadAllData] loadEmpresa error:',e));
    await window._loadHierarquias().catch(e=>console.warn('[_loadAllData] loadHierarquias error:',e));
    // Após carregar hierarquias, sempre reaplicar hperms de todos os usuários da hierarquia
    // As permissões são SEMPRE da hierarquia — não há override individual
    if(window.users && window.hierarquias){
      window.users.forEach(u=>{
        const h=window.hierarquias.find(x=>x.sb_id===u.hierarquiaId||x.id===u.hierarquiaId);
        if(h&&h.perms){
          u.hperms={...h.perms};
        }
      });
    }
    await window._loadAdministradoras().catch(e=>console.warn('[_loadAllData] loadAdministradoras error:',e));
    await window._loadEquipes().catch(e=>console.warn('[_loadAllData] loadEquipes error:',e));
    await window._loadLeads().catch(e=>console.warn('[_loadAllData] loadLeads error:',e));
    await window._loadLances().catch(e=>console.warn('[_loadAllData] loadLances error:',e));
    await window._loadEventos().catch(e=>console.warn('[_loadAllData] loadEventos error:',e));
    await window._loadAtividades().catch(e=>console.warn('[_loadAllData] loadAtividades error:',e));
    // Garante hperms do usuário logado sempre aplicados após todos os dados carregados
    try{window._ensureMeHperms&&window._ensureMeHperms();}catch(e){}
    // Bug #9: applyNavPermissions APÓS carregar hierarquias E equipes (supervisor precisa das equipes)
    try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}

    try { window.renderDashboard && window.renderDashboard(); } catch(e) {}
    try { window.renderKanban && window.renderKanban(); } catch(e) {}
    try { window.renderTable && window.renderTable(); } catch(e) {}
    try { window.renderRanking && window.renderRanking(); } catch(e) {}
    try { window.renderCalendario && window.renderCalendario(); } catch(e) {}
    try { window.renderLances && window.renderLances(); } catch(e) {}
    try { window.renderUserList && window.renderUserList(); } catch(e) {}
    try { window.populateSelects && window.populateSelects(); } catch(e) {}
    try { window.rankAtualizarSidebar && window.rankAtualizarSidebar(); } catch(e) {}
  };

  // ── Helper: retorna empresaId do usuário logado, com fallback ao Supabase ───
  window._getEmpresaId = async function() {
    // Prioridade 1: direto do profilesLoad (mais rápido)
    if (window._empresaIdDireto) return window._empresaIdDireto;
    // Prioridade 2: do usuário local
    const me = window.users && window.users.find(u => u.sb_id === window._currentUserId);
    if (me?.empresaId) return me.empresaId;
    // Fallback: fetch from DB
    try {
      const {data} = await window._sb.from('profiles').select('empresa_id').eq('id', window._currentUserId).single();
      if (data?.empresa_id) {
        window._empresaIdDireto = data.empresa_id; // cache
        if (me) me.empresaId = data.empresa_id;
        return data.empresa_id;
      }
    } catch(e) {}
    console.warn('[_getEmpresaId] empresa_id não encontrado para uid:', window._currentUserId);
    return null;
  };

  // ── 4. Realtime: escuta mudanças na tabela profiles e hierarquias ──────────
  window.addEventListener('load',function(){
    // Aguarda empresa_id antes de assinar canais para filtrar por empresa
    const _subscribeRealtime=function(){
      const _empFilter=window._empresaIdDireto;
      const _profFilter=_empFilter?`empresa_id=eq.${_empFilter}`:undefined;

      // Remove canais existentes para evitar duplicatas ao re-assinar
      try{
        const _chNames=['profiles-sync','hierarquias-sync','leads-sync','lances-sync','atividades-sync','vendas-sync'];
        _chNames.forEach(function(name){
          const _existing=window._sb.getChannels&&window._sb.getChannels().find(function(c){return c.topic&&c.topic.includes(name);});
          if(_existing){try{window._sb.removeChannel(_existing);}catch(e){}}
        });
      }catch(e){console.warn('[Realtime] cleanup canais:',e);}

      // Realtime profiles (filtrado por empresa) → re-renderiza ranking e dashboard
      const _profChanOpts={event:'*',schema:'public',table:'profiles'};
      if(_profFilter) _profChanOpts.filter=_profFilter;
      window._sb.channel('profiles-sync')
        .on('postgres_changes',_profChanOpts,async function(){
          await window._loadProfiles();
          // Vendas são salvas no profile — precisa re-renderizar ranking e dashboard
          try{window.renderRanking&&window.renderRanking();}catch(e){}
          try{window.renderDashboard&&window.renderDashboard();}catch(e){}
          try{window.renderUserList&&window.renderUserList();}catch(e){}
        })
        .subscribe();

      // Realtime hierarquias (filtrado por empresa)
      const _hierChanOpts={event:'*',schema:'public',table:'hierarquias'};
      if(_profFilter) _hierChanOpts.filter=_profFilter;
      window._sb.channel('hierarquias-sync')
        .on('postgres_changes',_hierChanOpts,async function(payload){
        await window._loadHierarquias();
        // Reaplicar hperms de todos os usuários locais com base nas hierarquias atualizadas
        // e re-persistir no banco para que reload futuro leia correto
        if(window.users && window.hierarquias){
          const me=window.getMe&&window.getMe();
          window.users.forEach(u=>{
            const h=window.hierarquias.find(x=>x.sb_id===u.hierarquiaId||String(x.id)===String(u.hierarquiaId));
            if(h&&h.perms){
              u.hperms={...h.perms};
              // Re-persiste hperms no banco para todos os admins/gestores/supervisores logados
              // OU quando o usuário afetado é o próprio usuário logado
              const isMe=me&&u.sb_id===me.sb_id;
              const podeResyncar=me&&(me.role==='master'||me.role==='gestor'||me.role==='supervisor'||me.role==='administrador');
              if(window._syncUser && (isMe||podeResyncar)){
                window._syncUser(u).catch(e=>console.warn('[hierarquias-sync] re-sync user error:',e));
              }
            }
          });
        }
        // Reaplicar nav, config e ranking em tempo real
        try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
        try{window.renderConfig&&window.renderConfig();}catch(e){}
        try{window.renderRanking&&window.renderRanking();}catch(e){}
        try{window.renderUserList&&window.renderUserList();}catch(e){}
        console.log('[hierarquias-sync] permissões atualizadas em tempo real');
      })
      .subscribe();

      // Realtime leads (filtrado por empresa) → atualiza dashboard, funil e tabela
      // Debounce: agrupa eventos em rajada (ex: importação em lote) em uma única recarga
      let _leadsRealtimeTimer=null;
      let _leadsRealtimeDeletes=[];
      const _flushLeadsRealtime=async function(){
        _leadsRealtimeTimer=null;
        if(_leadsRealtimeDeletes.length>0){
          _leadsRealtimeDeletes.forEach(function(sid){
            const idx=leads.findIndex(function(l){return l.sb_id===sid;});
            if(idx!==-1) leads.splice(idx,1);
          });
          _leadsRealtimeDeletes=[];
        } else {
          await window._loadLeads();
        }
        try{window.renderDashboard&&window.renderDashboard();}catch(e){}
        try{window.renderKanban&&window.renderKanban();}catch(e){}
        try{window.renderTable&&window.renderTable();}catch(e){}
        try{window.renderRanking&&window.renderRanking();}catch(e){}
      };
      const _leadsChanOpts={event:'*',schema:'public',table:'leads'};
      if(_profFilter) _leadsChanOpts.filter=_profFilter;
      window._sb.channel('leads-sync')
        .on('postgres_changes',_leadsChanOpts,function(payload){
          if(payload.eventType==='DELETE'&&payload.old?.id){
            _leadsRealtimeDeletes.push(payload.old.id);
          }
          // Debounce de 1.5s — espera a rajada de INSERTs terminar antes de recarregar
          if(_leadsRealtimeTimer) clearTimeout(_leadsRealtimeTimer);
          _leadsRealtimeTimer=setTimeout(_flushLeadsRealtime,1500);
        })
        .subscribe();

      // Realtime lances (filtrado por empresa) → atualiza painel de lances e ranking
      const _lancesChanOpts={event:'*',schema:'public',table:'lances'};
      if(_profFilter) _lancesChanOpts.filter=_profFilter;
      window._sb.channel('lances-sync')
        .on('postgres_changes',_lancesChanOpts,async function(){
          await window._loadLances();
          try{window.renderLances&&window.renderLances();}catch(e){}
          try{window.renderRanking&&window.renderRanking();}catch(e){}
          try{window.renderDashboard&&window.renderDashboard();}catch(e){}
        })
        .subscribe();

      // Realtime vendas → quando qualquer vendedor registra venda, atualiza ranking imediatamente
      const _vendasChanOpts={event:'INSERT',schema:'public',table:'vendas'};
      if(_profFilter) _vendasChanOpts.filter=_profFilter;
      window._sb.channel('vendas-sync')
        .on('postgres_changes',_vendasChanOpts,async function(payload){
          // Recarrega profiles para pegar vendas/credito atualizados
          await window._loadProfiles();
          // Invalida cache de período para refletir nova venda no filtro ativo
          _rankVendasCache={periodo:null,data:null,resultado:null};
          if(window._rankVendasCache) window._rankVendasCache=_rankVendasCache;
          try{window._aplicarFiltroVendas?window._aplicarFiltroVendas():window.renderRanking&&window.renderRanking();}catch(e){}
          try{window.renderDashboard&&window.renderDashboard();}catch(e){}
        })
        .subscribe();

      // Realtime atividades → atualiza feed e notificações para toda a empresa
      const _atChanOpts={event:'INSERT',schema:'public',table:'atividades'};
      if(_profFilter) _atChanOpts.filter=_profFilter;
      window._sb.channel('atividades-sync')
        .on('postgres_changes',_atChanOpts,async function(){
          await window._loadAtividades();
        })
        .subscribe();

    }; // fim _subscribeRealtime

    // Tenta assinar imediatamente se empresa_id já disponível, senão aguarda até 3s
    if(window._empresaIdDireto){
      _subscribeRealtime();
    } else {
      const _rtWait=setInterval(function(){
        if(window._empresaIdDireto){clearInterval(_rtWait);_subscribeRealtime();}
      },300);
      // Se após 3s ainda não tem empresa_id, NÃO assina realtime sem filtro
      // (evita vazar dados de outras empresas). Vai assinar quando empresa_id aparecer.
      setTimeout(function(){
        clearInterval(_rtWait);
        if(!window._empresaIdDireto){
          console.warn('[Realtime] empresa_id não disponível após 3s — realtime não assinado. Aguardando...');
          // Continua tentando a cada 2s indefinidamente
          const _rtRetry=setInterval(function(){
            if(window._empresaIdDireto){clearInterval(_rtRetry);_subscribeRealtime();}
          },2000);
        }
      },3000);
    }
  });

  // ── 5. Garante hierarquia padrão para empresa sem hierarquias no banco ─────
  window._ensureHierarquiasPadrao = async function() {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return;
    try {
      const {data, error} = await window._sb.from('hierarquias').select('id').eq('empresa_id', empresaId).limit(1);
      if (error || (data && data.length > 0)) return; // já tem hierarquias

      // Cria hierarquias padrão para esta empresa
      const allPermsFalse = () => Object.fromEntries(allHPermIds().map(id=>[id,false]));
      const allPermsTrue  = () => Object.fromEntries(allHPermIds().map(id=>[id,true]));
      const supervisorPerms = () => {
        const p = allPermsFalse();
        ['leads_view','leads_create','leads_edit','funil_view','funil_move',
         'simulador_view','lances_view','ranking_view','config_view',
         'equipe_add','equipe_edit','equipe_view'].forEach(k=>{if(k in p) p[k]=true;});
        return p;
      };
      const vendedorPerms = () => {
        const p = allPermsFalse();
        ['leads_view','leads_create','leads_edit','funil_view','funil_move',
         'simulador_view','lances_view','ranking_view'].forEach(k=>{if(k in p) p[k]=true;});
        return p;
      };

      const padroes = [
        {slug:'gestor',     nome:'Gestor',      descricao:'Acesso total à empresa',        ordem:1, perms:allPermsTrue()},
        {slug:'supervisor', nome:'Supervisor',   descricao:'Gerencia equipe e leads',       ordem:2, perms:supervisorPerms()},
        {slug:'representante',nome:'Representante',descricao:'Acesso padrão de vendas',    ordem:3, perms:vendedorPerms()},
        {slug:'vendedor',   nome:'Vendedor',     descricao:'Acesso básico ao funil',        ordem:4, perms:vendedorPerms()},
      ];

      for(const h of padroes){
        await window._sb.from('hierarquias').insert({
          empresa_id: empresaId,
          slug: h.slug, nome: h.nome, descricao: h.descricao,
          ordem: h.ordem, status: 'ativa',
          perms: JSON.stringify(h.perms),
          updated_at: new Date().toISOString()
        });
      }
      console.log('[_ensureHierarquiasPadrao] hierarquias padrão criadas para empresa', empresaId);
      await window._loadHierarquias();
    } catch(e) { console.warn('[_ensureHierarquiasPadrao] erro:', e); }
  };
})();

// Camada de dados (Supabase): sessão, carregamento, salvamento e tempo real.
// Regras de acesso ficam no banco (RLS). Aqui o CRM só lê o que a pessoa pode ver
// e grava o que a pessoa pode alterar — cargo, empresa e contadores de vendas são
// sempre definidos pelo servidor.
(function(){
  const SB_URL='https://uekeeutycmqsswrhspwv.supabase.co';
  const SB_KEY='sb_publishable_nJ-BnFkD8sG8mv4f7Uc-Uw_v87ZOIl9';
  const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVla2VldXR5Y21xc3N3cmhzcHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDYyNDgsImV4cCI6MjEwNjk4MjI0OH0.h3YeJbSPCbWfEYF-bjV71-KA-WQ9bAf9mBxO4EWtUBs';
  window._sbUrl=SB_URL;
  window._sbAnon=SB_ANON;
  window._sb=supabase.createClient(SB_URL,SB_KEY);
  const sb=window._sb;

  // ── INATIVIDADE OBRIGATÓRIA — 30 dias sem uso → logout ────────────────────
  (function(){
    const INATIV_KEY='evolux_last_active';
    const INATIV_LIMIT=30*24*60*60*1000;
    const agora=Date.now();
    const ultimo=parseInt(localStorage.getItem(INATIV_KEY)||'0');
    if(ultimo&&(agora-ultimo)>INATIV_LIMIT){
      localStorage.removeItem(INATIV_KEY);
      sb.auth.signOut().finally(()=>{window.location.href='index.html?motivo=inatividade';});
      return;
    }
    function atualizarAtividade(){localStorage.setItem(INATIV_KEY,Date.now().toString());}
    atualizarAtividade();
    ['click','keydown','touchstart'].forEach(ev=>{
      document.addEventListener(ev,atualizarAtividade,{passive:true});
    });
    setInterval(function(){
      const ts=parseInt(localStorage.getItem(INATIV_KEY)||'0');
      if(ts&&(Date.now()-ts)>INATIV_LIMIT){
        sb.auth.signOut().finally(()=>{window.location.href='index.html?motivo=inatividade';});
      }
    },60*60*1000);
  })();

  // ── Utilitários de acesso ao banco ─────────────────────────────────────────
  // Busca TODAS as linhas em páginas de 1000 (o Supabase devolve no máximo 1000 por vez).
  // "montar" precisa devolver uma consulta nova a cada chamada, já com .order().
  // A 1ª página vem sozinha; se vier cheia, as próximas são buscadas 6 de cada vez
  // em paralelo (empresa com 60 mil leads abre em segundos, não em dezenas de segundos).
  window._sbTodos=async function(montar,tamanho){
    tamanho=tamanho||1000;
    const pagina=async de=>{
      const {data,error}=await montar().range(de,de+tamanho-1);
      if(error) throw error;
      return data||[];
    };
    const out=await pagina(0);
    if(out.length<tamanho) return out;
    const PARALELO=6;
    for(let de=tamanho;de<500000;de+=tamanho*PARALELO){
      const pags=await Promise.all(Array.from({length:PARALELO},(_,k)=>pagina(de+k*tamanho)));
      let fim=false;
      for(const p of pags){ out.push(...p); if(p.length<tamanho){ fim=true; break; } }
      if(fim) break;
    }
    return out;
  };

  function _erroDeRede(err){
    const m=String((err&&(err.message||err))||'').toLowerCase();
    return !err||m.includes('fetch')||m.includes('network')||m.includes('timeout')||m.includes('load failed')||m.includes('503')||m.includes('502');
  }
  function _msgErro(err){
    const m=String((err&&(err.message||err))||'');
    if(/PLANO SUSPENSO/i.test(m)) return 'o plano da empresa está suspenso (CRM só para consulta)';
    if(/row-level security|permission denied|42501/i.test(m)) return 'sem permissão para esta alteração';
    return m||'erro desconhecido';
  }
  window._msgErro=_msgErro;

  // Alterações que não chegaram ao banco ficam aqui e são reenviadas
  window._pendentes=new Map();
  function _avisoPendentes(){
    let el=document.getElementById('evx-pendentes');
    const n=window._pendentes.size;
    if(!n){ if(el) el.remove(); return; }
    if(!el){
      el=document.createElement('div');
      el.id='evx-pendentes';
      el.style.cssText='position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#b45309;color:#fff;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;z-index:10001;box-shadow:0 4px 18px rgba(0,0,0,.25);cursor:pointer';
      el.onclick=()=>window._tentarPendentes&&window._tentarPendentes(true);
      document.body.appendChild(el);
    }
    el.textContent=`⚠ ${n} alteraç${n>1?'ões':'ão'} ainda não salva${n>1?'s':''} no servidor — tentando de novo (clique para tentar agora)`;
  }
  window._registrarFalha=function(chave,descricao,refazer,err){
    if(_erroDeRede(err)){
      window._pendentes.set(chave,{descricao,refazer});
      _avisoPendentes();
    } else if(typeof showToast==='function'){
      showToast(`Não foi possível salvar ${descricao}: ${_msgErro(err)}.`,'ti-alert-triangle','#dc2626');
    }
  };
  window._limparPendente=function(chave){ if(window._pendentes.delete(chave)) _avisoPendentes(); };
  let _tentando=false;
  window._tentarPendentes=async function(manual){
    if(_tentando||!window._pendentes.size) return;
    _tentando=true;
    for(const [chave,p] of [...window._pendentes]){
      try{ await p.refazer(); }catch(e){}
    }
    _tentando=false;
    _avisoPendentes();
    if(manual&&!window._pendentes.size&&typeof showToast==='function') showToast('Tudo salvo!','ti-check');
  };
  window.addEventListener('online',()=>window._tentarPendentes());
  setInterval(()=>window._tentarPendentes(),30000);
  window.addEventListener('beforeunload',function(e){
    if(window._pendentes.size){ e.preventDefault(); e.returnValue='Há alterações ainda não salvas.'; return e.returnValue; }
  });

  // Chama uma função do servidor (RPC) e devolve {data,error}
  window._rpc=async function(nome,params){
    try{ return await sb.rpc(nome,params||{}); }
    catch(e){ return {data:null,error:e}; }
  };

  // ── Perfis ─────────────────────────────────────────────────────────────────
  function _jsonSeguro(v){
    if(!v) return {};
    if(typeof v==='object') return v;
    try{ return JSON.parse(v)||{}; }catch(e){ return {}; }
  }
  function sbRowToUser(row){
    return {
      id: 0,
      sb_id: row.id,
      nome: row.nome||'',
      email: row.email||'',
      role: (row.role||'vendedor').toLowerCase(),
      hierarquiaId: row.hierarquia_id||null,
      equipeSbId: row.equipe_id||null,
      equipeId: null,
      managerId: null,
      vendas: row.vendas||0,
      credito: parseFloat(row.credito)||0,
      meta: parseFloat(row.meta)||0,
      foto: row.foto_url||null,
      whatsapp: row.whatsapp||null,
      instagram: row.instagram||null,
      empresaId: row.empresa_id||null,
      ativo: row.ativo!==false,
      perms: {},
      hperms: {}
    };
  }
  // Pessoas removidas saem da lista principal mas o nome continua disponível (histórico)
  window.usersInativos=window.usersInativos||{};
  function mergeProfilesIntoUsers(data){
    const arr=window.users;
    if(!arr||!data) return;
    const vistos=new Set();
    data.forEach(function(row){
      const novo=sbRowToUser(row);
      if(!novo.ativo){
        window.usersInativos[row.id]=novo;
        const i=arr.findIndex(u=>u.sb_id===row.id);
        if(i!==-1&&row.id!==window._currentUserId) arr.splice(i,1);
        return;
      }
      vistos.add(row.id);
      const local=arr.find(u=>u.sb_id===row.id||(!u.sb_id&&u.email&&u.email===row.email));
      if(local){
        const idLocal=local.id;
        Object.assign(local,novo,{id:idLocal});
      } else {
        const maxId=Math.max(99,...arr.map(u=>u.id||0));
        novo.id=maxId+1;
        arr.push(novo);
      }
    });
    if(typeof window.nextUserId==='number'){
      window.nextUserId=Math.max(window.nextUserId,...arr.map(u=>(u.id||0)+1));
    }
  }
  window._mergeProfiles=mergeProfilesIntoUsers;

  async function _carregarAcesso(){
    const r=await window._rpc('crm_meu_acesso');
    if(!r.error) return r.data||null;
    // Banco ainda sem a atualização: usa o próprio perfil
    try{
      const {data}=await sb.from('profiles').select('id,nome,email,role,empresa_id').eq('id',window._currentUserId).maybeSingle();
      if(!data) return null;
      return {user_id:data.id,nome:data.nome,role:(data.role||'vendedor').toLowerCase(),ativo:true,empresa_id:data.empresa_id,
              empresa_ativa:true,plataforma:['master','superadmin'].includes((data.role||'').toLowerCase()),_legado:true};
    }catch(e){ return null; }
  }
  window._carregarAcesso=_carregarAcesso;

  async function _todosProfiles(){
    const emp=window._empresaIdDireto;
    if(!emp) return [];
    return window._sbTodos(()=>sb.from('profiles').select('*').eq('empresa_id',emp).order('nome',{ascending:true}).order('id'));
  }

  // ── Recuperação de senha (link do e-mail) ─────────────────────────────────
  var _isPasswordRecovery = window.location.hash.includes('type=recovery');
  window._isPasswordRecovery=function(){return _isPasswordRecovery;};
  sb.auth.onAuthStateChange(function(event){
    if(event==='PASSWORD_RECOVERY'){
      _isPasswordRecovery = true;
      function _showRecoveryModal(){
        var modal = document.getElementById('modal-nova-senha');
        if(modal){
          modal.style.display='flex';
          var sbEl=document.getElementById('sidebar');
          var main=document.querySelector('.main-content');
          if(sbEl) sbEl.style.visibility='hidden';
          if(main) main.style.visibility='hidden';
        }
      }
      if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', _showRecoveryModal);
      else _showRecoveryModal();
    }
  });

  // ── 1. Sessão + perfil + situação de acesso (antes do CRM renderizar) ───────
  window._profilesLoadPromise = sb.auth.getSession().then(async function(res){
    const session=res.data.session;
    if(!session){
      if(!_isPasswordRecovery) window.location.href='index.html';
      return;
    }
    window._session=session;
    window._currentUserId=session.user.id;
    const email=session.user.email||'';
    const nome=session.user.user_metadata?.nome||email.split('@')[0]||'Usuário';

    // Garante que o próprio perfil existe (cargo e empresa são definidos só pelo servidor)
    try{
      const {data:existing}=await sb.from('profiles').select('id').eq('id',session.user.id).maybeSingle();
      if(!existing) await sb.from('profiles').insert({id:session.user.id,email,nome});
    }catch(e){console.warn('[perfil]',e);}

    let acesso=await _carregarAcesso();
    // Cadastro por convite que exigiu confirmar e-mail: aceita o convite agora
    const tokenConvite=session.user.user_metadata?.convite_token;
    if(tokenConvite && acesso && !acesso.empresa_id){
      const r=await window._rpc('crm_aceitar_convite',{p_token:tokenConvite});
      if(r.error) window._erroConvite=r.error.message;
      acesso=await _carregarAcesso();
    }
    if(tokenConvite){ try{ await sb.auth.updateUser({data:{convite_token:null}}); }catch(e){} }
    window._acesso=acesso;
    if(acesso&&acesso.empresa_id) window._empresaIdDireto=acesso.empresa_id;

    try{
      if(window._empresaIdDireto){
        window._pendingProfiles=await _todosProfiles();
      } else {
        const {data}=await sb.from('profiles').select('*').eq('id',session.user.id);
        window._pendingProfiles=data||[];
      }
    }catch(e){console.warn('Load profiles:',e);}
  });

  // ── 2. Recarrega perfis (tempo real) ───────────────────────────────────────
  window._loadProfiles=async function(){
    try{
      if(!window._empresaIdDireto) return;
      const data=await _todosProfiles();
      // Meu cargo/equipe mudou? Então a lista de leads que eu enxergo também muda
      const eu=data.find(r=>r.id===window._currentUserId);
      const meAntes=window.users.find(u=>u.sb_id===window._currentUserId);
      if(eu&&eu.ativo===false){ window._conferirAcesso&&window._conferirAcesso(); }
      const mudouMinhaVisao=!!(eu&&meAntes&&((eu.role||'vendedor').toLowerCase()!==meAntes.role||(eu.hierarquia_id||null)!==(meAntes.hierarquiaId||null)));
      mergeProfilesIntoUsers(data);
      if(mudouMinhaVisao){ setTimeout(async()=>{ await window._loadEquipes(); await window._loadLeads(); try{window._renderTudo&&window._renderTudo();}catch(e){} },0); }
      window._ensureMeHperms&&window._ensureMeHperms();
      try{window.updateSbUser&&window.updateSbUser();}catch(e){}
      try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
      try{window.renderDashboard&&window.renderDashboard();}catch(e){}
      try{window.renderRanking&&window.renderRanking();}catch(e){}
      try{window.renderUserList&&window.renderUserList();}catch(e){}
    }catch(e){console.warn('loadProfiles error:',e);}
  };

  // Permissões sempre vêm da hierarquia (não ficam copiadas no perfil)
  window._ensureMeHperms=function(){
    if(!window.users||!window.hierarquias) return;
    window.users.forEach(u=>{
      const h=window.hierarquias.find(x=>x.sb_id===u.hierarquiaId||String(x.id)===String(u.hierarquiaId));
      u.hperms=h&&h.perms?{...h.perms}:{};
    });
  };

  // ── 3. Salva o PRÓPRIO perfil (só nome, foto, WhatsApp e Instagram) ───────
  window._syncUser=async function(u){
    if(!u||u.sb_id!==window._currentUserId){
      console.warn('[_syncUser] alterações de outras pessoas usam crm_atualizar_membro');
      return false;
    }
    const payload={nome:u.nome,foto_url:u.foto||null,whatsapp:u.whatsapp||null,instagram:u.instagram||null,updated_at:new Date().toISOString()};
    const {data,error}=await sb.from('profiles').update(payload).eq('id',u.sb_id).select('id').maybeSingle();
    if(error||!data){ window._registrarFalha('perfil','seu perfil',()=>window._syncUser(u),error); return false; }
    window._limparPendente('perfil');
    return true;
  };

  // ── LEADS ──────────────────────────────────────────────────────────────────
  function _dataBRparaISO(d){
    if(!d) return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const p=String(d).split('/');
    if(p.length===3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
    return null;
  }
  function _payloadLead(lead){
    const resp=window.users.find(u=>u.id===lead.responsavelId);
    return {
      // sem a pessoa na lista (ex.: dado antigo), mantém quem já estava no banco
      responsavel_id: resp ? resp.sb_id : (lead.responsavelSbId || null),
      nome: lead.nome || '',
      telefone: (typeof normalizaTelefone==='function'?normalizaTelefone(lead.tel):lead.tel) || '',
      tipo: lead.tipo || 'Imóvel',
      credito: lead.credito || 0,
      etapa: lead.etapa || 'Novo lead',
      origem: lead.origem || '',
      atendimento: lead.atendimento || '',
      obs: lead.obs || '',
      administradora: lead.admin || null,
      meta_id: lead.metaId || null,
      data_criacao: _dataBRparaISO(lead.data) || (typeof hojeISO==='function'?hojeISO():new Date().toISOString().slice(0,10)),
      updated_at: new Date().toISOString()
    };
  }
  // Ao salvar um lead cuja observação ainda não foi baixada, não manda o campo
  // (senão a observação que está no banco seria apagada)
  function _payloadLeadSalvar(lead){
    const p=_payloadLead(lead);
    if(lead._obsOk===false) delete p.obs;
    return p;
  }
  // Baixa as observações (campo pesado) só quando precisa: ao abrir o lead ou exportar
  window._carregarObsLeads=async function(lista){
    const falta=(lista||[]).filter(l=>l&&l.sb_id&&l._obsOk===false);
    for(let i=0;i<falta.length;i+=300){
      const parte=falta.slice(i,i+300);
      const {data,error}=await sb.from('leads').select('id,obs').in('id',parte.map(l=>l.sb_id));
      if(error) throw error;
      const porId=new Map((data||[]).map(r=>[String(r.id),r.obs||'']));
      parte.forEach(l=>{ if(porId.has(String(l.sb_id))){ l.obs=porId.get(String(l.sb_id)); l._obsOk=true; } });
    }
  };
  window._payloadLead=_payloadLead;

  // Salva um lead (novo ou existente). Devolve true/false.
  window._syncLead = async function(lead) {
    const empresaId = lead.empresa_id || await window._getEmpresaId();
    if (!empresaId) return false;
    const payload=_payloadLeadSalvar(lead);
    let res;
    try{
      if(lead.sb_id) res=await sb.from('leads').update(payload).eq('id',lead.sb_id).select('id').maybeSingle();
      else res=await sb.from('leads').insert({...payload,empresa_id:empresaId}).select('id').single();
    }catch(e){ res={error:e}; }
    const chave='lead:'+lead.id;
    if(res.error||!res.data){
      window._registrarFalha(chave,`o lead "${lead.nome}"`,()=>window._syncLead(lead),res.error||{message:'sem permissão para alterar este lead'});
      return false;
    }
    lead.sb_id=res.data.id;
    lead.empresa_id=empresaId;
    window._limparPendente(chave);
    return true;
  };

  // O lead ainda está na fila de reenvio (sem conexão)? Então a alteração não se perdeu.
  window._leadPendente=function(lead){ return !!lead&&window._pendentes.has('lead:'+lead.id); };

  // Insere muitos leads de uma vez (importação), em lotes de 200.
  // Devolve {salvos, pendentes (aguardando conexão), falhas:[{lead, erro}]}.
  window._inserirLeadsEmLote=async function(lista,aoProgredir){
    const empresaId=await window._getEmpresaId();
    const out={salvos:0,pendentes:0,falhas:[]};
    if(!empresaId){ out.falhas=lista.map(l=>({lead:l,erro:'empresa não identificada'})); return out; }
    // associa as linhas devolvidas pelo banco aos leads do lote
    const marcar=(lote,rows)=>{
      const livres=rows.slice();
      lote.forEach((l,j)=>{
        const p=_payloadLead(l);
        let k=livres[j]&&livres[j].nome===p.nome?j:-1;
        if(k===-1) k=livres.findIndex(r=>r&&r.nome===p.nome&&r.telefone===p.telefone);
        if(k===-1) k=livres.findIndex(r=>r&&r.nome===p.nome);
        if(k!==-1){ l.sb_id=livres[k].id; l.empresa_id=empresaId; livres[k]=null; }
      });
    };
    const inserir=async lote=>{
      try{ return await sb.from('leads').insert(lote.map(l=>({..._payloadLead(l),empresa_id:empresaId}))).select('id,nome,telefone,meta_id'); }
      catch(e){ return {error:e}; }
    };
    for(let i=0;i<lista.length;i+=200){
      const lote=lista.slice(i,i+200);
      const r=await inserir(lote);
      if(!r.error&&r.data&&r.data.length===lote.length){
        marcar(lote,r.data);
        out.salvos+=lote.length;
      } else if(_erroDeRede(r.error)){
        // sem conexão: o lote inteiro fica guardado e é reenviado sozinho depois
        const chave='importacao:'+lote[0].id;
        window._pendentes.set(chave,{descricao:`${lote.length} leads importados`,refazer:async()=>{
          const r2=await inserir(lote.filter(l=>!l.sb_id));
          if(r2.error||!r2.data) throw r2.error||new Error('falhou');
          marcar(lote.filter(l=>!l.sb_id),r2.data);
          window._limparPendente(chave);
        }});
        _avisoPendentes();
        out.pendentes+=lote.length;
      } else {
        // algum lead do lote foi recusado: salva um a um para aproveitar os demais
        for(const l of lote){
          let r1;
          try{ r1=await sb.from('leads').insert({..._payloadLead(l),empresa_id:empresaId}).select('id').single(); }catch(e){ r1={error:e}; }
          if(!r1.error&&r1.data){ l.sb_id=r1.data.id; l.empresa_id=empresaId; out.salvos++; }
          else out.falhas.push({lead:l,erro:_msgErro(r1.error)});
        }
      }
      if(aoProgredir) aoProgredir(Math.min(i+200,lista.length),lista.length);
    }
    return out;
  };

  window._deleteLead = async function(sb_id) {
    if (!sb_id) return true;
    const {data,error}=await sb.from('leads').delete().eq('id', sb_id).select('id');
    return !error && data && data.length>0;
  };

  function _mapLead(row, existing){
    const resp = window.users.find(u => u.sb_id === row.responsavel_id);
    let etapa=row.etapa||'Novo lead';
    let etapaOriginal=null;
    if(typeof ETAPAS!=='undefined' && !ETAPAS.includes(etapa)){ etapaOriginal=etapa; etapa='Novo lead'; }
    return {
      id: existing ? existing.id : (nextLeadId++),
      sb_id: row.id,
      empresa_id: row.empresa_id || null,
      empresaId: row.empresa_id || null,
      nome: row.nome || '',
      tel: row.telefone || '',
      tipo: row.tipo || 'Imóvel',
      credito: parseFloat(row.credito) || 0,
      etapa,
      etapaOriginal,
      origem: row.origem || '',
      atendimento: row.atendimento || '',
      // a lista principal vem sem a observação (é o campo mais pesado); ela é
      // baixada quando o lead é aberto. Tempo real e cadastro trazem completa.
      obs: ('obs' in row) ? (row.obs || '') : (existing&&existing._obsOk!==false ? (existing.obs||'') : ''),
      _obsOk: ('obs' in row) ? true : !!(existing&&existing._obsOk!==false),
      admin: row.administradora || null,
      metaId: row.meta_id || null,
      data: row.data_criacao ? String(row.data_criacao).slice(0,10).split('-').reverse().join('/') : '',
      // dia em que o lead entrou no CRM (importado hoje aparece em "Hoje", mesmo com data antiga na planilha)
      entrada: row.created_at ? (()=>{const d=new Date(row.created_at);return isNaN(d)?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})() : (existing&&existing.entrada)||'',
      responsavelId: resp ? resp.id : null,
      responsavelSbId: row.responsavel_id || null,
    };
  }

  // Aplica uma mudança vinda do tempo real sem recarregar a base inteira
  // ctx (opcional, usado no processamento em lote): {porSb: Map, gestor, vis}
  window._aplicarLeadRealtime=function(tipo,novo,antigo,ctx){
    if(tipo==='DELETE'){
      const id=antigo&&antigo.id;
      const alvo=ctx?ctx.porSb.get(String(id)):leads.find(l=>l.sb_id===id);
      const i=alvo?leads.indexOf(alvo):-1;
      if(i!==-1){ leads.splice(i,1); if(ctx) ctx.porSb.delete(String(id)); return true; }
      return false;
    }
    if(!novo||!novo.id) return false;
    if(String(novo.empresa_id)!==String(window._empresaIdDireto)) return false;
    // o aviso do tempo real pode chegar antes da resposta do próprio cadastro:
    // reconhece o lead recém-criado nesta tela (ainda sem id do banco)
    const existing=(ctx?ctx.porSb.get(String(novo.id)):leads.find(l=>l.sb_id===novo.id))
      ||(ctx?ctx.semId:leads).find(l=>!l.sb_id&&l.nome===novo.nome&&normalizaTelefone(l.tel)===(novo.telefone||''));
    const mapped=_mapLead(novo,existing);
    // confere se a pessoa ainda pode ver este lead (ex.: transferido para outra equipe)
    let podeVer;
    if(ctx) podeVer=ctx.gestor||ctx.vis.has(mapped.responsavelId);
    else{
      const me=window.getMe&&window.getMe();
      const vis=window.getVisiveisParaMim?window.getVisiveisParaMim():null;
      podeVer=!me||(window.isGestor&&window.isGestor(me))||(vis&&vis.has(mapped.responsavelId));
    }
    if(!podeVer){
      if(existing){ leads.splice(leads.indexOf(existing),1); if(ctx) ctx.porSb.delete(String(novo.id)); return true; }
      return false;
    }
    if(existing) Object.assign(existing,mapped);
    else leads.unshift(mapped); // mais novos primeiro (mesma ordem do carregamento)
    if(ctx) ctx.porSb.set(String(novo.id),existing||mapped);
    return true;
  };
  // Avisos do tempo real chegam em rajadas (importação de milhares de leads):
  // junta tudo a cada 300 ms e aplica de uma vez, com um índice montado só uma vez.
  let _filaLeadsRt=[], _filaLeadsTimer=null;
  function _filaLead(payload){
    _filaLeadsRt.push(payload);
    if(!_filaLeadsTimer) _filaLeadsTimer=setTimeout(_processarFilaLeads,300);
  }
  function _processarFilaLeads(){
    _filaLeadsTimer=null;
    const fila=_filaLeadsRt; _filaLeadsRt=[];
    if(!fila.length) return;
    const me=window.getMe&&window.getMe();
    const ctx={porSb:new Map(), gestor:!me||(window.isGestor&&window.isGestor(me)),
               vis:window.getVisiveisParaMim?window.getVisiveisParaMim():new Set()};
    ctx.semId=[];
    leads.forEach(l=>{ if(l.sb_id) ctx.porSb.set(String(l.sb_id),l); else ctx.semId.push(l); });
    let mudou=false;
    fila.forEach(p=>{ try{ if(window._aplicarLeadRealtime(p.eventType,p.new,p.old,ctx)) mudou=true; }catch(e){ console.warn('[tempo real]',e); } });
    if(mudou) _renderLeadsDebounced();
  }

  // Colunas da lista de leads (sem "obs", que é baixada ao abrir o lead)
  const _COLS_LEAD_LISTA='id,empresa_id,responsavel_id,nome,telefone,tipo,credito,etapa,origem,atendimento,administradora,meta_id,data_criacao,created_at,updated_at';
  window._loadLeads = async function() {
    try {
      const empresaId = await window._getEmpresaId();
      if (!empresaId) { console.error('[Security] _loadLeads: empresaId null — abortando'); return; }
      const data=await window._sbTodos(()=>sb.from('leads').select(_COLS_LEAD_LISTA).eq('empresa_id', empresaId)
        .order('created_at',{ascending:false}).order('id'));
      const noBanco=new Set();
      const porSbId=new Map(leads.filter(l=>l.sb_id).map(l=>[l.sb_id,l]));
      const primeiraCarga=!leads.length;
      const novos=[];
      data.forEach(row => {
        if(noBanco.has(row.id)) return; // páginas em paralelo podem repetir uma linha
        noBanco.add(row.id);
        const existing = porSbId.get(row.id);
        const mapped = _mapLead(row, existing);
        if (existing) Object.assign(existing, mapped);
        else novos.push(mapped);
      });
      // a lista vem do banco do mais novo para o mais antigo
      if(primeiraCarga) novos.forEach(l=>leads.push(l));
      else for(let i=novos.length-1;i>=0;i--) leads.unshift(novos[i]);
      // remove os que sumiram (excluídos, transferidos para fora da sua visão)
      for(let i=leads.length-1;i>=0;i--){
        const l=leads[i];
        if(l.sb_id && !noBanco.has(l.sb_id)) leads.splice(i,1);
      }
      window._leadsCarregadosEm=Date.now();
      window.nextLeadId = nextLeadId;
    } catch(e) { console.warn('loadLeads error:', e); }
  };

  // ── VENDAS ─────────────────────────────────────────────────────────────────
  // Lead fechado → o banco cria a venda sozinho. Aqui só vendas manuais (sem lead).
  window._registrarVendaManual=async function(userSbId,valor,clienteNome){
    const empresaId=await window._getEmpresaId();
    if(!empresaId) return {error:{message:'empresa não identificada'}};
    return sb.from('vendas').insert({
      empresa_id:empresaId,user_id:userSbId,lead_id:null,cliente_nome:clienteNome||'Venda manual',
      valor_credito:valor||0,data_fechamento:(typeof hojeISO==='function'?hojeISO():new Date().toISOString().slice(0,10))
    }).select().single();
  };
  // Excluir venda → o banco devolve o lead para Negociação e acerta o ranking
  window._excluirVenda=async function(id){
    const {data,error}=await sb.from('vendas').delete().eq('id',id).select('id');
    if(error) return {error};
    if(!data||!data.length) return {error:{message:'sem permissão para excluir esta venda'}};
    return {ok:true};
  };
  window._ultimaVendaDe=async function(userSbId){
    const empresaId=await window._getEmpresaId();
    return sb.from('vendas').select('*').eq('empresa_id',empresaId).eq('user_id',userSbId)
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
  };

  // ── LANCES ─────────────────────────────────────────────────────────────────
  window._syncLance = async function(lance) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return false;
    const lead = leads.find(l => l.id === lance.leadId);
    const payload = {
      lead_id: lead?.sb_id || null,
      cliente_nome: lance.clienteNome || '',
      valor: lance.valor || 0,
      pct: lance.pct || 0,
      data_oferta: lance.dataOferta || (typeof hojeISO==='function'?hojeISO():null),
      assembleia: lance.assem || '',
      obs: lance.obs || '',
      ofertado: !!lance.ofertado,
      removido: !!lance._removido,
      removido_manual: !!lance._removidoManual,
      auto: !!lance._auto,
      updated_at: new Date().toISOString()
    };
    let res;
    try{
      if (lance.sb_id) res=await sb.from('lances').update(payload).eq('id', lance.sb_id).select('id').maybeSingle();
      else res=await sb.from('lances').insert({...payload,empresa_id:empresaId,user_id:window._currentUserId}).select('id').single();
    }catch(e){ res={error:e}; }
    const chave='lance:'+lance.id;
    if(res.error||!res.data){ window._registrarFalha(chave,`o lance de ${lance.clienteNome||'cliente'}`,()=>window._syncLance(lance),res.error||{message:'sem permissão'}); return false; }
    lance.sb_id = res.data.id;
    window._limparPendente(chave);
    return true;
  };

  window._loadLances = async function() {
    try {
      const empresaId=await window._getEmpresaId();
      if(!empresaId) return;
      const data=await window._sbTodos(()=>sb.from('lances').select('*').eq('empresa_id',empresaId)
        .order('created_at',{ascending:false}).order('id'));
      const noBanco=new Set();
      const lancePorSb=new Map(lances.filter(la=>la.sb_id).map(la=>[la.sb_id,la]));
      const leadPorSb=new Map(leads.filter(l=>l.sb_id).map(l=>[String(l.sb_id),l]));
      data.forEach(row => {
        noBanco.add(row.id);
        const existing = lancePorSb.get(row.id);
        const lead = row.lead_id ? leadPorSb.get(String(row.lead_id)) : null;
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
          ofertado: !!row.ofertado,
          _removido: !!row.removido,
          _removidoManual: !!row.removido_manual,
          _auto: !!row.auto,
        };
        if (existing) Object.assign(existing, mapped);
        else lances.push(mapped);
      });
      for(let i=lances.length-1;i>=0;i--){ if(lances[i].sb_id&&!noBanco.has(lances[i].sb_id)) lances.splice(i,1); }
      window.nextLanceId = nextLanceId;
    } catch(e) { console.warn('loadLances error:', e); }
  };

  // ── EQUIPES ────────────────────────────────────────────────────────────────
  window._syncEquipe = async function(equipe) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) { showToast('Erro: empresa não identificada.','ti-alert-circle','#dc3545'); return false; }
    const membros = (equipe.membroIds || []).map(mid => window.users.find(x => x.id === mid)?.sb_id || null).filter(Boolean);
    const gestorUser=window.users.find(u=>u.id===equipe.gestorId);
    const repUser=window.users.find(u=>u.id===equipe.representanteId);
    const supUser=window.users.find(u=>u.id===equipe.supervisorId);
    const payload = {
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
    let res;
    if (equipe.sb_id) res=await sb.from('equipes').update(payload).eq('id', equipe.sb_id).select('id').maybeSingle();
    else res=await sb.from('equipes').insert({...payload,empresa_id:empresaId}).select('id').single();
    if (res.error||!res.data) {
      showToast('Erro ao salvar equipe: '+_msgErro(res.error||{message:'sem permissão'}),'ti-alert-circle','#dc3545');
      return false;
    }
    equipe.sb_id = res.data.id;
    return true;
  };

  window._loadEquipes = async function() {
    try {
      const empresaId=await window._getEmpresaId();
      if(!empresaId) return;
      const { data, error } = await sb.from('equipes').select('*').eq('empresa_id',empresaId).order('nome');
      if (error || !data) return;
      const sbIdsNoBanco = data.map(r => r.id);
      for(let i = equipes.length - 1; i >= 0; i--){
        if(equipes[i].sb_id && !sbIdsNoBanco.includes(equipes[i].sb_id)) equipes.splice(i, 1);
      }
      data.forEach(row => {
        const existing = equipes.find(e => e.sb_id === row.id);
        let lista=row.membros_sb_ids||[];
        if(typeof lista==='string'){ try{ lista=JSON.parse(lista); }catch(e){ lista=[]; } }
        const membroIds = (Array.isArray(lista)?lista:[]).map(sbId => window.users.find(x => x.sb_id === sbId)?.id || null).filter(Boolean);
        const mapped = {
          id: existing ? existing.id : (nextEquipeId++),
          sb_id: row.id,
          nome: row.nome || '',
          descricao: row.descricao || '',
          membroIds,
          foto: row.foto_url || null,
          gestorId: window.users.find(u=>u.sb_id===row.gestor_sb_id)?.id || null,
          representanteId: window.users.find(u=>u.sb_id===row.representante_sb_id)?.id || null,
          supervisorId: window.users.find(u=>u.sb_id===row.supervisor_sb_id)?.id || null,
          meta: parseFloat(row.meta) || 0,
          periodo: row.periodo || 'mensal',
          status: row.status || 'ativa',
        };
        if (existing) Object.assign(existing, mapped);
        else equipes.push(mapped);
      });
      // equipe de cada pessoa (para exibir e editar)
      window.users.forEach(u=>{ const eq=equipes.find(e=>(e.membroIds||[]).includes(u.id)); u.equipeId=eq?eq.id:null; });
      window.nextEquipeId = nextEquipeId;
    } catch(e) { console.warn('loadEquipes error:', e); }
  };

  // ── HIERARQUIAS ────────────────────────────────────────────────────────────
  window._syncHierarquia = async function(h) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return false;
    const sup=h.superiorId?window.hierarquias.find(x=>x.id===h.superiorId||x.sb_id===h.superiorId):null;
    const payload = {
      slug: h.slug || '',
      nome: h.nome || '',
      descricao: h.descricao || '',
      ordem: h.ordem || 1,
      superior_id: sup?.sb_id || null,
      status: h.status || 'ativa',
      perms: JSON.stringify({...(h.perms||{}),_v:2}),
      updated_at: new Date().toISOString()
    };
    let res;
    if (h.sb_id) res=await sb.from('hierarquias').update(payload).eq('id', h.sb_id).select('id').maybeSingle();
    else res=await sb.from('hierarquias').insert({...payload,empresa_id:empresaId}).select('id').single();
    if(res.error||!res.data){
      showToast('Não foi possível salvar o cargo: '+_msgErro(res.error||{message:'sem permissão'}),'ti-alert-triangle','#dc2626');
      return false;
    }
    h.sb_id = res.data.id;
    return true;
  };

  window._loadHierarquias = async function() {
    try {
      const empresaId=await window._getEmpresaId();
      if(!empresaId) return;
      const { data, error } = await sb.from('hierarquias').select('*').eq('empresa_id',empresaId).order('ordem');
      if (error || !data || !data.length) return;
      const oldHiers=hierarquias.slice();
      hierarquias.splice(0);
      data.forEach((row) => {
        const existing=oldHiers.find(h=>h.sb_id===row.id);
        const localId=existing?existing.id:(nextHierArquiaId++);
        const perms=_jsonSeguro(row.perms);
        delete perms._v;
        hierarquias.push({
          id: localId, sb_id: row.id, slug: row.slug || '', nome: row.nome || '', descricao: row.descricao || '',
          ordem: row.ordem || localId, superiorSbId: row.superior_id || null, superiorId: null,
          status: row.status || 'ativa', perms,
        });
      });
      hierarquias.forEach(h=>{ const s=hierarquias.find(x=>x.sb_id===h.superiorSbId); h.superiorId=s?s.id:null; });
      window._ensureMeHperms&&window._ensureMeHperms();
    } catch(e) { console.warn('loadHierarquias error:', e); }
  };

  // ── ADMINISTRADORAS ────────────────────────────────────────────────────────
  window._syncAdministradora = async function(a) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return false;
    const payload = {
      nome: a.nome || '',
      cnpj: a.cnpj || null,
      tipo: a.tipo || null,
      logo_url: a.logo || null,
      grupos: a.grupos ? JSON.stringify(a.grupos) : null,
      taxa_fin: a.taxaFin || 2.42,
      updated_at: new Date().toISOString()
    };
    let res;
    // "em uso no simulador" é escolha de cada pessoa: não é gravado ao editar
    try{
      if (a.sb_id) res=await sb.from('administradoras').update(payload).eq('id', a.sb_id).select('id').maybeSingle();
      else res=await sb.from('administradoras').insert({...payload,ativa:true,empresa_id:empresaId}).select('id').single();
    }catch(e){ res={error:e}; }
    if(res.error||!res.data){
      showToast('Não foi possível salvar a administradora: '+_msgErro(res.error||{message:'sem permissão'}),'ti-alert-triangle','#dc2626');
      return false;
    }
    a.sb_id = res.data.id;
    return true;
  };
  window._deleteAdministradora=async function(sb_id){
    if(!sb_id) return {ok:true};
    const {data,error}=await sb.from('administradoras').delete().eq('id',sb_id).select('id');
    if(error) return {error};
    if(!data||!data.length) return {error:{message:'sem permissão para excluir'}};
    return {ok:true};
  };

  window._loadAdministradoras = async function() {
    try {
      const empresaId=await window._getEmpresaId();
      if(!empresaId) return;
      const { data, error } = await sb.from('administradoras').select('*').eq('empresa_id',empresaId).order('nome');
      if (error || !data) return;
      const ativaAntes=administradoras.find(a=>a.ativa)?.sb_id;
      const antigas=administradoras.slice();
      administradoras.splice(0);
      data.forEach((row) => {
        const ex=antigas.find(a=>a.sb_id===row.id);
        let grupos=[];
        try{ grupos=row.grupos?(typeof row.grupos==='string'?JSON.parse(row.grupos):row.grupos):[]; }catch(e){ grupos=[]; }
        administradoras.push({
          id: ex?ex.id:(nextAdminId++),
          sb_id: row.id,
          nome: row.nome || '',
          cnpj: row.cnpj || '',
          tipo: row.tipo || '',
          logo: row.logo_url || null,
          grupos: Array.isArray(grupos)?grupos:[],
          ativa: false,
          taxaFin: parseFloat(row.taxa_fin) || 2.42,
        });
      });
      // a administradora "ativa" no simulador é escolha de cada pessoa
      const escolhida=administradoras.find(a=>a.sb_id===ativaAntes)||administradoras.find(a=>{
        const r=data.find(x=>x.id===a.sb_id);return r&&r.ativa!==false;
      })||administradoras[0];
      if(escolhida) escolhida.ativa=true;
      window.nextAdminId = nextAdminId;
    } catch(e) { console.warn('loadAdministradoras error:', e); }
  };

  // ── EVENTOS DO CALENDÁRIO ──────────────────────────────────────────────────
  window._syncEvento = async function(ev) {
    const empresaId = await window._getEmpresaId();
    if (!empresaId) return false;
    const lead = leads.find(l => l.id === ev.leadId);
    const payload = {
      lead_id: lead?.sb_id || null,
      lead_nome: ev.leadNome || '',
      tipo: ev.tipo || 'reuniao',
      data: ev.data || (typeof hojeISO==='function'?hojeISO():null),
      hora_ini: ev.horaIni || '',
      hora_fim: ev.horaFim || '',
      obs: ev.obs || '',
      updated_at: new Date().toISOString()
    };
    let res;
    if (ev.sb_id) res=await sb.from('eventos_calendario').update(payload).eq('id', ev.sb_id).select('id').maybeSingle();
    else res=await sb.from('eventos_calendario').insert({...payload,empresa_id:empresaId,user_id:window._currentUserId||null}).select('id').single();
    const chave='evento:'+ev.id;
    if(res.error||!res.data){ window._registrarFalha(chave,'o evento da agenda',()=>window._syncEvento(ev),res.error||{message:'sem permissão'}); return false; }
    ev.sb_id = res.data.id;
    window._limparPendente(chave);
    return true;
  };

  window._deleteEvento = async function(sb_id) {
    if (!sb_id) return true;
    const {data,error}=await sb.from('eventos_calendario').delete().eq('id', sb_id).select('id');
    return !error && !!(data && data.length);
  };

  window._loadEventos = async function() {
    try {
      const empresaId=await window._getEmpresaId();
      if(!empresaId) return;
      const data=await window._sbTodos(()=>sb.from('eventos_calendario').select('*').eq('empresa_id',empresaId).order('data').order('id'));
      eventos.splice(0); nextEventoId = 1;
      const leadPorSb=new Map(leads.filter(l=>l.sb_id).map(l=>[String(l.sb_id),l]));
      data.forEach(row => {
        const lead = row.lead_id ? leadPorSb.get(String(row.lead_id)) : null;
        eventos.push({
          id: nextEventoId++, sb_id: row.id, leadId: lead ? lead.id : null, leadNome: row.lead_nome || '',
          tipo: row.tipo || 'reuniao', data: row.data || '', horaIni: row.hora_ini || '', horaFim: row.hora_fim || '',
          obs: row.obs || '', userSbId: row.user_id || null,
        });
      });
      window.nextEventoId = nextEventoId;
    } catch(e) { console.warn('loadEventos error:', e); }
  };

  // ── ATIVIDADES (histórico) ─────────────────────────────────────────────────
  window._saveAtividade = async function(icon, text, targetUserId) {
    try {
      const empresaId = await window._getEmpresaId();
      if (!empresaId) return;
      const me = window.getMe ? window.getMe() : null;
      const payload = { empresa_id: empresaId, user_id: targetUserId || me?.sb_id || null, icon: icon || 'ti-activity', text: text || '' };
      await sb.from('atividades').insert(payload);
      if (window.activities) {
        window.activities.unshift({ icon, text, time: 'Agora', _userId: payload.user_id });
        try { window.renderNotifPanel && window.renderNotifPanel(); } catch(e) {}
      }
    } catch(e) { console.warn('[_saveAtividade]', e); }
  };

  window._loadAtividades = async function() {
    try {
      const empresaId = await window._getEmpresaId();
      if (!empresaId) return;
      // o banco já entrega só o que a pessoa pode ver; o sininho filtra pela permissão de equipe
      const { data, error } = await sb.from('atividades').select('*').eq('empresa_id', empresaId)
        .order('created_at', { ascending: false }).limit(50);
      if (error || !data) return;
      function _ageLabel(ts) {
        if (!ts) return 'Agora';
        const diff = Math.floor((Date.now() - new Date(ts)) / 60000);
        if (diff < 1) return 'Agora';
        if (diff < 60) return `${diff}min atrás`;
        if (diff < 1440) return `${Math.floor(diff/60)}h atrás`;
        return `${Math.floor(diff/1440)}d atrás`;
      }
      window.activities = data.map(r => ({ sb_id: r.id, icon: r.icon, text: r.text, time: _ageLabel(r.created_at), _userId: r.user_id }));
      try { window.renderNotifPanel && window.renderNotifPanel(); } catch(e) {}
      try { if(document.getElementById('tab-dashboard')?.classList.contains('active')) window.renderDashboard && window.renderDashboard(); } catch(e) {}
    } catch(e) { console.warn('[_loadAtividades]', e); }
  };

  // ── EMPRESA ────────────────────────────────────────────────────────────────
  // Salva os dados da empresa (só o gestor). Devolve true/false.
  window._syncEmpresa = async function() {
    const empresaId = await window._getEmpresaId();
    if (!empresaId || !window.empresa) return false;
    const me=window.getMe&&window.getMe();
    if(!(window.isGestor&&window.isGestor(me))) return false;
    let res;
    try{
      res=await sb.from('empresas').update({
        nome: window.empresa.nome || '',
        logo_url: window.empresa.logo || null,
        whatsapp: window.empresa.whatsapp || '',
        email: window.empresa.email || '',
        updated_at: new Date().toISOString()
      }).eq('id', empresaId).select('id').maybeSingle();
    }catch(e){ res={error:e}; }
    if(res.error||!res.data){ window._registrarFalha('empresa','os dados da empresa',()=>window._syncEmpresa(),res.error||{message:'sem permissão'}); return false; }
    window._limparPendente('empresa');
    return true;
  };

  window._loadEmpresa = async function() {
    try {
      const empresaId = await window._getEmpresaId();
      if (!empresaId) return;
      const { data, error } = await sb.from('empresas').select('*').eq('id', empresaId).maybeSingle();
      if (error || !data) return;
      window.empresa = { nome: data.nome || 'Minha Empresa', logo: data.logo_url || null, whatsapp: data.whatsapp || '', email: data.email || '', plano: data.plano || 'basico' };
      try{ window.applyNavPermissions&&window.applyNavPermissions(); }catch(e){}
      try{ empresa=window.empresa; }catch(e){}
      if(typeof aplicarEtapasLabels==='function') aplicarEtapasLabels(data.etapas_labels||null);
    } catch(e) { console.warn('loadEmpresa error:', e); }
  };

  // ── CARREGAMENTO INICIAL COMPLETO ──────────────────────────────────────────
  // Carrega em paralelo o que não depende de nada; leads depois das equipes;
  // lances e agenda depois dos leads (para ligar cada um ao seu lead).
  window._loadAllData = async function() {
    if(!window._empresaIdDireto) return;
    const aviso=(o)=>e=>console.warn('[_loadAllData] '+o+':',e);
    await Promise.all([
      window._loadEmpresa().catch(aviso('empresa')),
      // empresa sem hierarquias ganha as padrão (feito pelo servidor)
      window._rpc('crm_garantir_hierarquias').then(()=>window._loadHierarquias()).catch(aviso('hierarquias')),
      window._loadAdministradoras().catch(aviso('administradoras')),
      window._loadEquipes().catch(aviso('equipes')),
      window._loadAtividades().catch(aviso('atividades')),
    ]);
    await window._loadLeads().catch(aviso('leads'));
    await Promise.all([
      window._loadLances().catch(aviso('lances')),
      window._loadEventos().catch(aviso('eventos')),
    ]);
    try{window._ensureMeHperms&&window._ensureMeHperms();}catch(e){}
    try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
    window._renderTudo&&window._renderTudo();
  };

  // ── Helper: empresa do usuário logado (nunca "adivinha" outra empresa) ─────
  window._getEmpresaId = async function() {
    return window._empresaIdDireto || null;
  };

  // ── 4. Tempo real ─────────────────────────────────────────────────────────
  function _debounce(fn,ms){ let t=null; return function(){ if(t) clearTimeout(t); t=setTimeout(()=>{t=null;fn();},ms); }; }
  // Redesenha só a aba que está aberta (as outras se redesenham ao serem abertas).
  // Na aba Leads mantém a página em que a pessoa está.
  const _renderLeadsDebounced=_debounce(function(){
    const ativa=document.querySelector('.content.active');
    const id=ativa&&ativa.id?ativa.id.replace('tab-',''):'';
    try{
      if(id==='funil') window.renderKanban&&window.renderKanban();
      else if(id==='leads') (window._renderTableImediato||window.renderTable)();
      else if(id==='dashboard') window.renderDashboard&&window.renderDashboard();
      else if(id==='relatorios') window.renderRelatorios&&window.renderRelatorios();
    }catch(e){ console.warn('[render]',e); }
  },400);
  const _recarregarPerfis=_debounce(()=>window._loadProfiles(),800);
  const _recarregarRanking=_debounce(function(){
    try{ window._invalidarRanking&&window._invalidarRanking(); }catch(e){}
    try{ window._aplicarFiltroVendas&&document.getElementById('tab-ranking')?.classList.contains('active')&&window._aplicarFiltroVendas(); }catch(e){}
    try{ window._dashVendasCache=null; }catch(e){}
  },800);
  const _recarregarLances=_debounce(async()=>{ await window._loadLances(); try{window.renderLances&&document.getElementById('tab-lances')?.classList.contains('active')&&window.renderLances();}catch(e){} },800);
  const _recarregarAtividades=_debounce(()=>window._loadAtividades(),1000);
  const _recarregarEquipes=_debounce(async()=>{ await window._loadEquipes(); await window._loadLeads(); _renderLeadsDebounced(); },800);

  window.addEventListener('load',function(){
    const _subscribeRealtime=function(){
      const filtro=`empresa_id=eq.${window._empresaIdDireto}`;
      try{
        (sb.getChannels?sb.getChannels():[]).forEach(c=>{ try{sb.removeChannel(c);}catch(e){} });
      }catch(e){}
      const canal=(nome,tabela,evento,fn)=>sb.channel(nome).on('postgres_changes',{event:evento,schema:'public',table:tabela,filter:filtro},fn).subscribe();

      canal('profiles-sync','profiles','*',()=>_recarregarPerfis());
      // Permissões de um cargo mudaram: vale na hora (abas, botões e a tela aberta)
      canal('hierarquias-sync','hierarquias','*',_debounce(async()=>{
        await window._loadHierarquias();
        try{window.applyNavPermissions&&window.applyNavPermissions();}catch(e){}
        try{window._renderTudo&&window._renderTudo();}catch(e){}
      },500));
      canal('leads-sync','leads','*',_filaLead);
      canal('lances-sync','lances','*',()=>_recarregarLances());
      canal('vendas-sync','vendas','*',()=>{ _recarregarRanking(); _recarregarPerfis(); });
      canal('atividades-sync','atividades','INSERT',()=>_recarregarAtividades());
      canal('equipes-sync','equipes','*',()=>_recarregarEquipes());
      // Integrações: mensagens do WhatsApp, conversas da IA e disparos
      canal('wa-sync','wa_mensagens','*',p=>window._integRealtime&&window._integRealtime('wa_mensagens',p));
      canal('ia-conv-sync','ia_conversas','*',p=>window._integRealtime&&window._integRealtime('ia_conversas',p));
      canal('wa-disp-sync','wa_disparos','*',p=>window._integRealtime&&window._integRealtime('wa_disparos',p));
    };
    if(window._empresaIdDireto){
      _subscribeRealtime();
    } else {
      window._profilesLoadPromise.then(()=>{ if(window._empresaIdDireto) _subscribeRealtime(); });
    }
  });

  // Ao voltar para a aba do navegador depois de um tempo, confere tudo de novo
  // (garante leads transferidos para fora da sua visão, removidos etc.)
  document.addEventListener('visibilitychange',async function(){
    if(document.visibilityState!=='visible'||!window._empresaIdDireto) return;
    if(Date.now()-(window._leadsCarregadosEm||0)<2*60*1000) return;
    window._leadsCarregadosEm=Date.now();
    await window._loadProfiles();
    await window._loadEquipes();
    await window._loadLeads();
    _renderLeadsDebounced();
  });
})();

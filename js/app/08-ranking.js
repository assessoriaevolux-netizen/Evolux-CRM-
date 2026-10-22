// ─── RANKING ──────────────────────────────────────────────────────────────────
function rankAtualizarSidebar(){
  const me=getMe();
  if(!me) return;

  // Gestor → lança para qualquer pessoa da empresa
  // Representante (vendas_create via hperms) → lança só para membros da mesma equipe
  // Sem permissão → só lança para si mesmo (card "minha venda")
  const isGestor=me.role==='admin'||me.role==='gestor'||me.role==='master'||me.role==='superadmin';
  const isRepresentante=!isGestor&&me.hperms&&me.hperms.vendas_create;

  // Atualiza subtítulo do card "minha venda"
  const sub=document.getElementById('minha-venda-sub');
  if(sub) sub.textContent=`Olá, ${me.nome.split(' ')[0]}! Selecione o lead ou informe o valor.`;

  // Popula leads do usuário logado no card "minha venda"
  const vleadme=document.getElementById('vleadme');
  if(vleadme){
    const meusLeads=leads.filter(l=>l.responsavelId===me.id&&l.etapa!=='Fechado / Convertido'&&l.etapa!=='Perdido');
    vleadme.innerHTML='<option value="">Selecionar lead (opcional)...</option>'+meusLeads.map(l=>`<option value="${l.id}">${l.nome}${l.credito?' — '+fmtR(l.credito):''}</option>`).join('');
  }

  // Mostra/esconde card de venda por outro
  const cardOutro=document.getElementById('card-venda-outro');
  const podeAddOutro=isGestor||isRepresentante;
  if(cardOutro) cardOutro.style.display=podeAddOutro?'':'none';

  // Popula o select com as pessoas certas
  if(podeAddOutro){
    const vv=document.getElementById('vvend');
    if(vv){
      let candidatos=[];
      if(isGestor){
        // Gestor vê todos da empresa
        candidatos=users.filter(u=>u.empresaId===me.empresaId||!u.empresaId);
      } else {
        // Representante: só membros da mesma equipe (excluindo a si mesmo, já tem "minha venda")
        const minhaEquipe=equipes.find(eq=>eq.membroIds&&eq.membroIds.includes(me.id));
        if(minhaEquipe){
          candidatos=users.filter(u=>minhaEquipe.membroIds.includes(u.id));
        } else {
          candidatos=[]; // sem equipe = não pode lançar para ninguém além de si
        }
      }
      vv.innerHTML='<option value="">Selecionar...</option>'+candidatos.map(u=>`<option value="${u.id}">${u.nome}</option>`).join('');
    }
  }
}

function renderRanking(){
  const _meRk=getMe();
  const _empRk=_meRk?.empresaId;
  // Ranking: filtra por empresa se possível, senão mostra quem tem sb_id (está no banco)
  // Inclui também usuários sem empresaId definido no array (podem ter sido carregados antes do merge)
  let _usersRkBase;
  if(_empRk){
    _usersRkBase=users.filter(u=>u.empresaId===_empRk||!u.empresaId);
  } else {
    _usersRkBase=users;
  }
  // Remove usuários sem nome (fantasmas de seed local)
  _usersRkBase=_usersRkBase.filter(u=>u.nome&&u.nome.trim());
  console.log('[renderRanking] _empRk=',_empRk,'total users=',users.length,'filtrados=',_usersRkBase.length,_usersRkBase.map(u=>u.nome+'/'+u.empresaId));
  const _usersRk=_rankOverride
    ? _usersRkBase.map(u=>{const ov=_rankOverride[u.sb_id]||{vendas:0,credito:0};return Object.assign({},u,{vendas:ov.vendas,credito:ov.credito});})
    : _usersRkBase;

  const periodoLabel={hoje:'Hoje',dia:'Hoje',semana:'Esta semana',mes:mesAtual(),custom:rankDataSelecionada?new Date(rankDataSelecionada+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}):'Data personalizada',semana_passada:'Semana passada',mes_passado:'Mês passado',ultimos_7:'Últimos 7 dias',ultimos_30:'Últimos 30 dias'};
  document.getElementById('rank-month').textContent=periodoLabel[rankPeriodo]||mesAtual();
  document.getElementById('tv-month-title').textContent=periodoLabel[rankPeriodo]||mesAtual();

  const podioEl=document.getElementById('podio-area');
  const rqEl=document.getElementById('rk-equipes');
  const rtEl=document.getElementById('rk-todos');
  const rankEl=document.getElementById('ranking-rows');
  if(podioEl)podioEl.style.display='none';
  if(rqEl)rqEl.style.display='none';
  if(rtEl)rtEl.style.display='none';
  if(rankEl)rankEl.style.display='none';

  function avUser(u,cls){
    if(u.foto)return`<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" alt="${u.nome}">`;
    const ini=u.nome.split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
    return`<span>${ini}</span>`;
  }
  function avEq(eq,cls){
    if(eq.foto)return`<img src="${eq.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" alt="${eq.nome}">`;
    const ini=eq.nome.split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
    return`<span>${ini}</span>`;
  }

  // ── EQUIPES VIEW ──────────────────────────────────────
  if(rankView==='equipes'){
    if(rqEl)rqEl.style.display='block';
    const eqRank=equipes.map(eq=>{
      const mbs=(eq.membroIds||[]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
      const totalCred=mbs.reduce((s,u)=>s+(u.credito||0),0);
      const totalVend=mbs.reduce((s,u)=>s+(u.vendas||0),0);
      const sup=users.find(u=>u.id===eq.supervisorId);
      return{...eq,totalCred,totalVend,mbs,sup};
    }).sort((a,b)=>b.totalCred-a.totalCred||b.totalVend-a.totalVend);
    const medals=['🥇','🥈','🥉'];
    if(rqEl)rqEl.innerHTML=eqRank.length===0
      ?`<div style="padding:52px 24px;text-align:center"><div style="font-size:52px;margin-bottom:14px">🏆</div><div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:6px">Nenhuma equipe cadastrada</div><div style="font-size:13px;color:var(--tm)">Cadastre equipes em Configurações → Equipes.</div></div>`
      :eqRank.map((eq,i)=>`
        <div class="rq-card${i===0?' lider':''}">
          <div class="rq-pos">${medals[i]||`${i+1}º`}</div>
          <div class="rq-av" style="${eq.foto?'background:none':''}font-size:${eq.foto?'0':'16px'}">${avEq(eq)}</div>
          <div class="rq-info">
            <div class="rq-nome">${eq.nome}</div>
            <div class="rq-meta">${eq.sup?`Supervisor: ${eq.sup.nome}`:'Sem supervisor'} · ${(eq.membroIds||[]).length} membro${(eq.membroIds||[]).length!==1?'s':''}</div>
            <div class="rq-stats">
              <div class="rq-stat"><div class="rq-lbl">Vendas</div><div class="rq-val">${eq.totalVend}</div></div>
              <div class="rq-stat"><div class="rq-lbl">Volume</div><div class="rq-val g">${fmtR(eq.totalCred)}</div></div>
              ${eq.meta?`<div class="rq-stat"><div class="rq-lbl">Meta</div><div class="rq-val">${fmtR(eq.meta)}<span style="font-size:10px;font-weight:600;color:var(--tm)">/${({mensal:'mês',semanal:'sem',personalizado:'per'})[eq.periodo||'mensal']}</span></div></div>`:''}
            </div>
          </div>
        </div>`).join('');
    try{rankAtualizarSidebar();}catch(e){}
    return;
  }

  // ── TODOS OS VENDEDORES VIEW ──────────────────────────
  if(rankView==='todos'){
    if(rtEl)rtEl.style.display='block';
    const allU=[..._usersRk].sort((a,b)=>b.credito-a.credito||b.vendas-a.vendas);
    if(rtEl)rtEl.innerHTML=allU.length===0
      ?`<div style="padding:52px 24px;text-align:center"><div style="font-size:52px;margin-bottom:14px">👤</div><div style="font-size:15px;font-weight:800;color:var(--tx)">Nenhum vendedor</div></div>`
      :`<div style="overflow-x:auto"><table class="rt-table"><thead><tr>
          <th class="rt-pos">#</th><th></th><th>Nome</th><th>Equipe</th><th>Supervisor</th><th>Vendas</th><th>Volume</th>
        </tr></thead><tbody>${allU.map((u,i)=>{
          const eq=getEqDeUser(u);const sup=eq?users.find(x=>x.id===eq.supervisorId):getSupDeUser(u);
          const medals=['🥇','🥈','🥉'];
          return`<tr>
            <td class="rt-pos">${medals[i]||i+1}</td>
            <td><div class="rt-av">${avUser(u)}</div></td>
            <td><div class="rt-name">${u.nome}</div><div class="rt-sub">${getHierLabel(u)}</div></td>
            <td style="color:var(--tm)">${eq?eq.nome:'—'}</td>
            <td style="color:var(--tm)">${sup?sup.nome:'—'}</td>
            <td>${u.vendas}</td>
            <td class="rt-green">${fmtR(u.credito)}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    try{rankAtualizarSidebar();}catch(e){}
    return;
  }

  // ── MINHA LOJA VIEW (default) ─────────────────────────
  const sorted=[..._usersRk].sort((a,b)=>b.credito-a.credito||b.vendas-a.vendas);
  const maxC=Math.max(...sorted.map(u=>u.credito),1);
  const medals=['🥇','🥈','🥉'];

  // Pódio top 3
  if(podioEl&&sorted.length>0&&sorted[0].credito>0){
    podioEl.style.display='block';
    const top=sorted.slice(0,3);
    const order=[1,0,2];// 2nd, 1st, 3rd
    const szCls=['s2','s1','s3'];
    const bCls=['b2','b1','b3'];
    const meds=['🥈','🥇','🥉'];
    const cols=order.map(idx=>top[idx]).filter(Boolean);
    // always show in order: 2nd | 1st | 3rd
    const colData=order.map((idx,ci)=>{
      const u=top[idx];if(!u)return null;
      return{u,szCls:szCls[ci],bCls:bCls[ci],med:meds[ci],rank:idx};
    }).filter(Boolean);
    const eq0=getEqDeUser(sorted[0]);
    podioEl.innerHTML=`<div class="podio-wrap">
      <div class="podio-title">🏆 Top 3 Vendedores — ${periodoLabel[rankPeriodo]||mesAtual()}</div>
      <div class="podio-grid">${colData.map(({u,szCls,bCls,med,rank})=>{
        const eqU=getEqDeUser(u);
        return`<div class="podio-col">
          <div class="podio-medal">${med}</div>
          <div class="podio-av ${szCls}">${avUser(u)}</div>
          <div class="podio-nome">${u.nome}</div>
          <div class="podio-sub">${eqU?eqU.nome:getHierLabel(u)}</div>
          <div class="podio-val">${fmtR(u.credito)}</div>
          <div class="podio-base ${bCls}"></div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }

  // Full list
  if(rankEl)rankEl.style.display='block';
  if(sorted.length<=1&&sorted[0]?.credito===0&&sorted.length===1){
    rankEl.innerHTML=`<div style="padding:52px 24px;text-align:center">
      <div style="font-size:52px;margin-bottom:14px">🏆</div>
      <div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:6px">Ranking vazio</div>
      <div style="font-size:13px;color:var(--tm)">Cadastre vendedores em Configurações → Usuários para eles aparecerem aqui automaticamente.</div>
    </div>`;
    try{rankAtualizarSidebar();}catch(e){}
    return;
  }
  rankEl.innerHTML=sorted.map((u,i)=>{
    const isLider=i===0&&u.credito>0;
    const meta=u.meta||500000;
    const pct=meta>0?Math.min(Math.round(u.credito/meta*100),999):0;
    const barW=Math.min(pct,100);
    const atingiu=pct>=100;
    const posLabel=i===0?'🥇 1º':i===1?'🥈 2º':i===2?'🥉 3º':`${i+1}º lugar`;
    const eqU=getEqDeUser(u);
    return `<div class="rank-card${isLider?' primeiro':''}">
      <div class="rank-left">
        <div class="rank-num${isLider?' gold':''}">${posLabel}</div>
        <div class="rank-av-wrap">
          ${u.foto
            ?`<img src="${u.foto}" class="rank-av-foto" alt="${u.nome}" style="${isLider?'box-shadow:0 0 0 3px var(--gold),0 6px 20px rgba(0,0,0,.25)':''}">`
            :`<div class="rank-av" style="${isLider?'background:linear-gradient(135deg,var(--gold),var(--gold2));color:var(--navy);':''}">${u.nome.charAt(0)}</div>`}
          ${isLider?'<div class="rank-av-crown">👑</div>':''}
        </div>
      </div>
      <div class="rank-right-col">
        <div class="rank-nome-row">
          <div class="rank-nome">${u.nome}</div>
          <span class="rank-role-badge rbadge ${getHierClass(u)}">${getHierLabel(u)}</span>
        </div>
        ${eqU?`<div style="font-size:11px;color:var(--tm);margin-top:2px">📋 ${eqU.nome}</div>`:''}
        <div class="rank-vals">
          <div class="rank-val-item">
            <div class="rank-val-label">💰 Vendas</div>
            <div class="rank-val-num green">${fmtR(u.credito)}</div>
          </div>
          <div class="rank-val-item">
            <div class="rank-val-label">🎯 Meta</div>
            <div class="rank-val-num ${atingiu?'green':'red'}">${fmtR(meta)}</div>
          </div>
        </div>
        <div class="rank-bar-outer">
          <div class="rank-bar-inner ${atingiu?'atingiu':'nao-atingiu'}" style="width:${barW}%"></div>
        </div>
        <div class="rank-bar-footer">
          <div class="rank-vendas-cnt">${u.vendas} venda${u.vendas!==1?'s':''}</div>
          <span class="rank-pct-badge ${atingiu?'atingiu':'nao-atingiu'}">${pct}%</span>
        </div>
      </div>
    </div>`;
  }).join('');
  const tvBody=document.getElementById('tv-body');
  if(tvBody) tvBody.innerHTML=sorted.map((u,i)=>`
    <div class="tv-row ${i===0?'first':''}">
      <span class="tv-pos">${medals[i]||`${i+1}°`}</span>
      ${u.foto
        ?`<div style="position:relative;flex-shrink:0"><img src="${u.foto}" class="rank-av-foto-lg" alt="${u.nome}" style="${i===0?'border-color:#f0c040;box-shadow:0 0 0 4px rgba(240,192,64,.25),0 6px 24px rgba(0,0,0,.2)':''}">${i===0?'<div style="position:absolute;bottom:-2px;right:-2px;width:26px;height:26px;background:#f0c040;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:13px">👑</div>':''}</div>`
        :`<div class="tv-av" style="${i===0?'background:linear-gradient(135deg,#f0c040,#e0a020);color:#fff;border-color:#f0c040;box-shadow:0 6px 20px rgba(240,192,64,.4)':''}">${u.nome.charAt(0)}</div>`}
      <div class="tv-info"><div class="tv-name">${u.nome}${i===0?' 👑':''}</div><div class="tv-meta">${u.vendas} venda${u.vendas!==1?'s':''} · ${getHierLabel(u)}</div></div>
      <div><div class="tv-sc">${fmtR(u.credito)}</div><div class="tv-sl">volume</div></div>
    </div>`).join('');
  // Atualiza sidebar de vendas com base no usuário logado (popula vvend com regra correta)
  try{rankAtualizarSidebar();}catch(e){}
}
// Auto-preenche valor ao selecionar lead no card "minha venda"
function rankAutoFillMe(){
  const sel=document.getElementById('vleadme');
  const inp=document.getElementById('vval-me');
  if(!sel||!inp)return;
  if(sel.value){
    const lead=leads.find(l=>l.id===parseInt(sel.value));
    if(lead&&lead.credito){inp.value=fmtR(lead.credito);}
  }
}
// Carrega leads do vendedor selecionado no card "venda outro"
function rankCarregarLeadsVendedor(){
  const vvend=document.getElementById('vvend');
  const vlead=document.getElementById('vlead');
  const vval=document.getElementById('vval');
  if(!vvend||!vlead)return;
  vlead.innerHTML='<option value="">Selecionar lead (opcional)...</option>';
  if(vval)vval.value='';
  const uid=parseInt(vvend.value);
  if(!uid)return;
  const meusLeads=leads.filter(l=>l.responsavelId===uid&&l.etapa!=='Fechado / Convertido'&&l.etapa!=='Perdido');
  meusLeads.forEach(l=>{
    const opt=document.createElement('option');
    opt.value=l.id;
    opt.textContent=`${l.nome}${l.credito?' — '+fmtR(l.credito):''}`;
    vlead.appendChild(opt);
  });
}
// Auto-preenche valor ao selecionar lead no card "venda outro"
function rankAutoFillVend(){
  const sel=document.getElementById('vlead');
  const inp=document.getElementById('vval');
  if(!sel||!inp)return;
  if(sel.value){
    const lead=leads.find(l=>l.id===parseInt(sel.value));
    if(lead&&lead.credito){inp.value=fmtR(lead.credito);}
  }
}
// Registra venda para o próprio usuário logado
function addMinhaVenda(){
  const me=getMe();
  if(!me){showToast('Usuário não identificado.','ti-alert-triangle','#d97706');return;}
  // Verifica se um lead foi selecionado
  const leadSel=document.getElementById('vleadme');
  const leadId=leadSel?parseInt(leadSel.value)||null:null;
  const lead=leadId?leads.find(l=>l.id===leadId):null;
  // Usa valor do lead ou do campo manual
  const val=unM(document.getElementById('vval-me').value)||(lead?lead.credito:0);
  if(!val){showToast('Informe o valor da venda ou selecione um lead.','ti-alert-triangle','#d97706');return;}
  // Incrementa localmente para UI imediata
  me.vendas++;
  me.credito+=val;
  if(window._saveAtividade)window._saveAtividade('ti-trophy',`${me.nome} registrou venda de ${fmtR(val)}`,me.sb_id);
  // Persiste no banco via incremento atômico (não usa _syncUser para não sobrescrever outros campos)
  if(window._registrarVenda) window._registrarVenda({sb_id:null,nome:lead?lead.nome:'Venda manual',credito:val},me.id).catch(e=>console.warn(e));
  // Move lead para Fechado / Convertido se selecionado
  if(lead&&lead.etapa!=='Fechado / Convertido'){
    lead.etapa='Fechado / Convertido';
    lead.credito=val||lead.credito;
    lead.responsavelId=me.id;
    if(window._syncLead)window._syncLead(lead).catch(e=>console.warn(e));
    if(window._saveAtividade)window._saveAtividade('ti-circle-check',`${lead.nome} fechado — ${fmtR(lead.credito)}`,me.sb_id);
  }
  if(leadSel)leadSel.value='';
  document.getElementById('vval-me').value='';
  try{renderRanking();}catch(e){}
  try{renderDashboard();}catch(e){}
  try{if(document.getElementById('tab-funil')&&document.getElementById('tab-funil').classList.contains('active'))renderKanban();}catch(e){}
  try{renderNotifPanel();}catch(e){}
  setTimeout(()=>{ showCelebra(me.nome, val); }, 100);
}
// Remove última venda do próprio usuário logado
function removerMinhaVenda(){
  const me=getMe();
  if(!me){showToast('Usuário não identificado.','ti-alert-triangle','#d97706');return;}
  showConfirm(`Remover sua última venda registrada?`,function(){
    if(window._estornarVenda){
      window._estornarVenda({sb_id:me.sb_id,id:me.id,nome:me.nome}).then(()=>{
        me.vendas=Math.max(0,(me.vendas||1)-1);
        me.credito=Math.max(0,(me.credito||0));
        if(window._saveAtividade)window._saveAtividade('ti-trash',`${me.nome} removeu última venda`,me.sb_id);
        try{renderRanking();}catch(e){}
        try{renderDashboard();}catch(e){}
        try{renderNotifPanel();}catch(e){}
        showToast('Venda removida.','ti-check','#22c55e');
      }).catch(e=>{showToast('Erro ao remover venda.','ti-alert-triangle','#ef4444');console.warn(e);});
    }else{
      showToast('Função de estorno não disponível.','ti-alert-triangle','#d97706');
    }
  });
}
// Remove última venda de um vendedor da equipe (gestor/supervisor)
function removerVenda(){
  const vvend=document.getElementById('vvend');
  const uid=vvend?parseInt(vvend.value)||null:null;
  if(!uid){showToast('Selecione um vendedor.','ti-alert-triangle','#d97706');return;}
  // Validação de permissão
  const me=getMe();
  if(me){
    const isGestorRV=me.role==='admin'||me.role==='gestor'||me.role==='master'||me.role==='superadmin';
    if(!isGestorRV){
      const minhaEquipeRV=equipes.find(eq=>eq.membroIds&&eq.membroIds.includes(me.id));
      const membrosRV=minhaEquipeRV?minhaEquipeRV.membroIds:[];
      if(!membrosRV.includes(uid)){
        showToast('Sem permissão para remover venda deste usuário.','ti-shield-lock','#d97706');return;
      }
    }
  }
  const u=users.find(x=>x.id===uid);
  if(!u){showToast('Vendedor não encontrado.','ti-alert-triangle','#d97706');return;}
  showConfirm(`Remover última venda de ${u.nome}?`,function(){
    if(window._estornarVenda){
      window._estornarVenda({sb_id:u.sb_id,id:u.id,nome:u.nome}).then(()=>{
        u.vendas=Math.max(0,(u.vendas||1)-1);
        u.credito=Math.max(0,(u.credito||0));
        if(window._saveAtividade)window._saveAtividade('ti-trash',`Venda de ${u.nome} removida por ${me?me.nome:'gestor'}`,me?me.sb_id:null);
        try{renderRanking();}catch(e){}
        try{renderDashboard();}catch(e){}
        try{renderNotifPanel();}catch(e){}
        showToast('Venda removida.','ti-check','#22c55e');
      }).catch(e=>{showToast('Erro ao remover venda.','ti-alert-triangle','#ef4444');console.warn(e);});
    }else{
      showToast('Função de estorno não disponível.','ti-alert-triangle','#d97706');
    }
  });
}

function addVenda(){
  const id=parseInt(document.getElementById('vvend').value);
  const val=unM(document.getElementById('vval').value);
  if(!id){showToast('Selecione um vendedor.','ti-alert-triangle','#d97706');return;}
  if(!val){showToast('Informe o valor da venda.','ti-alert-triangle','#d97706');return;}
  // Validação de permissão: verifica se quem lança tem direito sobre este usuário
  const me=getMe();
  if(me){
    const isGestorAV=me.role==='admin'||me.role==='gestor'||me.role==='master'||me.role==='superadmin';
    if(!isGestorAV){
      // Não é gestor: só pode lançar para membros da própria equipe
      const minhaEquipeAV=equipes.find(eq=>eq.membroIds&&eq.membroIds.includes(me.id));
      const membrosDaEquipe=minhaEquipeAV?minhaEquipeAV.membroIds:[];
      if(!membrosDaEquipe.includes(id)){
        showToast('Sem permissão para registrar venda para este usuário.','ti-shield-lock','#d97706');
        return;
      }
    }
  }
  const u=users.find(x=>x.id===id);
  if(u){
    // Incrementa localmente para UI imediata
    u.vendas++;
    u.credito+=val;
    if(window._saveAtividade)window._saveAtividade('ti-trophy',`${u.nome} registrou venda de ${fmtR(val)}`,u.sb_id);
    // Persiste no banco via incremento atômico (não usa _syncUser para não sobrescrever)
    if(window._registrarVenda) window._registrarVenda({sb_id:null,nome:'Venda manual',credito:val},id).catch(e=>console.warn(e));
  }
  // Se um lead foi selecionado no ranking, mover para Fechado / Convertido
  const rls=document.getElementById('vlead');
  if(rls&&rls.value){
    const lid=parseInt(rls.value);
    const lead=leads.find(l=>l.id===lid);
    if(lead&&lead.etapa!=='Fechado / Convertido'){
      lead.etapa='Fechado / Convertido';
      lead.credito=val||lead.credito;
      if(u) lead.responsavelId=u.id;
      if(window._syncLead) window._syncLead(lead).catch(e=>console.warn(e));
      if(window._saveAtividade)window._saveAtividade('ti-circle-check',`${lead.nome} fechado — ${fmtR(lead.credito)}`);
    }
    rls.value='';
  }
  document.getElementById('vval').value='';
  try{renderRanking();}catch(e){}
  try{renderDashboard();}catch(e){}
  try{if(document.getElementById('tab-funil')&&document.getElementById('tab-funil').classList.contains('active')) renderKanban();}catch(e){}
  try{if(document.getElementById('tab-leads')&&document.getElementById('tab-leads').classList.contains('active')) renderTable();}catch(e){}
  try{renderNotifPanel();}catch(e){}
  setTimeout(()=>{ showCelebra(u?u.nome:'Vendedor', val); }, 100);
}
function resetRanking(){
  showConfirm(`Resetar o ranking de ${mesAtual()}? Esta ação não pode ser desfeita.`,function(){
    users.forEach(u=>{u.vendas=0;u.credito=0;if(window._syncUser)window._syncUser(u).catch(e=>console.warn('[resetRanking]',e));});
    if(window._saveAtividade)window._saveAtividade('ti-refresh',`Ranking resetado para novo mês`);renderRanking();
  });
}
let tvFilter=3;
let tvTheme='dark';
let tvMode='loja';       // 'loja' | 'pessoa' | 'equipe'
let tvEquipeFilter=null; // null = todas (usado no modo pessoa)

function setTVMode(mode,btn){
  tvMode=mode;
  tvEquipeFilter=null; // reset filtro de equipe ao trocar modo
  document.querySelectorAll('.tv-mtab').forEach(b=>b.classList.remove('tv-active'));
  if(btn)btn.classList.add('tv-active');
  // limpa body imediatamente para evitar conteúdo residual
  const body=document.getElementById('tv-body');
  if(body)body.innerHTML='';
  const filterRow=document.getElementById('tv-filter-row');
  const eqTabs=document.getElementById('tv-equipe-tabs');
  if(mode==='equipe'){
    if(filterRow)filterRow.classList.add('tv-hidden');
    if(eqTabs){eqTabs.classList.add('tv-hidden');eqTabs.innerHTML='';}
  } else if(mode==='pessoa'){
    if(filterRow)filterRow.classList.remove('tv-hidden');
    if(eqTabs){eqTabs.classList.remove('tv-hidden');renderTVEquipeTabs();}
  } else { // loja
    if(filterRow)filterRow.classList.remove('tv-hidden');
    if(eqTabs){eqTabs.classList.add('tv-hidden');eqTabs.innerHTML='';}
  }
  renderTV();
}

function renderTVEquipeTabs(){
  const ct=document.getElementById('tv-equipe-tabs');
  if(!ct)return;
  if(!equipes||equipes.length===0){ct.innerHTML='';return;}
  const btns=[{id:null,nome:'Todas'},...equipes.map(e=>({id:e.id,nome:e.nome}))];
  ct.innerHTML=btns.map(e=>`<button class="tv-etab${tvEquipeFilter===e.id?' tv-active':''}" onclick="setTVEquipe(${e.id===null?'null':`${JSON.stringify(e.id)}`},this)">${e.nome}</button>`).join('');
}

function setTVEquipe(id,btn){
  tvEquipeFilter=id;
  document.querySelectorAll('.tv-etab').forEach(b=>b.classList.remove('tv-active'));
  if(btn)btn.classList.add('tv-active');
  renderTV();
}

function openTV(){
  const ov=document.getElementById('tv-overlay');
  ov.classList.add('open');
  ov.classList.remove('tv-light','tv-dark');
  ov.classList.add('tv-'+tvTheme);
  // reset para modo loja na abertura
  tvMode='loja';
  tvEquipeFilter=null;
  document.querySelectorAll('.tv-mtab').forEach(b=>b.classList.remove('tv-active'));
  const lojaBtn=document.getElementById('tv-mode-loja');
  if(lojaBtn)lojaBtn.classList.add('tv-active');
  const filterRow=document.getElementById('tv-filter-row');
  const eqTabs=document.getElementById('tv-equipe-tabs');
  if(filterRow)filterRow.classList.remove('tv-hidden');
  if(eqTabs){eqTabs.classList.add('tv-hidden');eqTabs.innerHTML='';}
  const body=document.getElementById('tv-body');
  if(body)body.innerHTML='';
  renderTV();
}

function closeTV(){
  document.getElementById('tv-overlay').classList.remove('open');
}

function setTVFilter(n,btn){
  tvFilter=n;
  document.querySelectorAll('.tv-ftab').forEach(b=>b.classList.remove('tv-active'));
  if(btn) btn.classList.add('tv-active');
  renderTV();
}

function toggleTVTheme(){
  tvTheme=tvTheme==='dark'?'light':'dark';
  const ov=document.getElementById('tv-overlay');
  ov.classList.remove('tv-light','tv-dark');
  ov.classList.add('tv-'+tvTheme);
  const icon=document.getElementById('tv-theme-icon');
  const lbl=document.getElementById('tv-theme-label');
  if(icon) icon.className='ti '+(tvTheme==='dark'?'ti-sun':'ti-moon');
  if(lbl) lbl.textContent=tvTheme==='dark'?'Tema claro':'Tema escuro';
}

function renderTVEquipes(){
  const body=document.getElementById('tv-body');
  const subEl=document.getElementById('tv-sub-label');
  if(subEl) subEl.textContent=`${equipes.length} equipe${equipes.length!==1?'s':''} ativas`;
  if(!body)return;
  if(!equipes||equipes.length===0){
    body.innerHTML='<div class="tv-empty">Nenhuma equipe cadastrada ainda.</div>';
    return;
  }
  const cards=equipes.map(eq=>{
    const membros=(eq.membroIds||[]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
    const total=membros.reduce((s,u)=>s+(u.credito||0),0);
    const meta=eq.meta||0;
    const pct=meta>0?Math.min((total/meta)*100,100):0;
    const over=meta>0&&total>=meta;
    const falta=meta>0?Math.max(meta-total,0):0;
    const logoHtml=eq.foto
      ?`<img src="${eq.foto}" class="tv-eq-logo" alt="${eq.nome}">`
      :`<div class="tv-eq-logo-init">${eq.nome.charAt(0).toUpperCase()}</div>`;
    const barW=Math.max(pct,2).toFixed(1);
    const metaLabel=meta>0?(over?'✓ Meta batida':`${pct.toFixed(0)}%`):null;
    return `<div class="tv-eq-card">
      ${metaLabel?`<div class="tv-eq-badge-meta ${over?'over':'ok'}">${metaLabel}</div>`:''}
      ${logoHtml}
      <div class="tv-eq-nome">${eq.nome}</div>
      <div class="tv-eq-membros">${membros.length} vendedor${membros.length!==1?'es':''}</div>
      <div class="tv-eq-total">${fmtR(total)}</div>
      <div class="tv-eq-total-lbl">Total vendido</div>
      ${meta>0?`
      <div class="tv-eq-bar-wrap"><div class="tv-eq-bar-fill${over?' over':''}" style="width:${barW}%"></div></div>
      <div class="tv-eq-pct-row">
        <span class="tv-eq-pct${over?' over':''}">${over?'🎯 Meta batida!':pct.toFixed(0)+'% da meta'}</span>
        ${!over?`<span class="tv-eq-falta">Falta ${fmtR(falta)}</span>`:''}
      </div>`:'<div class="tv-eq-falta" style="width:100%;text-align:center">Meta não definida</div>'}
    </div>`;
  }).join('');
  body.innerHTML=`<div class="tv-eq-grid">${cards}</div>`;
}

function renderTV(){
  const monthEl=document.getElementById('tv-month-title');
  const periodoLabels={hoje:'Hoje',dia:'Hoje',semana:'Esta semana',mes:mesAtual(),custom:'Personalizado',semana_passada:'Semana passada',mes_passado:'Mês passado',ultimos_7:'Últimos 7 dias',ultimos_30:'Últimos 30 dias'};
  if(monthEl) monthEl.textContent=periodoLabels[rankPeriodo]||mesAtual();
  // modo equipe → visualização diferente
  if(tvMode==='equipe'){renderTVEquipes();return;}
  const subEl=document.getElementById('tv-sub-label');
  // modo pessoa → filtra por equipe selecionada; modo loja → todos
  let pool=tvMode==='pessoa'&&tvEquipeFilter!==null
    ?[...users].filter(u=>{const eq=equipes.find(e=>e.id===tvEquipeFilter);return eq&&(eq.membroIds||[]).includes(u.id);})
    :[...users];
  const sorted=pool.sort((a,b)=>b.credito-a.credito||b.vendas-a.vendas);
  const limit=tvFilter>0?tvFilter:sorted.length;
  const shown=sorted.slice(0,limit);
  const eqName=tvMode==='pessoa'&&tvEquipeFilter!==null?(equipes.find(e=>e.id===tvEquipeFilter)||{}).nome:'';
  const eqSuffix=eqName?` · ${eqName}`:'';
  if(subEl) subEl.textContent=(tvFilter===0?'Todos os vendedores':tvFilter===3?'Pódio — Top 3':`Top ${tvFilter} vendedores`)+eqSuffix;
  const posClass=['tv-pos1','tv-pos2','tv-pos3'];
  const body=document.getElementById('tv-body');
  if(!body) return;
  if(shown.length===0){
    body.innerHTML='<div class="tv-empty">Nenhuma venda registrada ainda.</div>';
    return;
  }

  function avHtml(u,cls,size){
    if(u.foto) return `<img src="${u.foto}" class="${cls}" alt="${u.nome}" style="width:${size}px;height:${size}px;object-fit:cover;object-position:center 15%;border-radius:50%">`;
    return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.38)}px">${u.nome.charAt(0).toUpperCase()}</div>`;
  }

  // ── PODIUM VIEW (Top 3) ──────────────────────────
  if(tvFilter===3){
    const top=shown.slice(0,3);
    // order: 2nd, 1st, 3rd (visual podium)
    const podOrder=[top[1],top[0],top[2]].filter(Boolean);
    const podClass=['tv-pod-2','tv-pod-1','tv-pod-3'];
    const podPos=[1,0,2]; // index into top array
    body.innerHTML=`<div class="tv-podium">${podOrder.map((u,vi)=>{
      if(!u)return'';
      const realIdx=sorted.indexOf(u);
      const pc=podClass[vi];
      const size=pc==='tv-pod-1'?130:pc==='tv-pod-2'?100:88;
      const av=avHtml(u,'tv-pod-av',size);
      const hierLabel=getHierLabel(u);
      const eqU=equipes.find(e=>(e.membroIds||[]).includes(u.id));
      const posColors=['#c8950a','#7a8fa8','#9a6030'];
      return `<div class="tv-pod-card ${pc}">
        <div class="tv-pod-pos">${realIdx+1}°</div>
        ${av}
        <div class="tv-pod-name">${u.nome}</div>
        <div class="tv-pod-role">${hierLabel}${eqU?' · '+eqU.nome:''}</div>
        <div class="tv-pod-val">${fmtR(u.credito)}</div>
        <div class="tv-pod-sales">${u.vendas} venda${u.vendas!==1?'s':''}</div>
      </div>`;
    }).join('')}</div>`;
    return;
  }

  // ── LIST VIEW (Top 5 / 10 / 50 / Todos) ──────────
  const compact=limit>10;
  function renderRow(u,globalPos){
    const pcls=posClass[globalPos]||'';
    const posLabel=(globalPos+1)+'°';
    const hierLabel=getHierLabel(u);
    const eqU=equipes.find(e=>(e.membroIds||[]).includes(u.id));
    const meta=`${u.vendas} venda${u.vendas!==1?'s':''} · ${hierLabel}${eqU?' · '+eqU.nome:''}`;
    const size=compact?48:62;
    const av=avHtml(u,'tv-av',size);
    return `<div class="tv-row ${pcls}${compact?' tv-compact':''}">
      <div class="tv-pos-badge">${posLabel}</div>
      ${av}
      <div class="tv-info">
        <div class="tv-name">${u.nome}</div>
        <div class="tv-meta">${meta}</div>
      </div>
      <div class="tv-val-block">
        <div class="tv-val-lbl">Total vendido</div>
        <div class="tv-sc">${fmtR(u.credito)}</div>
      </div>
    </div>`;
  }

  const cols=limit>5?2:1;
  if(cols===1){
    body.innerHTML=`<div class="tv-list">${shown.map((u,i)=>renderRow(u,sorted.indexOf(u))).join('')}</div>`;
  } else {
    const half=Math.ceil(shown.length/2);
    const col1=shown.slice(0,half);
    const col2=shown.slice(half);
    body.innerHTML=`<div class="tv-list-grid">${col1.map(u=>renderRow(u,sorted.indexOf(u))).join('')}${col2.map(u=>renderRow(u,sorted.indexOf(u))).join('')}</div>`;
  }
}


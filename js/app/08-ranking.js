// ─── RANKING ──────────────────────────────────────────────────────────────────
// Números do período escolhido vêm do servidor (_rankOverride, por pessoa).
function _rankStats(u){
  if(_rankOverride){ const o=_rankOverride[u.sb_id]; return {vendas:o?o.vendas:0,credito:o?o.credito:0}; }
  return {vendas:u.vendas||0,credito:u.credito||0};
}
function _membrosMinhaEquipe(me){
  const ids=new Set([me.id]);
  equipes.filter(e=>(e.membroIds||[]).includes(me.id)||e.supervisorId===me.id||e.representanteId===me.id)
    .forEach(e=>(e.membroIds||[]).forEach(id=>ids.add(id)));
  return ids;
}
// Quem aparece no ranking para quem está logado (ranking geral, da equipe ou só o próprio)
function _usuariosDoRanking(){
  const me=getMe();
  if(!me) return [];
  const base=users.filter(u=>u.nome&&u.nome.trim());
  if(isGestor(me)||can('ranking_all')) return base;
  if(can('ranking_team')){ const ids=_membrosMinhaEquipe(me); return base.filter(u=>ids.has(u.id)); }
  return base.filter(u=>u.id===me.id);
}
function _equipesDoRanking(){
  const me=getMe();
  if(!me) return [];
  if(isGestor(me)||can('ranking_all')) return equipes.slice();
  return equipes.filter(e=>(e.membroIds||[]).includes(me.id)||e.supervisorId===me.id||e.representanteId===me.id);
}
// Pessoas para quem quem está logado pode lançar venda (além de si mesmo)
function _candidatosVenda(){
  const me=getMe();
  if(!me) return [];
  if(isGestor(me)) return users.filter(u=>u.id!==me.id);
  if(!can('vendas_create')&&!can('funil_move')) return [];
  const vis=getVisiveisParaMim();
  return users.filter(u=>vis.has(u.id)&&u.id!==me.id);
}
function _iniciais(nome){ return String(nome||'?').split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase()||'?'; }
function _fotoOuInicial(u,estiloImg){
  const f=safeUrl(u.foto);
  return f?`<img src="${f}" style="${estiloImg||'width:100%;height:100%;object-fit:cover;border-radius:inherit'}" alt="">`:`<span>${esc(_iniciais(u.nome))}</span>`;
}
const _PERIODO_LABEL=()=>({hoje:'Hoje',dia:'Hoje',semana:'Esta semana',mes:mesAtual(),todos:'Desde o início',
  custom:rankDataSelecionada?new Date(rankDataSelecionada+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}):'Data personalizada',
  semana_passada:'Semana passada',mes_passado:'Mês passado',ultimos_7:'Últimos 7 dias',ultimos_30:'Últimos 30 dias'});

function rankAtualizarSidebar(){
  const me=getMe();
  if(!me) return;
  const sub=document.getElementById('minha-venda-sub');
  if(sub) sub.textContent=`Olá, ${me.nome.split(' ')[0]}! Selecione o lead ou informe o valor.`;
  const vleadme=document.getElementById('vleadme');
  if(vleadme){
    const v=vleadme.value;
    const meus=leads.filter(l=>l.responsavelId===me.id&&l.etapa!=='Fechado / Convertido'&&l.etapa!=='Perdido');
    vleadme.innerHTML='<option value="">Selecionar lead (opcional)...</option>'+meus.map(l=>`<option value="${l.id}">${esc(l.nome)}${l.credito?' — '+fmtR(l.credito):''}</option>`).join('');
    vleadme.value=v;
  }
  const candidatos=_candidatosVenda().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const cardOutro=document.getElementById('card-venda-outro');
  if(cardOutro) cardOutro.style.display=candidatos.length?'':'none';
  const vv=document.getElementById('vvend');
  if(vv&&candidatos.length){
    const v=vv.value;
    vv.innerHTML='<option value="">Selecionar...</option>'+candidatos.map(u=>`<option value="${u.id}">${esc(u.nome)}</option>`).join('');
    vv.value=v;
  }
}

function renderRanking(){
  const lbl=_PERIODO_LABEL();
  const tituloPeriodo=lbl[rankPeriodo]||mesAtual();
  const elMes=document.getElementById('rank-month'); if(elMes) elMes.textContent=tituloPeriodo;
  const elTv=document.getElementById('tv-month-title'); if(elTv) elTv.textContent=tituloPeriodo;
  const pessoas=_usuariosDoRanking().map(u=>Object.assign({},u,_rankStats(u)));
  const porId=new Map(pessoas.map(u=>[u.id,u]));

  const podioEl=document.getElementById('podio-area');
  const rqEl=document.getElementById('rk-equipes');
  const rtEl=document.getElementById('rk-todos');
  const rankEl=document.getElementById('ranking-rows');
  [podioEl,rqEl,rtEl,rankEl].forEach(el=>{if(el)el.style.display='none';});
  const medals=['🥇','🥈','🥉'];

  // ── EQUIPES ─────────────────────────────────────────
  if(rankView==='equipes'){
    if(rqEl){
      rqEl.style.display='block';
      const eqRank=_equipesDoRanking().map(eq=>{
        const mbs=(eq.membroIds||[]).map(id=>porId.get(id)||users.find(u=>u.id===id)).filter(Boolean).map(u=>porId.get(u.id)||Object.assign({},u,_rankStats(u)));
        const sup=users.find(u=>u.id===eq.supervisorId);
        return{eq,mbs,sup,totalCred:mbs.reduce((s,u)=>s+(u.credito||0),0),totalVend:mbs.reduce((s,u)=>s+(u.vendas||0),0)};
      }).sort((a,b)=>b.totalCred-a.totalCred||b.totalVend-a.totalVend);
      rqEl.innerHTML=!eqRank.length
        ?`<div style="padding:52px 24px;text-align:center"><div style="font-size:52px;margin-bottom:14px">🏆</div><div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:6px">Nenhuma equipe cadastrada</div><div style="font-size:13px;color:var(--tm)">Cadastre equipes em Configurações → Equipes.</div></div>`
        :eqRank.map(({eq,mbs,sup,totalCred,totalVend},i)=>`
          <div class="rq-card${i===0?' lider':''}">
            <div class="rq-pos">${medals[i]||`${i+1}º`}</div>
            <div class="rq-av" style="${safeUrl(eq.foto)?'background:none;font-size:0':'font-size:16px'}">${_fotoOuInicial(eq)}</div>
            <div class="rq-info">
              <div class="rq-nome">${esc(eq.nome)}</div>
              <div class="rq-meta">${sup?`Supervisor: ${esc(sup.nome)}`:'Sem supervisor'} · ${mbs.length} membro${mbs.length!==1?'s':''}</div>
              <div class="rq-stats">
                <div class="rq-stat"><div class="rq-lbl">Vendas</div><div class="rq-val">${totalVend}</div></div>
                <div class="rq-stat"><div class="rq-lbl">Volume</div><div class="rq-val g">${fmtR(totalCred)}</div></div>
                ${eq.meta?`<div class="rq-stat"><div class="rq-lbl">Meta</div><div class="rq-val">${fmtR(eq.meta)}<span style="font-size:10px;font-weight:600;color:var(--tm)">/${({mensal:'mês',semanal:'sem',personalizado:'per'})[eq.periodo||'mensal']||'mês'}</span></div></div>`:''}
              </div>
            </div>
          </div>`).join('');
    }
    try{rankAtualizarSidebar();}catch(e){}
    return;
  }

  const sorted=[...pessoas].sort((a,b)=>b.credito-a.credito||b.vendas-a.vendas||a.nome.localeCompare(b.nome,'pt-BR'));

  // ── TODOS (tabela) ──────────────────────────────────
  if(rankView==='todos'){
    if(rtEl){
      rtEl.style.display='block';
      rtEl.innerHTML=!sorted.length
        ?`<div style="padding:52px 24px;text-align:center"><div style="font-size:52px;margin-bottom:14px">👤</div><div style="font-size:15px;font-weight:800;color:var(--tx)">Nenhum vendedor</div></div>`
        :`<div style="overflow-x:auto"><table class="rt-table"><thead><tr>
            <th class="rt-pos">#</th><th></th><th>Nome</th><th>Equipe</th><th>Supervisor</th><th>Vendas</th><th>Volume</th>
          </tr></thead><tbody>${sorted.map((u,i)=>{
            const eq=getEqDeUser(u);const sup=eq?users.find(x=>x.id===eq.supervisorId):null;
            return`<tr>
              <td class="rt-pos">${medals[i]||i+1}</td>
              <td><div class="rt-av">${_fotoOuInicial(u)}</div></td>
              <td><div class="rt-name">${esc(u.nome)}</div><div class="rt-sub">${esc(getHierLabel(u))}</div></td>
              <td style="color:var(--tm)">${eq?esc(eq.nome):'—'}</td>
              <td style="color:var(--tm)">${sup?esc(sup.nome):'—'}</td>
              <td>${u.vendas}</td>
              <td class="rt-green">${fmtR(u.credito)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`;
    }
    try{rankAtualizarSidebar();}catch(e){}
    return;
  }

  // ── MINHA LOJA (padrão) ─────────────────────────────
  if(podioEl&&sorted.length&&sorted[0].credito>0){
    podioEl.style.display='block';
    const top=sorted.slice(0,3);
    const cols=[[1,'s2','b2','🥈'],[0,'s1','b1','🥇'],[2,'s3','b3','🥉']].filter(([idx])=>top[idx]);
    podioEl.innerHTML=`<div class="podio-wrap">
      <div class="podio-title">🏆 Top 3 Vendedores — ${esc(tituloPeriodo)}</div>
      <div class="podio-grid">${cols.map(([idx,sz,bc,med])=>{
        const u=top[idx];const eqU=getEqDeUser(u);
        return`<div class="podio-col">
          <div class="podio-medal">${med}</div>
          <div class="podio-av ${sz}">${_fotoOuInicial(u)}</div>
          <div class="podio-nome">${esc(u.nome)}</div>
          <div class="podio-sub">${esc(eqU?eqU.nome:getHierLabel(u))}</div>
          <div class="podio-val">${fmtR(u.credito)}</div>
          <div class="podio-base ${bc}"></div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }
  if(rankEl){
    rankEl.style.display='block';
    if(!sorted.length||(sorted.length===1&&!sorted[0].credito)){
      rankEl.innerHTML=`<div style="padding:52px 24px;text-align:center">
        <div style="font-size:52px;margin-bottom:14px">🏆</div>
        <div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:6px">Ranking vazio</div>
        <div style="font-size:13px;color:var(--tm)">As vendas do período aparecem aqui assim que forem registradas.</div>
      </div>`;
    } else {
      rankEl.innerHTML=sorted.map((u,i)=>{
        const isLider=i===0&&u.credito>0;
        const meta=Number(u.meta)||0;   // sem meta cadastrada: não inventa um valor
        const pct=meta>0?Math.min(Math.round(u.credito/meta*100),999):0;
        const atingiu=meta>0&&pct>=100;
        const posLabel=i===0?'🥇 1º':i===1?'🥈 2º':i===2?'🥉 3º':`${i+1}º lugar`;
        const eqU=getEqDeUser(u);
        const foto=safeUrl(u.foto);
        return `<div class="rank-card${isLider?' primeiro':''}">
          <div class="rank-left">
            <div class="rank-num${isLider?' gold':''}">${posLabel}</div>
            <div class="rank-av-wrap">
              ${foto
                ?`<img src="${foto}" class="rank-av-foto" alt="" style="${isLider?'box-shadow:0 0 0 3px var(--gold),0 6px 20px rgba(0,0,0,.25)':''}">`
                :`<div class="rank-av" style="${isLider?'background:linear-gradient(135deg,var(--gold),var(--gold2));color:var(--navy);':''}">${esc(u.nome.charAt(0))}</div>`}
              ${isLider?'<div class="rank-av-crown">👑</div>':''}
            </div>
          </div>
          <div class="rank-right-col">
            <div class="rank-nome-row">
              <div class="rank-nome">${esc(u.nome)}</div>
              <span class="rank-role-badge rbadge ${getHierClass(u)}">${esc(getHierLabel(u))}</span>
            </div>
            ${eqU?`<div style="font-size:11px;color:var(--tm);margin-top:2px">📋 ${esc(eqU.nome)}</div>`:''}
            <div class="rank-vals">
              <div class="rank-val-item"><div class="rank-val-label">💰 Vendas</div><div class="rank-val-num green">${fmtR(u.credito)}</div></div>
              <div class="rank-val-item"><div class="rank-val-label">🎯 Meta</div><div class="rank-val-num ${meta?(atingiu?'green':'red'):''}">${meta?fmtR(meta):'Sem meta'}</div></div>
            </div>
            <div class="rank-bar-outer"><div class="rank-bar-inner ${atingiu?'atingiu':'nao-atingiu'}" style="width:${Math.min(pct,100)}%"></div></div>
            <div class="rank-bar-footer">
              <div class="rank-vendas-cnt">${u.vendas} venda${u.vendas!==1?'s':''}</div>
              ${meta?`<span class="rank-pct-badge ${atingiu?'atingiu':'nao-atingiu'}">${pct}%</span>`:''}
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }
  if(document.getElementById('tv-overlay')?.classList.contains('open')) renderTV();
  try{rankAtualizarSidebar();}catch(e){}
}

// ─── REGISTRAR / REMOVER VENDA ────────────────────────────────────────────────
function rankAutoFillMe(){
  const sel=document.getElementById('vleadme'),inp=document.getElementById('vval-me');
  if(!sel||!inp||!sel.value)return;
  const lead=leads.find(l=>l.id===parseInt(sel.value));
  if(lead&&lead.credito) inp.value=Math.round(lead.credito).toLocaleString('pt-BR');
}
function rankCarregarLeadsVendedor(){
  const vvend=document.getElementById('vvend'),vlead=document.getElementById('vlead'),vval=document.getElementById('vval');
  if(!vvend||!vlead)return;
  vlead.innerHTML='<option value="">Selecionar lead (opcional)...</option>';
  if(vval)vval.value='';
  const uid=parseInt(vvend.value);
  if(!uid)return;
  leads.filter(l=>l.responsavelId===uid&&l.etapa!=='Fechado / Convertido'&&l.etapa!=='Perdido').forEach(l=>{
    const opt=document.createElement('option');
    opt.value=l.id;
    opt.textContent=`${l.nome}${l.credito?' — '+fmtR(l.credito):''}`;
    vlead.appendChild(opt);
  });
}
function rankAutoFillVend(){
  const sel=document.getElementById('vlead'),inp=document.getElementById('vval');
  if(!sel||!inp||!sel.value)return;
  const lead=leads.find(l=>l.id===parseInt(sel.value));
  if(lead&&lead.credito) inp.value=Math.round(lead.credito).toLocaleString('pt-BR');
}
// Com lead: o lead vai para "Fechado / Convertido" e o banco registra UMA venda.
// Sem lead: venda manual (só valor).
let _registrandoVenda=false;
async function _registrarVendaPara(u,lead,val){
  if(lead){
    if(!podeMoverLead(lead)){showToast('Você não tem permissão para mover este lead no funil.','ti-lock');return false;}
    if(lead.etapa==='Fechado / Convertido'){showToast('Este lead já está como vendido.','ti-info-circle');return false;}
    const antes={...lead};
    lead.etapa='Fechado / Convertido';
    lead.credito=val;
    const ok=await window._syncLead(lead);
    if(!ok&&!window._leadPendente(lead)){ Object.assign(lead,antes); return false; }
    if(window._saveAtividade)window._saveAtividade('ti-circle-check',`${lead.nome} fechado — ${fmtR(val)}`,u.sb_id);
  } else {
    if(!can('vendas_create')){showToast('Você não tem permissão para registrar venda manual.','ti-lock');return false;}
    const {error}=await window._registrarVendaManual(u.sb_id,val,'Venda manual');
    if(error){showToast('Não foi possível registrar a venda: '+(error.message||'sem permissão'),'ti-alert-triangle','#dc2626');return false;}
    if(window._saveAtividade)window._saveAtividade('ti-trophy',`${u.nome} registrou venda de ${fmtR(val)}`,u.sb_id);
  }
  _atualizarAposVenda();
  _aplicarFiltroVendas();
  try{renderDashboard();}catch(e){}
  try{renderKanban();renderTable();}catch(e){}
  try{renderNotifPanel();}catch(e){}
  return true;
}
async function addMinhaVenda(){
  if(_registrandoVenda)return;
  const me=getMe();
  if(!me){showToast('Usuário não identificado.','ti-alert-triangle','#d97706');return;}
  const leadSel=document.getElementById('vleadme');
  const lead=leads.find(l=>l.id===parseInt(leadSel?.value))||null;
  const val=unM(document.getElementById('vval-me').value)||(lead?lead.credito:0);
  if(!val){showToast('Informe o valor da venda ou selecione um lead.','ti-alert-triangle','#d97706');return;}
  _registrandoVenda=true;
  try{
    if(!await _registrarVendaPara(me,lead,val)) return;
    if(leadSel)leadSel.value='';
    document.getElementById('vval-me').value='';
    setTimeout(()=>showCelebra(me.nome,val),100);
  }finally{_registrandoVenda=false;}
}
async function addVenda(){
  if(_registrandoVenda)return;
  const id=parseInt(document.getElementById('vvend').value);
  const u=_candidatosVenda().find(x=>x.id===id);
  if(!u){showToast('Selecione um vendedor.','ti-alert-triangle','#d97706');return;}
  const rls=document.getElementById('vlead');
  const lead=rls&&rls.value?leads.find(l=>l.id===parseInt(rls.value)&&l.responsavelId===u.id)||null:null;
  const val=unM(document.getElementById('vval').value)||(lead?lead.credito:0);
  if(!val){showToast('Informe o valor da venda.','ti-alert-triangle','#d97706');return;}
  _registrandoVenda=true;
  try{
    if(!await _registrarVendaPara(u,lead,val)) return;
    if(rls)rls.value='';
    document.getElementById('vval').value='';
    setTimeout(()=>showCelebra(u.nome,val),100);
  }finally{_registrandoVenda=false;}
}
// Remove a última venda da pessoa. Se a venda era de um lead, o banco devolve o
// lead para "Negociação" e acerta ranking e lance automático.
async function _removerUltimaVendaDe(u){
  if(!can('vendas_delete')){showToast('Você não tem permissão para excluir vendas.','ti-lock');return;}
  const {data:v,error}=await window._ultimaVendaDe(u.sb_id);
  if(error){showToast('Não foi possível consultar as vendas: '+error.message,'ti-alert-triangle','#dc2626');return;}
  if(!v){showToast(`${u.nome} não tem vendas registradas.`,'ti-info-circle');return;}
  const quando=v.data_fechamento?String(v.data_fechamento).slice(0,10).split('-').reverse().join('/'):'';
  showConfirm(`Remover a última venda de ${u.nome}: ${fmtR(v.valor_credito||0)}${v.cliente_nome?` (${v.cliente_nome})`:''}${quando?` em ${quando}`:''}?${v.lead_id?' O lead volta para Negociação.':''}`,async function(){
    const r=await window._excluirVenda(v.id);
    if(r.error){showToast('Não foi possível remover: '+r.error.message,'ti-alert-triangle','#dc2626');return;}
    const me=getMe();
    if(window._saveAtividade)window._saveAtividade('ti-trash',u.id===me?.id?`${u.nome} removeu a última venda`:`Venda de ${u.nome} removida por ${me?me.nome:'gestor'}`,u.sb_id);
    if(v.lead_id){
      const l=leads.find(x=>x.sb_id===v.lead_id);
      if(l&&l.etapa==='Fechado / Convertido') l.etapa='Negociação';
    }
    _atualizarAposVenda();
    _aplicarFiltroVendas();
    try{renderDashboard();renderKanban();renderTable();renderNotifPanel();}catch(e){}
    showToast('Venda removida.','ti-check','#22c55e');
  });
}
function removerMinhaVenda(){
  const me=getMe();
  if(!me){showToast('Usuário não identificado.','ti-alert-triangle','#d97706');return;}
  _removerUltimaVendaDe(me);
}
function removerVenda(){
  const uid=parseInt(document.getElementById('vvend')?.value)||0;
  const u=_candidatosVenda().find(x=>x.id===uid);
  if(!u){showToast('Selecione um vendedor.','ti-alert-triangle','#d97706');return;}
  _removerUltimaVendaDe(u);
}

// ─── MODO TV ──────────────────────────────────────────────────────────────────
let tvFilter=3;
let tvTheme='dark';
let tvMode='loja';       // 'loja' | 'pessoa' | 'equipe'
let tvEquipeFilter=null; // null = todas (modo pessoa)

function setTVMode(mode,btn){
  tvMode=mode;
  tvEquipeFilter=null;
  document.querySelectorAll('.tv-mtab').forEach(b=>b.classList.remove('tv-active'));
  if(btn)btn.classList.add('tv-active');
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
  } else {
    if(filterRow)filterRow.classList.remove('tv-hidden');
    if(eqTabs){eqTabs.classList.add('tv-hidden');eqTabs.innerHTML='';}
  }
  renderTV();
}
function renderTVEquipeTabs(){
  const ct=document.getElementById('tv-equipe-tabs');
  if(!ct)return;
  const eqs=_equipesDoRanking();
  if(!eqs.length){ct.innerHTML='';return;}
  ct.innerHTML=[{id:null,nome:'Todas'},...eqs].map(e=>`<button class="tv-etab${tvEquipeFilter===e.id?' tv-active':''}" onclick="setTVEquipe(${e.id===null?'null':Number(e.id)},this)">${esc(e.nome)}</button>`).join('');
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
  tvMode='loja';
  tvEquipeFilter=null;
  document.querySelectorAll('.tv-mtab').forEach(b=>b.classList.remove('tv-active'));
  document.getElementById('tv-mode-loja')?.classList.add('tv-active');
  document.getElementById('tv-filter-row')?.classList.remove('tv-hidden');
  const eqTabs=document.getElementById('tv-equipe-tabs');
  if(eqTabs){eqTabs.classList.add('tv-hidden');eqTabs.innerHTML='';}
  const body=document.getElementById('tv-body');
  if(body)body.innerHTML='';
  renderTV();
}
function closeTV(){document.getElementById('tv-overlay').classList.remove('open');}
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
  const eqs=_equipesDoRanking();
  const subEl=document.getElementById('tv-sub-label');
  if(subEl) subEl.textContent=`${eqs.length} equipe${eqs.length!==1?'s':''} ativas`;
  if(!body)return;
  if(!eqs.length){body.innerHTML='<div class="tv-empty">Nenhuma equipe cadastrada ainda.</div>';return;}
  body.innerHTML=`<div class="tv-eq-grid">${eqs.map(eq=>{
    const membros=(eq.membroIds||[]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
    const total=membros.reduce((s,u)=>s+_rankStats(u).credito,0);
    const meta=eq.meta||0;
    const pct=meta>0?Math.min((total/meta)*100,100):0;
    const over=meta>0&&total>=meta;
    const falta=meta>0?Math.max(meta-total,0):0;
    const foto=safeUrl(eq.foto);
    const metaLabel=meta>0?(over?'✓ Meta batida':`${pct.toFixed(0)}%`):null;
    return `<div class="tv-eq-card">
      ${metaLabel?`<div class="tv-eq-badge-meta ${over?'over':'ok'}">${metaLabel}</div>`:''}
      ${foto?`<img src="${foto}" class="tv-eq-logo" alt="">`:`<div class="tv-eq-logo-init">${esc(eq.nome.charAt(0).toUpperCase())}</div>`}
      <div class="tv-eq-nome">${esc(eq.nome)}</div>
      <div class="tv-eq-membros">${membros.length} vendedor${membros.length!==1?'es':''}</div>
      <div class="tv-eq-total">${fmtR(total)}</div>
      <div class="tv-eq-total-lbl">Total vendido</div>
      ${meta>0?`
      <div class="tv-eq-bar-wrap"><div class="tv-eq-bar-fill${over?' over':''}" style="width:${Math.max(pct,2).toFixed(1)}%"></div></div>
      <div class="tv-eq-pct-row">
        <span class="tv-eq-pct${over?' over':''}">${over?'🎯 Meta batida!':pct.toFixed(0)+'% da meta'}</span>
        ${!over?`<span class="tv-eq-falta">Falta ${fmtR(falta)}</span>`:''}
      </div>`:'<div class="tv-eq-falta" style="width:100%;text-align:center">Meta não definida</div>'}
    </div>`;
  }).join('')}</div>`;
}
function renderTV(){
  const monthEl=document.getElementById('tv-month-title');
  if(monthEl) monthEl.textContent=_PERIODO_LABEL()[rankPeriodo]||mesAtual();
  if(tvMode==='equipe'){renderTVEquipes();return;}
  const subEl=document.getElementById('tv-sub-label');
  const eqSel=tvMode==='pessoa'&&tvEquipeFilter!==null?equipes.find(e=>e.id===tvEquipeFilter):null;
  let pool=_usuariosDoRanking();
  if(eqSel) pool=pool.filter(u=>(eqSel.membroIds||[]).includes(u.id));
  const sorted=pool.map(u=>Object.assign({},u,_rankStats(u))).sort((a,b)=>b.credito-a.credito||b.vendas-a.vendas);
  const limit=tvFilter>0?tvFilter:sorted.length;
  const shown=sorted.slice(0,limit);
  if(subEl) subEl.textContent=(tvFilter===0?'Todos os vendedores':tvFilter===3?'Pódio — Top 3':`Top ${tvFilter} vendedores`)+(eqSel?` · ${eqSel.nome}`:'');
  const body=document.getElementById('tv-body');
  if(!body) return;
  if(!shown.length){body.innerHTML='<div class="tv-empty">Nenhuma venda registrada ainda.</div>';return;}
  function avHtml(u,cls,size){
    const f=safeUrl(u.foto);
    if(f) return `<img src="${f}" class="${cls}" alt="" style="width:${size}px;height:${size}px;object-fit:cover;object-position:center 15%;border-radius:50%">`;
    return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.38)}px">${esc(u.nome.charAt(0).toUpperCase())}</div>`;
  }
  if(tvFilter===3){
    const top=shown.slice(0,3);
    const podOrder=[top[1],top[0],top[2]];
    const podClass=['tv-pod-2','tv-pod-1','tv-pod-3'];
    body.innerHTML=`<div class="tv-podium">${podOrder.map((u,vi)=>{
      if(!u)return'';
      const pc=podClass[vi];
      const size=pc==='tv-pod-1'?130:pc==='tv-pod-2'?100:88;
      const eqU=getEqDeUser(u);
      return `<div class="tv-pod-card ${pc}">
        <div class="tv-pod-pos">${sorted.indexOf(u)+1}°</div>
        ${avHtml(u,'tv-pod-av',size)}
        <div class="tv-pod-name">${esc(u.nome)}</div>
        <div class="tv-pod-role">${esc(getHierLabel(u))}${eqU?' · '+esc(eqU.nome):''}</div>
        <div class="tv-pod-val">${fmtR(u.credito)}</div>
        <div class="tv-pod-sales">${u.vendas} venda${u.vendas!==1?'s':''}</div>
      </div>`;
    }).join('')}</div>`;
    return;
  }
  const compact=limit>10;
  const posClass=['tv-pos1','tv-pos2','tv-pos3'];
  const renderRow=(u,pos)=>{
    const eqU=getEqDeUser(u);
    return `<div class="tv-row ${posClass[pos]||''}${compact?' tv-compact':''}">
      <div class="tv-pos-badge">${pos+1}°</div>
      ${avHtml(u,'tv-av',compact?48:62)}
      <div class="tv-info">
        <div class="tv-name">${esc(u.nome)}</div>
        <div class="tv-meta">${u.vendas} venda${u.vendas!==1?'s':''} · ${esc(getHierLabel(u))}${eqU?' · '+esc(eqU.nome):''}</div>
      </div>
      <div class="tv-val-block">
        <div class="tv-val-lbl">Total vendido</div>
        <div class="tv-sc">${fmtR(u.credito)}</div>
      </div>
    </div>`;
  };
  body.innerHTML=limit>5
    ?`<div class="tv-list-grid">${shown.map(u=>renderRow(u,sorted.indexOf(u))).join('')}</div>`
    :`<div class="tv-list">${shown.map(u=>renderRow(u,sorted.indexOf(u))).join('')}</div>`;
}

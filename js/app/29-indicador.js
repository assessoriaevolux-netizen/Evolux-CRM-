// ─── PROJETO INDICADOR ───────────────────────────────────────────────────────
// Cada cliente recebe um link único (/indicar?c=…) para indicar até 5 amigos.
// Cada amigo vira um lead "Indicação" no funil de quem atende o cliente.
// Leitura direto das tabelas (RLS); toda escrita passa pelas funções ind_* do banco.
const IND={view:'geral',indicadores:[],indicacoes:[],carregado:false,carregando:false,erro:null,busca:'',filtro:'',canal:null};
const IND_FECHADO='Fechado / Convertido';
const IND_PREMIOS=[
  {id:'pix',ic:'💵',nome:'PIX',desc:'De R$ 100 a R$ 1.000 conforme a carta do indicado'},
  {id:'parcela',ic:'📋',nome:'Próxima parcela paga',desc:'A empresa paga a próxima parcela do cliente'},
  {id:'almoco',ic:'🍽️',nome:'Almoço VIP',desc:'Almoço com o consultor em restaurante parceiro'},
  {id:'sorteio',ic:'🎁',nome:'Sorteio mensal',desc:'Cada indicação que fecha vale um número no sorteio'},
  {id:'bonus',ic:'⭐',nome:'Bônus duplo',desc:'Duas indicações fechadas no mês dobram o prêmio'},
  {id:'credito',ic:'💳',nome:'Crédito na próxima carta',desc:'Desconto na taxa da próxima carta do cliente'},
  {id:'experiencia',ic:'🎉',nome:'Experiência VIP',desc:'Passeio ou evento especial para o cliente'},
];
// PIX sugerido pelo valor da carta do indicado
const IND_PIX=[[50000,100],[100000,200],[200000,300],[400000,500],[Infinity,1000]];
function indPixSugerido(credito){const c=Number(credito)||0;if(!c)return 100;return (IND_PIX.find(([ate])=>c<=ate)||IND_PIX[IND_PIX.length-1])[1];}

function indLink(t){return location.origin+'/indicar?c='+encodeURIComponent(t);}
function indPrimeiroNome(n){return String(n||'').trim().split(/\s+/)[0]||'';}
function indTelDigitos(t){let d=String(t||'').replace(/\D/g,'');if(d.length===10||d.length===11)d='55'+d;return d;}
function indChaveTel(t){let d=String(t||'').replace(/\D/g,'');if(d.length>=12&&d.startsWith('55'))d=d.slice(2);return d.length>=10?d.slice(0,2)+d.slice(-8):'';}
function indTelFmt(t){let d=String(t||'').replace(/\D/g,'');if(d.length>=12&&d.startsWith('55'))d=d.slice(2);
  if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return t||'';}
function indData(iso){if(!iso)return '—';const d=new Date(iso);return isNaN(d)?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});}
function indNomeUser(sbId){if(!sbId)return '—';const u=(window.users||[]).find(x=>x.sb_id===sbId);return u?u.nome:((window.usersInativos||{})[sbId]||'—');}
function indMensagem(ind){
  return `Oi ${indPrimeiroNome(ind.nome)}! Tudo bem? 😊\n\n`+
    `Você já é nosso cliente e agora pode *GANHAR PRÊMIOS* indicando amigos!\n\n`+
    `Indique até ${ind.limite||5} pessoas que querem comprar carro, imóvel, moto ou investir. Se uma delas fechar, você ganha:\n\n`+
    `💵 *PIX de R$ 100 a R$ 1.000*\n📋 Próxima parcela paga\n🍽️ Almoço VIP\n🎁 Sorteio mensal\n⭐ Bônus duplo\n💳 Crédito na próxima carta\n🎉 Experiência VIP\n\n`+
    `É rapidinho, só colocar o nome e o WhatsApp deles:\n👉 ${indLink(ind.token)}`;
}
async function indCopiar(txt,ok){
  try{await navigator.clipboard.writeText(txt);showToast(ok||'Copiado!','ti-copy');}
  catch(e){const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');showToast(ok||'Copiado!','ti-copy');}catch(e2){showToast('Não consegui copiar.','ti-alert-triangle','#dc2626');}ta.remove();}
}

// Situação de uma indicação a partir do lead no funil
function indStatus(ic){
  const l=ic.lead_id?(window.leads||[]).find(x=>String(x.sb_id)===String(ic.lead_id)):null;
  if(ic.situacao==='ja_cadastrado'){
    if(l&&l.etapa===IND_FECHADO) return {k:'fechou',t:'Fechou (já estava no CRM)',c:'q-green',lead:l};
    return {k:'repetido',t:'Já estava no CRM',c:'',lead:l};
  }
  if(!l) return {k:'oculto',t:'—',c:'',lead:null};
  if(l.etapa===IND_FECHADO) return {k:'fechou',t:'Fechou',c:'q-green',lead:l};
  if(l.etapa==='Perdido') return {k:'perdido',t:'Perdido',c:'q-red',lead:l};
  if(l.etapa==='Novo lead') return {k:'novo',t:'Novo',c:'q-yellow',lead:l};
  return {k:'atendimento',t:(typeof ETAPAS_LABEL!=='undefined'&&ETAPAS_LABEL[l.etapa])||l.etapa,c:'q-yellow',lead:l};
}

async function indCarregar(){
  if(IND.carregando) return;
  IND.carregando=true;IND.erro=null;
  try{
    // Sempre só a empresa de quem está logado (nunca mistura empresas)
    const emp=window._empresaIdDireto?String(window._empresaIdDireto):null;
    if(!emp){IND.indicadores=[];IND.indicacoes=[];IND.carregado=true;IND.carregando=false;return;}
    const [a,b]=await Promise.all([
      window._sbTodos(()=>window._sb.from('ind_indicadores').select('*').eq('empresa_id',emp).order('criado_em',{ascending:false}).order('id')),
      window._sbTodos(()=>window._sb.from('ind_indicacoes').select('*').eq('empresa_id',emp).order('criado_em',{ascending:false}).order('id')),
    ]);
    IND.indicadores=a;IND.indicacoes=b;IND.carregado=true;
  }catch(e){
    const m=String((e&&(e.message||e.code))||e);
    IND.erro=/ind_indicadores|ind_indicacoes|does not exist|42P01|schema cache/i.test(m)?'sql':m;
  }
  IND.carregando=false;
  indEscutar();
}
function indEscutar(){
  if(IND.canal||!window._sb||IND.erro||!window._empresaIdDireto) return;
  const emp=String(window._empresaIdDireto);
  let t=null;
  IND.canal=window._sb.channel('ind-indicacoes').on('postgres_changes',{event:'*',schema:'public',table:'ind_indicacoes',filter:'empresa_id=eq.'+emp},p=>{
    const row=p.new&&p.new.empresa_id?p.new:p.old;
    if(row&&row.empresa_id&&String(row.empresa_id)!==emp) return;
    if(p.eventType==='INSERT') showToast('Nova indicação: '+((p.new&&p.new.nome)||''),'ti-users-plus');
    clearTimeout(t);t=setTimeout(async()=>{await indCarregar();if(document.getElementById('tab-indicador')?.classList.contains('active')) indRender();},800);
  }).subscribe();
}

async function renderIndicador(){
  const tab=document.getElementById('tab-indicador');
  if(!tab) return;
  if(!IND.carregado){tab.innerHTML=`<div class="ind">${typeof integCarregando==='function'?integCarregando('Carregando indicações…'):'Carregando…'}</div>`;await indCarregar();}
  indRender();
}
function indRender(){
  const tab=document.getElementById('tab-indicador');
  if(!tab) return;
  if(IND.erro==='sql'){
    tab.innerHTML=`<div class="ind"><div class="integ2-aviso"><i class="ti ti-database-off"></i><div><strong>Falta instalar o Projeto Indicador no banco.</strong> Rode o arquivo <code>2026-10-29-projeto-indicador.sql</code> no SQL Editor do Supabase e recarregue a página.</div></div></div>`;
    return;
  }
  if(IND.erro){tab.innerHTML=`<div class="ind"><div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i><div>Não consegui carregar as indicações: ${esc(IND.erro)} <button class="btn bg bsm" onclick="IND.carregado=false;renderIndicador()">Tentar de novo</button></div></div></div>`;return;}
  const views=[['geral','ti-layout-dashboard','Visão geral'],['indicadores','ti-user-star','Indicadores'],['indicacoes','ti-users-plus','Indicações'],['recompensas','ti-gift','Recompensas'],['ranking','ti-trophy','Ranking']];
  tab.innerHTML=`<div class="ind">
    <div class="ind-topo">
      <div><div class="ind-tit"><i class="ti ti-gift"></i>Projeto Indicador</div>
        <div class="ind-sub">Seus clientes indicam até 5 amigos pelo link. Cada indicado cai direto no funil de quem atende o cliente.</div></div>
      <div class="ind-acoes">
        <button class="btn bg" onclick="indAbrirLote()"><i class="ti ti-users-group"></i>Gerar links em lote</button>
        <button class="btn bp" onclick="indAbrirNovo()"><i class="ti ti-plus"></i>Novo indicador</button>
      </div>
    </div>
    <div class="ind-tabs" role="tablist">${views.map(([k,ic,t])=>`<button role="tab" class="ind-tab${IND.view===k?' on':''}" onclick="IND.view='${k}';indRender()"><i class="ti ${ic}"></i>${t}</button>`).join('')}</div>
    <div id="ind-corpo">${({geral:indViewGeral,indicadores:indViewIndicadores,indicacoes:indViewIndicacoes,recompensas:indViewRecompensas,ranking:indViewRanking})[IND.view]()}</div>
  </div>`;
}

function indResumoPorIndicador(){
  const m={};
  IND.indicadores.forEach(i=>m[i.id]={total:0,fechou:0,pago:0});
  IND.indicacoes.forEach(ic=>{const r=m[ic.indicador_id];if(!r)return;r.total++;if(indStatus(ic).k==='fechou')r.fechou++;if(ic.recompensa_paga_em)r.pago+=Number(ic.recompensa_valor)||0;});
  return m;
}

function indViewGeral(){
  const ativos=IND.indicadores.filter(i=>i.ativo).length;
  const comInd=new Set(IND.indicacoes.map(i=>i.indicador_id)).size;
  const st=IND.indicacoes.map(indStatus);
  const fech=st.filter(s=>s.k==='fechou').length;
  const atend=st.filter(s=>s.k==='atendimento'||s.k==='novo').length;
  const pagas=IND.indicacoes.filter(i=>i.recompensa_paga_em);
  const totalPago=pagas.reduce((s,i)=>s+(Number(i.recompensa_valor)||0),0);
  const pend=IND.indicacoes.filter((ic,ix)=>st[ix].k==='fechou'&&!ic.recompensa_paga_em).length;
  const conv=IND.indicacoes.length?Math.round(fech/IND.indicacoes.length*100):0;
  const kpi=(ic,lbl,val,sub)=>`<div class="dn-card ind-kpi"><div class="ind-k-top"><span class="ind-k-ic"><i class="ti ${ic}"></i></span>${lbl}</div><div class="ind-k-val">${val}</div><div class="ind-k-sub">${sub}</div></div>`;
  if(!IND.indicadores.length) return `<div class="integ2-vazio"><div class="integ2-vazio-ic wa"><i class="ti ti-gift"></i></div>
    <div class="integ2-vazio-tit">Comece o seu programa de indicação</div>
    <div class="integ2-vazio-txt">Gere um link para cada cliente e mande pelo WhatsApp. O cliente coloca o nome e o telefone de até 5 amigos e cada um vira lead no seu funil, com a origem "Indicação".</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn bp" onclick="indAbrirLote()"><i class="ti ti-users-group"></i>Gerar links para meus clientes</button><button class="btn bg" onclick="indAbrirNovo()"><i class="ti ti-plus"></i>Cadastrar um cliente</button></div></div>`;
  const ultimas=IND.indicacoes.slice(0,8);
  return `<div class="ind-kpis">
      ${kpi('ti-user-star','Indicadores ativos',fmt(ativos),`${fmt(IND.indicadores.length)} cadastrados · ${fmt(comInd)} já indicaram`)}
      ${kpi('ti-users-plus','Indicações recebidas',fmt(IND.indicacoes.length),`${fmt(atend)} em atendimento`)}
      ${kpi('ti-circle-check','Fecharam',fmt(fech),`${conv}% de conversão`)}
      ${kpi('ti-gift','Recompensas pagas',fmtR(totalPago),pend?`<b class="ind-alerta">${pend} a pagar</b>`:'nenhuma pendente')}
    </div>
    <div class="dn-card"><h3><i class="ti ti-clock"></i>Últimas indicações<button class="dn-mais" onclick="IND.view='indicacoes';indRender()">Ver todas →</button></h3>
      ${ultimas.length?indTabelaIndicacoes(ultimas,true):'<div class="ind-vazio-mini">Nenhuma indicação ainda. Mande o link para os seus clientes.</div>'}</div>`;
}

function indViewIndicadores(){
  const res=indResumoPorIndicador();
  const q=IND.busca.trim().toLowerCase(), qd=q.replace(/\D/g,'');
  let lista=IND.indicadores.filter(i=>!q||String(i.nome).toLowerCase().includes(q)||(qd&&String(i.telefone||'').includes(qd)));
  if(IND.filtro==='ativos')lista=lista.filter(i=>i.ativo);
  else if(IND.filtro==='pausados')lista=lista.filter(i=>!i.ativo);
  else if(IND.filtro==='sem')lista=lista.filter(i=>!res[i.id].total);
  const gestor=isGestor();
  return `<div class="toolbar">
      <input class="tfield" placeholder="Buscar cliente…" value="${esc(IND.busca)}" oninput="IND.busca=this.value;clearTimeout(window._indT);window._indT=setTimeout(()=>{indRender();const e=document.querySelector('#ind-corpo .tfield');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},250)">
      <select class="tfield" onchange="IND.filtro=this.value;indRender()">
        ${[['','Todos'],['ativos','Links ativos'],['pausados','Links pausados'],['sem','Ainda não indicaram']].map(([k,t])=>`<option value="${k}"${IND.filtro===k?' selected':''}>${t}</option>`).join('')}
      </select>
      <span class="ind-cont">${fmt(lista.length)} cliente${lista.length===1?'':'s'}</span>
    </div>
    <div class="card ind-tw"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Responsável</th><th>Indicações</th><th>Fecharam</th><th>Último envio</th><th>Link</th><th></th></tr></thead><tbody>
    ${lista.length?lista.map(i=>{const r=res[i.id];return `<tr${i.ativo?'':' class="ind-off"'}>
      <td><strong>${esc(i.nome)}</strong>${i.ativo?'':' <span class="integ2-tag">pausado</span>'}</td>
      <td>${esc(indTelFmt(i.telefone))||'—'}</td>
      <td>${esc(indNomeUser(i.responsavel_id))}</td>
      <td><div class="ind-barra"><span style="width:${Math.min(100,r.total/(i.limite||5)*100)}%"></span></div><span class="ind-mini">${r.total}/${i.limite||5}</span></td>
      <td>${r.fechou?`<span class="integ2-tag ok">${r.fechou}</span>`:'0'}</td>
      <td>${indData(i.ultimo_envio)}</td>
      <td class="ind-nowrap">
        <button class="btn bg bsm" title="Enviar pelo WhatsApp" onclick="indEnviarWa('${i.id}')"${i.telefone&&i.ativo?'':' disabled'}><i class="ti ti-brand-whatsapp" style="color:#25d366"></i>Enviar</button>
        <button class="btn bg bsm" title="Copiar só o link" onclick="indCopiarLink('${i.id}')"><i class="ti ti-link"></i></button>
        <button class="btn bg bsm" title="Copiar mensagem completa com o link" onclick="indCopiarMsg('${i.id}')"><i class="ti ti-copy"></i></button>
      </td>
      <td class="ind-nowrap">
        <button class="btn bg bsm" title="${i.ativo?'Pausar link':'Reativar link'}" onclick="indAtivar('${i.id}',${!i.ativo})"><i class="ti ${i.ativo?'ti-player-pause':'ti-player-play'}"></i></button>
        ${gestor?`<button class="btn bg bsm" title="Remover" onclick="indExcluir('${i.id}')"><i class="ti ti-trash"></i></button>`:''}
      </td></tr>`;}).join(''):`<tr><td colspan="8" class="ind-vazio-mini">Nenhum cliente encontrado.</td></tr>`}
    </tbody></table></div>`;
}

function indTabelaIndicacoes(lista,compacta){
  const porId={};IND.indicadores.forEach(i=>porId[i.id]=i);
  const gestor=isGestor();
  return `<div class="ind-tw"><table><thead><tr><th>Indicado</th>${compacta?'':'<th>Telefone</th>'}<th>Interesse</th><th>Indicado por</th>${compacta?'':'<th>Responsável</th>'}<th>Data</th><th>Situação</th><th>Recompensa</th></tr></thead><tbody>
  ${lista.map(ic=>{const s=indStatus(ic);const ind=porId[ic.indicador_id]||{};
    const rec=ic.recompensa_paga_em?`<span class="integ2-tag ok"><i class="ti ti-check"></i>${esc(ic.recompensa||'Paga')}${ic.recompensa_valor?' · '+fmtR(ic.recompensa_valor):''}</span>`
      :ic.recompensa?`<span class="integ2-tag q-yellow">${esc(ic.recompensa)}${ic.recompensa_valor?' · '+fmtR(ic.recompensa_valor):''}</span>`
      :s.k==='fechou'?(gestor?`<button class="btn bp bsm" onclick="indAbrirRecompensa('${ic.id}')"><i class="ti ti-gift"></i>Registrar</button>`:'<span class="integ2-tag q-yellow">A pagar</span>'):'—';
    const editar=(ic.recompensa||ic.recompensa_paga_em)&&gestor?` <button class="btn bg bsm" title="Editar recompensa" onclick="indAbrirRecompensa('${ic.id}')"><i class="ti ti-pencil"></i></button>`:'';
    return `<tr>
      <td>${s.lead?`<a href="#" class="ind-link" onclick="event.preventDefault();indAbrirLead('${esc(ic.lead_id)}')">${esc(ic.nome)}</a>`:esc(ic.nome)}</td>
      ${compacta?'':`<td>${esc(indTelFmt(ic.telefone))}</td>`}
      <td>${esc(ic.interesse||'—')}</td>
      <td>${esc(ind.nome||'—')}</td>
      ${compacta?'':`<td>${esc(indNomeUser(s.lead&&s.lead.responsavelSbId||ind.responsavel_id))}</td>`}
      <td>${indData(ic.criado_em)}</td>
      <td><span class="integ2-tag ${s.c}">${esc(s.t)}</span></td>
      <td class="ind-nowrap">${rec}${editar}</td></tr>`;}).join('')}
  </tbody></table></div>`;
}
function indAbrirLead(sbId){
  const l=(window.leads||[]).find(x=>String(x.sb_id)===String(sbId));
  if(!l){showToast('Este lead não está visível para você.','ti-lock');return;}
  if(typeof openLeadDetalhe==='function') openLeadDetalhe(l.id); else showTab('leads');
}

function indViewIndicacoes(){
  const st=IND.indicacoes.map(indStatus);
  let lista=IND.indicacoes;
  if(IND.filtro&&['novo','atendimento','fechou','perdido','repetido'].includes(IND.filtro)) lista=lista.filter((ic,ix)=>st[ix].k===IND.filtro);
  const q=IND.busca.trim().toLowerCase();
  if(q) lista=lista.filter(ic=>String(ic.nome).toLowerCase().includes(q));
  return `<div class="toolbar">
      <input class="tfield" placeholder="Buscar indicado…" value="${esc(IND.busca)}" oninput="IND.busca=this.value;clearTimeout(window._indT);window._indT=setTimeout(()=>{indRender();const e=document.querySelector('#ind-corpo .tfield');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},250)">
      <select class="tfield" onchange="IND.filtro=this.value;indRender()">
        ${[['','Todas as situações'],['novo','Novas'],['atendimento','Em atendimento'],['fechou','Fecharam'],['perdido','Perdidas'],['repetido','Já estavam no CRM']].map(([k,t])=>`<option value="${k}"${IND.filtro===k?' selected':''}>${t}</option>`).join('')}
      </select>
      <span class="ind-cont">${fmt(lista.length)} indicaç${lista.length===1?'ão':'ões'}</span>
    </div>
    <div class="card">${lista.length?indTabelaIndicacoes(lista,false):'<div class="ind-vazio-mini">Nenhuma indicação por aqui.</div>'}</div>`;
}

function indViewRecompensas(){
  const st=IND.indicacoes.map(indStatus);
  const pend=IND.indicacoes.filter((ic,ix)=>st[ix].k==='fechou'&&!ic.recompensa_paga_em);
  const pagas=IND.indicacoes.filter(ic=>ic.recompensa_paga_em).sort((a,b)=>String(b.recompensa_paga_em).localeCompare(String(a.recompensa_paga_em)));
  return `<div class="ind-premios">${IND_PREMIOS.map(p=>`<div class="dn-card ind-premio"><div class="ind-premio-ic">${p.ic}</div><div><div class="ind-premio-n">${esc(p.nome)}</div><div class="ind-premio-d">${esc(p.desc)}</div></div></div>`).join('')}</div>
    <div class="dn-card"><h3><i class="ti ti-cash"></i>Tabela do PIX (pelo valor da carta do indicado)</h3>
      <div class="ind-pix">${[['Até R$ 50 mil',100],['R$ 50 a 100 mil',200],['R$ 100 a 200 mil',300],['R$ 200 a 400 mil',500],['Acima de R$ 400 mil',1000]].map(([f,v])=>`<div><span>${f}</span><strong>${fmtR(v)}</strong></div>`).join('')}</div></div>
    <div class="dn-card"><h3><i class="ti ti-hourglass"></i>A pagar <span class="integ2-tag q-yellow">${pend.length}</span></h3>
      ${pend.length?indTabelaIndicacoes(pend,true):'<div class="ind-vazio-mini">Nenhuma recompensa pendente.</div>'}</div>
    <div class="dn-card"><h3><i class="ti ti-circle-check"></i>Pagas <span class="integ2-tag ok">${pagas.length}</span></h3>
      ${pagas.length?indTabelaIndicacoes(pagas,true):'<div class="ind-vazio-mini">Nenhuma recompensa paga ainda.</div>'}</div>`;
}

function indViewRanking(){
  const res=indResumoPorIndicador();
  const lista=IND.indicadores.filter(i=>res[i.id].total).sort((a,b)=>res[b.id].fechou-res[a.id].fechou||res[b.id].total-res[a.id].total).slice(0,20);
  if(!lista.length) return '<div class="dn-card"><div class="ind-vazio-mini">O ranking aparece quando os clientes começarem a indicar.</div></div>';
  const max=Math.max(...lista.map(i=>res[i.id].total),1);
  return `<div class="dn-card"><h3><i class="ti ti-trophy"></i>Quem mais indica</h3><div class="ind-rank">
    ${lista.map((i,ix)=>{const r=res[i.id];return `<div class="ind-rank-l"><span class="ind-pos${ix<3?' top':''}">${ix<3?['🥇','🥈','🥉'][ix]:ix+1}</span>
      <div class="ind-rank-n"><strong>${esc(i.nome)}</strong><span>${esc(indNomeUser(i.responsavel_id))}</span></div>
      <div class="ind-rank-b"><div class="ind-barra"><span style="width:${r.total/max*100}%"></span></div></div>
      <div class="ind-rank-v"><strong>${r.total}</strong> indicações · <strong>${r.fechou}</strong> fecharam${r.pago?` · ${fmtR(r.pago)}`:''}</div></div>`;}).join('')}
  </div></div>`;
}

// ─── Ações ───────────────────────────────────────────────────────────────────
function indPorId(id){return IND.indicadores.find(i=>i.id===id);}
function indEnviarWa(id){
  const i=indPorId(id);if(!i)return;
  const tel=indTelDigitos(i.telefone);
  if(!tel){showToast('Este cliente está sem telefone.','ti-alert-triangle','#dc2626');return;}
  window.open('https://wa.me/'+tel+'?text='+encodeURIComponent(indMensagem(i)),'_blank','noopener');
}
function indCopiarMsg(id){const i=indPorId(id);if(i)indCopiar(indMensagem(i),'Mensagem com o link copiada!');}
function indCopiarLink(id){const i=indPorId(id);if(i)indCopiar(indLink(i.token),'Link copiado!');}
async function indAtivar(id,ativo){
  const {error}=await window._rpc('ind_editar',{p_id:id,p_ativo:ativo,p_responsavel:null,p_limite:null});
  if(error){showToast('Não consegui alterar: '+(error.message||error),'ti-alert-triangle','#dc2626');return;}
  const i=indPorId(id);if(i)i.ativo=ativo;indRender();showToast(ativo?'Link reativado':'Link pausado',ativo?'ti-player-play':'ti-player-pause');
}
function indExcluir(id){
  const i=indPorId(id);if(!i)return;
  showConfirm(`Remover ${i.nome} do Projeto Indicador?\nO link para de funcionar. Os leads indicados continuam no funil.`,async()=>{
    const {error}=await window._rpc('ind_excluir',{p_id:id});
    if(error){showToast('Não consegui remover: '+(error.message||error),'ti-alert-triangle','#dc2626');return;}
    IND.indicadores=IND.indicadores.filter(x=>x.id!==id);IND.indicacoes=IND.indicacoes.filter(x=>x.indicador_id!==id);indRender();showToast('Indicador removido','ti-trash');
  });
}

// Modal genérico da aba
function indModal(titulo,corpo,rodape,larg){
  indFecharModal();
  const m=document.createElement('div');
  m.className='modal-bg open';m.id='ind-modal';
  m.onclick=e=>{if(e.target===m)indFecharModal();};
  m.innerHTML=`<div class="modal-box" style="max-width:${larg||520}px"><div class="modal-hdr"><span class="modal-title">${titulo}</span><button class="modal-close" onclick="indFecharModal()" aria-label="Fechar"><i class="ti ti-x"></i></button></div>
    <div class="ind-m-corpo">${corpo}</div>${rodape?`<div class="modal-footer">${rodape}</div>`:''}</div>`;
  document.body.appendChild(m);
  return m;
}
function indFecharModal(){document.getElementById('ind-modal')?.remove();}
function indOpcoesResp(sel){
  const me=getMe();
  const us=(window.users||[]).filter(u=>u.ativo!==false&&u.sb_id&&(isGestor(me)||u.sb_id===me.sb_id||(typeof podeVerLeadsDe==='function'&&podeVerLeadsDe(u))));
  if(!us.some(u=>u.sb_id===me.sb_id)) us.unshift(me);
  return us.map(u=>`<option value="${esc(u.sb_id)}"${u.sb_id===sel?' selected':''}>${esc(u.nome)}</option>`).join('');
}

// Novo indicador: cliente do CRM (busca) ou nome + telefone
let _indSel=null;
function indAbrirNovo(){
  _indSel=null;
  indModal('<i class="ti ti-user-star" style="color:var(--g)"></i> Novo indicador',`
    <div class="field"><label>Buscar cliente no CRM</label><input class="fi" id="ind-n-busca" placeholder="Nome ou telefone do cliente" oninput="indBuscarCliente(this.value)" autocomplete="off"><div id="ind-n-res" class="ind-res"></div></div>
    <div class="ind-ou"><span>ou cadastre direto</span></div>
    <div class="g2"><div class="field" style="margin:0"><label>Nome *</label><input class="fi" id="ind-n-nome" maxlength="120"></div>
      <div class="field" style="margin:0"><label>WhatsApp *</label><input class="fi" id="ind-n-tel" oninput="typeof maskTelConta==='function'&&maskTelConta(this)" inputmode="numeric"></div></div>
    <div class="field" style="margin-top:12px"><label>Responsável (recebe os indicados no funil)</label><select class="fi" id="ind-n-resp">${indOpcoesResp(getMe().sb_id)}</select></div>`,
    `<button class="btn bp" id="ind-n-ok" onclick="indSalvarNovo()"><i class="ti ti-link"></i>Gerar link</button><button class="btn bg" onclick="indFecharModal()">Cancelar</button>`);
  setTimeout(()=>document.getElementById('ind-n-busca')?.focus(),50);
}
function indBuscarCliente(q){
  const box=document.getElementById('ind-n-res');if(!box)return;
  q=String(q||'').trim().toLowerCase();const qd=q.replace(/\D/g,'');
  if(q.length<2){box.innerHTML='';return;}
  const lista=(window.leads||[]).filter(l=>l.sb_id&&(String(l.nome).toLowerCase().includes(q)||(qd.length>=4&&String(l.tel||'').replace(/\D/g,'').includes(qd))))
    .sort((a,b)=>(b.etapa===IND_FECHADO)-(a.etapa===IND_FECHADO)).slice(0,8);
  box.innerHTML=lista.length?lista.map(l=>`<button type="button" class="ind-res-i" onclick="indEscolherCliente('${esc(l.sb_id)}')"><strong>${esc(l.nome)}</strong><span>${esc(indTelFmt(l.tel))}${l.etapa===IND_FECHADO?' · <b>cliente</b>':' · '+esc(l.etapa)}</span></button>`).join(''):'<div class="ind-mini" style="padding:8px">Nenhum lead encontrado.</div>';
}
function indEscolherCliente(sbId){
  const l=(window.leads||[]).find(x=>String(x.sb_id)===String(sbId));if(!l)return;
  _indSel=l;
  document.getElementById('ind-n-nome').value=l.nome||'';
  const t=document.getElementById('ind-n-tel');t.value=indTelFmt(l.tel);
  if(l.responsavelSbId){const s=document.getElementById('ind-n-resp');if([...s.options].some(o=>o.value===l.responsavelSbId))s.value=l.responsavelSbId;}
  document.getElementById('ind-n-res').innerHTML=`<div class="ind-sel"><i class="ti ti-circle-check"></i>Cliente selecionado: <strong>${esc(l.nome)}</strong> <button type="button" class="btn bg bsm" onclick="_indSel=null;this.parentNode.remove()">trocar</button></div>`;
}
async function indSalvarNovo(){
  const nome=document.getElementById('ind-n-nome').value.trim();
  const tel=document.getElementById('ind-n-tel').value.replace(/\D/g,'');
  const resp=document.getElementById('ind-n-resp').value;
  if(nome.length<2){showToast('Informe o nome do cliente.','ti-alert-triangle','#dc2626');return;}
  if(tel.length<10){showToast('Informe o WhatsApp com DDD.','ti-alert-triangle','#dc2626');return;}
  const b=document.getElementById('ind-n-ok');b.disabled=true;
  const item={nome,telefone:tel,responsavel_id:resp||null};
  if(_indSel&&_indSel.nome===nome) item.lead_id=String(_indSel.sb_id);
  const {data,error}=await window._rpc('ind_criar',{p_itens:[item]});
  b.disabled=false;
  if(error||!data||!data[0]){showToast('Não consegui gerar o link: '+((error&&error.message)||'erro'),'ti-alert-triangle','#dc2626');return;}
  await indCarregar();indRender();
  const ind=indPorId(data[0].id);
  if(ind) indMostrarLinks([ind],data[0].novo?null:'Este cliente já tinha um link. É o mesmo de antes:');
}

// Links em lote: leads que ainda não têm link, com busca e filtro por etapa
function indCandidatosLote(){
  const temLead=new Set(IND.indicadores.map(i=>String(i.lead_id||'')));
  const temTel=new Set(IND.indicadores.map(i=>indChaveTel(i.telefone)).filter(Boolean));
  const vistos=new Set();
  return (window.leads||[]).filter(l=>{
    if(!l.sb_id)return false;
    const k=indChaveTel(l.tel);
    if(!k||temLead.has(String(l.sb_id))||temTel.has(k)||vistos.has(k))return false;
    vistos.add(k);return true;
  }).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}
function indAbrirLote(){
  window._indCandsTodos=indCandidatosLote();
  window._indLoteBusca='';window._indLoteEtapa='';
  if(!window._indCandsTodos.length){
    indModal('<i class="ti ti-users-group" style="color:var(--g)"></i> Gerar links em lote',`<div class="ind-vazio-mini">Todos os seus leads com telefone já têm link.<br>Para incluir outra pessoa, use <strong>Novo indicador</strong>.</div>`,`<button class="btn bg" onclick="indFecharModal()">Fechar</button>`);
    return;
  }
  const etapas=[...new Set(window._indCandsTodos.map(l=>l.etapa).filter(Boolean))].sort();
  indModal('<i class="ti ti-users-group" style="color:var(--g)"></i> Gerar links em lote',`
    <div class="ind-mini" style="margin-bottom:10px">Leads que ainda não têm link de indicação. Cada um fica com o responsável que já atende o lead.</div>
    <div class="g2" style="margin-bottom:10px">
      <input class="fi" id="ind-l-busca" placeholder="Buscar por nome…" oninput="window._indLoteBusca=this.value;indAtualizarLote()" autocomplete="off">
      <select class="fi" id="ind-l-etapa" onchange="window._indLoteEtapa=this.value;indAtualizarLote()">
        <option value="">Todas as etapas</option>
        ${etapas.map(e=>`<option value="${esc(e)}">${esc(e)}</option>`).join('')}
      </select>
    </div>
    <label class="ind-chk-all"><input type="checkbox" id="ind-l-todos" checked onchange="document.querySelectorAll('.ind-chk').forEach(c=>c.checked=this.checked);indContarLote()"> Selecionar todos</label>
    <div class="ind-lote" id="ind-l-lista"></div>
    <div class="ind-mini" id="ind-l-info" style="margin-top:6px;text-align:right"></div>`,
    `<button class="btn bp" id="ind-l-ok" onclick="indGerarLote()"><i class="ti ti-link"></i>Gerar links</button><button class="btn bg" onclick="indFecharModal()">Cancelar</button>`,580);
  indAtualizarLote();
  setTimeout(()=>document.getElementById('ind-l-busca')?.focus(),50);
}
function indAtualizarLote(){
  const q=(window._indLoteBusca||'').trim().toLowerCase();
  const qd=q.replace(/\D/g,'');
  const et=window._indLoteEtapa||'';
  const cands=window._indCandsTodos.filter(l=>{
    if(et&&l.etapa!==et)return false;
    if(q&&!String(l.nome).toLowerCase().includes(q)&&!(qd.length>=4&&String(l.tel||'').replace(/\D/g,'').includes(qd)))return false;
    return true;
  });
  window._indCands=cands;
  const box=document.getElementById('ind-l-lista');
  const info=document.getElementById('ind-l-info');
  if(box)box.innerHTML=cands.length?cands.map((l,ix)=>`<label class="ind-lote-i"><input type="checkbox" class="ind-chk" data-ix="${ix}" checked onchange="indContarLote()"><span><strong>${esc(l.nome)}</strong><small>${esc(indTelFmt(l.tel))} · ${esc(l.etapa||'—')} · ${esc(indNomeUser(l.responsavelSbId))}</small></span></label>`).join(''):'<div class="ind-vazio-mini">Nenhum lead encontrado.</div>';
  if(info)info.textContent=cands.length+' de '+window._indCandsTodos.length+' leads';
  const ta=document.getElementById('ind-l-todos');if(ta)ta.checked=true;
  indContarLote();
}
function indContarLote(){const n=document.querySelectorAll('.ind-chk:checked').length;const b=document.getElementById('ind-l-ok');if(b){b.innerHTML=`<i class="ti ti-link"></i>Gerar ${n} link${n===1?'':'s'}`;b.disabled=!n;}}
async function indGerarLote(){
  const sel=[...document.querySelectorAll('.ind-chk:checked')].map(c=>window._indCands[+c.dataset.ix]).filter(Boolean);
  if(!sel.length)return;
  const b=document.getElementById('ind-l-ok');b.disabled=true;b.innerHTML='<i class="ti ti-loader-2"></i>Gerando…';
  const ids=[];
  for(let i=0;i<sel.length;i+=200){
    const lote=sel.slice(i,i+200).map(l=>({nome:l.nome,telefone:l.tel,lead_id:String(l.sb_id),responsavel_id:l.responsavelSbId||null}));
    const {data,error}=await window._rpc('ind_criar',{p_itens:lote});
    if(error){showToast('Parte dos links não foi gerada: '+(error.message||error),'ti-alert-triangle','#dc2626');break;}
    (data||[]).forEach(d=>ids.push(d.id));
  }
  await indCarregar();IND.view='indicadores';indRender();
  const novos=ids.map(indPorId).filter(Boolean);
  if(novos.length) indMostrarLinks(novos); else indFecharModal();
}

// Lista de links prontos para enviar
function indMostrarLinks(lista,aviso){
  window._indLinks=lista.map(i=>i.id);
  indModal('<i class="ti ti-circle-check" style="color:var(--g)"></i> '+(lista.length>1?`${lista.length} links prontos`:'Link pronto'),`
    ${aviso?`<div class="ind-mini" style="margin-bottom:8px">${esc(aviso)}</div>`:''}
    <div class="ind-mini" style="margin-bottom:10px">Toque em <strong>Enviar</strong> para abrir o WhatsApp com a mensagem e os prêmios já escritos.</div>
    <div class="ind-lote">${lista.map(i=>`<div class="ind-lote-i"><span><strong>${esc(i.nome)}</strong><small>${esc(indLink(i.token))}</small></span>
      <span class="ind-nowrap"><button class="btn bp bsm" onclick="indEnviarWa('${i.id}');this.closest('.ind-lote-i').classList.add('feito')"${i.telefone?'':' disabled'}><i class="ti ti-brand-whatsapp"></i>Enviar</button>
      <button class="btn bg bsm" title="Copiar link" onclick="indCopiarLink('${i.id}')"><i class="ti ti-link"></i></button>
      <button class="btn bg bsm" title="Copiar mensagem completa" onclick="indCopiarMsg('${i.id}')"><i class="ti ti-copy"></i></button></span></div>`).join('')}</div>`,
    `${lista.length>1?`<button class="btn bg" onclick="indCopiarTodos()"><i class="ti ti-clipboard-list"></i>Copiar lista</button>`:''}<button class="btn bp" onclick="indFecharModal()">Concluir</button>`,580);
}
function indCopiarTodos(){
  const txt=(window._indLinks||[]).map(indPorId).filter(Boolean).map(i=>`${i.nome}\t${indTelFmt(i.telefone)}\t${indLink(i.token)}`).join('\n');
  indCopiar(txt,'Lista copiada (nome, telefone e link)');
}

// Recompensa (só gestor)
function indAbrirRecompensa(id){
  const ic=IND.indicacoes.find(x=>x.id===id);if(!ic)return;
  const s=indStatus(ic);const ind=indPorId(ic.indicador_id)||{};
  const sug=indPixSugerido(s.lead&&s.lead.credito);
  const atual=ic.recompensa||'PIX';
  indModal('<i class="ti ti-gift" style="color:var(--g)"></i> Recompensa',`
    <div class="ind-mini" style="margin-bottom:12px"><strong>${esc(ind.nome||'Cliente')}</strong> indicou <strong>${esc(ic.nome)}</strong>${s.lead&&s.lead.credito?`, que fechou uma carta de ${fmtR(s.lead.credito)}`:''}.</div>
    <div class="field"><label>Prêmio</label><select class="fi" id="ind-r-tipo" onchange="document.getElementById('ind-r-valor-w').style.display=this.value==='PIX'?'':'none'">
      ${IND_PREMIOS.map(p=>`<option value="${esc(p.nome)}"${p.nome===atual?' selected':''}>${p.ic} ${esc(p.nome)}</option>`).join('')}</select></div>
    <div class="field" id="ind-r-valor-w"${atual==='PIX'?'':' style="display:none"'}><label>Valor do PIX (R$)</label><input class="fi" id="ind-r-valor" inputmode="numeric" value="${ic.recompensa_valor!=null?Math.round(ic.recompensa_valor):sug}"><div class="ind-mini" style="margin-top:4px">Sugerido pela tabela: ${fmtR(sug)}</div></div>
    <label class="ind-chk-all"><input type="checkbox" id="ind-r-paga"${ic.recompensa_paga_em||!ic.recompensa?' checked':''}> Já foi pago / entregue</label>`,
    `<button class="btn bp" onclick="indSalvarRecompensa('${ic.id}')"><i class="ti ti-check"></i>Salvar</button>${ic.recompensa?`<button class="btn bd" onclick="indSalvarRecompensa('${ic.id}',true)"><i class="ti ti-x"></i>Limpar</button>`:''}<button class="btn bg" onclick="indFecharModal()">Cancelar</button>`,460);
}
async function indSalvarRecompensa(id,limpar){
  const tipo=limpar?null:document.getElementById('ind-r-tipo').value;
  const v=limpar||tipo!=='PIX'?null:(parseInt(String(document.getElementById('ind-r-valor').value).replace(/\D/g,''),10)||0);
  const paga=!limpar&&document.getElementById('ind-r-paga').checked;
  const {error}=await window._rpc('ind_recompensa',{p_id:id,p_recompensa:tipo,p_valor:v,p_paga:paga});
  if(error){showToast('Não consegui salvar: '+(error.message||error),'ti-alert-triangle','#dc2626');return;}
  indFecharModal();await indCarregar();indRender();showToast(limpar?'Recompensa removida':paga?'Recompensa registrada como paga':'Recompensa registrada','ti-gift');
}

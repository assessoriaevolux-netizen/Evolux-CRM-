// ─── GERENCIADOR DE ANÚNCIOS (Marketing API da Meta) ─────────────────────────
// Números da conta de anúncios conectada + o que esses anúncios viraram no CRM.
const ADS={periodo:'last_7d',conta:'',dados:null,carregando:false,erro:null,soAtivas:false,tabelaDias:false,em:null};
const ADS_PERIODOS=[['today','Hoje'],['yesterday','Ontem'],['last_7d','Últimos 7 dias'],['last_14d','Últimos 14 dias'],['last_30d','Últimos 30 dias'],['this_month','Este mês'],['last_month','Mês passado']];
try{const p=localStorage.getItem('evolux_ads_periodo');if(p&&ADS_PERIODOS.some(x=>x[0]===p))ADS.periodo=p;}catch(e){}

function _adsMoeda(v,dec){const m=(ADS.dados&&ADS.dados.conta&&ADS.dados.conta.moeda)||'BRL';
  try{return (Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:m,minimumFractionDigits:dec===0?0:2,maximumFractionDigits:dec===0?0:2});}catch(e){return 'R$ '+(Number(v)||0).toFixed(2);}}
const _adsNum=v=>(Number(v)||0).toLocaleString('pt-BR');
function _adsIntervalo(p){
  const h=new Date();h.setHours(0,0,0,0);const d=n=>{const x=new Date(h);x.setDate(x.getDate()+n);return x;};
  switch(p){
    case 'today':return [h,h];
    case 'yesterday':return [d(-1),d(-1)];
    case 'last_14d':return [d(-14),d(-1)];
    case 'last_30d':return [d(-30),d(-1)];
    case 'this_month':return [new Date(h.getFullYear(),h.getMonth(),1),h];
    case 'last_month':return [new Date(h.getFullYear(),h.getMonth()-1,1),new Date(h.getFullYear(),h.getMonth(),0)];
    default:return [d(-7),d(-1)];
  }
}
function _adsDataLead(l){const p=String(l.data||'').split('/');return p.length===3?new Date(+p[2],+p[1]-1,+p[0]):null;}

async function renderAnuncios(){
  const tab=document.getElementById('tab-anuncios');
  if(!tab) return;
  const st=await integCarregarStatus();
  if(!st){ tab.innerHTML=window._integ.erroStatus==='sql'?integAvisoSQL():`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(window._integ.erroStatus||'Não consegui carregar.')}</div>`; return; }
  const meta=st.meta;
  if(!meta){
    tab.innerHTML=`<div class="integ2-vazio"><div class="integ2-vazio-ic"><i class="ti ti-chart-arrows-vertical"></i></div>
      <div class="integ2-vazio-tit">Conecte a Meta para ver seus anúncios</div>
      <div class="integ2-vazio-txt">Investimento, leads, custo por lead e campanhas ativas da conta de anúncios da empresa, lado a lado com o que esses leads viraram no funil.</div>
      ${st.gestor?`<button class="btn bp" onclick="integIrPara('facebook')"><i class="ti ti-brand-meta"></i>Conectar com a Meta</button>`:'<div class="integ2-mini"><i class="ti ti-lock"></i> Peça ao gestor para conectar a conta da Meta.</div>'}</div>`;
    return;
  }
  const contas=meta.contas||[];
  if(!ADS.conta||!contas.some(c=>c.id===ADS.conta)) ADS.conta=meta.conta_padrao||(contas[0]&&contas[0].id)||'';
  tab.innerHTML=`<div class="ads2">
    <div class="ads2-topo">
      <div class="ads2-tit"><i class="ti ti-chart-arrows-vertical"></i>Gerenciador de Anúncios</div>
      <div class="ads2-filtros">
        ${contas.length>1?`<select class="tfield" onchange="ADS.conta=this.value;adsCarregar()" aria-label="Conta de anúncio">${contas.map(c=>`<option value="${esc(c.id)}"${c.id===ADS.conta?' selected':''}>${esc(c.nome)}</option>`).join('')}</select>`:(contas[0]?`<span class="integ2-tag">${esc(contas[0].nome)}</span>`:'')}
        <select class="tfield" onchange="ADS.periodo=this.value;try{localStorage.setItem('evolux_ads_periodo',this.value)}catch(e){};adsCarregar()" aria-label="Período">${ADS_PERIODOS.map(([k,t])=>`<option value="${k}"${k===ADS.periodo?' selected':''}>${t}</option>`).join('')}</select>
        <button class="btn bg bsm" onclick="adsCarregar()" title="Atualizar"><i class="ti ti-refresh"></i><span id="ads2-em"></span></button>
      </div>
    </div>
    <div id="ads2-corpo">${integCarregando('Buscando os números na Meta…')}</div>
  </div>`;
  if(!contas.length){document.getElementById('ads2-corpo').innerHTML=`<div class="integ2-aviso"><i class="ti ti-info-circle"></i><div>A conexão com a Meta não tem nenhuma conta de anúncio liberada.${st.gestor?' Reconecte em Configurações → Meta e marque a conta de anúncios.':''}</div></div>`;return;}
  await adsCarregar();
}
async function adsCarregar(){
  const corpo=document.getElementById('ads2-corpo');
  if(!corpo) return;
  if(ADS.dados) corpo.classList.add('ads2-atualizando'); else corpo.innerHTML=integCarregando('Buscando os números na Meta…');
  const r=await integChamar('anuncios',{conta:ADS.conta,periodo:ADS.periodo});
  const c=document.getElementById('ads2-corpo');
  if(!c) return;
  c.classList.remove('ads2-atualizando');
  if(!r.ok){
    ADS.dados=null;
    c.innerHTML=`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i><div>${esc(r.erro)}${/Reconecte/.test(r.erro||'')&&isGestor()?` <button class="btn bg bsm" onclick="integIrPara('facebook')">Abrir conexão</button>`:''}</div></div>`;
    return;
  }
  ADS.dados=r;ADS.em=new Date();
  const em=document.getElementById('ads2-em');if(em)em.textContent=' '+ADS.em.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  _adsDesenhar();
}
function _adsDesenhar(){
  const c=document.getElementById('ads2-corpo');const d=ADS.dados;
  if(!c||!d) return;
  const t=d.total||{};
  const cpl=t.leads?t.investido/t.leads:0;
  const cpc=t.conversas?t.investido/t.conversas:0;
  // o que virou no CRM no mesmo período
  const [ini,fim]=_adsIntervalo(d.periodo);
  const doMeta=leads.filter(l=>(l.origem||'')==='Meta Ads'&&(x=>x&&x>=ini&&x<=fim)(_adsDataLead(l)));
  const fechados=doMeta.filter(l=>l.etapa==='Fechado / Convertido');
  const credito=fechados.reduce((s,l)=>s+(l.credito||0),0);
  const tiles=[
    ['Investido',_adsMoeda(t.investido),`${_adsNum(t.impressoes)} impressões · CPM ${_adsMoeda(t.cpm)}`],
    ['Leads de formulário',_adsNum(t.leads),t.leads?`${_adsMoeda(cpl)} por lead`:'nenhum no período'],
    ['Conversas no WhatsApp',_adsNum(t.conversas),t.conversas?`${_adsMoeda(cpc)} por conversa`:'nenhuma no período'],
    ['Cliques no link',_adsNum(t.cliques_link),`CTR ${(Number(t.ctr)||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}% · alcance ${_adsNum(t.alcance)}`],
  ];
  const campanhas=(d.campanhas||[]).filter(cp=>!ADS.soAtivas||cp.status==='ACTIVE');
  c.innerHTML=`<div class="ads2-tiles">${tiles.map(([l,v,s])=>`<div class="ads2-tile"><div class="ads2-tile-l">${l}</div><div class="ads2-tile-v">${v}</div><div class="ads2-tile-s">${s}</div></div>`).join('')}</div>
    <div class="ads2-crm">
      <div class="ads2-crm-ic"><i class="ti ti-filter-dollar"></i></div>
      <div class="ads2-crm-txt"><div class="ads2-crm-tit">No CRM, no mesmo período</div>
        <div><strong>${_adsNum(doMeta.length)}</strong> lead${doMeta.length!==1?'s':''} com origem Meta Ads${isGestor()?'':' na sua carteira'} · <strong>${_adsNum(fechados.length)}</strong> venda${fechados.length!==1?'s':''} fechada${fechados.length!==1?'s':''}${credito?` · ${fmtR(credito)} em crédito`:''}${fechados.length&&t.investido?` · <strong>${_adsMoeda(t.investido/fechados.length)}</strong> de anúncio por venda`:''}</div>
      </div>
    </div>
    <div class="ads2-card">
      <div class="ads2-card-topo"><div class="ads2-card-tit">Investimento por dia</div>
        <button class="btn bg bsm" onclick="ADS.tabelaDias=!ADS.tabelaDias;_adsDesenhar()"><i class="ti ti-${ADS.tabelaDias?'chart-bar':'table'}"></i>${ADS.tabelaDias?'Ver gráfico':'Ver em tabela'}</button></div>
      ${ADS.tabelaDias?_adsTabelaDias(d.diario||[]):_adsGrafico(d.diario||[])}
    </div>
    <div class="ads2-card">
      <div class="ads2-card-topo"><div class="ads2-card-tit">Campanhas</div>
        <label class="ads2-check"><input type="checkbox" ${ADS.soAtivas?'checked':''} onchange="ADS.soAtivas=this.checked;_adsDesenhar()">Só as ativas</label></div>
      ${campanhas.length?`<div class="integ2-tabela"><table class="ads2-tabela"><thead><tr><th>Campanha</th><th>Situação</th><th class="num">Investido</th><th class="num">Resultados</th><th class="num">Custo por resultado</th><th class="num">CTR</th><th class="num">Impressões</th><th class="num">Orçamento</th></tr></thead><tbody>
        ${campanhas.map(cp=>{const res=(cp.leads||0)+(cp.conversas||0);const st=_adsStatus(cp.status);return `<tr>
          <td><div class="ads2-camp">${esc(cp.nome)}</div><div class="integ2-mini">${esc(_adsObjetivo(cp.objetivo))}</div></td>
          <td><span class="integ2-st ${st[1]}"><i class="ti ${st[2]}"></i>${st[0]}</span></td>
          <td class="num">${_adsMoeda(cp.investido)}</td>
          <td class="num">${res?`${_adsNum(res)}<div class="integ2-mini">${[cp.leads?_adsNum(cp.leads)+' leads':'',cp.conversas?_adsNum(cp.conversas)+' conversas':''].filter(Boolean).join(' · ')}</div>`:'—'}</td>
          <td class="num">${res?_adsMoeda(cp.investido/res):'—'}</td>
          <td class="num">${(Number(cp.ctr)||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</td>
          <td class="num">${_adsNum(cp.impressoes)}</td>
          <td class="num">${cp.orcamento_diario?_adsMoeda(cp.orcamento_diario,0)+'/dia':cp.orcamento_total?_adsMoeda(cp.orcamento_total,0)+' total':'—'}</td></tr>`;}).join('')}
      </tbody></table></div>`:`<div class="integ2-mini">Nenhuma campanha ${ADS.soAtivas?'ativa ':''}com investimento neste período.</div>`}
    </div>`;
}
const _adsStatus=s=>({ACTIVE:['Ativa','ok','ti-player-play'],PAUSED:['Pausada','pend','ti-player-pause'],CAMPAIGN_PAUSED:['Pausada','pend','ti-player-pause'],ADSET_PAUSED:['Pausada','pend','ti-player-pause'],
  IN_PROCESS:['Em análise','pend','ti-hourglass'],PENDING_REVIEW:['Em análise','pend','ti-hourglass'],WITH_ISSUES:['Com problema','erro','ti-alert-triangle'],DISAPPROVED:['Reprovada','erro','ti-ban'],
  ARCHIVED:['Arquivada','pend','ti-archive'],DELETED:['Excluída','pend','ti-trash']})[s]||[String(s||'—').toLowerCase(),'pend','ti-point'];
const _adsObjetivo=o=>({OUTCOME_LEADS:'Cadastros',OUTCOME_ENGAGEMENT:'Engajamento / mensagens',OUTCOME_TRAFFIC:'Tráfego',OUTCOME_SALES:'Vendas',OUTCOME_AWARENESS:'Reconhecimento',OUTCOME_APP_PROMOTION:'App',LEAD_GENERATION:'Cadastros',MESSAGES:'Mensagens',CONVERSIONS:'Conversões',LINK_CLICKS:'Tráfego'})[o]||o||'';
function _adsTabelaDias(dias){
  if(!dias.length) return '<div class="integ2-mini">Sem dados no período.</div>';
  return `<div class="integ2-tabela"><table class="ads2-tabela"><thead><tr><th>Dia</th><th class="num">Investido</th><th class="num">Leads</th><th class="num">Conversas</th><th class="num">Cliques</th></tr></thead><tbody>
    ${dias.map(x=>`<tr><td>${new Date(x.dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</td><td class="num">${_adsMoeda(x.investido)}</td><td class="num">${_adsNum(x.leads)}</td><td class="num">${_adsNum(x.conversas)}</td><td class="num">${_adsNum(x.cliques)}</td></tr>`).join('')}</tbody></table></div>`;
}
// Barras finas, uma cor, um eixo; dica ao passar o mouse
function _adsGrafico(dias){
  if(!dias.length||!dias.some(x=>x.investido>0)) return '<div class="integ2-mini">Sem investimento no período.</div>';
  const caixa=document.getElementById('ads2-corpo');
  const W=Math.max(300,Math.min(1600,((caixa&&caixa.clientWidth)||752)-34)),H=210,ml=62,mr=8,mt=10,mb=26;
  const max=Math.max(...dias.map(x=>x.investido));
  const passo=(()=>{const bruto=max/4;const p=Math.pow(10,Math.floor(Math.log10(bruto||1)));const n=bruto/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p;})();
  const topo=Math.ceil(max/passo)*passo||1;
  const y=v=>mt+(H-mt-mb)*(1-v/topo);
  const largura=(W-ml-mr)/dias.length;
  const bw=Math.max(2,Math.min(28,largura-2));
  const marcas=[];for(let v=0;v<=topo+1e-9;v+=passo)marcas.push(v);
  const cadaRotulo=Math.ceil(dias.length/10);
  return `<div class="ads2-graf" id="ads2-graf"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Investimento por dia">
    ${marcas.map(v=>`<line x1="${ml}" x2="${W-mr}" y1="${y(v)}" y2="${y(v)}" class="ads2-grade"/><text x="${ml-6}" y="${y(v)+3.5}" class="ads2-eixo" text-anchor="end">${_adsMoeda(v,0)}</text>`).join('')}
    ${dias.map((x,i)=>{const cx=ml+largura*i+largura/2;const h=Math.max(0,y(0)-y(x.investido));const r=Math.min(4,bw/2,h);
      const path=h>0?`M${cx-bw/2},${y(0)} L${cx-bw/2},${y(0)-h+r} Q${cx-bw/2},${y(0)-h} ${cx-bw/2+r},${y(0)-h} L${cx+bw/2-r},${y(0)-h} Q${cx+bw/2},${y(0)-h} ${cx+bw/2},${y(0)-h+r} L${cx+bw/2},${y(0)} Z`:'';
      return `<g class="ads2-barra" data-i="${i}" onmousemove="_adsDica(event,${i})" onmouseleave="_adsDica(null)"><rect x="${ml+largura*i}" y="${mt}" width="${largura}" height="${H-mt-mb}" fill="transparent"/>${path?`<path d="${path}"/>`:''}</g>
        ${i%cadaRotulo===0?`<text x="${cx}" y="${H-8}" class="ads2-eixo" text-anchor="middle">${x.dia.slice(8,10)}/${x.dia.slice(5,7)}</text>`:''}`;}).join('')}
    <line x1="${ml}" x2="${W-mr}" y1="${y(0)}" y2="${y(0)}" class="ads2-base"/>
  </svg><div class="ads2-dica" id="ads2-dica" hidden></div></div>`;
}
let _adsRedimT=null;
window.addEventListener('resize',()=>{clearTimeout(_adsRedimT);_adsRedimT=setTimeout(()=>{if(ADS.dados&&!ADS.tabelaDias&&document.getElementById('tab-anuncios')?.classList.contains('active'))_adsDesenhar();},250);});
function _adsDica(ev,i){
  const dica=document.getElementById('ads2-dica');const g=document.getElementById('ads2-graf');
  if(!dica||!g) return;
  g.querySelectorAll('.ads2-barra').forEach(b=>b.classList.toggle('on',ev&&b.getAttribute('data-i')===String(i)));
  if(!ev){dica.hidden=true;return;}
  const x=(ADS.dados.diario||[])[i];if(!x)return;
  dica.innerHTML=`<div class="ads2-dica-d">${new Date(x.dia+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})}</div>
    <div><span>Investido</span><strong>${_adsMoeda(x.investido)}</strong></div><div><span>Leads</span><strong>${_adsNum(x.leads)}</strong></div><div><span>Conversas</span><strong>${_adsNum(x.conversas)}</strong></div>`;
  dica.hidden=false;
  const r=g.getBoundingClientRect();
  let left=ev.clientX-r.left+12;if(left+170>r.width)left=ev.clientX-r.left-182;
  dica.style.left=Math.max(4,left)+'px';dica.style.top=Math.max(4,ev.clientY-r.top-20)+'px';
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function _abrevR(v){ v=Number(v)||0; return v>=1000000?'R$'+Math.round(v/100000)/10+'M':v>=1000?'R$'+Math.round(v/1000)+'k':'R$'+Math.round(v); }

// Total vendido no mês (somado no servidor; gestor vê a empresa, os demais a própria equipe)
window._dashVendasCache=null;
let _dashPedido=0;
async function _dashTotalVendidoMes(){
  const el=document.getElementById('hero-credito');
  if(!el) return;
  const hoje=new Date();
  const de=hojeISO(new Date(hoje.getFullYear(),hoje.getMonth(),1)), ate=hojeISO(hoje);
  const chave=de+'|'+ate;
  let porUser=window._dashVendasCache&&window._dashVendasCache.chave===chave?window._dashVendasCache.porUser:null;
  if(!porUser){
    const pedido=++_dashPedido;
    const {data,error}=await window._rpc('crm_ranking_vendas',{p_de:de,p_ate:ate});
    if(error||pedido!==_dashPedido) return;
    porUser={};
    (data||[]).forEach(r=>{ if(r.user_id) porUser[r.user_id]=Number(r.credito)||0; });
    window._dashVendasCache={chave,porUser};
  }
  const me=getMe();
  let total=0;
  if(isGestor(me)) total=Object.values(porUser).reduce((s,v)=>s+v,0);
  else{
    const vis=getVisiveisParaMim();
    users.filter(u=>vis.has(u.id)).forEach(u=>{ total+=porUser[u.sb_id]||0; });
  }
  el.textContent=_abrevR(total);
}

function renderDashboard(){
  if(designNovoAtivo()) renderDashNovo();
  if(!document.getElementById('metrics-row')) return;
  const vis=getVisiveisParaMim();
  const me=getMe();
  const leadsD=isGestor(me)?leads:leads.filter(l=>vis.has(l.responsavelId));
  const t=leadsD.length,f=leadsD.filter(l=>l.etapa==='Fechado / Convertido').length;
  const p=leadsD.filter(l=>l.etapa==='Perdido').length,a=t-f-p;
  const tx=t?Math.round(f/t*100):0;
  const hr=new Date().getHours();
  const saud=hr<12?'Bom dia':hr<18?'Boa tarde':'Boa noite';
  const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const nd=new Date();
  const meNome=me?me.nome.split(' ')[0]:'';
  const admin=getAdmin();
  document.getElementById('hero-greeting-txt').textContent=`${saud}${meNome?', '+meNome:''} 👋`;
  document.getElementById('hero-date-txt').textContent=`${dias[nd.getDay()]}, ${nd.getDate()} de ${meses[nd.getMonth()]} de ${nd.getFullYear()}${admin?` · ${admin.nome}`:''}`;
  const pipVal=leadsD.filter(l=>!['Fechado / Convertido','Perdido'].includes(l.etapa)).reduce((s,l)=>s+(l.credito||0),0);
  document.getElementById('hero-pipeline').textContent=_abrevR(pipVal);
  document.getElementById('hero-conversao').textContent=tx+'%';
  _dashTotalVendidoMes();
  const spark=(color,pts)=>{const w=80,h=32;const path=pts.map((y,i)=>`${i===0?'M':'L'}${Math.round(i*(w/(pts.length-1)))},${Math.round(h-y*(h/Math.max(...pts,1)))}`).join(' ');return `<svg class="mc2-spark" viewBox="0 0 ${w} ${h}" width="80" height="32" fill="none"><path d="${path}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;};
  document.getElementById('metrics-row').innerHTML=`
    <div class="mc2 cn"><div class="mc2-icon"><i class="ti ti-users"></i></div><div class="mc2-body"><div class="mc2-lbl">Total de leads</div><div class="mc2-val">${t}</div><div class="mc2-sub">no pipeline</div></div>${spark('#6366f1',[10,14,12,18,15,22,19,26,24])}</div>
    <div class="mc2 cb"><div class="mc2-icon"><i class="ti ti-activity"></i></div><div class="mc2-body"><div class="mc2-lbl">Em andamento</div><div class="mc2-val">${a}</div><div class="mc2-sub">leads ativos</div></div>${spark('#3b82f6',[8,12,10,16,14,18,16,22,20])}</div>
    <div class="mc2 cg"><div class="mc2-icon"><i class="ti ti-circle-check"></i></div><div class="mc2-body"><div class="mc2-lbl">Convertidos</div><div class="mc2-val">${f}</div><div class="mc2-sub">fechamentos</div></div>${spark('#1db954',[6,10,8,14,12,18,16,22,20])}</div>
    <div class="mc2 cy"><div class="mc2-icon"><i class="ti ti-chart-bar"></i></div><div class="mc2-body"><div class="mc2-lbl">Taxa de conversão</div><div class="mc2-val">${tx}%</div><div class="mc2-sub">do total de leads</div></div>${spark('#f59e0b',[12,10,14,12,18,16,22,20,24])}</div>`;
  const BADGE_MAP={'ti-user-plus':['Novo lead','bdg-nl'],'ti-circle-check':['Venda realizada','bdg-vr'],'ti-message':['Primeiro contato','bdg-pc'],'ti-brand-whatsapp':['WhatsApp','bdg-pc'],'ti-arrows-right-left':['Movido','bdg-gen'],'ti-phone':['Ligação','bdg-gen'],'ti-user-edit':['Perfil atualizado','bdg-gen'],'ti-upload':['Importação','bdg-nl']};
  const AV_MAP={'ti-user-plus':'ti-user','ti-circle-check':'ti-currency-dollar','ti-message':'ti-brand-whatsapp','ti-brand-whatsapp':'ti-brand-whatsapp','ti-arrows-right-left':'ti-arrows-right-left','ti-upload':'ti-upload'};
  const AV_CLS={'ti-brand-whatsapp':'av-wa','ti-message':'av-wa','ti-circle-check':'av-cash'};
  const feed=document.getElementById('activity-feed');
  const acts=can('notif_view')?_atividadesVisiveis():[];
  feed.innerHTML=acts.length?acts.slice(0,5).map(act=>{
    const[badgeTxt,badgeCls]=BADGE_MAP[act.icon]||['Atividade','bdg-gen'];
    const avIcon=AV_MAP[act.icon]||'ti-user';
    const avCls=AV_CLS[act.icon]||'';
    const txt=String(act.text||'');
    const match=txt.match(/^([^:—–]+?)(?:\s+(?:entrou|fechou|—|:|fez|realizou|foi|atualizou))/i);
    const nome=match?match[1].trim():txt.split(' ').slice(0,2).join(' ');
    const desc=txt.slice(nome.length).replace(/^[\s:—–]+/,'');
    return `<div class="act2-item"><div class="act2-av ${avCls}"><i class="ti ${avIcon}"></i></div><div class="act2-body"><div class="act2-name"><strong>${esc(nome)}</strong>${desc?' '+esc(desc):''}</div><div class="act2-time">${esc(act.time)}</div></div><span class="act2-badge ${badgeCls}">${badgeTxt}</span><button class="act2-menu"><i class="ti ti-dots-vertical"></i></button></div>`;
  }).join(''):'<p style="color:var(--tm);font-size:12.5px;padding:12px 0">Nenhuma atividade ainda.</p>';
  const porEtapa=ETAPAS.map(e=>leadsD.filter(l=>l.etapa===e).length);
  const max=Math.max(...porEtapa,1);
  document.getElementById('dash-etapas').innerHTML=ETAPAS.map((e,i)=>`<div class="br"><span class="brl">${esc(etapaLabel(e))}</span><div class="brt"><div class="brf" style="width:${Math.round(porEtapa[i]/max*100)}%;background:${EC[i]}"></div></div><span class="brv">${porEtapa[i]}</span></div>`).join('');
}

// ─── PAINEL DO DESIGN NOVO (Configurações → Aparência → Design novo) ──────────
function designNovoAtivo(){ return document.documentElement.classList.contains('design-novo'); }
function _dnCompacto(v){
  v=Number(v)||0;
  if(v>=1e6) return 'R$ '+(Math.round(v/1e5)/10).toLocaleString('pt-BR')+' mi';
  if(v>=1e3) return 'R$ '+Math.round(v/1e3).toLocaleString('pt-BR')+' mil';
  return 'R$ '+Math.round(v).toLocaleString('pt-BR');
}
function _dnData(l){ const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(l&&l.data||''); return m?new Date(+m[3],+m[2]-1,+m[1]):null; }
function _dnChegou(d){
  if(!d) return '—';
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const dias=Math.round((hoje-d)/86400000);
  if(dias<=0) return 'hoje'; if(dias===1) return 'ontem'; if(dias<7) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}
function _dnDiasUteisRestantes(){
  const d=new Date();d.setHours(0,0,0,0);const mes=d.getMonth();let n=0;
  while(d.getMonth()===mes){ const w=d.getDay(); if(w&&w<6) n++; d.setDate(d.getDate()+1); }
  return n;
}
const _DN_CORES=['#16a34a','#2563eb','#d97706','#7c3aed','#db2777','#0891b2'];
function _dnAvatar(u,nome,i){
  const foto=u&&typeof safeUrl==='function'?safeUrl(u.foto):null;
  if(foto) return `<img class="dn-av" src="${foto}" alt="">`;
  const p=String(nome||'?').trim().split(/\s+/);
  const ini=((p[0]||'?')[0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();
  return `<span class="dn-av" style="background:${_DN_CORES[i%_DN_CORES.length]}">${esc(ini)}</span>`;
}
const _DN_CHIP={'Novo lead':'b','Primeiro contato':'b','Aguardando resposta':'y','Proposta enviada':'y','Negociação':'p','Fechado / Convertido':'g','Perdido':'r'};
window._dnVendas=null; let _dnPedido=0;
async function _dnCarregarVendas(){
  const h=new Date();
  const de=hojeISO(new Date(h.getFullYear(),h.getMonth(),1)), ate=hojeISO(h);
  const deA=hojeISO(new Date(h.getFullYear(),h.getMonth()-1,1)), ateA=hojeISO(new Date(h.getFullYear(),h.getMonth(),0));
  const chave=de+'|'+ate;
  if(window._dnVendas&&window._dnVendas.chave===chave&&Date.now()-window._dnVendas.em<60000) return window._dnVendas;
  const pedido=++_dnPedido;
  const [a,b]=await Promise.all([window._rpc('crm_ranking_vendas',{p_de:de,p_ate:ate}),window._rpc('crm_ranking_vendas',{p_de:deA,p_ate:ateA})]);
  if(pedido!==_dnPedido) return null;
  const mapa=r=>{const m={};(r.data||[]).forEach(x=>{if(x.user_id)m[x.user_id]={vendas:Number(x.vendas)||0,credito:Number(x.credito)||0};});return m;};
  window._dnVendas={chave,em:Date.now(),mes:a.error?{}:mapa(a),ant:b.error?{}:mapa(b)};
  return window._dnVendas;
}
function renderDashNovo(){
  const box=document.getElementById('dash-novo');
  if(!box||!designNovoAtivo()) return;
  const me=getMe();
  const vis=getVisiveisParaMim();
  const gestor=isGestor(me);
  const leadsD=gestor?leads:leads.filter(l=>vis.has(l.responsavelId));
  const usersD=users.filter(u=>gestor||vis.has(u.id));
  const h=new Date();
  const mesIni=new Date(h.getFullYear(),h.getMonth(),1), antIni=new Date(h.getFullYear(),h.getMonth()-1,1);
  const ontem=new Date();ontem.setHours(0,0,0,0);ontem.setDate(ontem.getDate()-1);
  const datas=leadsD.map(_dnData);
  const leadsMes=datas.filter(d=>d&&d>=mesIni).length;
  const leadsAnt=datas.filter(d=>d&&d>=antIni&&d<mesIni).length;
  const novos=datas.filter(d=>d&&d>=ontem).length;
  const fech=leadsD.filter(l=>l.etapa==='Fechado / Convertido').length;
  const conv=leadsD.length?(fech/leadsD.length*100):0;
  const pipeline=leadsD.filter(l=>!['Fechado / Convertido','Perdido'].includes(l.etapa)).reduce((s,l)=>s+(l.credito||0),0);
  const V=window._dnVendas;
  const soma=(m,k)=>usersD.reduce((s,u)=>s+((m&&m[u.sb_id]&&m[u.sb_id][k])||0),0);
  const vendasMes=V?soma(V.mes,'vendas'):null, vendasAnt=V?soma(V.ant,'vendas'):null;
  const credMes=V?soma(V.mes,'credito'):null, credAnt=V?soma(V.ant,'credito'):null;
  const meta=usersD.reduce((s,u)=>s+(Number(u.meta)||0),0);
  const variacao=(a,b,tipo)=>{
    if(a===null||b===null) return '<span>carregando…</span>';
    if(!b) return a?'<span>sem base no mês anterior</span>':'<span>vs. mês anterior</span>';
    const d=tipo==='abs'?a-b:Math.round((a-b)/b*100);
    const txt=tipo==='abs'?(d>=0?'+':'−')+Math.abs(d):(d>=0?'+':'−')+Math.abs(d)+'%';
    return `<b class="${d<0?'baixa':''}" style="font-weight:600">${txt}</b> <span>vs. mês anterior</span>`;
  };
  const kpi=(ic,lbl,val,vr)=>`<div class="dn-card dn-kpi"><div class="dn-k-top"><span class="dn-k-ic"><i class="ti ti-${ic}"></i></span>${lbl}</div><div class="dn-k-val dn-num">${val}</div><div class="dn-k-var">${vr}</div></div>`;
  const hr=h.getHours();
  const saud=hr<12?'Bom dia':hr<18?'Boa tarde':'Boa noite';
  const nome=me?String(me.nome||'').split(' ')[0]:'';
  const dataTxt=h.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  const mesNome=h.toLocaleDateString('pt-BR',{month:'long'});
  // Meta do mês
  const dias=_dnDiasUteisRestantes();
  let hero;
  if(meta>0){
    const vend=credMes||0, pct=Math.min(100,Math.round(vend/meta*100)), falta=Math.max(0,meta-vend);
    hero=`<div class="dn-hero"><div class="dn-lbl">Meta de ${mesNome} · ${gestor?'empresa':'sua visão'}</div>
      <div class="dn-grande dn-num">${credMes===null?'…':_dnCompacto(vend)} <small>de ${_dnCompacto(meta)}</small></div>
      <div class="dn-meta-txt">${falta?`Faltam ${_dnCompacto(falta)} em ${dias} dia${dias!==1?'s':''} úte${dias!==1?'is':'il'}${dias?` — média de ${_dnCompacto(falta/dias)} por dia`:''}`:'Meta batida! 🎉'}</div>
      <div class="dn-barra"><span style="width:${pct}%"></span></div>
      <div class="dn-lin"><div>Vendido no mês<b class="dn-num">${credMes===null?'…':_dnCompacto(vend)}</b></div><div>Pipeline em aberto<b class="dn-num">${_dnCompacto(pipeline)}</b></div><div>Vendas<b class="dn-num">${vendasMes===null?'…':vendasMes}</b></div><div>Atingido<b class="dn-num">${pct}%</b></div></div></div>`;
  } else {
    hero=`<div class="dn-hero"><div class="dn-lbl">Meta de ${mesNome}</div>
      <div class="dn-grande dn-num">${credMes===null?'…':_dnCompacto(credMes)} <small>vendidos no mês</small></div>
      <div class="dn-meta-txt">Nenhuma meta definida ainda. Com a meta, este cartão mostra quanto falta e a média por dia útil.</div>
      <div class="dn-lin"><div>Pipeline em aberto<b class="dn-num">${_dnCompacto(pipeline)}</b></div><div>Vendas<b class="dn-num">${vendasMes===null?'…':vendasMes}</b></div><div>Dias úteis restantes<b class="dn-num">${dias}</b></div></div>
      ${can('ranking_view')?`<button class="dn-btn dn-hero-btn" onclick="showTab('ranking')"><i class="ti ti-target-arrow"></i>Definir metas</button>`:''}</div>`;
  }
  // Funil em faixa (clica e abre o funil)
  const etapas=ETAPAS.filter(e=>e!=='Perdido');
  const cont=etapas.map(e=>leadsD.filter(l=>l.etapa===e).length);
  const max=Math.max(...cont,1);
  const podeFunil=can('funil_view');
  const funil=`<div class="dn-card dn-funil"><h3><i class="ti ti-layout-kanban"></i>Funil de vendas${podeFunil?`<button class="dn-mais" onclick="showTab('funil')">Abrir funil</button>`:''}</h3>
    <div class="dn-etapas">${etapas.map((e,i)=>`<button class="dn-etapa" ${podeFunil?`onclick="showTab('funil')"`:'disabled'} title="${esc(etapaLabel(e))}"><div class="dn-e-nome">${esc(etapaLabel(e))}</div><div class="dn-e-n dn-num">${cont[i]}</div><div class="dn-e-bar"><span style="width:${Math.round(cont[i]/max*100)}%"></span></div></button>`).join('')}</div></div>`;
  // Ranking
  const rk=V?usersD.map(u=>({u,c:(V.mes[u.sb_id]||{}).credito||0,n:(V.mes[u.sb_id]||{}).vendas||0})).filter(x=>x.c>0).sort((a,b)=>b.c-a.c).slice(0,4):[];
  const rank=`<div class="dn-card dn-rank"><h3><i class="ti ti-trophy" style="color:#f5b301"></i>Ranking do mês${can('ranking_view')?`<button class="dn-mais" onclick="showTab('ranking')">Ver ranking</button>`:''}</h3>
    ${!V?'<div class="dn-vazio">Carregando…</div>':rk.length?rk.map((x,i)=>{const m=Number(x.u.meta)||0;return `<div class="dn-r-item"><span class="dn-r-pos">${i===0?'<i class="ti ti-crown" style="color:#f5b301;font-size:18px"></i>':i+1}</span>${_dnAvatar(x.u,x.u.nome,i)}<div style="min-width:0"><div class="dn-r-nome">${esc(x.u.nome)}</div><div class="dn-muted" style="font-size:11.5px">${x.n} venda${x.n!==1?'s':''}</div></div><div class="dn-r-val dn-num">${_dnCompacto(x.c)}${m?`<small>${Math.round(x.c/m*100)}% da meta</small>`:''}</div></div>`;}).join('')
    :'<div class="dn-vazio">As vendas do mês aparecem aqui assim que forem registradas.</div>'}</div>`;
  box.innerHTML=`<div class="dn-ph"><div><h1>${saud}${nome?', '+esc(nome):''}</h1><div class="dn-sub">${esc(dataTxt.charAt(0).toUpperCase()+dataTxt.slice(1))} · ${novos} lead${novos!==1?'s':''} novo${novos!==1?'s':''} desde ontem</div></div>
      <div class="dn-acoes">${can('leads_import')?'<button class="dn-btn" onclick="abrirModalImportar()"><i class="ti ti-upload"></i>Importar</button>':''}${can('leads_create')?'<button class="dn-btn pri" onclick="openModal()"><i class="ti ti-plus"></i>Novo lead</button>':''}</div></div>
    ${kpi('user-plus','Leads no mês',leadsMes,variacao(leadsMes,leadsAnt,'pct'))}
    ${kpi('circle-check','Vendas no mês',vendasMes===null?'…':vendasMes,variacao(vendasMes,vendasAnt,'abs'))}
    ${kpi('coin','Crédito vendido',credMes===null?'…':_dnCompacto(credMes),variacao(credMes,credAnt,'pct'))}
    ${kpi('percentage','Conversão',conv.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%','<span>leads que viraram venda</span>')}
    ${hero}${rank}${funil}`;
  if(!V||Date.now()-V.em>60000) _dnCarregarVendas().then(r=>{ if(r&&designNovoAtivo()) renderDashNovo(); }).catch(()=>{});
}

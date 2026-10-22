// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function renderDashboard(){
  // Filtra leads visíveis para o usuário logado (respeita hierarquia)
  const _visD=getVisiveisParaMim();
  const meD=getMe();
  const _leadsD=(meD&&(meD.role==='master'||meD.role==='gestor'||meD.role==='superadmin'))
    ? leads
    : leads.filter(l=>_visD.has(l.responsavelId));
  const t=_leadsD.length,f=_leadsD.filter(l=>l.etapa==='Fechado / Convertido').length;
  const p=_leadsD.filter(l=>l.etapa==='Perdido').length,a=t-f-p;
  const tx=t?Math.round(f/t*100):0;
  // hero strip
  const hr=new Date().getHours();
  const saud=hr<12?'Bom dia':hr<18?'Boa tarde':'Boa noite';
  const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const meses=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const nd=new Date();
  const meUser=getMe(); // FIX bug#5: nunca usa users[0] como fallback
  const meNome=meUser?meUser.nome.split(' ')[0]:'';
  document.getElementById('hero-greeting-txt').textContent=`${saud}${meNome?', '+meNome:''} 👋`;
  document.getElementById('hero-date-txt').textContent=`${dias[nd.getDay()]}, ${nd.getDate()} de ${meses[nd.getMonth()]} de ${nd.getFullYear()}${getAdmin()?` · ${getAdmin().nome}`:''}` ;
  const pip=_leadsD.filter(l=>!['Fechado / Convertido','Perdido'].includes(l.etapa));
  const pipVal=pip.reduce((s,l)=>s+l.credito,0);
  const credTotal=_leadsD.filter(l=>l.etapa==='Fechado / Convertido').reduce((s,l)=>s+l.credito,0);
  document.getElementById('hero-pipeline').textContent=pipVal>=1000000?'R$'+Math.round(pipVal/100000)/10+'M':pipVal>=1000?'R$'+Math.round(pipVal/1000)+'k':a;
  document.getElementById('hero-conversao').textContent=tx+'%';
  // Total vendido do mês atual — filtra por usuário exceto para gestor/master que vê tudo
  const _empIdDash = window._empresaIdDireto;
  const _meDash = getMe();
  const _isGestorDash = _meDash && ['master','superadmin','admin','gestor'].includes(_meDash.role);
  if(_empIdDash){
    let _qVendas = window._sb.from('vendas').select('valor_credito,data_fechamento,created_at,user_id').eq('empresa_id',_empIdDash);
    // Representante/supervisor/vendedor: filtra somente suas próprias vendas
    if(!_isGestorDash && _meDash?.sb_id){
      _qVendas = _qVendas.eq('user_id', _meDash.sb_id);
    }
    _qVendas.then(({data})=>{
      const hoje=new Date(); hoje.setHours(0,0,0,0);
      const ini=new Date(hoje.getFullYear(),hoje.getMonth(),1);
      const vendsMes=(data||[]).filter(r=>{
        const ds=(r.data_fechamento||r.created_at||'').split('T')[0];
        if(!ds) return true;
        const d=new Date(ds+'T00:00:00');
        return d>=ini && d<=hoje;
      });
      const rankTotal=vendsMes.reduce((s,r)=>s+(r.valor_credito||0),0);
      const el=document.getElementById('hero-credito');
      if(el) el.textContent=rankTotal>=1000000?'R$'+Math.round(rankTotal/100000)/10+'M':rankTotal>=1000?'R$'+Math.round(rankTotal/1000)+'k':'R$'+rankTotal;
    });
  } else {
    document.getElementById('hero-credito').textContent='R$0';
  }
  const spark=(color,pts)=>{const w=80,h=32;const path=pts.map((y,i)=>`${i===0?'M':'L'}${Math.round(i*(w/(pts.length-1)))},${Math.round(h-y*(h/Math.max(...pts,1)))}`).join(' ');return `<svg class="mc2-spark" viewBox="0 0 ${w} ${h}" width="80" height="32" fill="none"><path d="${path}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;};
  document.getElementById('metrics-row').innerHTML=`
    <div class="mc2 cn"><div class="mc2-icon"><i class="ti ti-users"></i></div><div class="mc2-body"><div class="mc2-lbl">Total de leads</div><div class="mc2-val">${t}</div><div class="mc2-sub">no pipeline</div></div>${spark('#6366f1',[10,14,12,18,15,22,19,26,24])}</div>
    <div class="mc2 cb"><div class="mc2-icon"><i class="ti ti-activity"></i></div><div class="mc2-body"><div class="mc2-lbl">Em andamento</div><div class="mc2-val">${a}</div><div class="mc2-sub">leads ativos</div></div>${spark('#3b82f6',[8,12,10,16,14,18,16,22,20])}</div>
    <div class="mc2 cg"><div class="mc2-icon"><i class="ti ti-circle-check"></i></div><div class="mc2-body"><div class="mc2-lbl">Convertidos</div><div class="mc2-val">${f}</div><div class="mc2-sub">fechamentos</div></div>${spark('#1db954',[6,10,8,14,12,18,16,22,20])}</div>
    <div class="mc2 cy"><div class="mc2-icon"><i class="ti ti-chart-bar"></i></div><div class="mc2-body"><div class="mc2-lbl">Taxa de conversão</div><div class="mc2-val">${tx}%</div><div class="mc2-sub">do total de leads</div></div>${spark('#f59e0b',[12,10,14,12,18,16,22,20,24])}</div>`;
  const BADGE_MAP={'ti-user-plus':['Novo lead','bdg-nl'],'ti-circle-check':['Venda realizada','bdg-vr'],'ti-message':['Primeiro contato','bdg-pc'],'ti-brand-whatsapp':['WhatsApp','bdg-pc'],'ti-arrows-right-left':['Movido','bdg-gen'],'ti-phone':['Ligação','bdg-gen'],'ti-user-edit':['Perfil atualizado','bdg-gen']};
  const AV_MAP={'ti-user-plus':'ti-user','ti-circle-check':'ti-currency-dollar','ti-message':'ti-brand-whatsapp','ti-brand-whatsapp':'ti-brand-whatsapp','ti-arrows-right-left':'ti-arrows-right-left'};
  const AV_CLS={'ti-brand-whatsapp':'av-wa','ti-message':'av-wa','ti-circle-check':'av-cash'};
  const feed=document.getElementById('activity-feed');
  const _acts=window.activities||activities||[];
  feed.innerHTML=_acts.length?_acts.slice(0,5).map(act=>{
    const[badgeTxt,badgeCls]=BADGE_MAP[act.icon]||['Atividade','bdg-gen'];
    const avIcon=AV_MAP[act.icon]||'ti-user';
    const avCls=AV_CLS[act.icon]||'';
    const txt=act.text;
    const match=txt.match(/^([^:—–]+?)(?:\s+(?:entrou|fechou|—|:|fez|realizou|foi|atualizou))/i);
    const nome=match?match[1].trim():txt.split(' ').slice(0,2).join(' ');
    const desc=txt.slice(nome.length).replace(/^[\s:—–]+/,'');
    return `<div class="act2-item"><div class="act2-av ${avCls}"><i class="ti ${avIcon}"></i></div><div class="act2-body"><div class="act2-name"><strong>${nome}</strong>${desc?' '+desc:''}</div><div class="act2-time">${act.time}</div></div><span class="act2-badge ${badgeCls}">${badgeTxt}</span><button class="act2-menu"><i class="ti ti-dots-vertical"></i></button></div>`;
  }).join(''):'<p style="color:var(--tm);font-size:12.5px;padding:12px 0">Nenhuma atividade ainda.</p>';

  const max=Math.max(...ETAPAS.map(e=>_leadsD.filter(l=>l.etapa===e).length),1);
  document.getElementById('dash-etapas').innerHTML=ETAPAS.map((e,i)=>{const c=_leadsD.filter(l=>l.etapa===e).length;return `<div class="br"><span class="brl">${ETAPAS_LABEL[e]||e}</span><div class="brt"><div class="brf" style="width:${Math.round(c/max*100)}%;background:${EC[i]}"></div></div><span class="brv">${c}</span></div>`;}).join('');
}


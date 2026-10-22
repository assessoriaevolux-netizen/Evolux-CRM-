// ─── RELATÓRIOS ───────────────────────────────────────────────────────────────
function renderRelatorios(){
  // ── Calcula intervalo de datas conforme período selecionado ──────────────
  function _relDataLimite(){
    const hoje=new Date(); hoje.setHours(0,0,0,0);
    const p=relPeriodo||'mes';
    let ini=new Date(hoje);
    if(p==='hoje'){ /* ini = hoje */ }
    else if(p==='semana'){ ini.setDate(hoje.getDate()-hoje.getDay()); }
    else if(p==='mes'){ ini.setDate(1); }
    else if(p==='trimestre'){ ini.setMonth(hoje.getMonth()-2); ini.setDate(1); }
    else if(p==='ano'){ ini.setMonth(0); ini.setDate(1); }
    else { return null; } // sem filtro = tudo
    return ini;
  }
  // Converte 'DD/MM/YYYY' → Date (meia noite)
  function _parseDataLead(s){
    if(!s) return null;
    const p=s.split('/');
    if(p.length===3) return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
    // tenta YYYY-MM-DD também
    const d=new Date(s); return isNaN(d)?null:d;
  }
  const _iniRel=_relDataLimite();

  // ── Filtra por visibilidade + período ────────────────────────────────────
  const _visRel=getVisiveisParaMim();
  const _gestorRel=isGestor();
  const _leadsRelTodos=_gestorRel?leads:leads.filter(l=>_visRel.has(l.responsavelId));
  const _leadsRel=_iniRel
    ? _leadsRelTodos.filter(l=>{ const d=_parseDataLead(l.data); return d&&d>=_iniRel; })
    : _leadsRelTodos;
  const _usersRel=users.filter(u=>_gestorRel||_visRel.has(u.id));

  // ── Etapas do funil ──────────────────────────────────────────────────────
  const maxE=Math.max(...ETAPAS.map(e=>_leadsRel.filter(l=>l.etapa===e).length),1);
  document.getElementById('rel-etapas').innerHTML=ETAPAS.map((e,i)=>{const c=_leadsRel.filter(l=>l.etapa===e).length;return `<div class="br"><span class="brl">${esc(etapaLabel(e))}</span><div class="brt"><div class="brf" style="width:${Math.round(c/maxE*100)}%;background:${EC[i]}"></div></div><span class="brv">${c}</span></div>`;}).join('');

  // ── Tipos ────────────────────────────────────────────────────────────────
  document.getElementById('rel-tipos').innerHTML=['Imóvel','Automóvel','Moto','Serviço'].map(t=>{const c=_leadsRel.filter(l=>l.tipo===t).length;return `<div class="lr"><span class="ld" style="background:${TC[t]}"></span><span style="flex:1">${t}</span><span style="font-weight:700;color:var(--tx)">${c}</span></div>`;}).join('');

  // ── Origem ───────────────────────────────────────────────────────────────
  const or=['Meta Ads','Indicação','Orgânico'],maxO=Math.max(...or.map(o=>_leadsRel.filter(l=>l.origem===o).length),1);
  document.getElementById('rel-origem').innerHTML=or.map(o=>{const c=_leadsRel.filter(l=>l.origem===o).length;return `<div class="br"><span class="brl">${o}</span><div class="brt"><div class="brf" style="width:${Math.round(c/maxO*100)}%;background:${OC[o]}"></div></div><span class="brv">${c}</span></div>`;}).join('');

  // ── Resumo financeiro — filtrado por período ─────────────────────────────
  const t=_leadsRel.length;
  const f=_leadsRel.filter(l=>l.etapa==='Fechado / Convertido').length;
  const p=_leadsRel.filter(l=>l.etapa==='Perdido').length;
  const pip=_leadsRel.filter(l=>!['Fechado / Convertido','Perdido'].includes(l.etapa)).reduce((a,l)=>a+l.credito,0);
  // Total vendido no período = soma do crédito dos leads FECHADOS no período
  const totalVendidoPeriodo=_leadsRel.filter(l=>l.etapa==='Fechado / Convertido').reduce((a,l)=>a+l.credito,0);
  // Vendas registradas no ranking (total acumulado — exibe separado para clareza)
  const rankVendasRel=_usersRel.reduce((s,u)=>s+(u.vendas||0),0);
  const rankTotalRel=_usersRel.reduce((s,u)=>s+(u.credito||0),0);
  const periodoLabel=({hoje:'Hoje',semana:'Semana atual',mes:'Mês atual',trimestre:'Último trimestre',ano:'Ano atual'})[relPeriodo||'mes']||'Período';
  document.getElementById('rel-financeiro').innerHTML=`
    <div class="sr"><span class="sl">Total de leads (${periodoLabel})</span><span class="sv">${t}</span></div>
    <div class="sr"><span class="sl">Convertidos</span><span class="sv" style="color:var(--g)">${f}</span></div>
    <div class="sr"><span class="sl">Perdidos</span><span class="sv" style="color:var(--r)">${p}</span></div>
    <div class="sr"><span class="sl">Taxa de conversão</span><span class="sv">${t?Math.round(f/t*100):0}%</span></div>
    <div class="sr"><span class="sl">Crédito em pipeline</span><span class="sv">${fmtR(pip)}</span></div>
    <div class="sr"><span class="sl">Crédito fechado (${periodoLabel})</span><span class="sv" style="color:var(--g)">${fmtR(totalVendidoPeriodo)}</span></div>
    <div class="sr"><span class="sl">Total vendido acumulado (ranking)</span><span class="sv" style="color:var(--g)">${fmtR(rankTotalRel)}</span></div>
    <div class="sr"><span class="sl">Vendas registradas acumuladas</span><span class="sv">${rankVendasRel}</span></div>`;

  // ── Desempenho por membro — filtrado por período ─────────────────────────
  const eqEl=document.getElementById('rel-equipe-table');
  if(eqEl){
    // Para cada user: conta leads do período que são dele
    const sorted=[..._usersRel].map(u=>{
      const mLeads=_leadsRel.filter(l=>l.responsavelId===u.id);
      const mAtivos=mLeads.filter(l=>!['Fechado / Convertido','Perdido'].includes(l.etapa)).length;
      const mConv=mLeads.filter(l=>l.etapa==='Fechado / Convertido').length;
      const mVol=mLeads.filter(l=>l.etapa==='Fechado / Convertido').reduce((a,l)=>a+l.credito,0);
      return {...u,_mAtivos:mAtivos,_mConv:mConv,_mVol:mVol};
    }).sort((a,b)=>b._mVol-a._mVol);

    eqEl.innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="border-bottom:2px solid var(--c2);text-align:left">
        <th style="padding:8px 10px;color:var(--tm);font-weight:700">Membro</th>
        <th style="padding:8px 10px;color:var(--tm);font-weight:700">Hierarquia</th>
        <th style="padding:8px 10px;color:var(--tm);font-weight:700;text-align:right">Leads ativos</th>
        <th style="padding:8px 10px;color:var(--tm);font-weight:700;text-align:right">Convertidos</th>
        <th style="padding:8px 10px;color:var(--tm);font-weight:700;text-align:right">Crédito fechado</th>
        <th style="padding:8px 10px;color:var(--tm);font-weight:700;text-align:right">Meta</th>
        <th style="padding:8px 10px;color:var(--tm);font-weight:700;min-width:100px">Progresso (acum.)</th>
      </tr></thead>
      <tbody>${sorted.map((u,i)=>{
        const h=u.hierarquiaId?getHier(u.hierarquiaId):null;
        const pct=u.meta?Math.min(Math.round((u.credito||0)/u.meta*100),100):0;
        const bg=i%2===0?'':'var(--c0)';
        return `<tr style="border-bottom:1px solid var(--c1);background:${bg}">
          <td style="padding:10px 10px">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0">${safeUrl(u.foto)?`<img src="${safeUrl(u.foto)}" style="width:100%;height:100%;object-fit:cover">`:esc(u.nome.charAt(0))}</div>
              <div>
                <div style="font-weight:700;color:var(--tx)">${esc(u.nome)}</div>
                <div style="font-size:10.5px;color:var(--tm)">${esc(u.email)}</div>
              </div>
            </div>
          </td>
          <td style="padding:10px 10px"><span style="font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(1,107,60,.1);color:var(--g);font-weight:600">${esc(h?h.nome:getHierLabel(u))}</span></td>
          <td style="padding:10px 10px;text-align:right;font-weight:700;color:var(--tx)">${u._mAtivos}</td>
          <td style="padding:10px 10px;text-align:right;font-weight:700;color:var(--g)">${u._mConv}</td>
          <td style="padding:10px 10px;text-align:right;font-weight:800;color:var(--tx)">${fmtR(u._mVol)}</td>
          <td style="padding:10px 10px;text-align:right;color:var(--tm)">${fmtR(u.meta||0)}</td>
          <td style="padding:10px 10px">
            <div style="height:6px;background:var(--c1);border-radius:20px;overflow:hidden;margin-bottom:3px">
              <div style="height:100%;width:${pct}%;background:${pct>=100?'var(--g)':'var(--y)'};border-radius:20px;transition:width .4s"></div>
            </div>
            <div style="font-size:10px;color:${pct>=100?'var(--g)':'var(--tm)'};font-weight:700">${pct}%</div>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ── Histórico de movimentações ────────────────────────────────────────────
  const histEl=document.getElementById('rel-historico');
  if(histEl){
    const searchEl=document.getElementById('rel-search-hist');
    const q=(searchEl?searchEl.value:'').toLowerCase().trim();
    const _allActs=_atividadesVisiveis();
    const filtered=q?_allActs.filter(a=>String(a.text||'').toLowerCase().includes(q)):_allActs;
    const ICON_CLS={'ti-user-plus':'color:#6366f1','ti-circle-check':'color:var(--g)','ti-message':'color:var(--b)','ti-brand-whatsapp':'color:#25d366','ti-arrows-right-left':'color:var(--y)','ti-phone':'color:var(--b)','ti-x':'color:var(--r)','ti-trophy':'color:#f0c040','ti-gavel':'color:var(--y)','ti-user-edit':'color:var(--b)'};
    if(!filtered.length){histEl.innerHTML='<p style="color:var(--tm);font-size:13px">Nenhuma movimentação encontrada.</p>';return;}
    histEl.innerHTML='<div style="display:flex;flex-direction:column;gap:4px">'+[...filtered].slice(0,50).map((a,i)=>{
      const icStyle=ICON_CLS[a.icon]||'color:var(--tm)';
      const bg=i%2===0?'background:var(--c0)':'';
      return `<div style="display:flex;align-items:flex-start;gap:12px;padding:9px 12px;border-radius:8px;${bg}">
        <div style="width:28px;height:28px;border-radius:8px;background:var(--c1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ${esc(a.icon)}" style="font-size:13px;${icStyle}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;color:var(--tx);font-weight:500">${esc(a.text)}</div>
        </div>
        <div style="font-size:11px;color:var(--tm);white-space:nowrap;flex-shrink:0">${esc(a.time)}</div>
      </div>`;
    }).join('')+'</div>'+(filtered.length>50?`<div style="text-align:center;padding:10px;font-size:12px;color:var(--tm)">Exibindo 50 de ${filtered.length} registros</div>`:' ');
  }
}


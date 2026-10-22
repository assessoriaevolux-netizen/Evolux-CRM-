// ─── MINHAS VENDAS ────────────────────────────────────────────────────────────
let _mvVendasCache = [];

async function _carregarVendasParaMV(){
  const empresaId = await window._getEmpresaId().catch(()=>null);
  if(!empresaId || !window._sb) return [];
  const me = getMe();
  if(!me) return [];

  let q = window._sb.from('vendas')
    .select('id,user_id,lead_id,cliente_nome,valor_credito,data_fechamento,created_at,empresa_id')
    .eq('empresa_id', empresaId)
    .order('data_fechamento', {ascending: false});

  // Gestor/master/superadmin vê todos; outros só as próprias
  const isGestor = ['master','superadmin','gestor','admin'].includes(me.role);
  if(!isGestor && me.sb_id) {
    q = q.eq('user_id', me.sb_id);
  }

  const {data, error} = await q;
  if(error){ console.warn('[MinhasVendas]', error); return []; }

  // Enriquece com nome do lead (se não tiver no campo cliente_nome)
  const rows = (data||[]).map(v => {
    const lead = leads.find(l => l.sb_id === v.lead_id || l.id === v.lead_id);
    const user = users.find(u => u.sb_id === v.user_id);
    return {
      ...v,
      _clienteNome: v.cliente_nome || lead?.nome || '—',
      _vendedorNome: user?.nome || '—',
      _vendedorFoto: user?.foto || null,
      _leadLocal: lead || null,
      _userLocal: user || null,
    };
  });
  _mvVendasCache = rows;
  return rows;
}

function _mvFiltrarPeriodo(rows, periodo){
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  if(periodo === 'todos') return rows;
  return rows.filter(v => {
    const d = new Date((v.data_fechamento || v.created_at || '').split('T')[0]+'T00:00:00');
    if(periodo === 'hoje') return d >= hoje;
    if(periodo === 'semana'){
      const ini = new Date(hoje); ini.setDate(hoje.getDate() - hoje.getDay());
      return d >= ini;
    }
    if(periodo === 'mes'){
      return d.getFullYear() === hoje.getFullYear() && d.getMonth() === hoje.getMonth();
    }
    if(periodo === 'mes_passado'){
      const mp = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return d >= mp && d <= fim;
    }
    return true;
  });
}

async function renderMinhasVendas(){
  const lista = document.getElementById('mv-lista');
  if(!lista) return;
  lista.innerHTML = '<div style="color:var(--tm);font-size:13px;padding:20px 0">Carregando vendas...</div>';

  // Popula select de vendedores (só para gestor/master)
  const me = getMe();
  const isGestor = me && ['master','superadmin','gestor','admin'].includes(me.role);
  const selUser = document.getElementById('mv-filtro-user');
  if(selUser){
    if(isGestor){
      selUser.style.display='';
      const opts = '<option value="">Todos os vendedores</option>' +
        users.filter(u=>u.empresaId===me.empresaId||me.role==='master'||me.role==='superadmin')
          .map(u=>`<option value="${u.sb_id||u.id}">${u.nome}</option>`).join('');
      if(selUser.innerHTML !== opts) selUser.innerHTML = opts;
    } else {
      selUser.style.display = 'none';
    }
  }

  let rows = await _carregarVendasParaMV();

  // Filtro período
  const periodo = document.getElementById('mv-filtro-periodo')?.value || 'mes';
  rows = _mvFiltrarPeriodo(rows, periodo);

  // Filtro vendedor
  const filtroUser = selUser?.value || '';
  if(filtroUser) rows = rows.filter(v => v.user_id === filtroUser || String(v._userLocal?.id) === filtroUser);

  // Filtro busca
  const busca = (document.getElementById('mv-busca')?.value || '').toLowerCase().trim();
  if(busca) rows = rows.filter(v => (v._clienteNome||'').toLowerCase().includes(busca) || (v._vendedorNome||'').toLowerCase().includes(busca));

  // Atualiza cards
  const totalQtd = rows.length;
  const totalVal = rows.reduce((s,v) => s+(v.valor_credito||0), 0);
  const ticket = totalQtd ? totalVal/totalQtd : 0;
  const el_qtd = document.getElementById('mv-total-qtd');
  const el_val = document.getElementById('mv-total-val');
  const el_tck = document.getElementById('mv-ticket-medio');
  if(el_qtd) el_qtd.textContent = totalQtd;
  if(el_val) el_val.textContent = fmtR(totalVal);
  if(el_tck) el_tck.textContent = fmtR(ticket);

  if(!rows.length){
    lista.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--tm)">
      <i class="ti ti-receipt-off" style="font-size:36px;display:block;margin-bottom:8px;opacity:.4"></i>
      <div style="font-size:14px">Nenhuma venda encontrada no período</div>
    </div>`;
    return;
  }

  lista.innerHTML = rows.map(v => {
    const dataFmt = v.data_fechamento
      ? new Date(v.data_fechamento+'T00:00:00').toLocaleDateString('pt-BR')
      : (v.created_at ? new Date(v.created_at).toLocaleDateString('pt-BR') : '—');
    const ini = (v._vendedorNome||'U').charAt(0).toUpperCase();
    const avatarHtml = v._vendedorFoto
      ? `<img src="${v._vendedorFoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : ini;
    const podeMexer = isGestor || (me && v.user_id === me.sb_id);
    return `<div class="mv-card" id="mv-row-${v.id}" style="background:var(--w);border:1px solid var(--c2);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;transition:box-shadow .15s">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden">${avatarHtml}</div>
      <div style="flex:1;min-width:140px">
        <div style="font-weight:700;font-size:14px;color:var(--tx)">${v._clienteNome}</div>
        <div style="font-size:12px;color:var(--tm);margin-top:2px">${isGestor ? v._vendedorNome+' · ' : ''}${dataFmt}</div>
      </div>
      <div style="font-size:17px;font-weight:800;color:var(--g);white-space:nowrap">${fmtR(v.valor_credito||0)}</div>
      ${podeMexer ? `<div style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="mvEditarVenda('${v.id}')" title="Editar" style="width:32px;height:32px;border:1px solid var(--c2);background:var(--c0);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--tm)"><i class="ti ti-pencil" style="font-size:14px"></i></button>
        <button onclick="mvExcluirVenda('${v.id}')" title="Excluir" style="width:32px;height:32px;border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626"><i class="ti ti-trash" style="font-size:14px"></i></button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function mvEditarVenda(vendaId){
  const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
  if(!v){ showToast('Venda não encontrada.','ti-alert-triangle','#d97706'); return; }

  const dataAtual = v.data_fechamento || (v.created_at||'').split('T')[0] || '';
  const html = `<div id="mv-edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px">Editar venda</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">${v._clienteNome}</div>
      <div class="field" style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:6px">Nome do cliente</label>
        <input type="text" id="mve-nome" class="fi" value="${v._clienteNome !== '—' ? v._clienteNome : ''}" placeholder="Nome do cliente">
      </div>
      <div class="field" style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:6px">Valor do crédito</label>
        <input type="text" id="mve-valor" class="fi" value="${fmtR(v.valor_credito||0)}" oninput="mvMaskValor(this)" placeholder="R$ 0,00">
      </div>
      <div class="field" style="margin-bottom:20px">
        <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:6px">Data da venda</label>
        <input type="date" id="mve-data" class="fi" value="${dataAtual}">
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('mv-edit-modal')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button onclick="mvSalvarEdicao('${v.id}')" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-check"></i> Salvar alterações</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('mve-nome')?.focus(), 80);
}

async function mvSalvarEdicao(vendaId){
  const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
  if(!v) return;
  const nomeEl = document.getElementById('mve-nome');
  const valorEl = document.getElementById('mve-valor');
  const dataEl = document.getElementById('mve-data');
  const novoNome = nomeEl?.value.trim() || v._clienteNome;
  const novoValor = unM(valorEl?.value||'') || v.valor_credito;
  const novaData = dataEl?.value || v.data_fechamento;

  if(!novoValor){ showToast('Informe o valor.','ti-alert-triangle','#d97706'); return; }

  // Diferença de valor para atualizar crédito do usuário
  const diffValor = novoValor - (v.valor_credito||0);

  const {error} = await window._sb.from('vendas').update({
    cliente_nome: novoNome,
    valor_credito: novoValor,
    data_fechamento: novaData,
  }).eq('id', vendaId);

  if(error){ showToast('Erro ao salvar: '+error.message,'ti-alert-circle','#dc3545'); return; }

  // Atualiza lead associado se existir
  if(v.lead_id){
    await window._sb.from('leads').update({credito: novoValor}).eq('id', v.lead_id).catch(()=>{});
    const lead = leads.find(l => l.sb_id === v.lead_id);
    if(lead) lead.credito = novoValor;
  }

  // Atualiza crédito do vendedor no profiles
  if(v.user_id && diffValor !== 0){
    let cur = null;
    try{ const r = await window._sb.from('profiles').select('credito').eq('id',v.user_id).single(); cur=r.data; }catch(e){}
    if(cur){
      try{ await window._sb.from('profiles').update({credito: Math.max(0,(cur.credito||0)+diffValor)}).eq('id',v.user_id); }catch(e){}
      const userLocal = users.find(u=>u.sb_id===v.user_id);
      if(userLocal) userLocal.credito = Math.max(0,(userLocal.credito||0)+diffValor);
    }
  }

  document.getElementById('mv-edit-modal')?.remove();
  showToast('Venda atualizada!','ti-check');
  _mvInvalidarCacheEAtualizar();
  try{ renderMinhasVendas(); }catch(e){}
}

function mvExcluirVenda(vendaId){
  showConfirm('Excluir esta venda? O lead voltará para a etapa de Negociação e o crédito do vendedor será ajustado.', function(){
    _mvExcluirVendaExec(vendaId);
  });
}
async function _mvExcluirVendaExec(vendaId){
  try{
    const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
    if(!v){ showToast('Venda não encontrada no cache. Recarregue a aba.','ti-alert-triangle','#d97706'); return; }

    const {error} = await window._sb.from('vendas').delete().eq('id', vendaId);
    if(error){ showToast('Erro ao excluir: '+error.message,'ti-alert-circle','#dc3545'); return; }

    // Remove do cache local imediatamente
    const idx = _mvVendasCache.findIndex(x => String(x.id) === String(vendaId));
    if(idx > -1) _mvVendasCache.splice(idx, 1);

    // Decrementa vendas e crédito do vendedor
    if(v.user_id){
      let cur = null;
      try{ const r = await window._sb.from('profiles').select('vendas,credito').eq('id',v.user_id).single(); cur = r.data; }catch(e){}
      if(cur){
        try{ await window._sb.from('profiles').update({
          vendas: Math.max(0,(cur.vendas||0)-1),
          credito: Math.max(0,(cur.credito||0)-(v.valor_credito||0))
        }).eq('id',v.user_id); }catch(e){}
      }
      const userLocal = users.find(u=>u.sb_id===v.user_id);
      if(userLocal){
        userLocal.vendas = Math.max(0,(userLocal.vendas||0)-1);
        userLocal.credito = Math.max(0,(userLocal.credito||0)-(v.valor_credito||0));
      }
    }

    // Move lead de volta para Negociação
    if(v.lead_id){
      await window._sb.from('leads').update({etapa:'Negociação'}).eq('id',v.lead_id).catch(()=>{});
      const lead = leads.find(l => l.sb_id === v.lead_id);
      if(lead){ lead.etapa = 'Negociação'; }
    }

    if(window._saveAtividade) window._saveAtividade('ti-trash','Venda de '+v._clienteNome+' excluída');
    showToast('Venda excluída com sucesso.','ti-check');
    _mvInvalidarCacheEAtualizar();
    try{ renderMinhasVendas(); }catch(e){}
  } catch(err){
    showToast('Erro inesperado: '+(err?.message||err),'ti-alert-circle','#dc3545');
    console.error('mvExcluirVenda error:', err);
  }
}

// Invalida cache de ranking e força re-render do painel + ranking
async function _mvInvalidarCacheEAtualizar(){
  // Recalibra profiles a partir das vendas reais (corrige dados sujos)
  try{ await _recalibrarProfiles(); }catch(e){
    // fallback: só recarrega sem recalibrar
    try{ if(window._loadProfiles) await window._loadProfiles(); }catch(e2){}
  }

  // Invalida cache de ranking
  _rankVendasCache.periodo = null;
  _rankVendasCache.data = null;
  _rankVendasCache.resultado = null;
  if(window._rankVendasCache){
    window._rankVendasCache.periodo = null;
    window._rankVendasCache.data = null;
    window._rankVendasCache.resultado = null;
  }
  try{ renderDashboard(); }catch(e){}
  try{ await _aplicarFiltroVendas(); }catch(e){ try{ renderRanking(); }catch(e2){} }
  try{ if(document.getElementById('tab-funil')?.classList.contains('active')) renderKanban(); }catch(e){}
}

window.renderMinhasVendas = renderMinhasVendas;

// Recalibra profiles.credito e profiles.vendas a partir das linhas reais da tabela vendas
async function _recalibrarProfiles(){
  const empId = window._empresaIdDireto;
  if(!empId || !window._sb) return;
  try{
    // Busca todas as vendas da empresa
    const {data:todasVendas} = await window._sb.from('vendas').select('user_id,valor_credito').eq('empresa_id',empId);
    if(!todasVendas) return;

    // Agrupa por user_id
    const mapa = {};
    for(const v of todasVendas){
      if(!v.user_id) continue;
      if(!mapa[v.user_id]) mapa[v.user_id] = {vendas:0, credito:0};
      mapa[v.user_id].vendas++;
      mapa[v.user_id].credito += (v.valor_credito||0);
    }

    // Busca todos os profiles da empresa
    const {data:profs} = await window._sb.from('profiles').select('id').eq('empresa_id',empId);
    if(!profs) return;

    // Atualiza cada profile com os valores reais
    for(const prof of profs){
      const real = mapa[prof.id] || {vendas:0, credito:0};
      await window._sb.from('profiles').update({vendas: real.vendas, credito: real.credito}).eq('id', prof.id);
    }

    // Recarrega profiles locais
    if(window._loadProfiles) await window._loadProfiles();
  } catch(e){ console.warn('[recalibrar]', e); }
}
window._recalibrarProfiles = _recalibrarProfiles;


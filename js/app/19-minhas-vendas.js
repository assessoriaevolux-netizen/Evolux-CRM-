// ─── MINHAS VENDAS ────────────────────────────────────────────────────────────
// Gestor vê as vendas da empresa; supervisor/representante, as da sua equipe;
// os demais, as próprias. Editar/excluir segue as permissões do cargo e o banco
// mantém lead, ranking e lance automático coerentes.
let _mvVendasCache = [];
let _mvCarregando = false;

function _mvEscopo(){
  const me = getMe();
  if(!me) return {gestor:false, ids:[]};
  if(isGestor(me)) return {gestor:true, ids:null};
  const vis = getVisiveisParaMim();
  return {gestor:false, ids:users.filter(u=>vis.has(u.id)&&u.sb_id).map(u=>u.sb_id)};
}

async function _carregarVendasParaMV(){
  const empresaId = await window._getEmpresaId();
  if(!empresaId) return [];
  const esc0 = _mvEscopo();
  if(!esc0.gestor && !esc0.ids.length) return [];
  const rows = await window._sbTodos(()=>{
    let q = window._sb.from('vendas')
      .select('id,user_id,lead_id,cliente_nome,valor_credito,data_fechamento,created_at,empresa_id')
      .eq('empresa_id', empresaId);
    if(!esc0.gestor) q = q.in('user_id', esc0.ids);
    return q.order('data_fechamento', {ascending:false, nullsFirst:false}).order('id');
  });
  _mvVendasCache = rows.map(v => {
    const lead = leads.find(l => l.sb_id === v.lead_id);
    const user = users.find(u => u.sb_id === v.user_id) || (window.usersInativos||{})[v.user_id] || null;
    return {...v, _clienteNome: v.cliente_nome || lead?.nome || '—', _vendedorNome: user?.nome || '—',
            _vendedorFoto: user?.foto || null, _leadLocal: lead || null, _userLocal: user || null};
  });
  return _mvVendasCache;
}

function _mvDataISO(v){
  if(v.data_fechamento) return String(v.data_fechamento).slice(0,10);
  return v.created_at ? hojeISO(new Date(v.created_at)) : '';
}
function _mvFiltrarPeriodo(rows, periodo){
  if(periodo === 'todos') return rows;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  let de = null, ate = hojeISO(hoje);
  if(periodo === 'hoje') de = hojeISO(hoje);
  else if(periodo === 'semana'){ const ini = new Date(hoje); ini.setDate(hoje.getDate()-hoje.getDay()); de = hojeISO(ini); }
  else if(periodo === 'mes') de = hojeISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  else if(periodo === 'mes_passado'){ de = hojeISO(new Date(hoje.getFullYear(), hoje.getMonth()-1, 1)); ate = hojeISO(new Date(hoje.getFullYear(), hoje.getMonth(), 0)); }
  else return rows;
  return rows.filter(v => { const d = _mvDataISO(v); return d && d >= de && d <= ate; });
}

async function renderMinhasVendas(){
  const lista = document.getElementById('mv-lista');
  if(!lista || _mvCarregando) return;
  _mvCarregando = true;
  lista.innerHTML = '<div style="color:var(--tm);font-size:13px;padding:20px 0">Carregando vendas...</div>';
  const selUser = document.getElementById('mv-filtro-user');
  const esc0 = _mvEscopo();
  const pessoas = esc0.gestor ? users.slice() : users.filter(u=>(esc0.ids||[]).includes(u.sb_id));
  if(selUser){
    if(pessoas.length > 1){
      const v = selUser.value;
      selUser.style.display = '';
      selUser.innerHTML = '<option value="">Todos os vendedores</option>' +
        pessoas.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(u=>`<option value="${esc(u.sb_id)}">${esc(u.nome)}</option>`).join('');
      selUser.value = v;
    } else {
      selUser.value = '';
      selUser.style.display = 'none';
    }
  }
  try{
    await _carregarVendasParaMV();
  }catch(e){
    console.warn('[MinhasVendas]', e);
    lista.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:20px 0">Não foi possível carregar as vendas: ${esc(e.message||e)}</div>`;
    _mvCarregando = false;
    return;
  }
  _mvCarregando = false;
  mvFiltrar();
}

// Aplica busca e filtros sem buscar de novo no servidor
function mvFiltrar(){
  const lista = document.getElementById('mv-lista');
  if(!lista) return;
  const me = getMe();
  const esc0 = _mvEscopo();
  const varias = esc0.gestor || (esc0.ids||[]).length > 1;
  let rows = _mvFiltrarPeriodo(_mvVendasCache, document.getElementById('mv-filtro-periodo')?.value || 'mes');
  const filtroUser = document.getElementById('mv-filtro-user')?.value || '';
  if(filtroUser) rows = rows.filter(v => v.user_id === filtroUser);
  const busca = (document.getElementById('mv-busca')?.value || '').toLowerCase().trim();
  if(busca) rows = rows.filter(v => (v._clienteNome||'').toLowerCase().includes(busca) || (v._vendedorNome||'').toLowerCase().includes(busca));

  const totalQtd = rows.length;
  const totalVal = rows.reduce((s,v) => s+(Number(v.valor_credito)||0), 0);
  const set = (id,t)=>{ const el=document.getElementById(id); if(el) el.textContent=t; };
  set('mv-total-qtd', totalQtd);
  set('mv-total-val', fmtR(totalVal));
  set('mv-ticket-medio', fmtR(totalQtd ? totalVal/totalQtd : 0));

  if(!rows.length){
    lista.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--tm)">
      <i class="ti ti-receipt-off" style="font-size:36px;display:block;margin-bottom:8px;opacity:.4"></i>
      <div style="font-size:14px">Nenhuma venda encontrada no período</div>
    </div>`;
    return;
  }
  const podeEditar = can('vendas_edit'), podeExcluir = can('vendas_delete');
  lista.innerHTML = rows.map(v => {
    const d = _mvDataISO(v);
    const dataFmt = d ? d.split('-').reverse().join('/') : '—';
    const foto = safeUrl(v._vendedorFoto);
    const avatarHtml = foto ? `<img src="${foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : esc((v._vendedorNome||'U').charAt(0).toUpperCase());
    const minha = me && v.user_id === me.sb_id;
    return `<div class="mv-card" id="mv-row-${esc(v.id)}" style="background:var(--w);border:1px solid var(--c2);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;transition:box-shadow .15s">
      <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0;overflow:hidden">${avatarHtml}</div>
      <div style="flex:1;min-width:140px">
        <div style="font-weight:700;font-size:14px;color:var(--tx)">${esc(v._clienteNome)}${v.lead_id?'':' <span style="font-size:10px;font-weight:600;color:var(--tm)">(venda manual)</span>'}</div>
        <div style="font-size:12px;color:var(--tm);margin-top:2px">${varias&&!minha ? esc(v._vendedorNome)+' · ' : ''}${dataFmt}</div>
      </div>
      <div style="font-size:17px;font-weight:800;color:var(--g);white-space:nowrap">${fmtR(v.valor_credito||0)}</div>
      ${(podeEditar||podeExcluir) ? `<div style="display:flex;gap:6px;flex-shrink:0">
        ${podeEditar?`<button onclick="mvEditarVenda('${esc(v.id)}')" title="Editar" style="width:32px;height:32px;border:1px solid var(--c2);background:var(--c0);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--tm)"><i class="ti ti-pencil" style="font-size:14px"></i></button>`:''}
        ${podeExcluir?`<button onclick="mvExcluirVenda('${esc(v.id)}')" title="Excluir" style="width:32px;height:32px;border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#dc2626"><i class="ti ti-trash" style="font-size:14px"></i></button>`:''}
      </div>` : ''}
    </div>`;
  }).join('');
}

function mvEditarVenda(vendaId){
  if(!can('vendas_edit')){ showToast('Você não tem permissão para editar vendas.','ti-lock'); return; }
  const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
  if(!v){ showToast('Venda não encontrada.','ti-alert-triangle','#d97706'); return; }
  document.getElementById('mv-edit-modal')?.remove();
  const html = `<div id="mv-edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px">Editar venda</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">${esc(v._clienteNome)}${v.lead_id?' · o crédito do lead acompanha o valor':''}</div>
      <div class="field" style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:6px">Nome do cliente</label>
        <input type="text" id="mve-nome" class="fi" value="${esc(v._clienteNome !== '—' ? v._clienteNome : '')}" placeholder="Nome do cliente">
      </div>
      <div class="field" style="margin-bottom:14px">
        <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:6px">Valor do crédito</label>
        <input type="text" id="mve-valor" class="fi" value="${esc(fmtR(v.valor_credito||0))}" oninput="mvMaskValor(this)" placeholder="R$ 0,00">
      </div>
      <div class="field" style="margin-bottom:20px">
        <label style="font-size:12px;font-weight:600;color:var(--tm);display:block;margin-bottom:6px">Data da venda</label>
        <input type="date" id="mve-data" class="fi" value="${esc(_mvDataISO(v))}">
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('mv-edit-modal')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="mve-salvar" onclick="mvSalvarEdicao('${esc(v.id)}')" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-check"></i> Salvar alterações</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(()=>document.getElementById('mve-nome')?.focus(), 80);
}

async function mvSalvarEdicao(vendaId){
  const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
  if(!v) return;
  const novoNome = document.getElementById('mve-nome')?.value.trim() || v.cliente_nome || null;
  const novoValor = unM(document.getElementById('mve-valor')?.value||'');
  const novaData = document.getElementById('mve-data')?.value || v.data_fechamento || hojeISO();
  if(!novoValor){ showToast('Informe o valor.','ti-alert-triangle','#d97706'); return; }
  const btn = document.getElementById('mve-salvar'); if(btn) btn.disabled = true;
  // O banco atualiza o crédito do lead e o ranking a partir da venda
  const {data, error} = await window._sb.from('vendas').update({
    cliente_nome: novoNome, valor_credito: novoValor, data_fechamento: novaData,
  }).eq('id', vendaId).select('id');
  if(btn) btn.disabled = false;
  if(error || !data || !data.length){
    showToast('Não foi possível salvar: '+(error?error.message:'sem permissão para editar esta venda.'),'ti-alert-circle','#dc3545');
    return;
  }
  if(v.lead_id){ const lead = leads.find(l => l.sb_id === v.lead_id); if(lead) lead.credito = novoValor; }
  document.getElementById('mv-edit-modal')?.remove();
  if(window._saveAtividade) window._saveAtividade('ti-pencil',`Venda de ${novoNome||v._clienteNome} alterada para ${fmtR(novoValor)}`,v.user_id);
  showToast('Venda atualizada!','ti-check');
  _mvInvalidarCacheEAtualizar();
}

function mvExcluirVenda(vendaId){
  if(!can('vendas_delete')){ showToast('Você não tem permissão para excluir vendas.','ti-lock'); return; }
  const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
  if(!v){ showToast('Venda não encontrada. Recarregue a aba.','ti-alert-triangle','#d97706'); return; }
  showConfirm(`Excluir a venda de ${v._clienteNome} (${fmtR(v.valor_credito||0)})?${v.lead_id?' O lead volta para a etapa de Negociação.':''}`, function(){
    _mvExcluirVendaExec(vendaId);
  });
}
async function _mvExcluirVendaExec(vendaId){
  const v = _mvVendasCache.find(x => String(x.id) === String(vendaId));
  if(!v) return;
  // O banco devolve o lead para Negociação, acerta o ranking e o lance automático
  const r = await window._excluirVenda(vendaId);
  if(r.error){ showToast('Não foi possível excluir: '+r.error.message,'ti-alert-circle','#dc3545'); return; }
  const idx = _mvVendasCache.indexOf(v);
  if(idx > -1) _mvVendasCache.splice(idx, 1);
  if(v.lead_id){ const lead = leads.find(l => l.sb_id === v.lead_id); if(lead && lead.etapa === 'Fechado / Convertido') lead.etapa = 'Negociação'; }
  if(window._saveAtividade) window._saveAtividade('ti-trash','Venda de '+v._clienteNome+' excluída',v.user_id);
  showToast('Venda excluída.','ti-check');
  _mvInvalidarCacheEAtualizar();
}

// Depois de editar/excluir: ranking, painel e funil refletem o banco
function _mvInvalidarCacheEAtualizar(){
  _atualizarAposVenda();
  try{ _aplicarFiltroVendas(); }catch(e){}
  try{ renderDashboard(); }catch(e){}
  try{ renderKanban(); renderTable(); }catch(e){}
  mvFiltrar();
}

window.renderMinhasVendas = renderMinhasVendas;

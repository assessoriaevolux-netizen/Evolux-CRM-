// ─── GESTÃO (acompanhamento multi-empresa) ─────────────────────────────────
// Master vê indicadores agregados das empresas vinculadas à sua gestão.
// Plataforma administra (criar/editar gestões) na aba Empresas.

let _gestaoInfo = null;       // {gestao_id, gestao_nome} do acesso
let _gestaoMetricas = null;   // array de métricas por empresa
let _gestaoRanking = null;    // array do ranking geral

// ─── Inicialização ──────────────────────────────────────────────
function _initGestao(acesso) {
  _gestaoInfo = acesso?.gestao || null;
  // Mostrar/esconder botão da sidebar
  const btn = document.getElementById('sb-btn-gestao');
  if (btn) btn.style.display = _gestaoInfo ? '' : 'none';
  // Atualizar título
  const titulo = document.getElementById('gestao-titulo');
  if (titulo && _gestaoInfo) titulo.textContent = _gestaoInfo.gestao_nome || 'Gestão';
}

function isGestaoMaster() {
  return !!_gestaoInfo;
}

// ─── Aba Gestão (para o master) ─────────────────────────────────
async function renderGestao() {
  if (!_gestaoInfo) return;
  const container = document.getElementById('gestao-content');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner"></div><p style="color:var(--tm);margin-top:12px">Carregando indicadores da gestão...</p></div>';

  // Filtro de período
  const de = document.getElementById('gestao-de')?.value || null;
  const ate = document.getElementById('gestao-ate')?.value || null;

  try {
    // Carregar métricas e ranking em paralelo
    const [metRes, rankRes] = await Promise.all([
      window._rpc('crm_gestao_metricas', { p_gestao_id: _gestaoInfo.gestao_id, p_de: de, p_ate: ate }),
      window._rpc('crm_gestao_ranking', { p_gestao_id: _gestaoInfo.gestao_id, p_de: de, p_ate: ate })
    ]);

    if (metRes.error) throw metRes.error;
    if (rankRes.error) throw rankRes.error;

    _gestaoMetricas = metRes.data || [];
    _gestaoRanking = rankRes.data || [];

    _renderGestaoContent(container);
  } catch (err) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#dc2626"><i class="ti ti-alert-triangle" style="font-size:32px"></i><p style="margin-top:8px">Erro ao carregar: ${esc(err.message || err)}</p></div>`;
  }
}

function _renderGestaoContent(container) {
  const metricas = _gestaoMetricas || [];
  const ranking = _gestaoRanking || [];

  // Totais gerais
  let totalLeads = 0, totalLeadsPeriodo = 0, totalVendas = 0, totalCredito = 0, totalMembros = 0;
  metricas.forEach(m => {
    totalLeads += m.total_leads || 0;
    totalLeadsPeriodo += m.leads_periodo || 0;
    totalVendas += m.vendas_periodo || 0;
    totalCredito += m.credito_periodo || 0;
    totalMembros += m.membros_ativos || 0;
  });

  const fmt = v => Number(v).toLocaleString('pt-BR');
  const fmtR = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  let html = '';

  // ── Cards resumo geral ──
  html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px">
    <div class="gestao-card"><div class="gestao-card-label">Total de Leads</div><div class="gestao-card-value">${fmt(totalLeads)}</div></div>
    <div class="gestao-card"><div class="gestao-card-label">Leads no Período</div><div class="gestao-card-value">${fmt(totalLeadsPeriodo)}</div></div>
    <div class="gestao-card"><div class="gestao-card-label">Vendas no Período</div><div class="gestao-card-value">${fmt(totalVendas)}</div></div>
    <div class="gestao-card"><div class="gestao-card-label">Crédito no Período</div><div class="gestao-card-value">${fmtR(totalCredito)}</div></div>
    <div class="gestao-card"><div class="gestao-card-label">Membros Ativos</div><div class="gestao-card-value">${fmt(totalMembros)}</div></div>
  </div>`;

  // ── Cards por empresa ──
  html += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px"><i class="ti ti-building-bank" style="color:var(--g)"></i> Indicadores por Empresa</h3>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:28px">';
  metricas.forEach(m => {
    const isMaster = m.is_master === true;
    const taxa = m.leads_periodo > 0 ? ((m.vendas_periodo / m.leads_periodo) * 100).toFixed(1) : '0.0';
    html += `<div style="background:var(--w);border:1px solid var(--c2);border-radius:12px;padding:16px;${isMaster ? 'border-left:3px solid var(--g);' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="width:36px;height:36px;border-radius:8px;background:${isMaster ? 'var(--gs)' : 'var(--c0)'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${isMaster ? 'var(--g)' : 'var(--tm)'}">${esc((m.empresa_nome || '?').charAt(0))}</div>
        <div>
          <div style="font-weight:700;font-size:13px">${esc(m.empresa_nome)}${isMaster ? ' <span style="font-size:11px;color:var(--g)">(Master)</span>' : ''}</div>
          <div style="font-size:11px;color:var(--tm)">${m.membros_ativos} membro${m.membros_ativos !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div style="background:var(--c0);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--tx)">${fmt(m.leads_periodo)}</div>
          <div style="font-size:10px;color:var(--tm);margin-top:2px">Leads</div>
        </div>
        <div style="background:var(--c0);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:800;color:var(--g)">${fmt(m.vendas_periodo)}</div>
          <div style="font-size:10px;color:var(--tm);margin-top:2px">Vendas</div>
        </div>
        <div style="background:var(--c0);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:15px;font-weight:700;color:var(--tx)">${fmtR(m.credito_periodo)}</div>
          <div style="font-size:10px;color:var(--tm);margin-top:2px">Crédito</div>
        </div>
        <div style="background:var(--c0);border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:15px;font-weight:700;color:var(--tx)">${taxa}%</div>
          <div style="font-size:10px;color:var(--tm);margin-top:2px">Conversão</div>
        </div>
      </div>
    </div>`;
  });
  html += '</div>';

  // ── Ranking geral ──
  html += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px"><i class="ti ti-trophy" style="color:#f59e0b"></i> Ranking Geral da Gestão</h3>';
  if (ranking.length === 0) {
    html += '<p style="color:var(--tm);font-size:13px">Nenhuma venda registrada no período.</p>';
  } else {
    html += '<div style="background:var(--w);border:1px solid var(--c2);border-radius:12px;overflow:hidden">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<thead><tr style="background:var(--c0);font-weight:700;font-size:12px;color:var(--tm)"><th style="padding:10px 14px;text-align:left">#</th><th style="padding:10px 14px;text-align:left">Nome</th><th style="padding:10px 14px;text-align:left">Empresa</th><th style="padding:10px 14px;text-align:right">Vendas</th><th style="padding:10px 14px;text-align:right">Crédito</th></tr></thead>';
    html += '<tbody>';
    ranking.forEach((r, i) => {
      const pos = i + 1;
      const medal = pos <= 3 ? ['🥇', '🥈', '🥉'][pos - 1] : pos;
      html += `<tr style="border-top:1px solid var(--c2);${pos <= 3 ? 'background:rgba(245,158,11,.04)' : ''}">
        <td style="padding:10px 14px;font-weight:700">${medal}</td>
        <td style="padding:10px 14px;font-weight:600">${esc(r.user_nome || '—')}</td>
        <td style="padding:10px 14px;color:var(--tm)">${esc(r.empresa_nome || '—')}</td>
        <td style="padding:10px 14px;text-align:right;font-weight:700">${fmt(r.vendas)}</td>
        <td style="padding:10px 14px;text-align:right;color:var(--g);font-weight:600">${fmtR(r.credito)}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  }

  container.innerHTML = html;
}


// ─── Administração de gestões (plataforma, dentro da aba Empresas) ──
// O administrador escolhe a empresa master, o responsável (gestor dela) e
// marca as outras empresas que entram na gestão.

let _gestoesCache = [];
let _gestoresCache = [];   // gestores ativos de todas as empresas (quem pode ser master)
let _gestaoEditId = null;

async function _loadGestoes() {
  const { data, error } = await window._rpc('crm_admin_listar_gestoes', {});
  if (error) { console.warn('loadGestoes:', error); return; }
  _gestoesCache = data || [];
}

async function renderGestoesAdmin() {
  if (!isPlataforma()) return;
  await _loadGestoes();
  const list = document.getElementById('gestoes-admin-list');
  if (!list) return;

  if (!_gestoesCache.length) {
    list.innerHTML = '<p style="color:var(--tm);font-size:13px">Nenhuma gestão cadastrada ainda. Clique em "Nova gestão" para escolher a empresa master e as empresas que ela acompanha.</p>';
    return;
  }

  list.innerHTML = _gestoesCache.map(g => {
    const ativo = g.ativo !== false;
    const empresas = g.empresas || [];
    return `<div style="background:var(--w);border:1px solid var(--c2);border-radius:12px;padding:16px;${!ativo ? 'opacity:.6' : ''}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">
        <div style="width:42px;height:42px;border-radius:10px;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:18px;color:#fff;flex-shrink:0"><i class="ti ti-hierarchy-3"></i></div>
        <div style="flex:1;min-width:140px">
          <div style="font-weight:700;font-size:14px">${esc(g.nome)}${ativo ? '' : ' <span style="font-size:11px;color:#dc2626">(desativada)</span>'}</div>
          <div style="font-size:12px;color:var(--tm)">Empresa master: <strong>${esc(g.master_empresa_nome || '—')}</strong> · Responsável: ${esc(g.master_nome || '—')} (${esc(g.master_email || '—')})</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="btn bg bsm" onclick="openGestaoModal(${g.id})"><i class="ti ti-pencil"></i>Editar empresas</button>
          <button class="btn ${ativo ? 'bd' : 'bp'} bsm" onclick="toggleGestaoAtivo(${g.id},${ativo})"><i class="ti ${ativo ? 'ti-eye-off' : 'ti-eye'}"></i>${ativo ? 'Desativar' : 'Ativar'}</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--tm);margin-bottom:6px">Empresas acompanhadas (${empresas.length}):</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${empresas.length ? empresas.map(e => `<span style="background:var(--c0);border:1px solid var(--c2);border-radius:6px;padding:3px 10px;font-size:12px">${esc(e.empresa_nome)}</span>`).join('') : '<span style="font-size:12px;color:var(--tm)">Nenhuma ainda — clique em "Editar empresas".</span>'}
      </div>
    </div>`;
  }).join('');
}

function openNovaGestaoModal() { return openGestaoModal(null); }
function openGestaoEditModal(id) { return openGestaoModal(id); }

async function openGestaoModal(id) {
  if (!isPlataforma()) return;
  await loadEmpresas();
  const rg = await window._rpc('crm_admin_listar_gestores', {});
  if (rg.error) { showToast('Não foi possível carregar os gestores: ' + rg.error.message, 'ti-alert-triangle', '#dc2626'); return; }
  _gestoresCache = rg.data || [];
  _gestaoEditId = id || null;
  const g = id ? _gestoesCache.find(x => x.id === id) : null;

  document.getElementById('modal-gestao')?.remove();
  const comGestor = new Set(_gestoresCache.map(x => String(x.empresa_id)));
  const optsMaster = (_empresasCache || []).map(e => {
    const tem = comGestor.has(String(e.id));
    return `<option value="${esc(e.id)}" ${tem ? '' : 'disabled'} ${g && String(g.master_empresa_id) === String(e.id) ? 'selected' : ''}>${esc(e.nome)}${tem ? '' : ' (sem gestor cadastrado)'}</option>`;
  }).join('');

  const html = `<div id="modal-gestao" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:24px;width:100%;max-width:520px;max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px"><i class="ti ti-hierarchy-3" style="color:var(--g)"></i> ${g ? 'Editar gestão' : 'Nova gestão'}</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:18px">Escolha a empresa master e marque as empresas que ela acompanha.</div>

      <div class="field" style="margin-bottom:12px"><label>Nome da gestão</label><input type="text" id="gm-nome" class="fi" placeholder="Ex: Gestão Aliança" value="${g ? esc(g.nome) : ''}"></div>

      <div class="field" style="margin-bottom:12px"><label>1. Empresa master</label>
        <select id="gm-master-emp" class="fi" onchange="_gestaoModalSync()"><option value="">Selecione a empresa master…</option>${optsMaster}</select>
      </div>

      <div class="field" style="margin-bottom:12px"><label>2. Responsável (quem vê o painel da gestão)</label>
        <select id="gm-master-user" class="fi"><option value="">Escolha a empresa master primeiro</option></select>
      </div>

      <div class="field" style="margin-bottom:18px"><label>3. Empresas que fazem parte da gestão</label>
        <div id="gm-empresas" style="border:1px solid var(--c2);border-radius:8px;max-height:220px;overflow:auto;background:var(--c0)"></div>
        <div style="font-size:11px;color:var(--tm);margin-top:4px">O master vê só os números dessas empresas — nunca os leads, nomes ou conversas.</div>
      </div>

      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-gestao')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <button id="gm-btn" onclick="salvarGestaoConfirm()" style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer"><i class="ti ti-check"></i> Salvar gestão</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  _gestaoModalSync(g);
}

// Atualiza a lista de responsáveis e as caixinhas conforme a empresa master escolhida
function _gestaoModalSync(g) {
  const masterEmp = document.getElementById('gm-master-emp')?.value || '';
  const selUser = document.getElementById('gm-master-user');
  const box = document.getElementById('gm-empresas');
  if (!selUser || !box) return;

  const gestores = _gestoresCache.filter(x => String(x.empresa_id) === String(masterEmp));
  selUser.innerHTML = !masterEmp ? '<option value="">Escolha a empresa master primeiro</option>'
    : gestores.map(x => `<option value="${esc(x.user_id)}" ${g && String(g.master_user_id) === String(x.user_id) ? 'selected' : ''}>${esc(x.nome || x.email)} — ${esc(x.email || '')}</option>`).join('');

  // mantém o que já estava marcado (ou o que veio da gestão em edição)
  const marcadas = new Set(g ? (g.empresas || []).map(e => String(e.empresa_id))
    : Array.from(box.querySelectorAll('input:checked')).map(i => i.value));
  const outras = (_empresasCache || []).filter(e => String(e.id) !== String(masterEmp));
  box.innerHTML = outras.length ? outras.map(e => `<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--c2);font-size:13px;cursor:pointer">
      <input type="checkbox" value="${esc(e.id)}" ${marcadas.has(String(e.id)) ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0">
      <span>${esc(e.nome)}</span>
    </label>`).join('') : '<div style="padding:12px;font-size:12px;color:var(--tm)">Nenhuma outra empresa cadastrada.</div>';
}

async function salvarGestaoConfirm() {
  const nome = document.getElementById('gm-nome')?.value.trim();
  const masterEmp = document.getElementById('gm-master-emp')?.value;
  const masterUser = document.getElementById('gm-master-user')?.value;
  const empresas = Array.from(document.querySelectorAll('#gm-empresas input:checked')).map(i => i.value);
  if (!nome) { showToast('Informe o nome da gestão.', 'ti-alert-triangle', '#d97706'); return; }
  if (!masterEmp || !masterUser) { showToast('Escolha a empresa master e o responsável.', 'ti-alert-triangle', '#d97706'); return; }
  if (!empresas.length) { showToast('Marque pelo menos uma empresa para a gestão.', 'ti-alert-triangle', '#d97706'); return; }

  const btn = document.getElementById('gm-btn');
  if (btn) btn.disabled = true;
  const { error } = await window._rpc('crm_admin_salvar_gestao', {
    p_id: _gestaoEditId, p_nome: nome, p_master_user: masterUser, p_empresas: empresas
  });
  if (btn) btn.disabled = false;
  if (error) { showToast('Erro: ' + error.message, 'ti-alert-circle', '#dc3545'); return; }

  document.getElementById('modal-gestao')?.remove();
  showToast('Gestão salva!', 'ti-check');
  renderGestoesAdmin();
}

async function toggleGestaoAtivo(id, atual) {
  const { error } = await window._rpc('crm_admin_toggle_gestao', { p_gestao_id: id, p_ativo: !atual });
  if (error) { showToast('Erro: ' + error.message, 'ti-alert-circle', '#dc3545'); return; }
  showToast(atual ? 'Gestão desativada.' : 'Gestão reativada.', 'ti-check');
  renderGestoesAdmin();
}

// Vercel Serverless Function — POST /api/leads/webhook
// Recebe leads do formulário de sites e salva no CRM
//
// Uso:
//   POST /api/leads/webhook?empresa=UUID   ← cada cliente usa seu próprio UUID
//   POST /api/leads/webhook                ← fallback para WEBHOOK_EMPRESA_ID (Evolux)
//
// Env vars necessárias (configurar no Vercel Dashboard):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   RESEND_API_KEY (opcional — notificação por e-mail)
//   WEBHOOK_EMPRESA_ID (opcional — fallback quando não passa ?empresa=)

function corsHeaders(req) {
  // Aceita qualquer origem — cada cliente integra do site dele
  const origin = req?.headers?.get?.('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(body, status = 200, req = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function normalizaTelefone(raw) {
  if (!raw) return '';
  let t = raw.replace(/\D/g, '');
  if (t.startsWith('55') && t.length >= 12) t = t.slice(2);
  if (t.length === 10) t = t.slice(0, 2) + '9' + t.slice(2);
  return t;
}

const TIPOS_VALIDOS = ['Imóvel', 'Automóvel', 'Moto', 'Serviço'];

// Tipo de bem enviado pelo site; fora da lista do CRM cai em 'Serviço'
function normalizaTipo(raw) {
  const t = String(raw || '').trim();
  return TIPOS_VALIDOS.includes(t) ? t : 'Serviço';
}

// Aceita número (250000) ou texto ("R$ 250.000,00") e devolve número
function normalizaCredito(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  if (!raw) return 0;
  const limpo = String(raw).replace(/[^\d,]/g, '').replace(',', '.');
  const n = parseFloat(limpo);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function montarObs(dados) {
  const linhas = [];
  if (dados.obs)        linhas.push(String(dados.obs).slice(0, 2000));
  if (dados.cidade)     linhas.push(`Cidade: ${dados.cidade}`);
  if (dados.empresa)    linhas.push(`Empresa: ${dados.empresa}`);
  if (dados.instagram)  linhas.push(`Instagram: ${dados.instagram}`);
  if (dados.operacao)   linhas.push(`Operação: ${dados.operacao}`);
  if (dados.vendedores) linhas.push(`Vendedores: ${dados.vendedores}`);
  if (dados.marketing)  linhas.push(`Marketing: ${dados.marketing}`);
  if (dados.demanda)    linhas.push(`Demanda: ${dados.demanda}`);
  if (dados.faturamento) linhas.push(`Faturamento: ${dados.faturamento}`);
  return linhas.join('\n');
}

async function validarEmpresa(empresaId, url, key) {
  const res = await fetch(
    `${url}/rest/v1/empresas?id=eq.${empresaId}&select=id,nome`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

async function inserirLead(dados, empresaIdParam) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado');

  const empresaId = empresaIdParam || process.env.WEBHOOK_EMPRESA_ID;
  if (!empresaId) throw new Error('empresa não informada — use ?empresa=UUID na URL');

  // Valida se a empresa existe no banco
  const empresa = await validarEmpresa(empresaId, url, key);
  if (!empresa) throw new Error('empresa não encontrada — verifique o UUID');

  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);

  const payload = {
    empresa_id: empresaId,
    responsavel_id: null,
    nome: dados.nome || '',
    telefone: normalizaTelefone(dados.whatsapp || dados.telefone),
    tipo: normalizaTipo(dados.tipo),
    credito: normalizaCredito(dados.credito),
    etapa: 'Novo lead',
    origem: 'Site',
    atendimento: '',
    obs: montarObs(dados),
    administradora: null,
    meta_id: null,
    data_criacao: hoje,
    updated_at: agora,
  };

  const res = await fetch(`${url}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase ${res.status}`);
  }

  const lead = (await res.json())[0];
  if (lead) lead.empresa_nome = empresa.nome;
  return lead;
}

async function enviarNotificacao(dados, leadId, empresaNome) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;           // sem chave → pula silenciosamente

  const dest = 'assessoriaevolux@gmail.com';

  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#0a0a0a;padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
    <span style="font-size:20px;font-weight:800;color:#fff">Evolux <span style="color:#1db954">CRM</span></span>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px">
    <h2 style="margin:0 0 16px;color:#0a0a0a">Novo lead do site!</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#666;width:110px"><strong>Nome</strong></td><td>${dados.nome || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>WhatsApp</strong></td><td>${dados.whatsapp || dados.telefone || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Empresa</strong></td><td>${dados.empresa || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Instagram</strong></td><td>${dados.instagram || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Operação</strong></td><td>${dados.operacao || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Vendedores</strong></td><td>${dados.vendedores || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Marketing</strong></td><td>${dados.marketing || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Demanda</strong></td><td>${dados.demanda || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Faturamento</strong></td><td>${dados.faturamento || '—'}</td></tr>
    </table>
    <hr style="margin:20px 0;border:none;border-top:1px solid #eee">
    <p style="margin:0;font-size:13px;color:#888">Lead #${leadId || '?'} • ${empresaNome || 'Evolux'} • Salvo automaticamente no CRM</p>
  </div>
</div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Evolux CRM <onboarding@resend.dev>',
      to: [dest],
      subject: `🟢 Novo lead: ${dados.nome || 'sem nome'} — ${dados.empresa || 'sem empresa'}`,
      html,
    }),
  });
}

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Use POST' }, 405, req);
  }

  try {
    const reqUrl = new URL(req.url);
    const empresaId = reqUrl.searchParams.get('empresa') || null;

    const dados = await req.json();

    // Validação mínima
    if (!dados.nome && !dados.whatsapp && !dados.telefone) {
      return json({ ok: false, error: 'nome ou whatsapp obrigatório' }, 400, req);
    }

    const lead = await inserirLead(dados, empresaId);

    // Email de notificação (fire-and-forget, não bloqueia resposta)
    enviarNotificacao(dados, lead?.id, lead?.empresa_nome).catch(() => {});

    return json({ ok: true, id: lead?.id }, 200, req);
  } catch (e) {
    console.error('webhook erro:', e);
    return json({ ok: false, error: e.message }, 500, req);
  }
}

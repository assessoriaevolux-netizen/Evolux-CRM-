// Vercel Serverless Function — POST /api/leads/webhook
// Recebe leads do formulário do site Evolux e salva no CRM
//
// Env vars necessárias (configurar no Vercel Dashboard):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, WEBHOOK_EMPRESA_ID

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function normalizaTelefone(raw) {
  if (!raw) return '';
  let t = raw.replace(/\D/g, '');
  if (t.startsWith('55') && t.length >= 12) t = t.slice(2);
  if (t.length === 10) t = t.slice(0, 2) + '9' + t.slice(2);
  return t;
}

function montarObs(dados) {
  const linhas = [];
  if (dados.empresa)    linhas.push(`Empresa: ${dados.empresa}`);
  if (dados.instagram)  linhas.push(`Instagram: ${dados.instagram}`);
  if (dados.operacao)   linhas.push(`Operação: ${dados.operacao}`);
  if (dados.vendedores) linhas.push(`Vendedores: ${dados.vendedores}`);
  if (dados.marketing)  linhas.push(`Marketing: ${dados.marketing}`);
  if (dados.demanda)    linhas.push(`Demanda: ${dados.demanda}`);
  if (dados.faturamento) linhas.push(`Faturamento: ${dados.faturamento}`);
  return linhas.join('\n');
}

async function inserirLead(dados) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado');

  const empresaId = process.env.WEBHOOK_EMPRESA_ID;
  if (!empresaId) throw new Error('WEBHOOK_EMPRESA_ID não configurado');

  const agora = new Date().toISOString();
  const hoje = agora.slice(0, 10);

  const payload = {
    empresa_id: empresaId,
    responsavel_id: null,
    nome: dados.nome || '',
    telefone: normalizaTelefone(dados.whatsapp),
    tipo: 'Serviço',
    credito: 0,
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

  return (await res.json())[0];
}

async function enviarNotificacao(dados, leadId) {
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
      <tr><td style="padding:6px 0;color:#666"><strong>WhatsApp</strong></td><td>${dados.whatsapp || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Empresa</strong></td><td>${dados.empresa || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Instagram</strong></td><td>${dados.instagram || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Operação</strong></td><td>${dados.operacao || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Vendedores</strong></td><td>${dados.vendedores || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Marketing</strong></td><td>${dados.marketing || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Demanda</strong></td><td>${dados.demanda || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666"><strong>Faturamento</strong></td><td>${dados.faturamento || '—'}</td></tr>
    </table>
    <hr style="margin:20px 0;border:none;border-top:1px solid #eee">
    <p style="margin:0;font-size:13px;color:#888">Lead #${leadId || '?'} • Salvo automaticamente no CRM</p>
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
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Use POST' }, 405);
  }

  try {
    const dados = await req.json();

    // Validação mínima
    if (!dados.nome && !dados.whatsapp) {
      return json({ ok: false, error: 'nome ou whatsapp obrigatório' }, 400);
    }

    const lead = await inserirLead(dados);

    // Email de notificação (fire-and-forget, não bloqueia resposta)
    enviarNotificacao(dados, lead?.id).catch(() => {});

    return json({ ok: true, id: lead?.id });
  } catch (e) {
    console.error('webhook erro:', e);
    return json({ ok: false, error: e.message }, 500);
  }
}

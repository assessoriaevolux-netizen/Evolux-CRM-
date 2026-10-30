// crm-sms — Envia os SMS do "Token da proposta" na hora marcada.
//
// É chamada a cada minuto pelo banco (pg_cron) e também pelo próprio CRM no
// segundo exato do envio. Ela só manda o que já está na hora (o banco controla a
// fila e nunca entrega o mesmo SMS duas vezes), então pode ser chamada à vontade.
//
// Publicar com "Verify JWT" DESLIGADO.
//
// Segredos (Edge Functions → Secrets) — escolha UM serviço de SMS:
//   SMS_PROVEDOR = zenvia   → ZENVIA_TOKEN e ZENVIA_REMETENTE (nome da conta/remetente na Zenvia)
//   SMS_PROVEDOR = twilio   → TWILIO_SID, TWILIO_TOKEN e TWILIO_FROM (número da Twilio, ex.: +15551234567)
// Nada disso fica no código nem no GitHub.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PROVEDOR = (Deno.env.get('SMS_PROVEDOR') ?? '').trim().toLowerCase()
const env = (k: string) => (Deno.env.get(k) ?? '').trim()

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })

type Resultado = { ok: boolean; id?: string; erro?: string; definitivo?: boolean }

async function zenvia(para: string, texto: string): Promise<Resultado> {
  const token = env('ZENVIA_TOKEN'), de = env('ZENVIA_REMETENTE')
  if (!token || !de) return { ok: false, erro: 'Faltam ZENVIA_TOKEN e ZENVIA_REMETENTE nos Secrets', definitivo: true }
  const r = await fetch('https://api.zenvia.com/v2/channels/sms/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-TOKEN': token },
    body: JSON.stringify({ from: de, to: para, contents: [{ type: 'text', text: texto }] }),
  })
  const d: any = await r.json().catch(() => ({}))
  if (r.ok) return { ok: true, id: d?.id }
  return { ok: false, erro: `Zenvia ${r.status}: ${d?.message || d?.code || 'erro'}`, definitivo: r.status >= 400 && r.status < 500 && r.status !== 429 }
}

async function twilio(para: string, texto: string): Promise<Resultado> {
  const sid = env('TWILIO_SID'), tok = env('TWILIO_TOKEN'), de = env('TWILIO_FROM')
  if (!sid || !tok || !de) return { ok: false, erro: 'Faltam TWILIO_SID, TWILIO_TOKEN e TWILIO_FROM nos Secrets', definitivo: true }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + btoa(`${sid}:${tok}`) },
    body: new URLSearchParams({ To: '+' + para, From: de, Body: texto }),
  })
  const d: any = await r.json().catch(() => ({}))
  if (r.ok) return { ok: true, id: d?.sid }
  return { ok: false, erro: `Twilio ${r.status}: ${d?.message || 'erro'}`, definitivo: r.status >= 400 && r.status < 500 && r.status !== 429 }
}

async function enviar(para: string, texto: string): Promise<Resultado> {
  if (PROVEDOR === 'zenvia') return zenvia(para, texto)
  if (PROVEDOR === 'twilio') return twilio(para, texto)
  return { ok: false, erro: 'Serviço de SMS ainda não configurado (Secret SMS_PROVEDOR no Supabase)', definitivo: true }
}

async function processar() {
  const { data, error } = await admin.rpc('sms_srv_pegar', { p_limite: 30 })
  if (error) throw new Error(error.message)
  const fila = (data || []) as { id: string; telefone: string; texto: string }[]
  let enviados = 0, erros = 0
  for (const s of fila) {
    let r: Resultado
    try { r = await enviar(s.telefone, s.texto) } catch (e) { r = { ok: false, erro: String((e as Error)?.message || e) } }
    await admin.rpc('sms_srv_resultado', { p_id: s.id, p_ok: r.ok, p_erro: r.erro ?? null, p_provedor_id: r.id ?? null, p_definitivo: !!r.definitivo })
    if (r.ok) enviados++; else { erros++; console.error('[crm-sms]', s.id, r.erro) }
  }
  return { ok: true, na_fila: fila.length, enviados, erros }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    return json(200, await processar())
  } catch (e) {
    console.error('[crm-sms]', e)
    return json(500, { ok: false, erro: String((e as Error)?.message || e) })
  }
})

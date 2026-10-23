// meta-callback — volta do "Conectar com a Meta" (Login do Facebook para Empresas).
//
// O gestor clica em "Conectar com a Meta" no CRM → a função crm-integracoes monta o link
// com um "state" assinado → a Meta pede a autorização → volta aqui com ?code=...&state=...
// Aqui: confere o state, troca o code por um token de longa duração, guarda o token só no
// servidor (o navegador nunca vê) e devolve a pessoa para o CRM. O CRM então busca as
// contas de anúncio, páginas e números de WhatsApp (crm-integracoes → meta_atualizar).
//
// Publicar com "Verify JWT" DESLIGADO (quem chama é o navegador voltando da Meta).
// O endereço desta função é o "URI de redirecionamento do OAuth válido" do app na Meta.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_ID = (Deno.env.get('META_APP_ID') ?? '').trim()
const APP_SECRET = (Deno.env.get('META_APP_SECRET') ?? '').trim()
const GRAPH_VERSAO = (Deno.env.get('META_GRAPH_VERSION') ?? '').trim() || 'v25.0'
const GRAPH_BASE = (Deno.env.get('META_GRAPH_URL') || 'https://graph.facebook.com').replace(/\/$/, '')
const URL_CALLBACK = `${SUPABASE_URL}/functions/v1/meta-callback`

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const enc = new TextEncoder()

async function hmac(chave: string, dados: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(dados)))
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
function b64url(b: Uint8Array) {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function deB64url(s: string) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0))
}
function igual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function lerState(state: string) {
  try {
    const [corpo, sig] = state.split('.')
    if (!corpo || !sig || !APP_SECRET) return null
    if (!igual(sig, b64url(await hmac(APP_SECRET, 'oauth:' + corpo)))) return null
    const d = JSON.parse(new TextDecoder().decode(deB64url(corpo)))
    if (!d?.e || !d?.u || !d?.r || !d?.x || Date.now() / 1000 > Number(d.x)) return null
    const u = new URL(String(d.r))
    if (u.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol === 'http:')) return null
    return d as { e: string; u: string; r: string }
  } catch {
    return null
  }
}

async function graph(caminho: string, params: Record<string, string>, token?: string) {
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSAO}/${caminho}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
    url.searchParams.set('appsecret_proof', hex(await hmac(APP_SECRET, token)))
  }
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(25000) })
    const data: any = await r.json().catch(() => ({}))
    if (!r.ok || data?.error) return { ok: false, data, erro: String(data?.error?.error_user_msg || data?.error?.message || `HTTP ${r.status}`) }
    return { ok: true, data, erro: '' }
  } catch (e) {
    return { ok: false, data: null, erro: 'A Meta não respondeu (' + String((e as Error)?.message || e) + ').' }
  }
}

function pagina(titulo: string, texto: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evolux CRM</title><style>body{font-family:system-ui,sans-serif;background:#f4f6f9;color:#0d1b35;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
div{background:#fff;border-radius:14px;padding:28px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{font-size:18px;margin:0 0 8px}p{line-height:1.6;color:#3a4a6a;margin:0}</style></head>
<body><div><h1>${esc(titulo)}</h1><p>${esc(texto)}</p></div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const state = url.searchParams.get('state') || ''
  const st = await lerState(state)
  if (!st) {
    return pagina('Não foi possível concluir a conexão', 'O link de conexão expirou ou é inválido. Volte ao CRM e clique em "Conectar com a Meta" de novo.')
  }
  const voltar = (q: Record<string, string>) => {
    const destino = new URL(st.r)
    for (const [k, v] of Object.entries(q)) destino.searchParams.set(k, v)
    return Response.redirect(destino.toString(), 302)
  }
  try {
    if (url.searchParams.get('error')) {
      return voltar({ meta: 'erro', motivo: url.searchParams.get('error_description') || 'A conexão foi cancelada.' })
    }
    const code = url.searchParams.get('code')
    if (!code) return voltar({ meta: 'erro', motivo: 'A Meta não devolveu o código de autorização.' })

    // A pessoa ainda é gestora desta empresa?
    const { data: ctx, error: eCtx } = await admin.rpc('integ_srv_contexto', { p_user: st.u })
    const c: any = ctx
    if (eCtx || !c || String(c.empresa_id) !== String(st.e) || !c.gestor) {
      return voltar({ meta: 'erro', motivo: 'Somente o gestor da empresa pode conectar a Meta.' })
    }

    // 1) code → token
    const t1 = await graph('oauth/access_token', { client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: URL_CALLBACK, code })
    if (!t1.ok || !t1.data?.access_token) return voltar({ meta: 'erro', motivo: 'A Meta recusou a autorização: ' + t1.erro })
    let token = String(t1.data.access_token)
    let expiraEmSeg = Number(t1.data.expires_in) || 0

    // 2) token de usuário curto → token longo (cerca de 60 dias). Token de usuário do sistema não precisa.
    const t2 = await graph('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: token })
    if (t2.ok && t2.data?.access_token) { token = String(t2.data.access_token); expiraEmSeg = Number(t2.data.expires_in) || expiraEmSeg }

    // 3) dados do token e de quem autorizou
    const [dbg, eu] = await Promise.all([
      graph('debug_token', { input_token: token, access_token: `${APP_ID}|${APP_SECRET}` }),
      graph('me', { fields: 'id,name' }, token),
    ])
    const d: any = dbg.data?.data || {}
    let expira: string | null = null
    if (d.expires_at) expira = new Date(Number(d.expires_at) * 1000).toISOString()
    else if (d.expires_at === undefined && expiraEmSeg) expira = new Date(Date.now() + expiraEmSeg * 1000).toISOString()

    const { error } = await admin.from('integ_meta').upsert({
      empresa_id: String(st.e), conectado_por: st.u, conectado_nome: c.nome || null,
      meta_user_id: eu.data?.id || d.user_id || null, meta_user_nome: eu.data?.name || null,
      token, token_tipo: d.type || null, expira_em: expira, escopos: Array.isArray(d.scopes) ? d.scopes : [],
      descoberto_em: null, ultimo_erro: null, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'empresa_id' })
    if (error) return voltar({ meta: 'erro', motivo: 'Não consegui salvar a conexão: ' + error.message })

    await admin.rpc('integ_srv_atividade', {
      p_emp: String(st.e), p_user: st.u, p_icon: 'ti-brand-meta', p_texto: `${c.nome || 'Gestor'} conectou a conta da Meta ao CRM`,
    })
    return voltar({ meta: 'ok' })
  } catch (e) {
    console.error('[meta-callback]', e)
    return voltar({ meta: 'erro', motivo: 'Erro inesperado: ' + String((e as Error)?.message || e) })
  }
})

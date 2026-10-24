// crm-integracoes — Integrações do Evolux CRM com a Meta (Anúncios, Lead Ads, WhatsApp) e a IA.
//
// Uma função só, para facilitar a publicação. Ela atende três tipos de chamada:
//  1. Avisos da Meta (webhook): GET de verificação e POST assinado (X-Hub-Signature-256).
//     Leads de formulário viram leads no CRM; mensagens do WhatsApp entram no histórico
//     e, se a IA estiver ligada, ela responde seguindo o roteiro da empresa.
//  2. Tarefa periódica: POST ?tarefa=fila (pós-venda), chamada pelo pg_cron.
//  3. Ações do CRM: POST { acao, ... } com o token de quem está logado.
//
// Publicar com "Verify JWT" DESLIGADO: a Meta não manda token. As ações do CRM conferem o
// login aqui dentro, e os avisos da Meta conferem a assinatura com o App Secret.
//
// Segredos (Edge Functions → Secrets): META_APP_ID, META_APP_SECRET, OPENAI_API_KEY e,
// opcional, META_LOGIN_CONFIG_ID (configuração do "Login do Facebook para Empresas").
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Configuração ────────────────────────────────────────────────────────────
const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_ID = (Deno.env.get('META_APP_ID') ?? '').trim()
const APP_SECRET = (Deno.env.get('META_APP_SECRET') ?? '').trim()
const LOGIN_CONFIG_ID = (Deno.env.get('META_LOGIN_CONFIG_ID') ?? '').trim()
const OPENAI_KEY = (Deno.env.get('OPENAI_API_KEY') ?? '').trim()
const MODELO_PADRAO = (Deno.env.get('OPENAI_MODEL') ?? '').trim() || 'gpt-6-luna'
const GRAPH_VERSAO = (Deno.env.get('META_GRAPH_VERSION') ?? '').trim() || 'v25.0'
// (as três abaixo só mudam em teste)
const GRAPH_BASE = (Deno.env.get('META_GRAPH_URL') || 'https://graph.facebook.com').replace(/\/$/, '')
const DIALOGO_BASE = (Deno.env.get('META_DIALOG_URL') || 'https://www.facebook.com').replace(/\/$/, '')
const OPENAI_BASE = (Deno.env.get('OPENAI_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')

const URL_CALLBACK = `${SUPABASE_URL}/functions/v1/meta-callback`
const URL_WEBHOOK = `${SUPABASE_URL}/functions/v1/crm-integracoes`
const ESCOPOS = ['ads_read', 'ads_management', 'business_management', 'leads_retrieval', 'pages_show_list',
  'pages_read_engagement', 'pages_manage_metadata', 'pages_manage_ads', 'whatsapp_business_management',
  'whatsapp_business_messaging']
const ETAPAS = ['Novo lead', 'Primeiro contato', 'Aguardando resposta', 'Proposta enviada', 'Negociação',
  'Fechado / Convertido', 'Perdido']
const FECHADO = 'Fechado / Convertido'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } })
}
class Falha extends Error {
  constructor(public status: number, msg: string, public extra: Record<string, unknown> = {}) { super(msg) }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────
const enc = new TextEncoder()
async function hmac(chave: string, dados: string | Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof dados === 'string' ? enc.encode(dados) : dados))
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
function b64url(b: Uint8Array) {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function igual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
async function tokenVerificacao() { return hex(await hmac(APP_SECRET, 'evolux-webhook-verify')).slice(0, 32) }
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
function emSegundoPlano(p: Promise<unknown>) {
  const er = (globalThis as any).EdgeRuntime
  const seguro = p.catch((e) => console.error('[segundo plano]', e))
  if (er && typeof er.waitUntil === 'function') er.waitUntil(seguro)
}
async function emLotes<T>(itens: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0
  const trabalhadores = Array.from({ length: Math.max(1, Math.min(n, itens.length)) }, async () => {
    while (i < itens.length) {
      const x = itens[i++]
      try { await f(x) } catch (e) { console.error('[lote]', e) }
    }
  })
  await Promise.all(trabalhadores)
}
const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
// Mesmo padrão do CRM: 55 + DDD + número
function telefoneWhatsApp(v: unknown) {
  const d = digitos(v)
  if (d.length === 10 || d.length === 11) return '55' + d
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return d.length >= 8 ? d : ''
}
function primeiroNome(nome: unknown) {
  const p = String(nome ?? '').trim().split(/\s+/)[0] || ''
  if (!p) return ''
  return p === p.toUpperCase() || p === p.toLowerCase() ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p
}
const reais = (v: unknown) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const agoraBrasilia = () => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date())
function textoLimpo(v: unknown, max = 4000) { return String(v ?? '').replaceAll(String.fromCharCode(0), '').trim().slice(0, max) }

// ─── Meta (Graph API) ────────────────────────────────────────────────────────
type RespMeta = { ok: boolean; status: number; data: any; erro?: string; codigo?: number }
function traduzMeta(e: any): string {
  const c = Number(e?.code)
  const sc = Number(e?.error_subcode)
  const m = String(e?.error_user_msg || e?.message || e?.title || '').trim()
  if (c === 190) return 'A conexão com a Meta expirou ou foi removida. Reconecte em Configurações → Meta / Facebook Ads.'
  if (c === 131047) return 'Passaram mais de 24 horas desde a última mensagem do cliente. Envie um modelo aprovado.'
  if (c === 131030) return 'Este número não está na lista de destinatários de teste. Adicione em WhatsApp → Configuração da API, no painel da Meta.'
  if (c === 131026) return 'Não foi possível entregar: o número pode não ter WhatsApp.'
  if (c === 131056) return 'Muitas mensagens seguidas para o mesmo número. Aguarde um pouco.'
  if (c === 131049) return 'A Meta segurou esta mensagem de marketing para não cansar o cliente. Tente outro dia.'
  if (c === 131050) return 'O cliente pediu para não receber mensagens de marketing.'
  if (c === 132001) return 'Modelo de mensagem não encontrado (ou ainda não aprovado) neste idioma.'
  if (c === 132000) return 'A quantidade de variáveis não bate com o modelo.'
  if (c === 132005 || c === 132007 || c === 132012) return 'O texto das variáveis não é aceito pelo modelo.'
  if (c === 132015 || c === 132016) return 'Este modelo está pausado ou desativado pela Meta.'
  if (c === 133010) return 'Este número de WhatsApp ainda não está registrado na Cloud API.'
  if (c === 131031) return 'A conta do WhatsApp Business está bloqueada pela Meta.'
  if (c === 131042) return 'Problema de pagamento na conta do WhatsApp Business (confira a forma de pagamento na Meta).'
  if (c === 4 || c === 17 || c === 32 || c === 613 || c === 80004 || c === 130429) return 'Limite de uso da Meta atingido. Tente de novo em alguns minutos.'
  if (c === 368) return 'A Meta bloqueou esta ação temporariamente por política de uso.'
  if (c === 10 || (c >= 200 && c < 300)) return 'A Meta recusou por falta de permissão' + (m ? ': ' + m : '.')
  if (c === 100 && sc === 33) return 'Item não encontrado na Meta ou sem permissão (confira os IDs).'
  return m || 'Erro na Meta.'
}
async function graph(caminho: string, op: { metodo?: string; token?: string; params?: Record<string, unknown>; corpo?: unknown } = {}): Promise<RespMeta> {
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSAO}/${caminho.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(op.params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  const headers: Record<string, string> = {}
  if (op.token) {
    if (op.token.includes('|')) url.searchParams.set('access_token', op.token) // token do app (id|segredo)
    else {
      headers['Authorization'] = `Bearer ${op.token}`
      if (APP_SECRET) url.searchParams.set('appsecret_proof', hex(await hmac(APP_SECRET, op.token)))
    }
  }
  let body: string | undefined
  if (op.corpo !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(op.corpo) }
  try {
    const r = await fetch(url, { method: op.metodo || 'GET', headers, body, signal: AbortSignal.timeout(25000) })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || data?.error) {
      return { ok: false, status: r.status, data, erro: traduzMeta(data?.error || {}), codigo: Number(data?.error?.code) || undefined }
    }
    return { ok: true, status: r.status, data }
  } catch (e) {
    return { ok: false, status: 0, data: null, erro: 'A Meta não respondeu (' + String((e as Error)?.message || e) + ').' }
  }
}
const tokenApp = () => `${APP_ID}|${APP_SECRET}`
async function garantirAssinaturaApp(objeto: 'page' | 'whatsapp_business_account', campos: string) {
  return graph(`${APP_ID}/subscriptions`, {
    metodo: 'POST', token: tokenApp(),
    params: { object: objeto, callback_url: URL_WEBHOOK, fields: campos, verify_token: await tokenVerificacao(), include_values: 'true' },
  })
}

// ─── Banco ───────────────────────────────────────────────────────────────────
async function rpc(nome: string, params: Record<string, unknown>) {
  const { data, error } = await admin.rpc(nome, params)
  if (error) throw new Error(`${nome}: ${error.message}`)
  return data
}
async function atividade(emp: string, user: string | null, icone: string, texto: string) {
  try { await rpc('integ_srv_atividade', { p_emp: emp, p_user: user, p_icon: icone, p_texto: texto }) } catch (e) { console.error(e) }
}
async function conexaoMeta(emp: string) {
  const { data } = await admin.from('integ_meta').select('*').eq('empresa_id', emp).maybeSingle()
  return data as any
}
async function exigirConexaoMeta(emp: string) {
  const m = await conexaoMeta(emp)
  if (!m?.token) throw new Falha(400, 'A empresa ainda não está conectada com a Meta. Conecte em Configurações → Meta / Facebook Ads.')
  return m
}
async function nomeEmpresa(emp: string) {
  const { data } = await admin.from('empresas').select('nome').eq('id', emp).maybeSingle()
  return (data as any)?.nome || 'nossa empresa'
}
async function leadServidor(id: string) {
  const { data } = await admin.from('leads').select('id,nome,telefone,tipo,credito,etapa,responsavel_id,empresa_id').eq('id', id).maybeSingle()
  if (!data) return null
  const l: any = data
  let responsavel_nome = ''
  if (l.responsavel_id) {
    const { data: p } = await admin.from('profiles').select('nome').eq('id', l.responsavel_id).maybeSingle()
    responsavel_nome = (p as any)?.nome || ''
  }
  return { ...l, id: String(l.id), empresa_id: String(l.empresa_id), responsavel_id: l.responsavel_id ? String(l.responsavel_id) : null, responsavel_nome }
}

// Número de WhatsApp para enviar: o escolhido, o da última conversa do lead, o do vendedor
// ou o padrão da empresa. O token é o permanente do número ou o da conexão Meta.
async function numeroParaEnviar(emp: string, op: { phone_number_id?: string; lead?: string; dono?: string | null } = {}) {
  const { data } = await admin.from('integ_wa_numeros').select('*').eq('empresa_id', emp).eq('ativo', true)
  const nums = (data || []) as any[]
  if (!nums.length) return null
  let n: any = null
  if (op.phone_number_id) {
    n = nums.find((x) => x.phone_number_id === String(op.phone_number_id))
    if (!n) return null
  }
  if (!n && op.lead) {
    const { data: ult } = await admin.from('wa_mensagens').select('phone_number_id').eq('lead_id', op.lead)
      .order('criado_em', { ascending: false }).limit(1)
    if (ult?.[0]) n = nums.find((x) => x.phone_number_id === (ult[0] as any).phone_number_id)
  }
  if (!n && op.dono) n = nums.find((x) => x.dono_id === op.dono)
  if (!n) n = nums.find((x) => x.padrao) || nums[0]
  let token = n.token
  if (!token) token = (await conexaoMeta(emp))?.token
  if (!token) return null
  return { ...n, token_efetivo: token as string }
}
async function ultimaEntrada(lead: string) {
  const { data } = await admin.from('wa_mensagens').select('contato,criado_em,phone_number_id').eq('lead_id', lead)
    .eq('direcao', 'entrada').order('criado_em', { ascending: false }).limit(1)
  return (data?.[0] || null) as any
}
const janelaAberta = (u: any) => !!u && Date.now() - new Date(u.criado_em).getTime() < 24 * 3600 * 1000
async function gravarSaida(m: Record<string, unknown>) {
  const { data, error } = await admin.from('wa_mensagens').insert(m).select('*').single()
  if (error) console.error('[gravarSaida]', error.message)
  return data as any
}

// ─── WhatsApp ────────────────────────────────────────────────────────────────
function limparParam(s: unknown) {
  const t = String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return (t || '-').slice(0, 900)
}
function waTexto(num: any, para: string, texto: string) {
  return graph(`${num.phone_number_id}/messages`, {
    metodo: 'POST', token: num.token_efetivo,
    corpo: { messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { preview_url: false, body: texto } },
  })
}
function waModelo(num: any, para: string, modelo: any, valores: string[]) {
  const vars: string[] = modelo?.variaveis || []
  const nomeados = modelo?.estilo === 'nomeado'
  const parametros = vars.map((v, i) => {
    const p: any = { type: 'text', text: limparParam(valores[i]) }
    if (nomeados) p.parameter_name = v
    return p
  })
  return graph(`${num.phone_number_id}/messages`, {
    metodo: 'POST', token: num.token_efetivo,
    corpo: {
      messaging_product: 'whatsapp', to: para, type: 'template',
      template: { name: modelo.nome, language: { code: modelo.idioma || 'pt_BR' }, components: parametros.length ? [{ type: 'body', parameters: parametros }] : [] },
    },
  })
}
function lerModelo(t: any) {
  const comps: any[] = t?.components || []
  const corpo = comps.find((c) => c.type === 'BODY')?.text || ''
  const cab = comps.find((c) => c.type === 'HEADER')
  const botoes = comps.find((c) => c.type === 'BUTTONS')?.buttons || []
  const encontrados = [...corpo.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((m) => m[1])
  const nomeado = encontrados.some((v) => !/^\d+$/.test(v))
  const variaveis = nomeado ? [...new Set(encontrados)] : [...new Set(encontrados)].sort((a, b) => Number(a) - Number(b))
  let motivo = ''
  if (cab && cab.format && cab.format !== 'TEXT') motivo = 'tem imagem/vídeo/documento no cabeçalho'
  else if (cab && /\{\{/.test(cab.text || '')) motivo = 'tem variável no cabeçalho'
  else if (botoes.some((b: any) => /\{\{/.test(b.url || '') || b.type === 'COPY_CODE' || b.type === 'OTP')) motivo = 'tem botão com variável'
  return {
    nome: t.name, idioma: t.language, status: t.status, categoria: t.category, corpo,
    cabecalho: cab?.format === 'TEXT' ? cab.text || '' : '', rodape: comps.find((c) => c.type === 'FOOTER')?.text || '',
    variaveis, estilo: nomeado ? 'nomeado' : 'posicional', suportado: !motivo, motivo,
  }
}
function renderizarModelo(modelo: any, valores: string[]) {
  let t = modelo?.corpo || ''
  ;(modelo?.variaveis || []).forEach((v: string, i: number) => {
    t = t.split(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g')).join(limparParam(valores[i]))
  })
  return t || `Modelo: ${modelo?.nome || ''}`
}
const cacheModelos = new Map<string, { em: number; lista: any[] }>()
async function listarModelos(num: any, renovar = false) {
  const chave = num.waba_id
  const c = cacheModelos.get(chave)
  if (!renovar && c && Date.now() - c.em < 5 * 60 * 1000) return c.lista
  const r = await graph(`${num.waba_id}/message_templates`, {
    token: num.token_efetivo, params: { fields: 'name,language,status,category,components', limit: 200 },
  })
  if (!r.ok) throw new Falha(400, 'Não consegui listar os modelos: ' + r.erro)
  const lista = (r.data?.data || []).map(lerModelo)
  cacheModelos.set(chave, { em: Date.now(), lista })
  return lista
}
async function acharModelo(num: any, nome: string, idioma?: string) {
  const achar = (l: any[]) => l.find((m) => m.nome === nome && (!idioma || m.idioma === idioma)) || l.find((m) => m.nome === nome)
  let m = achar(await listarModelos(num))
  if (!m) m = achar(await listarModelos(num, true))
  if (!m) throw new Falha(400, `O modelo "${nome}" não foi encontrado nesta conta do WhatsApp.`)
  if (m.status !== 'APPROVED') throw new Falha(400, `O modelo "${nome}" ainda não foi aprovado pela Meta (situação: ${m.status}).`)
  if (!m.suportado) throw new Falha(400, `O modelo "${nome}" não pode ser enviado pelo CRM: ${m.motivo}.`)
  return m
}
// Valor de cada variável do modelo a partir do lead
function valoresDoLead(campos: unknown[], lead: any, empresa: string) {
  return (campos || []).map((c: any) => {
    const k = String(c ?? '')
    if (k.startsWith('texto:')) return k.slice(6)
    switch (k) {
      case 'primeiro_nome': return primeiroNome(lead?.nome) || 'tudo bem'
      case 'nome': return String(lead?.nome || '').trim() || 'cliente'
      case 'tipo': return String(lead?.tipo || 'consórcio').toLowerCase()
      case 'credito': return reais(lead?.credito)
      case 'etapa': return String(lead?.etapa || '')
      case 'responsavel': return primeiroNome(lead?.responsavel_nome) || 'nosso consultor'
      case 'empresa': return empresa
      default: return k
    }
  })
}
const MODELOS_SUGERIDOS = [
  {
    name: 'evolux_primeiro_contato', category: 'UTILITY', campos: ['primeiro_nome', 'tipo', 'empresa'],
    texto: 'Olá {{1}}! Recebemos seu interesse em consórcio de {{2}}. Sou da {{3}} e posso tirar suas dúvidas por aqui. Podemos conversar agora?',
    exemplo: ['Maria', 'imóvel', 'Evolux'],
  },
  {
    name: 'evolux_pos_venda', category: 'UTILITY', campos: ['primeiro_nome', 'empresa'],
    texto: 'Olá {{1}}! Aqui é da {{2}}. Parabéns pela conquista do seu consórcio! Queremos saber se está tudo certo até agora. Ficou alguma dúvida sobre boleto, assembleias ou lances? É só responder esta mensagem.',
    exemplo: ['Maria', 'Evolux'],
  },
  {
    name: 'evolux_novidades', category: 'MARKETING', campos: ['primeiro_nome', 'empresa'],
    texto: 'Olá {{1}}, tudo bem? Aqui é da {{2}}. Temos condições especiais de consórcio este mês, sem juros e com parcelas que cabem no bolso. Quer que eu te mostre as opções? Responda SIM. Se não quiser mais receber estas mensagens, responda SAIR.',
    exemplo: ['Maria', 'Evolux'],
  },
]

// ─── IA (OpenAI) ─────────────────────────────────────────────────────────────
const PRECOS: Record<string, [number, number]> = {
  'gpt-6-luna': [0.10, 0.50], 'gpt-6-sol': [2.0, 10.0], 'gpt-4o-mini': [0.15, 0.60], 'gpt-4.1-mini': [0.40, 1.60],
}
function custoUSD(modelo: string, uso: any) {
  const k = Object.keys(PRECOS).find((p) => modelo === p || modelo.startsWith(p + '-')) || 'gpt-6-luna'
  const [e, s] = PRECOS[k]
  return ((Number(uso?.prompt_tokens) || 0) * e + (Number(uso?.completion_tokens) || 0) * s) / 1e6
}
function traduzOpenAI(status: number, err: any, modelo: string) {
  const code = String(err?.code || err?.type || '')
  if (status === 401) return 'A chave da OpenAI é inválida. Confira o segredo OPENAI_API_KEY no Supabase.'
  if (code === 'insufficient_quota') return 'Sem créditos na OpenAI. Adicione créditos em platform.openai.com → Settings → Billing.'
  if (status === 429) return 'A OpenAI está limitando os pedidos agora. Tente de novo em instantes.'
  if (status === 404 || code === 'model_not_found') return `O modelo "${modelo}" não está disponível na sua conta da OpenAI. Troque o modelo no roteiro.`
  if (status === 403) return 'A OpenAI recusou o pedido: ' + String(err?.message || 'sem permissão')
  return 'Erro na OpenAI: ' + String(err?.message || status)
}
const modeloValido = (m: unknown) => /^[a-z0-9][a-z0-9.-]{1,60}$/.test(String(m || '')) ? String(m) : ''
async function perguntarIA(modelo: string, mensagens: { role: string; content: string }[]) {
  if (!OPENAI_KEY) return { ok: false, erro: 'A chave da OpenAI não está configurada no Supabase (segredo OPENAI_API_KEY).' } as any
  const corpo: any = { model: modelo, messages: mensagens, max_completion_tokens: 1500, reasoning_effort: 'low' }
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    let r: Response
    try {
      r = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo), signal: AbortSignal.timeout(60000),
      })
    } catch (e) {
      return { ok: false, erro: 'A OpenAI não respondeu (' + String((e as Error)?.message || e) + ').' }
    }
    const j: any = await r.json().catch(() => ({}))
    if (r.ok) {
      const texto = String(j?.choices?.[0]?.message?.content || '').trim()
      if (!texto && j?.choices?.[0]?.finish_reason === 'length' && corpo.max_completion_tokens < 4000) {
        corpo.max_completion_tokens = 4000
        continue
      }
      return { ok: true, texto, uso: j?.usage || {} }
    }
    const err = j?.error || {}
    const p = String(err.param || '')
    const msg = String(err.message || '')
    if (r.status === 400 && 'reasoning_effort' in corpo && (p === 'reasoning_effort' || /reasoning_effort/i.test(msg))) { delete corpo.reasoning_effort; continue }
    if (r.status === 400 && 'max_completion_tokens' in corpo && (p === 'max_completion_tokens' || /max_completion_tokens/i.test(msg))) {
      corpo.max_tokens = corpo.max_completion_tokens; delete corpo.max_completion_tokens; continue
    }
    return { ok: false, status: r.status, erro: traduzOpenAI(r.status, err, modelo) }
  }
  return { ok: false, erro: 'A OpenAI não conseguiu responder.' }
}
const ROTEIRO_PADRAO: Record<string, string> = {
  primeiro_atendimento: `Objetivo: dar boas-vindas, entender o que o cliente quer e marcar uma conversa com o consultor (visita à loja ou chamada de vídeo).

Passo a passo:
1. Cumprimente pelo primeiro nome e diga que é a assistente virtual da {{empresa}}.
2. Se ainda não souber, pergunte o que ele quer conquistar com o consórcio: imóvel, carro, moto ou serviço.
3. Pergunte o valor aproximado do crédito que ele procura.
4. Pergunte para quando ele pretende usar o crédito.
5. Pergunte se ele tem algum valor guardado para dar lance (ajuda a ser contemplado antes). Se ele não quiser dizer, siga em frente.
6. Explique em uma frase a vantagem do consórcio: sem juros, parcelas que cabem no bolso e a chance de antecipar a contemplação com lance.
7. Convide para conversar com o consultor {{responsavel}}, na loja ou por chamada de vídeo, e pergunte o melhor dia e horário.
8. Quando ele aceitar e disser o dia e o horário, confirme e passe para o consultor.

Se ele perguntar o valor da parcela, diga que depende do grupo e do prazo e que o consultor monta a simulação certinha na conversa.`,
  pos_venda: `Objetivo: acompanhar o cliente que acabou de fechar o consórcio, garantir que está tudo certo e pedir indicações.

Passo a passo:
1. Parabenize pela conquista e agradeça a confiança na {{empresa}}.
2. Pergunte se ficou alguma dúvida sobre o contrato, o boleto ou as assembleias.
3. Se a dúvida for simples, explique de forma geral. Se for sobre valores, datas ou documentos, diga que o consultor {{responsavel}} vai responder e passe para ele.
4. Pergunte, de 0 a 10, o quanto ele recomendaria a empresa para um amigo.
5. Peça indicação: alguém que também queira comprar imóvel, carro ou moto. Se ele passar nome e telefone, agradeça e passe para o consultor.
6. Agradeça e diga que fica à disposição por aqui.`,
}
function montarSistema(tipo: string, roteiro: string, c: { empresa: string; lead: any }) {
  const lead = c.lead || {}
  const resp = primeiroNome(lead.responsavel_nome) || 'nosso consultor'
  const sub = (t: string) => t
    .replace(/\{\{\s*empresa\s*\}\}/gi, c.empresa)
    .replace(/\{\{\s*responsavel\s*\}\}/gi, resp)
    .replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome(lead.nome) || 'cliente')
    .replace(/\{\{\s*tipo\s*\}\}/gi, String(lead.tipo || 'consórcio').toLowerCase())
    .replace(/\{\{\s*cr[eé]dito\s*\}\}/gi, reais(lead.credito))
  const texto = (roteiro || '').trim() || ROTEIRO_PADRAO[tipo] || ''
  return `Você é a assistente virtual de atendimento por WhatsApp da empresa ${c.empresa}, que vende consórcios.

Regras que valem sempre:
- Escreva em português do Brasil, com tom cordial e natural, como uma pessoa da equipe. Não use listas nem títulos.
- Mensagens curtas: no máximo 3 frases por resposta e no máximo uma pergunta por vez.
- Nunca invente valores de parcela, taxas, prazos, grupos, contemplação ou condições. Se perguntarem, diga que o consultor passa os valores exatos.
- Não peça CPF, documentos, senhas nem dados de cartão. Não prometa contemplação nem resultado garantido.
- Se a mensagem do cliente for só [Áudio], diga com gentileza que por aqui você só consegue ler mensagens escritas e peça para ele escrever.
- Se a pessoa pedir para falar com uma pessoa, quiser marcar visita ou reunião com dia e horário, estiver pronta para fechar, reclamar de algo, ou o assunto sair do roteiro: responda de forma breve e escreva [TRANSFERIR] no final.
- Se a pessoa pedir para não receber mais mensagens: peça desculpas, confirme que não vai mais mandar e escreva [ENCERRAR] no final.
- Não use [TRANSFERIR] nem [ENCERRAR] em nenhuma outra situação.

Agora: ${agoraBrasilia()} (horário de Brasília).
Cliente: ${String(lead.nome || 'não informado')}. Interesse: ${String(lead.tipo || 'não informado')}. Crédito desejado: ${Number(lead.credito) > 0 ? reais(lead.credito) : 'não informado'}. Etapa no funil: ${String(lead.etapa || 'Novo lead')}. Consultor responsável: ${resp}.${tipo === 'pos_venda' ? '\nEste cliente já fechou um consórcio com a empresa.' : ''}

Roteiro da empresa (siga):
${sub(texto)}`
}
function lerMarcas(t: string) {
  const transferir = /\[\s*TRANSFERIR\s*\]/i.test(t)
  const encerrar = /\[\s*ENCERRAR\s*\]/i.test(t)
  const texto = t.replace(/\[\s*(TRANSFERIR|ENCERRAR)\s*\]/gi, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, 1500)
  return { texto, transferir, encerrar }
}
async function historicoIA(lead: string) {
  const { data } = await admin.from('wa_mensagens').select('direcao,conteudo,tipo,template_nome,criado_em')
    .eq('lead_id', lead).order('criado_em', { ascending: false }).limit(24)
  return ((data || []) as any[]).reverse()
    .filter((m) => m.tipo !== 'reacao')
    .map((m) => ({
      role: m.direcao === 'entrada' ? 'user' : 'assistant',
      content: textoLimpo(m.conteudo || (m.template_nome ? `[mensagem automática: ${m.template_nome}]` : '[mensagem]'), 2000),
    }))
}
async function roteiroDe(emp: string, tipo: string) {
  // IA só funciona para empresas do plano Master (liberado no painel Empresas)
  let liberada = false
  try { liberada = !!(await rpc('integ_ia_liberada', { p_emp: emp })) } catch (e) { console.error(e) }
  if (!liberada) return null
  const { data } = await admin.from('ia_roteiros').select('*').eq('empresa_id', emp).eq('tipo', tipo).maybeSingle()
  return data as any
}
async function erroIA(emp: string, tipo: string, erro: string | null) {
  await admin.from('ia_roteiros').update({ ultimo_erro: erro, ultimo_erro_em: erro ? new Date().toISOString() : null })
    .eq('empresa_id', emp).eq('tipo', tipo)
}
async function conversaDe(emp: string, lead: string, tipo: string) {
  const { data } = await admin.from('ia_conversas').select('*').eq('empresa_id', emp).eq('lead_id', lead).eq('tipo', tipo).maybeSingle()
  return data as any
}
// Abre (ou continua) a conversa da IA. Nunca passa por cima de quem assumiu, a não ser que
// seja uma mensagem que a própria empresa decidiu mandar (reativar); quem pediu para parar, nunca.
async function abrirConversa(emp: string, lead: string, tipo: string, numero: string | null, reativar = false) {
  let ex = await conversaDe(emp, lead, tipo)
  if (!ex) {
    await admin.from('ia_conversas').upsert({ empresa_id: emp, lead_id: lead, tipo, status: 'ativa', phone_number_id: numero },
      { onConflict: 'empresa_id,lead_id,tipo', ignoreDuplicates: true })
    ex = await conversaDe(emp, lead, tipo)
  }
  if (!ex) return null
  if (ex.status === 'ativa') return ex
  if (reativar && ex.status === 'humano') {
    const { data } = await admin.from('ia_conversas').update({ status: 'ativa', motivo: null, assumido_por: null, phone_number_id: numero, atualizado_em: new Date().toISOString() })
      .eq('id', ex.id).select('*').single()
    return data as any
  }
  return null
}
async function pediuParaParar(lead: string) {
  const { data } = await admin.from('ia_conversas').select('id').eq('lead_id', lead).eq('status', 'encerrada').limit(1)
  return !!data?.length
}
// Alguém da equipe falou com o lead pelo CRM: a IA sai da conversa (até alguém devolver)
async function humanoAssumiu(ctx: Ctx, lead: any) {
  const agora = new Date().toISOString()
  const motivo = `${ctx.nome} assumiu a conversa`
  await admin.from('ia_conversas').update({ status: 'humano', assumido_por: ctx.user_id, motivo, atualizado_em: agora })
    .eq('empresa_id', ctx.empresa_id).eq('lead_id', lead.id).eq('status', 'ativa')
  await admin.from('ia_conversas').upsert({
    empresa_id: ctx.empresa_id, lead_id: lead.id, tipo: lead.etapa === FECHADO ? 'pos_venda' : 'primeiro_atendimento',
    status: 'humano', assumido_por: ctx.user_id, motivo, atualizado_em: agora,
  }, { onConflict: 'empresa_id,lead_id,tipo', ignoreDuplicates: true })
}
async function passarParaHumano(conv: any, lead: any, motivo: string) {
  await admin.from('ia_conversas').update({ status: 'humano', motivo, atualizado_em: new Date().toISOString() }).eq('id', conv.id)
  await atividade(conv.empresa_id, lead.responsavel_id, 'ti-robot', `IA: ${lead.nome || 'o lead'} precisa de você no WhatsApp — ${motivo}`)
}

// Mensagem que chegou: a IA responde se estiver ligada para este lead
async function responderComIA(r: any, contato: string, numeroId: string, tipoMsg: string) {
  if (!r?.lead_id || tipoMsg === 'reacao') return
  const emp = r.empresa_id
  await esperar(Number(Deno.env.get('IA_ESPERA_MS') ?? 6000)) // junta mensagens mandadas em sequência
  const { data: ult } = await admin.from('wa_mensagens').select('id').eq('lead_id', r.lead_id).eq('direcao', 'entrada')
    .order('criado_em', { ascending: false }).limit(1)
  if ((ult?.[0] as any)?.id !== r.mensagem_id) return // chegou outra depois: a próxima responde tudo
  const lead = await leadServidor(r.lead_id)
  if (!lead) return
  const tipo = lead.etapa === FECHADO ? 'pos_venda' : 'primeiro_atendimento'
  const rot = await roteiroDe(emp, tipo)
  if (!rot?.ativo) return
  let conv = await conversaDe(emp, lead.id, tipo)
  if (tipo === 'pos_venda') {
    if (!conv || conv.status !== 'ativa') return // pós-venda só continua conversas que a IA começou
  } else {
    if (conv && conv.status !== 'ativa') return // alguém assumiu ou o cliente pediu para parar
    const etapas: string[] = Array.isArray(rot.config?.etapas) && rot.config.etapas.length
      ? rot.config.etapas : ['Novo lead', 'Primeiro contato', 'Aguardando resposta']
    if (!etapas.includes(lead.etapa)) return
    if (!conv) {
      // alguém da equipe já está falando com este lead? Então a IA não entra
      const { data: hum } = await admin.from('wa_mensagens').select('id').eq('lead_id', lead.id).eq('direcao', 'saida')
        .eq('ia', false).not('enviado_por', 'is', null).gte('criado_em', new Date(Date.now() - 48 * 3600 * 1000).toISOString()).limit(1)
      if (hum?.length) return
      conv = await abrirConversa(emp, lead.id, tipo, numeroId)
      if (!conv) return // alguém assumiu no meio do caminho
    }
  }
  const limite = Math.max(2, Math.min(60, Number(rot.config?.limite_mensagens) || 15))
  if (conv.mensagens_ia >= limite) { await passarParaHumano(conv, lead, 'a IA chegou ao limite de mensagens desta conversa'); return }

  const empresa = await nomeEmpresa(emp)
  const modelo = modeloValido(rot.modelo) || MODELO_PADRAO
  const resp = await perguntarIA(modelo, [{ role: 'system', content: montarSistema(tipo, rot.roteiro, { empresa, lead }) }, ...(await historicoIA(lead.id))])
  if (!resp.ok) { await erroIA(emp, tipo, resp.erro); return }
  const { texto, transferir, encerrar } = lerMarcas(resp.texto)
  const atual = await conversaDe(emp, lead.id, tipo)
  if (!atual || atual.status !== 'ativa') return // alguém assumiu enquanto a IA pensava
  const { data: nums } = await admin.from('integ_wa_numeros').select('*').eq('phone_number_id', numeroId).maybeSingle()
  const num: any = nums
  if (!num) return
  const token = num.token || (await conexaoMeta(emp))?.token
  if (!token) { await erroIA(emp, tipo, 'O número do WhatsApp está sem token. Reconecte a Meta ou informe o token permanente.'); return }
  if (texto) {
    const env = await waTexto({ ...num, token_efetivo: token }, contato, texto)
    await gravarSaida({
      empresa_id: emp, lead_id: lead.id, phone_number_id: numeroId, contato, direcao: 'saida', tipo: 'texto', conteudo: texto,
      wa_id: env.data?.messages?.[0]?.id || null, status: env.ok ? 'enviada' : 'falhou', erro: env.ok ? null : env.erro, ia: true,
    })
    if (!env.ok) { await erroIA(emp, tipo, 'A IA respondeu, mas o WhatsApp recusou: ' + env.erro); return }
    if (lead.etapa === 'Novo lead') await rpc('integ_srv_lead_contatado', { p_lead: lead.id, p_quem: 'IA' }).catch(console.error)
  }
  await rpc('integ_srv_ia_uso', {
    p_conversa: atual.id, p_entrada: resp.uso?.prompt_tokens || 0, p_saida: resp.uso?.completion_tokens || 0, p_custo: custoUSD(modelo, resp.uso),
  }).catch(console.error)
  if (rot.ultimo_erro) await erroIA(emp, tipo, null)
  if (encerrar) {
    await admin.from('ia_conversas').update({ status: 'encerrada', motivo: 'O cliente pediu para não receber mais mensagens' }).eq('id', atual.id)
    await atividade(emp, lead.responsavel_id, 'ti-robot', `IA: ${lead.nome} pediu para não receber mais mensagens`)
  } else if (transferir) {
    await passarParaHumano(atual, lead, 'o cliente quer falar com o consultor ou marcar um horário')
  }
}

// Primeira mensagem da IA para quem preencheu o formulário (precisa de modelo aprovado)
async function primeiroContatoIA(emp: string, leadId: string) {
  const rot = await roteiroDe(emp, 'primeiro_atendimento')
  if (!rot?.ativo) return
  const cfg = rot.config || {}
  if (!cfg.modelo_inicial) { await erroIA(emp, 'primeiro_atendimento', 'Escolha a mensagem inicial (modelo aprovado) para a IA chamar quem preenche o formulário.'); return }
  const lead = await leadServidor(leadId)
  const para = telefoneWhatsApp(lead?.telefone)
  if (!lead || !para || (await pediuParaParar(lead.id))) return
  const num = await numeroParaEnviar(emp, { dono: lead.responsavel_id })
  if (!num) { await erroIA(emp, 'primeiro_atendimento', 'Nenhum número de WhatsApp configurado para a IA chamar os leads.'); return }
  let modelo: any
  try { modelo = await acharModelo(num, cfg.modelo_inicial, cfg.modelo_inicial_idioma) } catch (e) { await erroIA(emp, 'primeiro_atendimento', (e as Error).message); return }
  const valores = valoresDoLead(cfg.modelo_inicial_campos || ['primeiro_nome', 'tipo', 'empresa'], lead, await nomeEmpresa(emp))
  const env = await waModelo(num, para, modelo, valores)
  await gravarSaida({
    empresa_id: emp, lead_id: lead.id, phone_number_id: num.phone_number_id, contato: para, direcao: 'saida', tipo: 'template',
    template_nome: modelo.nome, conteudo: renderizarModelo(modelo, valores), wa_id: env.data?.messages?.[0]?.id || null,
    status: env.ok ? 'enviada' : 'falhou', erro: env.ok ? null : env.erro, ia: true,
  })
  if (!env.ok) { await erroIA(emp, 'primeiro_atendimento', 'Não consegui enviar a mensagem inicial: ' + env.erro); return }
  await abrirConversa(emp, lead.id, 'primeiro_atendimento', num.phone_number_id, true)
  if (lead.etapa === 'Novo lead') await rpc('integ_srv_lead_contatado', { p_lead: lead.id, p_quem: 'IA' }).catch(console.error)
}

// ─── Lead Ads (formulários do Meta) ──────────────────────────────────────────
function interpretarLead(d: any) {
  const campos: { chave: string; valor: string }[] = (d?.field_data || []).map((f: any) => ({
    chave: String(f?.name || '').toLowerCase(), valor: (f?.values || []).map((v: unknown) => String(v)).join(', ').trim(),
  }))
  const usados = new Set<string>()
  const pegar = (...nomes: string[]) => {
    for (const n of nomes) {
      const c = campos.find((x) => x.chave === n && x.valor)
      if (c) { usados.add(c.chave); return c.valor }
    }
    return ''
  }
  const pegarPadrao = (re: RegExp) => {
    const c = campos.find((x) => re.test(x.chave) && x.valor && !usados.has(x.chave))
    if (c) { usados.add(c.chave); return c.valor }
    return ''
  }
  let nome = pegar('full_name', 'nome_completo', 'nome', 'name')
  if (!nome) nome = [pegar('first_name'), pegar('last_name')].filter(Boolean).join(' ')
  const tel = pegar('phone_number', 'telefone', 'whatsapp', 'celular') || pegarPadrao(/phone|telefone|whats|celular|fone/)
  const email = pegar('email', 'e-mail', 'work_email')
  // tipo do bem: procura em perguntas e respostas
  let tipo = ''
  const tudo = campos.map((c) => `${c.chave} ${c.valor}`).join(' | ').toLowerCase().replace(/_/g, ' ')
  if (/im[oó]ve|casa|apartamento|terreno|imobili/.test(tudo)) tipo = 'Imóvel'
  else if (/\bmoto/.test(tudo)) tipo = 'Moto'
  else if (/autom[oó]v|\bcarro|ve[ií]cul|caminh/.test(tudo)) tipo = 'Automóvel'
  else if (/servi[cç]o|reforma|viagem|cirurgia|festa/.test(tudo)) tipo = 'Serviço'
  // crédito: pergunta sobre valor
  let credito = 0
  const cValor = campos.find((x) => /valor|cr[eé]dito|carta|quanto|investimento|faixa/.test(x.chave) && x.valor)
  if (cValor) {
    usados.add(cValor.chave)
    const t = cValor.valor.toLowerCase().replace(/_/g, ' ')
    const m = t.match(/\d[\d.,]*/)
    if (m) {
      let n = Number(m[0].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
      if (/milh/.test(t)) n *= 1e6
      else if (/\bmil\b|\d\s*k\b/.test(t) && n < 100000) n *= 1000
      if (isFinite(n) && n > 0 && n < 1e9) credito = Math.round(n)
    }
  }
  const outras = campos.filter((c) => !usados.has(c.chave) && c.valor)
    .map((c) => `${c.chave.replace(/_/g, ' ').replace(/\?$/, '').replace(/^./, (x) => x.toUpperCase())}: ${c.valor}`)
  return { nome, tel, email, tipo, credito, outras }
}
async function processarLeadgen(v: any) {
  const pageId = String(v?.page_id || '')
  const leadgen = String(v?.leadgen_id || '')
  if (!pageId || !leadgen) return
  const { data } = await admin.from('integ_meta_paginas').select('*').eq('page_id', pageId).eq('leads_ativo', true)
  for (const pg of (data || []) as any[]) {
    if (!pg.page_token) continue
    const r = await graph(leadgen, {
      token: pg.page_token,
      params: { fields: 'id,created_time,field_data,form_id,ad_id,ad_name,adset_name,campaign_name,platform,is_organic' },
    })
    if (!r.ok) {
      await admin.from('integ_meta').update({ ultimo_erro: `Lead do formulário não pôde ser lido (${pg.nome}): ${r.erro}` }).eq('empresa_id', pg.empresa_id)
      await atividade(pg.empresa_id, null, 'ti-alert-triangle', `Não consegui buscar um lead novo da página ${pg.nome}: ${r.erro}`)
      continue
    }
    const d = interpretarLead(r.data)
    let formulario = ''
    if (r.data?.form_id) {
      const f = await graph(String(r.data.form_id), { token: pg.page_token, params: { fields: 'name' } })
      formulario = f.data?.name || ''
    }
    const origem = [
      formulario && `Formulário: ${formulario}`, r.data?.campaign_name && `Campanha: ${r.data.campaign_name}`,
      r.data?.ad_name && `Anúncio: ${r.data.ad_name}`, r.data?.platform && `Plataforma: ${r.data.platform === 'ig' ? 'Instagram' : 'Facebook'}`,
    ].filter(Boolean).join(' · ')
    const obs = [origem, d.email && `E-mail: ${d.email}`, ...d.outras].filter(Boolean).join('\n')
    const res = await rpc('integ_srv_meta_lead', {
      p_emp: pg.empresa_id, p_page: pageId, p_leadgen: leadgen, p_nome: d.nome || 'Lead do Meta', p_tel: d.tel,
      p_tipo: d.tipo || null, p_credito: d.credito || 0, p_obs: obs,
    })
    if (res?.novo && res?.ia_primeiro_contato) await primeiroContatoIA(pg.empresa_id, res.lead_id)
  }
}

// ─── WhatsApp: avisos recebidos ──────────────────────────────────────────────
function conteudoDaMensagem(m: any) {
  switch (m?.type) {
    case 'text': return { tipo: 'texto', conteudo: m.text?.body || '', midia: null }
    case 'button': return { tipo: 'botao', conteudo: m.button?.text || m.button?.payload || '', midia: null }
    case 'interactive': return { tipo: 'botao', conteudo: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '', midia: null }
    case 'image': return { tipo: 'imagem', conteudo: m.image?.caption ? `[Imagem] ${m.image.caption}` : '[Imagem]', midia: m.image?.id || null }
    case 'audio': return { tipo: 'audio', conteudo: '[Áudio]', midia: m.audio?.id || null }
    case 'video': return { tipo: 'video', conteudo: m.video?.caption ? `[Vídeo] ${m.video.caption}` : '[Vídeo]', midia: m.video?.id || null }
    case 'document': return { tipo: 'documento', conteudo: `[Documento${m.document?.filename ? ': ' + m.document.filename : ''}]${m.document?.caption ? ' ' + m.document.caption : ''}`, midia: m.document?.id || null }
    case 'sticker': return { tipo: 'figurinha', conteudo: '[Figurinha]', midia: m.sticker?.id || null }
    case 'location': return { tipo: 'localizacao', conteudo: `[Localização${m.location?.name ? ': ' + m.location.name : ''}] ${m.location?.latitude ?? ''}, ${m.location?.longitude ?? ''}`, midia: null }
    case 'contacts': return { tipo: 'contato', conteudo: '[Contato compartilhado]', midia: null }
    case 'reaction': return { tipo: 'reacao', conteudo: m.reaction?.emoji || '', midia: null }
    default: return { tipo: 'outro', conteudo: '[Mensagem que o CRM ainda não mostra]', midia: null }
  }
}
const STATUS_WA: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' }
async function processarWhatsApp(v: any) {
  const numeroId = String(v?.metadata?.phone_number_id || '')
  if (!numeroId) return
  const nomes: Record<string, string> = {}
  for (const c of v?.contacts || []) if (c?.wa_id) nomes[String(c.wa_id)] = c?.profile?.name || ''
  const respostas: Promise<void>[] = []
  for (const m of v?.messages || []) {
    const { tipo, conteudo, midia } = conteudoDaMensagem(m)
    if (tipo === 'reacao') continue
    const r = await rpc('integ_srv_wa_entrada', {
      p_numero: numeroId, p_contato: String(m.from || ''), p_nome: nomes[String(m.from)] || null, p_wa_id: m.id || null,
      p_tipo: tipo, p_conteudo: conteudo, p_midia: midia, p_referral: m.referral || null,
      p_em: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
    })
    if (r?.ok && !r?.duplicada) respostas.push(responderComIA(r, String(m.from), numeroId, tipo).catch((e) => console.error('[IA]', e)))
  }
  for (const s of v?.statuses || []) {
    const st = STATUS_WA[String(s?.status)]
    if (!st || !s?.id) continue
    const e = s.errors?.[0]
    await rpc('integ_srv_wa_status', {
      p_wa_id: String(s.id), p_status: st, p_erro: e ? traduzMeta({ code: e.code, message: e.error_data?.details || e.title || e.message }) : null,
    }).catch(console.error)
  }
  await Promise.all(respostas)
}
async function processarEvento(corpo: any, eventoId: string | null) {
  let erro: string | null = null
  try {
    for (const entry of corpo?.entry || []) {
      for (const ch of entry?.changes || []) {
        if (corpo.object === 'page' && ch?.field === 'leadgen') await processarLeadgen(ch.value)
        else if (corpo.object === 'whatsapp_business_account' && ch?.field === 'messages') await processarWhatsApp(ch.value)
      }
    }
  } catch (e) {
    erro = String((e as Error)?.message || e)
    console.error('[evento]', e)
  }
  if (eventoId) await admin.from('integ_eventos').update({ processado: !erro, erro }).eq('id', eventoId)
  await processarFila().catch(console.error)
}
async function webhook(req: Request) {
  const bruto = new Uint8Array(await req.arrayBuffer())
  const assinatura = req.headers.get('x-hub-signature-256') || ''
  if (!APP_SECRET) return new Response('META_APP_SECRET não configurado', { status: 500 })
  const esperado = 'sha256=' + hex(await hmac(APP_SECRET, bruto))
  if (!igual(assinatura, esperado)) return new Response('assinatura inválida', { status: 401 })
  let corpo: any
  try { corpo = JSON.parse(new TextDecoder().decode(bruto)) } catch { return new Response('ok') }
  const { data: ev } = await admin.from('integ_eventos').insert({ objeto: corpo?.object || null, payload: corpo }).select('id').single()
  emSegundoPlano(processarEvento(corpo, (ev as any)?.id || null))
  return new Response('ok')
}

// ─── Fila (pós-venda) ────────────────────────────────────────────────────────
async function posVenda(t: any): Promise<{ status: string; erro: string | null }> {
  const lead = await leadServidor(t.lead_id)
  if (!lead || lead.etapa !== FECHADO) return { status: 'cancelado', erro: 'O lead não está mais em Fechado / Convertido' }
  const rot = await roteiroDe(t.empresa_id, 'pos_venda')
  if (!rot?.ativo) return { status: 'cancelado', erro: 'A IA de pós-venda está desligada' }
  const cfg = rot.config || {}
  if (!cfg.modelo_inicial) {
    await erroIA(t.empresa_id, 'pos_venda', 'Escolha a mensagem do pós-venda (modelo aprovado) para a IA conseguir puxar a conversa.')
    return { status: 'erro', erro: 'Sem modelo de mensagem' }
  }
  const para = telefoneWhatsApp(lead.telefone)
  if (!para) return { status: 'cancelado', erro: 'Lead sem telefone' }
  if (await pediuParaParar(lead.id)) return { status: 'cancelado', erro: 'O cliente pediu para não receber mensagens' }
  const num = await numeroParaEnviar(t.empresa_id, { lead: lead.id, dono: lead.responsavel_id })
  if (!num) return { status: 'erro', erro: 'Nenhum número de WhatsApp configurado' }
  const modelo = await acharModelo(num, cfg.modelo_inicial, cfg.modelo_inicial_idioma)
  const valores = valoresDoLead(cfg.modelo_inicial_campos || ['primeiro_nome', 'empresa'], lead, await nomeEmpresa(t.empresa_id))
  const env = await waModelo(num, para, modelo, valores)
  await gravarSaida({
    empresa_id: t.empresa_id, lead_id: lead.id, phone_number_id: num.phone_number_id, contato: para, direcao: 'saida', tipo: 'template',
    template_nome: modelo.nome, conteudo: renderizarModelo(modelo, valores), wa_id: env.data?.messages?.[0]?.id || null,
    status: env.ok ? 'enviada' : 'falhou', erro: env.ok ? null : env.erro, ia: true,
  })
  if (!env.ok) { await erroIA(t.empresa_id, 'pos_venda', 'Não consegui enviar o pós-venda: ' + env.erro); return { status: 'erro', erro: env.erro || 'erro' } }
  await abrirConversa(t.empresa_id, lead.id, 'pos_venda', num.phone_number_id, true)
  await atividade(t.empresa_id, lead.responsavel_id, 'ti-robot', `IA: mensagem de pós-venda enviada para ${lead.nome}`)
  return { status: 'feito', erro: null }
}
async function processarFila() {
  if (!(await rpc('integ_srv_cron_pode', { p_chave: 'fila', p_segundos: 45 }))) return { ok: true, pulado: true }
  const tarefas = ((await rpc('integ_srv_fila_pegar', { p_limite: 20 })) || []) as any[]
  let feitas = 0
  for (const t of tarefas) {
    let res: { status: string; erro: string | null }
    try { res = await posVenda(t) } catch (e) { res = { status: 'erro', erro: String((e as Error)?.message || e) } }
    if (res.status === 'erro' && t.tentativas < 3) {
      await admin.from('ia_fila').update({ status: 'pendente', erro: res.erro, executar_em: new Date(Date.now() + 3600 * 1000).toISOString() }).eq('id', t.id)
    } else {
      await admin.from('ia_fila').update({ status: res.status, erro: res.erro, feito_em: new Date().toISOString() }).eq('id', t.id)
      if (res.status === 'feito') feitas++
    }
  }
  if (await rpc('integ_srv_cron_pode', { p_chave: 'limpeza', p_segundos: 6 * 3600 })) await rpc('integ_srv_limpeza', {}).catch(console.error)
  return { ok: true, tarefas: tarefas.length, feitas }
}

// ─── Ações do CRM ────────────────────────────────────────────────────────────
type Ctx = { user_id: string; nome: string; empresa_id: string | null; empresa_nome: string; gestor: boolean; plataforma: boolean; ia_liberada?: boolean; perms: Record<string, boolean> }
function exigirEmpresa(ctx: Ctx) { if (!ctx.empresa_id) throw new Falha(403, 'Sua conta não está ligada a uma empresa.') ; return ctx.empresa_id }
function exigirGestor(ctx: Ctx) { exigirEmpresa(ctx); if (!ctx.gestor) throw new Falha(403, 'Somente o gestor da empresa pode fazer isso.') }
function exigirPerm(ctx: Ctx, p: string, msg?: string) {
  exigirEmpresa(ctx)
  if (p.startsWith('ia_') && !ctx.ia_liberada) throw new Falha(403, 'A IA de atendimento é exclusiva do plano Master. Fale com a Evolux para liberar.')
  if (!ctx.gestor && !ctx.perms?.[p]) throw new Falha(403, msg || 'Você não tem permissão para isso.')
}
async function leadVisivel(ctx: Ctx, id: unknown) {
  const l = await rpc('integ_srv_lead', { p_user: ctx.user_id, p_lead: String(id || '') })
  if (!l) throw new Falha(404, 'Lead não encontrado ou fora da sua visão.')
  return l as any
}
function retornoValido(v: unknown, origem: string | null) {
  try {
    const u = new URL(String(v || ''))
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error()
    if (origem && origem !== 'null' && new URL(origem).origin !== u.origin) throw new Error()
    return u.origin + u.pathname
  } catch {
    throw new Falha(400, 'Endereço de retorno inválido.')
  }
}
async function assinarState(dados: Record<string, unknown>) {
  const corpo = b64url(enc.encode(JSON.stringify(dados)))
  return corpo + '.' + b64url(await hmac(APP_SECRET, 'oauth:' + corpo))
}

const ACOES: Record<string, (ctx: Ctx, c: any, req: Request) => Promise<unknown>> = {
  // Situação da configuração no servidor (para a tela de Configurações apontar o que falta)
  async status(ctx) {
    const base: any = { meta_app: !!(APP_ID && APP_SECRET), login_config: !!LOGIN_CONFIG_ID, openai: !!OPENAI_KEY, modelo_padrao: MODELO_PADRAO, versao_graph: GRAPH_VERSAO }
    if (ctx.gestor || ctx.plataforma) { base.webhook_url = URL_WEBHOOK; base.callback_url = URL_CALLBACK }
    if (ctx.plataforma) base.verify_token = APP_SECRET ? await tokenVerificacao() : null
    return base
  },

  // ── Meta ──
  async meta_login_url(ctx, c, req) {
    exigirGestor(ctx)
    if (!APP_ID || !APP_SECRET) throw new Falha(400, 'Faltam os segredos META_APP_ID e META_APP_SECRET no Supabase.')
    const retorno = retornoValido(c.retorno, req.headers.get('origin'))
    const state = await assinarState({ e: ctx.empresa_id, u: ctx.user_id, r: retorno, x: Math.floor(Date.now() / 1000) + 900, n: crypto.randomUUID() })
    const p = new URLSearchParams({ client_id: APP_ID, redirect_uri: URL_CALLBACK, state, response_type: 'code' })
    if (LOGIN_CONFIG_ID) { p.set('config_id', LOGIN_CONFIG_ID); p.set('override_default_response_type', 'true') } else p.set('scope', ESCOPOS.join(','))
    return { url: `${DIALOGO_BASE}/${GRAPH_VERSAO}/dialog/oauth?${p}` }
  },
  async meta_atualizar(ctx) {
    exigirGestor(ctx)
    const emp = ctx.empresa_id as string
    const m = await exigirConexaoMeta(emp)
    const token = m.token as string
    const [eu, contas, paginas, dbg] = await Promise.all([
      graph('me', { token, params: { fields: 'id,name' } }),
      graph('me/adaccounts', { token, params: { fields: 'id,name,currency,account_status,business{name}', limit: 200 } }),
      graph('me/accounts', { token, params: { fields: 'id,name,access_token,tasks', limit: 200 } }),
      graph('debug_token', { token: tokenApp(), params: { input_token: token } }),
    ])
    if (!eu.ok && eu.codigo === 190) {
      await admin.from('integ_meta').update({ ultimo_erro: eu.erro }).eq('empresa_id', emp)
      throw new Falha(400, eu.erro || 'Conexão expirada.')
    }
    const avisos: string[] = []
    if (!contas.ok) avisos.push('Contas de anúncio: ' + contas.erro)
    if (!paginas.ok) avisos.push('Páginas: ' + paginas.erro)
    const listaContas = ((contas.data?.data || []) as any[]).map((a) => ({
      id: String(a.id), nome: a.name || a.id, moeda: a.currency || 'BRL', ativa: Number(a.account_status) === 1, empresa: a.business?.name || '',
    }))
    // WhatsApp: contas liberadas no login (alvos das permissões)
    const alvos = new Set<string>()
    for (const g of dbg.data?.data?.granular_scopes || []) {
      if (String(g?.scope || '').startsWith('whatsapp_business')) for (const t of g?.target_ids || []) alvos.add(String(t))
    }
    const wabas: any[] = []
    for (const id of alvos) {
      const [w, ns] = await Promise.all([
        graph(id, { token, params: { fields: 'id,name' } }),
        graph(`${id}/phone_numbers`, { token, params: { fields: 'id,display_phone_number,verified_name,quality_rating', limit: 50 } }),
      ])
      wabas.push({ id, nome: w.data?.name || id, numeros: ((ns.data?.data || []) as any[]).map((n) => ({ id: String(n.id), numero: n.display_phone_number, nome: n.verified_name, qualidade: n.quality_rating })) })
    }
    const d = dbg.data?.data || {}
    const contaPadrao = listaContas.some((a) => a.id === m.conta_padrao) ? m.conta_padrao : (listaContas.find((a) => a.ativa) || listaContas[0])?.id || null
    await admin.from('integ_meta').update({
      meta_user_id: eu.data?.id || m.meta_user_id, meta_user_nome: eu.data?.name || m.meta_user_nome,
      contas_anuncio: listaContas, conta_padrao: contaPadrao, wabas, descoberto_em: new Date().toISOString(),
      escopos: Array.isArray(d.scopes) ? d.scopes : m.escopos, expira_em: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : (d.expires_at === 0 ? null : m.expira_em),
      ultimo_erro: null, atualizado_em: new Date().toISOString(),
    }).eq('empresa_id', emp)
    // Páginas: atualiza nome/token e mantém a configuração de cada uma
    if (paginas.ok) {
      const lista = ((paginas.data?.data || []) as any[]).filter((p) => p.access_token)
      if (lista.length) {
        await admin.from('integ_meta_paginas').upsert(lista.map((p) => ({
          empresa_id: emp, page_id: String(p.id), nome: p.name || p.id, page_token: p.access_token, atualizado_em: new Date().toISOString(),
        })), { onConflict: 'empresa_id,page_id' })
      }
      const ids = lista.map((p) => String(p.id))
      const { data: antigas } = await admin.from('integ_meta_paginas').select('page_id').eq('empresa_id', emp)
      const sair = ((antigas || []) as any[]).map((p) => p.page_id).filter((id) => !ids.includes(id))
      if (sair.length) await admin.from('integ_meta_paginas').delete().eq('empresa_id', emp).in('page_id', sair)
    }
    // Números de WhatsApp encontrados entram sozinhos (o primeiro vira o padrão)
    let novosNumeros = 0
    const { data: atuais } = await admin.from('integ_wa_numeros').select('phone_number_id,empresa_id')
    const donos = new Map(((atuais || []) as any[]).map((n) => [n.phone_number_id, n.empresa_id]))
    const daEmpresa = ((atuais || []) as any[]).filter((n) => n.empresa_id === emp).length
    for (const w of wabas) {
      for (const n of w.numeros) {
        const dono = donos.get(n.id)
        if (dono && dono !== emp) { avisos.push(`O número ${n.numero} já está ligado a outra empresa no CRM.`); continue }
        if (dono) await admin.from('integ_wa_numeros').update({ numero: n.numero, nome_verificado: n.nome, qualidade: n.qualidade, waba_id: w.id }).eq('phone_number_id', n.id)
        else {
          await admin.from('integ_wa_numeros').insert({ empresa_id: emp, phone_number_id: n.id, waba_id: w.id, numero: n.numero, nome_verificado: n.nome, qualidade: n.qualidade, padrao: daEmpresa + novosNumeros === 0 })
          novosNumeros++
        }
      }
      const sub = await graph(`${w.id}/subscribed_apps`, { metodo: 'POST', token })
      if (!sub.ok) avisos.push(`Avisos do WhatsApp (${w.nome}): ${sub.erro}`)
    }
    if (wabas.length) {
      const app = await garantirAssinaturaApp('whatsapp_business_account', 'messages')
      if (!app.ok) avisos.push('Assinatura dos avisos do WhatsApp no app: ' + app.erro)
    }
    return { ok: true, contas: listaContas.length, paginas: paginas.ok ? (paginas.data?.data || []).length : 0, numeros_novos: novosNumeros, wabas: wabas.length, avisos }
  },
  async meta_desconectar(ctx) {
    exigirGestor(ctx)
    const emp = ctx.empresa_id as string
    const { data: pags } = await admin.from('integ_meta_paginas').select('page_id,page_token,leads_ativo').eq('empresa_id', emp)
    for (const p of (pags || []) as any[]) {
      if (p.leads_ativo && p.page_token) await graph(`${p.page_id}/subscribed_apps`, { metodo: 'DELETE', token: p.page_token })
    }
    await admin.from('integ_meta_paginas').delete().eq('empresa_id', emp)
    await admin.from('integ_meta').delete().eq('empresa_id', emp)
    await atividade(emp, ctx.user_id, 'ti-plug-off', `${ctx.nome} desconectou a conta da Meta`)
    return { ok: true }
  },
  async meta_conta_padrao(ctx, c) {
    exigirGestor(ctx)
    const m = await exigirConexaoMeta(ctx.empresa_id as string)
    const conta = String(c.conta || '')
    if (!(m.contas_anuncio || []).some((a: any) => a.id === conta)) throw new Falha(400, 'Conta de anúncio não encontrada.')
    await admin.from('integ_meta').update({ conta_padrao: conta }).eq('empresa_id', ctx.empresa_id)
    return { ok: true }
  },
  async meta_pagina(ctx, c) {
    exigirGestor(ctx)
    const emp = ctx.empresa_id as string
    const { data: pg } = await admin.from('integ_meta_paginas').select('*').eq('empresa_id', emp).eq('page_id', String(c.page_id || '')).maybeSingle()
    const p: any = pg
    if (!p) throw new Falha(404, 'Página não encontrada. Clique em "Atualizar lista".')
    // só aceita pessoas ativas desta empresa
    const membros = async (ids: unknown[]) => {
      const out = [...new Set((ids || []).map((x) => String(x)).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))]
      if (!out.length) return []
      const { data } = await admin.from('profiles').select('id,ativo').eq('empresa_id', emp).in('id', out)
      return ((data || []) as any[]).filter((x) => x.ativo !== false).map((x) => String(x.id))
    }
    const mud: any = { atualizado_em: new Date().toISOString() }
    if ('responsavel_id' in c) {
      const r = c.responsavel_id ? (await membros([c.responsavel_id]))[0] : null
      if (c.responsavel_id && !r) throw new Falha(400, 'Responsável inválido.')
      mud.responsavel_id = r || null
    }
    if ('rodizio_ids' in c) mud.rodizio_ids = await membros(Array.isArray(c.rodizio_ids) ? c.rodizio_ids : [])
    if ('etapa_inicial' in c) mud.etapa_inicial = ETAPAS.slice(0, 5).includes(c.etapa_inicial) ? c.etapa_inicial : 'Novo lead'
    if ('tipo_padrao' in c) mud.tipo_padrao = ['Imóvel', 'Automóvel', 'Moto', 'Serviço'].includes(c.tipo_padrao) ? c.tipo_padrao : null
    if ('ia_primeiro_contato' in c) mud.ia_primeiro_contato = !!c.ia_primeiro_contato
    const avisos: string[] = []
    if ('leads_ativo' in c) {
      const ligar = !!c.leads_ativo
      if (ligar && !p.leads_ativo) {
        const sub = await graph(`${p.page_id}/subscribed_apps`, { metodo: 'POST', token: p.page_token, params: { subscribed_fields: 'leadgen' } })
        if (!sub.ok) throw new Falha(400, 'A Meta não deixou ligar os leads desta página: ' + sub.erro)
        const app = await garantirAssinaturaApp('page', 'leadgen')
        if (!app.ok) avisos.push('Assinatura dos avisos de leads no app: ' + app.erro)
      } else if (!ligar && p.leads_ativo) {
        await graph(`${p.page_id}/subscribed_apps`, { metodo: 'DELETE', token: p.page_token })
      }
      mud.leads_ativo = ligar
    }
    await admin.from('integ_meta_paginas').update(mud).eq('empresa_id', emp).eq('page_id', p.page_id)
    return { ok: true, avisos }
  },

  // ── Gerenciador de Anúncios ──
  async anuncios(ctx, c) {
    exigirPerm(ctx, 'anuncios_view', 'Você não tem acesso ao Gerenciador de Anúncios.')
    const m = await exigirConexaoMeta(ctx.empresa_id as string)
    const contas: any[] = m.contas_anuncio || []
    const conta = contas.find((a) => a.id === String(c.conta || '')) || contas.find((a) => a.id === m.conta_padrao) || contas[0]
    if (!conta) throw new Falha(400, 'Nenhuma conta de anúncio encontrada nesta conexão. Clique em "Atualizar lista" em Configurações → Meta.')
    const periodos = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month']
    const periodo = periodos.includes(c.periodo) ? c.periodo : 'last_7d'
    const campos = 'spend,impressions,reach,clicks,inline_link_clicks,ctr,cpm,actions'
    const token = m.token as string
    const [total, diario, lista, porCampanha] = await Promise.all([
      graph(`${conta.id}/insights`, { token, params: { fields: campos, date_preset: periodo } }),
      graph(`${conta.id}/insights`, { token, params: { fields: 'spend,impressions,clicks,actions', date_preset: periodo, time_increment: 1, limit: 100 } }),
      graph(`${conta.id}/campaigns`, { token, params: { fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget', limit: 200 } }),
      graph(`${conta.id}/insights`, { token, params: { level: 'campaign', fields: 'campaign_id,campaign_name,' + campos, date_preset: periodo, limit: 200 } }),
    ])
    const falhou = [total, lista].find((r) => !r.ok)
    if (falhou) throw new Falha(400, falhou.erro || 'Não consegui ler os anúncios.')
    const acao = (acts: any[], tipos: string[]) => {
      let v = 0
      for (const t of tipos) { const a = (acts || []).find((x) => x.action_type === t); if (a) v = Math.max(v, Number(a.value) || 0) }
      return v
    }
    const resumo = (d: any) => ({
      investido: Number(d?.spend) || 0, impressoes: Number(d?.impressions) || 0, alcance: Number(d?.reach) || 0,
      cliques: Number(d?.clicks) || 0, cliques_link: Number(d?.inline_link_clicks) || acao(d?.actions, ['link_click']),
      ctr: Number(d?.ctr) || 0, cpm: Number(d?.cpm) || 0,
      leads: acao(d?.actions, ['lead', 'onsite_conversion.lead_grouped', 'leadgen_grouped', 'offsite_conversion.fb_pixel_lead']),
      conversas: acao(d?.actions, ['onsite_conversion.messaging_conversation_started_7d']),
    })
    const insights = new Map(((porCampanha.data?.data || []) as any[]).map((r) => [String(r.campaign_id), resumo(r)]))
    const campanhas = ((lista.data?.data || []) as any[]).map((cp) => ({
      id: String(cp.id), nome: cp.name, status: cp.effective_status || cp.status, objetivo: cp.objective || '',
      orcamento_diario: cp.daily_budget ? Number(cp.daily_budget) / 100 : null, orcamento_total: cp.lifetime_budget ? Number(cp.lifetime_budget) / 100 : null,
      ...(insights.get(String(cp.id)) || resumo({})),
    })).filter((cp) => cp.investido > 0 || cp.status === 'ACTIVE')
      .sort((a, b) => b.investido - a.investido || a.nome.localeCompare(b.nome))
    return {
      conta: { id: conta.id, nome: conta.nome, moeda: conta.moeda || 'BRL' }, periodo,
      total: resumo(total.data?.data?.[0] || {}),
      diario: ((diario.data?.data || []) as any[]).map((d) => ({ dia: d.date_start, ...resumo(d) })),
      campanhas,
    }
  },

  // ── WhatsApp: números e modelos ──
  async wa_numero_salvar(ctx, c) {
    exigirGestor(ctx)
    const emp = ctx.empresa_id as string
    const pnid = digitos(c.phone_number_id)
    const waba = digitos(c.waba_id)
    const tokenNovo = String(c.token || '').trim()
    if (!pnid || !waba) throw new Falha(400, 'Informe o ID do número (Phone Number ID) e o ID da conta (WABA ID).')
    const { data: ex } = await admin.from('integ_wa_numeros').select('*').eq('phone_number_id', pnid).maybeSingle()
    const existente: any = ex
    if (existente && existente.empresa_id !== emp) throw new Falha(409, 'Este número já está ligado a outra empresa no CRM.')
    const token = tokenNovo || existente?.token || (await conexaoMeta(emp))?.token
    if (!token) throw new Falha(400, 'Informe o token permanente (usuário do sistema) ou conecte a Meta primeiro.')
    const info = await graph(pnid, { token, params: { fields: 'id,display_phone_number,verified_name,quality_rating' } })
    if (!info.ok) throw new Falha(400, 'Não consegui acessar este número com esse token: ' + info.erro)
    const avisos: string[] = []
    const sub = await graph(`${waba}/subscribed_apps`, { metodo: 'POST', token })
    if (!sub.ok) avisos.push('Não consegui ligar os avisos do WhatsApp nesta conta: ' + sub.erro)
    const app = await garantirAssinaturaApp('whatsapp_business_account', 'messages')
    if (!app.ok) avisos.push('Assinatura dos avisos do WhatsApp no app: ' + app.erro)
    const { count } = await admin.from('integ_wa_numeros').select('id', { count: 'exact', head: true }).eq('empresa_id', emp)
    const linha: any = {
      empresa_id: emp, phone_number_id: pnid, waba_id: waba, numero: info.data?.display_phone_number || null,
      nome_verificado: info.data?.verified_name || null, qualidade: info.data?.quality_rating || null, ativo: true,
      atualizado_em: new Date().toISOString(),
    }
    if (tokenNovo) linha.token = tokenNovo
    if (!existente) linha.padrao = !count
    await admin.from('integ_wa_numeros').upsert(linha, { onConflict: 'phone_number_id' })
    cacheModelos.delete(waba)
    return { ok: true, numero: linha.numero, nome: linha.nome_verificado, avisos }
  },
  async wa_numero_atualizar(ctx, c) {
    exigirGestor(ctx)
    const emp = ctx.empresa_id as string
    const { data: n } = await admin.from('integ_wa_numeros').select('id').eq('id', String(c.id || '')).eq('empresa_id', emp).maybeSingle()
    if (!n) throw new Falha(404, 'Número não encontrado.')
    const mud: any = { atualizado_em: new Date().toISOString() }
    if ('dono_id' in c) {
      if (c.dono_id) {
        const { data: p } = await admin.from('profiles').select('id').eq('id', String(c.dono_id)).eq('empresa_id', emp).maybeSingle()
        if (!p) throw new Falha(400, 'Usuário inválido.')
      }
      mud.dono_id = c.dono_id || null
    }
    if ('ativo' in c) mud.ativo = !!c.ativo
    if ('padrao' in c && c.padrao) {
      await admin.from('integ_wa_numeros').update({ padrao: false }).eq('empresa_id', emp)
      mud.padrao = true
    }
    await admin.from('integ_wa_numeros').update(mud).eq('id', String(c.id))
    return { ok: true }
  },
  async wa_numero_remover(ctx, c) {
    exigirGestor(ctx)
    await admin.from('integ_wa_numeros').delete().eq('id', String(c.id || '')).eq('empresa_id', ctx.empresa_id)
    return { ok: true }
  },
  async wa_modelos(ctx, c) {
    exigirPerm(ctx, 'whatsapp_send')
    const num = await numeroParaEnviar(ctx.empresa_id as string, { phone_number_id: c.phone_number_id || undefined })
    if (!num) throw new Falha(400, 'Nenhum número de WhatsApp configurado.')
    const lista = await listarModelos(num, !!c.renovar)
    return { modelos: lista.sort((a: any, b: any) => (a.status === 'APPROVED' ? 0 : 1) - (b.status === 'APPROVED' ? 0 : 1) || a.nome.localeCompare(b.nome)) }
  },
  async wa_criar_modelos(ctx, c) {
    exigirGestor(ctx)
    const num = await numeroParaEnviar(ctx.empresa_id as string, { phone_number_id: c.phone_number_id || undefined })
    if (!num) throw new Falha(400, 'Nenhum número de WhatsApp configurado.')
    const existentes = new Set((await listarModelos(num, true)).map((m: any) => m.nome))
    const empresa = ctx.empresa_nome || 'Evolux'
    const out: any[] = []
    for (const s of MODELOS_SUGERIDOS) {
      if (existentes.has(s.name)) { out.push({ nome: s.name, situacao: 'já existe' }); continue }
      const exemplo = s.exemplo.map((e) => (e === 'Evolux' ? empresa : e))
      const r = await graph(`${num.waba_id}/message_templates`, {
        metodo: 'POST', token: num.token_efetivo,
        corpo: { name: s.name, language: 'pt_BR', category: s.category, components: [{ type: 'BODY', text: s.texto, example: { body_text: [exemplo] } }] },
      })
      out.push({ nome: s.name, situacao: r.ok ? 'enviado para aprovação' : 'erro: ' + r.erro })
    }
    cacheModelos.delete(num.waba_id)
    return { modelos: out }
  },

  // ── WhatsApp: conversas ──
  async wa_enviar(ctx, c) {
    exigirPerm(ctx, 'whatsapp_send', 'Você não tem permissão para enviar mensagens pelo CRM.')
    const emp = ctx.empresa_id as string
    const lead = await leadVisivel(ctx, c.lead_id)
    const texto = textoLimpo(c.texto, 4096)
    if (!texto) throw new Falha(400, 'Escreva a mensagem.')
    const ult = await ultimaEntrada(lead.id)
    if (!janelaAberta(ult)) {
      throw new Falha(409, 'Faz mais de 24 horas que o cliente não manda mensagem. Envie um modelo aprovado.', { codigo: 'fora_da_janela' })
    }
    // a janela de 24h vale para o número em que o cliente escreveu: a resposta sai dele
    const num = await numeroParaEnviar(emp, { phone_number_id: ult.phone_number_id })
    if (!num) throw new Falha(400, 'O número em que o cliente escreveu não está mais ativo no CRM.')
    const env = await waTexto(num, ult.contato, texto)
    const msg = await gravarSaida({
      empresa_id: emp, lead_id: lead.id, phone_number_id: num.phone_number_id, contato: ult.contato, direcao: 'saida', tipo: 'texto',
      conteudo: texto, wa_id: env.data?.messages?.[0]?.id || null, status: env.ok ? 'enviada' : 'falhou', erro: env.ok ? null : env.erro,
      enviado_por: ctx.user_id, ia: false,
    })
    if (!env.ok) throw new Falha(400, env.erro || 'O WhatsApp recusou a mensagem.', { mensagem: msg })
    await humanoAssumiu(ctx, lead)
    if (lead.etapa === 'Novo lead') await rpc('integ_srv_lead_contatado', { p_lead: lead.id, p_quem: primeiroNome(ctx.nome) || 'WhatsApp' }).catch(console.error)
    return { ok: true, mensagem: msg }
  },
  async wa_enviar_modelo(ctx, c) {
    exigirPerm(ctx, 'whatsapp_send', 'Você não tem permissão para enviar mensagens pelo CRM.')
    const emp = ctx.empresa_id as string
    const lead = await leadVisivel(ctx, c.lead_id)
    const ult = await ultimaEntrada(lead.id)
    const para = ult?.contato || telefoneWhatsApp(lead.telefone)
    if (!para) throw new Falha(400, 'Este lead não tem telefone.')
    const num = await numeroParaEnviar(emp, { phone_number_id: c.phone_number_id || undefined, lead: lead.id, dono: ctx.user_id })
    if (!num) throw new Falha(400, 'Nenhum número de WhatsApp configurado.')
    const modelo = await acharModelo(num, String(c.modelo || ''), c.idioma || undefined)
    const valores = Array.isArray(c.valores) ? c.valores.map((v: unknown) => String(v ?? '')) : valoresDoLead(c.campos || [], lead, ctx.empresa_nome)
    const env = await waModelo(num, para, modelo, valores)
    const msg = await gravarSaida({
      empresa_id: emp, lead_id: lead.id, phone_number_id: num.phone_number_id, contato: para, direcao: 'saida', tipo: 'template',
      template_nome: modelo.nome, conteudo: renderizarModelo(modelo, valores), wa_id: env.data?.messages?.[0]?.id || null,
      status: env.ok ? 'enviada' : 'falhou', erro: env.ok ? null : env.erro, enviado_por: ctx.user_id, ia: false,
    })
    if (!env.ok) throw new Falha(400, env.erro || 'O WhatsApp recusou a mensagem.', { mensagem: msg })
    await humanoAssumiu(ctx, lead)
    if (lead.etapa === 'Novo lead') await rpc('integ_srv_lead_contatado', { p_lead: lead.id, p_quem: primeiroNome(ctx.nome) || 'WhatsApp' }).catch(console.error)
    return { ok: true, mensagem: msg }
  },
  async wa_disparo(ctx, c) {
    exigirPerm(ctx, 'whatsapp_bulk', 'Você não tem permissão para disparo em massa.')
    const emp = ctx.empresa_id as string
    const ids = [...new Set((Array.isArray(c.lead_ids) ? c.lead_ids : []).map((x: unknown) => String(x)))].slice(0, 1000)
    if (!ids.length) throw new Falha(400, 'Selecione os leads.')
    const num = await numeroParaEnviar(emp, { phone_number_id: c.phone_number_id || undefined, dono: ctx.user_id })
    if (!num) throw new Falha(400, 'Nenhum número de WhatsApp configurado.')
    const modelo = await acharModelo(num, String(c.modelo || ''), c.idioma || undefined)
    const campos: string[] = (Array.isArray(c.campos) ? c.campos : []).map((x: unknown) => String(x ?? '')).slice(0, modelo.variaveis.length)
    while (campos.length < modelo.variaveis.length) campos.push('primeiro_nome')
    const leads = ((await rpc('integ_srv_leads', { p_user: ctx.user_id, p_ids: ids })) || []) as any[]
    const { data: pararam } = await admin.from('ia_conversas').select('lead_id').eq('empresa_id', emp).eq('status', 'encerrada').in('lead_id', leads.map((l) => l.id))
    const semMensagens = new Set(((pararam || []) as any[]).map((x) => String(x.lead_id)))
    const comTel = leads.filter((l) => telefoneWhatsApp(l.telefone) && !semMensagens.has(String(l.id)))
    if (!comTel.length) throw new Falha(400, 'Nenhum dos leads selecionados tem telefone válido.')
    const { data: disp, error } = await admin.from('wa_disparos').insert({
      empresa_id: emp, criado_por: ctx.user_id, criado_por_nome: ctx.nome, phone_number_id: num.phone_number_id,
      template_nome: modelo.nome, template_idioma: modelo.idioma, variaveis: campos, total: comTel.length, status: 'enviando',
    }).select('*').single()
    if (error || !disp) throw new Falha(500, 'Não consegui criar o disparo.')
    const d: any = disp
    emSegundoPlano((async () => {
      let enviados = 0
      let falhas = 0
      const erros: Record<string, number> = {}
      await emLotes(comTel, 8, async (lead) => {
        const valores = valoresDoLead(campos, lead, ctx.empresa_nome)
        const para = telefoneWhatsApp(lead.telefone)
        const msg = await gravarSaida({
          empresa_id: emp, lead_id: lead.id, phone_number_id: num.phone_number_id, contato: para, direcao: 'saida', tipo: 'template',
          template_nome: modelo.nome, conteudo: renderizarModelo(modelo, valores), status: 'pendente', enviado_por: ctx.user_id, ia: false, disparo_id: d.id,
        })
        const env = await waModelo(num, para, modelo, valores)
        if (env.ok) enviados++
        else { falhas++; erros[env.erro || 'erro'] = (erros[env.erro || 'erro'] || 0) + 1 }
        if (msg?.id) {
          await admin.from('wa_mensagens').update(env.ok
            ? { wa_id: env.data?.messages?.[0]?.id || null, status: 'enviada' }
            : { status: 'falhou', erro: env.erro }).eq('id', msg.id)
        }
        if ((enviados + falhas) % 15 === 0) await admin.from('wa_disparos').update({ enviados, falhas }).eq('id', d.id)
      })
      const resumoErros = Object.entries(erros).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, n]) => `${n}× ${e}`).join(' | ') || null
      await admin.from('wa_disparos').update({
        enviados, falhas, status: enviados ? 'concluido' : 'erro', erro: resumoErros, concluido_em: new Date().toISOString(),
      }).eq('id', d.id)
      await atividade(emp, ctx.user_id, 'ti-brand-whatsapp', `Disparo "${modelo.nome}": ${enviados} enviada${enviados !== 1 ? 's' : ''}${falhas ? `, ${falhas} com erro` : ''}`)
    })())
    const pararamNaLista = leads.filter((l) => semMensagens.has(String(l.id))).length
    return {
      ok: true, disparo_id: d.id, total: comTel.length, pediram_para_parar: pararamNaLista,
      sem_telefone: leads.length - comTel.length - pararamNaLista, fora_da_visao: ids.length - leads.length,
    }
  },

  // ── IA ──
  async ia_testar(ctx, c) {
    exigirPerm(ctx, 'ia_manage', 'Somente quem edita os roteiros pode testar a IA.')
    const tipo = c.tipo === 'pos_venda' ? 'pos_venda' : 'primeiro_atendimento'
    const roteiro = textoLimpo(c.roteiro, 12000)
    const modelo = modeloValido(c.modelo) || MODELO_PADRAO
    let lead: any
    if (c.lead_id) lead = await leadVisivel(ctx, c.lead_id)
    else {
      lead = {
        nome: textoLimpo(c.nome, 80) || 'Cliente Teste', tipo: ['Imóvel', 'Automóvel', 'Moto', 'Serviço'].includes(c.tipo_bem) ? c.tipo_bem : 'Imóvel',
        credito: Number(c.credito) || 0, etapa: tipo === 'pos_venda' ? FECHADO : 'Novo lead', responsavel_nome: ctx.nome,
      }
    }
    const historico = (Array.isArray(c.historico) ? c.historico : []).slice(-20).map((m: any) => ({
      role: m?.de === 'ia' ? 'assistant' : 'user', content: textoLimpo(m?.texto, 2000) || '...',
    }))
    const mensagem = textoLimpo(c.mensagem, 2000)
    if (!mensagem) throw new Falha(400, 'Escreva a mensagem do cliente.')
    historico.push({ role: 'user', content: mensagem })
    const r = await perguntarIA(modelo, [{ role: 'system', content: montarSistema(tipo, roteiro, { empresa: ctx.empresa_nome || 'Evolux', lead }) }, ...historico])
    if (!r.ok) throw new Falha(400, r.erro)
    const marcas = lerMarcas(r.texto)
    return { resposta: marcas.texto, transferir: marcas.transferir, encerrar: marcas.encerrar, tokens: r.uso, custo_usd: custoUSD(modelo, r.uso), modelo }
  },
  ia_padrao() {
    return Promise.resolve({ roteiros: ROTEIRO_PADRAO, modelos_sugeridos: MODELOS_SUGERIDOS.map((m) => ({ nome: m.name, campos: m.campos, categoria: m.category, texto: m.texto })) })
  },
  async ia_assumir(ctx, c) {
    exigirPerm(ctx, 'whatsapp_send')
    const lead = await leadVisivel(ctx, c.lead_id)
    await humanoAssumiu(ctx, lead)
    return { ok: true }
  },
  async ia_devolver(ctx, c) {
    exigirPerm(ctx, 'whatsapp_send')
    const lead = await leadVisivel(ctx, c.lead_id)
    await admin.from('ia_conversas').update({ status: 'ativa', assumido_por: null, motivo: null, atualizado_em: new Date().toISOString() })
      .eq('empresa_id', ctx.empresa_id).eq('lead_id', lead.id).eq('status', 'humano')
    return { ok: true }
  },
}

async function acaoCRM(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Falha(401, 'Entre no CRM de novo.')
  const { data: u, error } = await admin.auth.getUser(token)
  if (error || !u?.user) throw new Falha(401, 'Sessão expirada. Entre no CRM de novo.')
  const ctx = (await rpc('integ_srv_contexto', { p_user: u.user.id })) as Ctx | null
  if (!ctx) throw new Falha(403, 'Usuário sem acesso ao CRM.')
  const corpo = await req.json().catch(() => ({}))
  const f = ACOES[String(corpo?.acao || '')]
  if (!f) throw new Falha(400, 'Ação desconhecida.')
  return json(200, await f(ctx, corpo, req))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  try {
    if (req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe') {
        const ok = APP_SECRET && url.searchParams.get('hub.verify_token') === (await tokenVerificacao())
        return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('token inválido', { status: 403 })
      }
      return new Response('Evolux CRM — integrações no ar.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    if (req.method !== 'POST') return new Response('método não aceito', { status: 405 })
    if (url.searchParams.get('tarefa') === 'fila') return json(200, await processarFila())
    if (req.headers.get('x-hub-signature-256')) return await webhook(req)
    return await acaoCRM(req)
  } catch (e) {
    if (e instanceof Falha) return json(e.status, { erro: e.message, ...e.extra })
    console.error('[crm-integracoes]', e)
    return json(500, { erro: 'Erro interno: ' + String((e as Error)?.message || e) })
  }
})

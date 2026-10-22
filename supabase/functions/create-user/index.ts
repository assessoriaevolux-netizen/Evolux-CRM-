// create-user — cadastra (ou reativa) um usuário da empresa de quem está logado.
// Todas as regras de permissão e de hierarquia ficam no banco
// (função crm_srv_criar_membro): quem chama só cria cargos ABAIXO do seu,
// sempre na própria empresa, e nunca cargos de plataforma.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function traduz(msg: string) {
  const m = (msg || '').toLowerCase()
  if (m.includes('already') || m.includes('exists') || m.includes('registered')) return 'Este e-mail já está cadastrado.'
  if (m.includes('password')) return 'Senha inválida (mínimo 6 caracteres).'
  if (m.includes('email')) return 'E-mail inválido.'
  return msg
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim()
    if (!token) return json(401, { error: 'Não autorizado.' })
    const { data: { user }, error: userErr } = await anon.auth.getUser(token)
    if (userErr || !user) return json(401, { error: 'Sessão expirada. Entre novamente no CRM.' })

    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const senha = String(body.senha || '')
    const nome = String(body.nome || '').trim()
    const hierarquia = body.hierarquia_id ? String(body.hierarquia_id) : null
    const equipe = body.equipe_id ? String(body.equipe_id) : null
    const meta = Number(body.meta) || 0

    if (!nome) return json(400, { error: 'Informe o nome.' })
    if (!email || !email.includes('@')) return json(400, { error: 'E-mail inválido.' })
    if (senha.length < 6) return json(400, { error: 'A senha deve ter pelo menos 6 caracteres.' })
    if (!hierarquia) return json(400, { error: 'Selecione a hierarquia.' })

    const params = { p_caller: user.id, p_email: email, p_nome: nome, p_hierarquia: hierarquia, p_equipe: equipe, p_meta: meta }

    // 1) Confere as permissões antes de criar qualquer coisa
    const pre = await admin.rpc('crm_srv_criar_membro', { ...params, p_user: null, p_validar_apenas: true })
    if (pre.error) return json(403, { error: pre.error.message })

    // 2) E-mail de alguém que foi removido antes? Reativa em vez de duplicar.
    const { data: existentes } = await admin.from('profiles').select('id, ativo').eq('email', email).limit(1)
    const existente = existentes && existentes[0]
    let userId: string
    if (existente) {
      if (existente.ativo !== false) return json(409, { error: 'Este e-mail já está cadastrado.' })
      const { error } = await admin.auth.admin.updateUserById(existente.id, {
        password: senha, ban_duration: 'none', user_metadata: { nome },
      })
      if (error) return json(400, { error: traduz(error.message) })
      userId = existente.id
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome },
      })
      if (error || !data?.user?.id) return json(400, { error: traduz(error?.message || 'Erro ao criar usuário.') })
      userId = data.user.id
    }

    // 3) Grava o perfil com cargo, empresa e equipe (o banco valida tudo de novo)
    const r = await admin.rpc('crm_srv_criar_membro', { ...params, p_user: userId, p_validar_apenas: false })
    if (r.error) {
      if (!existente) await admin.auth.admin.deleteUser(userId).catch(() => {})
      return json(400, { error: r.error.message })
    }

    return json(200, { ok: true, id: userId, reativado: !!existente })
  } catch (err) {
    return json(500, { error: String(err) })
  }
})

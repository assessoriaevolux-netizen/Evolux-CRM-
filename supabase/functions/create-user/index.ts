import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Cliente admin com service role (ignora RLS, pode criar usuários)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verifica token do usuário que está fazendo a requisição
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido ou sessão expirada. Faça login novamente.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Busca perfil do usuário que está criando
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, empresa_id')
      .eq('id', user.id)
      .single()

    const rolesPermitidos = ['master', 'superadmin', 'administrador', 'gestor', 'admin', 'representante', 'supervisor']
    if (!callerProfile || !rolesPermitidos.includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Sem permissão para cadastrar usuários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { email, senha, nome, role, meta, hierarquia_id, equipe_id } = body

    if (!email || !senha || !nome) {
      return new Response(JSON.stringify({ error: 'email, senha e nome são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cria o usuário no Auth do Supabase
    const { data: newAuth, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // confirma o email automaticamente
      user_metadata: { nome, role }
    })

    if (authErr) {
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const newUserId = newAuth.user?.id
    if (!newUserId) {
      return new Response(JSON.stringify({ error: 'Usuário criado sem ID retornado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cria/atualiza o perfil na tabela profiles
    const profilePayload: Record<string, unknown> = {
      id: newUserId,
      nome,
      email,
      role: role || 'vendedor',
      empresa_id: callerProfile.empresa_id,
      meta: meta || 0,
      updated_at: new Date().toISOString(),
    }
    if (hierarquia_id) profilePayload.hierarquia_id = hierarquia_id
    if (equipe_id) profilePayload.equipe_id = equipe_id

    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload)

    if (profileErr) {
      // Usuário foi criado no auth mas perfil falhou — tenta deletar do auth
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {})
      return new Response(JSON.stringify({ error: 'Erro ao criar perfil: ' + profileErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ id: newUserId, ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

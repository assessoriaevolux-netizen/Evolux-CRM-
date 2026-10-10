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
    // Cria cliente com service role (acesso total, ignora RLS)
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
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verifica se o usuário é master da empresa
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, empresa_id')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'master') {
      return new Response(JSON.stringify({ error: 'Apenas master pode atualizar outros usuários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { target_id, ...updates } = body

    if (!target_id) {
      return new Response(JSON.stringify({ error: 'target_id obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verifica que o target pertence à mesma empresa
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('empresa_id')
      .eq('id', target_id)
      .single()

    if (!targetProfile || targetProfile.empresa_id !== callerProfile.empresa_id) {
      return new Response(JSON.stringify({ error: 'Usuário não pertence à sua empresa' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Campos permitidos para atualização pelo admin
    const allowed = ['nome', 'role', 'foto_url', 'whatsapp', 'instagram', 'meta',
                     'equipe_id', 'hierarquia_id', 'perms', 'hperms', 'crm_id']
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in updates) payload[key] = updates[key]
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(payload)
      .eq('id', target_id)
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

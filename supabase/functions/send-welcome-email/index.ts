// send-welcome-email — e-mail de boas-vindas para quem acabou de ser cadastrado.
// Só quem está logado no CRM pode pedir, e só para alguém da própria empresa
// cadastrado há poucos minutos. A senha NUNCA vai no e-mail.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// Remetente: precisa ser de um domínio verificado no Resend (ex.: "Evolux CRM <crm@assessoriaevolux.com>").
// Sem isso o Resend só entrega para o e-mail do dono da conta.
const REMETENTE = Deno.env.get('EMAIL_REMETENTE') || 'Evolux CRM <onboarding@resend.dev>'
const CRM_URL = Deno.env.get('CRM_URL') || 'https://evolux-rho.vercel.app/index.html'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const resposta = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } })
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return resposta(401, { ok: false, error: 'Não autorizado.' })
    const { data: u, error: eu } = await admin.auth.getUser(token)
    if (eu || !u?.user) return resposta(401, { ok: false, error: 'Sessão expirada.' })

    const body = await req.json().catch(() => ({}))
    const alvoEmail = String(body.email || '').trim().toLowerCase()
    if (!alvoEmail.includes('@')) return resposta(400, { ok: false, error: 'E-mail inválido.' })

    const { data: eu2 } = await admin.from('profiles').select('empresa_id').eq('id', u.user.id).maybeSingle()
    const { data: alvo } = await admin.from('profiles').select('nome, email, empresa_id, ativo, updated_at').eq('email', alvoEmail).maybeSingle()
    if (!eu2?.empresa_id || !alvo || String(alvo.empresa_id) !== String(eu2.empresa_id) || alvo.ativo === false) {
      return resposta(403, { ok: false, error: 'Usuário não encontrado na sua empresa.' })
    }
    if (!alvo.updated_at || Date.now() - new Date(alvo.updated_at).getTime() > 30 * 60 * 1000) {
      return resposta(403, { ok: false, error: 'O e-mail de boas-vindas só é enviado logo após o cadastro.' })
    }
    const { data: emp } = await admin.from('empresas').select('nome').eq('id', alvo.empresa_id).maybeSingle()
    const nome = esc(alvo.nome || alvoEmail.split('@')[0])
    const email = esc(alvoEmail)
    const empresaNome = esc(emp?.nome || '')

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f5f2;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f2;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0a0a0a,#1a1a1a);padding:36px 40px;text-align:center">
            <div style="display:inline-flex;align-items:center;gap:12px">
              <div style="width:42px;height:42px;background:#1db954;border-radius:10px;display:inline-block;line-height:42px;text-align:center;font-size:22px;font-weight:900;color:#fff">E</div>
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Evolux <span style="color:#1db954">CRM</span></span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0a0a0a">Bem-vindo, ${nome}! 👋</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#4a5a4a;line-height:1.6">
              Seu acesso ao <strong>Evolux CRM</strong>${empresaNome ? ` da <strong>${empresaNome}</strong>` : ""} foi criado. Veja abaixo como entrar:
            </p>
            <!-- Credenciais -->
            <div style="background:#f7fbf7;border:1.5px solid #d8e2d8;border-radius:12px;padding:24px;margin-bottom:28px">
              <div style="font-size:11px;font-weight:700;color:#1db954;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Login (e-mail)</div>
              <div style="font-size:16px;font-weight:600;color:#0a0a0a">${email}</div>
              <div style="font-size:13px;color:#4a5a4a;margin-top:12px;line-height:1.6">A senha foi definida por quem fez o seu cadastro — peça a ela. Se preferir, clique em <strong>Esqueci minha senha</strong> na tela de entrada e crie a sua.</div>
            </div>
            <!-- CTA -->
            <div style="text-align:center;margin-bottom:28px">
              <a href="${CRM_URL}" style="display:inline-block;background:linear-gradient(135deg,#1db954,#17a348);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.2px">
                Acessar o CRM agora →
              </a>
            </div>
            <p style="margin:0;font-size:13px;color:#8a9a8a;line-height:1.6">
              Por segurança, troque a senha no primeiro acesso em <strong>Configurações → Segurança</strong>.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f7fbf7;border-top:1px solid #d8e2d8;padding:20px 40px;text-align:center">
            <p style="margin:0;font-size:12px;color:#8a9a8a">Este e-mail foi enviado automaticamente pelo Evolux CRM.<br>Dúvidas? Fale com seu administrador.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMETENTE, to: [alvoEmail], subject: `Seu acesso ao Evolux CRM foi criado, ${alvo.nome || ''}!`.trim(), html }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return resposta(400, { ok: false, error: data.message || 'Erro ao enviar e-mail' })
    return resposta(200, { ok: true, id: data.id })
  } catch (e) {
    return resposta(500, { ok: false, error: String((e as Error)?.message || e) })
  }
})

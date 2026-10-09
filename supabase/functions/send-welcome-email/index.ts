import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { nome, email, senha, empresaNome } = await req.json();

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
              Seu acesso ao <strong>Evolux CRM</strong>${empresaNome ? ` da <strong>${empresaNome}</strong>` : ""} foi criado. Use as credenciais abaixo para entrar:
            </p>
            <!-- Credenciais -->
            <div style="background:#f7fbf7;border:1.5px solid #d8e2d8;border-radius:12px;padding:24px;margin-bottom:28px">
              <div style="margin-bottom:16px">
                <div style="font-size:11px;font-weight:700;color:#1db954;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Login (e-mail)</div>
                <div style="font-size:16px;font-weight:600;color:#0a0a0a">${email}</div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:700;color:#1db954;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Senha</div>
                <div style="font-size:16px;font-weight:600;color:#0a0a0a;font-family:monospace;background:#edf7ed;padding:8px 12px;border-radius:8px;display:inline-block">${senha}</div>
              </div>
            </div>
            <!-- CTA -->
            <div style="text-align:center;margin-bottom:28px">
              <a href="https://evolux-rho.vercel.app/index.html" style="display:inline-block;background:linear-gradient(135deg,#1db954,#17a348);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:-0.2px">
                Acessar o CRM agora →
              </a>
            </div>
            <p style="margin:0;font-size:13px;color:#8a9a8a;line-height:1.6">
              Por segurança, recomendamos que você altere sua senha após o primeiro acesso em <strong>Configurações → Segurança</strong>.
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
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Evolux CRM <onboarding@resend.dev>",
        to: [email],
        subject: `🎉 Seu acesso ao Evolux CRM foi criado, ${nome}!`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erro ao enviar email");

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

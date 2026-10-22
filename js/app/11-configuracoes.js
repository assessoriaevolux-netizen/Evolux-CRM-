// ─── CONFIGURAÇÕES PROFISSIONAL ───────────────────────────────────────────────
const CFG_SECTIONS=[
  {id:'conta',label:'Configurações gerais',icon:'ti-settings',group:'CONTA'},
  {id:'admins',label:'Administradoras',icon:'ti-building-bank',group:null},
  {id:'usuarios',label:'Usuários',icon:'ti-users',group:null},
  {id:'equipes',label:'Equipes',icon:'ti-users-group',group:null},
  {id:'hierarquia',label:'Hierarquia',icon:'ti-sitemap',group:null},
  {id:'integracoes',label:'Integrações',icon:'ti-plug',group:'INTEGRAÇÕES'},
  {id:'facebook',label:'Meta / Facebook Ads',icon:'ti-brand-facebook',group:null},
  {id:'whatsapp-cfg',label:'WhatsApp Business',icon:'ti-brand-whatsapp',group:null},
  {id:'google',label:'Google Agenda',icon:'ti-brand-google',group:null},
  {id:'notificacoes',label:'Notificações',icon:'ti-bell',group:'SISTEMA'},
  {id:'aparencia',label:'Aparência',icon:'ti-palette',group:null},
  {id:'seguranca',label:'Segurança',icon:'ti-shield-lock',group:null},
];
let cfgActive='conta';
// Quem vê cada seção (as ações dentro de cada uma conferem a permissão de novo)
const CFG_PERM={
  admins:()=>can('simulador_models'),
  usuarios:()=>can('config_users')||can('equipe_view_sellers')||can('equipe_add'),
  equipes:()=>can('config_teams')||can('equipe_view'),
  hierarquia:()=>can('config_hierarchy')||can('config_permissions'),
  integracoes:()=>can('config_view'), facebook:()=>can('config_view'), 'whatsapp-cfg':()=>can('config_view'),
  google:()=>can('agenda_view'),
  notificacoes:()=>can('notif_manage'),
};
function cfgPodeVer(id){ const f=CFG_PERM[id]; return !f||!!f(); }
function cfgShow(id){cfgActive=cfgPodeVer(id)?id:'conta';renderConfig();}
function renderConfig(){
  const nav=document.getElementById('cfg-nav');
  if(!nav)return;
  if(!cfgPodeVer(cfgActive)) cfgActive='conta';
  let nh='';
  let grupoPendente=null;
  CFG_SECTIONS.forEach(s=>{
    if(s.group) grupoPendente=s.group;
    if(!cfgPodeVer(s.id)) return;
    if(grupoPendente){ nh+=`<div class="cfg-nav-group">${grupoPendente}</div>`; grupoPendente=null; }
    nh+=`<div class="cfg-nav-item${cfgActive===s.id?' active':''}" onclick="cfgShow('${s.id}')"><i class="ti ${s.icon}"></i>${s.label}</div>`;
  });
  nh+=`<div style="margin:6px 10px;border-top:1px solid var(--c2)"></div><div class="cfg-nav-item" onclick="fazerLogout()" style="color:#dc2626;margin-bottom:6px"><i class="ti ti-logout" style="color:#dc2626"></i>Sair</div>`;
  nav.innerHTML=nh;
  cfgRenderSection();
}
function cfgRenderSection(){
  const panel=document.getElementById('cfg-main-panel');
  if(!panel)return;
  const a=getAdmin();
  const demoBanner=`<div class="wa-demo-banner"><i class="ti ti-flask"></i>Modo demonstração — disponível após deploy com backend.</div>`;
  const toggleRow=(label,sub,checked=true)=>`<div class="cfg-toggle-row"><div><div class="cfg-toggle-label">${label}</div><div class="cfg-toggle-sub">${sub}</div></div><label class="cfg-toggle"><input type="checkbox"${checked?' checked':''}><span class="cfg-toggle-slider"></span></label></div>`;

  const sections={
    conta:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-settings" style="color:var(--g)"></i>Configurações gerais da conta</div>
      <div class="cfg-card-sub">Informações principais da sua conta no Evolux CRM.</div>
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:22px;padding:16px;background:var(--c0);border-radius:var(--radl);border:1px solid var(--c2)">
        <div style="position:relative;flex-shrink:0">
          <div id="foto-preview-conta" onclick="document.getElementById('foto-input-real').click()" style="width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#fff;cursor:pointer;overflow:hidden;box-shadow:0 4px 14px rgba(26,110,60,.3);border:3px solid var(--gb)">${(()=>{const _m=getMe();const f=_m&&safeUrl(_m.foto);return f?`<img src="${f}" style="width:100%;height:100%;object-fit:cover">`:esc(_m?_m.nome.charAt(0):'?')})()}</div>
          <div onclick="document.getElementById('foto-input-real').click()" style="position:absolute;bottom:0;right:0;width:24px;height:24px;background:var(--g);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2)"><i class="ti ti-camera" style="font-size:12px;color:#fff"></i></div>
          <input type="file" id="foto-input-real" accept="image/*" style="display:none" onchange="uploadFoto(event)">
        </div>
        <div style="flex:1">
          <div style="font-size:16px;font-weight:800;color:var(--tx)">${esc((getMe()||{nome:''}).nome)}</div>
          <div style="font-size:12px;color:var(--tm);margin-top:2px">${(()=>{const _m=getMe();return esc((_m?getHierLabel(_m):'Vendedor')+' · '+((_m&&_m.email)||window._session?.user?.email||''))})()}</div>
          <div style="font-size:11px;color:var(--gc);font-weight:700;margin-top:5px">● Online agora</div>
          <div style="font-size:11px;color:var(--tm);margin-top:6px"><i class="ti ti-camera" style="font-size:11px"></i> Clique na foto para alterar</div>
        </div>
      </div>
      <div class="g2"><div class="field"><label>Nome</label><input type="text" class="fi" id="accNome" placeholder="Seu nome"></div><div class="field"><label>Sobrenome</label><input type="text" class="fi" id="accSobrenome" placeholder="Seu sobrenome"></div></div>
      <div class="field"><label><i class="ti ti-brand-instagram" style="font-size:13px;vertical-align:middle"></i> Instagram</label><input type="text" class="fi" id="accInstagram" placeholder="@seuinstagram"></div>
      <div class="field"><label><i class="ti ti-brand-whatsapp" style="font-size:13px;vertical-align:middle;color:#25d366"></i> WhatsApp <span style="font-size:10.5px;font-weight:400;color:var(--tm)">(aparece no PDF da simulação)</span></label><input type="text" class="fi" id="accWhatsapp" placeholder="(11) 99999-0000" oninput="maskTelConta(this)"></div>
      <div class="g2"><div class="field"><label>Fuso horário</label><select class="fi"><option>(GMT-03:00) Brasília</option><option>(GMT-04:00) Manaus</option></select></div><div class="field"><label>País</label><select class="fi"><option>Brasil</option></select></div></div>
      <div class="field"><label>Formato de data</label><select class="fi"><option selected>DD/MM/AAAA</option></select></div>
      <button class="btn bp" style="margin-top:6px" onclick="salvarConfiguracoesConta()"><i class="ti ti-check"></i>Salvar configurações</button>
    </div>`,

    admins:`<div class="cfg-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="cfg-card-title" style="margin:0"><i class="ti ti-building-bank" style="color:var(--g)"></i>Administradoras</div>
        <button class="btn bp bsm" onclick="openAdminModalNew()"><i class="ti ti-plus"></i>Nova administradora</button>
      </div>
      <div class="cfg-card-sub" style="margin-bottom:16px">Clique na administradora para ativá-la no simulador. Edite para gerenciar grupos e cotas.</div>
      <div id="admin-list"></div>
      <div class="cfg-divider"></div>
      <div style="font-size:12.5px;font-weight:700;color:var(--tx);margin-bottom:8px">Taxa de financiamento (comparativo)</div>
      <div class="ibox" style="margin-bottom:10px"><i class="ti ti-info-circle" style="font-size:14px;flex-shrink:0"></i>Usada no simulador para comparar consórcio × financiamento bancário.</div>
      <div class="field"><label>Taxa de juros financiamento (% a.m.)</label><input type="number" id="eTaxaFin" class="fi" step="0.05" value="${taxaFin}" oninput="saveTaxaFin()"></div>
      <div class="cfg-divider"></div>
      <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:4px"><i class="ti ti-plug" style="color:var(--g);margin-right:6px"></i>Integração com administradora</div>
      <div class="cfg-card-sub" style="margin-bottom:14px">Vincule os dados da administradora ativa ao CRM para importar tabelas e sincronizar cotas automaticamente.</div>
      <div class="ibox" style="margin-bottom:14px;background:rgba(29,185,84,.06);border-color:rgba(29,185,84,.2)"><i class="ti ti-flask" style="font-size:14px;flex-shrink:0;color:var(--g)"></i><span>Integração via API disponível após deploy. Preencha os dados abaixo para configurar agora e ativar quando o ambiente estiver pronto.</span></div>
      <div class="g2" style="gap:10px;margin-bottom:10px">
        <div class="field" style="margin:0"><label>CNPJ da administradora</label><input type="text" id="intCnpj" class="fi" placeholder="00.000.000/0001-00" oninput="maskCnpjInt(this)"></div>
        <div class="field" style="margin:0"><label>Nome do contato / gerente</label><input type="text" id="intContato" class="fi" placeholder="Ex: João Silva"></div>
      </div>
      <div class="g2" style="gap:10px;margin-bottom:10px">
        <div class="field" style="margin:0"><label>Telefone do contato</label><input type="text" id="intTelContato" class="fi" placeholder="(11) 99999-0000" oninput="maskTelConta(this)"></div>
        <div class="field" style="margin:0"><label>E-mail do contato</label><input type="email" id="intEmailContato" class="fi" placeholder="gerente@administradora.com.br"></div>
      </div>
      <div class="field" style="margin-bottom:10px"><label>URL da tabela de cotas (link direto)</label><input type="url" id="intUrlTabela" class="fi" placeholder="https://..."></div>
      <div class="field" style="margin-bottom:14px"><label>Código de acesso / token da API <span style="font-size:10.5px;font-weight:400;color:var(--tm)">(fornecido pela administradora)</span></label><input type="text" id="intToken" class="fi" placeholder="Ex: sk-adm-xxxxx"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn bg" onclick="showToast('Dados da integração salvos! Conexão ativa após deploy.','ti-check')"><i class="ti ti-device-floppy"></i>Salvar integração</button>
        <button class="btn bp bsm" onclick="showToast('Conexão com a administradora será testada após deploy.','ti-plug')"><i class="ti ti-plug"></i>Testar conexão</button>
      </div>
    </div>`,

    usuarios:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-users" style="color:var(--g)"></i>Usuários</div>
      <div class="cfg-card-sub">Gerencie os usuários da plataforma. Somente quem tem permissão de equipe pode adicionar novos usuários.</div>
      <div id="form-add-user-wrap">
        <div style="font-size:12.5px;font-weight:700;color:var(--tx);margin-bottom:12px">Adicionar novo usuário</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
          <input type="text" id="uNome" class="fi" placeholder="Nome completo">
          <input type="email" id="uEmail" class="fi" placeholder="E-mail">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="password" id="uSenha" class="fi" placeholder="Senha de acesso (mínimo 6 caracteres)" style="flex:2;min-width:200px">
            <input type="password" id="uSenhaConf" class="fi" placeholder="Confirmar senha" style="flex:2;min-width:200px">
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="uHierarquia" class="fi" style="flex:1;min-width:140px"><option value="">Hierarquia...</option></select>
            <select id="uEquipe" class="fi" style="flex:1;min-width:140px"><option value="">Equipe (opcional)</option></select>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input type="text" id="uMeta" class="fi" placeholder="Meta (R$) — obrigatório" oninput="maskM(this)" style="flex:1;min-width:140px">
            <button id="btn-invite-user" class="btn bp" style="white-space:nowrap"><i class="ti ti-user-plus"></i>Cadastrar usuário</button>
          </div>
          <div style="font-size:11.5px;color:var(--tm);padding:6px 0;display:flex;align-items:flex-start;gap:5px"><i class="ti ti-lock-check" style="margin-top:1px;flex-shrink:0"></i> Você define o e-mail e a senha. O usuário já pode entrar direto e trocar a senha quando quiser em "Esqueci minha senha".</div>
        </div>
        <div class="inv-toast" id="invite-toast"></div>
        <div class="cfg-divider"></div>
      </div>
      <div id="user-list"></div>
    </div>`,

    permissoes:`<div style="font-family:inherit">
      <!-- Cabeçalho estilo referência -->
      <div style="background:linear-gradient(135deg,#0a1628 0%,#0d2137 60%,#0a2e1a 100%);border-radius:14px;padding:18px 22px;margin-bottom:16px;display:flex;align-items:center;gap:12px;border:1px solid rgba(1,122,69,.25)">
        <div style="width:38px;height:38px;border-radius:10px;background:rgba(1,122,69,.25);border:1px solid rgba(1,122,69,.4);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ti-settings" style="font-size:18px;color:#00e676"></i>
        </div>
        <div>
          <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-.02em">Configurações</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:1px">Gerencie sua conta</div>
        </div>
      </div>

      <!-- Card principal dark -->
      <div style="background:#0d1b2a;border:1px solid rgba(1,122,69,.2);border-radius:14px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.4)">
        <!-- Topo do card -->
        <div style="padding:22px 26px 18px;border-bottom:1px solid rgba(255,255,255,.06)">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,rgba(1,122,69,.3),rgba(0,230,118,.1));border:1px solid rgba(1,122,69,.4);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 20px rgba(1,122,69,.2)">
              <i class="ti ti-lock" style="font-size:22px;color:#00e676"></i>
            </div>
            <div>
              <div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-.02em">Permissões por função</div>
              <div style="font-size:13px;color:rgba(255,255,255,.45);margin-top:3px">Defina quais abas cada nível de usuário pode acessar.</div>
            </div>
          </div>
        </div>

        <!-- Tabela de permissões -->
        <div style="padding:0">
          <!-- Header da tabela -->
          <div style="display:grid;grid-template-columns:1fr 160px 160px 140px;padding:14px 26px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.2)">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.35)">CONTA</div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#00e676;text-align:center">GESTOR</div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#2196f3;text-align:center">REPRESENTANTE</div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#ff9800;text-align:center">VENDEDOR</div>
          </div>

          <!-- Linhas -->
          ${Object.entries(PDEFS).map(([key,label],idx)=>{
            const icons={funil:'ti-layout-kanban',leads:'ti-users',simulador:'ti-calculator',lances:'ti-gavel',ranking:'ti-trophy',relatorios:'ti-chart-bar',whatsapp:'ti-brand-whatsapp',calendario:'ti-calendar',configuracoes:'ti-settings'};
            const icon=icons[key]||'ti-circle-check';
            const bg=idx%2===0?'rgba(255,255,255,.02)':'transparent';
            return `<div style="display:grid;grid-template-columns:1fr 160px 160px 140px;padding:13px 26px;border-bottom:1px solid rgba(255,255,255,.04);background:${bg};align-items:center;transition:background .15s" onmouseover="this.style.background='rgba(1,122,69,.06)'" onmouseout="this.style.background='${bg}'">
              <!-- Nome da funcionalidade -->
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <i class="ti ${icon}" style="font-size:15px;color:rgba(255,255,255,.5)"></i>
                </div>
                <span style="font-size:13.5px;font-weight:600;color:rgba(255,255,255,.85)">${label}</span>
              </div>
              <!-- Gestor -->
              <div style="text-align:center">
                <label style="display:inline-flex;align-items:center;gap:5px;padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:700;transition:all .15s;${DPERMS.gestor[key]?'background:rgba(1,122,69,.25);border:1px solid rgba(1,122,69,.5);color:#00e676':'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4)'}">
                  <input type="checkbox" ${DPERMS.gestor[key]?'checked':''} onchange="DPERMS['gestor']['${key}']=this.checked;cfgRenderSection()" style="display:none">
                  <i class="ti ${DPERMS.gestor[key]?'ti-check':'ti-x'}" style="font-size:11px"></i>
                  ${DPERMS.gestor[key]?'Sim':'Não'}
                </label>
              </div>
              <!-- Representante -->
              <div style="text-align:center">
                <label style="display:inline-flex;align-items:center;gap:5px;padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:700;transition:all .15s;${DPERMS.representante[key]?'background:rgba(1,122,69,.25);border:1px solid rgba(1,122,69,.5);color:#00e676':'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4)'}">
                  <input type="checkbox" ${DPERMS.representante[key]?'checked':''} onchange="DPERMS['representante']['${key}']=this.checked;cfgRenderSection()" style="display:none">
                  <i class="ti ${DPERMS.representante[key]?'ti-check':'ti-x'}" style="font-size:11px"></i>
                  ${DPERMS.representante[key]?'Sim':'Não'}
                </label>
              </div>
              <!-- Vendedor -->
              <div style="text-align:center">
                <label style="display:inline-flex;align-items:center;gap:5px;padding:6px 16px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:700;transition:all .15s;${DPERMS.vendedor[key]?'background:rgba(1,122,69,.25);border:1px solid rgba(1,122,69,.5);color:#00e676':'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.4)'}">
                  <input type="checkbox" ${DPERMS.vendedor[key]?'checked':''} onchange="DPERMS['vendedor']['${key}']=this.checked;cfgRenderSection()" style="display:none">
                  <i class="ti ${DPERMS.vendedor[key]?'ti-check':'ti-x'}" style="font-size:11px"></i>
                  ${DPERMS.vendedor[key]?'Sim':'Não'}
                </label>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`,

    integracoes:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-plug" style="color:var(--g)"></i>Integrações disponíveis</div>
      <div class="cfg-card-sub">Conecte o Evolux CRM com suas ferramentas para automatizar o fluxo de leads.</div>
      <div class="integ-grid">
        ${[
          {id:'facebook',icon:'ti-brand-facebook',bg:'#e7f0fd',ic:'#1877f2',name:'Meta / Facebook Ads',desc:'Leads dos anúncios caem direto no CRM automaticamente.'},
          {id:'whatsapp-cfg',icon:'ti-brand-whatsapp',bg:'#e8f8f0',ic:'#25d366',name:'WhatsApp Business',desc:'Disparo em massa e conversas integradas ao funil.'},
          {id:'google',icon:'ti-brand-google',bg:'#fef3e2',ic:'#4285f4',name:'Google Agenda',desc:'Reuniões sincronizadas com seu Google Calendar.'},
          {id:null,icon:'ti-webhook',bg:'#f3e8fd',ic:'#7c3aed',name:'Webhook personalizado',desc:'Envie dados de leads para qualquer sistema via URL.'},
          {id:null,icon:'ti-mail',bg:'#fde8e8',ic:'#c0392b',name:'E-mail marketing',desc:'Integre com Mailchimp, RD Station ou ActiveCampaign.'},
          {id:null,icon:'ti-api',bg:'#e8f4fd',ic:'#0077b5',name:'API pública',desc:'Acesse seus dados via API REST para integrações customizadas.'},
        ].map(c=>`<div class="integ-card"${c.id?` onclick="cfgShow('${c.id}')"`:''} style="${c.id?'cursor:pointer':''}">
          <div class="integ-card-head"><div class="integ-icon" style="background:${c.bg}"><i class="ti ${c.icon}" style="color:${c.ic};font-size:22px"></i></div><div><div class="integ-name">${c.name}</div><span class="integ-status demo"><i class="ti ti-flask"></i>Em breve</span></div></div>
          <div class="integ-desc">${c.desc}</div>
          <button class="btn bp bsm" style="width:100%;justify-content:center">${c.id?'Configurar →':'Em breve'}</button>
        </div>`).join('')}
      </div>
    </div>`,

    facebook:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-brand-facebook" style="color:#1877f2"></i>Meta / Facebook Ads</div>
      <div class="cfg-card-sub">Leads dos seus formulários de Lead Ads caem <strong>automaticamente</strong> no CRM, na etapa "Novo lead", atribuídos ao vendedor responsável pela campanha.</div>
      ${demoBanner}
      <div style="font-size:12.5px;font-weight:700;color:var(--tx);margin-bottom:12px">Como funciona</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">
        ${[['1','#1877f2','ti-ad','Crie um formulário Lead Ad no Meta','O formulário captura nome, telefone e e-mail direto no Facebook/Instagram.'],
           ['2','#1877f2','ti-plug','Conecte sua conta Meta aqui','Cole o Token de Acesso da sua página abaixo.'],
           ['3','#1877f2','ti-user-check','Lead entra direto no CRM','Aparece automaticamente no funil em "Novo lead" com dados preenchidos.'],
           ['4','#1877f2','ti-bell','Notificação em tempo real','O responsável recebe alerta imediatamente — sem planilha.']
          ].map(([n,c,ic,t,s])=>`<div style="display:flex;gap:10px;padding:10px 12px;border:1px solid var(--c2);border-radius:var(--rad);background:var(--c0)">
            <div style="width:26px;height:26px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${n}</div>
            <div><div style="font-size:12.5px;font-weight:700;color:var(--tx);margin-bottom:1px"><i class="ti ${ic}" style="margin-right:4px"></i>${t}</div><div style="font-size:11.5px;color:var(--tm)">${s}</div></div>
          </div>`).join('')}
      </div>
      <div class="cfg-divider"></div>
      <div class="field"><label>Token de acesso da página (Page Access Token)</label><input type="text" class="fi" placeholder="EAAxxxxx..."></div>
      <div class="field"><label>ID do formulário de Lead Ad</label><input type="text" class="fi" placeholder="Ex: 1234567890123456"></div>
      <div class="field"><label>Atribuir leads para</label><select class="fi">${users.map(u=>`<option>${esc(u.nome)} (${esc(getHierLabel(u))})</option>`).join('')}</select></div>
      <div class="field"><label>Etapa inicial no funil</label><select class="fi">${ETAPAS.slice(0,5).map(e=>`<option>${esc(etapaLabel(e))}</option>`).join('')}</select></div>
      <div class="cfg-divider"></div>
      <div style="font-size:12.5px;font-weight:700;color:var(--tx);margin-bottom:8px">URL do Webhook</div>
      <div class="wh-row"><div class="wh-url" id="meta-webhook-url">${window.location.origin}/api/meta-webhook</div><span class="wh-badge">POST</span><button class="btn bg bsm" onclick="var u=document.getElementById('meta-webhook-url')?.textContent||window.location.origin+'/api/meta-webhook';navigator.clipboard?.writeText(u).then(()=>showToast('URL copiada!','ti-copy')).catch(()=>showToast('Copie manualmente','ti-copy'))"><i class="ti ti-copy"></i></button></div>
      <div style="font-size:11px;color:var(--tm);margin-bottom:14px"><i class="ti ti-info-circle"></i> Cole esta URL nos Webhooks do seu app no Meta for Developers.</div>
      <button class="btn bp" onclick="integConectar('meta')"><i class="ti ti-brand-facebook"></i>Conectar conta Meta</button>
    </div>`,

    'whatsapp-cfg':`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-brand-whatsapp" style="color:#25d366"></i>WhatsApp Business API</div>
      <div class="cfg-card-sub">Configure a integração oficial para disparos em massa e conversas centralizadas.</div>
      ${demoBanner}
      <div class="field"><label>Token da API WhatsApp Business</label><input type="text" class="fi" placeholder="Bearer EAAxxxxx..."></div>
      <div class="field"><label>Phone Number ID</label><input type="text" class="fi" placeholder="Ex: 123456789012345"></div>
      <div class="field"><label>WABA ID</label><input type="text" class="fi" placeholder="Ex: 987654321098765"></div>
      <button class="btn bp" onclick="integConectar('whatsapp')"><i class="ti ti-brand-whatsapp"></i>Salvar configuração</button>
    </div>`,

    google:(()=>{
      const gcalConnected=!!(window._gcalToken);
      return `<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-brand-google" style="color:#4285f4"></i>Google Agenda</div>
      <div class="cfg-card-sub">Conecte sua conta Google para sincronizar reuniões automaticamente.</div>

      ${gcalConnected?`<div style="display:flex;align-items:center;gap:12px;padding:16px;border-radius:12px;background:rgba(1,122,69,.08);border:1px solid rgba(1,122,69,.2);margin-bottom:16px">
        <i class="ti ti-circle-check" style="color:var(--g);font-size:24px;flex-shrink:0"></i>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:var(--tx)">Google Calendar conectado ✅</div>
          <div style="font-size:12px;color:var(--tm);margin-top:3px">Reuniões criadas no CRM são sincronizadas automaticamente com seu calendário.</div>
        </div>
        <button class="btn bd bsm" onclick="gcalDesconectar()"><i class="ti ti-unlink"></i>Desconectar</button>
      </div>
      <div style="font-size:12px;color:var(--tm);text-align:center">Tudo certo! Agende reuniões na aba <strong>Calendário</strong> e elas aparecerão no Google Calendar.</div>`
      :`<div style="display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 16px;text-align:center">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(66,133,244,.1);display:flex;align-items:center;justify-content:center">
          <svg width="28" height="28" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        </div>
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--tx);margin-bottom:6px">Conecte seu Google Calendar</div>
          <div style="font-size:12.5px;color:var(--tm);line-height:1.6;max-width:280px;margin:0 auto">Clique no botão abaixo, escolha sua conta Google e pronto — suas reuniões serão sincronizadas automaticamente.</div>
        </div>
        <button class="gcal-btn" onclick="gcalIniciarOAuth()" style="width:100%;max-width:280px;justify-content:center;padding:12px 20px;font-size:14px">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Conectar com Google
        </button>
        <div style="font-size:11px;color:var(--tm);opacity:.7">Cada usuário conecta uma vez. Fica salvo no navegador.</div>
      </div>`}
    </div>`;})(),

    notificacoes:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-bell" style="color:var(--g)"></i>Notificações</div>
      <div class="cfg-card-sub">Defina quando e como ser avisado sobre atividades no CRM.</div>
      ${toggleRow('Novo lead recebido','Notificar quando um lead novo entrar no funil')}
      ${toggleRow('Lead parado há 3 dias','Alerta quando um lead ficar sem atualização')}
      ${toggleRow('Lance se aproximando','Lembrete 2 dias antes da data do lance')}
      ${toggleRow('Reunião agendada','Notificar 1 hora antes de uma reunião')}
      ${toggleRow('Lead convertido','Celebrar quando uma venda for fechada 🎉')}
      ${toggleRow('Relatório semanal','Enviar resumo toda segunda-feira')}
    </div>`,

    aparencia:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-palette" style="color:var(--g)"></i>Aparência</div>
      <div class="cfg-card-sub">Personalize a interface do CRM. A preferência fica salva no navegador.</div>
      <div class="cfg-toggle-row">
        <div>
          <div class="cfg-toggle-label">Tema escuro</div>
          <div class="cfg-toggle-sub">Ativa fundo escuro em toda a interface</div>
        </div>
        <label class="cfg-toggle">
          <input type="checkbox" id="dark-mode-toggle"
            ${document.documentElement.getAttribute('data-theme')==='dark'?'checked':''}
            onchange="toggleDarkMode(this.checked)">
          <span class="cfg-toggle-slider"></span>
        </label>
      </div>
      <div style="margin-top:16px">
        <div style="font-size:12px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Prévia dos temas</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div onclick="toggleDarkMode(false)" style="padding:14px;border-radius:10px;border:2px solid ${document.documentElement.getAttribute('data-theme')!=='dark'?'var(--g)':'var(--c2)'};background:#f8fafc;cursor:pointer;transition:all .15s">
            <div style="width:100%;height:6px;background:#e2e8f0;border-radius:4px;margin-bottom:6px"></div>
            <div style="width:70%;height:6px;background:#cbd5e1;border-radius:4px;margin-bottom:6px"></div>
            <div style="font-size:11px;font-weight:700;color:#0f172a;margin-top:6px">☀️ Tema claro</div>
          </div>
          <div onclick="toggleDarkMode(true)" style="padding:14px;border-radius:10px;border:2px solid ${document.documentElement.getAttribute('data-theme')==='dark'?'var(--g)':'var(--c2)'};background:#0d1117;cursor:pointer;transition:all .15s">
            <div style="width:100%;height:6px;background:#1a2035;border-radius:4px;margin-bottom:6px"></div>
            <div style="width:70%;height:6px;background:#243050;border-radius:4px;margin-bottom:6px"></div>
            <div style="font-size:11px;font-weight:700;color:#e2eaff;margin-top:6px">🌙 Tema escuro</div>
          </div>
        </div>
      </div>
    </div>`,

    seguranca:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-shield-lock" style="color:var(--g)"></i>Segurança</div>
      <div class="cfg-card-sub">Proteja o acesso ao CRM com configurações avançadas.</div>
      ${toggleRow('Autenticação em dois fatores (2FA)','Exige código extra no login — recomendado',false)}
      <div class="cfg-toggle-row" style="opacity:.7">
        <div><div class="cfg-toggle-label">Encerrar sessão por inatividade</div><div class="cfg-toggle-sub">Logout automático após 30 dias sem uso — <strong>obrigatório, não pode ser desativado</strong></div></div>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--g)"><i class="ti ti-lock" style="font-size:14px"></i>Ativo</div>
      </div>
      ${toggleRow('Restringir acesso por IP','Permitir login apenas de IPs cadastrados',false)}
      <div class="cfg-divider"></div>
      <div style="font-size:12.5px;font-weight:700;color:var(--tx);margin-bottom:8px">Alterar minha senha</div>
      <div class="field"><label>Senha atual</label><input type="password" class="fi" id="seg-senha-atual" placeholder="••••••••" autocomplete="current-password"></div>
      <div class="g2"><div class="field"><label>Nova senha</label><input type="password" class="fi" id="seg-senha-nova" placeholder="Mínimo 6 caracteres" autocomplete="new-password"></div><div class="field"><label>Confirmar</label><input type="password" class="fi" id="seg-senha-conf" placeholder="Repita a nova senha" autocomplete="new-password"></div></div>
      <button class="btn bp" id="seg-btn-senha" onclick="alterarMinhaSenha()"><i class="ti ti-lock"></i>Alterar senha</button>
    </div>`,

    plano:`<div class="cfg-card">
      <div class="cfg-card-title"><i class="ti ti-credit-card" style="color:var(--g)"></i>Plano e faturamento</div>
      <div class="cfg-card-sub">Gerencie sua assinatura do Evolux CRM.</div>
      <div style="padding:18px;border-radius:var(--radl);background:linear-gradient(135deg,var(--g),var(--gc));color:#fff;margin-bottom:18px">
        <div style="font-size:10px;opacity:.8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">Plano atual</div>
        <div style="font-size:20px;font-weight:800">Profissional</div>
        <div style="font-size:12px;opacity:.85;margin-top:3px">Até 5 usuários · Integrações · Suporte prioritário</div>
        <div style="font-size:18px;font-weight:700;margin-top:10px">R$ 197<span style="font-size:12px;font-weight:400;opacity:.8">/mês</span></div>
      </div>
      <div class="cfg-toggle-row"><div><div class="cfg-toggle-label">Próxima cobrança</div><div class="cfg-toggle-sub">10/10/2026</div></div><span style="font-size:13px;font-weight:700;color:var(--g)">R$ 197,00</span></div>
      <div class="cfg-toggle-row"><div><div class="cfg-toggle-label">Método de pagamento</div><div class="cfg-toggle-sub">Cartão •••• 4242</div></div><button class="btn bg bsm">Atualizar</button></div>
      <div class="cfg-divider"></div>
      <button class="btn bg" style="width:100%;justify-content:center" onclick="integConectar('stripe')"><i class="ti ti-receipt"></i>Ver histórico de faturas</button>
    </div>`,
  };

  // ── SEÇÃO EQUIPES ──────────────────────────────────────────
  sections.equipes=(()=>{
    const podeNovaEq=podeCriarEquipe();
    const eqAv=(eq)=>{
      const f=safeUrl(eq.foto);
      if(f) return `<img src="${f}" style="width:50px;height:50px;border-radius:12px;object-fit:cover;flex-shrink:0">`;
      return `<div style="width:50px;height:50px;border-radius:12px;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:900;color:#fff;flex-shrink:0">${esc(_iniciais(eq.nome))}</div>`;
    };
    const list=equipes.length?equipes.map(eq=>{
      const sup=users.find(u=>u.id===eq.supervisorId);
      const rep=users.find(u=>u.id===eq.representanteId);
      const gest=users.find(u=>u.id===eq.gestorId);
      const mbs=(eq.membroIds||[]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
      const gerir=podeGerenciarEquipe(eq);
      return `<div style="background:var(--card-bg,#fff);border:1.5px solid var(--card-border,#e8ecf0);border-radius:var(--radl);overflow:hidden;box-shadow:var(--s1);margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:14px;padding:16px 18px">
          ${eqAv(eq)}
          <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:800;color:var(--tx)">${esc(eq.nome)}</div>
            <div style="font-size:12px;color:var(--tm);margin-top:3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              ${sup?`<span title="Supervisor"><i class="ti ti-user-shield" style="font-size:11px"></i> ${esc(sup.nome)}</span>`:''}
              ${rep?`<span title="Representante"><i class="ti ti-user-star" style="font-size:11px"></i> ${esc(rep.nome)}</span>`:''}
              ${gest?`<span title="Gestor"><i class="ti ti-briefcase" style="font-size:11px"></i> ${esc(gest.nome)}</span>`:''}
              <span><i class="ti ti-users" style="font-size:11px"></i> ${mbs.length} membro${mbs.length!==1?'s':''}</span>
              <span class="eq-card-status ${eq.status==='inativa'?'eq-status-inativa':'eq-status-ativa'}">${(eq.status||'ativa').charAt(0).toUpperCase()+(eq.status||'ativa').slice(1)}</span>
              ${eq.meta?`<span style="color:var(--gc);font-weight:700"><i class="ti ti-target" style="font-size:11px"></i> R$ ${Number(eq.meta).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}/${({mensal:'mês',semanal:'sem',personalizado:'per'})[eq.periodo||'mensal']||'mês'}</span>`:''}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${gerir?`<button class="btn bg bsm" onclick="openEqModal(${eq.id})" title="Editar equipe"><i class="ti ti-pencil"></i></button>`:''}
            ${podeNovaEq?`<button class="btn bd bsm" onclick="deleteEquipe(${eq.id})" title="Excluir equipe"><i class="ti ti-trash"></i></button>`:''}
          </div>
        </div>
        ${mbs.length?`<div style="padding:0 18px 14px;border-top:1px solid var(--c1);padding-top:12px">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--tm);margin-bottom:8px">Membros</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${mbs.map(m=>{const f=safeUrl(m.foto);return `<div style="display:flex;align-items:center;gap:6px;background:var(--c0);border:1px solid var(--c2);border-radius:8px;padding:5px 10px;font-size:12px;color:var(--ts)">
              <div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,var(--g),var(--gc));display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;overflow:hidden;flex-shrink:0">${f?`<img src="${f}" style="width:100%;height:100%;object-fit:cover">`:esc(m.nome.charAt(0))}</div>
              <span>${esc(m.nome)}</span>
              <span class="rbadge ${getHierClass(m)}" style="font-size:9px">${esc(getHierLabel(m))}</span>
              ${gerir?`<button onclick="removeMembro(${eq.id},${m.id})" title="Tirar da equipe" style="width:16px;height:16px;border-radius:50%;background:rgba(220,38,38,.1);border:none;cursor:pointer;color:var(--r);font-size:9px;display:flex;align-items:center;justify-content:center"><i class="ti ti-x"></i></button>`:''}
            </div>`;}).join('')}
          </div>
        </div>`:''}
      </div>`;
    }).join(''):`<div style="text-align:center;padding:48px 20px">
      <div style="font-size:44px;margin-bottom:12px">👥</div>
      <div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:6px">Nenhuma equipe ainda</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:16px">Crie a primeira equipe para organizar sua operação.</div>
      ${podeNovaEq?`<button class="btn bp" onclick="openEqModal()"><i class="ti ti-plus"></i>Criar primeira equipe</button>`:''}
    </div>`;
    return `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div><div style="font-size:16px;font-weight:800;color:var(--tx)">Equipes</div><div style="font-size:12px;color:var(--tm);margin-top:2px">${equipes.length} equipe${equipes.length!==1?'s':''} cadastrada${equipes.length!==1?'s':''}</div></div>
      ${podeNovaEq?`<button class="btn bp" onclick="openEqModal()"><i class="ti ti-plus"></i>Nova equipe</button>`:''}
    </div>${list}`;
  })();

  // ── SEÇÃO HIERARQUIA ───────────────────────────────────────
  sections.hierarquia=(()=>{
    const sorted=hierarquias.slice().sort((a,b)=>a.ordem-b.ordem);
    const hierBgs=['linear-gradient(135deg,#016b3c,#02a355)','linear-gradient(135deg,#d97706,#fbbf24)','linear-gradient(135deg,#0284c7,#38bdf8)','linear-gradient(135deg,#5a6880,#8896b0)','linear-gradient(135deg,#7c3aed,#a855f7)'];
    const cards=sorted.map((h,i)=>{
      const cnt=hierUsersCount(h.id);
      const pcnt=hierPermCount(h);
      const sup=h.superiorId?getHier(h.superiorId):null;
      const bg=hierBgs[i%hierBgs.length];
      const inactive=h.status==='inativa';
      return '<div class="hier-card" data-hid="'+h.id+'" style="background:var(--card-bg,#fff);border:1.5px solid var(--card-border,#e8ecf0);border-radius:14px;padding:18px 20px;cursor:pointer;transition:all .15s;opacity:'+(inactive?0.6:1)+(inactive?';border-color:rgba(220,38,38,.3)':'')+'">'
        +'<div style="display:flex;align-items:center;gap:14px">'
        +'<div style="width:46px;height:46px;border-radius:14px;background:'+bg+';display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;flex-shrink:0">'+esc(h.nome.charAt(0).toUpperCase())+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'
        +'<span style="font-size:15px;font-weight:800;color:var(--tx)">'+esc(h.nome)+'</span>'
        +(inactive?'<span style="font-size:9px;padding:2px 8px;border-radius:20px;background:rgba(220,38,38,.12);color:#dc2626;font-weight:700">INATIVA</span>':'')
        +'</div>'
        +'<div style="font-size:12px;color:var(--tm)">'+esc(h.descricao||'Sem descrição')+'</div>'
        +'</div>'
        +'<div style="text-align:right;flex-shrink:0;margin-right:8px">'
        +'<div style="font-size:13px;font-weight:700;color:var(--tx)">'+pcnt+' permiss'+(pcnt!==1?'ões':'ão')+'</div>'
        +'<div style="font-size:11px;color:var(--tm);margin-top:2px">'+cnt+' usuário'+(cnt!==1?'s':'')+' vinculado'+(cnt!==1?'s':'')+'</div>'
        +(sup?'<div style="font-size:10px;color:#016b3c;margin-top:3px;font-weight:600">↑ '+esc(sup.nome)+'</div>':'')
        +'</div>'
        +'<div style="color:var(--tm)"><i class="ti ti-chevron-right" style="font-size:16px"></i></div>'
        +'</div></div>';
    }).join('');
    return '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">'
      +'<div><div style="font-size:16px;font-weight:800;color:var(--tx)">Hierarquias</div>'
      +'<div style="font-size:12px;color:var(--tm);margin-top:2px">'+hierarquias.length+' cargo'+(hierarquias.length!==1?'s':'')+' cadastrado'+(hierarquias.length!==1?'s':'')+'</div></div>'
      +(podeEditarHierarquias()?'<button id="btn-add-hier" class="btn bp"><i class="ti ti-plus"></i>Adicionar hierarquia</button>':'')
      +'</div>'
      +'<div id="hier-cards-list" style="display:flex;flex-direction:column;gap:10px">'+(cards||'<div style="text-align:center;padding:32px;color:var(--tm)">Nenhuma hierarquia cadastrada.</div>')+'</div>';
  })();

  panel.innerHTML=sections[cfgActive]||`<div class="cfg-card"><div class="cfg-card-title">${CFG_SECTIONS.find(s=>s.id===cfgActive)?.label||''}</div><div class="cfg-card-sub">Em desenvolvimento.</div></div>`;
  // Popula campos da seção conta com dados do usuário atual
  if(cfgActive==='conta'){
    const me=getMe(); // FIX bug#3: nunca usa users[0]
    if(me){
      const parts=me.nome.split(' ');
      const nEl=document.getElementById('accNome');
      const sEl=document.getElementById('accSobrenome');
      if(nEl) nEl.value=parts[0]||'';
      if(sEl) sEl.value=parts.slice(1).join(' ')||'';
      const waEl=document.getElementById('accWhatsapp');
      // Lê também do localStorage como fallback caso Supabase não tenha a coluna
      let _lsCfg={};
      try{const _lsKey='evolux_cfg_'+(window._currentUserId||'default');_lsCfg=JSON.parse(localStorage.getItem(_lsKey)||'{}');}catch(e){}
      const _wa = me.whatsapp || _lsCfg.whatsapp || '';
      if(waEl) waEl.value = _wa;
      // Bug #9: pré-preenche instagram salvo no perfil
      const instaEl2=document.getElementById('accInstagram');
      const _ig = me.instagram || _lsCfg.instagram || '';
      if(instaEl2) instaEl2.value = _ig;
      const fotoOk=safeUrl(me.foto);
      if(fotoOk){
        const prev=document.getElementById('foto-preview-conta');
        if(prev) prev.innerHTML=`<img src="${fotoOk}" style="width:80px;height:80px;object-fit:cover;border-radius:50%;border:3px solid var(--g)">`;
      }
    }
  }
  // Vincula eventos da seção hierarquia via JS puro (sem onclick inline)
  if(cfgActive==='hierarquia'){
    const btnAdd=document.getElementById('btn-add-hier');
    if(btnAdd){
      btnAdd.addEventListener('click',function(e){e.stopPropagation();openHierModalNew();});
    }
    document.querySelectorAll('.hier-card').forEach(function(card){
      const hid=parseInt(card.getAttribute('data-hid'));
      card.addEventListener('click',function(e){e.stopPropagation();openHierModal(hid);});
      card.addEventListener('mouseenter',function(){this.style.borderColor='#016b3c';this.style.transform='translateY(-1px)';});
      card.addEventListener('mouseleave',function(){this.style.borderColor='';this.style.transform='';});
    });
  }
  if(cfgActive==='admins'){renderAdminList();const eF=document.getElementById('eTaxaFin');if(eF)eF.value=taxaFin;}
  if(cfgActive==='usuarios'){
    renderUserList();
    populateSelects();
    const es=document.getElementById('uEquipe');
    if(es)es.innerHTML='<option value="">Equipe (opcional)</option>'+_equipesAtribuiveis().map(e=>`<option value="${e.id}">${esc(e.nome)}</option>`).join('');
    const btnInvite=document.getElementById('btn-invite-user');
    if(btnInvite)btnInvite.addEventListener('click',function(){inviteUser();});
    const formWrap=document.getElementById('form-add-user-wrap');
    if(formWrap) formWrap.style.display=_podeCadastrarUsuario()?'':'none';
  }
}


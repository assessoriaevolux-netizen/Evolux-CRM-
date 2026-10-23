// ─── INTEGRAÇÕES (Meta, WhatsApp, IA): chamadas ao servidor e Configurações ──
// Tokens nunca chegam ao navegador: tudo passa pela função crm-integracoes.
window._integ=window._integ||{status:null,servidor:null,carregadoEm:0,erroStatus:null};

async function integChamar(acao,dados){
  let session=null;
  try{ session=(await window._sb.auth.getSession()).data.session; }catch(e){}
  let res,json={};
  try{
    res=await fetch(`${window._sbUrl}/functions/v1/crm-integracoes`,{method:'POST',
      headers:{'Content-Type':'application/json','apikey':window._sbAnon,'Authorization':`Bearer ${session?.access_token||''}`},
      body:JSON.stringify({acao,...(dados||{})})});
    try{json=await res.json();}catch(e){json={erro:`Resposta inválida do servidor (HTTP ${res.status}).`};}
  }catch(e){ return {ok:false,status:0,erro:'Sem conexão com o servidor. Tente de novo.'}; }
  if(res.status===404&&!json.erro) json.erro='A função crm-integracoes ainda não foi publicada no Supabase.';
  if(!res.ok) return {...json,ok:false,status:res.status,erro:json.erro||`Erro ${res.status}`};
  return {...json,ok:json.ok!==false,status:res.status};
}
window.integChamar=integChamar;

async function integCarregarStatus(forcar){
  const I=window._integ;
  if(!forcar&&I.status&&Date.now()-I.carregadoEm<30000) return I.status;
  const r=await window._rpc('integ_status');
  if(!r.error&&r.data){ I.status=r.data; I.carregadoEm=Date.now(); I.erroStatus=null; }
  else if(r.error){ I.erroStatus=/integ_status|does not exist|not find|schema cache/i.test(r.error.message||'')?'sql':(r.error.message||'erro'); }
  return I.status;
}
async function integServidor(forcar){
  const I=window._integ;
  if(!forcar&&I.servidor) return I.servidor;
  const r=await integChamar('status');
  if(r.ok) I.servidor=r;
  return r.ok?r:null;
}
const integNumeros=()=>((window._integ.status||{}).numeros||[]).filter(n=>n.ativo);
const integMeta=()=>(window._integ.status||{}).meta||null;
function integUserPorSb(sbId){ return users.find(u=>u.sb_id===sbId)||(window.usersInativos||{})[sbId]||null; }
function integNomeUser(sbId){ const u=integUserPorSb(sbId); return u?u.nome:'—'; }
function integLeadPorSb(sbId){ return leads.find(l=>String(l.sb_id)===String(sbId))||null; }
function integData(iso,comHora){
  if(!iso)return '—';
  const d=new Date(iso);
  return d.toLocaleDateString('pt-BR')+(comHora?' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'');
}
function integHaQuanto(iso){
  if(!iso)return '';
  const s=Math.floor((Date.now()-new Date(iso).getTime())/1000);
  if(s<60)return 'agora';
  if(s<3600)return Math.floor(s/60)+' min';
  if(s<86400)return Math.floor(s/3600)+' h';
  if(s<7*86400)return Math.floor(s/86400)+' d';
  return new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
}
function integAvisoSQL(){
  return `<div class="integ2-aviso"><i class="ti ti-database-off"></i><div><strong>Falta instalar as integrações no banco.</strong> Rode o arquivo <code>2026-10-23-integracoes-meta-whatsapp-ia.sql</code> no SQL Editor do Supabase e recarregue a página.</div></div>`;
}
function integCarregando(txt){return `<div class="integ2-carregando"><i class="ti ti-loader-2"></i>${esc(txt||'Carregando…')}</div>`;}
function integIrPara(secao){ showTab('configuracoes'); setTimeout(()=>{ try{cfgShow(secao);}catch(e){} },60); }

// ── Volta do "Conectar com a Meta" ──────────────────────────────────────────
(function(){
  try{
    const p=new URLSearchParams(location.search);
    const m=p.get('meta');
    if(!m) return;
    window._metaRetorno={status:m,motivo:p.get('motivo')||''};
    p.delete('meta');p.delete('motivo');
    const q=p.toString();
    history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash);
  }catch(e){}
})();
(function esperarCRM(n){
  if(!window._metaRetorno) return;
  if(!window.__crmPronto){ if(n<240) setTimeout(()=>esperarCRM(n+1),250); return; }
  const r=window._metaRetorno; delete window._metaRetorno;
  if(r.status==='ok'){
    showToast('Conta da Meta conectada! Buscando contas, páginas e números…','ti-brand-meta');
    integIrPara('facebook');
    integAtualizarMeta(true);
  } else {
    showToast('A Meta não foi conectada: '+(r.motivo||'tente de novo.'),'ti-alert-triangle','#dc2626');
    integIrPara('facebook');
  }
})(0);

// ── Painel: Meta / Facebook Ads ─────────────────────────────────────────────
function integToggle(id,marcado,onchange,desab){
  return `<label class="cfg-toggle"><input type="checkbox" id="${id}"${marcado?' checked':''}${desab?' disabled':''} onchange="${onchange}"><span class="cfg-toggle-slider"></span></label>`;
}
async function integRenderMeta(){
  const el=document.getElementById('integ-meta-painel');
  if(!el) return;
  el.innerHTML=integCarregando();
  const st=await integCarregarStatus(true);
  if(!document.getElementById('integ-meta-painel')) return;
  if(!st){ el.innerHTML=window._integ.erroStatus==='sql'?integAvisoSQL():`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(window._integ.erroStatus||'Não consegui carregar.')}</div>`; return; }
  const g=!!st.gestor;
  const srv=g?await integServidor():null;
  const m=st.meta;
  let h='';
  if(g&&srv&&!srv.meta_app) h+=`<div class="integ2-aviso erro"><i class="ti ti-key"></i><div>Faltam os segredos <code>META_APP_ID</code> e <code>META_APP_SECRET</code> nas Edge Functions do Supabase.</div></div>`;
  if(g&&!srv) h+=`<div class="integ2-aviso erro"><i class="ti ti-plug-x"></i><div>A função <code>crm-integracoes</code> não respondeu. Confira se ela foi publicada no Supabase.</div></div>`;
  if(!m){
    h+=`<div class="integ2-vazio">
      <div class="integ2-vazio-ic"><i class="ti ti-brand-meta"></i></div>
      <div class="integ2-vazio-tit">Conecte a conta da Meta da empresa</div>
      <div class="integ2-vazio-txt">Com um clique: os leads dos formulários do Facebook e do Instagram caem direto no funil, as campanhas aparecem no Gerenciador de Anúncios e o WhatsApp Business fica disponível para conversas e disparos.</div>
      ${g?`<button class="btn bp" id="btn-meta-conectar" onclick="integConectarMeta()"><i class="ti ti-brand-meta"></i>Conectar com a Meta</button>
        <div class="integ2-mini">Use o Facebook que administra a página, a conta de anúncios e o WhatsApp da empresa.</div>`
        :`<div class="integ2-mini"><i class="ti ti-lock"></i> Só o gestor da empresa pode conectar.</div>`}
    </div>`;
    el.innerHTML=h; return;
  }
  const expira=m.expira_em?new Date(m.expira_em):null;
  const dias=expira?Math.floor((expira-Date.now())/86400000):null;
  h+=`<div class="integ2-conexao">
    <div class="integ2-conexao-ic"><i class="ti ti-circle-check"></i></div>
    <div class="integ2-conexao-txt">
      <div class="integ2-conexao-tit">Conectado${m.meta_user_nome?' como '+esc(m.meta_user_nome):''}</div>
      <div class="integ2-mini">Por ${esc(m.conectado_nome||'—')} · atualizado em ${integData(m.descoberto_em||m.atualizado_em,true)}${expira?` · ${dias<0?'<strong class="txt-r">conexão expirada</strong>':`vale até ${integData(m.expira_em)}`}`:' · sem data para expirar'}</div>
    </div>
    ${g?`<div class="integ2-conexao-acoes">
      <button class="btn bg bsm" onclick="integAtualizarMeta()"><i class="ti ti-refresh"></i>Atualizar lista</button>
      <button class="btn bg bsm" onclick="integConectarMeta()"><i class="ti ti-plug"></i>Reconectar</button>
      <button class="btn bd bsm" onclick="integDesconectarMeta()"><i class="ti ti-plug-off"></i>Desconectar</button>
    </div>`:''}
  </div>`;
  if(dias!==null&&dias>=0&&dias<=10) h+=`<div class="integ2-aviso"><i class="ti ti-clock-exclamation"></i><div>A conexão vence em ${dias} dia${dias!==1?'s':''}. Clique em <strong>Reconectar</strong> para renovar por mais 60 dias.</div></div>`;
  if(m.ultimo_erro) h+=`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i><div>${esc(m.ultimo_erro)}</div></div>`;
  // contas de anúncio
  const contas=m.contas||[];
  h+=`<div class="integ2-sec"><div class="integ2-sec-tit"><i class="ti ti-ad-2"></i>Contas de anúncio</div>`;
  if(!contas.length) h+=`<div class="integ2-mini">Nenhuma conta de anúncio liberada nesta conexão.${g?' Reconecte e marque a conta de anúncios na tela da Meta.':''}</div>`;
  else h+=`<div class="field" style="max-width:420px;margin:0"><label>Conta usada no Gerenciador de Anúncios</label>
      <select class="fi" ${g?'':'disabled'} onchange="integContaPadrao(this.value)">${contas.map(a=>`<option value="${esc(a.id)}"${a.id===m.conta_padrao?' selected':''}>${esc(a.nome)} (${esc(a.moeda||'BRL')})${a.ativa?'':' — inativa'}</option>`).join('')}</select></div>`;
  h+=`</div>`;
  // páginas (Lead Ads)
  if(g){
    const pags=st.paginas||[];
    h+=`<div class="integ2-sec"><div class="integ2-sec-tit"><i class="ti ti-forms"></i>Leads dos formulários (Lead Ads)</div>
      <div class="integ2-mini" style="margin-bottom:10px">Ligue a página que recebe os formulários. Cada lead novo entra no funil na hora, já com o responsável escolhido, e o responsável recebe um aviso.</div>`;
    if(!pags.length) h+=`<div class="integ2-mini">Nenhuma página liberada nesta conexão. Reconecte e marque as páginas da empresa.</div>`;
    h+=pags.map(p=>integCardPagina(p)).join('');
    h+=`<div class="integ2-mini" style="margin-top:8px"><i class="ti ti-flask"></i> Para testar, crie um lead de teste na <a href="https://developers.facebook.com/tools/lead-ads-testing" target="_blank" rel="noopener">Ferramenta de Teste de Lead Ads</a> da Meta.</div></div>`;
  }
  if(st.gestor&&isPlataforma()&&srv&&srv.verify_token){
    h+=`<details class="integ2-det"><summary>Dados técnicos do webhook (configuração manual)</summary>
      <div class="wh-row"><div class="wh-url">${esc(srv.webhook_url)}</div><span class="wh-badge">URL</span></div>
      <div class="wh-row"><div class="wh-url">${esc(srv.verify_token)}</div><span class="wh-badge">Token</span></div>
      <div class="integ2-mini">O CRM já assina os avisos sozinho ao ligar uma página ou um número. Use isto só se for configurar à mão no painel da Meta (Webhooks → Page → leadgen e WhatsApp → messages).</div></details>`;
  }
  el.innerHTML=h;
  if(g&&!m.descoberto_em&&!window._integ.descobrindo) integAtualizarMeta(true);
}
function _integOpcoesUsuarios(sel){
  const ativos=users.filter(u=>u.ativo!==false&&u.sb_id);
  return ativos.map(u=>`<option value="${esc(u.sb_id)}"${u.sb_id===sel?' selected':''}>${esc(u.nome)} (${esc(getHierLabel(u))})</option>`).join('');
}
function integCardPagina(p){
  const id='pg-'+String(p.page_id).replace(/\W/g,'');
  const rod=(p.rodizio_ids||[]);
  const modo=p.responsavel_id?'fixo':(rod.length?'escolhidos':'todos');
  const candidatos=users.filter(u=>u.ativo!==false&&u.sb_id&&!isGestor(u));
  return `<div class="integ2-pagina${p.leads_ativo?' on':''}" id="${id}">
    <div class="integ2-pagina-top">
      <div><div class="integ2-pagina-nome"><i class="ti ti-brand-facebook"></i>${esc(p.nome||p.page_id)}</div>
        <div class="integ2-mini">${p.leads_ativo?'Recebendo leads no CRM':'Leads desligados'}</div></div>
      ${integToggle(id+'-on',p.leads_ativo,`integSalvarPagina('${esc(p.page_id)}',{leads_ativo:this.checked})`)}
    </div>
    <div class="integ2-pagina-cfg">
      <div class="field"><label>Quem recebe os leads</label>
        <select class="fi" id="${id}-modo" onchange="document.getElementById('${id}-rod').hidden=this.value!=='escolhidos';document.getElementById('${id}-resp').hidden=this.value!=='fixo'">
          <option value="todos"${modo==='todos'?' selected':''}>Rodízio entre todos (menos gestores)</option>
          <option value="escolhidos"${modo==='escolhidos'?' selected':''}>Rodízio entre pessoas escolhidas</option>
          <option value="fixo"${modo==='fixo'?' selected':''}>Sempre a mesma pessoa</option>
        </select></div>
      <div class="field" id="${id}-resp"${modo==='fixo'?'':' hidden'}><label>Pessoa</label><select class="fi" id="${id}-pessoa">${_integOpcoesUsuarios(p.responsavel_id)}</select></div>
      <div class="field integ2-rodizio" id="${id}-rod"${modo==='escolhidos'?'':' hidden'}><label>Participam do rodízio</label>
        <div class="integ2-chips">${candidatos.map(u=>`<label class="integ2-chip"><input type="checkbox" value="${esc(u.sb_id)}"${rod.includes(u.sb_id)?' checked':''}>${esc(u.nome)}</label>`).join('')||'<span class="integ2-mini">Ninguém além do gestor.</span>'}</div></div>
      <div class="g2">
        <div class="field"><label>Etapa inicial</label><select class="fi" id="${id}-etapa">${ETAPAS.slice(0,5).map(e=>`<option value="${esc(e)}"${e===(p.etapa_inicial||'Novo lead')?' selected':''}>${esc(etapaLabel(e))}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo quando o formulário não diz</label><select class="fi" id="${id}-tipo"><option value="">Descobrir pelas respostas</option>${['Imóvel','Automóvel','Moto','Serviço'].map(t=>`<option${t===p.tipo_padrao?' selected':''}>${t}</option>`).join('')}</select></div>
      </div>
      <div class="cfg-toggle-row"><div><div class="cfg-toggle-label">IA faz o primeiro contato pelo WhatsApp</div><div class="cfg-toggle-sub">Assim que o lead chega, a IA de primeiro atendimento manda a mensagem inicial (precisa estar ligada na aba IA).</div></div>
        ${integToggle(id+'-ia',p.ia_primeiro_contato,'')}</div>
      <button class="btn bp bsm" onclick="integSalvarPaginaCfg('${esc(p.page_id)}','${id}')"><i class="ti ti-check"></i>Salvar</button>
    </div>
  </div>`;
}
async function integSalvarPaginaCfg(pageId,id){
  const modo=document.getElementById(id+'-modo').value;
  const dados={
    responsavel_id:modo==='fixo'?document.getElementById(id+'-pessoa').value:null,
    rodizio_ids:modo==='escolhidos'?[...document.querySelectorAll(`#${id}-rod input:checked`)].map(i=>i.value):[],
    etapa_inicial:document.getElementById(id+'-etapa').value,
    tipo_padrao:document.getElementById(id+'-tipo').value||null,
    ia_primeiro_contato:document.getElementById(id+'-ia').checked,
  };
  if(modo==='escolhidos'&&!dados.rodizio_ids.length){showToast('Escolha pelo menos uma pessoa para o rodízio.','ti-alert-triangle','#d97706');return;}
  await integSalvarPagina(pageId,dados);
}
async function integSalvarPagina(pageId,dados){
  const r=await integChamar('meta_pagina',{page_id:pageId,...dados});
  if(!r.ok){ showToast(r.erro,'ti-alert-triangle','#dc2626'); integRenderMeta(); return; }
  if('leads_ativo' in dados) showToast(dados.leads_ativo?'Pronto! Os leads desta página vão cair direto no CRM.':'Leads desta página desligados.','ti-forms');
  else showToast('Configuração da página salva.','ti-check');
  (r.avisos||[]).forEach(a=>showToast(a,'ti-alert-triangle','#d97706'));
  integRenderMeta();
}
async function integConectarMeta(){
  const b=document.getElementById('btn-meta-conectar');
  if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader-2 integ2-gira"></i>Abrindo a Meta…';}
  const r=await integChamar('meta_login_url',{retorno:location.origin+location.pathname});
  if(!r.ok||!r.url){ showToast(r.erro||'Não consegui abrir a Meta.','ti-alert-triangle','#dc2626'); if(b){b.disabled=false;b.innerHTML='<i class="ti ti-brand-meta"></i>Conectar com a Meta';} return; }
  window.location.href=r.url;
}
async function integAtualizarMeta(silencioso){
  window._integ.descobrindo=true;
  const el=document.getElementById('integ-meta-painel');
  if(el&&!silencioso) el.insertAdjacentHTML('afterbegin',integCarregando('Buscando contas, páginas e números na Meta…'));
  const r=await integChamar('meta_atualizar');
  window._integ.descobrindo=false;
  if(!r.ok){ showToast(r.erro,'ti-alert-triangle','#dc2626'); }
  else{
    const partes=[`${r.contas} conta${r.contas!==1?'s':''} de anúncio`,`${r.paginas} página${r.paginas!==1?'s':''}`];
    if(r.numeros_novos) partes.push(`${r.numeros_novos} número${r.numeros_novos!==1?'s':''} de WhatsApp`);
    showToast('Encontrado: '+partes.join(', ')+'.','ti-circle-check');
    (r.avisos||[]).forEach(a=>showToast(a,'ti-alert-triangle','#d97706'));
  }
  await integCarregarStatus(true);
  if(document.getElementById('integ-meta-painel')) integRenderMeta();
  if(document.getElementById('integ-wa-painel')) integRenderWhats();
}
function integDesconectarMeta(){
  showConfirm('Desconectar a conta da Meta?\n\nOs leads dos formulários param de cair no CRM e o Gerenciador de Anúncios fica vazio. O histórico continua salvo.',async()=>{
    const r=await integChamar('meta_desconectar');
    if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
    showToast('Conta da Meta desconectada.','ti-plug-off');
    await integCarregarStatus(true);
    integRenderMeta();
  });
}
async function integContaPadrao(conta){
  const r=await integChamar('meta_conta_padrao',{conta});
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
  showToast('Conta de anúncio padrão atualizada.','ti-check');
  await integCarregarStatus(true);
}

// ── Painel: WhatsApp Business ───────────────────────────────────────────────
async function integRenderWhats(){
  const el=document.getElementById('integ-wa-painel');
  if(!el) return;
  el.innerHTML=integCarregando();
  const st=await integCarregarStatus(true);
  if(!document.getElementById('integ-wa-painel')) return;
  if(!st){ el.innerHTML=window._integ.erroStatus==='sql'?integAvisoSQL():`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(window._integ.erroStatus||'Não consegui carregar.')}</div>`; return; }
  const g=!!st.gestor;
  const nums=st.numeros||[];
  const metaExp=st.meta&&st.meta.expira_em?integData(st.meta.expira_em):null;
  let h=`<div class="integ2-sec"><div class="integ2-sec-tit"><i class="ti ti-device-mobile-message"></i>Números conectados</div>`;
  if(!nums.length){
    h+=`<div class="integ2-mini" style="margin-bottom:10px">Nenhum número ainda. ${st.meta?'Clique em <strong>Atualizar lista</strong> em Meta / Facebook Ads (se você liberou o WhatsApp na conexão) ou adicione abaixo.':'Conecte a Meta (o número aparece sozinho) ou adicione abaixo.'}</div>`;
  }
  h+=nums.map(n=>`<div class="integ2-numero${n.ativo?'':' off'}">
      <div class="integ2-numero-ic"><i class="ti ti-brand-whatsapp"></i></div>
      <div class="integ2-numero-txt">
        <div class="integ2-numero-tit">${esc(n.numero||n.phone_number_id)} ${n.padrao?'<span class="integ2-tag">padrão</span>':''} ${n.qualidade?`<span class="integ2-tag q-${esc(String(n.qualidade).toLowerCase())}" title="Qualidade do número na Meta">${({GREEN:'qualidade alta',YELLOW:'qualidade média',RED:'qualidade baixa'})[n.qualidade]||esc(n.qualidade)}</span>`:''}</div>
        <div class="integ2-mini">${esc(n.nome_verificado||'')} · ${n.token_proprio?'<i class="ti ti-key"></i> token permanente':`usa a conexão da Meta${metaExp?' (vale até '+metaExp+')':''}`}</div>
      </div>
      ${g?`<div class="integ2-numero-acoes">
        <select class="fi integ2-sel-p" title="Dono do número" onchange="integNumeroAtualizar('${esc(n.id)}',{dono_id:this.value||null})"><option value="">Número da empresa</option>${_integOpcoesUsuarios(n.dono_id)}</select>
        ${n.padrao?'':`<button class="btn bg bsm" onclick="integNumeroAtualizar('${esc(n.id)}',{padrao:true})">Tornar padrão</button>`}
        <button class="btn bg bsm" onclick="integNumeroToken('${esc(n.phone_number_id)}','${esc(n.waba_id)}')"><i class="ti ti-key"></i>Token</button>
        <button class="btn bd bsm" onclick="integNumeroRemover('${esc(n.id)}')" title="Remover do CRM"><i class="ti ti-trash"></i></button>
      </div>`:(n.dono_id?`<div class="integ2-mini">${esc(integNomeUser(n.dono_id))}</div>`:'')}
    </div>`).join('');
  h+=`</div>`;
  if(g){
    h+=`<details class="integ2-det" id="integ-wa-add"${nums.length?'':' open'}><summary><i class="ti ti-plus"></i> Adicionar número manualmente</summary>
      <div class="integ2-mini" style="margin:8px 0">No <a href="https://business.facebook.com/" target="_blank" rel="noopener">Gerenciador de Negócios</a> → WhatsApp Manager → Telefones você encontra o ID do número e o ID da conta. O token permanente vem de Configurações do negócio → Usuários do sistema → Gerar token (permissões whatsapp_business_messaging e whatsapp_business_management).</div>
      <div class="g2"><div class="field"><label>ID do número (Phone Number ID)</label><input class="fi" id="wa-add-pnid" inputmode="numeric" placeholder="Ex.: 123456789012345"></div>
        <div class="field"><label>ID da conta (WABA ID)</label><input class="fi" id="wa-add-waba" inputmode="numeric" placeholder="Ex.: 987654321098765"></div></div>
      <div class="field"><label>Token permanente (usuário do sistema)</label><input class="fi" id="wa-add-token" type="password" autocomplete="off" placeholder="EAA… (deixe vazio para usar a conexão da Meta)"></div>
      <button class="btn bp" id="wa-add-btn" onclick="integNumeroSalvar()"><i class="ti ti-check"></i>Salvar número</button>
    </details>`;
  }
  if(nums.length&&can('whatsapp_send')){
    h+=`<div class="integ2-sec"><div class="integ2-sec-tit"><i class="ti ti-template"></i>Modelos de mensagem</div>
      <div class="integ2-mini" style="margin-bottom:10px">Para falar com quem não mandou mensagem nas últimas 24 horas (primeiro contato, pós-venda, disparos), a Meta exige um modelo aprovado. A aprovação costuma sair em minutos.</div>
      <div id="integ-wa-modelos">${integCarregando('Buscando modelos…')}</div>
      ${g?`<button class="btn bg bsm" style="margin-top:10px" onclick="integCriarModelos()"><i class="ti ti-sparkles"></i>Criar os modelos sugeridos do Evolux</button>`:''}
    </div>`;
  }
  h+=`<div class="integ2-mini integ2-custos"><i class="ti ti-coin"></i> Custos da Meta: responder quem escreveu nas últimas 24h é grátis. Mensagens com modelo são cobradas por envio (no Brasil, cerca de R$ 0,32 as de marketing e centavos as de utilidade). Quem chega por anúncio de clique para o WhatsApp tem 72h grátis.</div>`;
  el.innerHTML=h;
  if(nums.length&&can('whatsapp_send')) integListarModelos();
}
async function integListarModelos(renovar){
  const box=document.getElementById('integ-wa-modelos');
  if(!box) return;
  const r=await integChamar('wa_modelos',{renovar:!!renovar});
  if(!document.getElementById('integ-wa-modelos')) return;
  if(!r.ok){ box.innerHTML=`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(r.erro)}</div>`; return; }
  window._integ.modelos=r.modelos||[];
  if(!r.modelos.length){ box.innerHTML='<div class="integ2-mini">Nenhum modelo nesta conta ainda.</div>'; return; }
  const st={APPROVED:['aprovado','ok'],PENDING:['em análise','pend'],REJECTED:['recusado','erro'],PAUSED:['pausado','pend'],DISABLED:['desativado','erro']};
  box.innerHTML=`<div class="integ2-tabela"><table><thead><tr><th>Modelo</th><th>Tipo</th><th>Situação</th><th>Texto</th></tr></thead><tbody>${r.modelos.map(m=>{
    const s=st[m.status]||[String(m.status||'').toLowerCase(),'pend'];
    return `<tr><td><strong>${esc(m.nome)}</strong><div class="integ2-mini">${esc(m.idioma)}</div></td><td>${esc(({MARKETING:'Marketing',UTILITY:'Utilidade',AUTHENTICATION:'Autenticação'})[m.categoria]||m.categoria||'')}</td>
      <td><span class="integ2-st ${s[1]}">${esc(s[0])}</span>${m.suportado?'':`<div class="integ2-mini">não dá para usar no CRM: ${esc(m.motivo)}</div>`}</td><td class="integ2-corpo">${esc(m.corpo)}</td></tr>`;}).join('')}</tbody></table></div>
    <button class="btn bg bsm" style="margin-top:8px" onclick="integListarModelos(true)"><i class="ti ti-refresh"></i>Atualizar situação</button>`;
}
async function integCriarModelos(){
  const r=await integChamar('wa_criar_modelos');
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
  showToast((r.modelos||[]).map(m=>`${m.nome}: ${m.situacao}`).join(' · '),'ti-template');
  integListarModelos(true);
}
async function integNumeroSalvar(){
  const b=document.getElementById('wa-add-btn');
  const dados={phone_number_id:document.getElementById('wa-add-pnid').value.trim(),waba_id:document.getElementById('wa-add-waba').value.trim(),token:document.getElementById('wa-add-token').value.trim()};
  if(!dados.phone_number_id||!dados.waba_id){showToast('Preencha o ID do número e o ID da conta.','ti-alert-triangle','#d97706');return;}
  if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader-2 integ2-gira"></i>Conferindo com a Meta…';}
  const r=await integChamar('wa_numero_salvar',dados);
  if(b){b.disabled=false;b.innerHTML='<i class="ti ti-check"></i>Salvar número';}
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
  showToast(`Número ${r.numero||''} conectado!`,'ti-brand-whatsapp');
  (r.avisos||[]).forEach(a=>showToast(a,'ti-alert-triangle','#d97706'));
  await integCarregarStatus(true);
  integRenderWhats();
}
function integNumeroToken(pnid,waba){
  const det=document.getElementById('integ-wa-add');
  if(!det) return;
  det.open=true;
  document.getElementById('wa-add-pnid').value=pnid;
  document.getElementById('wa-add-waba').value=waba;
  const t=document.getElementById('wa-add-token'); t.value=''; t.focus();
  det.scrollIntoView({behavior:'smooth',block:'center'});
}
async function integNumeroAtualizar(id,dados){
  const r=await integChamar('wa_numero_atualizar',{id,...dados});
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
  showToast('Número atualizado.','ti-check');
  await integCarregarStatus(true);
  integRenderWhats();
}
function integNumeroRemover(id){
  showConfirm('Remover este número do CRM?\n\nAs conversas já salvas continuam no histórico, mas não chegam mensagens novas por ele.',async()=>{
    const r=await integChamar('wa_numero_remover',{id});
    if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
    await integCarregarStatus(true);
    integRenderWhats();
  });
}

// ── Cartões da tela "Integrações" com a situação real ───────────────────────
async function integAtualizarCartoes(){
  const st=await integCarregarStatus();
  const pintar=(id,on,txtOn,txtOff)=>{const el=document.getElementById(id);if(!el)return;el.className='integ-status '+(on?'on':'off');el.innerHTML=`<i class="ti ti-${on?'circle-check':'circle-dashed'}"></i>${on?txtOn:txtOff}`;};
  if(!st){ ['integ-st-meta','integ-st-wa','integ-st-ia'].forEach(id=>pintar(id,false,'',window._integ.erroStatus==='sql'?'Falta instalar':'—')); return; }
  pintar('integ-st-meta',!!st.meta,'Conectado','Não conectado');
  const n=(st.numeros||[]).filter(x=>x.ativo).length;
  pintar('integ-st-wa',n>0,`${n} número${n!==1?'s':''}`,'Não configurado');
  const ia=st.ia||{};
  const ligadas=['primeiro_atendimento','pos_venda'].filter(t=>ia[t]&&ia[t].ativo).length;
  pintar('integ-st-ia',ligadas>0,`${ligadas} ligada${ligadas!==1?'s':''}`,'Desligada');
}

// ── Botão "WhatsApp" no detalhe do lead ─────────────────────────────────────
function waAbrirDoLeadDetalhe(){
  const l=leads.find(x=>x.id===_leadDetalheId);
  if(!l||!l.sb_id) return;
  closeLeadDetalhe();
  waAbrirLead(String(l.sb_id));
}

// ── Avisos em tempo real (mensagens, conversas da IA, disparos) ─────────────
window._integRealtime=function(tabela,payload){
  try{ if(tabela==='wa_mensagens'&&typeof window._waRealtimeMsg==='function') window._waRealtimeMsg(payload); }catch(e){console.warn(e);}
  try{ if(tabela==='ia_conversas'&&typeof window._waRealtimeConversa==='function') window._waRealtimeConversa(payload); }catch(e){console.warn(e);}
  try{ if(tabela==='ia_conversas'&&typeof window._iaRealtime==='function') window._iaRealtime(payload); }catch(e){console.warn(e);}
  try{ if(tabela==='wa_disparos'&&typeof window._waRealtimeDisparo==='function') window._waRealtimeDisparo(payload); }catch(e){console.warn(e);}
};

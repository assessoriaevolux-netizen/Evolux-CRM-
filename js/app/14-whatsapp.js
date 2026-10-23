// ─── WHATSAPP (Cloud API da Meta) ─────────────────────────────────────────────
// Conversas dos leads que a pessoa pode ver, envio pelo número da empresa, modelos
// aprovados fora da janela de 24h e disparo em massa. Tudo passa por crm-integracoes.
const WA={aba:'conversas',conversas:[],carregou:false,busca:'',leadAtual:null,msgs:[],conversaIA:null,
  modelos:null,disp:{sel:new Set(),filtros:{etapa:'',tipo:'',resp:'',origem:'',busca:''},modelo:'',campos:[],confirmando:false,acompanhar:null},
  mobileChat:false};
const WA_CAMPOS=[['primeiro_nome','Primeiro nome do lead'],['nome','Nome completo'],['tipo','Tipo de bem'],['credito','Crédito'],
  ['etapa','Etapa do funil'],['responsavel','Primeiro nome do responsável'],['empresa','Nome da empresa'],['texto:','Texto fixo…']];
const WA_CAMPOS_SUGERIDOS={evolux_primeiro_contato:['primeiro_nome','tipo','empresa'],evolux_pos_venda:['primeiro_nome','empresa'],evolux_novidades:['primeiro_nome','empresa']};

function _waLeadsVisiveis(){const v=getVisiveisParaMim();const g=isGestor();return leads.filter(l=>l.sb_id&&(g||v.has(l.responsavelId)));}
function _waPrimeiroNome(n){const p=String(n||'').trim().split(/\s+/)[0]||'';return p&&(p===p.toUpperCase()||p===p.toLowerCase())?p.charAt(0).toUpperCase()+p.slice(1).toLowerCase():p;}
function _waValor(campo,lead){
  const k=String(campo||'');
  if(k.startsWith('texto:'))return k.slice(6);
  const resp=lead?users.find(u=>u.id===lead.responsavelId):null;
  switch(k){
    case 'primeiro_nome':return _waPrimeiroNome(lead&&lead.nome)||'tudo bem';
    case 'nome':return (lead&&lead.nome)||'cliente';
    case 'tipo':return String((lead&&lead.tipo)||'consórcio').toLowerCase();
    case 'credito':return fmtR((lead&&lead.credito)||0);
    case 'etapa':return lead?etapaLabel(lead.etapa):'';
    case 'responsavel':return _waPrimeiroNome(resp&&resp.nome)||'nosso consultor';
    case 'empresa':return (window.empresa&&window.empresa.nome)||'nossa empresa';
    default:return k;
  }
}
function _waRender(corpo,vars,valores){
  let t=corpo||'';
  (vars||[]).forEach((v,i)=>{t=t.split(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`,'g')).join(valores[i]||'');});
  return t;
}
function _waIniciais(n){const p=String(n||'?').trim().split(/\s+/);return ((p[0]||'?')[0]+(p.length>1?p[p.length-1][0]:'')).toUpperCase();}
function _waHora(iso){const d=new Date(iso);const hoje=new Date();return d.toDateString()===hoje.toDateString()?d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}

async function renderWhatsapp(){
  const tab=document.getElementById('tab-whatsapp');
  if(!tab) return;
  if(!tab.querySelector('.wa2')) tab.innerHTML=`<div class="wa2"><div id="wa2-topo"></div><div id="wa2-corpo">${integCarregando()}</div></div>`;
  const st=await integCarregarStatus();
  const topo=document.getElementById('wa2-topo');
  const corpo=document.getElementById('wa2-corpo');
  if(!topo||!corpo) return;
  if(!st){ topo.innerHTML=''; corpo.innerHTML=window._integ.erroStatus==='sql'?integAvisoSQL():`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(window._integ.erroStatus||'Não consegui carregar.')}</div>`; return; }
  const nums=integNumeros();
  const podeDisparo=can('whatsapp_bulk');
  if(!podeDisparo&&WA.aba==='disparo') WA.aba='conversas';
  topo.innerHTML=`<div class="wa2-topo">
    <div class="wa2-tit"><i class="ti ti-brand-whatsapp"></i>WhatsApp
      ${nums.length?`<span class="integ2-tag ok"><i class="ti ti-circle-check"></i>${nums.length===1?esc(nums[0].numero||'conectado'):nums.length+' números'}</span>`:'<span class="integ2-tag">não conectado</span>'}</div>
    ${nums.length&&podeDisparo?`<div class="wa2-abas">
      <button class="${WA.aba==='conversas'?'on':''}" onclick="WA.aba='conversas';renderWhatsapp()"><i class="ti ti-messages"></i>Conversas</button>
      <button class="${WA.aba==='disparo'?'on':''}" onclick="WA.aba='disparo';renderWhatsapp()"><i class="ti ti-send"></i>Disparo em massa</button></div>`:''}
  </div>`;
  if(!nums.length){
    corpo.innerHTML=`<div class="integ2-vazio"><div class="integ2-vazio-ic wa"><i class="ti ti-brand-whatsapp"></i></div>
      <div class="integ2-vazio-tit">Nenhum número de WhatsApp conectado</div>
      <div class="integ2-vazio-txt">Conecte o WhatsApp Business da empresa para conversar com os leads, deixar a IA atender e fazer disparos — tudo registrado no CRM.</div>
      ${st.gestor?`<button class="btn bp" onclick="integIrPara('whatsapp-cfg')"><i class="ti ti-settings"></i>Configurar WhatsApp</button>`:'<div class="integ2-mini"><i class="ti ti-lock"></i> Peça ao gestor para conectar o WhatsApp da empresa.</div>'}</div>`;
    return;
  }
  if(WA.aba==='disparo') return _waRenderDisparo(corpo);
  if(!corpo.querySelector('.wa2-layout')){
    corpo.innerHTML=`<div class="wa2-layout${WA.mobileChat?' chat-aberto':''}" id="wa2-layout">
      <aside class="wa2-lista">
        <div class="wa2-lista-topo">
          <div class="wa2-busca"><i class="ti ti-search"></i><input type="search" id="wa2-busca" placeholder="Buscar por nome ou telefone" value="${esc(WA.busca)}" oninput="WA.busca=this.value;_waBuscaDebounced()"></div>
          ${can('whatsapp_send')?'<button class="btn bp bsm" onclick="waNovaConversa()" title="Nova conversa"><i class="ti ti-message-plus"></i></button>':''}
        </div>
        <div class="wa2-conversas" id="wa2-conversas">${integCarregando('Carregando conversas…')}</div>
      </aside>
      <section class="wa2-chat" id="wa2-chat"></section>
    </div>`;
  }
  document.getElementById('wa2-layout')?.classList.toggle('chat-aberto',!!(WA.mobileChat&&WA.leadAtual));
  _waRenderChat();
  await waCarregarConversas();
}
let _waBuscaT=null;
function _waBuscaDebounced(){clearTimeout(_waBuscaT);_waBuscaT=setTimeout(()=>waCarregarConversas(),300);}

async function waCarregarConversas(){
  const r=await window._rpc('integ_wa_conversas',{p_busca:WA.busca||null,p_limite:120});
  const box=document.getElementById('wa2-conversas');
  if(r.error){ if(box) box.innerHTML=`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(r.error.message||'erro')}</div>`; return; }
  WA.conversas=r.data||[];
  WA.carregou=true;
  _waAtualizarBadge();
  if(!box) return;
  if(!WA.conversas.length){
    box.innerHTML=`<div class="wa2-lista-vazia"><i class="ti ti-message-off"></i><div>${WA.busca?'Nenhuma conversa encontrada.':'Nenhuma conversa ainda. Quando um lead mandar mensagem, ela aparece aqui.'}</div></div>`;
    return;
  }
  box.innerHTML=WA.conversas.map(c=>{
    const prefixo=c.ultima_direcao==='saida'?(c.ultima_ia?'IA: ':'Você: '):'';
    const ativa=WA.leadAtual===c.lead_id;
    return `<button class="wa2-conv${ativa?' on':''}${c.nao_lidas?' nova':''}" onclick="waAbrirLead('${esc(c.lead_id)}')">
      <span class="wa2-av">${esc(_waIniciais(c.nome))}</span>
      <span class="wa2-conv-txt"><span class="wa2-conv-l1"><span class="wa2-conv-nome">${esc(c.nome||'Lead')}</span><span class="wa2-conv-hora">${esc(integHaQuanto(c.ultima_em))}</span></span>
        <span class="wa2-conv-l2"><span class="wa2-conv-ult">${esc(prefixo+(c.ultima||''))}</span>
        ${c.ia_status==='ativa'?'<span class="wa2-chip ia" title="A IA está atendendo"><i class="ti ti-robot"></i></span>':''}
        ${c.nao_lidas?`<span class="wa2-badge">${c.nao_lidas}</span>`:''}</span></span>
    </button>`;}).join('');
}
function _waAtualizarBadge(){
  const n=(WA.conversas||[]).reduce((s,c)=>s+(c.nao_lidas||0),0);
  const btn=document.querySelector(`.nb[onclick*="'whatsapp'"]`);
  if(!btn) return;
  let b=btn.querySelector('.nb-badge');
  if(!n){ if(b) b.remove(); return; }
  if(!b){ b=document.createElement('span'); b.className='nb-badge'; btn.appendChild(b); }
  b.textContent=n>99?'99+':String(n);
}

// Abre a conversa de um lead (a partir da lista, do detalhe do lead ou da aba IA)
async function waAbrirLead(leadSb){
  WA.leadAtual=String(leadSb);
  WA.mobileChat=true;
  WA.aba='conversas';
  if(!document.getElementById('tab-whatsapp')?.classList.contains('active')){ showTab('whatsapp'); }
  else if(!document.getElementById('wa2-layout')) await renderWhatsapp();
  document.getElementById('wa2-layout')?.classList.add('chat-aberto');
  document.querySelectorAll('.wa2-conv').forEach(b=>b.classList.toggle('on',b.getAttribute('onclick')?.includes(`'${leadSb}'`)));
  WA.msgs=null;WA.conversaIA=null;
  _waRenderChat();
  const [m,c]=await Promise.all([
    window._sb.from('wa_mensagens').select('*').eq('lead_id',WA.leadAtual).order('criado_em',{ascending:false}).limit(150),
    window._sb.from('ia_conversas').select('*').eq('lead_id',WA.leadAtual).order('atualizado_em',{ascending:false}).limit(1),
  ]);
  if(WA.leadAtual!==String(leadSb)) return;
  WA.msgs=(m.data||[]).reverse();
  WA.conversaIA=(c.data||[])[0]||null;
  _waRenderChat();
}
function waFecharChat(){WA.mobileChat=false;WA.leadAtual=null;document.getElementById('wa2-layout')?.classList.remove('chat-aberto');_waRenderChat();}

function _waJanela(){
  const ult=[...(WA.msgs||[])].reverse().find(m=>m.direcao==='entrada');
  if(!ult) return null;
  const ate=new Date(ult.criado_em).getTime()+24*3600*1000;
  return ate>Date.now()?ate:null;
}
function _waStatusIcone(m){
  if(m.direcao!=='saida')return '';
  const mapa={pendente:['ti-clock','Enviando'],enviada:['ti-check','Enviada'],entregue:['ti-checks','Entregue'],lida:['ti-checks lida','Lida'],falhou:['ti-alert-circle falhou','Não enviada']};
  const [ic,t]=mapa[m.status]||['ti-check',''];
  return `<i class="ti ${ic}" title="${t}${m.erro?': '+esc(m.erro):''}"></i>`;
}
function _waRenderChat(){
  const box=document.getElementById('wa2-chat');
  if(!box) return;
  if(!WA.leadAtual){
    box.innerHTML=`<div class="wa2-chat-vazio"><i class="ti ti-messages"></i><div>Escolha uma conversa ao lado${can('whatsapp_send')?' ou comece uma nova':''}.</div></div>`;
    return;
  }
  const lead=integLeadPorSb(WA.leadAtual);
  const conv=WA.conversas.find(c=>c.lead_id===WA.leadAtual)||{};
  const nome=(lead&&lead.nome)||conv.nome||'Lead';
  const tel=formatTelefone((lead&&lead.tel)||conv.telefone||'');
  const resp=lead?users.find(u=>u.id===lead.responsavelId):integUserPorSb(conv.responsavel_id);
  const etapa=(lead&&lead.etapa)||conv.etapa||'';
  const ia=WA.conversaIA;
  const iaLigada=((window._integ.status||{}).ia||{})[etapa==='Fechado / Convertido'?'pos_venda':'primeiro_atendimento']?.ativo;
  let barra='';
  if(ia&&ia.status==='ativa') barra=`<div class="wa2-ia on"><i class="ti ti-robot"></i><span>A IA está atendendo este lead (${ia.tipo==='pos_venda'?'pós-venda':'primeiro atendimento'}).</span>${can('whatsapp_send')?`<button class="btn bg bsm" onclick="waIA('assumir')">Assumir a conversa</button>`:''}</div>`;
  else if(ia&&ia.status==='humano'&&iaLigada) barra=`<div class="wa2-ia"><i class="ti ti-user-check"></i><span>${esc(ia.motivo||'Atendimento humano')}. A IA não responde este lead.</span>${can('whatsapp_send')?`<button class="btn bg bsm" onclick="waIA('devolver')">Devolver para a IA</button>`:''}</div>`;
  else if(ia&&ia.status==='encerrada') barra=`<div class="wa2-ia off"><i class="ti ti-bell-off"></i><span>O cliente pediu para não receber mais mensagens automáticas.</span></div>`;
  const msgs=WA.msgs;
  let corpo;
  if(msgs===null) corpo=integCarregando('Carregando mensagens…');
  else if(!msgs.length) corpo=`<div class="wa2-chat-vazio peq"><i class="ti ti-message-circle"></i><div>Nenhuma mensagem com este lead ainda.</div></div>`;
  else{
    let dia='';
    corpo=msgs.map(m=>{
      const d=new Date(m.criado_em).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
      const sep=d!==dia?`<div class="wa2-dia"><span>${esc(d)}</span></div>`:'';
      dia=d;
      const quem=m.direcao==='saida'?(m.ia?'<span class="wa2-quem ia"><i class="ti ti-robot"></i>IA</span>':(m.enviado_por?`<span class="wa2-quem">${esc(_waPrimeiroNome(integNomeUser(m.enviado_por)))}</span>`:'')):'';
      return `${sep}<div class="wa2-msg ${m.direcao==='saida'?'saida':'entrada'}${m.status==='falhou'?' falhou':''}">
        ${m.tipo==='template'?`<div class="wa2-modelo-tag"><i class="ti ti-template"></i>${esc(m.template_nome||'modelo')}</div>`:''}
        <div class="wa2-msg-txt">${esc(m.conteudo||'')}</div>
        <div class="wa2-msg-meta">${quem}<span>${new Date(m.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>${_waStatusIcone(m)}</div>
        ${m.status==='falhou'&&m.erro?`<div class="wa2-msg-erro">${esc(m.erro)}</div>`:''}
      </div>`;}).join('');
  }
  const janela=msgs?_waJanela():null;
  let compositor;
  if(!can('whatsapp_send')) compositor=`<div class="wa2-compositor bloq"><i class="ti ti-lock"></i>Você pode ver as conversas, mas não enviar mensagens.</div>`;
  else if(msgs===null) compositor='';
  else if(janela) compositor=`<div class="wa2-compositor">
      <textarea id="wa2-texto" rows="1" placeholder="Escreva uma mensagem" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();waEnviarTexto();}" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'"></textarea>
      <button class="btn bg" onclick="waAbrirModelo()" title="Enviar um modelo"><i class="ti ti-template"></i></button>
      <button class="btn bp" id="wa2-enviar" onclick="waEnviarTexto()"><i class="ti ti-send"></i>Enviar</button>
    </div><div class="wa2-janela">Janela de 24h aberta até ${new Date(janela).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} — mensagens livres são grátis.</div>`;
  else compositor=`<div class="wa2-compositor fechado"><i class="ti ti-clock-off"></i><span>${msgs.length?'Faz mais de 24 horas que o cliente não escreve.':'O cliente ainda não escreveu.'} Para puxar a conversa, a Meta exige um modelo aprovado.</span>
      <button class="btn bp" onclick="waAbrirModelo()"><i class="ti ti-template"></i>Enviar modelo</button></div>`;
  box.innerHTML=`<div class="wa2-chat-topo">
      <button class="wa2-voltar" onclick="waFecharChat()" title="Voltar"><i class="ti ti-arrow-left"></i></button>
      <span class="wa2-av">${esc(_waIniciais(nome))}</span>
      <div class="wa2-chat-id"><div class="wa2-chat-nome">${esc(nome)}</div><div class="integ2-mini">${esc(tel)}${etapa?' · '+esc(etapaLabel(etapa)):''}${resp?' · '+esc(resp.nome):''}</div></div>
      ${lead?`<button class="btn bg bsm" onclick="openLeadDetalhe(${lead.id})"><i class="ti ti-id"></i><span class="wa2-esconde-cel">Ver lead</span></button>`:''}
    </div>${barra}
    <div class="wa2-msgs" id="wa2-msgs">${corpo}</div>${compositor}`;
  const mb=document.getElementById('wa2-msgs');
  if(mb) mb.scrollTop=mb.scrollHeight;
}
async function waEnviarTexto(){
  const t=document.getElementById('wa2-texto');
  const txt=(t&&t.value||'').trim();
  if(!txt||!WA.leadAtual) return;
  const b=document.getElementById('wa2-enviar');
  if(b){b.disabled=true;}
  const r=await integChamar('wa_enviar',{lead_id:WA.leadAtual,texto:txt});
  if(b){b.disabled=false;}
  if(!r.ok){
    showToast(r.erro,'ti-alert-triangle','#dc2626');
    if(r.codigo==='fora_da_janela') waAbrirModelo();
    if(r.mensagem) _waJuntarMsg(r.mensagem);
    return;
  }
  if(t){t.value='';t.style.height='auto';}
  _waJuntarMsg(r.mensagem);
  if(WA.conversaIA&&WA.conversaIA.status==='ativa') WA.conversaIA.status='humano';
  _waRenderChat();
  waCarregarConversas();
}
function _waJuntarMsg(m){
  if(!m||!WA.msgs||String(m.lead_id)!==WA.leadAtual) return;
  const i=WA.msgs.findIndex(x=>x.id===m.id);
  if(i>=0) WA.msgs[i]={...WA.msgs[i],...m}; else WA.msgs.push(m);
  WA.msgs.sort((a,b)=>new Date(a.criado_em)-new Date(b.criado_em));
}
async function waIA(acao){
  const r=await integChamar(acao==='assumir'?'ia_assumir':'ia_devolver',{lead_id:WA.leadAtual});
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return;}
  showToast(acao==='assumir'?'Pronto: você está atendendo, a IA não responde mais este lead.':'A IA volta a responder este lead.',acao==='assumir'?'ti-user-check':'ti-robot');
  const {data}=await window._sb.from('ia_conversas').select('*').eq('lead_id',WA.leadAtual).order('atualizado_em',{ascending:false}).limit(1);
  WA.conversaIA=(data||[])[0]||null;
  _waRenderChat();
}

// ── Modelos (fora da janela de 24h) ─────────────────────────────────────────
async function _waCarregarModelos(forcar){
  if(WA.modelos&&!forcar) return WA.modelos;
  const r=await integChamar('wa_modelos',{renovar:!!forcar});
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');return null;}
  WA.modelos=r.modelos||[];
  return WA.modelos;
}
function _waModelosUsaveis(){return (WA.modelos||[]).filter(m=>m.status==='APPROVED'&&m.suportado);}
function _waCamposPadrao(m){
  const s=WA_CAMPOS_SUGERIDOS[m.nome];
  return m.variaveis.map((v,i)=>(s&&s[i])||(i===0?'primeiro_nome':'empresa'));
}
function _waSelCampo(id,valor,onchange){
  const fixo=String(valor||'').startsWith('texto:');
  return `<div class="wa2-var"><select class="fi" id="${id}" onchange="${onchange}">${WA_CAMPOS.map(([k,t])=>`<option value="${k}"${(fixo?k==='texto:':k===valor)?' selected':''}>${t}</option>`).join('')}</select>
    <input class="fi" id="${id}-fixo" placeholder="Texto" value="${fixo?esc(valor.slice(6)):''}"${fixo?'':' hidden'} oninput="${onchange}"></div>`;
}
function _waLerCampo(id){const s=document.getElementById(id);if(!s)return 'primeiro_nome';return s.value==='texto:'?'texto:'+(document.getElementById(id+'-fixo').value||''):s.value;}
async function waAbrirModelo(){
  if(!WA.leadAtual) return;
  let ov=document.getElementById('wa2-modal');
  if(!ov){ov=document.createElement('div');ov.id='wa2-modal';ov.className='modal-bg';ov.onclick=e=>{if(e.target===ov)ov.classList.remove('open');};document.body.appendChild(ov);}
  ov.innerHTML=`<div class="modal-box" style="max-width:520px"><div class="modal-hdr"><span class="modal-title"><i class="ti ti-template" style="color:var(--g)"></i>Enviar modelo aprovado</span><button class="modal-close" onclick="document.getElementById('wa2-modal').classList.remove('open')"><i class="ti ti-x"></i></button></div><div style="padding:16px" id="wa2-modal-corpo">${integCarregando('Buscando modelos…')}</div></div>`;
  ov.classList.add('open');
  const lista=await _waCarregarModelos();
  const corpo=document.getElementById('wa2-modal-corpo');
  if(!corpo) return;
  const usaveis=lista?_waModelosUsaveis():[];
  if(!usaveis.length){corpo.innerHTML=`<div class="integ2-mini">Nenhum modelo aprovado ainda. ${isGestor()?'Crie os modelos sugeridos em Configurações → WhatsApp Business.':'Peça ao gestor para criar os modelos.'}</div>`;return;}
  const leadM=integLeadPorSb(WA.leadAtual);
  const pref=(leadM&&leadM.etapa==='Fechado / Convertido'?['evolux_pos_venda']:['evolux_primeiro_contato','evolux_novidades']).map(n=>usaveis.find(m=>m.nome===n)).find(Boolean)||usaveis[0];
  corpo.innerHTML=`<div class="field"><label>Modelo</label><select class="fi" id="wa2-m-nome" onchange="_waModalCampos()">${usaveis.map(m=>`<option value="${esc(m.nome)}|${esc(m.idioma)}"${m===pref?' selected':''}>${esc(m.nome)} · ${esc(({MARKETING:'marketing',UTILITY:'utilidade'})[m.categoria]||m.categoria)}</option>`).join('')}</select></div>
    <div id="wa2-m-vars"></div>
    <div class="field"><label>Como vai chegar</label><div class="wa-preview" id="wa2-m-previa"></div></div>
    <div class="integ2-mini" id="wa2-m-custo"></div>
    <div class="ma"><button class="bcn" onclick="document.getElementById('wa2-modal').classList.remove('open')">Cancelar</button><button class="bsv" id="wa2-m-enviar" onclick="waEnviarModelo()"><i class="ti ti-send"></i> Enviar</button></div>`;
  _waModalCampos();
}
function _waModeloSel(id){const [nome,idioma]=(document.getElementById(id)?.value||'').split('|');return _waModelosUsaveis().find(m=>m.nome===nome&&m.idioma===idioma)||null;}
function _waModalCampos(){
  const m=_waModeloSel('wa2-m-nome');
  if(!m) return;
  const lead=integLeadPorSb(WA.leadAtual);
  const padrao=_waCamposPadrao(m);
  const box=document.getElementById('wa2-m-vars');
  box.innerHTML=m.variaveis.length?`<div class="field"><label>Variáveis</label>${m.variaveis.map((v,i)=>`<div class="wa2-var-linha"><span class="wa2-var-n">{{${esc(v)}}}</span>${_waSelCampo('wa2-m-v'+i,padrao[i],'_waModalPrevia()')}</div>`).join('')}</div>`:'';
  document.getElementById('wa2-m-custo').innerHTML=`<i class="ti ti-coin"></i> Modelo de ${m.categoria==='MARKETING'?'marketing: a Meta cobra cerca de R$ 0,32 por envio no Brasil.':'utilidade: a Meta cobra centavos por envio (grátis dentro da janela de 24h).'}`;
  _waModalPrevia();
  void lead;
}
function _waModalPrevia(){
  const m=_waModeloSel('wa2-m-nome');if(!m)return;
  m.variaveis.forEach((v,i)=>{const s=document.getElementById('wa2-m-v'+i);const f=document.getElementById('wa2-m-v'+i+'-fixo');if(s&&f)f.hidden=s.value!=='texto:';});
  const lead=integLeadPorSb(WA.leadAtual);
  const vals=m.variaveis.map((v,i)=>_waValor(_waLerCampo('wa2-m-v'+i),lead));
  document.getElementById('wa2-m-previa').textContent=_waRender(m.corpo,m.variaveis,vals);
}
async function waEnviarModelo(){
  const m=_waModeloSel('wa2-m-nome');if(!m)return;
  const lead=integLeadPorSb(WA.leadAtual);
  const valores=m.variaveis.map((v,i)=>_waValor(_waLerCampo('wa2-m-v'+i),lead));
  const b=document.getElementById('wa2-m-enviar');if(b)b.disabled=true;
  const r=await integChamar('wa_enviar_modelo',{lead_id:WA.leadAtual,modelo:m.nome,idioma:m.idioma,valores});
  if(b)b.disabled=false;
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');if(r.mensagem){_waJuntarMsg(r.mensagem);_waRenderChat();}return;}
  document.getElementById('wa2-modal')?.classList.remove('open');
  showToast('Modelo enviado.','ti-brand-whatsapp');
  _waJuntarMsg(r.mensagem);_waRenderChat();waCarregarConversas();
}

// ── Nova conversa ───────────────────────────────────────────────────────────
function waNovaConversa(){
  let ov=document.getElementById('wa2-modal');
  if(!ov){ov=document.createElement('div');ov.id='wa2-modal';ov.className='modal-bg';ov.onclick=e=>{if(e.target===ov)ov.classList.remove('open');};document.body.appendChild(ov);}
  ov.innerHTML=`<div class="modal-box" style="max-width:460px"><div class="modal-hdr"><span class="modal-title"><i class="ti ti-message-plus" style="color:var(--g)"></i>Nova conversa</span><button class="modal-close" onclick="document.getElementById('wa2-modal').classList.remove('open')"><i class="ti ti-x"></i></button></div>
    <div style="padding:16px"><div class="wa2-busca"><i class="ti ti-search"></i><input type="search" id="wa2-nova-busca" placeholder="Nome ou telefone do lead" oninput="_waNovaLista()" autofocus></div><div class="wa2-nova-lista" id="wa2-nova-lista"></div></div></div>`;
  ov.classList.add('open');
  _waNovaLista();
  setTimeout(()=>document.getElementById('wa2-nova-busca')?.focus(),50);
}
function _waNovaLista(){
  const q=(document.getElementById('wa2-nova-busca')?.value||'').toLowerCase().trim();
  const dig=/[a-zà-ú]/i.test(q)?'':q.replace(/\D/g,''); // telefone só quando digitou números
  const lista=_waLeadsVisiveis().filter(l=>l.tel&&(!q||l.nome.toLowerCase().includes(q)||(dig.length>=3&&String(l.tel).includes(dig)))).slice(0,40);
  const box=document.getElementById('wa2-nova-lista');
  if(!box) return;
  box.innerHTML=lista.length?lista.map(l=>`<button class="wa2-conv" onclick="document.getElementById('wa2-modal').classList.remove('open');waAbrirLead('${esc(l.sb_id)}')"><span class="wa2-av">${esc(_waIniciais(l.nome))}</span><span class="wa2-conv-txt"><span class="wa2-conv-nome">${esc(l.nome)}</span><span class="integ2-mini">${esc(formatTelefone(l.tel))} · ${esc(etapaLabel(l.etapa))}</span></span></button>`).join('')
    :'<div class="integ2-mini" style="padding:10px">Nenhum lead com telefone encontrado.</div>';
}

// ── Disparo em massa ────────────────────────────────────────────────────────
function _waLeadsFiltrados(){
  const f=WA.disp.filtros;
  const q=(f.busca||'').toLowerCase().trim();
  return _waLeadsVisiveis().filter(l=>(!f.etapa||l.etapa===f.etapa)&&(!f.tipo||l.tipo===f.tipo)&&(!f.resp||String(l.responsavelId)===f.resp)&&(!f.origem||(l.origem||'')===f.origem)&&(!q||l.nome.toLowerCase().includes(q)));
}
async function _waRenderDisparo(corpo){
  const D=WA.disp;
  const vis=_waLeadsVisiveis();
  const origens=[...new Set(vis.map(l=>l.origem).filter(Boolean))].sort();
  const pessoas=users.filter(u=>vis.some(l=>l.responsavelId===u.id));
  corpo.innerHTML=`<div class="wa2-disp">
    <div class="wa-card"><div class="wa-card-title"><i class="ti ti-list-check" style="color:var(--g)"></i>1. Escolha os leads</div>
      <div class="wa2-filtros">
        <select class="tfield" onchange="WA.disp.filtros.etapa=this.value;_waDispLista()"><option value="">Todas as etapas</option>${ETAPAS.map(e=>`<option value="${esc(e)}"${D.filtros.etapa===e?' selected':''}>${esc(etapaLabel(e))}</option>`).join('')}</select>
        <select class="tfield" onchange="WA.disp.filtros.tipo=this.value;_waDispLista()"><option value="">Todos os tipos</option>${['Imóvel','Automóvel','Moto','Serviço'].map(t=>`<option${D.filtros.tipo===t?' selected':''}>${t}</option>`).join('')}</select>
        ${pessoas.length>1?`<select class="tfield" onchange="WA.disp.filtros.resp=this.value;_waDispLista()"><option value="">Todos os responsáveis</option>${pessoas.map(u=>`<option value="${u.id}"${D.filtros.resp===String(u.id)?' selected':''}>${esc(u.nome)}</option>`).join('')}</select>`:''}
        <select class="tfield" onchange="WA.disp.filtros.origem=this.value;_waDispLista()"><option value="">Todas as origens</option>${origens.map(o=>`<option${D.filtros.origem===o?' selected':''}>${esc(o)}</option>`).join('')}</select>
        <input class="tfield" type="search" placeholder="Buscar nome" value="${esc(D.filtros.busca)}" oninput="WA.disp.filtros.busca=this.value;_waDispLista()">
      </div>
      <div class="wa-sel-bar"><i class="ti ti-users"></i><span id="wa2-d-cont" style="margin-left:0;color:var(--g);font-weight:600;font-size:12.5px"></span>
        <button class="btn bg bsm" onclick="_waDispMarcar(true)" style="margin-left:auto">Selecionar os filtrados</button><button class="btn bg bsm" onclick="_waDispMarcar(false)">Limpar</button></div>
      <div class="wa-leads-grid" id="wa2-d-lista"></div>
    </div>
    <div class="wa-card"><div class="wa-card-title"><i class="ti ti-template" style="color:var(--b)"></i>2. Escolha o modelo</div><div id="wa2-d-modelo">${integCarregando('Buscando modelos…')}</div></div>
    <div class="wa-card"><div class="wa-card-title"><i class="ti ti-send" style="color:var(--y)"></i>3. Revise e envie</div><div id="wa2-d-envio"></div></div>
    <div class="wa-card"><div class="wa-card-title"><i class="ti ti-history" style="color:var(--tm)"></i>Disparos recentes</div><div id="wa2-d-hist">${integCarregando()}</div></div>
  </div>`;
  _waDispLista();
  _waDispHistorico();
  await _waCarregarModelos();
  _waDispModelo();
}
function _waDispLista(){
  const lista=_waLeadsFiltrados();
  const box=document.getElementById('wa2-d-lista');
  if(!box) return;
  const max=300;
  box.innerHTML=lista.slice(0,max).map(l=>`<label class="wa-lead-item${WA.disp.sel.has(String(l.sb_id))?' sel':''}">
    <input type="checkbox" ${WA.disp.sel.has(String(l.sb_id))?'checked':''} onchange="_waDispToggle('${esc(l.sb_id)}',this.checked,this)">
    <div style="min-width:0"><div class="wa-lead-name">${esc(l.nome)}</div><div class="wa-lead-info">${l.tel?esc(formatTelefone(l.tel)):'<span class="txt-r">sem telefone</span>'} · ${esc(etapaLabel(l.etapa))}</div></div></label>`).join('')
    +(lista.length>max?`<div class="integ2-mini" style="grid-column:1/-1">Mostrando ${max} de ${lista.length}. "Selecionar os filtrados" marca todos os ${lista.length}.</div>`:'')
    +(!lista.length?'<div class="integ2-mini" style="grid-column:1/-1">Nenhum lead com esses filtros.</div>':'');
  _waDispResumo();
}
function _waDispToggle(id,on,el){
  if(on)WA.disp.sel.add(id);else WA.disp.sel.delete(id);
  el?.closest('.wa-lead-item')?.classList.toggle('sel',on);
  WA.disp.confirmando=false;
  _waDispResumo();
}
function _waDispMarcar(on){
  if(on)_waLeadsFiltrados().forEach(l=>WA.disp.sel.add(String(l.sb_id)));else WA.disp.sel.clear();
  WA.disp.confirmando=false;
  _waDispLista();
}
function _waDispModelo(){
  const box=document.getElementById('wa2-d-modelo');
  if(!box) return;
  const us=_waModelosUsaveis();
  if(!us.length){box.innerHTML=`<div class="integ2-mini">Nenhum modelo aprovado. ${isGestor()?'Crie os modelos sugeridos em Configurações → WhatsApp Business e aguarde a aprovação da Meta.':'Peça ao gestor para criar os modelos.'}</div>`;_waDispResumo();return;}
  if(!us.some(m=>`${m.nome}|${m.idioma}`===WA.disp.modelo)){
    const pref=us.find(m=>m.nome==='evolux_novidades')||us.find(m=>m.categoria==='MARKETING')||us[0];
    WA.disp.modelo=`${pref.nome}|${pref.idioma}`;WA.disp.campos=_waCamposPadrao(pref);
  }
  const m=_waModeloSel2();
  box.innerHTML=`<div class="field"><select class="fi" id="wa2-d-nome" onchange="WA.disp.modelo=this.value;const m=_waModeloSel2();WA.disp.campos=m?_waCamposPadrao(m):[];WA.disp.confirmando=false;_waDispModelo()">${us.map(x=>`<option value="${esc(x.nome)}|${esc(x.idioma)}"${`${x.nome}|${x.idioma}`===WA.disp.modelo?' selected':''}>${esc(x.nome)} · ${esc(({MARKETING:'marketing',UTILITY:'utilidade'})[x.categoria]||x.categoria)}</option>`).join('')}</select></div>
    ${m&&m.variaveis.length?`<div class="field"><label>O que vai em cada variável</label>${m.variaveis.map((v,i)=>`<div class="wa2-var-linha"><span class="wa2-var-n">{{${esc(v)}}}</span>${_waSelCampo('wa2-d-v'+i,WA.disp.campos[i],'_waDispCampos()')}</div>`).join('')}</div>`:''}
    <div class="field"><label>Prévia (com o primeiro lead selecionado)</label><div class="wa-preview" id="wa2-d-previa"></div></div>`;
  _waDispCampos();
}
function _waModeloSel2(){const [n,i]=(WA.disp.modelo||'').split('|');return _waModelosUsaveis().find(m=>m.nome===n&&m.idioma===i)||null;}
function _waDispCampos(){
  const m=_waModeloSel2();if(!m){_waDispResumo();return;}
  WA.disp.campos=m.variaveis.map((v,i)=>{const s=document.getElementById('wa2-d-v'+i);const f=document.getElementById('wa2-d-v'+i+'-fixo');if(s&&f)f.hidden=s.value!=='texto:';return _waLerCampo('wa2-d-v'+i);});
  const primeiro=_waLeadsVisiveis().find(l=>WA.disp.sel.has(String(l.sb_id)))||_waLeadsFiltrados()[0]||null;
  const p=document.getElementById('wa2-d-previa');
  if(p) p.textContent=_waRender(m.corpo,m.variaveis,WA.disp.campos.map(c=>_waValor(c,primeiro)));
  _waDispResumo();
}
function _waDispResumo(){
  const sel=_waLeadsVisiveis().filter(l=>WA.disp.sel.has(String(l.sb_id)));
  const comTel=sel.filter(l=>normalizaTelefone(l.tel).length>=12);
  const cont=document.getElementById('wa2-d-cont');
  if(cont) cont.textContent=`${sel.length} lead${sel.length!==1?'s':''} selecionado${sel.length!==1?'s':''}`;
  const box=document.getElementById('wa2-d-envio');
  if(!box) return;
  const m=_waModeloSel2();
  if(WA.disp.acompanhar){box.innerHTML=_waDispProgresso(WA.disp.acompanhar);return;}
  const preco=m&&m.categoria==='MARKETING'?0.32:0.04;
  const nums=integNumeros();
  box.innerHTML=`<div class="wa2-resumo">
      <div><strong>${comTel.length}</strong> mensage${comTel.length!==1?'ns':'m'} serão enviadas${sel.length-comTel.length?` · ${sel.length-comTel.length} sem telefone (ficam de fora)`:''}</div>
      ${m?`<div class="integ2-mini">Custo estimado na Meta: cerca de ${fmtR(Math.ceil(comTel.length*preco))} (${m.categoria==='MARKETING'?'marketing':'utilidade'}). Quem pediu para não receber mensagens fica de fora.</div>`:''}
    </div>
    ${nums.length>1?`<div class="field" style="max-width:340px"><label>Enviar pelo número</label><select class="fi" id="wa2-d-num">${nums.map(n=>`<option value="${esc(n.phone_number_id)}"${n.padrao?' selected':''}>${esc(n.numero||n.phone_number_id)}</option>`).join('')}</select></div>`:''}
    ${WA.disp.confirmando?`<div class="wa2-confirma"><i class="ti ti-alert-triangle"></i><span>Confirma o envio para <strong>${comTel.length}</strong> lead${comTel.length!==1?'s':''}? Não dá para desfazer.</span>
        <button class="btn bg" onclick="WA.disp.confirmando=false;_waDispResumo()">Voltar</button><button class="btn bp" id="wa2-d-ok" onclick="waDisparar()"><i class="ti ti-send"></i>Confirmar envio</button></div>`
      :`<button class="wa-send-btn" ${comTel.length&&m?'':'disabled'} onclick="WA.disp.confirmando=true;_waDispResumo()"><i class="ti ti-brand-whatsapp" style="font-size:17px"></i>Revisar e enviar para ${comTel.length} lead${comTel.length!==1?'s':''}</button>`}`;
}
async function waDisparar(){
  const m=_waModeloSel2();if(!m)return;
  const ids=_waLeadsVisiveis().filter(l=>WA.disp.sel.has(String(l.sb_id))&&normalizaTelefone(l.tel).length>=12).map(l=>String(l.sb_id));
  const b=document.getElementById('wa2-d-ok');if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader-2 integ2-gira"></i>Enviando…';}
  const r=await integChamar('wa_disparo',{lead_ids:ids,modelo:m.nome,idioma:m.idioma,campos:WA.disp.campos,phone_number_id:document.getElementById('wa2-d-num')?.value||undefined});
  WA.disp.confirmando=false;
  if(!r.ok){showToast(r.erro,'ti-alert-triangle','#dc2626');_waDispResumo();return;}
  if(r.pediram_para_parar) showToast(`${r.pediram_para_parar} lead${r.pediram_para_parar!==1?'s':''} ficaram de fora porque pediram para não receber mensagens.`,'ti-bell-off','#d97706');
  WA.disp.acompanhar={id:r.disparo_id,total:r.total,enviados:0,falhas:0,status:'enviando'};
  WA.disp.sel.clear();
  _waDispLista();
  _waDispAcompanhar();
}
function _waDispProgresso(d){
  const feitos=(d.enviados||0)+(d.falhas||0);
  const pct=d.total?Math.round(feitos/d.total*100):0;
  const fim=d.status!=='enviando';
  return `<div class="wa2-progresso"><div class="wa2-progresso-tit">${fim?'<i class="ti ti-circle-check"></i> Disparo concluído':'<i class="ti ti-loader-2 integ2-gira"></i> Enviando…'}</div>
    <div class="wa2-barra"><span style="width:${pct}%"></span></div>
    <div class="integ2-mini">${d.enviados||0} enviada${d.enviados!==1?'s':''}${d.falhas?` · ${d.falhas} com erro`:''} de ${d.total}</div>
    ${d.erro?`<div class="integ2-mini txt-r">${esc(d.erro)}</div>`:''}
    ${fim?'<button class="btn bg bsm" style="margin-top:8px" onclick="WA.disp.acompanhar=null;_waDispResumo()">Novo disparo</button>':''}</div>`;
}
async function _waDispAcompanhar(){
  const a=WA.disp.acompanhar;if(!a)return;
  const {data}=await window._sb.from('wa_disparos').select('*').eq('id',a.id).maybeSingle();
  if(data) Object.assign(a,{enviados:data.enviados,falhas:data.falhas,status:data.status,erro:data.erro,total:data.total});
  _waDispResumo();
  if(a.status==='enviando'&&WA.disp.acompanhar===a) setTimeout(_waDispAcompanhar,2000);
  else _waDispHistorico();
}
async function _waDispHistorico(){
  const box=document.getElementById('wa2-d-hist');if(!box)return;
  const {data,error}=await window._sb.from('wa_disparos').select('*').order('criado_em',{ascending:false}).limit(10);
  if(error){box.innerHTML=`<div class="integ2-mini">${esc(error.message)}</div>`;return;}
  if(!data||!data.length){box.innerHTML='<div class="integ2-mini">Nenhum disparo ainda.</div>';return;}
  box.innerHTML=`<div class="integ2-tabela"><table><thead><tr><th>Quando</th><th>Modelo</th><th>Quem</th><th>Enviadas</th><th>Erros</th></tr></thead><tbody>${data.map(d=>`<tr>
    <td>${integData(d.criado_em,true)}</td><td>${esc(d.template_nome)}</td><td>${esc(d.criado_por_nome||'')}</td>
    <td>${d.status==='enviando'?'<i class="ti ti-loader-2 integ2-gira"></i> ':''}${d.enviados} de ${d.total}</td><td>${d.falhas?`<span class="txt-r" title="${esc(d.erro||'')}">${d.falhas}</span>`:'0'}</td></tr>`).join('')}</tbody></table></div>`;
}

// ── Tempo real ──────────────────────────────────────────────────────────────
let _waRecarregarT=null,_waUltimoAviso=0;
window._waRealtimeMsg=function(p){
  const m=p&&p.new;
  if(!m||!m.lead_id||String(m.empresa_id)!==String(window._empresaIdDireto))return;
  const lead=integLeadPorSb(m.lead_id);
  if(!lead&&!isGestor())return; // fora da visão desta pessoa
  const aberta=document.getElementById('tab-whatsapp')?.classList.contains('active');
  if(aberta&&WA.leadAtual===String(m.lead_id)&&WA.msgs){_waJuntarMsg(m);_waRenderChat();}
  clearTimeout(_waRecarregarT);
  _waRecarregarT=setTimeout(()=>waCarregarConversas(),aberta?250:1500);
  if(p.eventType==='INSERT'&&m.direcao==='entrada'&&!(aberta&&WA.leadAtual===String(m.lead_id))&&Date.now()-_waUltimoAviso>4000){
    _waUltimoAviso=Date.now();
    showToast(`Nova mensagem no WhatsApp: ${lead?lead.nome:(m.contato_nome||'lead')}`,'ti-brand-whatsapp');
  }
};
window._waRealtimeConversa=function(p){
  const c=p&&p.new;
  if(!c||String(c.lead_id)!==WA.leadAtual)return;
  WA.conversaIA=c;
  if(document.getElementById('tab-whatsapp')?.classList.contains('active'))_waRenderChat();
};
window._waRealtimeDisparo=function(p){
  const d=p&&p.new;const a=WA.disp.acompanhar;
  if(d&&a&&d.id===a.id){Object.assign(a,{enviados:d.enviados,falhas:d.falhas,status:d.status,erro:d.erro});_waDispResumo();}
};
// Contador de mensagens novas no menu, mesmo fora da aba
setTimeout(function _waBadgeInicial(){
  if(!window.__crmPronto){setTimeout(_waBadgeInicial,1000);return;}
  if(can('whatsapp_view')) window._rpc('integ_wa_conversas',{p_busca:null,p_limite:120}).then(r=>{if(!r.error){WA.conversas=r.data||[];_waAtualizarBadge();}});
},1500);

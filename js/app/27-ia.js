// ─── IA DE ATENDIMENTO (primeiro atendimento e pós-venda) ────────────────────
// Roteiros editáveis pelo gestor, teste de conversa e acompanhamento das conversas.
const IA={roteiros:{},padrao:null,servidor:null,editando:null,teste:{tipo:'primeiro_atendimento',hist:[],enviando:false},conversas:[],filtro:'',modelos:null};
const IA_TIPOS={
  primeiro_atendimento:{tit:'Primeiro atendimento',ic:'ti-message-chatbot',desc:'Responde os leads novos no WhatsApp na hora, qualifica (bem, valor, prazo, lance) e marca a conversa com o consultor.'},
  pos_venda:{tit:'Pós-venda',ic:'ti-heart-handshake',desc:'Depois que a venda fecha, puxa conversa para ver se está tudo certo, tira dúvidas simples e pede indicações.'},
};
const IA_MODELOS=[['gpt-6-luna','GPT-6 Luna — recomendado (mais barato)'],['gpt-6-sol','GPT-6 Sol — mais caprichado (cerca de 20× o custo)']];
const IA_ATRASOS=[['1','1 hora depois'],['24','1 dia depois'],['48','2 dias depois'],['72','3 dias depois'],['168','1 semana depois']];

async function renderIA(){
  const tab=document.getElementById('tab-ia');
  if(!tab) return;
  if(!tab.querySelector('.ia2')) tab.innerHTML=`<div class="ia2">${integCarregando()}</div>`;
  const [st,rot,conv]=await Promise.all([
    integCarregarStatus(true),
    window._sb.from('ia_roteiros').select('*').eq('empresa_id',String(window._empresaIdDireto||'')),
    window._sb.from('ia_conversas').select('*').eq('empresa_id',String(window._empresaIdDireto||'')).order('atualizado_em',{ascending:false}).limit(150),
  ]);
  if(!IA.padrao){ const p=await integChamar('ia_padrao'); if(p.ok) IA.padrao=p; }
  if(!IA.servidor) IA.servidor=await integServidor();
  const box=tab.querySelector('.ia2');
  if(!box) return;
  if(!st){ box.innerHTML=window._integ.erroStatus==='sql'?integAvisoSQL():`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i>${esc(window._integ.erroStatus||'Não consegui carregar.')}</div>`; return; }
  IA.roteiros={};(rot.data||[]).forEach(r=>IA.roteiros[r.tipo]=r);
  IA.conversas=conv.data||[];
  const gerencia=can('ia_manage');
  if(gerencia&&integNumeros().length&&!IA.modelos){ const m=await integChamar('wa_modelos'); if(m.ok) IA.modelos=(m.modelos||[]).filter(x=>x.status==='APPROVED'&&x.suportado); }
  const mes=new Date();mes.setDate(1);mes.setHours(0,0,0,0);
  const doMes=IA.conversas.filter(c=>new Date(c.atualizado_em)>=mes);
  const custo=doMes.reduce((s,c)=>s+Number(c.custo_usd||0),0);
  const msgs=doMes.reduce((s,c)=>s+(c.mensagens_ia||0),0);
  let h=`<div class="ia2-topo"><div class="ads2-tit"><i class="ti ti-robot"></i>IA de atendimento</div>
    <div class="integ2-mini">Este mês: <strong>${msgs}</strong> resposta${msgs!==1?'s':''} da IA em <strong>${doMes.length}</strong> conversa${doMes.length!==1?'s':''} · custo da OpenAI ≈ <strong>US$ ${custo.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div></div>`;
  if(IA.servidor&&!IA.servidor.openai) h+=`<div class="integ2-aviso erro"><i class="ti ti-key"></i><div>Falta a chave da OpenAI no Supabase (segredo <code>OPENAI_API_KEY</code>). Sem ela a IA não responde.</div></div>`;
  if(!integNumeros().length) h+=`<div class="integ2-aviso"><i class="ti ti-brand-whatsapp"></i><div>A IA conversa pelo WhatsApp: conecte um número em Configurações → WhatsApp Business.${isGestor()?` <button class="btn bg bsm" onclick="integIrPara('whatsapp-cfg')">Configurar</button>`:''}</div></div>`;
  h+=`<div class="ia2-cards">${Object.keys(IA_TIPOS).map(t=>_iaCard(t,gerencia)).join('')}</div>`;
  if(gerencia) h+=_iaTestePainel();
  h+=_iaConversasPainel();
  box.innerHTML=h;
  if(gerencia) _iaTesteDesenhar();
  if(gerencia&&IA.editando) _iaCamposModelo(IA.editando);
}
function _iaCard(tipo,gerencia){
  const T=IA_TIPOS[tipo];const r=IA.roteiros[tipo]||{};const cfg=r.config||{};
  const ligada=!!r.ativo;
  const ed=IA.editando===tipo;
  const modeloInicial=cfg.modelo_inicial?`<i class="ti ti-template"></i> mensagem inicial: <strong>${esc(cfg.modelo_inicial)}</strong>`:'<span class="txt-y"><i class="ti ti-alert-triangle"></i> sem mensagem inicial escolhida</span>';
  let resumo=tipo==='pos_venda'
    ?`${esc((IA_ATRASOS.find(a=>a[0]===String(cfg.atraso_horas||'24'))||IA_ATRASOS[1])[1])} da venda · ${modeloInicial}`
    :`Responde quem escreve no WhatsApp${(cfg.etapas||[]).length?` (etapas: ${(cfg.etapas).map(e=>esc(etapaLabel(e))).join(', ')})`:' (Novo lead, Primeiro contato e Aguardando resposta)'} · ${cfg.modelo_inicial?modeloInicial+' para leads de formulário':'só responde quem escreve primeiro'}`;
  return `<div class="ia2-card${ligada?' on':''}">
    <div class="ia2-card-topo">
      <div class="ia2-card-ic"><i class="ti ${T.ic}"></i></div>
      <div class="ia2-card-txt"><div class="ia2-card-tit">${T.tit} <span class="integ2-st ${ligada?'ok':'pend'}">${ligada?'ligada':'desligada'}</span></div><div class="integ2-mini">${T.desc}</div></div>
      ${gerencia?integToggle('ia-on-'+tipo,ligada,`iaLigar('${tipo}',this.checked)`):''}
    </div>
    <div class="integ2-mini ia2-resumo">${resumo} · modelo ${esc(r.modelo||'gpt-6-luna')}</div>
    ${r.ultimo_erro?`<div class="integ2-aviso erro"><i class="ti ti-alert-triangle"></i><div>${esc(r.ultimo_erro)} <span class="integ2-mini">(${esc(integHaQuanto(r.ultimo_erro_em))})</span></div></div>`:''}
    ${gerencia?(ed?_iaEditor(tipo):`<div class="ia2-acoes"><button class="btn bg bsm" onclick="IA.editando='${tipo}';renderIA()"><i class="ti ti-pencil"></i>Editar roteiro</button><button class="btn bg bsm" onclick="IA.teste.tipo='${tipo}';IA.teste.hist=[];renderIA().then(()=>document.getElementById('ia2-teste')?.scrollIntoView({behavior:'smooth'}))"><i class="ti ti-flask"></i>Testar</button></div>`):''}
  </div>`;
}
function _iaSelModelo(tipo,cfg){
  const lista=IA.modelos||[];
  const atual=cfg.modelo_inicial||'';
  if(!integNumeros().length) return '<div class="integ2-mini">Conecte um número de WhatsApp para escolher a mensagem inicial.</div>';
  if(!lista.length) return `<div class="integ2-mini">Nenhum modelo aprovado ainda. ${isGestor()?'Crie os modelos sugeridos em Configurações → WhatsApp Business.':''}</div>`;
  const sug=tipo==='pos_venda'?'evolux_pos_venda':'evolux_primeiro_contato';
  return `<select class="fi" id="ia-ed-modelo-ini" onchange="_iaCamposModelo('${tipo}')"><option value="">— nenhum —</option>${lista.map(m=>`<option value="${esc(m.nome)}|${esc(m.idioma)}"${m.nome===atual?' selected':''}>${esc(m.nome)}${m.nome===sug?' (sugerido)':''}</option>`).join('')}</select>
    <div id="ia-ed-vars"></div><div class="wa-preview" id="ia-ed-previa" style="margin-top:6px"></div>`;
}
function _iaEditor(tipo){
  const r=IA.roteiros[tipo]||{};const cfg=r.config||{};
  const texto=r.roteiro||(IA.padrao&&IA.padrao.roteiros[tipo])||'';
  const modelo=r.modelo||'gpt-6-luna';
  const outro=!IA_MODELOS.some(m=>m[0]===modelo);
  const etapas=(cfg.etapas&&cfg.etapas.length)?cfg.etapas:['Novo lead','Primeiro contato','Aguardando resposta'];
  return `<div class="ia2-editor">
    <div class="field"><label>Roteiro (o que a IA deve fazer, em português simples)</label>
      <textarea class="fi ia2-roteiro" id="ia-ed-roteiro" rows="12" maxlength="12000">${esc(texto)}</textarea>
      <div class="integ2-mini">Pode usar {{empresa}}, {{responsavel}}, {{nome}}, {{tipo}} e {{credito}}. As regras de segurança (não inventar valores, passar para o consultor, respeitar quem pede para parar) já valem sempre.</div></div>
    <div class="g2">
      <div class="field"><label>Modelo de IA</label><select class="fi" id="ia-ed-ia" onchange="document.getElementById('ia-ed-ia-outro').hidden=this.value!=='outro'">${IA_MODELOS.map(([k,t])=>`<option value="${k}"${k===modelo?' selected':''}>${t}</option>`).join('')}<option value="outro"${outro?' selected':''}>Outro…</option></select>
        <input class="fi" id="ia-ed-ia-outro" placeholder="nome do modelo na OpenAI" value="${outro?esc(modelo):''}"${outro?'':' hidden'} style="margin-top:6px"></div>
      ${tipo==='pos_venda'
        ?`<div class="field"><label>Quando mandar</label><select class="fi" id="ia-ed-atraso">${IA_ATRASOS.map(([k,t])=>`<option value="${k}"${k===String(cfg.atraso_horas||'24')?' selected':''}>${t}</option>`).join('')}</select></div>`
        :`<div class="field"><label>Limite de respostas da IA por conversa</label><input class="fi" id="ia-ed-limite" type="number" min="2" max="60" value="${Number(cfg.limite_mensagens)||15}"><div class="integ2-mini">Passou disso, a conversa vai para o responsável.</div></div>`}
    </div>
    ${tipo==='primeiro_atendimento'?`<div class="field"><label>A IA responde leads nestas etapas</label><div class="integ2-chips">${ETAPAS.slice(0,5).map(e=>`<label class="integ2-chip"><input type="checkbox" class="ia-ed-etapa" value="${esc(e)}"${etapas.includes(e)?' checked':''}>${esc(etapaLabel(e))}</label>`).join('')}</div></div>`:''}
    <div class="field"><label>${tipo==='pos_venda'?'Mensagem do pós-venda (modelo aprovado)':'Mensagem inicial para quem preenche formulário do Meta (modelo aprovado)'}</label>
      ${_iaSelModelo(tipo,cfg)}
      ${tipo==='primeiro_atendimento'?'<div class="integ2-mini">Para a IA chamar os leads de formulário, ligue também “IA faz o primeiro contato” na página, em Configurações → Meta.</div>':'<div class="integ2-mini">A Meta só deixa a empresa puxar conversa com modelo aprovado. Quando o cliente responde, a IA continua seguindo o roteiro.</div>'}</div>
    <div class="ia2-acoes">
      <button class="btn bp" onclick="iaSalvar('${tipo}')" id="ia-ed-salvar"><i class="ti ti-check"></i>Salvar roteiro</button>
      <button class="btn bg" onclick="IA.teste.tipo='${tipo}';IA.teste.hist=[];_iaTesteDesenhar();document.getElementById('ia2-teste')?.scrollIntoView({behavior:'smooth'})"><i class="ti ti-flask"></i>Testar este texto</button>
      <button class="btn bg" onclick="document.getElementById('ia-ed-roteiro').value=(IA.padrao&&IA.padrao.roteiros['${tipo}'])||''"><i class="ti ti-restore"></i>Roteiro padrão</button>
      <button class="btn bg" onclick="IA.editando=null;renderIA()">Fechar</button>
    </div>
  </div>`;
}
function _iaModeloIniSel(){const [n,i]=(document.getElementById('ia-ed-modelo-ini')?.value||'').split('|');return (IA.modelos||[]).find(m=>m.nome===n&&m.idioma===i)||null;}
function _iaCamposModelo(tipo){
  const box=document.getElementById('ia-ed-vars');const prev=document.getElementById('ia-ed-previa');
  if(!box) return;
  const m=_iaModeloIniSel();
  if(!m){box.innerHTML='';if(prev){prev.hidden=true;}return;}
  const r=IA.roteiros[tipo]||{};const cfg=r.config||{};
  const salvos=cfg.modelo_inicial===m.nome&&Array.isArray(cfg.modelo_inicial_campos)?cfg.modelo_inicial_campos:_waCamposPadrao(m);
  box.innerHTML=m.variaveis.map((v,i)=>`<div class="wa2-var-linha"><span class="wa2-var-n">{{${esc(v)}}}</span>${_waSelCampo('ia-ed-v'+i,salvos[i],`_iaPreviaModelo()`)}</div>`).join('');
  if(prev) prev.hidden=false;
  _iaPreviaModelo();
}
function _iaPreviaModelo(){
  const m=_iaModeloIniSel();const prev=document.getElementById('ia-ed-previa');if(!m||!prev)return;
  m.variaveis.forEach((v,i)=>{const s=document.getElementById('ia-ed-v'+i);const f=document.getElementById('ia-ed-v'+i+'-fixo');if(s&&f)f.hidden=s.value!=='texto:';});
  const exemplo={nome:'Maria Souza',tipo:'Imóvel',credito:250000,etapa:'Novo lead',responsavelId:(getMe()||{}).id};
  prev.textContent=_waRender(m.corpo,m.variaveis,m.variaveis.map((v,i)=>_waValor(_waLerCampo('ia-ed-v'+i),exemplo)));
}
async function iaSalvar(tipo){
  const r=IA.roteiros[tipo]||{};
  const cfg={...(r.config||{})};
  const iaSel=document.getElementById('ia-ed-ia').value;
  const modelo=(iaSel==='outro'?document.getElementById('ia-ed-ia-outro').value:iaSel).trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9.-]{1,60}$/.test(modelo)){showToast('Nome de modelo inválido.','ti-alert-triangle','#d97706');return;}
  if(tipo==='pos_venda') cfg.atraso_horas=document.getElementById('ia-ed-atraso').value;
  else{
    cfg.limite_mensagens=Math.max(2,Math.min(60,parseInt(document.getElementById('ia-ed-limite').value)||15));
    cfg.etapas=[...document.querySelectorAll('.ia-ed-etapa:checked')].map(i=>i.value);
    if(!cfg.etapas.length){showToast('Marque pelo menos uma etapa.','ti-alert-triangle','#d97706');return;}
  }
  const m=_iaModeloIniSel();
  if(document.getElementById('ia-ed-modelo-ini')){
    if(m){cfg.modelo_inicial=m.nome;cfg.modelo_inicial_idioma=m.idioma;cfg.modelo_inicial_campos=m.variaveis.map((v,i)=>_waLerCampo('ia-ed-v'+i));}
    else{delete cfg.modelo_inicial;delete cfg.modelo_inicial_idioma;delete cfg.modelo_inicial_campos;}
  }
  const b=document.getElementById('ia-ed-salvar');if(b)b.disabled=true;
  const linha={empresa_id:window._empresaIdDireto,tipo,roteiro:document.getElementById('ia-ed-roteiro').value.trim(),modelo,config:cfg,ativo:!!r.ativo};
  const {error}=await window._sb.from('ia_roteiros').upsert(linha,{onConflict:'empresa_id,tipo'});
  if(b)b.disabled=false;
  if(error){showToast('Não salvou: '+error.message,'ti-alert-triangle','#dc2626');return;}
  showToast('Roteiro salvo.','ti-check');
  IA.editando=null;
  await renderIA();
}
async function iaLigar(tipo,on){
  const r=IA.roteiros[tipo];
  const linha=r?{empresa_id:window._empresaIdDireto,tipo,ativo:on,roteiro:r.roteiro,modelo:r.modelo,config:r.config||{}}
    :{empresa_id:window._empresaIdDireto,tipo,ativo:on,roteiro:(IA.padrao&&IA.padrao.roteiros[tipo])||'',modelo:'gpt-6-luna',
      config:tipo==='pos_venda'?{atraso_horas:'24'}:{limite_mensagens:15,etapas:['Novo lead','Primeiro contato','Aguardando resposta']}};
  const {error}=await window._sb.from('ia_roteiros').upsert(linha,{onConflict:'empresa_id,tipo'});
  if(error){showToast('Não salvou: '+error.message,'ti-alert-triangle','#dc2626');renderIA();return;}
  const cfg=linha.config||{};
  if(on&&!cfg.modelo_inicial) showToast(tipo==='pos_venda'?'Pós-venda ligado. Escolha a mensagem do pós-venda (modelo aprovado) em "Editar roteiro" para ele conseguir puxar a conversa.':'IA ligada: ela responde quem escrever no WhatsApp. Para chamar os leads de formulário, escolha a mensagem inicial em "Editar roteiro".','ti-robot',9000);
  else showToast(on?'IA ligada.':'IA desligada.','ti-robot');
  await integCarregarStatus(true);
  renderIA();
}

// ── Teste ───────────────────────────────────────────────────────────────────
function _iaTestePainel(){
  return `<div class="ads2-card" id="ia2-teste">
    <div class="ads2-card-topo"><div class="ads2-card-tit"><i class="ti ti-flask"></i> Testar a conversa</div>
      <select class="tfield" id="ia2-t-tipo" onchange="IA.teste.tipo=this.value;IA.teste.hist=[];_iaTesteDesenhar()">${Object.keys(IA_TIPOS).map(t=>`<option value="${t}">${IA_TIPOS[t].tit}</option>`).join('')}</select></div>
    <div class="integ2-mini" style="margin-bottom:10px">Você faz o papel do cliente. Nada é enviado pelo WhatsApp; só a OpenAI é usada (custa frações de centavo). Se o roteiro estiver aberto para edição, o teste usa o texto que está lá, mesmo sem salvar.</div>
    <div class="g2 ia2-t-lead"><div class="field"><label>Nome do cliente (teste)</label><input class="fi" id="ia2-t-nome" value="Maria Souza"></div>
      <div class="field"><label>Interesse</label><select class="fi" id="ia2-t-bem">${['Imóvel','Automóvel','Moto','Serviço'].map(t=>`<option>${t}</option>`).join('')}</select></div></div>
    <div class="ia2-t-chat" id="ia2-t-chat"></div>
    <div class="wa2-compositor"><textarea id="ia2-t-msg" rows="1" placeholder="Escreva como se fosse o cliente" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();iaTestar();}"></textarea>
      <button class="btn bg" onclick="IA.teste.hist=[];_iaTesteDesenhar()" title="Recomeçar"><i class="ti ti-refresh"></i></button>
      <button class="btn bp" id="ia2-t-enviar" onclick="iaTestar()"><i class="ti ti-send"></i>Enviar</button></div>
  </div>`;
}
function _iaTesteDesenhar(){
  const sel=document.getElementById('ia2-t-tipo');if(sel)sel.value=IA.teste.tipo;
  const box=document.getElementById('ia2-t-chat');if(!box)return;
  box.innerHTML=IA.teste.hist.length?IA.teste.hist.map(m=>`<div class="wa2-msg ${m.de==='ia'?'saida':'entrada'}"><div class="wa2-msg-txt">${esc(m.texto)}</div>
      ${m.de==='ia'?`<div class="wa2-msg-meta"><span class="wa2-quem ia"><i class="ti ti-robot"></i>IA</span>${m.transferir?'<span class="integ2-st pend"><i class="ti ti-user-share"></i>passaria para o consultor</span>':''}${m.encerrar?'<span class="integ2-st erro"><i class="ti ti-bell-off"></i>encerraria a conversa</span>':''}${m.custo?`<span>US$ ${m.custo.toFixed(5)}</span>`:''}</div>`:''}</div>`).join('')
    :`<div class="wa2-chat-vazio peq"><i class="ti ti-message-chatbot"></i><div>Mande um “oi” como se fosse um lead de ${IA.teste.tipo==='pos_venda'?'pós-venda':'anúncio'}.</div></div>`;
  box.scrollTop=box.scrollHeight;
}
async function iaTestar(){
  const t=document.getElementById('ia2-t-msg');const msg=(t&&t.value||'').trim();
  if(!msg||IA.teste.enviando) return;
  const tipo=IA.teste.tipo;const r=IA.roteiros[tipo]||{};
  const editor=IA.editando===tipo&&document.getElementById('ia-ed-roteiro');
  const iaSel=editor?document.getElementById('ia-ed-ia').value:null;
  const modelo=editor?(iaSel==='outro'?document.getElementById('ia-ed-ia-outro').value.trim():iaSel):(r.modelo||'gpt-6-luna');
  const roteiro=editor?document.getElementById('ia-ed-roteiro').value:(r.roteiro||'');
  const hist=IA.teste.hist.slice();
  IA.teste.hist.push({de:'cliente',texto:msg});t.value='';
  IA.teste.enviando=true;_iaTesteDesenhar();
  const b=document.getElementById('ia2-t-enviar');if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader-2 integ2-gira"></i>';}
  const res=await integChamar('ia_testar',{tipo,roteiro,modelo,mensagem:msg,historico:hist,nome:document.getElementById('ia2-t-nome')?.value,tipo_bem:document.getElementById('ia2-t-bem')?.value});
  IA.teste.enviando=false;
  if(b){b.disabled=false;b.innerHTML='<i class="ti ti-send"></i>Enviar';}
  if(!res.ok){IA.teste.hist.pop();showToast(res.erro,'ti-alert-triangle','#dc2626');_iaTesteDesenhar();return;}
  IA.teste.hist.push({de:'ia',texto:res.resposta||'(a IA não escreveu nada — só passaria para o consultor)',transferir:res.transferir,encerrar:res.encerrar,custo:res.custo_usd});
  _iaTesteDesenhar();
}

// ── Conversas ───────────────────────────────────────────────────────────────
function _iaConversasPainel(){
  const st={ativa:['IA atendendo','ok','ti-robot'],humano:['Com a equipe','pend','ti-user-check'],encerrada:['Pediu para parar','erro','ti-bell-off']};
  const lista=IA.conversas.filter(c=>!IA.filtro||c.status===IA.filtro);
  return `<div class="ads2-card"><div class="ads2-card-topo"><div class="ads2-card-tit"><i class="ti ti-messages"></i> Conversas da IA</div>
    <select class="tfield" onchange="IA.filtro=this.value;renderIA()"><option value="">Todas</option>${Object.entries(st).map(([k,v])=>`<option value="${k}"${IA.filtro===k?' selected':''}>${v[0]}</option>`).join('')}</select></div>
    ${lista.length?`<div class="integ2-tabela"><table><thead><tr><th>Lead</th><th>Roteiro</th><th>Situação</th><th class="num">Respostas da IA</th><th class="num">Custo</th><th>Última atividade</th><th></th></tr></thead><tbody>
      ${lista.map(c=>{const l=integLeadPorSb(c.lead_id);const s=st[c.status]||[c.status,'pend','ti-point'];return `<tr>
        <td><strong>${esc(l?l.nome:'Lead')}</strong>${l?`<div class="integ2-mini">${esc(etapaLabel(l.etapa))}</div>`:''}</td>
        <td>${esc(IA_TIPOS[c.tipo]?IA_TIPOS[c.tipo].tit:c.tipo)}</td>
        <td><span class="integ2-st ${s[1]}"><i class="ti ${s[2]}"></i>${s[0]}</span>${c.motivo?`<div class="integ2-mini">${esc(c.motivo)}</div>`:''}</td>
        <td class="num">${c.mensagens_ia||0}</td><td class="num">US$ ${Number(c.custo_usd||0).toFixed(4)}</td>
        <td>${esc(integHaQuanto(c.atualizado_em))}</td>
        <td><button class="btn bg bsm" onclick="waAbrirLead('${esc(c.lead_id)}')"><i class="ti ti-brand-whatsapp"></i>Abrir</button></td></tr>`;}).join('')}
    </tbody></table></div>`:`<div class="integ2-mini">${IA.filtro?'Nenhuma conversa nesta situação.':'Nenhuma conversa da IA ainda. Quando ela começar a atender, as conversas aparecem aqui.'}</div>`}
  </div>`;
}
let _iaRealtimeT=null;
window._iaRealtime=function(){
  if(!document.getElementById('tab-ia')?.classList.contains('active')||IA.editando||IA.teste.enviando)return;
  clearTimeout(_iaRealtimeT);_iaRealtimeT=setTimeout(()=>renderIA(),1200);
};

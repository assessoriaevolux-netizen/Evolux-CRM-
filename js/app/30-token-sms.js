// ─── TOKEN DA PROPOSTA POR SMS (aba Token SMS) ─────────────────────────────────
// O consultor agenda um SMS para o celular do cliente (agora, 1, 3, 5 ou 10 min).
// A mensagem vem pré-preenchida mas o consultor pode editar antes de enviar.
// O placeholder {codigo} é obrigatório — se faltar, o servidor acrescenta no final.
// O token nunca aparece para o consultor.
const SMS={lista:[],atraso:180,timer:null,tick:null,disparos:{},enviando:false};
const SMS_ATRASOS=[[0,'Agora'],[60,'1 min'],[180,'3 min'],[300,'5 min'],[600,'10 min']];

// Mesmo formato do servidor: "R$ 300 mil", "R$ 312.500", "R$ 1,5 milhão"
function smsValorTxt(v){
  v=Math.round(Number(v)||0);
  if(v>=1e6){ const m=Math.round(v/1e5)/10; return 'R$ '+String(m).replace('.',',')+(m>=2?' milhões':' milhão'); }
  if(v>=1000&&v%1000===0) return 'R$ '+(v/1000)+' mil';
  return 'R$ '+v.toLocaleString('pt-BR');
}
function smsPrimeiroNome(n){ const p=String(n||'').trim().split(/\s+/)[0]||''; return p?p.charAt(0).toUpperCase()+p.slice(1).toLowerCase():'Cliente'; }
const SMS_MSG_PADRAO='Olá {nome}, sua proposta de carta de crédito de {valor} foi registrada no seu nome. Token para dar continuidade à sua proposta: {codigo}';
function smsPrevia(){
  const el=document.getElementById('sms-previa');
  if(!el) return;
  if(!el.value) el.value=SMS_MSG_PADRAO;
  smsContarChars();
}
// Mostra prévia real (com valores substituídos) abaixo do textarea
function smsAtualizarExemplo(){
  const el=document.getElementById('sms-previa');
  const ex=document.getElementById('sms-exemplo');
  if(!el||!ex) return;
  const nome=document.getElementById('sms-nome')?.value||'';
  const valor=unM(document.getElementById('sms-valor')?.value||'');
  ex.textContent=el.value
    .replace(/\{nome\}/g, smsPrimeiroNome(nome)||'Cliente')
    .replace(/\{valor\}/g, valor?smsValorTxt(valor):'R$ —')
    .replace(/\{codigo\}/g, '••••••');
}
function smsContarChars(){
  const el=document.getElementById('sms-previa');
  const ct=document.getElementById('sms-chars');
  if(el&&ct){ const n=el.value.length; ct.textContent=n+'/765'; ct.style.color=n>765?'#dc2626':''; }
  smsAtualizarExemplo();
}

// ─── Aba "Token SMS" ──────────────────────────────────────────────────────────
function renderToken(){
  const tab=document.getElementById('tab-token');
  if(!tab) return;
  if(!tab.querySelector('.sms-pag')){
    tab.innerHTML=`<div class="sms-pag">
      <div class="ind-topo"><div><div class="ind-tit"><i class="ti ti-message-2-code"></i>Token da proposta por SMS</div>
        <div class="ind-sub">Na hora da proposta, agende um SMS para o celular do cliente com o token. Ele lê o código para você e a proposta fica confirmada.</div></div></div>
      <div class="sms-grid">
        <div class="dn-card">
          <h3><i class="ti ti-send"></i>Novo token</h3>
          <div class="field" style="margin:0"><label>Lead (opcional)</label><select class="fi" id="sms-lead" onchange="smsEscolherLead()"></select></div>
          <div class="g2" style="gap:10px;margin-top:10px">
            <div class="field" style="margin:0"><label>Nome do cliente</label><input class="fi" id="sms-nome" maxlength="120" oninput="smsAtualizarExemplo()"></div>
            <div class="field" style="margin:0"><label>Celular</label><input class="fi" id="sms-tel" inputmode="numeric" oninput="maskTelConta(this)" placeholder="(11) 98765-4321"></div>
          </div>
          <div class="field" style="margin:10px 0 0"><label>Valor da carta de crédito</label><input class="fi" id="sms-valor" inputmode="numeric" oninput="maskM(this);smsAtualizarExemplo()" placeholder="Ex: 300.000"></div>
          <div class="field" style="margin:10px 0 0"><label>Quando o SMS chega</label>
            <div class="sms-chips">${SMS_ATRASOS.map(([s,t])=>`<button type="button" class="sms-chip${SMS.atraso===s?' on':''}" onclick="SMS.atraso=${s};document.querySelectorAll('.sms-chip').forEach(b=>b.classList.toggle('on',b===this))">${t}</button>`).join('')}</div>
          </div>
          <div class="sms-previa-box"><div class="sms-previa-lbl"><i class="ti ti-edit"></i> Mensagem do SMS <span id="sms-chars" style="float:right;font-weight:400;opacity:.6">0/765</span></div><textarea class="fi" id="sms-previa" rows="3" style="resize:vertical;font-size:13px;line-height:1.45" oninput="smsContarChars()"></textarea><div class="ind-mini" style="margin-top:4px;opacity:.7"><i class="ti ti-info-circle"></i> <b>{nome}</b> = primeiro nome, <b>{valor}</b> = valor da carta, <b>{codigo}</b> = token de 6 dígitos. Se não incluir {codigo}, ele vai no final.</div>
          <div class="sms-previa-lbl" style="margin-top:8px"><i class="ti ti-device-mobile-message"></i> O cliente recebe</div><div id="sms-exemplo" class="sms-exemplo-txt"></div></div>
          <div class="ind-mini" id="sms-lead-aviso" style="margin-top:6px"></div>
          <button class="btn bp" id="sms-agendar" style="width:100%;justify-content:center;margin-top:12px" onclick="agendarTokenSMS()"><i class="ti ti-send"></i>Agendar SMS</button>
        </div>
        <div class="dn-card">
          <h3><i class="ti ti-history"></i>Tokens recentes</h3>
          <div id="sms-lista"><div class="ind-mini">Carregando…</div></div>
        </div>
      </div>
    </div>`;
    smsPrevia();
  }
  preencherSelectLeads(document.getElementById('sms-lead'),{vazio:'Sem lead — digitar os dados',rotulo:l=>' · '+formatTelefone(l.tel)});
  smsCarregar();
  clearInterval(SMS.timer); SMS.timer=setInterval(()=>{ if(smsAbaAberta()) smsCarregar(); },8000);
  clearInterval(SMS.tick); SMS.tick=setInterval(()=>{ if(smsAbaAberta()) smsAtualizarRelogios(); },1000);
}
function smsAbaAberta(){ return !!document.getElementById('tab-token')?.classList.contains('active'); }
function smsLeadEscolhido(){
  const id=parseInt(document.getElementById('sms-lead')?.value);
  return id?leads.find(l=>l.id===id)||null:null;
}
function smsEscolherLead(){
  const l=smsLeadEscolhido();
  const av=document.getElementById('sms-lead-aviso');
  if(l){
    document.getElementById('sms-nome').value=l.nome||'';
    document.getElementById('sms-tel').value=formatTelefone(l.tel)||'';
    if(l.credito) document.getElementById('sms-valor').value=Math.round(l.credito).toLocaleString('pt-BR');
  }
  if(av) av.innerHTML=l&&l.sb_id?`<i class="ti ti-link"></i> Ligado ao lead <strong>${esc(l.nome)}</strong>: ao confirmar o token, ele vai para Negociação.`:'';
  smsPrevia();
}

async function agendarTokenSMS(){
  if(SMS.enviando) return;
  const nome=document.getElementById('sms-nome').value.trim();
  const tel=document.getElementById('sms-tel').value.replace(/\D/g,'');
  const valor=unM(document.getElementById('sms-valor').value);
  if(nome.length<2){showToast('Informe o nome do cliente.','ti-alert-triangle','#d97706');return;}
  if(tel.length<10){showToast('Informe o celular com DDD.','ti-alert-triangle','#d97706');return;}
  if(!valor){showToast('Informe o valor da carta de crédito.','ti-alert-triangle','#d97706');return;}
  const lead=smsLeadEscolhido();
  const b=document.getElementById('sms-agendar');
  SMS.enviando=true; if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader-2"></i>Agendando…';}
  const msg=(document.getElementById('sms-previa')?.value||'').trim();
  const {data,error}=await window._rpc('sim_token_criar',{p_nome:nome,p_telefone:tel,p_valor:valor,p_lead_id:lead&&lead.sb_id?String(lead.sb_id):null,p_atraso_seg:SMS.atraso,p_mensagem:msg||null});
  SMS.enviando=false; if(b){b.disabled=false;b.innerHTML='<i class="ti ti-send"></i>Agendar SMS';}
  if(error){
    const m=String(error.message||error);
    showToast(/sim_token_criar|schema cache|does not exist/i.test(m)?'Falta instalar o Token por SMS no banco (arquivo 2026-10-30-token-sms.sql).':'Não consegui agendar: '+(window._msgErro?window._msgErro(error):m),'ti-alert-triangle','#dc2626');
    return;
  }
  const quando=SMS.atraso?`em ${SMS_ATRASOS.find(a=>a[0]===SMS.atraso)[1]}`:'agora';
  showToast(`SMS agendado: chega ${quando} no celular do cliente.`,'ti-send');
  if(window._saveAtividade) window._saveAtividade('ti-message-2-code',`Token da proposta de ${smsValorTxt(valor)} agendado para ${nome}`);
  smsAgendarDisparo(data.id,data.enviar_em);
  smsCarregar();
}

// Na hora exata do envio, o CRM aberto chama o servidor de SMS (o banco também
// chama a cada minuto, então o SMS sai mesmo se o consultor fechar a tela)
function smsDispararServidor(){
  fetch(`${window._sbUrl}/functions/v1/crm-sms`,{method:'POST',headers:{'Content-Type':'application/json','apikey':window._sbAnon}})
    .then(()=>setTimeout(smsCarregar,1500)).catch(()=>{});
}
function smsAgendarDisparo(id,quando){
  if(SMS.disparos[id]) return;
  const ms=Math.max(0,new Date(quando).getTime()-Date.now())+400;
  SMS.disparos[id]=setTimeout(()=>{delete SMS.disparos[id];smsDispararServidor();},ms);
}

async function smsCarregar(){
  const {data,error}=await window._rpc('sim_token_lista');
  const box=document.getElementById('sms-lista');
  if(error){ if(box) box.innerHTML='<div class="ind-mini">Falta instalar o Token por SMS no banco (arquivo 2026-10-30-token-sms.sql).</div>'; return; }
  SMS.lista=data||[];
  SMS.lista.filter(t=>t.status==='agendado').forEach(t=>smsAgendarDisparo(t.id,t.enviar_em));
  smsRender();
}
function smsHora(iso){ const d=new Date(iso); return isNaN(d)?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function smsFaltam(iso){ const s=Math.max(0,Math.round((new Date(iso).getTime()-Date.now())/1000)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function smsStatus(t){
  if(t.status==='agendado') return `<span class="integ2-tag q-yellow"><i class="ti ti-clock"></i>sai em <b class="sms-rel" data-quando="${esc(t.enviar_em)}">${smsFaltam(t.enviar_em)}</b></span>`;
  if(t.status==='enviando') return '<span class="integ2-tag q-yellow"><i class="ti ti-loader-2"></i>enviando…</span>';
  if(t.status==='enviado') return `<span class="integ2-tag"><i class="ti ti-check"></i>entregue ao serviço às ${smsHora(t.enviado_em)}</span>`;
  if(t.status==='confirmado') return `<span class="integ2-tag ok"><i class="ti ti-shield-check"></i>confirmado às ${smsHora(t.confirmado_em)}</span>`;
  if(t.status==='cancelado') return `<span class="integ2-tag">cancelado${t.erro?' · '+esc(t.erro):''}</span>`;
  return `<span class="integ2-tag q-red"><i class="ti ti-alert-triangle"></i>não enviado</span>`;
}
function smsRender(){
  const box=document.getElementById('sms-lista');
  if(!box) return;
  const me=getMe();
  if(!SMS.lista.length){ box.innerHTML='<div class="ind-mini">Nenhum token nos últimos 7 dias.</div>'; return; }
  box.innerHTML=SMS.lista.map(t=>`<div class="sms-item">
    <div class="sms-item-top"><div style="min-width:0"><strong>${esc(t.nome)}</strong> <span class="ind-mini">${esc(formatTelefone(t.telefone))} · ${esc(smsValorTxt(t.valor))}${me&&t.criado_por!==me.sb_id&&t.criado_por_nome?' · por '+esc(t.criado_por_nome):''}</span></div>${smsStatus(t)}</div>
    ${t.status==='erro'&&t.erro?`<div class="ind-mini" style="color:#dc2626;margin-top:4px">${esc(t.erro)}</div>`:''}
    ${t.status==='enviado'?`<div class="sms-confirma"><input class="fi" id="sms-cod-${esc(t.id)}" inputmode="numeric" maxlength="6" placeholder="Token que o cliente recebeu" oninput="this.value=this.value.replace(/\\D/g,'')" onkeydown="if(event.key==='Enter')smsConfirmar('${esc(t.id)}')"><button class="btn bp bsm" onclick="smsConfirmar('${esc(t.id)}')"><i class="ti ti-shield-check"></i>Confirmar</button></div>`:''}
    ${t.status==='agendado'?`<div style="margin-top:6px"><button class="btn bg bsm" onclick="smsCancelar('${esc(t.id)}')"><i class="ti ti-x"></i>Cancelar envio</button></div>`:''}
  </div>`).join('');
}
function smsAtualizarRelogios(){
  let venceu=false;
  document.querySelectorAll('.sms-rel').forEach(el=>{ el.textContent=smsFaltam(el.dataset.quando); if(new Date(el.dataset.quando)<=Date.now()) venceu=true; });
  if(venceu&&!SMS._recarregando){ SMS._recarregando=true; setTimeout(()=>{SMS._recarregando=false;smsCarregar();},3000); }
}
async function smsConfirmar(id){
  const inp=document.getElementById('sms-cod-'+id);
  const cod=(inp?.value||'').replace(/\D/g,'');
  if(cod.length!==6){showToast('Digite os 6 números do token.','ti-alert-triangle','#d97706');return;}
  const {data,error}=await window._rpc('sim_token_confirmar',{p_id:id,p_codigo:cod});
  if(error){showToast(window._msgErro?window._msgErro(error):error.message,'ti-alert-triangle','#dc2626');return;}
  if(!data||!data.ok){showToast(`Token incorreto. Restam ${data?data.restantes:0} tentativa(s).`,'ti-alert-triangle','#dc2626');if(inp){inp.value='';inp.focus();}return;}
  showToast(data.lead_movido?'Proposta confirmada! O lead foi para Negociação.':'Proposta confirmada pelo cliente!','ti-shield-check');
  if(data.lead_movido&&window._loadLeads){ await window._loadLeads(); try{renderKanban();}catch(e){} }
  smsCarregar();
}
function smsCancelar(id){
  showConfirm('Cancelar o envio deste SMS?',async()=>{
    const {error}=await window._rpc('sim_token_cancelar',{p_id:id});
    if(error){showToast(window._msgErro?window._msgErro(error):error.message,'ti-alert-triangle','#dc2626');return;}
    if(SMS.disparos[id]){clearTimeout(SMS.disparos[id]);delete SMS.disparos[id];}
    showToast('Envio cancelado.','ti-x');smsCarregar();
  });
}

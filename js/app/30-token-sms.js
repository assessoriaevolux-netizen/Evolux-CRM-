// ─── TOKEN DA PROPOSTA POR SMS (Simulador) ────────────────────────────────────
// O consultor agenda um SMS para o celular do cliente (agora, 1, 3, 5 ou 10 min):
//   "Olá João, sua proposta de carta de crédito de R$ 300 mil foi registrada no
//    seu nome. Token para dar continuidade à sua proposta: 482913"
// O cliente lê o token, o consultor digita aqui e a proposta fica confirmada
// (o lead vai para Negociação). O texto é fixo no servidor e o token nunca
// aparece para o consultor.
const SMS={lista:[],atraso:180,timer:null,tick:null,disparos:{},enviando:false};
const SMS_ATRASOS=[[0,'Agora'],[60,'1 min'],[180,'3 min'],[300,'5 min'],[600,'10 min']];

function smsValorSimulacao(){
  if(document.getElementById('sModManual')?.checked){ const v=unM(document.getElementById('sManualCredito')?.value||''); if(v) return v; }
  if(window._simLinhaAtual&&window._simLinhaAtual.credito) return window._simLinhaAtual.credito;
  return unM(document.getElementById('sValor')?.value||'')||0;
}
function smsLeadSimulacao(){
  const id=parseInt(document.getElementById('sLeadSel')?.value);
  return id?leads.find(l=>l.id===id)||null:null;
}
// Mesmo formato do servidor: "R$ 300 mil", "R$ 312.500", "R$ 1,5 milhão"
function smsValorTxt(v){
  v=Math.round(Number(v)||0);
  if(v>=1e6){ const m=Math.round(v/1e5)/10; return 'R$ '+String(m).replace('.',',')+(m>=2?' milhões':' milhão'); }
  if(v>=1000&&v%1000===0) return 'R$ '+(v/1000)+' mil';
  return 'R$ '+v.toLocaleString('pt-BR');
}
function smsPrimeiroNome(n){ const p=String(n||'').trim().split(/\s+/)[0]||''; return p?p.charAt(0).toUpperCase()+p.slice(1).toLowerCase():'Cliente'; }
function smsPrevia(){
  const nome=document.getElementById('sms-nome')?.value||'';
  const valor=unM(document.getElementById('sms-valor')?.value||'');
  const el=document.getElementById('sms-previa');
  if(el) el.textContent=`Olá ${smsPrimeiroNome(nome)}, sua proposta de carta de crédito de ${valor?smsValorTxt(valor):'R$ —'} foi registrada no seu nome. Token para dar continuidade à sua proposta: ••••••`;
}

function abrirTokenSMS(){
  const lead=smsLeadSimulacao();
  const nome=(document.getElementById('sNome')?.value||'').trim()||(lead?lead.nome:'');
  const tel=(document.getElementById('sTelCliente')?.value||'').trim()||(lead?formatTelefone(lead.tel):'');
  const valor=smsValorSimulacao();
  document.getElementById('sms-modal')?.remove();
  const m=document.createElement('div');
  m.id='sms-modal';m.className='modal-bg open';
  m.onclick=e=>{if(e.target===m)fecharTokenSMS();};
  m.innerHTML=`<div class="modal-box" style="max-width:560px">
    <div class="modal-hdr"><span class="modal-title"><i class="ti ti-message-2-code" style="color:var(--g)"></i> Token da proposta por SMS</span><button class="modal-close" onclick="fecharTokenSMS()" aria-label="Fechar"><i class="ti ti-x"></i></button></div>
    <div class="sms-corpo">
      <div class="g2" style="gap:10px">
        <div class="field" style="margin:0"><label>Nome do cliente</label><input class="fi" id="sms-nome" maxlength="120" value="${esc(nome)}" oninput="smsPrevia()"></div>
        <div class="field" style="margin:0"><label>Celular</label><input class="fi" id="sms-tel" inputmode="numeric" value="${esc(tel)}" oninput="maskTelConta(this)" placeholder="(11) 98765-4321"></div>
      </div>
      <div class="field" style="margin:10px 0 0"><label>Valor da carta de crédito</label><input class="fi" id="sms-valor" inputmode="numeric" value="${valor?Math.round(valor).toLocaleString('pt-BR'):''}" oninput="maskM(this);smsPrevia()" placeholder="Ex: 300.000"></div>
      <div class="field" style="margin:10px 0 0"><label>Quando o SMS chega</label>
        <div class="sms-chips">${SMS_ATRASOS.map(([s,t])=>`<button type="button" class="sms-chip${SMS.atraso===s?' on':''}" onclick="SMS.atraso=${s};document.querySelectorAll('.sms-chip').forEach(b=>b.classList.toggle('on',b===this))">${t}</button>`).join('')}</div>
      </div>
      <div class="sms-previa-box"><div class="sms-previa-lbl"><i class="ti ti-device-mobile-message"></i> O cliente recebe</div><div id="sms-previa"></div></div>
      ${lead&&lead.sb_id?`<div class="ind-mini" style="margin-top:6px"><i class="ti ti-link"></i> Ligado ao lead <strong>${esc(lead.nome)}</strong>: ao confirmar o token, ele vai para Negociação.</div>`:''}
      <button class="btn bp" id="sms-agendar" style="width:100%;justify-content:center;margin-top:12px" onclick="agendarTokenSMS()"><i class="ti ti-send"></i>Agendar SMS</button>
      <div class="sms-sec"><i class="ti ti-history"></i> Tokens recentes</div>
      <div id="sms-lista"><div class="ind-mini">Carregando…</div></div>
    </div></div>`;
  document.body.appendChild(m);
  smsPrevia();
  smsCarregar();
  clearInterval(SMS.timer); SMS.timer=setInterval(smsCarregar,8000);
  clearInterval(SMS.tick); SMS.tick=setInterval(smsAtualizarRelogios,1000);
}
function fecharTokenSMS(){
  document.getElementById('sms-modal')?.remove();
  clearInterval(SMS.timer); clearInterval(SMS.tick);
}

async function agendarTokenSMS(){
  if(SMS.enviando) return;
  const nome=document.getElementById('sms-nome').value.trim();
  const tel=document.getElementById('sms-tel').value.replace(/\D/g,'');
  const valor=unM(document.getElementById('sms-valor').value);
  if(nome.length<2){showToast('Informe o nome do cliente.','ti-alert-triangle','#d97706');return;}
  if(tel.length<10){showToast('Informe o celular com DDD.','ti-alert-triangle','#d97706');return;}
  if(!valor){showToast('Informe o valor da carta de crédito.','ti-alert-triangle','#d97706');return;}
  const lead=smsLeadSimulacao();
  const b=document.getElementById('sms-agendar');
  SMS.enviando=true; if(b){b.disabled=true;b.innerHTML='<i class="ti ti-loader-2"></i>Agendando…';}
  const {data,error}=await window._rpc('sim_token_criar',{p_nome:nome,p_telefone:tel,p_valor:valor,p_lead_id:lead&&lead.sb_id?String(lead.sb_id):null,p_atraso_seg:SMS.atraso});
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

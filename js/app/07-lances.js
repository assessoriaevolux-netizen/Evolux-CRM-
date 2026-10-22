// ─── LANCES ───────────────────────────────────────────────────────────────────
// Sincroniza lances com leads convertidos — chamado sempre que etapa muda
function syncLancesConvertidos(){
  const convertidos=leads.filter(l=>l.etapa==='Fechado / Convertido');
  // Adiciona lance automático para convertidos sem lance
  convertidos.forEach(l=>{
    const jaTemLance=lances.some(la=>la.leadId===l.id&&!la._removido);
    if(!jaTemLance){
      const _al={id:nextLanceId++,leadId:l.id,clienteNome:l.nome,valor:l.credito||0,pct:0,dataOferta:new Date().toISOString().split('T')[0],assem:mesAtual(),obs:'',ofertado:false,_auto:true};
      lances.push(_al);
      if(window._syncLance) window._syncLance(_al).catch(e=>console.warn(e));
    }
  });
  // Marca como removido lances automáticos de leads que saíram de convertido
  lances.filter(la=>la._auto&&!la._removido).forEach(la=>{
    const lead=leads.find(l=>l.id===la.leadId);
    if(!lead||lead.etapa!=='Fechado / Convertido') la._removido=true;
  });
}
function renderLances(){
  syncLancesConvertidos();
  document.getElementById('lance-mes').textContent=mesAtual();
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const em3=new Date(hoje);em3.setDate(em3.getDate()+3);
  const ativos=lances.filter(l=>!l._removido);
  let u=0,b=0,ok=0;
  ativos.filter(l=>!l.ofertado).forEach(l=>{const d=new Date(l.dataOferta);d.setHours(0,0,0,0);if(d<=hoje)u++;else if(d<=em3)b++;else ok++;});
  document.getElementById('l-urgente').textContent=u;
  document.getElementById('l-breve').textContent=b;
  document.getElementById('l-ok').textContent=ok+ativos.filter(l=>!l.ofertado&&(new Date(l.dataOferta)>em3)).length;
  const lista=document.getElementById('lances-lista');
  if(!ativos.length){lista.innerHTML='<p style="color:var(--tm);font-size:13px">Nenhum lance cadastrado. Leads "Fechado / Convertido" aparecem aqui automaticamente para cadastro de lance.</p>';return;}
  const sorted=[...ativos].sort((a,b)=>new Date(a.dataOferta)-new Date(b.dataOferta));
  lista.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px">'+sorted.map(l=>{
    const autoTag=l._auto?`<span style="font-size:9px;padding:2px 6px;border-radius:20px;background:rgba(1,107,60,.12);color:var(--g);font-weight:700;margin-left:4px">AUTO</span>`:'';
    if(l.ofertado) return `<div class="lance-card done"><div class="lance-n">${l.clienteNome}${autoTag}</div><div class="lance-i">Lance: ${fmtR(l.valor)} (${l.pct}%) · ${l.assem}</div><div class="lance-foot"><span class="lbadge lb-d">✓ Ofertado</span><button class="btn bd bsm" onclick="removeLance(${l.id})"><i class="ti ti-trash"></i></button></div></div>`;
    const d=new Date(l.dataOferta);d.setHours(0,0,0,0);
    let cls='ok',bcls='lb-ok',lbl='Em dia';
    if(d<=hoje){cls='urgente';bcls='lb-u';lbl='⚠️ Ofertar HOJE';}
    else if(d<=em3){cls='hoje';bcls='lb-h';lbl='🔔 Em breve';}
    // Se é lance automático (sem data definida), mostre como pendente
    if(l._auto&&l.pct===0) lbl='📋 Cadastre o lance';
    return `<div class="lance-card ${cls}">
      <div class="lance-n">${l.clienteNome}${autoTag}</div>
      <div class="lance-i">${l.valor?`Lance: ${fmtR(l.valor)} (${l.pct}%) · ${l.assem}`:'Crédito: '+fmtR(l.valor||0)+' · '+l.assem}${l.obs?` · ${l.obs}`:''}</div>
      <div class="lance-i">Data para ofertar: ${l.dataOferta.split('-').reverse().join('/')}</div>
      <div class="lance-foot">
        <span class="lbadge ${bcls}">${lbl}</span>
        <div style="display:flex;gap:5px">
          <button class="btn bp bsm" onclick="editarLanceAuto(${l.id})"><i class="ti ti-pencil"></i>Editar</button>
          <button class="btn bp bsm" onclick="marcarOfertado(${l.id})"><i class="ti ti-check"></i>Ofertado</button>
          <button class="btn bd bsm" onclick="removeLance(${l.id})"><i class="ti ti-x"></i></button>
        </div>
      </div>
    </div>`;
  }).join('')+'</div>';
}
function editarLanceAuto(id){
  const l=lances.find(x=>x.id===id);if(!l)return;
  populateSelects();
  // Pre-preenche o modal de lance com dados deste lead
  setTimeout(()=>{
    const cl=document.getElementById('lCliente');
    if(cl){cl.value=l.leadId;}
    const lv=document.getElementById('lValor');
    if(lv&&l.valor){lv.value=fmtR(l.valor).replace('R$ ','').replace('R$','');}
    const ld=document.getElementById('lData');
    if(ld)ld.value=l.dataOferta;
    // Ao salvar este modal devemos atualizar o lance existente em vez de criar novo
    window._editandoLanceId=id;
  },50);
  document.getElementById('lance-modal').classList.add('open');
}
function openLanceModal(){populateSelects();window._editandoLanceId=null;const d=new Date();document.getElementById('lData').value=d.toISOString().split('T')[0];document.getElementById('lance-modal').classList.add('open');}
function closeLanceModal(){document.getElementById('lance-modal').classList.remove('open');window._editandoLanceId=null;}
function saveLance(){
  const leadId=parseInt(document.getElementById('lCliente').value);
  const lead=leads.find(l=>l.id===leadId);if(!lead){showToast('Selecione um cliente.','ti-alert-triangle','#d97706');return;}
  const valor=unM(document.getElementById('lValor').value);
  const pct=parseFloat(document.getElementById('lPct').value)||0;
  const dataOferta=document.getElementById('lData').value;
  const assem=document.getElementById('lAssem').value||mesAtual();
  const obs=document.getElementById('lObs').value;
  // Se editando lance existente, atualiza
  if(window._editandoLanceId){
    const l=lances.find(x=>x.id===window._editandoLanceId);
    if(l){l.leadId=leadId;l.clienteNome=lead.nome;l.valor=valor;l.pct=pct;l.dataOferta=dataOferta;l.assem=assem;l.obs=obs;l._auto=false;if(window._syncLance) window._syncLance(l).catch(e=>console.warn(e));}
    if(window._saveAtividade)window._saveAtividade('ti-gavel',`Lance atualizado: ${lead.nome} — ${fmtR(valor)} (${pct}%)`);
  } else {
    // Remove lance auto do mesmo lead se existir
    lances=lances.filter(la=>!(la._auto&&la.leadId===leadId&&!la._removido));
    lances.push({id:nextLanceId++,leadId,clienteNome:lead.nome,valor,pct,dataOferta,assem,obs,ofertado:false});
    if(window._syncLance) window._syncLance(lances[lances.length-1]).catch(e=>console.warn(e));
    if(window._saveAtividade)window._saveAtividade('ti-gavel',`Lance cadastrado: ${lead.nome} — ${fmtR(valor)} (${pct}%)`);
  }
  closeLanceModal();['lValor','lPct','lAssem','lObs'].forEach(id=>document.getElementById(id).value='');
  renderLances();
}
function marcarOfertado(id){const l=lances.find(x=>x.id===id);if(l){l.ofertado=true;if(window._syncLance) window._syncLance(l).catch(e=>console.warn(e));if(window._saveAtividade)window._saveAtividade('ti-gavel',`Lance de ${l.clienteNome} ofertado`);}renderLances();}
function removeLance(id){showConfirm('Remover este lance?',function(){const l=lances.find(x=>x.id===id);if(l&&l._auto){l._removido=true;if(window._syncLance) window._syncLance(l).catch(e=>console.warn(e));}else{if(l?.sb_id){window._sb&&window._sb.from('lances').delete().eq('id',l.sb_id).catch(e=>console.warn(e));}lances=lances.filter(x=>x.id!==id);}renderLances();});}


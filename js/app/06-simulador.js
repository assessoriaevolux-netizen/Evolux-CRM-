// ─── SIMULADOR ────────────────────────────────────────────────────────────────
// Estado atual do simulador
window._simLinhaAtual=null; // {credito, primeiraParcela, demaisParcelas}
window._simPrazosDisp=[]; // [{prazo, taxa, linhas:[{credito,p1,de}]}]

function syncSim(){
  const a=getAdmin();
  const chip=document.getElementById('admin-chip-nome');if(chip)chip.textContent=a?a.nome:'—';
  const tfEl=document.getElementById('sTaxaFin');if(tfEl)tfEl.value=taxaFin.toFixed(2);
  const sadm=document.getElementById('sAdminSel');
  if(sadm){
    sadm.innerHTML='<option value="">Selecionar administradora...</option><option value="__manual__">✏️ Digitar nome manualmente</option>'+
      (!administradoras.length?'<option value="" disabled>— nenhuma cadastrada —</option>':'')+
      administradoras.map(ad=>`<option value="${ad.id}"${ad.ativa?' selected':''}>${ad.nome}</option>`).join('');
    if(a)sadm.value=a.id;
  }
  simPopulateTabelas(a);
  const sl=document.getElementById('sLeadSel');
  if(sl){
    const me=getMe();
    let leadsVisiveis=leads;
    if(me){
      const role=me.role||'vendedor';
      if(role==='master'||role==='gestor'||role==='superadmin'){
        // Gestor vê todos da empresa
        leadsVisiveis=leads;
      } else if(role==='representante'){
        // Representante vê leads de todos os membros de todas as suas equipes
        const minhasEquipes=equipes.filter(e=>(e.membroIds||[]).includes(me.id));
        const ids=new Set([me.id]);
        minhasEquipes.forEach(e=>(e.membroIds||[]).forEach(mid=>ids.add(mid)));
        leadsVisiveis=leads.filter(l=>ids.has(l.responsavelId));
      } else if(role==='supervisor'){
        // Supervisor vê leads dos membros das equipes que ele supervisiona
        const minhasEquipes=equipes.filter(e=>e.supervisorId===me.id);
        const ids=new Set([me.id]);
        minhasEquipes.forEach(e=>(e.membroIds||[]).forEach(mid=>ids.add(mid)));
        leadsVisiveis=leads.filter(l=>ids.has(l.responsavelId));
      } else {
        // Vendedor vê só os próprios
        leadsVisiveis=leads.filter(l=>l.responsavelId===me.id);
      }
    }
    sl.innerHTML='<option value="">Selecionar lead cadastrado...</option>'+leadsVisiveis.map(l=>`<option value="${l.id}">${l.nome} — ${l.tipo} · ${fmtR(l.credito)}</option>`).join('');
  }
}

function simSelectAdmin(){
  const val=document.getElementById('sAdminSel').value;
  const manualWrap=document.getElementById('sAdminManualWrap');
  if(val==='__manual__'){
    if(manualWrap)manualWrap.style.display='block';
    administradoras.forEach(a=>a.ativa=false);
    document.getElementById('sim-output').innerHTML='Informe o nome da administradora e preencha os dados manualmente.';
    return;
  }
  if(manualWrap)manualWrap.style.display='none';
  const id=parseInt(val);
  administradoras.forEach(a=>a.ativa=a.id===id);
  const a=getAdmin();
  simPopulateTabelas(a);
  document.getElementById('sim-output').innerHTML='Selecione a tabela e o crédito desejado para gerar a comparação.';
}

function simAdminManualChange(){
  // Atualiza o nome da administradora na proposta PDF quando digitado manualmente
  const nome=document.getElementById('sAdminManualNome')?.value||'';
  window._simAdminManualNome=nome;
  calcSim();
}

// Popula select de TABELAS (nomeTabela únicos dos grupos)
function simPopulateTabelas(a){
  const st=document.getElementById('sTabelaSel');
  if(!st)return;
  const grupos=a?(a.grupos||[]):[];
  // Agrupa por nomeTabela — todos os grupos com mesmo nome de tabela ficam juntos
  const tabelas={};
  grupos.forEach(g=>{
    const nome=g.nomeTabela||g.categoria||'Tabela';
    if(!tabelas[nome])tabelas[nome]={nome,tipoBem:null,grupos:[]};
    // Pega tipoBem do primeiro grupo que tiver (não-nulo)
    if(!tabelas[nome].tipoBem&&g.tipoBem)tabelas[nome].tipoBem=g.tipoBem;
    tabelas[nome].grupos.push(g);
  });
  const lista=Object.values(tabelas);
  st.innerHTML='<option value="">Selecionar tabela...</option>'+
    lista.map((t,i)=>`<option value="${i}">${t.nome}${t.tipoBem?' — '+t.tipoBem:''}</option>`).join('');
  if(!lista.length)st.innerHTML='<option value="">Nenhuma tabela cadastrada</option>';
  window._simTabelas=lista;
  // Limpa dependentes
  simClearCreditos();
  simClearPrazos();
}

function simSelectTabela(){
  const idx=document.getElementById('sTabelaSel').value;
  const lista=window._simTabelas||[];
  const tabela=idx!==''?lista[parseInt(idx)]:null;
  // Mostra tipo de bem
  const tipoBemDiv=document.getElementById('sTipoBemDisplay');
  const tipoHidden=document.getElementById('sTipo');
  if(tipoHidden)tipoHidden.value=tabela&&tabela.tipoBem?tabela.tipoBem:'';
  if(!tabela){simClearCreditos();simClearPrazos();return;}
  // Coleta TODOS os créditos de TODOS os grupos desta tabela, ignorando separação por grupo
  // Chave: credito para agrupar valores iguais, acumulando todos os prazos disponíveis
  const creditosMap={};
  tabela.grupos.forEach(g=>{
    const prazo=g.prazo||60;
    const taxa=g.taxa||0;
    // Se tem tabelaLinhas, usa cada linha; senão usa o crédito único do grupo
    const linhas=g.tabelaLinhas&&g.tabelaLinhas.length
      ?g.tabelaLinhas
      :[{credito:g.credito,primeiraParcela:g.entradaMin||null,demaisParcelas:null}];
    linhas.forEach(l=>{
      if(!l.credito)return;
      const ck=l.credito.toFixed(2);
      if(!creditosMap[ck])creditosMap[ck]={credito:l.credito,prazos:[]};
      // Sem deduplicação — cada coluna do PDF é uma opção separada de entrada
      // Só pula se primeiraParcela E demaisParcelas forem null (linha vazia)
      if(l.primeiraParcela==null&&l.demaisParcelas==null)return;
      creditosMap[ck].prazos.push({prazo,taxa,primeiraParcela:l.primeiraParcela,demaisParcelas:l.demaisParcelas});
    });
  });
  const creditos=Object.values(creditosMap).sort((a,b)=>a.credito-b.credito);
  window._simCreditos=creditos;
  // Popula select de créditos
  const sc=document.getElementById('sCreditoSel');
  if(sc){
    sc.innerHTML='<option value="">Selecionar crédito...</option>'+
      creditos.map((c,i)=>`<option value="${i}">${fmtR(c.credito)}</option>`).join('');
  }
  simClearPrazos();
  window._simLinhaAtual=null;
}

function simClearCreditos(){
  const sc=document.getElementById('sCreditoSel');
  if(sc)sc.innerHTML='<option value="">Selecionar crédito...</option>';
  window._simCreditos=[];
}

function simClearPrazos(){
  const pc=document.getElementById('sPrazoChips');
  if(pc)pc.innerHTML='';
  window._simPrazoSel=null;
}

function simSelectCredito(){
  const idx=document.getElementById('sCreditoSel').value;
  const creditos=window._simCreditos||[];
  const item=idx!==''?creditos[parseInt(idx)]:null;
  if(!item){simClearPrazos();window._simLinhaAtual=null;return;}
  // Monta cards de entrada — uma opção por coluna do PDF
  const pc=document.getElementById('sPrazoChips');
  // Ordena: primeiro por prazo, depois por primeiraParcela desc (maior entrada primeiro)
  const opcoes=[...item.prazos].sort((a,b)=>{
    if(a.prazo!==b.prazo)return a.prazo-b.prazo;
    return (b.primeiraParcela||0)-(a.primeiraParcela||0);
  });
  window._simPrazosItem=opcoes;
  if(pc){
    if(!opcoes.length){pc.innerHTML='';return;}
    // Label do grupo por prazo
    const prazosUniq=[...new Set(opcoes.map(o=>o.prazo))];
    let html='<div style="margin-bottom:6px;font-size:11.5px;font-weight:700;color:var(--tm);letter-spacing:.04em;text-transform:uppercase">Opções de entrada</div>';
    prazosUniq.forEach(prazo=>{
      const cols=opcoes.filter(o=>o.prazo===prazo);
      if(cols.length>1)html+=`<div style="font-size:11px;color:var(--tm);margin:8px 0 4px;font-weight:600">${prazo}x</div>`;
      cols.forEach((p,ci)=>{
        const gi=opcoes.indexOf(p);
        const isFirst=gi===0;
        const entradaFmt=p.primeiraParcela!=null?fmtR(p.primeiraParcela):'—';
        const demaisFmt=p.demaisParcelas!=null?fmtR(p.demaisParcelas):'—';
        const label=cols.length>1?`Entrada ${ci===0?'maior':'menor'}`:`${prazo}x`;
        html+=`<button class="prazo-chip${isFirst?' active':''}" onclick="simSelectPrazo(${gi})" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:10px 14px;border-radius:10px;border:1.5px solid ${isFirst?'var(--g)':'var(--c2)'};background:${isFirst?'var(--gb)':'var(--c0)'};color:var(--tx);font-size:12.5px;cursor:pointer;transition:all .15s;margin-bottom:6px;gap:8px">
          <span style="font-weight:700;color:${isFirst?'var(--g)':'var(--ts)'}">${label}</span>
          <span style="flex:1;text-align:center"><span style="color:var(--tm);font-size:11px">Entrada</span><br><b style="color:${isFirst?'var(--g)':'var(--tx)'}">${entradaFmt}</b></span>
          <span style="text-align:center"><span style="color:var(--tm);font-size:11px">${cols.length>1?'':prazo+'x · '}Parcela</span><br><b>${demaisFmt}/mês</b></span>
        </button>`;
      });
    });
    pc.innerHTML=html;
  }
  if(opcoes.length)simSelectPrazo(0);
}

function simSelectPrazo(idx){
  window._simPrazoSel=idx;
  const prazos=window._simPrazosItem||[];
  const p=prazos[idx];if(!p)return;
  // Atualiza cards
  document.querySelectorAll('.prazo-chip').forEach((el,i)=>{
    const active=i===idx;
    el.classList.toggle('active',active);
    el.style.borderColor=active?'var(--g)':'var(--c2)';
    el.style.background=active?'var(--gb)':'var(--c0)';
  });
  // Armazena prazo/taxa nos hidden
  const prazoEl=document.getElementById('sPrazo');if(prazoEl)prazoEl.value=p.prazo;
  const taxaEl=document.getElementById('sTaxaCons');if(taxaEl)taxaEl.value=p.taxa||0;
  window._simLinhaAtual={credito:window._simCreditos?.[document.getElementById('sCreditoSel').value]?.credito,primeiraParcela:p.primeiraParcela,demaisParcelas:p.demaisParcelas};
  // Recupera crédito correto
  const idx2=document.getElementById('sCreditoSel').value;
  const creditos=window._simCreditos||[];
  const item=idx2!==''?creditos[parseInt(idx2)]:null;
  if(item)window._simLinhaAtual.credito=item.credito;
  calcSim();
}

function simPopulateGrupos(a){
  // mantida por compatibilidade com código legado — não faz nada novo
}

function simSelectGrupo(){
  // mantida por compatibilidade
  calcSim();
}

function simBuscarLinhaTabelaReal(g, creditoDesejado){
  const linhas=g.tabelaLinhas||[];
  if(!linhas.length)return null;
  let melhor=null,menorDiff=Infinity;
  linhas.forEach(l=>{
    const d=Math.abs(l.credito-(creditoDesejado||0));
    if(d<menorDiff){menorDiff=d;melhor=l;}
  });
  return melhor;
}

function simLoadLead(){
  const id=parseInt(document.getElementById('sLeadSel').value);
  if(!id){document.getElementById('sNome').value='';return;}
  const l=leads.find(x=>x.id===id);if(!l)return;
  document.getElementById('sNome').value=l.nome;
  // Se ainda não selecionou crédito, tenta pré-selecionar pelo crédito do lead
  const creditos=window._simCreditos||[];
  if(creditos.length&&l.credito){
    let melhorIdx=0,menorDiff=Infinity;
    creditos.forEach((c,i)=>{const d=Math.abs(c.credito-l.credito);if(d<menorDiff){menorDiff=d;melhorIdx=i;}});
    const sc=document.getElementById('sCreditoSel');
    if(sc){sc.value=melhorIdx;simSelectCredito();}
  }
}
function calcSim(parcelaOverride){
  const linhaAtual=window._simLinhaAtual||null;
  const modoManual=document.getElementById('sModManual')?.checked;

  const manualCreditoV=modoManual?unM(document.getElementById('sManualCredito')?.value||''):0;
  const manualPrazoV=modoManual?(parseInt(document.getElementById('sManualPrazo')?.value)||0):0;
  const manual1v=modoManual?unM(document.getElementById('sManual1Parc')?.value||''):null;
  const manualDv=modoManual?unM(document.getElementById('sManualDemais')?.value||''):null;

  const valor=modoManual&&manualCreditoV ? manualCreditoV
             : linhaAtual ? linhaAtual.credito
             : (unM(document.getElementById('sValor')?.value||'')||0);
  const prazo=modoManual&&manualPrazoV ? manualPrazoV
             : (parseInt(document.getElementById('sPrazo').value)||60);

  const manualTaxaV=modoManual?(parseFloat(document.getElementById('sManualTaxa')?.value)||null):null;
  const taxaCons=manualTaxaV!==null?manualTaxaV:(parseFloat(document.getElementById('sTaxaCons').value)||0);

  // Financiamento: prazo e taxa mensal vêm dos campos fixos (painel ao lado)
  const taxaAnual=parseFloat(document.getElementById('sTaxaFin')?.value)||0;
  const taxaM=taxaAnual/100; // taxa já é mensal
  const prazoFin=modoManual
    ? (parseInt(document.getElementById('sManualPrazoFin')?.value)||parseInt(document.getElementById('sPrazoFin')?.value)||420)
    : (parseInt(document.getElementById('sPrazoFin')?.value)||420);
  if(!valor)return;

  const totalAdm=valor*(taxaCons/100);   // taxa administrativa total
  const totalBruto=valor+totalAdm;        // total a pagar no consórcio

  // ── Parcelas do consórcio ──────────────────────────────────────────────────
  // Prioridade: demais manual > tabela real > calculado
  // Se há 1ª parcela (entrada) diferente das demais, as parcelas seguintes =
  // (totalBruto - primeiraParcela) / (prazo - 1)
  let parcelaCons, primeiraParcela=null, usouTabelaReal=false, usouModoManual=false;
  if(modoManual&&(manualCreditoV||manual1v||manualDv)){
    usouModoManual=true;
    if(manualDv){
      // Usuário informou demais parcelas diretamente → usa como está
      primeiraParcela=manual1v||null;
      parcelaCons=manualDv;
    } else if(manual1v&&prazo>1){
      // Tem entrada mas não tem demais → calcula demais pelo total
      primeiraParcela=manual1v;
      parcelaCons=Math.round((totalBruto-primeiraParcela)/(prazo-1));
    } else {
      // Nenhuma das duas → distribui igualmente
      parcelaCons=Math.round(totalBruto/prazo);
    }
  } else if(linhaAtual&&linhaAtual.demaisParcelas&&!parcelaOverride){
    primeiraParcela=linhaAtual.primeiraParcela||null;
    parcelaCons=linhaAtual.demaisParcelas;
    usouTabelaReal=true;
  } else {
    parcelaCons=parcelaOverride||Math.round(totalBruto/prazo);
  }

  // Total real pago no consórcio
  const totalConsReal=primeiraParcela&&primeiraParcela!==parcelaCons
    ? primeiraParcela+(parcelaCons*(prazo-1))
    : parcelaCons*prazo;

  // ── Financiamento bancário ──────────────────────────────────────────────────
  // Fórmula: valorFinanciado × taxaMensal (sem %) ÷ prazo = parcela
  // Exemplo: 21.000 × 2,42 = 50.820 ÷ 60 = R$847/mês
  const entradaFin=Math.round(valor*0.30);
  const valorFinanciado=valor-entradaFin;
  const totalJurosFin=taxaAnual>0 ? valorFinanciado*taxaAnual : valorFinanciado;
  const parcelaFin=prazoFin>0 ? Math.round(totalJurosFin/prazoFin) : 0;
  const totalFin=entradaFin+Math.round(totalJurosFin);   // entrada + total com juros

  const economia=totalFin-totalConsReal;
  const pct=totalFin>0?Math.round(Math.max(economia,0)/totalFin*100):0;
  const nome=document.getElementById('sNome').value;
  const tipo=document.getElementById('sTipo').value;
  const admin=getAdmin();
  const adminNome=admin?admin.nome:(window._simAdminManualNome||'—');
  const tabelaIdx=document.getElementById('sTabelaSel')?.value;
  const tabelaNome=tabelaIdx!==''&&tabelaIdx!==undefined?(window._simTabelas||[])[parseInt(tabelaIdx)]?.nome||'':'';
  const catLabel=tabelaNome?` · ${tabelaNome}`:'';

  document.getElementById('sim-output').innerHTML=`
    ${nome?`<div style="font-size:12px;color:var(--tm);margin-bottom:10px;padding:8px 12px;background:var(--c0);border-radius:var(--rad)">Cliente: <b style="color:var(--tx)">${nome}</b>${tipo?' · '+tipo:''}</div>`:''}
    <div class="res-grid">
      <div class="rc2 c">
        <div class="rct g"><i class="ti ti-circle-check"></i>Crédito — ${adminNome}${catLabel}</div>
        <div class="rcrow"><span class="rcl">Crédito contratado</span><span class="rcv" style="color:var(--g);font-size:15px;font-weight:700">${fmtR(valor)}</span></div>
        ${primeiraParcela&&primeiraParcela!==parcelaCons?`<div class="rcrow" style="background:var(--ys);border-radius:6px;padding:6px 8px;margin:4px 0"><span class="rcl" style="font-weight:700">1ª Parcela <span style="font-size:10px;color:var(--y)">(entrada diferenciada)</span></span><span class="rcv" style="color:var(--y);font-weight:700;font-size:15px">${fmtR(primeiraParcela)}</span></div>`:''}
        <div class="rcrow"><span class="rcl">Parcelas mensais <span style="font-size:10px;color:var(--tm)">${usouModoManual?'(manual)':usouTabelaReal?'(tabela oficial)':'(estimado)'}</span></span><span class="rcv" style="color:var(--g);font-weight:700;font-size:15px">${fmtR(parcelaCons)}</span></div>
        <div class="rcrow"><span class="rcl">Prazo</span><span class="rcv">${prazo} meses</span></div>
        ${taxaCons>0?`<div class="rcrow"><span class="rcl">Taxa adm. total</span><span class="rcv">${taxaCons}% = ${fmtR(totalAdm)}</span></div>`:''}
        <div class="rcrow" style="margin-top:7px;padding-top:7px;border-top:1px solid var(--gb)"><span class="rcl"><b>Total pago</b></span><span class="rcv" style="font-size:14px;font-weight:700">${fmtR(totalConsReal)}</span></div>
      </div>
      <div class="rc2 f">
        <div class="rct r"><i class="ti ti-circle-x"></i>Financiamento — Banco</div>
        <div class="rcrow"><span class="rcl">Valor do bem</span><span class="rcv">${fmtR(valor)}</span></div>
        <div class="rcrow" style="background:var(--rs,rgba(220,50,50,.08));border-radius:6px;padding:6px 8px;margin:4px 0"><span class="rcl" style="color:var(--r);font-weight:700">Entrada obrigatória (30%)</span><span class="rcv" style="color:var(--r);font-weight:700;font-size:15px">${fmtR(entradaFin)}</span></div>
        <div class="rcrow"><span class="rcl">Valor financiado (70%)</span><span class="rcv">${fmtR(valorFinanciado)}</span></div>
        <div class="rcrow"><span class="rcl">Parcela/mês (Price)</span><span class="rcv" style="color:var(--r);font-weight:700;font-size:15px">${fmtR(parcelaFin)}</span></div>
        <div class="rcrow"><span class="rcl">Prazo</span><span class="rcv">${prazoFin} meses</span></div>
        <div class="rcrow"><span class="rcl">Taxa de juros</span><span class="rcv">${taxaAnual}% a.m.</span></div>
        <div class="rcrow" style="margin-top:7px;padding-top:7px;border-top:1px solid var(--rb)"><span class="rcl"><b>Total pago</b></span><span class="rcv" style="font-size:14px;font-weight:700">${fmtR(totalFin)}</span></div>
      </div>
    </div>
    <div class="eco-box">
      <div class="eco-lbl">💰 Economia com o crédito</div>
      <div class="eco-val">${fmtR(Math.max(economia,0))}</div>
      <div class="eco-sub">${pct}% mais barato que o financiamento · o cliente paga ${fmtR(Math.max(economia,0))} a menos no total</div>
    </div>
    <button class="conv-btn" onclick="convertToLead(document.getElementById('sNome').value,document.getElementById('sTipo').value,${valor})">
      <i class="ti ti-user-plus"></i>Converter este cliente em lead no CRM
    </button>`;
}
function simToggleModoManual(){
  const on=document.getElementById('sModManual')?.checked;
  const man=document.getElementById('sManualWrap');
  if(man)man.style.display=on?'block':'none';
  if(!on){
    ['sManualCredito','sManualPrazo','sManual1Parc','sManualDemais'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value='';
    });
  }
  calcSim();
}
function simParcelaManual(){}
function simTipoBemChange(){
  const v=document.getElementById('sTipoBemManual')?.value||'';
  const wrap=document.getElementById('sModeloWrap');
  // Mostra campo modelo apenas para veículos
  const veiculos=['Automóvel','Moto','Caminhão','Ônibus','Máquina Agrícola'];
  if(wrap) wrap.style.opacity=veiculos.includes(v)?'1':'0.4';
  if(!veiculos.includes(v)&&document.getElementById('sModelo')) document.getElementById('sModelo').value='';
  // Sincroniza com campo sTipo usado internamente
  const sTipo=document.getElementById('sTipo');
  if(sTipo) sTipo.value=v;
}
function openSimPDFModal(){
  const out=document.getElementById('sim-output').innerHTML;
  if(!out||out.includes('Selecione a tabela')){showToast('Faça a simulação antes de gerar o PDF.','ti-alert-triangle','#d97706');return;}
  const m=document.getElementById('sim-pdf-modal');
  if(m){m.style.display='flex';}
}
function closeSimPDFModal(){
  const m=document.getElementById('sim-pdf-modal');
  if(m) m.style.display='none';
}
function downloadSimPDF(comDados){
  closeSimPDFModal();
  const nome=document.getElementById('sNome').value||'Cliente';
  const cpfCliente=(document.getElementById('sCpf')?.value||'').trim();
  const telCliente=(document.getElementById('sTelCliente')?.value||'').trim();
  const tipoBem=document.getElementById('sTipoBemManual')?.value||document.getElementById('sTipo')?.value||'—';
  const modelo=document.getElementById('sModelo')?.value?.trim()||'';
  const linhaA=window._simLinhaAtual;
  const modoManual=document.getElementById('sModManual')?.checked;
  const manualCreditoV=modoManual?unM(document.getElementById('sManualCredito')?.value||''):0;
  const valorNum=modoManual&&manualCreditoV?manualCreditoV:(linhaA?linhaA.credito:0);
  const valorStr=valorNum?fmtR(valorNum):(document.getElementById('sValor')?.value||'—');
  const admin=getAdmin();
  const adminNomeSim=admin?admin.nome:(window._simAdminManualNome||'—');
  const out=document.getElementById('sim-output').innerHTML;
  if(!out||out.includes('Selecione a tabela')){showToast('Faça a simulação antes de baixar.','ti-alert-triangle','#d97706');return;}

  const data=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const _me=getMe()||{};

  // Foto: tenta o elemento visível, senão pega do objeto users
  const fotoEl=document.getElementById('foto-preview-conta')?.querySelector('img');
  const fotoSrc=(fotoEl&&fotoEl.src&&!fotoEl.src.endsWith('/v7.html'))?fotoEl.src:(_me.foto||'');

  let _lsCfgPdf={};try{const _k='evolux_cfg_'+(window._currentUserId||'default');_lsCfgPdf=JSON.parse(localStorage.getItem(_k)||'{}');}catch(e){}
  const accInstagram=(document.getElementById('accInstagram')?.value||_me.instagram||_lsCfgPdf.instagram||'').trim();
  const accWhatsapp=(document.getElementById('accWhatsapp')?.value||_me.whatsapp||_lsCfgPdf.whatsapp||'').trim();
  const accNomeVal=(document.getElementById('accNome')?.value||_me.nome||'').trim();

  const tipoBemStr=[tipoBem!=='—'?tipoBem:'',modelo].filter(Boolean).join(' — ');

  // Logo SVG inline (símbolo do CRM em verde)
  const logoSVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" width="22" height="22" style="display:block"><polygon points="8,36 28,16 48,36 42,36 28,22 14,36" fill="#1db954"/><polygon points="8,48 28,28 48,48 42,48 28,34 14,48" fill="#1db954" opacity="0.6"/></svg>`;

  const estilos=`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',Arial,sans-serif;color:#0d1b35;background:#f5f7fa}
    .page{max-width:720px;margin:0 auto;background:#fff;box-shadow:0 0 40px rgba(0,0,0,.08)}
    /* HEADER TOPO */
    .pdf-top{background:linear-gradient(135deg,#0d2818 0%,#1a4a2e 60%,#1db954 100%);padding:20px 28px 18px;position:relative;overflow:hidden}
    .pdf-top::before{content:'';position:absolute;top:-40px;right:-40px;width:160px;height:160px;border-radius:50%;background:rgba(29,185,84,.15)}
    .pdf-top-row{display:flex;align-items:flex-start;justify-content:space-between;position:relative;z-index:1}
    .pdf-tag{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(29,185,84,.9);margin-bottom:4px}
    .pdf-title{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.03em;line-height:1.1;margin-bottom:2px}
    .pdf-client{font-size:12px;color:rgba(255,255,255,.75);margin-top:4px;font-weight:500}
    .pdf-credit-pill{background:rgba(29,185,84,.2);border:1.5px solid rgba(29,185,84,.5);border-radius:20px;padding:4px 12px;display:inline-flex;align-items:center;gap:6px;margin-top:8px}
    .pdf-credit-pill span{font-size:14px;font-weight:800;color:#4ade80;letter-spacing:-.01em}
    .pdf-credit-pill small{font-size:9px;color:rgba(255,255,255,.6);font-weight:500}
    .pdf-logo-badge{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
    .pdf-logo-icon{width:34px;height:34px;background:#1a3a28;border-radius:9px;display:flex;align-items:center;justify-content:center;border:1.5px solid rgba(29,185,84,.4)}
    .pdf-meta-pill{background:rgba(255,255,255,.1);border-radius:7px;padding:3px 9px;text-align:right}
    .pdf-meta-pill div{font-size:9px;color:rgba(255,255,255,.6);font-weight:500}
    /* CONTENT */
    .pdf-body{padding:16px 28px}
    /* INFO STRIP */
    .info-strip{display:flex;gap:0;background:#f0fdf5;border:1.5px solid #bbf7d0;border-radius:10px;overflow:hidden;margin-bottom:14px}
    .info-cell{flex:1;padding:9px 13px;border-right:1px solid #bbf7d0}
    .info-cell:last-child{border-right:none}
    .info-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#16a34a;margin-bottom:2px}
    .info-val{font-size:12px;font-weight:700;color:#0d2818}
    /* RESULTADO */
    .res-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
    .rc2{border-radius:10px;padding:13px;border:1.5px solid}
    .rc2.c{border-color:#86efac;background:linear-gradient(135deg,#f0fdf4,#dcfce7)}
    .rc2.f{border-color:#fca5a5;background:linear-gradient(135deg,#fef2f2,#fee2e2)}
    .rct{font-weight:700;font-size:11px;margin-bottom:8px;display:flex;align-items:center;gap:5px;text-transform:uppercase;letter-spacing:.05em}
    .rct.g{color:#15803d}.rct.r{color:#b91c1c}
    .rcrow{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.06)}
    .rcrow:last-child{border-bottom:none}
    .rcl{color:#4a5568;font-weight:500}.rcv{font-weight:700;color:#1a2233}
    /* highlight rows dentro do pdf */
    .rcrow[style*="background"]{border-radius:5px;padding:4px 7px;margin:2px 0}
    .eco-box{background:linear-gradient(135deg,#0d2818,#1a6e3c);color:#fff;border-radius:12px;padding:14px 20px;text-align:center;margin-bottom:12px;position:relative;overflow:hidden}
    .eco-box::before{content:'';position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;background:rgba(29,185,84,.2)}
    .eco-lbl{font-size:10px;opacity:.75;margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;position:relative;z-index:1}
    .eco-val{font-size:26px;font-weight:800;letter-spacing:-.03em;position:relative;z-index:1}
    .eco-sub{font-size:10px;opacity:.7;margin-top:4px;position:relative;z-index:1}
    /* CONSULTOR */
    .consultor-card{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #86efac;border-radius:12px;padding:13px 16px;display:flex;align-items:center;gap:14px;margin-bottom:12px}
    .consultor-foto{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2.5px solid #16a34a;flex-shrink:0}
    .consultor-foto-ph{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#15803d,#1db954);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;border:2.5px solid #16a34a}
    .consultor-nome{font-size:15px;font-weight:800;color:#0d2818;letter-spacing:-.02em}
    .consultor-cargo{font-size:10px;color:#16a34a;font-weight:600;letter-spacing:.05em;text-transform:uppercase;margin-top:1px;margin-bottom:5px}
    .consultor-contatos{display:flex;flex-wrap:wrap;gap:8px}
    .consultor-contato{font-size:11px;color:#166534;display:flex;align-items:center;gap:4px;font-weight:500}
    /* FOOTER */
    .pdf-footer{padding:10px 28px;background:#f8fafc;border-top:1px solid #e8ecf0;display:flex;align-items:center;justify-content:space-between}
    .pdf-footer-disc{font-size:9px;color:#94a3b8;flex:1;line-height:1.4}
    .pdf-footer-logo{display:flex;align-items:center;gap:7px;flex-shrink:0}
    .pdf-footer-logo-box{width:22px;height:22px;background:#1a3a28;border-radius:6px;display:flex;align-items:center;justify-content:center}
    .conv-btn,.btn{display:none!important}
    /* CELULAR */
    @media(max-width:640px){
      body{background:#f0fdf4}
      .page{box-shadow:none;border-radius:0}
      .pdf-top{padding:20px 16px 18px}
      .pdf-tag{font-size:10px}
      .pdf-title{font-size:20px}
      .pdf-client{font-size:13px}
      .pdf-credit-pill span{font-size:16px}
      .pdf-body{padding:16px}
      .info-strip{flex-direction:column}
      .info-cell{border-right:none;border-bottom:1px solid #bbf7d0;padding:10px 14px}
      .info-cell:last-child{border-bottom:none}
      .info-lbl{font-size:10px}
      .info-val{font-size:14px}
      .res-grid{grid-template-columns:1fr;gap:12px}
      .rc2{padding:14px}
      .rct{font-size:12px}
      .rcrow{font-size:13px;padding:6px 0}
      .eco-box{padding:16px}
      .eco-lbl{font-size:11px}
      .eco-val{font-size:28px}
      .eco-sub{font-size:11px}
      .consultor-card{flex-direction:column;text-align:center;padding:16px;gap:12px}
      .consultor-foto,.consultor-foto-ph{width:64px;height:64px;font-size:24px;margin:0 auto}
      .consultor-nome{font-size:17px}
      .consultor-contatos{justify-content:center}
      .consultor-contato{font-size:13px}
      .pdf-footer{flex-direction:column;gap:8px;text-align:center;padding:14px 16px}
      .pdf-footer-disc{font-size:10px}
    }
    /* IMPRESSÃO — força 1 página */
    @media print{
      body{background:#fff}
      .page{box-shadow:none;max-width:100%}
      @page{size:A4;margin:0}
    }
  `;

  // CONSULTOR SECTION
  let consultorHTML='';
  if(comDados){
    const insta=accInstagram?(accInstagram.startsWith('@')?accInstagram:'@'+accInstagram):'';
    const wa=accWhatsapp||'';
    consultorHTML=`
    <div class="consultor-card">
      ${fotoSrc
        ?`<img src="${fotoSrc}" class="consultor-foto" alt="Foto">`
        :`<div class="consultor-foto-ph">👤</div>`}
      <div style="flex:1">
        <div class="consultor-nome">${accNomeVal||'Consultor Evolux'}</div>
        <div class="consultor-cargo">Consultor de Crédito</div>
        <div class="consultor-contatos">
          ${insta?`<span class="consultor-contato"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:4px"><rect x="2" y="2" width="20" height="20" rx="5.5" stroke="#e1306c" stroke-width="2"/><circle cx="12" cy="12" r="4.5" stroke="#e1306c" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="#e1306c"/></svg>${insta}</span>`:''}
          ${wa?`<span class="consultor-contato"><svg width="13" height="13" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:4px"><path fill="#25d366" d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.1-1.34A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.93 13.57c-.21.58-1.22 1.11-1.68 1.18-.43.06-.97.09-1.56-.1-.36-.11-.82-.27-1.41-.52-2.47-1.07-4.08-3.56-4.21-3.73-.12-.17-.99-1.32-.99-2.52s.63-1.79.85-2.04c.22-.25.48-.31.64-.31l.46.01c.15 0 .35-.06.54.41l.76 1.91c.06.15.03.32-.05.46l-.34.45c-.1.12-.2.25-.09.48.12.23.52.86 1.12 1.39.77.69 1.42.9 1.62.99.2.09.32.07.44-.04l.49-.58c.13-.16.25-.12.42-.07l1.9.89c.18.08.3.13.33.2.03.07.03.42-.18 1z"/></svg>${wa}</span>`:''}
        </div>
      </div>
    </div>`;
  }

  // Nome do arquivo: Proposta_NomeCliente_ValorCredito
  const valorNumLimpo=valorStr.replace(/[R$\s.]/g,'').replace(',','.');
  const nomeArquivo=`Proposta_${nome.replace(/\s+/g,'_')}_${valorStr.replace(/[R$\s]/g,'').replace(/\./g,'').replace(',','.')}.html`;

  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Proposta — ${nome} — ${valorStr}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${estilos}</style></head><body>
  <div class="page">
    <!-- TOPO VERDE -->
    <div class="pdf-top">
      <div class="pdf-top-row">
        <div class="pdf-top-left">
          <div class="pdf-tag">Simulação de Crédito</div>
          <div class="pdf-title">Proposta Personalizada</div>
          ${nome!=='Cliente'?`<div class="pdf-client">Para: <strong style="color:#fff">${nome}</strong>${cpfCliente?` <span style="font-size:11px;opacity:.75;font-weight:400">· CPF ${cpfCliente}</span>`:''}${telCliente?` <span style="font-size:11px;opacity:.75;font-weight:400">· ${telCliente}</span>`:''}</div>`:''}
          <div class="pdf-credit-pill">
            <small>Crédito</small>
            <span>${valorStr}</span>
          </div>
        </div>
        <div class="pdf-logo-badge">
          <div class="pdf-logo-icon">${logoSVG}</div>
          <div class="pdf-meta-pill">
            <div>${adminNomeSim}</div>
            <div>${data}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="pdf-body">
      <!-- INFO STRIP -->
      <div class="info-strip">
        ${tipoBemStr?`<div class="info-cell"><div class="info-lbl">Tipo de bem</div><div class="info-val">${tipoBemStr}</div></div>`:''}
        <div class="info-cell"><div class="info-lbl">Crédito</div><div class="info-val">${valorStr}</div></div>
        <div class="info-cell"><div class="info-lbl">Administradora</div><div class="info-val">${adminNomeSim}</div></div>
      </div>

      <!-- CONSULTOR -->
      ${consultorHTML}

      <!-- RESULTADO DO SIMULADOR -->
      ${out.replace(/<button[^>]*class="[^"]*conv-btn[^"]*"[^>]*>.*?<\/button>/gs,'').replace(/<button[^>]*>.*?<\/button>/gs,'')}
    </div>

    <!-- FOOTER -->
    <div class="pdf-footer">
      <div class="pdf-footer-disc">Os valores apresentados são simulações e podem variar conforme administradoras de consórcio, condições contratuais, assembleias e taxas vigentes. Consulte seu representante para detalhes.</div>
      <div class="pdf-footer-logo" style="margin-left:20px">
        <div class="pdf-footer-logo-box">${logoSVG.replace('width="22" height="22"','width="16" height="16"')}</div>
      </div>
    </div>
  </div>
</body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=nomeArquivo;
  a.click();
  URL.revokeObjectURL(a.href);
}
function convertToLead(nome,tipo,credito){
  if(!nome){showToast('Preencha o nome do cliente.','ti-alert-triangle','#d97706');return;}
  leads.push({id:nextLeadId++,nome,tel:'',tipo,credito,etapa:'Novo lead',origem:'Simulador',responsavelId:(getMe()||users[0]||{}).id||1,data:toDate(),obs:'Convertido via simulador.'});
  const _cl=leads[leads.length-1]; if(window._syncLead) window._syncLead(_cl).catch(e=>console.warn(e));
  if(window._saveAtividade)window._saveAtividade('ti-calculator',`${nome} convertido via simulador — ${fmtR(credito)}`);
  showTab('leads',document.querySelectorAll('.nb')[2]);
}


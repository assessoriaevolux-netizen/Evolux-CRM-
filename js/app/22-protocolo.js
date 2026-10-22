// ─── PROTOCOLO DE AGENDAMENTO ─────────────────────────────────────────────────
let _protocoloData=null;

function gerarNumProtocolo(){
  const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  const seq=String(Math.floor(Math.random()*9000)+1000);
  return `EVX-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${seq}`;
}

function openProtocolo(leadId, data, horaIni, horaFim, obs){
  const lead=leads.find(l=>l.id===leadId);
  if(!lead){showToast('Lead não encontrado.','ti-alert-triangle','#d97706');return;}
  // Protocolo usa quem está logado (quem agendou), não o responsável do lead
  const me=typeof getMe==='function'?getMe():null;
  const resp=me||(users.find(u=>u.id===lead.responsavelId)||users[0]);
  const proto=gerarNumProtocolo();
  const dias=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const meses=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  let dataFmt='';
  if(data){
    const [y,m,d]=data.split('-').map(Number);
    const dt=new Date(y,m-1,d);
    dataFmt=`${dias[dt.getDay()]}, ${d} de ${meses[m-1]} de ${y}`;
  }
  _protocoloData={proto,lead,resp,data,dataFmt,horaIni,horaFim,obs};

  // Dados do consultor (igual à simulação)
  const fotoEl=document.getElementById('foto-preview-conta')?.querySelector('img');
  const fotoSrc=(fotoEl&&fotoEl.src&&!fotoEl.src.endsWith('/v7.html'))?fotoEl.src:(resp.foto||'');
  const accInstagram=(document.getElementById('accInstagram')?.value||resp.instagram||'').trim();
  const accWhatsapp=(document.getElementById('accWhatsapp')?.value||resp.whatsapp||'').trim();
  const accNomeVal=(document.getElementById('accNome')?.value||resp.nome||'').trim();
  const instaFmt=accInstagram?(accInstagram.startsWith('@')?accInstagram:'@'+accInstagram):'';

  const body=document.getElementById('protocolo-body');
  body.innerHTML=`
    <div style="background:linear-gradient(135deg,#0d2818,#1a4a2e);border-radius:10px;padding:16px 18px;margin-bottom:14px;display:flex;align-items:center;gap:14px">
      ${fotoSrc
        ?`<img src="${fotoSrc}" style="width:56px;height:56px;border-radius:10px;object-fit:cover;object-position:center 15%;border:2px solid #1db954;flex-shrink:0">`
        :`<div style="width:56px;height:56px;border-radius:10px;background:linear-gradient(135deg,#15803d,#1db954);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;border:2px solid #1db954">👤</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:15px;font-weight:800;color:#fff;letter-spacing:-.01em">${accNomeVal||resp.nome}</div>
        <div style="font-size:10px;font-weight:600;color:#4ade80;text-transform:uppercase;letter-spacing:.08em;margin-top:2px">Consultor de Crédito</div>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:7px">
          ${instaFmt?`<span style="font-size:11px;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="5.5" stroke="#e1306c" stroke-width="2"/><circle cx="12" cy="12" r="4.5" stroke="#e1306c" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="#e1306c"/></svg>${instaFmt}</span>`:''}
          ${accWhatsapp?`<span style="font-size:11px;color:rgba(255,255,255,.75);display:flex;align-items:center;gap:4px"><svg width="11" height="11" viewBox="0 0 24 24"><path fill="#25d366" d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.1-1.34A9.93 9.93 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.93 13.57c-.21.58-1.22 1.11-1.68 1.18-.43.06-.97.09-1.56-.1-.36-.11-.82-.27-1.41-.52-2.47-1.07-4.08-3.56-4.21-3.73-.12-.17-.99-1.32-.99-2.52s.63-1.79.85-2.04c.22-.25.48-.31.64-.31l.46.01c.15 0 .35-.06.54.41l.76 1.91c.06.15.03.32-.05.46l-.34.45c-.1.12-.2.25-.09.48.12.23.52.86 1.12 1.39.77.69 1.42.9 1.62.99.2.09.32.07.44-.04l.49-.58c.13-.16.25-.12.42-.07l1.9.89c.18.08.3.13.33.2.03.07.03.42-.18 1z"/></svg>${accWhatsapp}</span>`:''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:9px;font-weight:600;color:rgba(29,185,84,.9);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px">Protocolo</div>
        <div style="font-size:11px;font-weight:800;color:#4ade80;font-family:monospace">${proto}</div>
      </div>
    </div>
    <div style="background:var(--c0);border:1px solid var(--c2);border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Cliente</div>
          <div style="font-size:13px;font-weight:700;color:var(--tx)">${lead.nome}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Telefone</div>
          <div style="font-size:13px;font-weight:700;color:var(--tx)">${lead.tel||'—'}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Data <span style="color:var(--g);font-size:9px">(editável)</span></div>
          <input type="date" id="proto-data" value="${data||''}" style="font-size:12px;font-weight:600;color:var(--tx);background:var(--w);border:1px solid var(--c3);border-radius:6px;padding:4px 7px;width:100%;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Horário <span style="color:var(--g);font-size:9px">(editável)</span></div>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="time" id="proto-hora-ini" value="${horaIni||''}" style="font-size:12px;font-weight:600;color:var(--tx);background:var(--w);border:1px solid var(--c3);border-radius:6px;padding:4px 5px;flex:1;box-sizing:border-box">
            <span style="color:var(--tm);font-size:11px">–</span>
            <input type="time" id="proto-hora-fim" value="${horaFim||''}" style="font-size:12px;font-weight:600;color:var(--tx);background:var(--w);border:1px solid var(--c3);border-radius:6px;padding:4px 5px;flex:1;box-sizing:border-box">
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Interesse</div>
          <div style="font-size:13px;font-weight:700;color:var(--tx)">${lead.tipo} · ${fmtR(lead.credito)}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Administradora</div>
          <div style="font-size:13px;font-weight:700;color:var(--tx)">${lead.admin||'—'}</div>
        </div>
      </div>
      ${obs?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--c2)"><div style="font-size:10px;color:var(--tm);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Observações</div><div style="font-size:12px;color:var(--tx)">${obs}</div></div>`:''}
    </div>
    <div style="background:rgba(29,185,84,.07);border:1px solid rgba(29,185,84,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--tx);line-height:1.6;text-align:center;margin-bottom:12px">
      ✅ <strong>Atendimento confirmado.</strong> Estamos comprometidos em encontrar a melhor solução para você.
    </div>
    <button class="btn bp" onclick="openProtoPDFModal()" style="width:100%;justify-content:center;font-size:13px;padding:10px"><i class="ti ti-file-download"></i> Baixar PDF</button>
  `;
  document.getElementById('modal-protocolo').classList.add('open');
}


function closeProtocolo(){
  document.getElementById('modal-protocolo').classList.remove('open');
  _protocoloData=null;
}

function copiarProtocoloWA(){
  if(!_protocoloData)return;
  const {proto,lead,resp,obs}=_protocoloData;
  const dataVal=document.getElementById('proto-data')?.value||'';
  const horaIni=document.getElementById('proto-hora-ini')?.value||'';
  const horaFim=document.getElementById('proto-hora-fim')?.value||'';
  let dataFmt=dataVal;
  if(dataVal){try{const p=dataVal.split('-');dataFmt=`${p[2]}/${p[1]}/${p[0]}`;}catch(e){}}
  const consultor=_getConsultorDados(resp);
  const txt=`✅ *PROTOCOLO DE AGENDAMENTO*\n🔖 Protocolo: ${proto}\n\nOlá, *${lead.nome}*! Seu atendimento está confirmado.\n\n📅 Data: ${dataFmt||'—'}\n🕐 Horário: ${horaIni||'—'}${horaFim?' – '+horaFim:''}\n👤 Consultor: ${consultor.nome}\n💰 Interesse: ${lead.tipo} · ${fmtR(lead.credito)}${obs?'\n📝 '+obs:''}${consultor.whatsapp?'\n\n📞 '+consultor.whatsapp:''}${consultor.instaFmt?'\n📸 '+consultor.instaFmt:''}`;
  navigator.clipboard.writeText(txt).then(()=>showToast('Texto copiado! Cole no WhatsApp.','ti-brand-whatsapp')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
    showToast('Texto copiado! Cole no WhatsApp.','ti-brand-whatsapp');
  });
}

function openProtoPDFModal(){
  if(!_protocoloData)return;
  const m=document.getElementById('proto-pdf-modal');
  if(m) m.style.display='flex';
}
function closeProtoPDFModal(){
  const m=document.getElementById('proto-pdf-modal');
  if(m) m.style.display='none';
}

function _getConsultorDados(resp){
  const fotoEl=document.getElementById('foto-preview-conta')?.querySelector('img');
  const fotoSrc=(fotoEl&&fotoEl.src&&!fotoEl.src.endsWith('/v7.html'))?fotoEl.src:(resp.foto||'');
  const accInstagram=(document.getElementById('accInstagram')?.value||resp.instagram||'').trim();
  const accWhatsapp=(document.getElementById('accWhatsapp')?.value||resp.whatsapp||'').trim();
  const accNome=(document.getElementById('accNome')?.value||resp.nome||'').trim();
  const instaFmt=accInstagram?(accInstagram.startsWith('@')?accInstagram:'@'+accInstagram):'';
  return {fotoSrc,instaFmt,whatsapp:accWhatsapp,nome:accNome};
}

function gerarProtocoloPDF(comDados=true){
  if(!_protocoloData){return;}
  const {proto,lead,resp,obs}=_protocoloData;
  const dataVal=document.getElementById('proto-data')?.value||'';
  const horaIni=document.getElementById('proto-hora-ini')?.value||'';
  const horaFim=document.getElementById('proto-hora-fim')?.value||'';
  let dataFmt=dataVal;
  if(dataVal){try{const p=dataVal.split('-');dataFmt=`${p[2]}/${p[1]}/${p[0]}`;}catch(e){}}
  const consultor=comDados?_getConsultorDados(resp):null;
  if(!window.jspdf){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=()=>_renderProtocoloPDF(proto,lead,consultor,dataFmt,horaIni,horaFim,obs);
    document.head.appendChild(s);
  } else {
    _renderProtocoloPDF(proto,lead,consultor,dataFmt,horaIni,horaFim,obs);
  }
}

function _renderProtocoloPDF(proto,lead,consultor,dataFmt,horaIni,horaFim,obs){
  const {jsPDF}=window.jspdf;
  // Formato A4 — funciona bem em PC e mobile (visualizadores de PDF fazem zoom automático)
  const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait'});
  const W=210, H=297, mg=16;
  let y=0;

  // ══ HEADER — fundo escuro ══
  doc.setFillColor(10,32,20);
  doc.rect(0,0,W,58,'F');
  // Barra verde fina no rodapé do header
  doc.setFillColor(29,185,84);
  doc.rect(0,56,W,2,'F');

  if(consultor){
    if(consultor.fotoSrc){
      try{
        doc.setFillColor(25,60,38);
        doc.roundedRect(mg,10,34,34,4,4,'F');
        doc.addImage(consultor.fotoSrc,'PNG',mg,10,34,34,'','FAST');
        doc.setDrawColor(29,185,84);doc.setLineWidth(0.7);
        doc.roundedRect(mg,10,34,34,4,4,'S');
      }catch(e){}
      const tx=mg+40;
      doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(255,255,255);
      doc.text(consultor.nome||'Consultor',tx,22);
      doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(74,222,128);
      doc.text('CONSULTOR DE CRÉDITO',tx,30);
      const contatos=[consultor.whatsapp,consultor.instaFmt].filter(Boolean).join('   ·   ');
      if(contatos){
        doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(180,220,200);
        doc.text(contatos,tx,40);
      }
    } else {
      doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(255,255,255);
      doc.text(consultor.nome||'Consultor',mg,22);
      doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(74,222,128);
      doc.text('CONSULTOR DE CRÉDITO',mg,30);
      const contatos=[consultor.whatsapp,consultor.instaFmt].filter(Boolean).join('   ·   ');
      if(contatos){
        doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(180,220,200);
        doc.text(contatos,mg,40);
      }
    }
  } else {
    doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(255,255,255);
    doc.text('PROTOCOLO DE AGENDAMENTO',W/2,26,{align:'center'});
    doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(74,222,128);
    doc.text('Confirmação de atendimento',W/2,36,{align:'center'});
  }

  // Número do protocolo (canto direito do header)
  doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.setTextColor(74,222,128);
  doc.text('PROTOCOLO',W-mg,15,{align:'right'});
  doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(255,255,255);
  doc.text(proto,W-mg,23,{align:'right'});

  y=70;

  // ══ TÍTULO ══
  doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(10,32,20);
  doc.text('CONFIRMAÇÃO DE AGENDAMENTO',mg,y);
  doc.setFillColor(29,185,84);
  doc.rect(mg,y+2.5,42,1.2,'F');
  y+=14;

  // ══ CAMPOS — lista vertical (1 coluna, fácil de ler no celular) ══
  const campos=[
    ['Cliente',lead.nome||'—'],
    ['Telefone',lead.tel||'—'],
    ['Data',dataFmt||'—'],
    ['Horário',`${horaIni||'—'}${horaFim?' – '+horaFim:''}`],
    ['Interesse / Crédito',`${lead.tipo||'—'} · ${fmtR(lead.credito)}`],
  ];
  if(obs) campos.push(['Observações',obs]);

  const rowH=16;
  const cardH=campos.length*rowH+10;

  doc.setFillColor(245,252,247);
  doc.roundedRect(mg,y,W-2*mg,cardH,5,5,'F');
  doc.setDrawColor(195,232,210);doc.setLineWidth(0.5);
  doc.roundedRect(mg,y,W-2*mg,cardH,5,5,'S');

  y+=10;
  campos.forEach(([label,val],i)=>{
    const x=mg+8;
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(22,101,52);
    doc.text(label.toUpperCase(),x,y);
    doc.setFont('helvetica','normal');doc.setFontSize(11);doc.setTextColor(10,32,20);
    const lines=doc.splitTextToSize(String(val),W-2*mg-16);
    doc.text(lines,x,y+5.5);
    if(i<campos.length-1){
      doc.setDrawColor(215,238,222);doc.setLineWidth(0.3);
      doc.line(mg+4,y+rowH-1,W-mg-4,y+rowH-1);
    }
    y+=rowH;
  });
  y+=12;

  // ══ BANNER CONFIRMADO ══
  doc.setFillColor(22,135,60);
  doc.roundedRect(mg,y,W-2*mg,18,4,4,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(255,255,255);
  doc.text('✓   Atendimento confirmado',W/2,y+12,{align:'center'});
  y+=28;

  // ══ MENSAGEM ══
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(50,90,65);
  const msgLines=doc.splitTextToSize('Estamos comprometidos em encontrar a melhor solução de crédito para você.',W-2*mg-8);
  doc.text(msgLines,W/2,y,{align:'center'});
  y+=msgLines.length*6+10;

  // ══ RODAPÉ ══
  const rodapeY=H-22;
  doc.setFillColor(10,32,20);
  doc.rect(0,rodapeY,W,22,'F');
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(74,222,128);
  doc.text('EVOLUX ASSESSORIA',mg,rodapeY+9);
  if(consultor&&(consultor.whatsapp||consultor.instaFmt)){
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(180,220,200);
    const rodInfo=[consultor.whatsapp,consultor.instaFmt].filter(Boolean).join('   ·   ');
    doc.text(rodInfo,mg,rodapeY+16);
  }
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(100,155,120);
  doc.text(proto,W-mg,rodapeY+13,{align:'right'});

  doc.save(`Protocolo_${lead.nome.replace(/\s+/g,'_')}_${proto}.pdf`);
  showToast('PDF gerado com sucesso!','ti-file-download');
}


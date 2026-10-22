// ─── MODELOS (removido) ───────────────────────────────────────────────────────
function selMod(el,key){}
function copyMod(){}
async function personalizeMod(){}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
// ─── ADMINISTRADORAS — nova implementação completa ────────────────────────────
let adminEditId=null; // id em edição no modal de grupos
let adminGrupoEditIdx=null; // índice do grupo em edição

function renderAdminList(){
  const a=getAdmin();
  const chip=document.getElementById('admin-chip-nome');
  if(chip)chip.textContent=a?a.nome:'—';
  const panel=document.getElementById('admin-list');
  if(!panel)return;
  if(!administradoras.length){
    panel.innerHTML='<div style="text-align:center;padding:32px;color:var(--tm);font-size:13px"><i class="ti ti-building-bank" style="font-size:32px;display:block;margin-bottom:8px;opacity:.4"></i>Nenhuma administradora cadastrada.<br>Adicione a primeira abaixo.</div>';
    return;
  }
  panel.innerHTML=administradoras.map(ad=>{
    const grupos=ad.grupos||[];
    const vagasTotal=grupos.reduce((s,g)=>s+(g.vagas||0),0);
    const isAtiva=ad.ativa;
    return `<div style="border:1.5px solid ${isAtiva?'var(--g)':'var(--card-border,#e8ecf0)'};border-radius:12px;padding:14px 16px;margin-bottom:8px;cursor:pointer;transition:all .15s;background:${isAtiva?'rgba(1,107,60,.04)':'var(--card-bg)'}" onclick="selectAdmin(${ad.id})">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:14px;font-weight:800;color:var(--tx)">${ad.nome}</span>
            ${isAtiva?'<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(1,107,60,.12);color:var(--g);font-weight:700"><i class="ti ti-check" style="font-size:10px"></i> Ativa</span>':''}
          </div>
          <div style="font-size:11.5px;color:var(--tm);margin-top:3px">${ad.cnpj||''} ${ad.tipo?'· '+ad.tipo:''}</div>
          <div style="display:flex;gap:12px;margin-top:6px;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--ts);font-weight:600"><i class="ti ti-layers-subtract" style="font-size:11px"></i> ${grupos.length} grupo${grupos.length!==1?'s':''}</span>
            <span style="font-size:12px;color:${vagasTotal>0?'var(--gc)':'var(--tm)'};font-weight:600"><i class="ti ti-ticket" style="font-size:11px"></i> ${vagasTotal} vaga${vagasTotal!==1?'s':''} disponíveis</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button onclick="event.stopPropagation();openAdminModal(${ad.id})" style="background:var(--c0);border:1px solid var(--c2);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;color:var(--ts);font-weight:600"><i class="ti ti-pencil" style="font-size:12px"></i> Editar</button>
          <button onclick="event.stopPropagation();deleteAdmin(${ad.id})" style="background:var(--rs);border:1px solid var(--rb);border-radius:8px;padding:6px 8px;cursor:pointer;color:var(--r)"><i class="ti ti-trash" style="font-size:13px"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function selectAdmin(id){
  administradoras.forEach(a=>a.ativa=a.id===id);
  renderAdminList();
  syncSim();
}

function deleteAdmin(id){
  showConfirm('Remover esta administradora e todos os seus grupos? Esta ação não pode ser desfeita.',function(){
    const _da=administradoras.find(a=>a.id===id);
    if(_da?.sb_id&&window._sb) window._sb.from('administradoras').delete().eq('id',_da.sb_id).catch(e=>console.warn(e));
    administradoras=administradoras.filter(a=>a.id!==id);
    if(!administradoras.find(a=>a.ativa)&&administradoras.length)administradoras[0].ativa=true;
    renderAdminList();
    syncSim();
  });
}

function saveTaxaFin(){const el=document.getElementById('eTaxaFin');if(!el)return;const v=parseFloat(el.value);if(!isNaN(v))taxaFin=v;}
function applyAdmin(){if(document.getElementById('eTaxaFin'))saveTaxaFin();syncSim();}

// ── MODAL DE ADMIN ────────────────────────────────────────────────────────────
function openAdminModal(id){
  adminEditId=id||null;
  const ad=id?administradoras.find(a=>a.id===id):null;
  document.getElementById('adm-modal-title').textContent=ad?'Editar administradora':'Nova administradora';
  document.getElementById('adm-nome').value=ad?ad.nome:'';
  document.getElementById('adm-cnpj').value=ad?ad.cnpj||'':'';
  document.getElementById('adm-tipo').value=ad?ad.tipo||'Imóvel':'Imóvel';
  adminRenderGrupos(ad?ad.grupos||[]:[], false);
  // Reset PDFs
  admPdfDocs=[];admPdfViewerIdx=null;
  const pdfLista=document.getElementById('adm-pdfs-lista');if(pdfLista)pdfLista.style.display='none';
  const pdfViewer=document.getElementById('adm-pdf-viewer-wrap');if(pdfViewer)pdfViewer.style.display='none';
  const pdfStatus=document.getElementById('adm-pdf-status');if(pdfStatus){pdfStatus.textContent='';pdfStatus.style.color='';}
  document.getElementById('adm-modal').style.display='flex';
  document.body.style.overflow='hidden';
}
function closeAdminModal(){document.getElementById('adm-modal').style.display='none';document.body.style.overflow='';}

function adminRenderGrupos(grupos, highlight){
  const container=document.getElementById('adm-grupos-list');
  if(!grupos.length){
    container.innerHTML='<div style="text-align:center;padding:20px;color:var(--tm);font-size:12.5px">Nenhum grupo cadastrado. Adicione abaixo ou importe via PDF.</div>';
    return;
  }
  container.innerHTML=`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
    <thead><tr style="background:var(--c0)">
      <th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Categoria</th>
      <th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Grupo</th>
      <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Crédito (R$)</th>
      <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Prazo (m)</th>
      <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Taxa adm.</th>
      <th style="padding:8px 10px;text-align:right;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Entrada mín.</th>
      <th style="padding:8px 10px;text-align:center;font-weight:700;color:var(--tm);border-bottom:1px solid var(--c2)">Vagas</th>
      <th style="padding:8px 10px;text-align:center;border-bottom:1px solid var(--c2)"></th>
    </tr></thead>
    <tbody>${grupos.map((g,i)=>{
      const bg=highlight&&i>=grupos.length-highlight?'rgba(1,107,60,.06)':'transparent';
      const catHtml=g.categoria?'<span style="background:var(--gs);color:var(--g);font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;white-space:nowrap">'+g.categoria+'</span>':'<span style="color:var(--tm);font-size:12px">—</span>';
      const entCor=g.entradaMin>0?'var(--y)':'var(--g)';
      const entTxt=g.entradaMin>0?g.entradaMin+'%':'Não exige';
      const vagCor=g.vagas>0?'var(--gc)':'var(--r)';
      return '<tr style="border-bottom:1px solid var(--c2);background:'+bg+'">'
        +'<td style="padding:8px 10px">'+catHtml+'</td>'
        +'<td style="padding:8px 10px;font-weight:700;color:var(--tx)">'+(g.numero||'—')+'</td>'
        +'<td style="padding:8px 10px;text-align:right;color:var(--tx)">'+fmtR(g.credito||0)+'</td>'
        +'<td style="padding:8px 10px;text-align:right;color:var(--ts)">'+(g.prazo||'—')+'</td>'
        +'<td style="padding:8px 10px;text-align:right;color:var(--ts)">'+(g.taxa!=null?g.taxa+'%':'—')+'</td>'
        +'<td style="padding:8px 10px;text-align:right;color:'+entCor+';font-weight:700">'+entTxt+'</td>'
        +'<td style="padding:8px 10px;text-align:center"><span style="font-weight:700;color:'+vagCor+'">'+(g.vagas!=null?g.vagas:'—')+'</span></td>'
        +'<td style="padding:8px 10px;text-align:center;white-space:nowrap">'
        +'<button onclick="admEditGrupo('+i+')" style="background:none;border:none;cursor:pointer;color:var(--tm);padding:2px 5px"><i class="ti ti-pencil" style="font-size:13px"></i></button>'
        +'<button onclick="admDeleteGrupo('+i+')" style="background:none;border:none;cursor:pointer;color:var(--r);padding:2px 5px"><i class="ti ti-trash" style="font-size:13px"></i></button>'
        +'</td></tr>';
    }).join('')}</tbody>
  </table></div>`;
}

function admGetCurrentGrupos(){
  // pega grupos da admin em edição (em memória temporária via DOM não serve — usamos array em adminEditId)
  if(adminEditId){const ad=administradoras.find(a=>a.id===adminEditId);return ad?[...ad.grupos||[]]:[]}
  return admTempGrupos||[];
}
let admTempGrupos=[];

function openAdminModalNew(){
  admTempGrupos=[];
  openAdminModal(null);
}

function admEditGrupo(idx){
  const grupos=adminEditId?administradoras.find(a=>a.id===adminEditId)?.grupos||[]:admTempGrupos;
  const g=grupos[idx];
  if(!g)return;
  document.getElementById('adm-g-categoria').value=g.categoria||'';
  document.getElementById('adm-g-numero').value=g.numero||'';
  document.getElementById('adm-g-credito').value=fmt(g.credito||0);
  document.getElementById('adm-g-prazo').value=g.prazo||'';
  document.getElementById('adm-g-taxa').value=g.taxa!=null?g.taxa:'';
  document.getElementById('adm-g-entrada').value=g.entradaMin!=null?g.entradaMin:'';
  document.getElementById('adm-g-vagas').value=g.vagas!=null?g.vagas:'';
  adminGrupoEditIdx=idx;
  document.getElementById('adm-g-btn').textContent='Atualizar grupo';
}

function admDeleteGrupo(idx){
  if(adminEditId){
    const ad=administradoras.find(a=>a.id===adminEditId);
    if(ad){ad.grupos.splice(idx,1);adminRenderGrupos(ad.grupos,false);}
  } else {
    admTempGrupos.splice(idx,1);adminRenderGrupos(admTempGrupos,false);
  }
  adminGrupoEditIdx=null;
}

function admAddGrupo(){
  const categoria=document.getElementById('adm-g-categoria').value.trim();
  const numero=document.getElementById('adm-g-numero').value.trim();
  const credito=unM(document.getElementById('adm-g-credito').value);
  const prazo=parseInt(document.getElementById('adm-g-prazo').value)||0;
  const taxa=parseFloat(document.getElementById('adm-g-taxa').value);
  const entradaMin=parseFloat(document.getElementById('adm-g-entrada').value);
  const vagas=parseInt(document.getElementById('adm-g-vagas').value);
  if(!credito||!prazo){showToast('Informe pelo menos o crédito e o prazo.','ti-alert-triangle','#d97706');return;}
  const grupo={categoria:categoria||null,numero:numero||('G'+Date.now()),credito,prazo,taxa:isNaN(taxa)?null:taxa,entradaMin:isNaN(entradaMin)?0:entradaMin,vagas:isNaN(vagas)?0:vagas};
  if(adminEditId){
    const ad=administradoras.find(a=>a.id===adminEditId);
    if(ad){
      if(adminGrupoEditIdx!==null){ad.grupos[adminGrupoEditIdx]=grupo;}
      else{ad.grupos=ad.grupos||[];ad.grupos.push(grupo);}
      adminRenderGrupos(ad.grupos, adminGrupoEditIdx===null?1:false);
    }
  } else {
    if(adminGrupoEditIdx!==null){admTempGrupos[adminGrupoEditIdx]=grupo;}
    else{admTempGrupos.push(grupo);}
    adminRenderGrupos(admTempGrupos, adminGrupoEditIdx===null?1:false);
  }
  adminGrupoEditIdx=null;
  ['adm-g-categoria','adm-g-numero','adm-g-credito','adm-g-prazo','adm-g-taxa','adm-g-entrada','adm-g-vagas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('adm-g-btn').textContent='Adicionar';
}

function saveAdminModal(){
  const nome=document.getElementById('adm-nome').value.trim();
  if(!nome){showToast('Informe o nome da administradora.','ti-alert-triangle','#d97706');return;}
  const cnpj=document.getElementById('adm-cnpj').value.trim();
  const tipo=document.getElementById('adm-tipo').value;
  if(adminEditId){
    const ad=administradoras.find(a=>a.id===adminEditId);
    if(ad){ad.nome=nome;ad.cnpj=cnpj;ad.tipo=tipo;if(window._syncAdministradora) window._syncAdministradora(ad).catch(e=>console.warn(e));}
  } else {
    const grupos=[...admTempGrupos];
    administradoras.push({id:nextAdminId++,nome,cnpj,tipo,grupos,ativa:administradoras.length===0});
    if(window._syncAdministradora) window._syncAdministradora(administradoras[administradoras.length-1]).catch(e=>console.warn(e));
    admTempGrupos=[];
  }
  closeAdminModal();
  renderAdminList();
  syncSim();
  cfgRenderSection();
}

// ── LEITOR DE PDF (múltiplos) ─────────────────────────────────────────────────
let admPdfDocs=[];      // [{nome, arrayBuffer, pdfDoc, paginaAtual}]
let admPdfViewerIdx=null;

function admUploadPDFs(evt){
  const files=Array.from(evt.target.files);if(!files.length)return;
  const btn=document.getElementById('adm-pdf-status');
  if(btn){btn.textContent=`Lendo ${files.length} PDF${files.length>1?'s':''}...`;btn.style.color='var(--tm)';}
  function ensurePdfJs(cb){
    if(window.pdfjsLib){cb();return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';cb();};
    document.head.appendChild(s);
  }
  ensurePdfJs(()=>{
    let totalImportados=0;let totalFailed=0;let done=0;
    files.forEach(file=>{
      const reader=new FileReader();
      reader.onload=function(e){
        const buf=e.target.result;
        pdfjsLib.getDocument({data:buf}).promise.then(pdfDoc=>{
          const entry={nome:file.name,arrayBuffer:buf,pdfDoc,paginaAtual:1};
          admPdfDocs.push(entry);
          admPdfRenderLista();
          // tenta extrair texto
          const pages=[];for(let i=1;i<=pdfDoc.numPages;i++)pages.push(i);
          Promise.all(pages.map(n=>pdfDoc.getPage(n).then(p=>p.getTextContent().then(tc=>{
            // Retorna todos os items com posição para parser preciso
            return {items:tc.items,str:tc.items.map(it=>it.str).join(' ')};
          })))).then(pageData=>{
            const allItems=pageData.flatMap(pd=>pd.items);
            const text=pageData.map(pd=>pd.str).join('\n');
            // Tenta primeiro o parser preciso por posição X,Y
            let novos=admParsePDFWords(allItems);
            // Fallback para parser de texto se não conseguiu nada
            if(!novos.length)novos=admParsePDFTextToGrupos(text);
            if(novos.length){
              totalImportados+=novos.length;
              if(adminEditId){const ad=administradoras.find(a=>a.id===adminEditId);if(ad){ad.grupos=[...ad.grupos||[],...novos];adminRenderGrupos(ad.grupos,novos.length);}}
              else{admTempGrupos=[...admTempGrupos,...novos];adminRenderGrupos(admTempGrupos,novos.length);}
            } else {
              totalFailed++;
              // abre viewer para o primeiro PDF que falhou
              if(totalFailed===1)admPdfShowViewer(entry);
            }
          }).finally(()=>{
            done++;
            if(done===files.length){
              if(btn){
                if(totalImportados>0)btn.textContent=`✓ ${totalImportados} grupo${totalImportados!==1?'s':''} importado${totalImportados!==1?'s':''}!`;
                else btn.textContent='';
                btn.style.color=totalImportados>0?'var(--g)':'';
                if(totalImportados>0)setTimeout(()=>{if(btn){btn.textContent='';btn.style.color='';}},4000);
              }
            }
          });
        }).catch(()=>{totalFailed++;done++;});
      };
      reader.readAsArrayBuffer(file);
    });
  });
  evt.target.value='';
}

function admPdfRenderLista(){
  const wrap=document.getElementById('adm-pdfs-lista');
  const items=document.getElementById('adm-pdfs-items');
  if(!wrap||!items)return;
  if(!admPdfDocs.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  items.innerHTML=admPdfDocs.map((d,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--w);border:1px solid var(--c2);border-radius:8px">
      <i class="ti ti-file-type-pdf" style="color:#e53e3e;font-size:16px;flex-shrink:0"></i>
      <span style="flex:1;font-size:12px;font-weight:600;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.nome}</span>
      <button onclick="admPdfShowViewer(admPdfDocs[${i}])" style="background:var(--bs);border:none;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px;font-weight:700;color:var(--b)" title="Ver PDF">
        <i class="ti ti-eye" style="font-size:12px"></i> Ver
      </button>
      <button onclick="admPdfRemove(${i})" style="background:var(--rs);border:none;border-radius:6px;padding:3px 6px;cursor:pointer;color:var(--r)">
        <i class="ti ti-x" style="font-size:12px"></i>
      </button>
    </div>`).join('');
}

function admPdfRemove(idx){
  admPdfDocs.splice(idx,1);
  admPdfRenderLista();
  if(!admPdfDocs.length)document.getElementById('adm-pdf-viewer-wrap').style.display='none';
}

function admPdfShowViewer(entry){
  const wrap=document.getElementById('adm-pdf-viewer-wrap');
  if(!wrap)return;
  wrap.style.display='block';
  admPdfViewerIdx=admPdfDocs.indexOf(entry);
  admPdfRenderPage(entry, entry.paginaAtual||1);
}

function admPdfRenderPage(entry, pageNum){
  const canvas=document.getElementById('adm-pdf-canvas');
  const info=document.getElementById('adm-pdf-page-info');
  if(!canvas||!entry.pdfDoc)return;
  entry.paginaAtual=Math.max(1,Math.min(pageNum,entry.pdfDoc.numPages));
  if(info)info.textContent=`Pág ${entry.paginaAtual}/${entry.pdfDoc.numPages}`;
  entry.pdfDoc.getPage(entry.paginaAtual).then(page=>{
    const scale=Math.min(canvas.offsetWidth/page.getViewport({scale:1}).width,1.5)||1;
    const vp=page.getViewport({scale});
    canvas.width=vp.width;canvas.height=vp.height;
    page.render({canvasContext:canvas.getContext('2d'),viewport:vp});
  });
}

function admPdfPage(delta){
  if(admPdfViewerIdx===null||!admPdfDocs[admPdfViewerIdx])return;
  const entry=admPdfDocs[admPdfViewerIdx];
  admPdfRenderPage(entry,(entry.paginaAtual||1)+delta);
}

function parseBRL(s){
  if(!s||s==='-')return null;
  return parseFloat(s.replace(/[R$\s.]/g,'').replace(',','.'));
}

// Parser via pdfjs words com posição X,Y — detecta colunas dinamicamente
function admParsePDFWords(wordItems){
  const words=wordItems.filter(w=>w.str&&w.str.trim()).map(w=>({
    text:w.str.trim(),
    x:w.transform[4],
    y:w.transform[5]
  }));
  if(!words.length)return[];

  // Inverter Y (PDF cresce de baixo pra cima → queremos topo pra baixo)
  const maxY=Math.max(...words.map(w=>w.y));
  words.forEach(w=>w.yTop=maxY-w.y);

  // ── Nome da tabela: linha mais alta do PDF ──
  const sorted=words.slice().sort((a,b)=>a.yTop-b.yTop);
  // Pega as primeiras palavras agrupadas na mesma linha Y
  const topoY=sorted[0]?.yTop??0;
  const nomeTabela=sorted.filter(w=>Math.abs(w.yTop-topoY)<15).map(w=>w.text).join(' ').trim()||'';

  // ── Tipo de bem: busca em todo o texto ──
  const textoCompleto=words.map(w=>w.text).join(' ');
  const reTipoBem=/\b(im[oó]vel|autom[oó]vel|ve[ií]culo|carro|moto(?:cicleta)?|servi[cç]o|cami(?:nh[aã]o)?|m[oó]vel)\b/i;
  const mTipo=textoCompleto.match(reTipoBem);
  const tipoBem=mTipo?mTipo[1].charAt(0).toUpperCase()+mTipo[1].slice(1).toLowerCase():null;

  // ── Detectar prazos no cabeçalho (yTop < 25% da altura total) ──
  const maxYTop=Math.max(...words.map(w=>w.yTop));
  const limiteHeader=maxYTop*0.25;
  const prazoWords=words.filter(w=>/^\d{2,3}[Xx]$/.test(w.text)&&w.yTop<limiteHeader);
  prazoWords.sort((a,b)=>a.x-b.x);

  // ── Detectar taxas próximas aos prazos (mesma região Y) ──
  const taxaWords=words.filter(w=>/^\d{1,2}[,\.]\d{2}%$/.test(w.text)&&w.yTop<limiteHeader);
  taxaWords.sort((a,b)=>a.x-b.x);

  // ── Detectar cabeçalhos "1ªParcela" / "Parcela" e "Demais" ──
  const header1Words=words.filter(w=>/(1[ªa°]?\s*Parcela|Entrada)/i.test(w.text)&&w.yTop<limiteHeader).sort((a,b)=>a.x-b.x);
  const headerDWords=words.filter(w=>/Demais/i.test(w.text)&&w.yTop<limiteHeader).sort((a,b)=>a.x-b.x);

  // Montar planos com X das sub-colunas detectados
  const planos=prazoWords.map((pw,i)=>{
    const prazo=parseInt(pw.text);
    const taxa=taxaWords[i]?parseFloat(taxaWords[i].text.replace(',','.').replace('%','')):null;
    const x1hdr=header1Words[i];
    const xdhdr=headerDWords[i];
    return{prazo,taxa,x1hdr:x1hdr?.x??null,xdhdr:xdhdr?.x??null,xPrazo:pw.x};
  });

  // Se não detectou prazos, retorna vazio para usar fallback de texto
  if(!planos.length)return[];

  // ── Grupos: números de 4 dígitos no meio do doc ──
  const grupoNums=words.filter(w=>/^\d{4}$/.test(w.text)&&w.yTop>limiteHeader*0.5).sort((a,b)=>a.yTop-b.yTop);

  // ── Categorias: palavras após "Plano" ──
  const planoWordsList=words.filter(w=>/^Plano$/i.test(w.text)&&w.yTop>limiteHeader*0.3).sort((a,b)=>a.yTop-b.yTop);
  const categorias=planoWordsList.map(pw=>{
    const proximas=words.filter(w=>Math.abs(w.yTop-pw.yTop)<12&&w.x>pw.x&&w.x<pw.x+200).sort((a,b)=>a.x-b.x);
    return{nome:'Plano '+proximas.map(w=>w.text).join(' ').trim(),y:pw.yTop};
  });

  // ── Linhas de dados: agrupar por Y com tolerância de 5pt ──
  const dataWords=words.filter(w=>w.yTop>limiteHeader*0.4);
  const rowMap={};
  dataWords.forEach(w=>{
    const ky=Math.round(w.yTop/5)*5;
    if(!rowMap[ky])rowMap[ky]=[];
    rowMap[ky].push(w);
  });

  // Função auxiliar: pega texto na faixa X com tolerância
  function getByX(row,xmin,xmax){
    const ws=row.filter(w=>w.x>=xmin&&w.x<=xmax);
    if(!ws.length)return null;
    const txt=ws.map(w=>w.text).join('');
    return(txt==='-'||txt==='—'||txt.trim()==='.')?null:txt.trim();
  }

  // Detectar X da coluna de crédito: menor X que contém valores >= 10000
  // Usamos os planos para delimitar — crédito está à esquerda do primeiro plano
  const xCreditoMax=planos.length?(Math.min(...planos.map(p=>p.xPrazo))-5):150;
  const xCreditoMin=0;

  // Montar faixas de coluna dinamicamente
  // Para cada plano: 1ªParcela entre xPrazo-60 e xPrazo+20, Demais entre xPrazo+20 e próximo xPrazo-10
  const COLS=planos.map((p,i)=>{
    const xNext=planos[i+1]?.xPrazo??xCreditoMax+600;
    // Se temos cabeçalhos detectados, usamos eles; senão estimamos
    let x1min,x1max,xdmin,xdmax;
    if(p.x1hdr!==null&&p.xdhdr!==null){
      x1min=p.x1hdr-30;x1max=p.x1hdr+50;
      xdmin=p.xdhdr-30;xdmax=p.xdhdr+60;
    } else {
      // Estima: 1ª parcela começa ~30pt antes do xPrazo, demais ~60pt depois
      const mid=(p.xPrazo+(planos[i+1]?.xPrazo??p.xPrazo+120))/2;
      x1min=p.xPrazo-10;x1max=mid-5;
      xdmin=mid;xdmax=xNext-10;
    }
    return{prazo:p.prazo,taxa:p.taxa,x1min,x1max,xdmin,xdmax};
  });

  // ── Construir gruposMap ──
  // creditoRowMap: por credito, acumula dados de todas as linhas (incluindo linhas orfas sem credito)
  const creditoRowMap={};  // key=cred.toFixed(2) → {credito,grupoNum,catNome,cols:[{p1,de}x4]}
  const creditoOrder=[];
  let ultimoCredKey=null;
  const YS=Object.keys(rowMap).map(Number).sort((a,b)=>a-b);

  YS.forEach(ky=>{
    const row=rowMap[ky];
    // Detectar crédito: maior valor na faixa X esquerda
    const credCands=row.filter(w=>w.x>=xCreditoMin&&w.x<=xCreditoMax);
    const credRaw=credCands.length?credCands.map(w=>w.text).join(''):null;
    const cred=credRaw?parseBRL(credRaw):null;

    let credKey=null;
    if(cred&&cred>=5000){
      credKey=cred.toFixed(2);
      ultimoCredKey=credKey;
      if(!creditoRowMap[credKey]){
        // Grupo e categoria por Y
        let grupoNum='G-1';
        let catNome=nomeTabela;
        for(let i=0;i<grupoNums.length;i++){if(ky>=grupoNums[i].yTop-5)grupoNum='G-'+grupoNums[i].text;else break;}
        for(let i=0;i<categorias.length;i++){if(ky>=categorias[i].y-5)catNome=categorias[i].nome;}
        creditoRowMap[credKey]={credito:cred,grupoNum,catNome,cols:COLS.map(()=>({p1:null,de:null}))};
        creditoOrder.push(credKey);
      }
    }

    // Ler dados das colunas desta linha
    let temDado=false;
    const colsData=COLS.map(col=>{
      const p1=parseBRL(getByX(row,col.x1min,col.x1max));
      const de=parseBRL(getByX(row,col.xdmin,col.xdmax));
      if(p1||de)temDado=true;
      return{p1,de};
    });

    // Se linha tem dados mas nao tem credito proprio, usa ultimo credito visto (linha orfa)
    if(!credKey&&temDado&&ultimoCredKey)credKey=ultimoCredKey;

    if(credKey&&temDado){
      const entry=creditoRowMap[credKey];
      if(entry){
        colsData.forEach((cd,ci)=>{
          if(cd.p1!=null&&entry.cols[ci].p1==null)entry.cols[ci].p1=cd.p1;
          if(cd.de!=null&&entry.cols[ci].de==null)entry.cols[ci].de=cd.de;
        });
      }
    }
  });

  // Converter creditoRowMap para gruposMap (1 grupo por coluna/prazo)
  const gruposMap={};
  COLS.forEach((col,ci)=>{
    const chave=`col_${col.prazo}_${col.taxa}_${ci}`;
    creditoOrder.forEach(ck=>{
      const entry=creditoRowMap[ck];
      const cd=entry.cols[ci];
      if(!cd||(!cd.p1&&!cd.de))return;
      if(!gruposMap[chave]){
        gruposMap[chave]={
          categoria:entry.catNome,numero:'col-'+ci,
          credito:entry.credito,prazo:col.prazo,taxa:col.taxa,
          entradaMin:0,vagas:null,tipoBem,nomeTabela,tabelaLinhas:[]
        };
      }
      const g=gruposMap[chave];
      if(entry.credito>g.credito)g.credito=entry.credito;
      g.tabelaLinhas.push({credito:entry.credito,primeiraParcela:cd.p1,demaisParcelas:cd.de});
    });
  });

  return Object.values(gruposMap);
}

function admParsePDFTextToGrupos(text){
  // Parser calibrado para tabelas de consórcio (formato Ademicon PDF com pdftotext -layout)
  // Estrutura: 4 colunas | cada coluna = 1aParcela (entrada) + Demais Parcelas
  // Posicoes de char reais calibradas do PDF VIP:
  //   credito @28-57  col0_p1 @44-71  col0_d @70-94
  //   col1_p1 @85-114  col1_d @111-137
  //   col2_p1 @128-157  col2_d @153-176
  //   col3_p1 @170-199  col3_d @196-224
  // IMPORTANTE: algumas linhas tem dados mas sem credito na mesma linha
  // (celula mesclada no PDF gera linhas sem credito mas com valores)
  // Solucao: acumular por creditoMap usando ultimoCred

  const grupos=[];
  const linhas=text.split(/\n/);
  let m;

  // 1. Nome da tabela
  let nomeTabela='';
  for(const l of linhas){const t=l.trim();if(t&&t.length<50&&!/\d{2}[xX]/.test(t)){nomeTabela=t;break;}}

  // 2. Tipo de bem
  const reTipoBem=/\b(im[oó]vel|autom[oó]vel|ve[ií]culo|carro|moto(?:cicleta)?|servi[cç]o|cami(?:nh[aã]o)?|m[oó]vel)\b/i;
  const mTipo=text.match(reTipoBem);
  const tipoBem=mTipo?mTipo[1].charAt(0).toUpperCase()+mTipo[1].slice(1).toLowerCase():null;

  // 3. Prazos e taxas do cabecalho (mantém duplicatas: 60 60 84 84)
  const cabecalho=linhas.slice(0,15).join('\n');
  const prazosArr=[],taxasArr=[];
  const rePrazo=/(\d{2,3})[xX]/g;
  const reTaxaPar=/(\d{1,2})[,.](\d{2})\s*%/g;
  while((m=rePrazo.exec(cabecalho))!==null)prazosArr.push(parseInt(m[1]));
  while((m=reTaxaPar.exec(cabecalho))!==null)taxasArr.push(parseFloat(m[1]+'.'+m[2]));
  const planos=prazosArr.map((p,i)=>({prazo:p,taxa:taxasArr[i]??null}));

  // 4. Slots de leitura calibrados
  const SLOTS=[
    {c0:28,c1:46},   // credito       (@31)
    {c0:44,c1:75},   // col0 1aParcela(@47)
    {c0:70,c1:90},   // col0 Demais   (@73)
    {c0:86,c1:118},  // col1 1aParcela(@89)
    {c0:110,c1:135}, // col1 Demais   (@114)
    {c0:128,c1:158}, // col2 1aParcela(@131)
    {c0:153,c1:178}, // col2 Demais   (@156)
    {c0:170,c1:202}, // col3 1aParcela(@173)
    {c0:197,c1:225}, // col3 Demais   (@200)
  ];

  function readSlot(linha,slot){
    const seg=linha.substring(slot.c0,Math.min(slot.c1,linha.length));
    const mv=seg.match(/R\$\s*([\d.]+,\d{2})/);
    if(mv)return parseBRL('R$'+mv[1]);
    return null;
  }

  // 5. Processar linha por linha, acumulando por credito
  const creditoMap={};
  const credOrder=[];
  let ultimoCred=null;

  for(const linha of linhas){
    const credV=readSlot(linha,SLOTS[0]);
    const cols=[];
    let temDado=false;
    for(let ci=0;ci<4;ci++){
      const p1=readSlot(linha,SLOTS[1+ci*2]);
      const de=readSlot(linha,SLOTS[2+ci*2]);
      cols.push({p1,de});
      if(p1!=null||de!=null)temDado=true;
    }

    let credKey=null;
    if(credV&&credV>=10000){
      credKey=credV.toFixed(2);
      ultimoCred=credKey;
      if(!creditoMap[credKey]){
        creditoMap[credKey]={credito:credV,cols:[{p1:null,de:null},{p1:null,de:null},{p1:null,de:null},{p1:null,de:null}]};
        credOrder.push(credKey);
      }
    } else if(temDado&&ultimoCred){
      credKey=ultimoCred;
    }

    if(credKey&&temDado){
      const entry=creditoMap[credKey];
      for(let ci=0;ci<4;ci++){
        if(cols[ci].p1!=null&&entry.cols[ci].p1==null)entry.cols[ci].p1=cols[ci].p1;
        if(cols[ci].de!=null&&entry.cols[ci].de==null)entry.cols[ci].de=cols[ci].de;
      }
    }
  }

  // 6. Converter para grupos (1 grupo por coluna/prazo)
  if(credOrder.length&&planos.length){
    planos.forEach((plano,pi)=>{
      const tabelaLinhas=[];
      credOrder.forEach(ck=>{
        const entry=creditoMap[ck];
        const col=entry.cols[pi];
        if(col&&(col.p1!=null||col.de!=null)){
          tabelaLinhas.push({credito:entry.credito,primeiraParcela:col.p1,demaisParcelas:col.de});
        }
      });
      if(!tabelaLinhas.length)return;
      const maxCred=Math.max(...tabelaLinhas.map(l=>l.credito));
      grupos.push({
        categoria:nomeTabela||null,numero:'col-'+pi,credito:maxCred,
        prazo:plano.prazo,taxa:plano.taxa,entradaMin:0,vagas:null,
        tipoBem,nomeTabela:nomeTabela||null,
        tabelaLinhas
      });
    });
  }

  // 7. Fallback generico
  if(!grupos.length){
    const reR=/R\$\s*([\d.]+,\d{2})/g;
    const todos=[];while((m=reR.exec(text))!==null)todos.push(parseBRL(m[1]));
    const creditos=[...new Set(todos.filter(v=>v>=10000))].sort((a,b)=>a-b);
    const taxaM=text.match(/(\d{1,2})[,.](\d{2})\s*%/);
    const prazoM=text.match(/(\d{2,3})\s*[xX]/);
    creditos.slice(0,30).forEach((c,i)=>{
      grupos.push({
        categoria:nomeTabela||null,numero:'G-'+(i+1),credito:c,
        prazo:prazoM?parseInt(prazoM[1]):60,
        taxa:taxaM?parseFloat(taxaM[1]+'.'+taxaM[2]):null,
        entradaMin:0,vagas:null,tipoBem,nomeTabela:nomeTabela||null,tabelaLinhas:[]
      });
    });
  }

  return grupos;
}


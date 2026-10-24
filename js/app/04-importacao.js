// ─── EXPORTAR CSV ─────────────────────────────────────────────────────────────
// Evita que o Excel trate um texto importado como fórmula (=, @, +X, -X)
function _csvCelula(v){
  let s=String(v===null||v===undefined?'':v);
  if(/^[=@\t\r]/.test(s)||/^[+\-][^\d\s]/.test(s)) s="'"+s;
  return `"${s.replace(/"/g,'""')}"`;
}
function exportarLeadsCSV(){
  const cols=['ID','Nome','Telefone','Tipo','Crédito','Etapa','Origem','Responsável','Atendimento','Data','Observações'];
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const porId=new Map(users.map(u=>[u.id,u]));
  const rows=leads.filter(l=>applyFunilFilter(l,f,vis)).map(l=>{
    const resp=porId.get(l.responsavelId);
    return [l.id,l.nome,l.tel||'',l.tipo,l.credito,l.etapa,l.origem||'',resp?resp.nome:'',l.atendimento||'',l.data,l.obs||''].map(_csvCelula).join(',');
  });
  const csv='\uFEFF'+[cols.join(','),...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`leads_evolux_${toDate().replace(/\//g,'-')}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// ─── IMPORTAR CSV ─────────────────────────────────────────────────────────────
// 1) a pessoa escolhe o arquivo → o CRM lê, entende as colunas e confere duplicados
//    na empresa inteira (DDD + 8 últimos dígitos do telefone, ou ID do Meta);
// 2) escolhe o tipo de bem e para quem vão os leads (para mim, uma pessoa, rodízio);
// 3) importa: salva no servidor em lotes e mostra o resultado.
let _imp=null;          // arquivo já lido
let _importando=false;  // trava contra importar duas vezes

// Nome das colunas já "limpo": minúsculas, sem acento, só letras/números e "_"
function _impChave(h){
  return String(h||'').replace(/^\uFEFF/,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
const _IMP_COL={
  nome:['nome','nome_completo','full_name','name','cliente','nome_do_cliente','lead','nome_do_lead'],
  tel:['numero_do_whatsapp','whatsapp','numero_de_whatsapp','telefone','celular','telefone_celular','phone_number','phone',
       'mobile_number','mobile','tel','fone','numero_de_telefone','numero_do_telefone','numero_de_celular','numero_do_contato','contato'],
  tipo:['tipo','tipo_de_bem','tipo_do_bem','tipo_de_consorcio','o_que_voce_pretende_comprar','qual_bem_voce_deseja','qual_tipo_de_bem'],
  credito:['credito','credito_r','valor','valor_do_credito','valor_de_credito','credito_desejado',
           'qual_valor_de_credito_voce_pretende_buscar','qual_valor_de_credito_voce_precisa',
           'qual_faixa_de_valor_esta_buscando','qual_faixa_de_valor_voce_esta_buscando'],
  origem:['origem','fonte','source','canal_de_origem'],
  etapa:['etapa','estagio','fase','etapa_do_funil','status'],
  atendimento:['atendimento','status_do_atendimento','status_de_atendimento'],
  resp:['responsavel','responsavel_pelo_lead','vendedor','representante','consultor','proprietario','dono'],
  data:['created_time','data','data_de_criacao','data_de_cadastro','data_do_cadastro','criado_em','created_at','date','data_de_entrada'],
  obs:['obs','observacoes','observacao','notas','anotacoes','comentarios'],
  id:['meta_id','lead_id','id'],
};
// Colunas que viram campos do lead (não se repetem nas observações)
const _IMP_SIMPLES=new Set([..._IMP_COL.nome,..._IMP_COL.origem,..._IMP_COL.etapa,..._IMP_COL.atendimento,..._IMP_COL.resp,
  ..._IMP_COL.data,..._IMP_COL.obs,..._IMP_COL.id,'first_name','last_name',
  'tipo','tipo_de_bem','tipo_do_bem','tipo_de_consorcio','credito','credito_r','valor','valor_do_credito','valor_de_credito','credito_desejado']);
// Colunas técnicas do Meta que não interessam ao vendedor
const _IMP_TECNICAS=new Set(['ad_id','adset_id','campaign_id','form_id','is_organic','lead_status','inbox_url','page_id',
  'page_name','partner_name','retailer_item_id','vehicle_id','home_listing_id','custom_disclaimer_responses','is_qualified','is_quality','converted_lead']);
const _IMP_RODAPE=[['campaign_name','Campanha'],['ad_name','Anúncio'],['form_name','Formulário']];
const _IMP_PLATAFORMA={fb:'Facebook',facebook:'Facebook',ig:'Instagram',instagram:'Instagram',msg:'Messenger',messenger:'Messenger',wa:'WhatsApp',whatsapp:'WhatsApp'};

// Pessoas que podem receber os leads de quem está importando
function _impPessoas(){
  const me=getMe();
  if(isGestor(me)) return users.slice();
  const vis=getVisiveisParaMim();
  return users.filter(u=>vis.has(u.id));
}

function abrirModalImportar(){
  if(!can('leads_import')){showToast('Você não tem permissão para importar leads.','ti-lock');return;}
  if(_importando){showToast('Já existe uma importação em andamento.','ti-loader');return;}
  document.getElementById('modal-importar')?.remove();
  _imp=null;
  const me=getMe();
  const pessoas=_impPessoas().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const variasPessoas=pessoas.length>1;
  const tipos=[['auto','🔍','Detectar pelo arquivo'],['Imóvel','🏠','Imóvel'],['Automóvel','🚗','Automóvel'],['Moto','🏍️','Moto'],['Serviço','🔧','Serviço']];
  const html=`<div class="overlay open" id="modal-importar">
  <div class="modal" style="width:580px">
    <div class="mtit"><i class="ti ti-upload"></i>Importar leads (CSV)</div>
    <div class="imp-sec">
      <div class="imp-sec-tit">1. Arquivo</div>
      <label class="imp-arquivo" id="imp-arquivo">
        <i class="ti ti-file-upload" style="font-size:20px;color:var(--g)"></i>
        <span id="imp-arquivo-nome">Escolher arquivo .csv (Meta Ads, planilha, outro CRM)</span>
        <input type="file" id="imp-input" accept=".csv,.tsv,.txt,text/csv" style="display:none" onchange="_impArquivoEscolhido(this)">
      </label>
      <div id="imp-resumo" class="imp-resumo"></div>
    </div>
    <div class="imp-sec">
      <div class="imp-sec-tit">2. Tipo de bem</div>
      <div class="imp-tipos">
        ${tipos.map(([v,ic,lb])=>`<label class="imp-opc"><input type="radio" name="imp-tipo" value="${esc(v)}"${v==='auto'?' checked':''} onchange="_impAtualizarResumo()"><span>${ic}</span>${esc(lb)}</label>`).join('')}
      </div>
    </div>
    <div class="imp-sec">
      <div class="imp-sec-tit">3. Para quem vão os leads</div>
      <div class="imp-resp">
        <label class="imp-opc"><input type="radio" name="imp-resp" value="eu" checked onchange="_impAtualizarResp()">Para mim${me?` (${esc(me.nome)})`:''}</label>
        ${variasPessoas?`
        <label class="imp-opc"><input type="radio" name="imp-resp" value="pessoa" onchange="_impAtualizarResp()">Para uma pessoa</label>
        <select id="imp-resp-pessoa" class="fi" style="display:none">
          ${pessoas.map(u=>`<option value="${u.id}"${me&&u.id===me.id?' selected':''}>${esc(u.nome)} (${esc(getHierLabel(u))})</option>`).join('')}
        </select>
        <label class="imp-opc"><input type="radio" name="imp-resp" value="rodizio" onchange="_impAtualizarResp()">Rodízio — distribui igualmente entre as pessoas marcadas</label>
        <div id="imp-resp-rodizio" class="imp-rodizio" style="display:none">
          ${pessoas.map(u=>`<label><input type="checkbox" class="imp-rod-cb" value="${u.id}" onchange="_impAtualizarResp()"> ${esc(u.nome)}</label>`).join('')}
        </div>`:''}
        <label class="imp-opc" id="imp-opc-coluna" style="display:none"><input type="radio" name="imp-resp" value="coluna" onchange="_impAtualizarResp()">Conforme a coluna "Responsável" do arquivo (nome não encontrado → para mim)</label>
        <div id="imp-resp-info" class="imp-info"></div>
      </div>
    </div>
    <div id="imp-progresso" style="display:none;margin-top:6px">
      <div class="imp-prog"><div id="imp-prog-barra"></div></div>
      <div id="imp-prog-txt" style="font-size:12px;color:var(--tm);margin-top:6px"></div>
    </div>
    <div class="ma">
      <button class="bcn" id="imp-btn-cancelar" onclick="fecharModalImportar()">Cancelar</button>
      <button class="bsv" id="imp-btn-importar" onclick="_impConfirmar()" disabled>Escolha o arquivo</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}
function fecharModalImportar(){
  if(_importando){showToast('Aguarde: a importação está em andamento.','ti-loader');return;}
  document.getElementById('modal-importar')?.remove();
  _imp=null;
}

function _impAtualizarResp(){
  const modo=document.querySelector('input[name="imp-resp"]:checked')?.value||'eu';
  const sel=document.getElementById('imp-resp-pessoa');
  const rod=document.getElementById('imp-resp-rodizio');
  if(sel) sel.style.display=modo==='pessoa'?'':'none';
  if(rod) rod.style.display=modo==='rodizio'?'':'none';
  const info=document.getElementById('imp-resp-info');
  if(!info) return;
  const n=_imp?_imp.linhas.filter(r=>!r.dup).length:0;
  if(modo==='rodizio'){
    const k=document.querySelectorAll('.imp-rod-cb:checked').length;
    info.textContent=k?(n?`Cada pessoa recebe cerca de ${Math.ceil(n/k)} lead${Math.ceil(n/k)!==1?'s':''}.`:`${k} pessoa${k!==1?'s':''} marcada${k!==1?'s':''}.`):'Marque quem participa do rodízio.';
  } else if(modo==='coluna'&&_imp){
    const pessoas=_impPessoas();
    const achados=_imp.linhas.filter(r=>!r.dup&&r.respNome&&_impAcharPessoa(r.respNome,pessoas)).length;
    info.textContent=`${achados} de ${n} lead${n!==1?'s':''} com responsável encontrado no CRM.`;
  } else info.textContent='';
}

// ── Leitura do arquivo ────────────────────────────────────────────────────────
function _impLerArquivo(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));
    r.onload=()=>{
      const buf=r.result;
      const b=new Uint8Array(buf);
      let enc='utf-8';
      if(b[0]===0xFF&&b[1]===0xFE) enc='utf-16le';            // Meta Ads
      else if(b[0]===0xFE&&b[1]===0xFF) enc='utf-16be';
      else if(b.length>4&&b[1]===0&&b[3]===0) enc='utf-16le';
      else if(b.length>4&&b[0]===0&&b[2]===0) enc='utf-16be';
      let txt=new TextDecoder(enc).decode(buf);
      // Excel em português salva CSV em Windows-1252: em UTF-8 os acentos viram "�"
      if(enc==='utf-8'&&txt.includes('\uFFFD')){ try{ txt=new TextDecoder('windows-1252').decode(buf); }catch(e){} }
      resolve(txt.replace(/^\uFEFF/,'').replace(/\u0000/g,''));
    };
    r.readAsArrayBuffer(file);
  });
}
// Separador = o que mais aparece na 1ª linha (tab, ponto e vírgula ou vírgula)
function _impSeparador(txt){
  const cont={'\t':0,';':0,',':0};
  let inQ=false;
  for(let i=0;i<txt.length;i++){
    const c=txt[i];
    if(c==='"') inQ=!inQ;
    else if(!inQ&&(c==='\n'||c==='\r')) break;
    else if(!inQ&&c in cont) cont[c]++;
  }
  return Object.keys(cont).sort((a,b)=>cont[b]-cont[a])[0];
}
// Lê o CSV respeitando aspas (inclusive campos com quebra de linha dentro)
function _impParseCSV(txt){
  const sep=_impSeparador(txt);
  const linhas=[];
  let campo='',linha=[],inQ=false,aspas=false;
  const fimCampo=()=>{ linha.push(aspas?campo:campo.trim()); campo=''; aspas=false; };
  const fimLinha=()=>{ fimCampo(); if(linha.some(v=>v.trim()!=='')) linhas.push(linha); linha=[]; };
  for(let i=0;i<txt.length;i++){
    const c=txt[i];
    if(inQ){
      if(c==='"'){ if(txt[i+1]==='"'){ campo+='"'; i++; } else inQ=false; }
      else campo+=c;
    } else if(c==='"'&&campo.trim()===''){ campo=''; inQ=true; aspas=true; }
    else if(c===sep) fimCampo();
    else if(c==='\n'||c==='\r'){ if(c==='\r'&&txt[i+1]==='\n') i++; fimLinha(); }
    else campo+=c;
  }
  fimLinha();
  return linhas;
}

// ── Interpretação de cada coluna ──────────────────────────────────────────────
// "R$ 300 mil a R$ 500 mil" → 300000 (menor valor da faixa); "1,5 milhão" → 1500000
function _impValor(v){
  const t=String(v||'').toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ');
  const nums=[...t.matchAll(/(\d[\d.,]*)\s*(milh[õoã]?[eo]?s?|mil\b|k\b)?/g)];
  if(!nums.length) return 0;
  const mult=m=>!m?1:(m.startsWith('milh')?1e6:1000);
  let n=unM(nums[0][1].replace(/[.,]$/,''));
  if(nums[0][2]) n*=mult(nums[0][2]);
  else if(n<1000){ const prox=nums.find(x=>x[2]); if(prox) n*=mult(prox[2]); }
  return isFinite(n)&&n>0?Math.round(n):0;
}
function _impTipoDe(v){
  const p=_impChave(v).split('_').filter(Boolean);
  const tem=re=>p.some(x=>re.test(x));
  if(tem(/^(moto|motos|motocicleta|motoneta|scooter)$/)) return 'Moto';
  if(tem(/^(carro|carros|automovel|automoveis|auto|veiculo|veiculos|caminhao|caminhoes|pickup|picape|utilitario|suv)$/)) return 'Automóvel';
  if(tem(/^(imovel|imoveis|casa|casas|apartamento|apto|terreno|lote|chacara|sitio|galpao|kitnet|cobertura|sobrado)$/)) return 'Imóvel';
  if(tem(/^(servico|servicos)$/)) return 'Serviço';
  return '';
}
function _impEtapaDe(v){
  const c=_impChave(v);
  if(!c) return ETAPAS[0];
  const exata=ETAPAS.find(e=>_impChave(e)===c||_impChave(etapaLabel(e))===c);
  if(exata) return exata;
  if(/fechad|convertid|ganho|vendid/.test(c)) return 'Fechado / Convertido';
  if(/perdid|descartad/.test(c)) return 'Perdido';
  if(/negocia|agendad/.test(c)) return 'Negociação';
  if(/proposta/.test(c)) return 'Proposta enviada';
  if(/aguardando/.test(c)) return 'Aguardando resposta';
  if(/contato/.test(c)) return 'Primeiro contato';
  return ETAPAS[0];
}
function _impOrigemDe(v){
  const c=_impChave(v);
  if(!c) return '';
  if(/(^|_)(meta|facebook|instagram|fb|ig)(_|$)|meta_ads|lead_ads/.test(c)) return 'Meta Ads';
  if(/indica/.test(c)) return 'Indicação';
  if(/organic/.test(c)) return 'Orgânico';
  return String(v).trim().slice(0,60);
}
// Data/hora do cadastro: ISO do Meta ("2026-10-19T12:42:23-03:00"), dd/mm/aaaa ou aaaa-mm-dd
function _impData(v){
  let s=String(v||'').trim();
  if(!s) return null;
  let d=null,hora=false;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
  if(m){
    hora=!!m[4];
    if(hora&&/(Z|[+\-]\d{2}:?\d{2})$/i.test(s)) d=new Date(s.replace(' ','T').replace(/([+\-]\d{2})(\d{2})$/,'$1:$2'));
    else d=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0));
  } else if((m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/))){
    let y=+m[3]; if(y<100) y+=2000;
    hora=!!m[4];
    d=new Date(y,+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0));
  }
  if(!d||isNaN(d)) return null;
  const ano=d.getFullYear(), agora=new Date();
  if(ano<2000||d>new Date(agora.getTime()+2*864e5)) return null;
  return {d,hora};
}
// "r$_200_mil_a_r$_300_mil" → "r$ 200 mil a r$ 300 mil" (respostas de múltipla escolha do Meta)
function _impHumanizar(v){
  const s=String(v||'').trim();
  if(!s) return '';
  if(!/\s/.test(s)&&s.includes('_')&&!s.includes('@')&&!/^https?:/i.test(s)) return s.replace(/_+/g,' ').trim();
  return s;
}
function _impRotulo(h){
  let t=String(h||'').replace(/_+/g,' ').replace(/\s+/g,' ').trim();
  t=t.replace(/[^\p{L}\p{N})]+$/u,'');
  return t?t.charAt(0).toUpperCase()+t.slice(1):'';
}
function _impAcharPessoa(nome,pessoas){
  const c=_impChave(nome);
  if(!c) return null;
  const porChave=pessoas.filter(u=>_impChave(u.nome)===c);
  if(porChave.length===1) return porChave[0];
  const inicio=pessoas.filter(u=>_impChave(u.nome).startsWith(c+'_')||c.startsWith(_impChave(u.nome)+'_'));
  return inicio.length===1?inicio[0]:null;
}

// Transforma uma linha do arquivo em lead (ou null se não tiver nome)
function _impMapearLinha(obj,ctx){
  // colunas já usadas como campo do lead (não se repetem nas observações).
  // Tipo e crédito vindos de perguntas do formulário continuam nas observações
  // (ex.: "Qual tipo de imóvel: casa", "Faixa de valor: r$ 300 mil a r$ 500 mil").
  const usados=new Set();
  const primeiro=(lista,valida,marcar=true)=>{
    for(const k of lista){ const v=obj[k]; if(v&&(!valida||valida(v))){ if(marcar) usados.add(k); return v; } }
    return '';
  };
  const porRegex=(re,valida,fora,marcar=true)=>{
    for(const k of ctx.chaves){ if(re.test(k)&&!(fora&&fora.test(k))&&obj[k]&&(!valida||valida(obj[k]))){ if(marcar) usados.add(k); return obj[k]; } }
    return '';
  };
  let nome=primeiro(_IMP_COL.nome);
  if(!nome&&(obj.first_name||obj.last_name)){ nome=[obj.first_name,obj.last_name].filter(Boolean).join(' '); usados.add('first_name'); usados.add('last_name'); }
  nome=String(nome||'').replace(/\s+/g,' ').trim().slice(0,120);
  if(!nome) return null;

  const telOk=v=>String(v).replace(/\D/g,'').length>=8;
  const telRaw=primeiro(_IMP_COL.tel,telOk)||porRegex(/(whats|telefone|celular|phone|fone)/,telOk,/secund/)
    ||porRegex(/(whats|telefone|celular|phone|fone)/,telOk);
  const tel=normalizaTelefone(telRaw);

  const tipoCol=primeiro(_IMP_COL.tipo,v=>!!_impTipoDe(v),false);
  const tipo=_impTipoDe(tipoCol)||ctx.tipoCabecalho||ctx.tipoFormulario(obj)||'';

  const valOk=v=>_impValor(v)>0;
  const credRaw=primeiro(_IMP_COL.credito,valOk,false)
    ||porRegex(/(valor.*credito|credito.*valor|faixa_de_valor|valor_do_bem|valor_do_imovel|valor_do_veiculo|valor_do_carro)/,valOk,null,false);
  const credito=_impValor(credRaw);

  const origemCol=primeiro(_IMP_COL.origem);
  const origem=_impOrigemDe(origemCol)||(ctx.ehMeta?'Meta Ads':'');

  const etapa=_impEtapaDe(primeiro(_IMP_COL.etapa));
  const atd=_impChave(primeiro(_IMP_COL.atendimento));
  const atendimento=['aguardando','em_andamento','finalizado'].includes(atd)?atd:'';
  const respNome=primeiro(_IMP_COL.resp);
  const dt=_impData(primeiro(_IMP_COL.data));
  const obsCol=primeiro(_IMP_COL.obs);

  let metaId=primeiro(['meta_id','lead_id']);
  if(!metaId&&obj.id&&(/^l:/i.test(obj.id)||String(obj.id).length>=8)){ metaId=obj.id; usados.add('id'); }
  usados.add('id');

  // Observações: o que estava na coluna "obs" + todas as respostas do formulário
  const linhasObs=[];
  if(obsCol) linhasObs.push(obsCol);
  ctx.chaves.forEach(k=>{
    if(!obj[k]||usados.has(k)||_IMP_SIMPLES.has(k)||_IMP_TECNICAS.has(k)||k==='platform'||_IMP_RODAPE.some(([c])=>c===k)) return;
    const rot=_impRotulo(ctx.rotulos[k]);
    linhasObs.push(rot?`${rot}: ${_impHumanizar(obj[k])}`:_impHumanizar(obj[k]));
  });
  const rodape=[];
  if(dt&&dt.hora) rodape.push(`Captado em ${toDate(dt.d)} às ${String(dt.d.getHours()).padStart(2,'0')}:${String(dt.d.getMinutes()).padStart(2,'0')}`);
  _IMP_RODAPE.forEach(([c,r])=>{ if(obj[c]) rodape.push(`${r}: ${obj[c]}`); });
  const plat=_IMP_PLATAFORMA[_impChave(obj.platform)];
  if(plat) rodape.push(plat);
  if(rodape.length) linhasObs.push(rodape.join(' · '));

  return {
    nome, tel, chave:chaveTelefone(tel), tipo, credito, etapa, origem, atendimento,
    respNome:String(respNome||'').trim(),
    data:dt?toDate(dt.d):toDate(),
    obs:linhasObs.join('\n').slice(0,8000),
    metaId:metaId?String(metaId).trim().slice(0,120):'',
    dup:null
  };
}

// Marca duplicados: dentro do arquivo e no CRM (empresa inteira, pelo servidor)
async function _impMarcarDuplicados(linhas){
  const vMeta=new Set(), vTel=new Set();
  linhas.forEach(r=>{
    if((r.metaId&&vMeta.has(r.metaId))||(r.chave&&vTel.has(r.chave))){ r.dup='arquivo'; return; }
    if(r.metaId) vMeta.add(r.metaId);
    if(r.chave) vTel.add(r.chave);
  });
  const metaIds=[...vMeta], chaves=[...vTel];
  const exMeta=new Set(), exTel=new Set();
  let viaServidor=true;
  for(let i=0;i<Math.max(metaIds.length,chaves.length);i+=500){
    const {data,error}=await window._rpc('crm_leads_existentes',{p_meta_ids:metaIds.slice(i,i+500),p_chaves:chaves.slice(i,i+500)});
    if(error){ viaServidor=false; console.warn('[importação] conferência no servidor indisponível:',error.message); break; }
    (data||[]).forEach(x=>{ if(x.meta_id) exMeta.add(String(x.meta_id)); if(x.chave_tel) exTel.add(x.chave_tel); });
  }
  // o que já está carregado na tela também conta
  leads.forEach(l=>{ if(l.metaId) exMeta.add(String(l.metaId)); const c=chaveTelefone(l.tel); if(c) exTel.add(c); });
  linhas.forEach(r=>{ if(!r.dup&&((r.metaId&&exMeta.has(r.metaId))||(r.chave&&exTel.has(r.chave)))) r.dup='crm'; });
  return viaServidor;
}

async function _impArquivoEscolhido(input){
  const file=input.files&&input.files[0];
  input.value=''; // deixa escolher o mesmo arquivo de novo
  if(!file||_importando) return;
  const resumo=document.getElementById('imp-resumo');
  const btn=document.getElementById('imp-btn-importar');
  const nomeEl=document.getElementById('imp-arquivo-nome');
  if(nomeEl) nomeEl.textContent=file.name;
  if(btn){ btn.disabled=true; btn.textContent='Lendo o arquivo...'; }
  if(resumo) resumo.innerHTML='<span style="color:var(--tm)"><i class="ti ti-loader"></i> Lendo o arquivo...</span>';
  try{
    const txt=await _impLerArquivo(file);
    const tabela=_impParseCSV(txt);
    if(tabela.length<2) throw new Error('O arquivo está vazio ou não tem linhas de dados.');
    const cab=tabela[0];
    const chaves=cab.map(_impChave);
    const rotulos={};
    chaves.forEach((k,j)=>{ if(k&&!(k in rotulos)) rotulos[k]=cab[j]; });
    const chavesUnicas=[...new Set(chaves.filter(Boolean))];
    const ehMeta=chavesUnicas.includes('created_time')&&chavesUnicas.some(k=>['form_id','ad_id','platform','campaign_name','form_name'].includes(k));
    // Tipo pelo assunto das perguntas (ex.: "...adquirir o imóvel?") ou pelo nome do formulário
    const palavrasCab=new Set(chavesUnicas.filter(k=>!_IMP_TECNICAS.has(k)).flatMap(k=>k.split('_')));
    const tipoCabecalho=['imovel','imoveis'].some(p=>palavrasCab.has(p))?'Imóvel'
      :['veiculo','carro','automovel'].some(p=>palavrasCab.has(p))?'Automóvel'
      :['moto','motocicleta'].some(p=>palavrasCab.has(p))?'Moto':'';
    const ctx={chaves:chavesUnicas,rotulos,ehMeta,tipoCabecalho,
      tipoFormulario:o=>_impTipoDe(`${o.form_name||''} ${o.campaign_name||''} ${o.formulario||''}`)};
    const linhas=[];
    let semNome=0;
    for(let i=1;i<tabela.length;i++){
      const obj={};
      chaves.forEach((k,j)=>{ const v=(tabela[i][j]||'').trim(); if(k&&v&&!obj[k]) obj[k]=v; });
      const r=_impMapearLinha(obj,ctx);
      if(r) linhas.push(r); else semNome++;
    }
    if(!linhas.length) throw new Error('Nenhuma linha com nome. O arquivo precisa ter uma coluna "nome" (ou "nome_completo").');
    if(resumo) resumo.innerHTML='<span style="color:var(--tm)"><i class="ti ti-loader"></i> Conferindo quem já está no CRM...</span>';
    const viaServidor=await _impMarcarDuplicados(linhas);
    _imp={arquivo:file.name,linhas,semNome,viaServidor,temColunaResp:linhas.some(r=>r.respNome)};
    const opcCol=document.getElementById('imp-opc-coluna');
    if(opcCol) opcCol.style.display=_imp.temColunaResp?'':'none';
    _impAtualizarResumo();
    _impAtualizarResp();
  }catch(e){
    console.warn('[importação]',e);
    _imp=null;
    if(resumo) resumo.innerHTML=`<span style="color:#dc2626"><i class="ti ti-alert-triangle"></i> ${esc(e.message||'Não foi possível ler o arquivo.')}</span>`;
    if(btn){ btn.disabled=true; btn.textContent='Escolha o arquivo'; }
  }
}

function _impTipoFinal(r,tipoSel){ return tipoSel&&tipoSel!=='auto'?tipoSel:(r.tipo||'Automóvel'); }

function _impAtualizarResumo(){
  const box=document.getElementById('imp-resumo');
  const btn=document.getElementById('imp-btn-importar');
  if(!box||!_imp) return;
  const novos=_imp.linhas.filter(r=>!r.dup);
  const dupCrm=_imp.linhas.filter(r=>r.dup==='crm');
  const dupArq=_imp.linhas.filter(r=>r.dup==='arquivo');
  const tipoSel=document.querySelector('input[name="imp-tipo"]:checked')?.value||'auto';
  const porTipo={};
  novos.forEach(r=>{ const t=_impTipoFinal(r,tipoSel); porTipo[t]=(porTipo[t]||0)+1; });
  const semTel=novos.filter(r=>!r.chave).length;
  const pl=(n,s,p)=>n===1?s:p;
  box.innerHTML=`
    <div class="imp-res-nums">
      <span class="imp-res-ok"><b>${novos.length}</b> ${pl(novos.length,'lead novo','leads novos')} para importar</span>
      ${dupCrm.length?`<span><b>${dupCrm.length}</b> ${pl(dupCrm.length,'já está','já estão')} no CRM</span>`:''}
      ${dupArq.length?`<span><b>${dupArq.length}</b> ${pl(dupArq.length,'repetido','repetidos')} no próprio arquivo</span>`:''}
      ${_imp.semNome?`<span><b>${_imp.semNome}</b> sem nome (${pl(_imp.semNome,'ignorado','ignorados')})</span>`:''}
    </div>
    ${novos.length?`<div class="imp-info">${Object.entries(porTipo).map(([t,n])=>`${esc(t)}: ${n}`).join(' · ')}${semTel?` · ${semTel} sem telefone`:''}</div>`:''}
    ${dupCrm.length?`<details class="imp-det"><summary>Ver quem já está no CRM</summary><div>${dupCrm.slice(0,60).map(r=>esc(r.nome)).join(', ')}${dupCrm.length>60?` e mais ${dupCrm.length-60}`:''}</div></details>`:''}
    ${_imp.viaServidor?'':`<div class="imp-info" style="color:#b45309">Duplicados conferidos só com os leads que você vê na tela.</div>`}`;
  if(btn){
    btn.disabled=!novos.length;
    btn.textContent=novos.length?`Importar ${novos.length} ${pl(novos.length,'lead','leads')}`:'Nada novo para importar';
  }
}

async function _impConfirmar(){
  if(_importando||!_imp) return;
  if(!can('leads_import')){showToast('Você não tem permissão para importar leads.','ti-lock');return;}
  const novos=_imp.linhas.filter(r=>!r.dup);
  if(!novos.length){showToast('Nenhum lead novo para importar.','ti-info-circle');return;}
  const me=getMe();
  if(!me){showToast('Sessão não identificada. Recarregue a página.','ti-alert-triangle','#dc2626');return;}
  const pessoas=_impPessoas();
  const modo=document.querySelector('input[name="imp-resp"]:checked')?.value||'eu';
  let fila=[me];
  if(modo==='pessoa'){
    const p=pessoas.find(u=>u.id===parseInt(document.getElementById('imp-resp-pessoa')?.value));
    if(!p){showToast('Escolha para quem vão os leads.','ti-alert-triangle','#d97706');return;}
    fila=[p];
  } else if(modo==='rodizio'){
    fila=[...document.querySelectorAll('.imp-rod-cb:checked')].map(cb=>pessoas.find(u=>u.id===parseInt(cb.value))).filter(Boolean);
    if(!fila.length){showToast('Marque ao menos uma pessoa para o rodízio.','ti-alert-triangle','#d97706');return;}
  }
  const tipoSel=document.querySelector('input[name="imp-tipo"]:checked')?.value||'auto';
  const lista=novos.map((r,i)=>{
    let resp=fila[i%fila.length];
    if(modo==='coluna') resp=(r.respNome&&_impAcharPessoa(r.respNome,pessoas))||me;
    return {id:nextLeadId++,nome:r.nome,tel:r.tel,tipo:_impTipoFinal(r,tipoSel),credito:r.credito,etapa:r.etapa,
      origem:r.origem,responsavelId:resp.id,atendimento:r.atendimento,data:r.data,entrada:hojeISO(),obs:r.obs,metaId:r.metaId||undefined};
  });

  _importando=true;
  const arquivo=_imp.arquivo, nDupCrm=_imp.linhas.filter(r=>r.dup==='crm').length, nDupArq=_imp.linhas.filter(r=>r.dup==='arquivo').length;
  const modal=document.getElementById('modal-importar');
  modal?.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);
  const prog=document.getElementById('imp-progresso'); if(prog) prog.style.display='';
  const barra=document.getElementById('imp-prog-barra'), ptxt=document.getElementById('imp-prog-txt');
  const progresso=(feitos,total)=>{ if(barra) barra.style.width=Math.round(feitos/total*100)+'%'; if(ptxt) ptxt.textContent=`Salvando ${feitos} de ${total}...`; };
  progresso(0,lista.length);
  let res;
  try{
    res=await window._inserirLeadsEmLote(lista,progresso);
  }catch(e){
    res={salvos:0,pendentes:0,falhas:lista.map(l=>({lead:l,erro:e.message||String(e)}))};
  }finally{
    _importando=false;
  }
  // mostra na tela (mais novos primeiro) os salvos e os que aguardam a conexão voltar
  const falhou=new Set(res.falhas.map(f=>f.lead));
  const paraTela=lista.filter(l=>!falhou.has(l)&&!(l.sb_id&&leads.some(x=>x.sb_id===l.sb_id)));
  for(let i=paraTela.length-1;i>=0;i--) leads.unshift(paraTela[i]);
  document.getElementById('modal-importar')?.remove();
  _imp=null;

  const ok=res.salvos+res.pendentes;
  if(ok&&window._saveAtividade) window._saveAtividade('ti-upload',`${ok} lead${ok!==1?'s':''} importado${ok!==1?'s':''} (${arquivo})`);
  renderKanban();renderDashboard();renderTable();renderNotifPanel();
  if(ok) showTab('funil');
  const partes=[];
  if(res.salvos) partes.push(`${res.salvos} importado${res.salvos!==1?'s':''}`);
  if(res.pendentes) partes.push(`${res.pendentes} aguardando conexão`);
  if(nDupCrm) partes.push(`${nDupCrm} já estava${nDupCrm!==1?'m':''} no CRM`);
  if(nDupArq) partes.push(`${nDupArq} repetido${nDupArq!==1?'s':''} no arquivo`);
  if(res.falhas.length){
    partes.push(`${res.falhas.length} não salvo${res.falhas.length!==1?'s':''} (${res.falhas[0].erro})`);
    console.warn('[importação] leads recusados:',res.falhas);
  }
  setTimeout(()=>showToast(partes.join(' · ')||'Nada foi importado.',res.falhas.length?'ti-alert-triangle':'ti-check',res.falhas.length?'#d97706':'#1db954'),200);
}

// ─── ARRASTAR CARDS NO FUNIL ──────────────────────────────────────────────────
function onDragStart(e,id){dragId=id;e.dataTransfer.effectAllowed='move';setTimeout(()=>document.querySelector(`[data-id="${id}"]`)?.classList.add('dragging'),0);}
function onDragOver(e,c){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';c.classList.add('drag-over');}
function onDragLeave(e,c){if(c.contains(e.relatedTarget))return;c.classList.remove('drag-over');}
// O banco cuida de venda, ranking e lance automático quando o lead fecha/reabre
async function onDrop(e,i){
  e.preventDefault();
  document.querySelectorAll('.col').forEach(c=>c.classList.remove('drag-over'));
  const etapa=typeof i==='number'?ETAPAS[i]:i;
  const l=leads.find(x=>x.id===dragId);
  dragId=null;
  if(!l||!etapa||l.etapa===etapa){renderKanban();return;}
  if(!podeMoverLead(l)){showToast('Você não tem permissão para mover este lead.','ti-lock');renderKanban();return;}
  const old=l.etapa;
  l.etapa=etapa;
  renderKanban();
  const ok=await window._syncLead(l);
  if(!ok&&!window._leadPendente(l)){ l.etapa=old; renderKanban(); return; }
  if(window._saveAtividade) window._saveAtividade('ti-arrows-right-left',`${l.nome}: ${etapaLabel(old)} → ${etapaLabel(etapa)}`);
  if(etapa==='Fechado / Convertido'){
    const resp=users.find(x=>x.id===l.responsavelId);
    if(window._saveAtividade) window._saveAtividade('ti-circle-check',`${l.nome} fechado — ${fmtR(l.credito)}`);
    setTimeout(()=>showCelebra(resp?resp.nome:'Vendedor',l.credito),100);
  }
  if(etapa==='Perdido'&&window._saveAtividade) window._saveAtividade('ti-x',`${l.nome} marcado como perdido`);
  if(etapa==='Fechado / Convertido'||old==='Fechado / Convertido') _atualizarAposVenda();
  if(etapa==='Negociação') setTimeout(()=>openProtocolo(l.id,'','','',''),200);
  renderDashboard();renderNotifPanel();
}

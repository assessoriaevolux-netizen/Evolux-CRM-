// ─── EXPORTAR / IMPORTAR CSV ──────────────────────────────────────────────────
function exportarLeadsCSV(){
  const cols=['ID','Nome','Telefone','Tipo','Crédito','Etapa','Origem','Responsável','Atendimento','Data','Observações'];
  const f=getFunilFiltros();
  const vis=getVisiveisParaMim();
  const leadsVisiveis=leads.filter(l=>applyFunilFilter(l,f,vis));
  const rows=leadsVisiveis.map(l=>{
    const resp=users.find(u=>u.id===l.responsavelId);
    return [l.id,l.nome,l.tel||'',l.tipo,l.credito,l.etapa,l.origem||'',resp?resp.nome:'',l.atendimento||'',l.data,l.obs||''].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
  });
  const csv='﻿'+[cols.join(','),...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`leads_evolux_${toDate().replace(/\//g,'-')}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function abrirModalImportar(){
  const html=`<div id="modal-importar-tipo" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:var(--w);border-radius:16px;padding:28px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <div style="font-size:17px;font-weight:800;margin-bottom:4px"><i class="ti ti-upload" style="color:var(--g)"></i> Importar leads CSV</div>
      <div style="font-size:13px;color:var(--tm);margin-bottom:20px">Selecione o tipo de bem deste arquivo antes de importar</div>
      <div class="field" style="margin-bottom:20px">
        <label>Tipo de bem</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
          <label style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:2px solid var(--c2);border-radius:10px;cursor:pointer;transition:.15s" onclick="selecionarTipoImport(this,'Imóvel')">
            <input type="radio" name="tipo-import" value="Imóvel" style="accent-color:var(--g)">
            <span style="font-size:18px">🏠</span><span style="font-weight:600;font-size:13px">Imóvel</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:2px solid var(--c2);border-radius:10px;cursor:pointer;transition:.15s" onclick="selecionarTipoImport(this,'Automóvel')">
            <input type="radio" name="tipo-import" value="Automóvel" style="accent-color:var(--g)">
            <span style="font-size:18px">🚗</span><span style="font-weight:600;font-size:13px">Automóvel</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:2px solid var(--c2);border-radius:10px;cursor:pointer;transition:.15s" onclick="selecionarTipoImport(this,'Moto')">
            <input type="radio" name="tipo-import" value="Moto" style="accent-color:var(--g)">
            <span style="font-size:18px">🏍️</span><span style="font-weight:600;font-size:13px">Moto</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:2px solid var(--c2);border-radius:10px;cursor:pointer;transition:.15s" onclick="selecionarTipoImport(this,'Serviço')">
            <input type="radio" name="tipo-import" value="Serviço" style="accent-color:var(--g)">
            <span style="font-size:18px">🔧</span><span style="font-weight:600;font-size:13px">Serviço</span>
          </label>
          <label style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:2px solid var(--c2);border-radius:10px;cursor:pointer;grid-column:1/-1;transition:.15s" onclick="selecionarTipoImport(this,'auto')">
            <input type="radio" name="tipo-import" value="auto" checked style="accent-color:var(--g)">
            <span style="font-size:18px">🔍</span><span style="font-weight:600;font-size:13px">Detectar automaticamente pelo CSV</span>
          </label>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="document.getElementById('modal-importar-tipo')?.remove()" style="flex:1;padding:10px;border:1px solid var(--c2);border-radius:8px;background:var(--c0);color:var(--tx);font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
        <label style="flex:2;padding:10px;border:none;border-radius:8px;background:var(--g);color:#fff;font-size:13px;font-weight:700;cursor:pointer;text-align:center">
          <i class="ti ti-file-upload"></i> Escolher arquivo
          <input type="file" accept=".csv" style="display:none" onchange="document.getElementById('modal-importar-tipo')?.remove();importarLeadsCSV(this)">
        </label>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend',html);
}
function selecionarTipoImport(label,valor){
  document.querySelectorAll('[onclick^="selecionarTipoImport"]').forEach(l=>{
    l.style.borderColor='var(--c2)';l.style.background='';
  });
  label.style.borderColor='var(--g)';label.style.background='rgba(29,185,84,.07)';
  window._importTipoForcado=valor==='auto'?null:valor;
}
// Expõe globalmente para o onchange do input dentro do modal poder chamar
window._importTipoForcado=null;

function importarLeadsCSV(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async function(e){
    // Suporta UTF-16 LE (BOM + chars espaçados com \x00) exportado pelo Meta Ads
    // e UTF-8 (BOM \uFEFF) exportado por outros sistemas
    let raw=e.target.result;
    raw=raw.replace(/^\uFEFF/,'').replace(/^\uFFFE/,'');
    // Detecta UTF-16: char real seguido de \x00 (nulo) em toda a string
    if(raw.length>10 && raw.charCodeAt(1)===0){
      raw=raw.replace(/\x00/g,''); // remove nulos intercalados do UTF-16
    }
    raw=raw.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const allLines=raw.split('\n');
    const lines=allLines.filter(l=>l.trim());
    if(lines.length<2){showToast('CSV vazio ou inválido.','ti-alert-triangle','#d97706');return;}

    // Detecta separador: TAB (Meta Ads UTF-16), ponto-e-vírgula ou vírgula
    const sep=lines[0].includes('\t')?'\t':lines[0].includes(';')?';':',';

    // Parser robusto que respeita campos com aspas
    function parseCSVLine(line,sep){
      const result=[];let cur='';let inQ=false;
      for(let i=0;i<line.length;i++){
        const c=line[i];
        if(c==='"'){
          if(inQ&&line[i+1]==='"'){cur+='"';i++;}
          else{inQ=!inQ;}
        } else if(c===sep&&!inQ){
          result.push(cur.trim());cur='';
        } else {cur+=c;}
      }
      result.push(cur.trim());
      return result;
    }

    const headers=parseCSVLine(lines[0],sep).map(h=>h.replace(/"/g,'').replace(/^\uFEFF/,'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,''));// remove acentos do header

    // Monta Sets a partir dos leads JÁ CARREGADOS em memória (instantâneo, sem query extra)
    // Os leads são carregados todos na abertura da sessão, então memória = banco
    const memMetaIds=new Set(leads.filter(l=>l.metaId).map(l=>String(l.metaId)));
    const memTels=new Set(leads.map(l=>{const t=(l.tel||'').replace(/\D/g,'');return t.length>=8?t.slice(-8):null;}).filter(Boolean));

    let imported=0,skipped=0,duplicados=0;
    const duplicadosNomes=[];
    for(let i=1;i<lines.length;i++){
      if(!lines[i].trim())continue;
      const vals=parseCSVLine(lines[i],sep);
      const obj={};
      headers.forEach((h,idx)=>obj[h]=(vals[idx]||'').replace(/^"|"$/g,'').replace(/""/g,'"').trim());

      // Aceita "nome", "nome_completo" (Meta Ads), "name", "cliente", "lead"
      const nome=obj['nome']||obj['nome_completo']||obj['name']||obj['cliente']||obj['lead']||'';
      if(!nome){skipped++;continue;}

      // Responsável — aceita "proprietario" (coluna do HubSpot/RD Station) além dos campos padrão
      const respNome=(obj['responsavel']||obj['vendedor']||obj['representante']||obj['proprietario']||'').toLowerCase();
      const resp=users.find(u=>u.nome.toLowerCase()===respNome)||users[0];

      // Etapa
      const etapaCSV=obj['etapa']||obj['estagio']||obj['status']||''; // "estagio" = coluna "Estágio" após normalização
      const etapaValida=ETAPAS.find(e=>e.toLowerCase()===etapaCSV.toLowerCase())||ETAPAS[0];

      // Crédito — cobre ambos os formulários Meta Ads:
      // CSV1 (META FORMS JEFFESON): "qual_faixa_de_valor_esta_buscando?" → ex: "de_r$_300_mil_a_r$_500_mil"
      // CSV2 (CONSULTOR 2.0):       "qual_valor_de_credito_voce_pretende_buscar?" → ex: "r$_200_mil_a_r$_300_mil"
      // Converte "R$ 300 mil a R$ 500 mil" → 300000 (usa o menor valor da faixa)
      const creditoRaw=obj['credito']||obj['crédito']||obj['valor']||obj['credito r$']||
        obj['qual_faixa_de_valor_esta_buscando?']||obj['qual_faixa_de_valor_você_esta_buscando?']||
        obj['qual_valor_de_credito_voce_pretende_buscar?']||obj['qual_valor_de_crédito_você_pretende_buscar?']||
        obj['qual_valor_de_credito_voce_precisa?']||obj['qual_valor_de_crédito_você_precisa?']||'0';
      function parseCreditoBR(s){
        if(!s)return 0;
        // Normaliza underscores vindos do Meta Ads: "r$_200_mil_a_r$_300_mil" → "r$ 200 mil a r$ 300 mil"
        let norm=s.replace(/_/g,' ').replace(/\s+/g,' ').trim();
        // Faixa com "a": "R$ 200 mil a R$ 300 mil" → pega o PRIMEIRO valor (menor)
        // Também cobre: "de R$ 300 mil a R$ 500 mil", "r$ 200 mil a r$ 300 mil"
        const faixaMatch=norm.match(/([\d.,]+)\s*mil\s+a\s+([\d.,]+)\s*mil/i);
        if(faixaMatch){
          const n=parseFloat(faixaMatch[1].replace('.','').replace(',','.'));
          return isNaN(n)?0:n*1000;
        }
        // "acima de R$ 800 mil" → 800000
        const acimaMatch=norm.match(/acima[^0-9]*([\d.,]+)\s*mil/i);
        if(acimaMatch){
          const n=parseFloat(acimaMatch[1].replace('.','').replace(',','.'));
          return isNaN(n)?0:n*1000;
        }
        // "até R$ 200 mil" / "mais de R$ 500 mil" / "R$ 50 mil"
        const milMatch=norm.match(/([\d.,]+)\s*mil/i);
        if(milMatch){
          const n=parseFloat(milMatch[1].replace('.','').replace(',','.'));
          return isNaN(n)?0:n*1000;
        }
        // "R$ 1.200" / "1200" / "1.200,00"
        const nums=norm.replace(/[^\d.,]/g,'');
        if(!nums)return 0;
        if(nums.includes(',')&&nums.includes('.')){
          return parseFloat(nums.replace('.','').replace(',','.'))||0;
        }
        if(nums.includes(','))return parseFloat(nums.replace(',','.'))||0;
        return parseFloat(nums)||0;
      }
      const credito=parseCreditoBR(creditoRaw);

      // Telefone — aceita variações de coluna do Meta Ads e outros formatos
      // "telefone" (maioria dos forms), "número_de_telefone" (FORMS INVESTIMENTOS | G),
      // "phone_number" (forms internacionais), "tel", "fone", "celular", "whatsapp"
      // Também lida com notação científica do Excel (ex: 5.51197E+12 → "55 11 970958949")
      function normalizaTel(raw){
        if(!raw)return '';
        let s=String(raw).trim();
        // Remove prefixo "p:" do CSV1 do Meta Ads: "p:+5511977122835" → "+5511977122835"
        if(s.startsWith('p:'))s=s.slice(2);
        // Notação científica do Excel: 5.51197E+12
        if(/^\d[\d.]*[eE][+\-]\d+$/.test(s)){
          s=Number(s).toFixed(0); // converte para string de dígitos
        }
        s=s.replace(/\s/g,''); // remove espaços internos ex: "(19) 98459-3558" → "(19)98459-3558"
        return s;
      }
      // Cadeia de fallback cobre ambos os CSVs:
      // CSV1: coluna "telefone" (com prefixo "p:" como p:+5511977122835)
      // CSV2: coluna "numero do whatsapp" (ex: +5519989367759)
      // Normalização dos headers remove acentos mas mantém espaços — cobre ambos espaço e underscore
      const telRaw=obj['numero do whatsapp']||obj['numero_do_whatsapp']
        ||obj['telefone']||obj['tel']||obj['fone']||obj['celular']||obj['whatsapp']
        ||obj['numero de telefone']||obj['numero_de_telefone']
        ||obj['numero de telefone secundario']||obj['numero_de_telefone_secundario']
        ||obj['phone number']||obj['phone_number']||obj['phone']
        ||obj['numero']||obj['numero do contato']||obj['numero_do_contato']
        ||obj['contato']||obj['mobile']||obj['mobile number']||obj['mobile_number']
        // fallback genérico: procura qualquer chave que contenha "tel" ou "phone" ou "whatsapp" ou "fone" ou "celular"
        ||(()=>{const k=Object.keys(obj).find(k=>/(tel|phone|whatsapp|fone|celular|numero|contato)/i.test(k)&&obj[k]);return k?obj[k]:'';})()
        ||'';
      const tel=normalizaTel(telRaw);

      // Tipo — cobre ambos os CSVs:
      // CSV2 tem "qual_tipo_de_imovel_voce_pretende_adquirir?" (casa/apartamento/terreno+construção)
      // CSV1/outros têm "o_que_voce_pretende_comprar?" (carro/moto/imóvel)
      const _tipoImovelCSV2=obj['qual_tipo_de_imovel_voce_pretende_adquirir?']||obj['qual_tipo_de_imóvel_você_pretende_adquirir?']||'';
      const tipoRaw=(obj['tipo']||obj['o_que_voce_pretende_comprar?']||obj['o_que_você_pretende_comprar?']||_tipoImovelCSV2).trim();
      // Detecta formulário de imóvel: pelo nome da campanha/formulário OU pela presença da coluna de tipo de imóvel
      const _formularioNome=(obj['formulario']||obj['formulário']||obj['fonte']||obj['form_name']||obj['campaign_name']||'').toLowerCase();
      const _ehImovel=!!_tipoImovelCSV2||_formularioNome.includes('imovel')||_formularioNome.includes('imóvel')||_formularioNome.includes('imoveis');
      function normalizaTipo(t){
        const tl=t.toLowerCase();
        if(tl.includes('carro')||tl.includes('automovel')||tl.includes('automóvel')||tl.includes('veiculo')||tl.includes('veículo'))return 'Automóvel';
        if(tl.includes('moto'))return 'Moto';
        if(tl.includes('caminhao')||tl.includes('caminhão'))return 'Caminhão';
        if(tl.includes('imovel')||tl.includes('imóvel')||tl.includes('casa')||tl.includes('apto')||tl.includes('apartamento'))return 'Imóvel';
        if(tl.includes('servico')||tl.includes('serviço'))return 'Serviço';
        return t||''; // retorna vazio se não reconhecer — deixa decidir abaixo
      }
      // Se não há tipo definido: se formulário indica imóvel → 'Imóvel', senão → 'Automóvel' (padrão Meta Ads)
      const _tipoNorm=normalizaTipo(tipoRaw);
      // Se o usuário forçou um tipo no modal de importação, usa ele (exceto se o CSV já define explicitamente)
      const tipo=window._importTipoForcado||_tipoNorm||(_ehImovel?'Imóvel':'Automóvel');

      // Origem — aceita "Fonte" e "Formulário" (colunas do LEADS_IMOVEIS.csv) além do Meta Ads
      const origem=obj['origem']||obj['formulario']||obj['fonte']||obj['platform']||obj['campaign_name']||obj['source']||'';

      // Observações — agrega todos os campos extras disponíveis no CSV
      const cidade=obj['cidade']||obj['city']||'';
      const estado=obj['estado']||obj['state']||'';
      // Parcela — CSV1: "qual_a_sua_preferencia_de_parcela?" | CSV2: "qual_parcela_cabe_no_seu_bolso?"
      const parcela=obj['qual_parcela_cabe_no_seu_bolso?']||obj['qual_a_sua_preferencia_de_parcela?']
        ||obj['qual_parcela_mensal_cabe_no_seu_orcamento?']||obj['qual_parcela_mensal_cabe_no_seu_orçamento?']
        ||obj['qual_valor_de_parcela_voce_pretende_pagar?']||obj['qual_valor_de_parcela_você_pretende_pagar?']||'';
      // Entrada/lance — CSV1: "quanto_possui_de_entrada?" | CSV2: "quanto_voce_possui_disponivel_para_ofertar_como_lance?"
      const entrada=obj['quanto_voce_possui_disponivel_para_ofertar_como_lance?']||obj['quanto_possui_de_entrada?_(sem_contar_o_fgts)']
        ||obj['voce_possui_algum_valor_para_dar_de_entrada?']||obj['você_possui_algum_valor_para_dar_de_entrada?']
        ||obj['quanto_voce_tem_disponivel_para_dar_de_entrada?']||obj['quanto_você_tem_disponível_para_dar_de_entrada?']||'';
      // Prazo — CSV1: "qual_e_o_prazo_que_necessita?" | CSV2: "em_quanto_tempo_voce_pretende_adquirir_o_imovel?"
      const prazo=obj['em_quanto_tempo_voce_pretende_adquirir_o_imovel?']||obj['qual_e_o_prazo_que_necessita?']
        ||obj['quando_voce_pretende_comprar_seu_veiculo?_🔥']||obj['quando_você_pretende_comprar_seu_veículo?_🔥']||'';
      // FGTS — exclusivo CSV2
      const fgts=obj['voce_possui_fgts_para_utilizar_na_aquisicao?']||obj['você_possui_fgts_para_utilizar_na_aquisição?']||'';
      // Renda — CSV1: "qual_sua_renda_bruta_total/familiar?" | CSV2: "qual_e_a_sua_renda_bruta_familiar_mensal?"
      const renda=obj['qual_e_a_sua_renda_bruta_familiar_mensal?']||obj['qual_sua_renda_bruta_total/familiar?']||'';
      // Objetivo — CSV2: "qual_e_o_seu_objetivo_na_utilizacao_do_credito?"
      const objetivo=obj['qual_e_o_seu_objetivo_na_utilizacao_do_credito?']||obj['qual_seu_objetivo?']||'';
      // Horário — CSV2: "qual_e_o_melhor_horario_para_conversarmos?" | CSV1: "em_qual_horario_voce_prefere_ser_contatado?"
      const horario=obj['qual_e_o_melhor_horario_para_conversarmos?']||obj['em_qual_horario_voce_prefere_ser_contatado?']||'';
      // Prioridade — CSV2: "10._o_que_e_prioridade_para_voce?"
      const prioridade=obj['10._o_que_e_prioridade_para_voce?']||'';
      // Origem/plataforma
      const plataforma=obj['platform']||'';
      const campanha=obj['campaign_name']||'';
      const obsBase=obj['obs']||obj['observacoes']||obj['observacao']||'';
      // Campos do HubSpot/RD Station: formulario, canal, email, rotulos, criado em
      const _formularioObs=obj['formulario']||'';
      const _canalObs=obj['canal']||'';
      const _emailObs=obj['email']||'';
      const _rotulosObs=obj['rotulos']||'';
      const _criadoObs=obj['criado em']||obj['created_time']||'';
      // Formata data de captação legível: "2026-10-19T12:42:23-03:00" → "19/10/2026"
      let criadoFormatado='';
      if(_criadoObs){try{const d=new Date(_criadoObs);if(!isNaN(d))criadoFormatado=d.toLocaleDateString('pt-BR');}catch(e){criadoFormatado=_criadoObs;}}
      const obsExtra=[
        cidade&&estado?`${cidade}/${estado}`:cidade||estado,
        objetivo?`Objetivo: ${objetivo.replace(/_/g,' ')}`:'',
        parcela?`Parcela: ${parcela.replace(/_/g,' ')}`:'',
        entrada?`Lance/Entrada: ${entrada.replace(/_/g,' ')}`:'',
        fgts?`FGTS: ${fgts}`:'',
        prazo?`Prazo: ${prazo.replace(/_/g,' ')}`:'',
        renda?`Renda: ${renda.replace(/_/g,' ')}`:'',
        horario?`Horário: ${horario.replace(/_/g,' ')}`:'',
        prioridade?`Prioridade: ${prioridade.replace(/_/g,' ')}`:'',
        plataforma?`Plataforma: ${plataforma}`:'',
        campanha?`Campanha: ${campanha}`:'',
        _formularioObs?`Formulário: ${_formularioObs}`:'',
        _canalObs?`Canal: ${_canalObs}`:'',
        _emailObs?`Email: ${_emailObs}`:'',
        _rotulosObs?`Rótulos: ${_rotulosObs}`:'',
        criadoFormatado?`Captado em: ${criadoFormatado}`:''
      ].filter(Boolean).join(' | ');
      const obs=obsBase||(obsExtra)||'';

      // Checagem de duplicata (sem query extra — usa os leads já em memória)
      const metaId=obj['id']||'';
      const telLimpo=tel.replace(/\D/g,'');
      const tel8=telLimpo.length>=8?telLimpo.slice(-8):null;

      const isDuplicado=
        (metaId&&memMetaIds.has(String(metaId)))
        ||(tel8&&memTels.has(tel8));

      // Adiciona nos Sets para bloquear duplicata DENTRO do mesmo lote
      if(!isDuplicado){
        if(metaId) memMetaIds.add(String(metaId));
        if(tel8) memTels.add(tel8);
      }

      if(isDuplicado){
        duplicados++;
        duplicadosNomes.push(nome);
        continue;
      }

      const _il={id:nextLeadId++,metaId:metaId||undefined,nome,tel,tipo,credito,etapa:etapaValida,
        origem,
        responsavelId:resp?resp.id:(users[0]?.id||1),
        atendimento:obj['atendimento']||'',
        data:obj['data']||toDate(),
        obs
      };
      leads.push(_il);
      imported++;
    }
    input.value='';
    renderKanban();renderDashboard();renderTable();renderNotifPanel();
    if(imported>0){
      // Navega para o Funil e mostra toast
      const btnFunil=document.querySelector('.nb[onclick*="funil"]');
      showTab('funil',btnFunil);
      const msg=duplicados>0
        ?`${imported} importado${imported!==1?'s':''} · ${duplicados} duplicado${duplicados!==1?'s':''} ignorado${duplicados!==1?'s':''}`
        :`${imported} lead${imported!==1?'s':''} importado${imported!==1?'s':''} com sucesso!`;
      setTimeout(()=>showToast(msg,'ti-check','#1db954'),300);
    } else if(duplicados>0){
      showToast(`Nenhum lead novo — ${duplicados} já cadastrado${duplicados!==1?'s':''} no sistema.`,'ti-copy-off','#d97706');
    } else {
      showToast(`Nenhum lead importado. Verifique se o CSV tem coluna "nome".`,'ti-alert-triangle','#d97706');
    }
    // Sincroniza com o banco em lote (50 por vez) para evitar rate limit
    if(window._syncLead&&imported>0){
      const novos=leads.slice(-imported);
      const BATCH=50;
      for(let b=0;b<novos.length;b+=BATCH){
        const lote=novos.slice(b,b+BATCH);
        await Promise.all(lote.map(l=>window._syncLead(l).catch(e=>console.warn('[importCSV sync]',e))));
        if(b+BATCH<novos.length) await new Promise(r=>setTimeout(r,500)); // pausa entre lotes
      }
    }
  };
  // Lê primeiro como ArrayBuffer para detectar BOM e encoding correto
  const reader2=new FileReader();
  reader2.onload=function(ev2){
    const buf=ev2.target.result;
    const bytes=new Uint8Array(buf);
    let encoding='UTF-8';
    // BOM UTF-16 LE: FF FE
    if(bytes[0]===0xFF&&bytes[1]===0xFE) encoding='UTF-16LE';
    // BOM UTF-16 BE: FE FF
    else if(bytes[0]===0xFE&&bytes[1]===0xFF) encoding='UTF-16BE';
    // Sem BOM mas chars espaçados com 0x00 → provavelmente UTF-16 LE sem BOM
    else if(bytes.length>4&&bytes[1]===0x00&&bytes[3]===0x00) encoding='UTF-16LE';
    const decoded=new TextDecoder(encoding).decode(buf);
    // Dispara o onload do reader principal com o texto decodificado
    const syntheticEvt={target:{result:decoded}};
    reader.onload(syntheticEvt);
  };
  reader2.readAsArrayBuffer(file);
}

async function limparTodosLeads(){
  if(!confirm(`Apagar TODOS os ${leads.length} leads? Esta ação não pode ser desfeita.`)) return;
  showToast('Apagando leads...','ti-loader','#6366f1');
  try{
    if(window._sb){
      const empresaId=await window._getEmpresaId();
      if(empresaId){
        const {error}=await window._sb.from('leads').delete().eq('empresa_id',empresaId);
        if(error) throw error;
      }
    }
    leads.length=0;
    window.nextLeadId=1;
    renderKanban();renderDashboard();renderTable();renderNotifPanel();
    showToast('Todos os leads apagados. Pode importar agora.','ti-trash','#dc2626');
  }catch(e){
    console.error('[limparLeads]',e);
    showToast('Erro ao apagar leads: '+e.message,'ti-alert-triangle','#dc2626');
  }
}

function onDragStart(e,id){dragId=id;e.dataTransfer.effectAllowed='move';setTimeout(()=>document.querySelector(`[data-id="${id}"]`)?.classList.add('dragging'),0);}
function onDragOver(e,c){e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';c.classList.add('drag-over');}
function onDragLeave(e,c){if(c.contains(e.relatedTarget))return;c.classList.remove('drag-over');}
function onDrop(e,etapa){
  e.preventDefault();document.querySelectorAll('.col').forEach(c=>c.classList.remove('drag-over'));
  const l=leads.find(x=>x.id===dragId);
  if(l&&l.etapa!==etapa){
    const old=l.etapa;
    // Se saindo de "Fechado / Convertido", estorna crédito do responsável
    if(old==='Fechado / Convertido'){
      const resp=users.find(x=>x.id===l.responsavelId);
      if(resp){resp.vendas=Math.max(0,(resp.vendas||0)-1);resp.credito=Math.max(0,(resp.credito||0)-l.credito);if(window._syncUser) window._syncUser(resp).catch(e=>console.warn(e));}
    }
    l.etapa=etapa;
    if(window._syncLead) window._syncLead(l).catch(e=>console.warn(e));
    if(window._saveAtividade)window._saveAtividade('ti-arrows-right-left',`${l.nome}: ${old} → ${etapa}`);
    if(etapa==='Fechado / Convertido'){
      const resp=users.find(x=>x.id===l.responsavelId);
      if(resp){resp.vendas=(resp.vendas||0)+1;resp.credito=(resp.credito||0)+l.credito;if(window._syncUser) window._syncUser(resp).catch(e=>console.warn(e));}
      if(window._registrarVenda) window._registrarVenda(l, l.responsavelId).catch(e=>console.warn(e));
      if(window._saveAtividade)window._saveAtividade('ti-circle-check',`${l.nome} fechado — ${fmtR(l.credito)}`);
      setTimeout(()=>showCelebra(resp?resp.nome:'Vendedor', l.credito), 100);
    }
    if(old==='Fechado / Convertido'&&window._estornarVenda) window._estornarVenda(l).catch(e=>console.warn(e));
    if(etapa==='Perdido'){
      if(window._saveAtividade)window._saveAtividade('ti-x',`${l.nome} marcado como perdido`);
    }
    if(etapa==='Negociação'){
      // Abre protocolo automaticamente ao entrar em Negociação
      setTimeout(()=>openProtocolo(l.id,'','','',''),200);
    }
    renderRanking();renderDashboard();renderNotifPanel();
    syncLancesConvertidos();
  }
  dragId=null;renderKanban();
}


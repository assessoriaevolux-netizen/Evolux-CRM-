// ─── CELEBRAÇÃO ───────────────────────────────────────────────────────────────
let _celebraInterval = null;
let _celebraAberto = false;
const _CORES_CONFETE = ['#1db954','#22954f','#f0c040','#c0392b','#2563eb','#e67e22','#9b59b6','#ec4899','#fff','#fde68a'];

function showCelebra(nomeVendedor, valor) {
  _celebraAberto = true;
  // Garante que o overlay existe; se não existir, cria na hora
  let ov = document.getElementById('celebra-overlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'celebra-overlay';
    document.body.appendChild(ov);
  }
  // Monta o conteúdo sempre atualizado
  ov.innerHTML = `
    <div id="celebra-confete-bg" style="position:fixed;inset:0;background:rgba(10,15,30,0.55);backdrop-filter:blur(3px)"></div>
    <div style="background:#fff;border-radius:18px;padding:40px 36px;text-align:center;max-width:460px;width:90%;box-shadow:0 32px 96px rgba(0,0,0,.35);position:relative;z-index:1;max-height:90vh;overflow-y:auto">
      <div style="width:80px;height:80px;border-radius:50%;background:rgba(29,185,84,.1);border:2px solid rgba(29,185,84,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:40px">🏆</div>
      <div style="font-size:26px;font-weight:900;color:#0d1b35;margin-bottom:8px;letter-spacing:-.03em">Parabéns, <span style="color:#1db954">${nomeVendedor}</span>!</div>
      <div style="font-size:15px;color:#3a4a6a;margin-bottom:22px;line-height:1.6">Você acaba de realizar o sonho de mais um cliente!</div>
      <div style="height:1px;background:#e8ecf0;margin-bottom:18px"></div>
      <div style="background:rgba(29,185,84,.08);border:1px solid rgba(29,185,84,.2);border-radius:10px;padding:13px 16px;margin-bottom:18px;font-size:13.5px;color:#1e3a2a;line-height:1.6">
        <strong style="color:#1db954;display:block;margin-bottom:3px;font-size:14px">✅ Nova venda registrada com sucesso</strong>
        Seu gestor já foi notificado!
      </div>
      <div style="font-size:12px;color:#2563eb;font-weight:600;margin-bottom:18px">www.evoluxcrm.com.br</div>
      <button onclick="closeCelebra()" style="background:linear-gradient(135deg,#2563eb,#818cf8);color:#fff;border:none;border-radius:10px;padding:14px 52px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(99,102,241,.4)">Obrigado! 🎉</button>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e8ecf0">
        <div style="font-size:18px;font-weight:900;background:linear-gradient(135deg,#17a348,#25d366);-webkit-background-clip:text;-webkit-text-fill-color:transparent">Evolux CRM</div>
        <div style="font-size:10.5px;color:#8896b0;font-weight:600;letter-spacing:.04em;margin-top:2px">O melhor CRM para consórcio</div>
      </div>
    </div>`;
  // Força estilo inline máximo — ignora qualquer CSS conflitante
  ov.style.cssText = [
    'display:flex',
    'position:fixed',
    'top:0','left:0','right:0','bottom:0',
    'z-index:2147483647',
    'align-items:center',
    'justify-content:center',
    'pointer-events:all'
  ].join(';');
  launchConfetes();
}

function closeCelebra() {
  _celebraAberto = false;
  const ov = document.getElementById('celebra-overlay');
  if(ov) ov.style.cssText = 'display:none';
  _stopConfetes();
}

function _stopConfetes() {
  if(_celebraInterval){clearInterval(_celebraInterval);_celebraInterval=null;}
  document.querySelectorAll('.confete-piece').forEach(el=>el.remove());
}

function _criarPeca() {
  const el = document.createElement('div');
  const w = 6 + Math.random()*10;
  const h = 10 + Math.random()*14;
  const dur = 2.5 + Math.random()*2;
  const left = Math.random()*100;
  const cor = _CORES_CONFETE[Math.floor(Math.random()*_CORES_CONFETE.length)];
  const rot = Math.random()*360;
  el.style.cssText = [
    'position:fixed',
    `left:${left}vw`,
    'top:-20px',
    `width:${w}px`,
    `height:${h}px`,
    `background:${cor}`,
    'border-radius:2px',
    'pointer-events:none',
    'z-index:2147483646',
    `animation:confete-fall ${dur}s linear forwards`,
    `transform:rotate(${rot}deg)`
  ].join(';');
  document.body.appendChild(el);
  setTimeout(()=>{ try{el.remove();}catch(e){} }, (dur+0.5)*1000);
}

function launchConfetes() {
  _stopConfetes();
  for(let i=0;i<80;i++) setTimeout(_criarPeca, Math.random()*600);
  _celebraInterval = setInterval(()=>{
    if(!_celebraAberto){ _stopConfetes(); return; }
    for(let i=0;i<12;i++) _criarPeca();
  }, 500);
}

// ─── RANKING COM PERÍODO E FOTO ───────────────────────────────────────────────
function avatarHTML(u, size='sm') {
  const cls = size==='sm' ? 'rank-av-foto' : 'rank-av-foto-lg';
  const av = size==='sm' ? 'rank-av' : 'tv-av';
  const f = safeUrl(u.foto);
  if(f) return `<img src="${f}" class="${cls}" alt="">`;
  return `<div class="${av}">${esc((u.nome||'?').charAt(0))}</div>`;
}

// ─── DISTRIBUIÇÃO DE LEADS (aba Leads) ────────────────────────────────────────
function toggleDistrib() {
  if(!distribMode && !can('leads_transfer')){showToast('Você não tem permissão para distribuir leads.','ti-lock');return;}
  distribMode = !distribMode;
  selectedLeads.clear();
  document.getElementById('distrib-bar').style.display = distribMode ? 'flex' : 'none';
  document.getElementById('btn-distrib').classList.toggle('active', distribMode);
  const cnt = document.getElementById('distrib-count');
  if(cnt) cnt.textContent = '0 leads selecionados';
  // Pode distribuir para qualquer pessoa ativa da empresa (o servidor confere a permissão)
  const dest = document.getElementById('distrib-dest');
  if(dest) dest.innerHTML = '<option value="">Selecionar responsável...</option>' + users.slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))
    .map(u=>`<option value="${u.id}">${esc(u.nome)} (${esc(getHierLabel(u))})</option>`).join('');
  renderTable();
}
function toggleLeadSelect(id) {
  if(selectedLeads.has(id)) selectedLeads.delete(id);
  else selectedLeads.add(id);
  document.getElementById('distrib-count').textContent = `${selectedLeads.size} lead${selectedLeads.size!==1?'s':''} selecionado${selectedLeads.size!==1?'s':''}`;
  renderTable();
}
let _distribuindo = false;
async function distribuirLeads() {
  if(_distribuindo) return;
  if(!can('leads_transfer')){showToast('Você não tem permissão para distribuir leads.','ti-lock');return;}
  const destId = parseInt(document.getElementById('distrib-dest').value);
  const dest = users.find(u=>u.id===destId);
  if(!dest){showToast('Selecione um responsável.','ti-alert-triangle','#d97706');return;}
  if(!selectedLeads.size){showToast('Selecione pelo menos um lead.','ti-alert-triangle','#d97706');return;}
  _distribuindo = true;
  try{
    const n = await transferirLeadsPara([...selectedLeads], dest);
    if(n < 0) return;
    showToast(`${n} lead${n!==1?'s':''} distribuído${n!==1?'s':''} para ${dest.nome}!`,'ti-check','#1db954');
    toggleDistrib();
    renderKanban();renderDashboard();renderNotifPanel();
  } finally { _distribuindo = false; }
}

// ─── RELATÓRIO COM PERÍODO ────────────────────────────────────────────────────
function setRelPeriodo(p, btn) {
  relPeriodo = p;
  document.querySelectorAll('.periodo-tabs .periodo-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const labels = {hoje:'Hoje',semana:'Semana atual',mes:'Mês atual',trimestre:'Último trimestre',ano:'Ano atual'};
  const lbl = document.getElementById('rel-periodo-label');
  if(lbl) lbl.textContent = 'Exibindo: ' + (labels[p]||p);
  renderRelatorios();
}
function downloadRelatorio() {
  if(!can('relatorios_export')){showToast('Você não tem permissão para baixar relatórios.','ti-lock');return;}
  const labels = {hoje:'Hoje',semana:'Semana',mes:'Mês',trimestre:'Trimestre',ano:'Ano'};
  const periodo = labels[relPeriodo]||'Período';
  const data = new Date().toLocaleDateString('pt-BR');
  const admin = getAdmin();
  const adminNomeRel = admin?admin.nome:'Evolux CRM';
  // Recalcula com filtro de período igual ao renderRelatorios
  function _relIniDL(){
    const hoje=new Date(); hoje.setHours(0,0,0,0);
    const p=relPeriodo||'mes'; let ini=new Date(hoje);
    if(p==='hoje'){}
    else if(p==='semana'){ini.setDate(hoje.getDate()-hoje.getDay());}
    else if(p==='mes'){ini.setDate(1);}
    else if(p==='trimestre'){ini.setMonth(hoje.getMonth()-2);ini.setDate(1);}
    else if(p==='ano'){ini.setMonth(0);ini.setDate(1);}
    else{return null;}
    return ini;
  }
  function _parseDL(s){if(!s)return null;const p=s.split('/');if(p.length===3)return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));const d=new Date(s);return isNaN(d)?null:d;}
  const _iniDL=_relIniDL();
  const _visDL=getVisiveisParaMim();
  const _gestorDL=isGestor();
  const _leadsDL=leads.filter(l=>(_gestorDL||_visDL.has(l.responsavelId))&&(_iniDL?(_parseDL(l.data)&&_parseDL(l.data)>=_iniDL):true));
  const _usersDL=users.filter(u=>_gestorDL||_visDL.has(u.id));
  const _porIdDL=new Map(users.map(u=>[u.id,u]));
  const total = _leadsDL.length, conv = _leadsDL.filter(l=>l.etapa==='Fechado / Convertido').length;
  const tx = total ? Math.round(conv/total*100) : 0;
  const vol = _leadsDL.filter(l=>l.etapa==='Fechado / Convertido').reduce((s,l)=>s+l.credito,0);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório ${periodo} — Evolux CRM</title>
  <style>body{font-family:Arial,sans-serif;padding:32px;color:#1a2233;max-width:700px;margin:0 auto}
  h1{color:#1a6e3c;font-size:20px}h2{font-size:14px;color:#7a8799;margin-bottom:20px}
  .card{background:#f6f8fa;border-radius:10px;padding:16px;margin-bottom:12px;border-left:4px solid #1a6e3c}
  .num{font-size:28px;font-weight:800;color:#1a6e3c}.lbl{font-size:11px;color:#7a8799;text-transform:uppercase}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}
  th{background:#1a6e3c;color:#fff;padding:8px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #eee}
  .footer{margin-top:32px;font-size:10px;color:#aaa;text-align:center}
  
/* ── RANKING 3-VIEW ─────────────────────────────────── */
.rv-tabs{display:flex;gap:6px;margin-bottom:18px;background:var(--c0);padding:5px;border-radius:12px;border:1px solid var(--c1)}
.rv-tab{flex:1;padding:8px 12px;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;color:var(--tm);background:transparent;transition:all .2s;letter-spacing:.02em}
.rv-tab.active{background:var(--g);color:#fff;box-shadow:0 2px 8px rgba(1,107,60,.3)}
.rq-card{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;background:var(--card-bg);border:1.5px solid var(--card-border);border-radius:var(--radl);margin-bottom:10px;transition:all .2s}
.rq-card.lider{border-color:rgba(240,192,64,.4);background:rgba(240,192,64,.04)}
.rq-av{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;background:var(--g);color:#fff;font-weight:800;font-size:16px}
.rq-info{flex:1;min-width:0}
.rq-pos{font-size:20px;flex-shrink:0;width:36px;text-align:center}
.rq-nome{font-size:14px;font-weight:800;color:var(--tx)}
.rq-meta{font-size:11.5px;color:var(--tm);margin-top:3px}
.rq-stats{display:flex;gap:16px;margin-top:8px;flex-wrap:wrap}
.rq-stat{display:flex;flex-direction:column;gap:2px}
.rq-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--tm)}
.rq-val{font-size:13px;font-weight:800;color:var(--tx)}
.rq-val.g{color:var(--gc)}
.rt-table{width:100%;border-collapse:collapse;font-size:13px}
.rt-table th{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--tm);background:var(--table-head);border-bottom:1px solid var(--table-border)}
.rt-table td{padding:10px 12px;border-bottom:1px solid var(--table-border);color:var(--ts);vertical-align:middle}
.rt-table tr:hover td{background:var(--c0)}
.rt-pos{width:40px;text-align:center!important;font-size:15px}
.rt-av{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;background:var(--g);color:#fff;overflow:hidden;flex-shrink:0}
.rt-av img{width:100%;height:100%;object-fit:cover}
.rt-name{font-weight:700;color:var(--tx);font-size:13px}
.rt-sub{font-size:11px;color:var(--tm);margin-top:2px}
.rt-green{font-weight:800;color:var(--gc)}
.podio-wrap{padding:20px 0 24px;text-align:center}
.podio-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--tm);margin-bottom:20px}
.podio-grid{display:grid;grid-template-columns:1fr 1.2fr 1fr;align-items:end;gap:0;max-width:500px;margin:0 auto 20px}
.podio-col{display:flex;flex-direction:column;align-items:center;padding-bottom:12px}
.podio-av{border-radius:50%;border:3px solid var(--card-border);object-fit:cover;display:flex;align-items:center;justify-content:center;font-weight:800;overflow:hidden;background:var(--g);color:#fff}
.podio-av.s1{width:72px;height:72px;border-color:rgba(240,192,64,.7);box-shadow:0 0 0 3px rgba(240,192,64,.2),0 8px 24px rgba(0,0,0,.2);font-size:26px}
.podio-av.s2{width:56px;height:56px;font-size:20px}
.podio-av.s3{width:52px;height:52px;font-size:18px}
.podio-medal{font-size:22px;margin-bottom:6px}
.podio-nome{font-size:12px;font-weight:800;color:var(--tx);margin-top:8px;text-align:center}
.podio-sub{font-size:10.5px;color:var(--tm);margin-top:2px;text-align:center}
.podio-val{font-size:12px;font-weight:800;color:var(--gc);margin-top:4px}
.podio-base{width:100%;border-radius:8px 8px 0 0;margin-top:10px}
.podio-base.b1{height:60px;background:linear-gradient(180deg,rgba(240,192,64,.25),rgba(240,192,64,.06));border:1px solid rgba(240,192,64,.2)}
.podio-base.b2{height:44px;background:linear-gradient(180deg,rgba(150,150,150,.15),rgba(150,150,150,.04));border:1px solid rgba(150,150,150,.15)}
.podio-base.b3{height:32px;background:linear-gradient(180deg,rgba(180,100,50,.12),rgba(180,100,50,.03));border:1px solid rgba(180,100,50,.12)}
/* Equipe avatar na listagem */
.eq-foto-av{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;overflow:hidden;flex-shrink:0}
.eq-foto-av img{width:100%;height:100%;object-fit:cover}
</style></head><body>
  <h1>📊 Relatório — ${periodo}</h1>
  <h2>Administradora: ${esc(adminNomeRel)} · Gerado em ${data} · Evolux CRM</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
    <div class="card"><div class="lbl">Total leads</div><div class="num">${total}</div></div>
    <div class="card"><div class="lbl">Convertidos</div><div class="num">${conv}</div></div>
    <div class="card"><div class="lbl">Taxa conversão</div><div class="num">${tx}%</div></div>
  </div>
  <div class="card"><div class="lbl">Volume convertido</div><div class="num">R$ ${Math.round(vol/1000)}k</div></div>
  <h3 style="margin-top:20px;font-size:13px;color:#1a6e3c">Desempenho da equipe (${periodo})</h3>
  <table><thead><tr><th>Membro</th><th>Leads ativos</th><th>Convertidos</th><th>Crédito fechado</th></tr></thead>
  <tbody>${(()=>{const pr=new Map();_leadsDL.forEach(l=>{let r=pr.get(l.responsavelId);if(!r){r={a:0,c:0,v:0};pr.set(l.responsavelId,r);}if(l.etapa==='Fechado / Convertido'){r.c++;r.v+=l.credito||0;}else if(l.etapa!=='Perdido')r.a++;});return _usersDL.map(u=>{const r=pr.get(u.id)||{a:0,c:0,v:0};return`<tr><td>${esc(u.nome)}</td><td>${r.a}</td><td>${r.c}</td><td>${fmtR(r.v)}</td></tr>`;}).join('');})()}</tbody></table>
  <h3 style="margin-top:20px;font-size:13px;color:#1a6e3c">Leads do período</h3>
  <table><thead><tr><th>Nome</th><th>Tipo</th><th>Crédito</th><th>Etapa</th><th>Responsável</th></tr></thead>
  <tbody>${_leadsDL.map(l=>{const u=_porIdDL.get(l.responsavelId);return`<tr><td>${esc(l.nome)}</td><td>${esc(l.tipo)}</td><td>${fmtR(l.credito)}</td><td>${esc(etapaLabel(l.etapa))}</td><td>${u?esc(u.nome):'—'}</td></tr>`;}).join('')}</tbody></table>
  <div class="footer">Evolux CRM · ${esc(adminNomeRel)} · ${data}</div>
  

</div>

</body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download = `Relatorio_${periodo.replace(/ /g,'_')}_${data.replace(/\//g,'-')}.html`;
  a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// ─── LANCE: ALERTA CLIENTE FECHOU ────────────────────────────────────────────
function alertarCadastroLance(nomeLead, leadId) {
  // o banco já cria o lance automático; aqui só oferece completar os dados agora
  if(!can('lances_edit')&&!can('lances_create')) return;
  showConfirm(`${nomeLead} fechou! Deseja completar o lance agora?`,function(){
    const auto=lances.find(la=>la.leadId===leadId&&la._auto&&!la._removido);
    if(auto&&can('lances_edit')) editarLanceAuto(auto.id);
    else openLanceModal(leadId);
  });
}



async function uploadFoto(e) {
  const file = e.target.files[0]; if(!file) return;
  const _meF = getMe(); if(!_meF) return;
  if(!window._currentUserId){ showToast('Faça login novamente','ti-alert-triangle'); return; }

  // Sempre comprime a imagem primeiro (max 300x300, JPEG 0.75) para não pesar no banco
  async function _compressImg(src){
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        const size=Math.min(img.width,img.height);
        const canvas=document.createElement('canvas');
        canvas.width=300; canvas.height=300;
        canvas.getContext('2d').drawImage(img,(img.width-size)/2,(img.height-size)/2,size,size,0,0,300,300);
        resolve(canvas.toDataURL('image/jpeg',0.75));
      };
      img.src=src;
    });
  }

  showToast('Enviando foto...','ti-upload');
  try {
    // 1) Tenta Supabase Storage (URL pública pequena, ideal)
    let fotoUrl = null;
    const ext = (file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path = `${window._currentUserId}/avatar.${ext}`;

    // Garante que o bucket existe (cria se não existir — idempotente)
    await window._sb.storage.createBucket('avatars',{public:true,allowedMimeTypes:['image/*'],fileSizeLimit:5242880}).catch(()=>{});

    const {error:upError} = await window._sb.storage.from('avatars').upload(path, file, {upsert:true, contentType: file.type||'image/jpeg'});

    if(!upError){
      const {data:urlData} = window._sb.storage.from('avatars').getPublicUrl(path);
      // Adiciona cache-buster para forçar reload da foto em todos os clientes
      fotoUrl = urlData.publicUrl + '?t=' + Date.now();
      console.log('[uploadFoto] foto salva no Storage:', fotoUrl);
    } else {
      // 2) Fallback: base64 comprimida (≈30KB)
      console.warn('[uploadFoto] Storage falhou, usando base64:', upError.message);
      const reader = new FileReader();
      const dataUrl = await new Promise(r=>{ reader.onload=ev=>r(ev.target.result); reader.readAsDataURL(file); });
      fotoUrl = await _compressImg(dataUrl);
      console.log('[uploadFoto] foto como base64, tamanho:', Math.round(fotoUrl.length/1024)+'KB');
    }

    // 3) Atualiza objeto local e salva no banco
    _meF.foto = fotoUrl;
    if(!_meF.sb_id) _meF.sb_id = window._currentUserId;
    if(window._syncUser) await window._syncUser(_meF);

    // 4) Atualiza UI
    updateSbUser();
    const prev = document.getElementById('foto-preview-conta');
    const fotoSegura = safeUrl(_meF.foto);
    if(prev&&fotoSegura) prev.innerHTML = `<img src="${fotoSegura}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    // Atualiza avatar no header também
    if(fotoSegura) document.querySelectorAll('.user-avatar,.avatar-img,[data-user-foto]').forEach(el=>{
      if(el.tagName==='IMG') el.src=_meF.foto;
      else el.style.backgroundImage=`url("${_meF.foto.replace(/"/g,'')}")`;
    });
    showToast('Foto salva com sucesso! ✅','ti-check');
    if(document.getElementById('ranking-rows')) renderRanking();
  } catch(err) {
    console.warn('[uploadFoto] erro:', err);
    showToast('Erro ao salvar foto. Tente novamente.','ti-alert-triangle');
  }
}
function toggleDarkMode(on) {
  document.documentElement.setAttribute('data-theme', on?'dark':'light');
  localStorage.setItem('evolux-theme', on?'dark':'light');
  // Atualizar toggle nas configurações se existir
  const toggle = document.getElementById('dark-mode-toggle');
  if(toggle) toggle.checked = on;
  try{ if(document.documentElement.classList.contains('design-novo')) renderDashboard(); }catch(e){}
}


// ─── CALENDÁRIO POPUP DO RANKING ──────────────────────────────────────────────
let rankCalYear=new Date().getFullYear(), rankCalMonth=new Date().getMonth();
let rankDataSelecionada='';

// Resultado do ranking por período (somado no servidor)
let _rankVendasCache={chave:null,resultado:null};
function _invalidarRanking(){ _rankVendasCache={chave:null,resultado:null}; window._dashVendasCache=null; }
window._invalidarRanking=_invalidarRanking;

// Intervalo de datas do período (sempre no fuso local — toISOString vira o dia depois das 21h)
function _getRankDateRange(p, dataCustom){
  const hoje=new Date();
  hoje.setHours(0,0,0,0);
  const fmt=d=>hojeISO(d);
  if(p==='hoje'||p==='dia') return{de:fmt(hoje),ate:fmt(hoje)};
  if(p==='semana'){ const ini=new Date(hoje); ini.setDate(hoje.getDate()-hoje.getDay()); return{de:fmt(ini),ate:fmt(hoje)}; }
  if(p==='mes'){ return{de:fmt(new Date(hoje.getFullYear(),hoje.getMonth(),1)),ate:fmt(hoje)}; }
  if(p==='semana_passada'){
    const dom=new Date(hoje); dom.setDate(hoje.getDate()-hoje.getDay()-7);
    const sab=new Date(dom); sab.setDate(dom.getDate()+6);
    return{de:fmt(dom),ate:fmt(sab)};
  }
  if(p==='mes_passado') return{de:fmt(new Date(hoje.getFullYear(),hoje.getMonth()-1,1)),ate:fmt(new Date(hoje.getFullYear(),hoje.getMonth(),0))};
  if(p==='ultimos_7'){ const ini=new Date(hoje); ini.setDate(hoje.getDate()-6); return{de:fmt(ini),ate:fmt(hoje)}; }
  if(p==='ultimos_30'){ const ini=new Date(hoje); ini.setDate(hoje.getDate()-29); return{de:fmt(ini),ate:fmt(hoje)}; }
  if(p==='custom'&&dataCustom) return{de:dataCustom,ate:dataCustom};
  if(p==='todos') return{de:null,ate:null};
  return{de:fmt(new Date(hoje.getFullYear(),hoje.getMonth(),1)),ate:fmt(hoje)};
}

// _rankOverride: {sb_id → {vendas, credito}} do período escolhido (usado pelo ranking)
let _rankOverride=null;
let _rankPedido=0;
async function _aplicarFiltroVendas(){
  const range=_getRankDateRange(rankPeriodo,rankDataSelecionada);
  const chave=`${range.de||''}|${range.ate||''}`;
  if(_rankVendasCache.chave===chave&&_rankVendasCache.resultado){
    _rankOverride=_rankVendasCache.resultado;
    renderRanking();
    return;
  }
  const pedido=++_rankPedido;
  let agg=null;
  const {data,error}=await window._rpc('crm_ranking_vendas',{p_de:range.de,p_ate:range.ate});
  if(!error){
    agg={};
    (data||[]).forEach(r=>{ if(r.user_id) agg[r.user_id]={vendas:Number(r.vendas)||0,credito:Number(r.credito)||0}; });
  } else {
    // banco ainda sem a função nova: soma aqui, buscando todas as vendas em páginas
    try{
      const empresaId=await window._getEmpresaId();
      if(!empresaId) return;
      const rows=await window._sbTodos(()=>window._sb.from('vendas').select('id,user_id,valor_credito,data_fechamento,created_at')
        .eq('empresa_id',empresaId).order('created_at',{ascending:false}).order('id'));
      agg={};
      rows.forEach(r=>{
        const d=r.data_fechamento?String(r.data_fechamento).slice(0,10):(r.created_at?hojeISO(new Date(r.created_at)):'');
        if(!r.user_id||(range.de&&(!d||d<range.de))||(range.ate&&(!d||d>range.ate))) return;
        if(!agg[r.user_id]) agg[r.user_id]={vendas:0,credito:0};
        agg[r.user_id].vendas++;
        agg[r.user_id].credito+=Number(r.valor_credito)||0;
      });
    }catch(e){ console.warn('[ranking]',e); return; }
  }
  if(pedido!==_rankPedido) return; // chegou resposta de um período antigo
  _rankVendasCache={chave,resultado:agg};
  _rankOverride=agg;
  renderRanking();
}
window._aplicarFiltroVendas=_aplicarFiltroVendas;

function setRankPeriodo(p, btn) {
  rankPeriodo = p;
  document.querySelectorAll('.rank-hdr .periodo-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const popup=document.getElementById('rank-cal-popup');
  if(p==='custom'){
    if(popup){popup.style.display='block'; rankCalRender();}
  } else {
    if(popup) popup.style.display='none';
    rankDataSelecionada='';
    _aplicarFiltroVendas();
  }
}
function rankCalNav(dir){
  rankCalMonth+=dir;
  if(rankCalMonth>11){rankCalMonth=0;rankCalYear++;}
  if(rankCalMonth<0){rankCalMonth=11;rankCalYear--;}
  rankCalRender();
}
function rankCalRender(){
  const meses=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const t=document.getElementById('rank-cal-title');
  if(t) t.textContent=meses[rankCalMonth]+' '+rankCalYear;
  const cells=document.getElementById('rank-cal-cells');
  if(!cells) return;
  const primeiro=new Date(rankCalYear,rankCalMonth,1).getDay();
  const ultDia=new Date(rankCalYear,rankCalMonth+1,0).getDate();
  const hoje=new Date();
  let html='';
  for(let i=0;i<primeiro;i++) html+=`<div></div>`;
  for(let d=1;d<=ultDia;d++){
    const dStr=`${rankCalYear}-${String(rankCalMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isHoje=d===hoje.getDate()&&rankCalMonth===hoje.getMonth()&&rankCalYear===hoje.getFullYear();
    const isSel=dStr===rankDataSelecionada;
    html+=`<button onclick="rankCalSelect('${dStr}')" style="width:100%;aspect-ratio:1;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:${isHoje||isSel?'700':'500'};background:${isSel?'var(--g)':isHoje?'var(--gs)':'transparent'};color:${isSel?'#fff':isHoje?'var(--ge)':'var(--tx)'};transition:all .1s" onmouseover="this.style.background=this.style.background||'var(--c1)'">${d}</button>`;
  }
  cells.innerHTML=html;
}
function rankCalSelect(dStr){
  rankDataSelecionada=dStr;
  rankPeriodo='custom';
  rankCalRender();
  const popup=document.getElementById('rank-cal-popup');
  if(popup) popup.style.display='none';
  const d=new Date(dStr+'T00:00:00');
  document.getElementById('rank-month').textContent=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  document.getElementById('tv-month-title').textContent=d.toLocaleDateString('pt-BR',{day:'2-digit',month:'long'});
  _aplicarFiltroVendas();
}
function rankCalPeriod(p){
  const popup=document.getElementById('rank-cal-popup');
  if(popup) popup.style.display='none';
  rankPeriodo=p; rankDataSelecionada='';
  const labels={'semana_passada':'Semana passada','mes_passado':'Mês passado','ultimos_7':'Últimos 7 dias','ultimos_30':'Últimos 30 dias'};
  document.getElementById('rank-month').textContent=labels[p]||'';
  _aplicarFiltroVendas();
}
// Fechar popup ao clicar fora
document.addEventListener('click',function(e){
  const popup=document.getElementById('rank-cal-popup');
  const btn=document.getElementById('rp-custom');
  if(popup&&btn&&!popup.contains(e.target)&&!btn.contains(e.target)){
    popup.style.display='none';
  }
});


function getMe(){
  // 1. Busca pelo UUID do Supabase (mais confiável)
  if(window._currentUserId){
    const found=users.find(u=>u.sb_id===window._currentUserId);
    if(found) return found;
  }
  // 2. Fallback: tenta pelo email do Supabase
  const sbEmail=window._session&&window._session.user&&window._session.user.email;
  if(sbEmail){
    const byEmail=users.find(u=>u.email===sbEmail);
    if(byEmail) return byEmail;
  }
  // 3. Último recurso: cria objeto temporário com dados do Supabase session
  // FIX bug#2: NUNCA retorna users[0] — dados do admin jamais aparecem para outro usuário
  if(window._session&&window._session.user){
    const u=window._session.user;
    const tempNome=u.user_metadata?.nome||u.email?.split('@')[0]||'Usuário';
    return {
      id:9999, sb_id:u.id, nome:tempNome, email:u.email||'',
      role:'vendedor', // nunca confiar no cargo informado no cadastro
      hierarquiaId:null, equipeId:null, managerId:null,
      vendas:0, credito:0, meta:0,
      foto:null, perms:{}, hperms:{}
    };
  }
  return null; // sessão não carregada ainda — retorna null, nunca o admin
}
window.getMe=getMe; // expõe globalmente para _loadProfiles poder chamar

function fazerLogout(){
  showConfirm('Deseja sair do CRM?',async function(){
    try{ await window._sb.auth.signOut(); }catch(e){}
    localStorage.removeItem('evolux_last_active');
    try{
      localStorage.removeItem('evolux_gcal_token');
      localStorage.removeItem('evolux_gcal_token_expiry');
      localStorage.removeItem('evolux_gcal_return_tab');
    }catch(e){}
    window._gcalToken=null;
    window.location.href='index.html';
  });
}
window.fazerLogout=fazerLogout;


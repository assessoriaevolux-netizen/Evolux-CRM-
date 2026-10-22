// ─── HIERARQUIA MODAL ─────────────────────────────────────────────────────────
let hmEditId=null; // null = new

function openHierModalNew(){
  hmEditId=null;
  document.getElementById('hm-title').textContent='Adicionar hierarquia';
  document.getElementById('hm-sub').textContent='';
  document.getElementById('hm-nome').value='';
  document.getElementById('hm-descricao').value='';
  document.getElementById('hm-ordem').value=hierarquias.length+1;
  document.getElementById('hm-status').value='ativa';
  document.getElementById('hm-user-count').textContent='';
  // populate superior
  const sup=document.getElementById('hm-superior');
  sup.innerHTML='<option value="">Nenhuma (topo)</option>'+
    hierarquias.map(h=>`<option value="${h.id}">${h.nome}</option>`).join('');
  sup.value='';
  // default all perms OFF for new
  const blankPerms=Object.fromEntries(allHPermIds().map(id=>[id,false]));
  renderHierPerms(blankPerms);
  document.getElementById('hier-modal').style.display='block';
  document.body.style.overflow='hidden';
}

function openHierModal(hId){
  const h=getHier(hId);if(!h)return;
  hmEditId=hId;
  document.getElementById('hm-title').textContent='Editar hierarquia';
  document.getElementById('hm-sub').textContent=h.nome;
  document.getElementById('hm-nome').value=h.nome;
  document.getElementById('hm-descricao').value=h.descricao||'';
  document.getElementById('hm-ordem').value=h.ordem||1;
  document.getElementById('hm-status').value=h.status||'ativa';
  const cnt=hierUsersCount(hId);
  document.getElementById('hm-user-count').textContent=cnt?`${cnt} usuário${cnt!==1?'s':''} vinculado${cnt!==1?'s':''}`:' ';
  // populate superior (exclude self)
  const sup=document.getElementById('hm-superior');
  sup.innerHTML='<option value="">Nenhuma (topo)</option>'+
    hierarquias.filter(x=>x.id!==hId).map(x=>`<option value="${x.id}">${x.nome}</option>`).join('');
  sup.value=h.superiorId||'';
  renderHierPerms(h.perms||{});
  document.getElementById('hier-modal').style.display='block';
  document.body.style.overflow='hidden';
}

function closeHierModal(){
  document.getElementById('hier-modal').style.display='none';
  document.body.style.overflow='';
}

function renderHierPerms(perms){
  const container=document.getElementById('hm-perms');
  container.innerHTML=HPERM_MODULES.map(mod=>{
    const rows=mod.perms.map(p=>{
      const on=!!perms[p.id];
      return `<label class="hperm-label" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .1s">
        <div class="hperm-chk" data-pid="${p.id}" data-on="${on?1:0}" style="width:20px;height:20px;border-radius:6px;border:2px solid ${on?'var(--g)':'var(--c3,#c8cfe0)'};background:${on?'var(--g)':'transparent'};display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0">
          ${on?'<i class="ti ti-check" style="font-size:11px;color:#fff"></i>':''}
        </div>
        <span style="font-size:13px;color:var(--tx);flex:1">${p.label}</span>
      </label>`;
    }).join('');
    return `<div>
      <div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;padding:0 10px">${mod.label}</div>
      <div style="background:var(--c0,rgba(255,255,255,.03));border-radius:10px;border:1px solid var(--card-border,rgba(255,255,255,.06))">${rows}</div>
    </div>`;
  }).join('');
  // Bind events via addEventListener — no onclick inline (CSP blocks inline handlers)
  container.querySelectorAll('.hperm-chk').forEach(function(el){
    el.addEventListener('click',function(e){
      e.stopPropagation();
      hierTogglePerm(el.getAttribute('data-pid'),el);
    });
  });
  container.querySelectorAll('.hperm-label').forEach(function(lbl){
    lbl.addEventListener('mouseenter',function(){lbl.style.background='var(--c0)';});
    lbl.addEventListener('mouseleave',function(){lbl.style.background='transparent';});
  });
}

function hierTogglePerm(pid,el){
  const on=el.dataset.on==='1';
  const newOn=!on;
  el.dataset.on=newOn?'1':'0';
  el.style.background=newOn?'var(--g)':'transparent';
  el.style.borderColor=newOn?'var(--g)':'var(--c3,#c8cfe0)';
  el.innerHTML=newOn?'<i class="ti ti-check" style="font-size:11px;color:#fff"></i>':'';
}

function hierSelectAll(val){
  document.querySelectorAll('#hm-perms [data-pid]').forEach(el=>{
    el.dataset.on=val?'1':'0';
    el.style.background=val?'var(--g)':'transparent';
    el.style.borderColor=val?'var(--g)':'var(--c3,#c8cfe0)';
    el.innerHTML=val?'<i class="ti ti-check" style="font-size:11px;color:#fff"></i>':'';
  });
}

function hierGetCurrentPerms(){
  const perms={};
  document.querySelectorAll('#hm-perms [data-pid]').forEach(el=>{
    perms[el.dataset.pid]=el.dataset.on==='1';
  });
  return perms;
}

function hierRestoreDefaults(){
  showConfirm('Tem certeza que deseja restaurar as permissões padrão desta hierarquia?',function(){
    const nome=(document.getElementById('hm-nome').value||'').toLowerCase().trim();
    const slug=hmEditId?getHier(hmEditId)?.slug:nome;
    const def=HPERM_DEFAULTS[slug]||HPERM_DEFAULTS.vendedor;
    renderHierPerms(def);
  });
}

async function saveHierModal(){
  const nome=document.getElementById('hm-nome').value.trim();
  if(!nome){showToast('Informe o nome da hierarquia.','ti-alert-triangle','#d97706');return;}
  const descricao=document.getElementById('hm-descricao').value.trim();
  const ordem=parseInt(document.getElementById('hm-ordem').value)||hierarquias.length+1;
  const status=document.getElementById('hm-status').value||'ativa';
  const superiorId=parseInt(document.getElementById('hm-superior').value)||null;
  const perms=hierGetCurrentPerms();

  if(hmEditId){
    // edit existing
    const h=getHier(hmEditId);
    if(h){
      h.nome=nome;h.descricao=descricao;h.ordem=ordem;h.status=status;h.superiorId=superiorId;h.perms=perms;
      // Await sync so sb_id is populated before any user assignment uses it
      if(window._syncHierarquia) await window._syncHierarquia(h).catch(e=>console.warn(e));
      // propagate to all users of this hierarchy
      applyHierToAll(hmEditId);
    }
  } else {
    // create new
    const slug=nome.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    const newH={id:nextHierArquiaId++,slug,nome,descricao,ordem,superiorId,status,perms};
    hierarquias.push(newH);
    // Await sync so sb_id is populated before user assignment
    if(window._syncHierarquia) await window._syncHierarquia(newH).catch(e=>console.warn(e));
  }

  closeHierModal();
  // Re-render hierarquia section
  cfgRenderSection();
  // Show toast
  showHierToast(hmEditId?'Hierarquia atualizada com sucesso.':'Hierarquia criada com sucesso.');
  // Re-populate hierarquia selects everywhere
  populateHierSelects();
}

function showHierToast(msg){
  const t=document.getElementById('hier-toast');
  const m=document.getElementById('hier-toast-msg');
  if(t&&m){m.textContent=msg;t.style.setProperty('display','flex','important');setTimeout(()=>t.style.setProperty('display','none','important'),3500);}
}

function populateHierSelects(){
  // Update the invite form select — all hierarquias, sorted by order
  const sorted=hierarquias.slice().sort((a,b)=>a.ordem-b.ordem);
  const opts='<option value="">Hierarquia...</option>'+sorted.map(h=>`<option value="${h.id}">${h.nome}</option>`).join('');
  const hs=document.getElementById('uHierarquia');
  if(hs)hs.innerHTML=opts;
  // Also update any user-list hier selects that are currently rendered
  document.querySelectorAll('.ulist-hier-sel').forEach(function(sel){
    const uid=parseInt(sel.getAttribute('data-uid'));
    const u=users.find(x=>x.id===uid);
    const curVal=u?u.hierarquiaId:'';
    sel.innerHTML='<option value="">Hierarquia...</option>'+sorted.map(h=>`<option value="${h.id}" ${u&&(u.hierarquiaId===h.sb_id||u.hierarquiaId===h.id)?'selected':''}>${h.nome}</option>`).join('');
  });
}


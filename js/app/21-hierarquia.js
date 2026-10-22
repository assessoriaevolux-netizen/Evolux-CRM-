// ─── HIERARQUIA (cargos e permissões) ─────────────────────────────────────────
// Gestor mexe em tudo. Quem tem "Gerenciar cargos" só mexe em cargos abaixo do seu
// e só marca permissões que ele mesmo tem (o banco confere as duas coisas).
let hmEditId=null; // null = novo
let hmSomenteLeitura=false;

function podeEditarHierarquias(){ return isGestor()||can('config_hierarchy'); }
function podeEditarHier(h){
  if(isGestor()) return true;
  if(!can('config_hierarchy')||!h) return false;
  return (h.ordem||99)>nivelDe(getMe())&&slugToRole(h)!=='gestor';
}
function podeMexerPermissoes(){ return isGestor()||can('config_permissions'); }

function _hmPreencherSuperior(excluirId,valor){
  const sup=document.getElementById('hm-superior');
  sup.innerHTML='<option value="">Nenhuma (topo)</option>'+
    hierarquias.filter(x=>x.id!==excluirId).sort((a,b)=>a.ordem-b.ordem).map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('');
  sup.value=valor||'';
}
function _hmAplicarModo(){
  ['hm-nome','hm-descricao','hm-ordem','hm-status','hm-superior'].forEach(id=>{const el=document.getElementById(id);if(el)el.disabled=hmSomenteLeitura;});
  const permsBloq=hmSomenteLeitura||!podeMexerPermissoes();
  ['hm-btn-sel-all','hm-btn-desel-all','hm-btn-restore'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display=permsBloq?'none':'';});
  const save=document.getElementById('hm-btn-save');
  if(save) save.style.display=hmSomenteLeitura?'none':'';
}
function _hmAbrir(){
  _hmAplicarModo();
  document.getElementById('hier-modal').style.display='block';
  document.body.style.overflow='hidden';
}

function openHierModalNew(){
  if(!podeEditarHierarquias()){showToast('Você não tem permissão para criar cargos.','ti-lock');return;}
  hmEditId=null;
  hmSomenteLeitura=false;
  document.getElementById('hm-title').textContent='Adicionar hierarquia';
  document.getElementById('hm-sub').textContent='';
  document.getElementById('hm-nome').value='';
  document.getElementById('hm-descricao').value='';
  const minOrdem=isGestor()?1:nivelDe(getMe())+1;
  document.getElementById('hm-ordem').value=Math.max(minOrdem,hierarquias.length+1);
  document.getElementById('hm-ordem').min=minOrdem;
  document.getElementById('hm-status').value='ativa';
  document.getElementById('hm-user-count').textContent='';
  _hmPreencherSuperior(null,'');
  renderHierPerms(Object.fromEntries(allHPermIds().map(id=>[id,false])));
  _hmAbrir();
}

function openHierModal(hId){
  const h=getHier(hId);if(!h)return;
  hmEditId=h.id;
  hmSomenteLeitura=!podeEditarHier(h);
  document.getElementById('hm-title').textContent=hmSomenteLeitura?'Ver hierarquia':'Editar hierarquia';
  document.getElementById('hm-sub').textContent=h.nome+(hmSomenteLeitura?' · somente leitura (cargo igual ou acima do seu)':'');
  document.getElementById('hm-nome').value=h.nome;
  document.getElementById('hm-descricao').value=h.descricao||'';
  document.getElementById('hm-ordem').value=h.ordem||1;
  document.getElementById('hm-ordem').min=isGestor()?1:nivelDe(getMe())+1;
  document.getElementById('hm-status').value=h.status||'ativa';
  const cnt=hierUsersCount(h.id);
  document.getElementById('hm-user-count').textContent=cnt?`${cnt} usuário${cnt!==1?'s':''} vinculado${cnt!==1?'s':''}`:' ';
  _hmPreencherSuperior(h.id,h.superiorId||'');
  // permissões que a chave não tem salva seguem o padrão do cargo
  const padrao=_permsPadraoRole(slugToRole(h));
  const efetivas=Object.fromEntries(allHPermIds().map(id=>[id,typeof (h.perms||{})[id]==='boolean'?h.perms[id]:!!padrao[id]]));
  if(slugToRole(h)==='gestor') allHPermIds().forEach(id=>efetivas[id]=true);
  renderHierPerms(efetivas);
  _hmAbrir();
}

function closeHierModal(){
  document.getElementById('hier-modal').style.display='none';
  document.body.style.overflow='';
}

function renderHierPerms(perms){
  const container=document.getElementById('hm-perms');
  const bloqueadoGeral=hmSomenteLeitura||!podeMexerPermissoes();
  const gestor=isGestor();
  container.innerHTML=(bloqueadoGeral&&!hmSomenteLeitura?`<div class="ibox" style="margin:0 0 6px"><i class="ti ti-lock" style="font-size:14px;flex-shrink:0"></i>Você pode editar o cargo, mas não as permissões (precisa de "Alterar permissões dos cargos").</div>`:'')+
  HPERM_MODULES.map(mod=>{
    const rows=mod.perms.map(p=>{
      const on=!!perms[p.id];
      // quem não é gestor só concede o que ele mesmo tem
      const travado=bloqueadoGeral||(!gestor&&!can(p.id));
      return `<label class="hperm-label" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:${travado?'default':'pointer'};transition:background .1s;${travado?'opacity:.6':''}">
        <div class="hperm-chk" data-pid="${p.id}" data-on="${on?1:0}" data-travado="${travado?1:0}" style="width:20px;height:20px;border-radius:6px;border:2px solid ${on?'var(--g)':'var(--c3,#c8cfe0)'};background:${on?'var(--g)':'transparent'};display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0">
          ${on?'<i class="ti ti-check" style="font-size:11px;color:#fff"></i>':''}
        </div>
        <span style="font-size:13px;color:var(--tx);flex:1">${esc(p.label)}${travado&&!bloqueadoGeral?' <span style="font-size:10.5px;color:var(--tm)">(você não tem)</span>':''}</span>
      </label>`;
    }).join('');
    return `<div>
      <div style="font-size:11px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;padding:0 10px">${esc(mod.label)}</div>
      <div style="background:var(--c0,rgba(255,255,255,.03));border-radius:10px;border:1px solid var(--card-border,rgba(255,255,255,.06))">${rows}</div>
    </div>`;
  }).join('');
  container.querySelectorAll('.hperm-chk').forEach(function(el){
    if(el.dataset.travado==='1') return;
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

function _hmMarcar(el,on){
  el.dataset.on=on?'1':'0';
  el.style.background=on?'var(--g)':'transparent';
  el.style.borderColor=on?'var(--g)':'var(--c3,#c8cfe0)';
  el.innerHTML=on?'<i class="ti ti-check" style="font-size:11px;color:#fff"></i>':'';
}
function hierTogglePerm(pid,el){
  if(el.dataset.travado==='1') return;
  _hmMarcar(el,el.dataset.on!=='1');
}
function hierSelectAll(val){
  document.querySelectorAll('#hm-perms [data-pid]').forEach(el=>{ if(el.dataset.travado!=='1') _hmMarcar(el,val); });
}
function hierGetCurrentPerms(){
  const perms={};
  document.querySelectorAll('#hm-perms [data-pid]').forEach(el=>{ perms[el.dataset.pid]=el.dataset.on==='1'; });
  return perms;
}
function hierRestoreDefaults(){
  showConfirm('Restaurar as permissões padrão desta hierarquia?',function(){
    const h=hmEditId?getHier(hmEditId):null;
    const base=h?slugToRole(h):_impChave(document.getElementById('hm-nome').value||'');
    const def=HPERM_DEFAULTS[base]||HPERM_DEFAULTS.vendedor;
    renderHierPerms(def);
  });
}

let _salvandoHier=false;
async function saveHierModal(){
  if(_salvandoHier||hmSomenteLeitura)return;
  const nome=document.getElementById('hm-nome').value.trim();
  if(!nome){showToast('Informe o nome da hierarquia.','ti-alert-triangle','#d97706');return;}
  const descricao=document.getElementById('hm-descricao').value.trim();
  const ordem=parseInt(document.getElementById('hm-ordem').value)||hierarquias.length+1;
  if(!isGestor()&&ordem<=nivelDe(getMe())){showToast('A ordem precisa ser abaixo do seu cargo (número maior que '+nivelDe(getMe())+').','ti-alert-triangle','#d97706');return;}
  const status=document.getElementById('hm-status').value||'ativa';
  const superiorId=parseInt(document.getElementById('hm-superior').value)||null;
  const permsTela=hierGetCurrentPerms();
  let h=hmEditId?getHier(hmEditId):null;
  const novo=!h;
  if(!novo&&!podeEditarHier(h)){showToast('Você não pode alterar este cargo.','ti-lock');return;}
  const antes=h?{...h,perms:{...(h.perms||{})}}:null;
  const perms=podeMexerPermissoes()?permsTela:(h?h.perms||{}:{});
  if(novo){
    const slug=nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
    h={id:nextHierArquiaId++,slug,nome,descricao,ordem,superiorId,status,perms};
    hierarquias.push(h);
  } else Object.assign(h,{nome,descricao,ordem,status,superiorId,perms});
  _salvandoHier=true;
  const ok=await window._syncHierarquia(h);
  _salvandoHier=false;
  if(!ok){
    if(novo){ const i=hierarquias.indexOf(h); if(i!==-1) hierarquias.splice(i,1); }
    else Object.assign(h,antes);
    return;
  }
  // o servidor pode ter desmarcado permissões que quem salvou não tem: recarrega
  await window._loadHierarquias();
  applyHierToAll(h.sb_id||h.id);
  closeHierModal();
  cfgRenderSection();
  showHierToast(novo?'Hierarquia criada com sucesso.':'Hierarquia atualizada com sucesso.');
  populateHierSelects();
}

function showHierToast(msg){
  const t=document.getElementById('hier-toast');
  const m=document.getElementById('hier-toast-msg');
  if(t&&m){m.textContent=msg;t.style.setProperty('display','flex','important');setTimeout(()=>t.style.setProperty('display','none','important'),3500);}
}

function populateHierSelects(){
  try{ populateSelects(); }catch(e){}
  if(document.getElementById('user-list')) try{ renderUserList(); }catch(e){}
}

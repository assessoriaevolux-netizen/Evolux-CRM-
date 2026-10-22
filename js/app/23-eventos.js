(function(){
  // Expõe as funções que os onclick inline chamam no escopo global
  // (já estão no escopo global pois foram declaradas com function no script principal)

  // ── Coleta o atributo onclick de um elemento ou seus ancestrais ──────────
  function getOnclick(el){
    var node=el;
    while(node&&node!==document.body){
      var oc=node.getAttribute&&node.getAttribute('onclick');
      if(oc)return{fn:oc,el:node};
      node=node.parentElement;
    }
    return null;
  }

  // ── Intercepta TODOS os cliques do documento ─────────────────────────────
  document.addEventListener('click',function(e){
    var hit=getOnclick(e.target);
    if(!hit)return;
    e.stopPropagation();
    // Executa o onclick como função, com `this` = o elemento
    try{
      (new Function('event',hit.fn)).call(hit.el,e);
    }catch(err){
      console.warn('onclick delegation error:',err,hit.fn);
    }
  },true); // capture=true para pegar antes de qualquer outro handler

  // onchange / oninput / onmouseover / onmouseout ficam com o navegador:
  // interceptar aqui fazia cada um rodar DUAS vezes (importação dupla,
  // seleção que desmarcava sozinha, erro de "remove" no input de arquivo).

  // ── Bind dos botões estáticos do modal hierarquia ─────────────────────────
  var modal=document.getElementById('hier-modal');
  if(modal){
    modal.addEventListener('click',function(e){if(e.target===modal)closeHierModal();});
    var bx=document.getElementById('hm-btn-close-x');
    if(bx)bx.addEventListener('click',function(){closeHierModal();});
    var bc=document.getElementById('hm-btn-cancel');
    if(bc)bc.addEventListener('click',function(){closeHierModal();});
    var bs=document.getElementById('hm-btn-save');
    if(bs)bs.addEventListener('click',function(){saveHierModal();});
    var bsa=document.getElementById('hm-btn-sel-all');
    if(bsa)bsa.addEventListener('click',function(){hierSelectAll(true);});
    var bda=document.getElementById('hm-btn-desel-all');
    if(bda)bda.addEventListener('click',function(){hierSelectAll(false);});
    var brest=document.getElementById('hm-btn-restore');
    if(brest)brest.addEventListener('click',function(){hierRestoreDefaults();});
  }
})();

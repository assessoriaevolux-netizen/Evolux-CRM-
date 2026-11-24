// ─── META PIXEL DE CONVERSÃO ─────────────────────────────────────────────────
// Carrega o pixel da Meta quando a empresa tem meta_pixel_id configurado.
// Dispara evento 'Purchase' quando um lead é movido para "Fechado / Convertido".
// ─────────────────────────────────────────────────────────────────────────────

(function(){
  let _pixelCarregado=false;

  // Inicializa o Meta Pixel base code
  function _initMetaPixel(pixelId){
    if(_pixelCarregado||!pixelId) return;
    _pixelCarregado=true;

    // Meta Pixel base code (padrão oficial)
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s);
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', pixelId);
    fbq('track', 'PageView');
    console.log('[MetaPixel] Pixel inicializado:', pixelId);
  }

  // Dispara evento de conversão com advanced matching
  window._metaPixelConversao = function(lead){
    if(!_pixelCarregado||typeof fbq==='undefined') return;
    if(!lead) return;

    const valor = Number(lead.credito)||0;
    const nome = (lead.nome||'').trim();
    const tel = (lead.tel||'').replace(/\D/g,'');

    // Dados do usuário para advanced matching (Meta usa para cruzar com quem viu o anúncio)
    const userData = {};
    if(tel){
      // Meta exige formato E.164 sem o +
      userData.ph = tel.length>=12 ? tel : (tel.length>=10 ? '55'+tel : tel);
    }
    if(nome){
      const partes = nome.toLowerCase().split(/\s+/);
      if(partes[0]) userData.fn = partes[0];
      if(partes.length>1) userData.ln = partes[partes.length-1];
    }

    // Envia dados de usuário via advanced matching
    if(Object.keys(userData).length){
      fbq('init', window.empresa.meta_pixel_id, userData);
    }

    // Dispara Purchase com valor do crédito
    fbq('track', 'Purchase', {
      value: valor,
      currency: 'BRL',
      content_name: 'Consórcio - Fechamento',
      content_category: lead.tipo || 'Crédito'
    });

    console.log('[MetaPixel] Conversão disparada:', nome, 'R$', valor);
  };

  // Hook: chamado após _loadAllData quando o CRM está pronto
  const _origRenderTudo = window._renderTudo;
  if(_origRenderTudo){
    window._renderTudo = function(){
      _origRenderTudo.apply(this, arguments);
      // Inicializa pixel após dados carregados
      if(window.empresa && window.empresa.meta_pixel_id && !_pixelCarregado){
        _initMetaPixel(window.empresa.meta_pixel_id);
      }
    };
  } else {
    // Fallback: tenta após 3s
    setTimeout(function(){
      if(window.empresa && window.empresa.meta_pixel_id && !_pixelCarregado){
        _initMetaPixel(window.empresa.meta_pixel_id);
      }
    }, 3000);
  }
})();

// ─── DADOS DEMO (somente para perfil master / plataforma) ────────────────────
// Injeta vendedores, equipes e vendas fictícias para demonstração do CRM.
// Nada é salvo no banco — tudo vive apenas na memória enquanto a sessão está aberta.
(function(){
  'use strict';
  const DEMO = '__demoInjetado';

  // ── Vendedores demo ─────────────────────────────────────────────
  const vendedoresDemo = [
    { nome:'Larissa Monteiro',  vendas:14, credito:487000, cor:'6366f1' },
    { nome:'Arthur Nogueira',   vendas:11, credito:392000, cor:'0ea5e9' },
    { nome:'Beatriz Ferreira',  vendas:9,  credito:325000, cor:'ec4899' },
    { nome:'Lucas Almeida',     vendas:7,  credito:268000, cor:'f59e0b' },
    { nome:'Camila Rodrigues',  vendas:6,  credito:215000, cor:'10b981' },
  ];

  const supervisorDemo = { nome:'Ricardo Souza', vendas:3, credito:142000, cor:'8b5cf6' };

  function avatarUrl(nome, cor){
    return 'https://ui-avatars.com/api/?name='+encodeURIComponent(nome)+'&background='+cor+'&color=fff&size=128&bold=true';
  }

  // ── Nomes de clientes para vendas ───────────────────────────────
  const clientes = [
    'João Silva','Maria Santos','Pedro Costa','Ana Oliveira','Carlos Lima',
    'Fernanda Ribeiro','Rafael Mendes','Juliana Pereira','Marcos Souza','Patrícia Gomes',
    'Bruno Carvalho','Letícia Araújo','Diego Martins','Isabela Castro','Thiago Fernandes',
    'Amanda Nascimento','Felipe Barbosa','Gabriela Rocha','Leonardo Moreira','Vanessa Correia',
    'Gustavo Dias','Priscila Nunes','André Teixeira','Daniela Cardoso','Henrique Pinto',
    'Natália Vieira','Eduardo Lopes','Mariana Freitas','Fábio Cavalcanti','Raquel Azevedo'
  ];
  const valoresCredito = [85000,120000,95000,150000,68000,200000,45000,175000,110000,55000,130000,78000,160000,92000,140000];

  // ── Gerar vendas fake ───────────────────────────────────────────
  function gerarVendas(demoUsers){
    const vendas = [];
    let vi=0, ci=0;
    const hoje = new Date();
    demoUsers.forEach(function(u){
      for(var i=0; i<(u.vendas||0); i++){
        var dias = Math.floor(Math.random()*28);
        var dt = new Date(hoje); dt.setDate(dt.getDate()-dias);
        vendas.push({
          id:'demo-v-'+(vi),
          user_id: u.sb_id,
          lead_id: null,
          cliente_nome: clientes[ci % clientes.length],
          valor_credito: valoresCredito[vi % valoresCredito.length],
          data_fechamento: dt.toISOString().slice(0,10),
          created_at: dt.toISOString(),
          empresa_id:'demo',
          _demo:true
        });
        vi++; ci++;
      }
    });
    return vendas;
  }

  // ── Injetar tudo ────────────────────────────────────────────────
  function injetar(){
    if(window[DEMO]) return;
    var me = typeof getMe==='function' ? getMe() : null;
    if(!me) return;
    if(typeof isPlataforma!=='function' || !isPlataforma(me)) return;

    var empId = me.empresaId || window._empresaIdDireto || null;
    var demoIds = [];

    // Supervisor
    var sup = {
      id: window.nextUserId++, sb_id:'demo-sup-001',
      email:'ricardo.souza@demo.evolux.com',
      nome: supervisorDemo.nome, role:'supervisor',
      hierarquiaId:null, vendas: supervisorDemo.vendas, credito: supervisorDemo.credito,
      meta:200000, foto: avatarUrl(supervisorDemo.nome, supervisorDemo.cor),
      whatsapp:'', instagram:'', empresaId: empId, ativo:true, perms:{}, hperms:{}, _demo:true
    };
    users.push(sup);

    // Vendedores
    vendedoresDemo.forEach(function(v, i){
      var u = {
        id: window.nextUserId++, sb_id:'demo-user-'+String(i+1).padStart(3,'0'),
        email: v.nome.toLowerCase().replace(/\s+/g,'.')+'@demo.evolux.com',
        nome: v.nome, role:'vendedor',
        hierarquiaId:null, vendas: v.vendas, credito: v.credito,
        meta:150000, foto: avatarUrl(v.nome, v.cor),
        whatsapp:'', instagram:'', empresaId: empId, ativo:true, perms:{}, hperms:{}, _demo:true
      };
      users.push(u);
      demoIds.push(u.id);
    });

    // Equipes
    var eqs = [
      { nome:'Equipe Alfa',    descricao:'Time de alta performance',     membroIds:[demoIds[0], demoIds[1]], meta:500000 },
      { nome:'Equipe Bravo',   descricao:'Novos talentos em crescimento',membroIds:[demoIds[2], demoIds[3]], meta:400000 },
      { nome:'Equipe Charlie', descricao:'Equipe especializada',         membroIds:[demoIds[4]],             meta:300000 },
    ];
    eqs.forEach(function(eq){
      eq.id = window.nextEquipeId++;
      eq.supervisorId = sup.id;
      eq.gestorId = me.id;
      eq.representanteId = null;
      eq.status = 'ativa';
      eq.foto = null;
      eq.periodo = 'mensal';
      eq._demo = true;
      equipes.push(eq);
    });

    // Vendas demo
    var allDemo = [sup].concat(users.filter(function(u){ return u._demo && u.role==='vendedor'; }));
    window._demoVendasRows = gerarVendas(allDemo);

    window[DEMO] = true;
    console.log('[Demo] Injetado: '+vendedoresDemo.length+' vendedores, 1 supervisor, '+eqs.length+' equipes, '+window._demoVendasRows.length+' vendas.');
  }

  // ── Interceptar _renderTudo para injetar antes de renderizar ────
  var origRender = window._renderTudo;
  window._renderTudo = function(){
    injetar();
    if(origRender) return origRender.apply(this, arguments);
  };

  // ── Interceptar renderMinhasVendas para adicionar vendas demo ───
  var origMV = window.renderMinhasVendas;
  if(origMV){
    window.renderMinhasVendas = async function(){
      await origMV.apply(this, arguments);
      // Após o render original, injetar vendas demo no cache
      if(!window[DEMO] || !window._demoVendasRows) return;
      if(typeof _mvVendasCache==='undefined') return;
      var jaTem = _mvVendasCache.some(function(v){ return v._demo; });
      if(jaTem) return;
      var demoRows = window._demoVendasRows.map(function(v){
        var user = users.find(function(u){ return u.sb_id===v.user_id; }) || null;
        return Object.assign({}, v, {
          _clienteNome: v.cliente_nome||'—',
          _vendedorNome: user?user.nome:'—',
          _vendedorFoto: user?user.foto:null,
          _leadLocal: null,
          _userLocal: user
        });
      });
      _mvVendasCache.push.apply(_mvVendasCache, demoRows);
      if(typeof mvFiltrar==='function') mvFiltrar();
    };
  }

})();

// ─── DADOS DE DEMONSTRAÇÃO (somente perfil master / plataforma) ───────────────
// Monta uma operação fictícia completa para apresentar o CRM: vendedores, equipes,
// leads no funil, vendas, lances, agenda e atividades. Tudo sai de UMA lista de
// vendas, então painel, ranking, modo TV, minhas vendas, relatórios, funil e
// lances mostram sempre os mesmos números.
// Nada vai para o banco: fica só na memória desta aba. Mexer num dado de
// demonstração (mover lead, editar venda, lance, agenda) atualiza todas as telas,
// mas ao recarregar a página a demonstração volta ao estado original.
(function(){
  'use strict';
  console.log('[Demo] script carregando…');
  var DEMO = '__demoInjetado';
  var S = { users:[], equipes:[], leads:[], vendas:[], lances:[], eventos:[], acts:[], ultimaOp:0 };
  window._demo = S;

  // ── Utilitários ────────────────────────────────────────────────────────────
  function rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; var t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  var R = rng(20261028);
  function ri(a,b){ return a+Math.floor(R()*(b-a+1)); }
  function pick(arr){ return arr[Math.floor(R()*arr.length)]; }
  function pickPeso(map){ var tot=0,k; for(k in map) tot+=map[k]; var x=R()*tot; for(k in map){ x-=map[k]; if(x<=0) return k; } return k; }
  function d0(d){ var x=new Date(d); x.setHours(0,0,0,0); return x; }
  function addDias(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function br(d){ return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }
  function ativo(){ return !!window[DEMO]; }
  function ehDemoId(v){ return typeof v==='string' && v.indexOf('demo-')===0; }
  function userDemoPorSb(sb){ return S.users.find(function(u){ return u.sb_id===sb; })||null; }
  function marcarOp(){ S.ultimaOp=Date.now(); }
  function idade(ts){
    var m=Math.floor((Date.now()-ts)/60000);
    if(m<1) return 'Agora'; if(m<60) return m+'min atrás'; if(m<1440) return Math.floor(m/60)+'h atrás'; return Math.floor(m/1440)+'d atrás';
  }

  // Avatar de iniciais (reserva se a foto não carregar)
  function avatarIniciais(nome, cor){
    try{
      var c=document.createElement('canvas'); c.width=128; c.height=128;
      var x=c.getContext('2d'); x.fillStyle='#'+cor; x.fillRect(0,0,128,128);
      x.fillStyle='#fff'; x.font='bold 52px Arial, sans-serif'; x.textAlign='center'; x.textBaseline='middle';
      x.fillText(nome.split(' ').slice(0,2).map(function(p){return p[0];}).join('').toUpperCase(),64,68);
      return c.toDataURL('image/png');
    }catch(e){ return null; }
  }
  function tentarFotoReal(u,url){
    var img=new Image();
    img.onload=function(){ u.foto=url; S.vendasRowsCache=null; agendarRender(); };
    img.src=url;
  }

  // ── Equipe fictícia ────────────────────────────────────────────────────────
  // mes = vendas no mês atual, ant = vendas no mês anterior, pctMeta = quanto da meta bateu no mês
  var PESSOAS = [
    { nome:'Larissa Monteiro', role:'vendedor',   cor:'6366f1', foto:'https://randomuser.me/api/portraits/women/44.jpg', mes:14, ant:11, pctMeta:1.12, eq:0 },
    { nome:'Arthur Nogueira',  role:'vendedor',   cor:'0ea5e9', foto:'https://randomuser.me/api/portraits/men/32.jpg',   mes:11, ant:12, pctMeta:0.96, eq:0 },
    { nome:'Beatriz Ferreira', role:'vendedor',   cor:'ec4899', foto:'https://randomuser.me/api/portraits/women/68.jpg', mes:9,  ant:7,  pctMeta:0.84, eq:1 },
    { nome:'Lucas Almeida',    role:'vendedor',   cor:'f59e0b', foto:'https://randomuser.me/api/portraits/men/75.jpg',   mes:7,  ant:6,  pctMeta:0.71, eq:1 },
    { nome:'Camila Rodrigues', role:'vendedor',   cor:'10b981', foto:'https://randomuser.me/api/portraits/women/26.jpg', mes:6,  ant:5,  pctMeta:0.62, eq:2 },
    { nome:'Ricardo Souza',    role:'supervisor', cor:'8b5cf6', foto:'https://randomuser.me/api/portraits/men/46.jpg',   mes:3,  ant:4,  pctMeta:0.55, eq:2 }
  ];
  var EQUIPES = [
    { nome:'Equipe Alfa',    descricao:'Time de alta performance — foco em imóveis' },
    { nome:'Equipe Bravo',   descricao:'Automóveis e pesados' },
    { nome:'Equipe Charlie', descricao:'Novos consultores em desenvolvimento' }
  ];
  var NOMES = ['João','Maria','Pedro','Ana','Carlos','Fernanda','Rafael','Juliana','Marcos','Patrícia','Bruno','Letícia','Diego','Isabela','Thiago','Amanda','Felipe','Gabriela','Leonardo','Vanessa','Gustavo','Priscila','André','Daniela','Henrique','Natália','Eduardo','Mariana','Fábio','Raquel','Vinícius','Aline','Rodrigo','Tatiane','Paulo','Renata','Matheus','Bianca','Sérgio','Cristiane','Otávio','Débora','Igor','Elaine','Caio','Simone','Murilo','Viviane'];
  var SOBRENOMES = ['Silva','Santos','Oliveira','Souza','Lima','Pereira','Costa','Ribeiro','Martins','Carvalho','Gomes','Araújo','Melo','Barbosa','Rocha','Dias','Nunes','Teixeira','Cardoso','Pinto','Vieira','Lopes','Freitas','Cavalcanti','Azevedo','Moreira','Mendes','Castro','Fernandes','Correia','Batista','Duarte','Farias','Machado','Ramos','Moura','Campos','Siqueira','Prado','Queiroz'];
  var DDDS = ['11','11','11','19','21','31','41','47','51','61','62','71','81','85'];
  var OBS = { 'Imóvel':['Quer usar o FGTS no lance','Busca apartamento na planta','Comparando com financiamento','Quer carta para terreno'],
              'Automóvel':['Troca do carro no ano que vem','Quer SUV seminovo','Prefere parcela até R$ 1.500','Vai dar lance embutido'],
              'Moto':['Moto para trabalho','Primeira moto','Quer parcela baixa'],
              'Serviço':['Reforma da casa','Cirurgia planejada','Festa de casamento'] };

  var _nomesUsados = new Set();
  function nomeCliente(){
    for(var i=0;i<500;i++){ var n=pick(NOMES)+' '+pick(SOBRENOMES); if(!_nomesUsados.has(n)){ _nomesUsados.add(n); return n; } }
    return 'Cliente '+(_nomesUsados.size+1);
  }
  // prefixo 9 0xxx: formato de celular, mas fora das faixas em uso — ninguém real recebe mensagem por engano
  var _telSeq = 0;
  function telefone(){ _telSeq++; return '55'+pick(DDDS)+'90'+String(ri(1000000,9999999)); }
  function valorPorTipo(tipo){
    if(tipo==='Imóvel') return ri(18,60)*10000;      // R$ 180 mil a 600 mil
    if(tipo==='Automóvel') return ri(10,30)*5000;    // R$ 50 mil a 150 mil
    if(tipo==='Moto') return ri(15,40)*1000;         // R$ 15 mil a 40 mil
    return ri(3,12)*5000;                            // serviço: R$ 15 mil a 60 mil
  }
  var MIX = { 'Imóvel':40, 'Automóvel':42, 'Moto':11, 'Serviço':7 };
  var ORIGEM = { 'Meta Ads':62, 'Indicação':24, 'Orgânico':14 };
  var ABERTAS = { 'Novo lead':26, 'Primeiro contato':20, 'Aguardando resposta':14, 'Proposta enviada':20, 'Negociação':20 };

  // ── Geração ────────────────────────────────────────────────────────────────
  // Procura uma combinação em que o volume do mês siga a ordem da equipe
  // (quem vende mais vendas também tem mais crédito) — fica natural na apresentação.
  function gerarOrdenado(me){
    var base=20261028;
    for(var s=0;s<400;s++){
      R=rng(base+s); _nomesUsados=new Set(); _telSeq=0;
      S.users=[]; S.equipes=[]; S.leads=[]; S.vendas=[]; S.lances=[]; S.eventos=[]; S.acts=[];
      gerar(me);
      var h=new Date(), ini=iso(new Date(h.getFullYear(),h.getMonth(),1));
      var tot=S.users.map(function(u){ return S.vendas.filter(function(v){ return v.user_id===u.sb_id&&v.data_fechamento>=ini; }).reduce(function(a,v){ return a+v.valor_credito; },0); });
      var ok=tot.every(function(t,i){ return i===0||t<tot[i-1]; });
      if(ok) break;
    }
    S.users.forEach(function(u){ tentarFotoReal(u,u._p.foto); });
  }
  function gerar(me){
    var hoje=d0(new Date()), agora=new Date();
    var iniMes=new Date(hoje.getFullYear(),hoje.getMonth(),1);
    var iniAnt=new Date(hoje.getFullYear(),hoje.getMonth()-1,1);
    var diasMes=hoje.getDate();
    var diasAnt=new Date(hoje.getFullYear(),hoje.getMonth(),0).getDate();
    var empId=me.empresaId||window._empresaIdDireto||null;
    var nUser=9001, nEq=9001, nLead=900001, nVenda=1, nLance=900001, nEv=900001;
    var hierPorSlug=function(slug){ try{ var h=getHierBySlug(slug); return h?(h.sb_id||h.id):null; }catch(e){ return null; } };

    // pessoas
    PESSOAS.forEach(function(p,i){
      var u={ id:nUser++, sb_id:'demo-user-'+String(i+1).padStart(3,'0'),
        email:p.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'.')+'@demo.evolux.com.br',
        nome:p.nome, role:p.role, hierarquiaId:hierPorSlug(p.role), equipeId:null, managerId:null,
        vendas:0, credito:0, meta:0, foto:avatarIniciais(p.nome,p.cor), whatsapp:'', instagram:'',
        empresaId:empId, ativo:true, perms:{}, hperms:{}, _demo:true, _p:p };
      S.users.push(u);
    });

    // vendas = leads fechados (+ lance de cada uma)
    function criarVenda(u, dia, mesIni, hora){
      var tipo=pickPeso(MIX), valor=valorPorTipo(tipo);
      var dt=new Date(mesIni.getFullYear(),mesIni.getMonth(),dia,hora,ri(0,59));
      if(dt>agora) dt=new Date(agora.getTime()-ri(5,90)*60000);
      var criado=addDias(d0(dt),-ri(2,18)); if(criado<mesIni) criado=new Date(mesIni);
      var lead={ id:nLead++, sb_id:null, empresa_id:empId, empresaId:empId, nome:nomeCliente(), tel:telefone(), tipo:tipo,
        credito:valor, etapa:'Fechado / Convertido', etapaOriginal:null, origem:pickPeso(ORIGEM), atendimento:'finalizado',
        obs:pick(OBS[tipo]), admin:null, metaId:null, data:br(criado), entrada:iso(criado), responsavelId:u.id, responsavelSbId:u.sb_id, _demo:true };
      S.leads.push(lead);
      var v={ id:'demo-v-'+(nVenda++), user_id:u.sb_id, lead_id:'demo-lead-'+lead.id, _leadId:lead.id, cliente_nome:lead.nome,
        valor_credito:valor, data_fechamento:iso(dt), created_at:dt.toISOString(), empresa_id:empId, _demo:true };
      S.vendas.push(v);
      return {lead:lead, venda:v, dt:dt};
    }
    S.users.forEach(function(u){
      var p=u._p;
      for(var i=0;i<p.ant;i++){ criarVenda(u, Math.min(diasAnt, 1+Math.floor((i+R()*0.9)*diasAnt/p.ant)), iniAnt, ri(9,18)); }
      for(var j=0;j<p.mes;j++){
        var dia=Math.min(diasMes, 1+Math.floor((j+R()*0.9)*diasMes/p.mes));
        if(j===p.mes-1 && (u._p.eq===0)) dia=diasMes;        // Larissa e Arthur fecharam hoje
        criarVenda(u, dia, iniMes, dia===diasMes?Math.min(Math.max(agora.getHours()-1,8),18):ri(9,18));
      }
    });

    // leads em andamento e perdidos (volume de operação real: conversão perto de 20%)
    var JANELA={ 'Novo lead':[0,6], 'Primeiro contato':[1,15], 'Aguardando resposta':[3,50], 'Proposta enviada':[5,55], 'Negociação':[6,58], 'Perdido':[10,60] };
    S.users.forEach(function(u){
      var abertos=u.role==='supervisor'?ri(14,18):ri(30,42), perdidos=u.role==='supervisor'?ri(10,13):ri(22,30);
      for(var i=0;i<abertos+perdidos;i++){
        var etapa=i<abertos?pickPeso(ABERTAS):'Perdido';
        var jn=JANELA[etapa];
        var criado=addDias(hoje,-ri(jn[0],jn[1]));
        var tipo=pickPeso(MIX);
        S.leads.push({ id:nLead++, sb_id:null, empresa_id:empId, empresaId:empId, nome:nomeCliente(), tel:telefone(), tipo:tipo,
          credito:valorPorTipo(tipo), etapa:etapa, etapaOriginal:null, origem:pickPeso(ORIGEM),
          atendimento:etapa==='Novo lead'?'aguardando':etapa==='Perdido'?'finalizado':(R()<.7?'em_andamento':'aguardando'),
          obs:etapa==='Perdido'?pick(['Fechou com o banco','Sem condição no momento','Não respondeu mais','Achou a parcela alta']):pick(OBS[tipo]),
          admin:null, metaId:null, data:br(criado), entrada:iso(criado), responsavelId:u.id, responsavelSbId:u.sb_id, _demo:true });
      }
    });
    // mais novos primeiro (mesma ordem do banco)
    S.leads.sort(function(a,b){ return b.entrada<a.entrada?-1:b.entrada>a.entrada?1:b.id-a.id; });

    // lances: um por lead fechado (como o banco faz)
    S.vendas.slice().sort(function(a,b){ return a.created_at<b.created_at?-1:1; }).forEach(function(v,i){
      var lead=S.leads.find(function(l){ return l.id===v._leadId; });
      var dtV=new Date(v.created_at), doMes=dtV>=iniMes, x=R();
      var la={ id:nLance++, sb_id:null, leadId:lead.id, clienteNome:lead.nome, valor:lead.credito, pct:0, dataOferta:'', assem:'', obs:'',
        ofertado:false, _removido:false, _removidoManual:false, _auto:true, _demo:true };
      if(!doMes || x<.35){
        la.pct=ri(20,45); la.valor=Math.round(lead.credito*la.pct/100); la.ofertado=true;
        var dOf=addDias(d0(dtV),ri(5,20)); if(dOf>hoje) dOf=hoje; la.dataOferta=iso(dOf);
        la.assem='Assembleia '+br(addDias(dOf,3)).slice(0,5);
      } else if(x<.78){
        la.pct=ri(20,45); la.valor=Math.round(lead.credito*la.pct/100);
        var dO=addDias(hoje,pick([0,0,1,2,3,5,7,9,12])); la.dataOferta=iso(dO);
        la.assem='Assembleia '+br(addDias(dO,3)).slice(0,5);
        la.obs=pick(['Lance embutido de 25%','Lance livre com FGTS','Cliente confirmou recurso','']);
      } else {
        la.dataOferta=iso(hoje); la.assem='Próxima assembleia';
      }
      S.lances.push(la);
    });

    // agenda: reuniões com quem está em proposta/negociação + datas de lance
    var quentes=S.leads.filter(function(l){ return ['Proposta enviada','Negociação','Aguardando resposta'].indexOf(l.etapa)!==-1; });
    var dSemana=[0,0,1,1,2,3,4,6,8,-1,-2,-3];
    quentes.slice(0,dSemana.length).forEach(function(l,i){
      var d=addDias(hoje,dSemana[i]); if(d.getDay()===0) d=addDias(d,1);
      var h=ri(9,17); var resp=S.users.find(function(u){ return u.id===l.responsavelId; });
      S.eventos.push({ id:nEv++, sb_id:null, leadId:l.id, leadNome:l.nome, tipo:i%4===3?'followup':'reuniao', data:iso(d),
        horaIni:String(h).padStart(2,'0')+':00', horaFim:String(h+1).padStart(2,'0')+':00',
        obs:(resp?resp.nome.split(' ')[0]+' · ':'')+(l.etapa==='Negociação'?'Fechamento da proposta':'Apresentação da simulação'), userSbId:null, _demo:true });
    });
    S.lances.filter(function(la){ return la.pct&&!la.ofertado; }).slice(0,8).forEach(function(la){
      S.eventos.push({ id:nEv++, sb_id:null, leadId:la.leadId, leadNome:la.clienteNome, tipo:'lance', data:la.dataOferta,
        horaIni:'10:00', horaFim:'10:30', obs:'Ofertar lance de '+fmtR(la.valor)+' ('+la.pct+'%)', userSbId:null, _demo:true });
    });

    // equipes (supervisor Ricardo; ele também vende na Charlie)
    var sup=S.users.find(function(u){ return u.role==='supervisor'; });
    EQUIPES.forEach(function(e,i){
      var membros=S.users.filter(function(u){ return u._p.eq===i; });
      S.equipes.push({ id:nEq++, sb_id:null, nome:e.nome, descricao:e.descricao, supervisorId:sup.id, gestorId:me.id, representanteId:null,
        status:'ativa', membroIds:membros.map(function(u){ return u.id; }), foto:null, meta:0, periodo:'mensal', _demo:true });
    });

    recalcular();
    // metas: o quanto cada um já bateu no mês fica natural
    var mesIso=iso(iniMes);
    S.users.forEach(function(u){
      var noMes=S.vendas.filter(function(v){ return v.user_id===u.sb_id && v.data_fechamento>=mesIso; }).reduce(function(s,v){ return s+v.valor_credito; },0);
      u.meta=Math.max(100000, Math.round(noMes/u._p.pctMeta/50000)*50000);
    });
    S.equipes.forEach(function(eq){ eq.meta=eq.membroIds.reduce(function(s,id){ var u=S.users.find(function(x){ return x.id===id; }); return s+(u?u.meta:0); },0); });

    // atividades recentes
    var acts=[];
    S.vendas.forEach(function(v){
      var u=userDemoPorSb(v.user_id);
      acts.push({ ts:new Date(v.created_at).getTime(), icon:'ti-circle-check', text:v.cliente_nome+' fechado — '+fmtR(v.valor_credito), _userId:v.user_id });
    });
    S.leads.filter(function(l){ return l.etapa==='Novo lead'; }).forEach(function(l){
      var u=S.users.find(function(x){ return x.id===l.responsavelId; });
      var t=new Date(l.entrada+'T'+String(ri(8,19)).padStart(2,'0')+':'+String(ri(0,59)).padStart(2,'0')+':00').getTime();
      if(t>Date.now()) t=Date.now()-ri(3,120)*60000;
      acts.push({ ts:t, icon:'ti-user-plus', text:'Novo lead: '+l.nome+' → '+u.nome, _userId:u.sb_id });
    });
    S.leads.filter(function(l){ return l.etapa==='Negociação'; }).slice(0,6).forEach(function(l){
      var u=S.users.find(function(x){ return x.id===l.responsavelId; });
      acts.push({ ts:Date.now()-ri(30,60*30)*60000, icon:'ti-arrows-right-left', text:l.nome+': Proposta enviada → Negociação', _userId:u.sb_id });
    });
    S.lances.filter(function(la){ return la.pct&&!la.ofertado; }).slice(0,4).forEach(function(la){
      acts.push({ ts:Date.now()-ri(60,60*40)*60000, icon:'ti-gavel', text:'Lance cadastrado: '+la.clienteNome+' — '+fmtR(la.valor)+' ('+la.pct+'%)', _userId:null });
    });
    acts.sort(function(a,b){ return b.ts-a.ts; });
    S.acts=acts.slice(0,30).map(function(a){ return { icon:a.icon, text:a.text, time:idade(a.ts), _userId:a._userId, _demo:true, _ts:a.ts }; });
  }

  // Totais acumulados de cada pessoa = soma das vendas dela (ranking "desde o início" e relatórios)
  function recalcular(){
    S.users.forEach(function(u){
      var minhas=S.vendas.filter(function(v){ return v.user_id===u.sb_id; });
      u.vendas=minhas.length;
      u.credito=minhas.reduce(function(s,v){ return s+(Number(v.valor_credito)||0); },0);
    });
    // venda de lead de demonstração passada para alguém de verdade: o total dessa pessoa vem do servidor + demo
    S.vendasRowsCache=null;
  }
  function invalidar(){
    try{ window._invalidarRanking&&window._invalidarRanking(); }catch(e){}
    window._dnVendas=null; window._dashVendasCache=null;
  }
  var _rt=null;
  function agendarRender(){
    clearTimeout(_rt);
    _rt=setTimeout(function(){
      var ativa=document.querySelector('.content.active'); var id=ativa&&ativa.id?ativa.id.replace('tab-',''):'';
      try{
        if(id==='ranking') window._aplicarFiltroVendas&&window._aplicarFiltroVendas();
        else if(id==='minhasvendas') window.renderMinhasVendas&&window.renderMinhasVendas();
        else if(id==='dashboard') renderDashboard();
        else if(id==='funil') renderKanban();
        else if(id==='leads') renderTable();
        else if(id==='relatorios') renderRelatorios();
        else if(id==='lances') renderLances();
        else if(id==='calendario') renderCalendario();
      }catch(e){}
      try{ renderNotifPanel(); }catch(e){}
    },120);
  }
  function aposMudanca(){ marcarOp(); recalcular(); invalidar(); agendarRender(); }

  // Lead de demonstração excluído (funil, tabela, detalhe): a venda e o lance dele saem junto
  function podar(){
    if(!ativo()) return false;
    var ids=new Set(leads.map(function(l){ return l.id; }));
    var antes=S.vendas.length;
    for(var i=S.vendas.length-1;i>=0;i--){ var v=S.vendas[i]; if(v._leadId&&!ids.has(v._leadId)) S.vendas.splice(i,1); }
    lances.forEach(function(la){ if(la._demo&&!la._removido&&!ids.has(la.leadId)) la._removido=true; });
    for(var j=S.leads.length-1;j>=0;j--) if(!ids.has(S.leads[j].id)) S.leads.splice(j,1);
    if(S.vendas.length!==antes){ recalcular(); invalidar(); return true; }
    return false;
  }

  // Soma das vendas de demonstração num intervalo (mesmo formato do servidor)
  function agregado(de,ate){
    podar();
    var m={};
    S.vendas.forEach(function(v){
      var d=v.data_fechamento; if((de&&d<de)||(ate&&d>ate)) return;
      if(!m[v.user_id]) m[v.user_id]={user_id:v.user_id,vendas:0,credito:0};
      m[v.user_id].vendas++; m[v.user_id].credito+=Number(v.valor_credito)||0;
    });
    return Object.keys(m).map(function(k){ return m[k]; });
  }

  // ── Injeção ────────────────────────────────────────────────────────────────
  function injetar(){
    if(window[DEMO]) return;
    var me=typeof getMe==='function'?getMe():null;
    if(!me){ console.warn('[Demo] getMe() retornou null — demo não injeta'); return; }
    if(typeof isPlataforma!=='function'){ console.warn('[Demo] isPlataforma não existe'); return; }
    if(!isPlataforma(me)){ console.warn('[Demo] usuário não é plataforma — role:',me.role,'— demo não injeta'); return; }
    console.log('[Demo] injetando para',me.nome,'(role:'+me.role+')');
    window[DEMO]=true;
    gerarOrdenado(me);
    S.users.forEach(function(u){ users.push(u); });
    if(typeof window.nextUserId==='number') window.nextUserId=Math.max(window.nextUserId, ...users.map(function(u){ return (u.id||0)+1; }));
    S.equipes.forEach(function(e){ equipes.push(e); });
    S.users.forEach(function(u){ var eq=S.equipes.find(function(e){ return e.membroIds.indexOf(u.id)!==-1; }); u.equipeId=eq?eq.id:null; });
    S.leads.forEach(function(l){ leads.push(l); });
    // reordena: leads de demonstração e reais juntos, mais novos primeiro
    try{
      var chave=function(l){ return l.entrada||(l.data?l.data.split('/').reverse().join('-'):''); };
      leads.sort(function(a,b){ var x=chave(a),y=chave(b); return x<y?1:x>y?-1:0; });
    }catch(e){}
    S.lances.forEach(function(la){ lances.push(la); });
    try{ S.eventos.forEach(function(ev){ eventos.push(ev); }); }catch(e){}
    window.activities=S.acts.concat((window.activities||[]).filter(function(a){ return !a._demo; }));
    invalidar();
    console.log('[Demo] '+S.users.length+' pessoas, '+S.equipes.length+' equipes, '+S.leads.length+' leads, '+S.vendas.length+' vendas, '+S.lances.length+' lances, '+S.eventos.length+' compromissos.');
  }

  // ── Ganchos ────────────────────────────────────────────────────────────────
  function envolver(nome, fabrica){
    var orig=window[nome];
    if(typeof orig!=='function') return;
    window[nome]=fabrica(orig);
  }

  // Renderização: injeta antes do primeiro desenho
  envolver('_renderTudo', function(orig){ return function(){ injetar(); return orig.apply(this, arguments); }; });

  // Servidor: soma de vendas (painel, ranking, modo TV) e ações sobre pessoas de demonstração
  envolver('_rpc', function(orig){ return async function(nome, params){
    if(!ativo()) return orig.apply(this, arguments);
    params=params||{};
    if(nome==='crm_ranking_vendas'){
      var r=await orig.apply(this, arguments);
      var reais=(r&&!r.error&&Array.isArray(r.data))?r.data:[];
      var extra=agregado(params.p_de||null, params.p_ate||null);
      // venda de demonstração em nome de pessoa real: soma junto com a linha dela
      var porId={}; reais.forEach(function(x){ porId[x.user_id]=Object.assign({},x); });
      extra.forEach(function(x){ var a=porId[x.user_id]; if(a){ a.vendas=(Number(a.vendas)||0)+x.vendas; a.credito=(Number(a.credito)||0)+x.credito; } else porId[x.user_id]=x; });
      return { data:Object.keys(porId).map(function(k){ return porId[k]; }), error:null };
    }
    var temDemo=Object.keys(params).some(function(k){ var v=params[k]; return ehDemoId(v)||(Array.isArray(v)&&v.some(ehDemoId)); });
    if(!temDemo) return orig.apply(this, arguments);
    if(nome==='crm_atualizar_membro'){
      var u=userDemoPorSb(params.p_alvo);
      if(u){
        if(params.p_nome) u.nome=params.p_nome;
        if(typeof params.p_meta==='number') u.meta=params.p_meta;
        if(params.p_hierarquia){ u.hierarquiaId=params.p_hierarquia; try{ var h=getHier(params.p_hierarquia); if(h&&typeof slugToRole==='function') u.role=slugToRole(h); }catch(e){} }
        if(params.p_mudar_equipe){
          var sel=parseInt((document.getElementById('eu-equipe')||{}).value)||null;
          equipes.forEach(function(e){ e.membroIds=(e.membroIds||[]).filter(function(id){ return id!==u.id; }); });
          var alvo=sel?equipes.find(function(e){ return e.id===sel; }):null;
          if(alvo){ alvo.membroIds.push(u.id); if(alvo.sb_id){ (S.extraMembros=S.extraMembros||{})[alvo.sb_id]=(S.extraMembros[alvo.sb_id]||[]).concat(u.id); } }
          u.equipeId=alvo?alvo.id:null;
        }
        aposMudanca();
        return { data:true, error:null };
      }
    }
    return { data:null, error:{ message:'este é um dado de demonstração (não existe no banco)' } };
  }; });

  // Leads: lead de demonstração (ou lead novo atribuído a vendedor de demonstração) fica só aqui
  function sincronizarVendaDoLead(lead){
    var v=S.vendas.find(function(x){ return x._leadId===lead.id; });
    var resp=users.find(function(u){ return u.id===lead.responsavelId; });
    var fechado=lead.etapa==='Fechado / Convertido';
    if(fechado&&!v){
      var agora=new Date();
      v={ id:'demo-v-'+(S.vendas.length+1)+'-'+Date.now(), user_id:resp?resp.sb_id:null, lead_id:'demo-lead-'+lead.id, _leadId:lead.id,
          cliente_nome:lead.nome, valor_credito:Number(lead.credito)||0, data_fechamento:iso(agora), created_at:agora.toISOString(),
          empresa_id:lead.empresa_id, _demo:true };
      S.vendas.push(v);
      if(!S.lances.some(function(la){ return la.leadId===lead.id&&!la._removido; })){
        var la={ id:Math.max(900001,...lances.map(function(x){ return (x.id||0)+1; })), sb_id:null, leadId:lead.id, clienteNome:lead.nome,
          valor:Number(lead.credito)||0, pct:0, dataOferta:iso(agora), assem:'Próxima assembleia', obs:'', ofertado:false,
          _removido:false, _removidoManual:false, _auto:true, _demo:true };
        S.lances.push(la); lances.push(la);
      }
      lead.atendimento='finalizado';
    } else if(fechado&&v){
      v.valor_credito=Number(lead.credito)||0; v.cliente_nome=lead.nome; if(resp) v.user_id=resp.sb_id;
    } else if(!fechado&&v){
      S.vendas.splice(S.vendas.indexOf(v),1);
      lances.forEach(function(la){ if(la._demo&&la._auto&&la.leadId===lead.id&&!la.ofertado) la._removido=true; });
    }
    if(resp) lead.responsavelSbId=resp.sb_id;
  }
  envolver('_syncLead', function(orig){ return async function(lead){
    if(ativo()&&lead){
      var resp=users.find(function(u){ return u.id===lead.responsavelId; });
      if(!lead.sb_id&&!lead._demo&&resp&&resp._demo){ lead._demo=true; S.leads.push(lead); }
      if(lead._demo){ sincronizarVendaDoLead(lead); aposMudanca(); return true; }
    }
    return orig.apply(this, arguments);
  }; });

  // Transferir leads selecionados no funil
  envolver('transferirLeadsPara', function(orig){ return async function(ids,dest){
    if(!ativo()) return orig.apply(this, arguments);
    var demoLeads=ids.map(function(id){ return leads.find(function(x){ return x.id===id; }); }).filter(function(l){ return l&&l._demo; });
    var reais=ids.filter(function(id){ return !demoLeads.some(function(l){ return l.id===id; }); });
    if(dest&&dest._demo&&reais.length){ showToast('Leads reais não podem ir para um vendedor de demonstração.','ti-alert-triangle','#d97706'); return -1; }
    demoLeads.forEach(function(l){ l.responsavelId=dest.id; sincronizarVendaDoLead(l); });
    if(demoLeads.length) aposMudanca();
    var n=reais.length?await orig.call(this,reais,dest):0;
    return n<0?n:n+demoLeads.length;
  }; });

  // Vendas manuais / exclusão / última venda
  envolver('_registrarVendaManual', function(orig){ return async function(userSbId,valor,clienteNome){
    if(!ativo()||!ehDemoId(userSbId)) return orig.apply(this, arguments);
    var agora=new Date();
    var v={ id:'demo-v-m'+Date.now(), user_id:userSbId, lead_id:null, _leadId:null, cliente_nome:clienteNome||'Venda manual',
      valor_credito:valor||0, data_fechamento:iso(agora), created_at:agora.toISOString(), empresa_id:window._empresaIdDireto||null, _demo:true };
    S.vendas.push(v); aposMudanca();
    return { data:v, error:null };
  }; });
  envolver('_excluirVenda', function(orig){ return async function(id){
    if(!ativo()||!ehDemoId(String(id))) return orig.apply(this, arguments);
    var v=S.vendas.find(function(x){ return x.id===id; });
    if(!v) return { error:{ message:'venda não encontrada' } };
    S.vendas.splice(S.vendas.indexOf(v),1);
    if(v._leadId){
      var l=leads.find(function(x){ return x.id===v._leadId; });
      if(l&&l.etapa==='Fechado / Convertido'){ l.etapa='Negociação'; l.atendimento='em_andamento'; }
      lances.forEach(function(la){ if(la._demo&&la._auto&&la.leadId===v._leadId&&!la.ofertado) la._removido=true; });
    }
    aposMudanca();
    return { ok:true };
  }; });
  envolver('_ultimaVendaDe', function(orig){ return async function(userSbId){
    if(!ativo()||!ehDemoId(userSbId)) return orig.apply(this, arguments);
    var minhas=S.vendas.filter(function(v){ return v.user_id===userSbId; }).sort(function(a,b){ return a.created_at<b.created_at?1:-1; });
    return { data:minhas[0]||null, error:null };
  }; });

  // Minhas Vendas: as vendas de demonstração entram na lista (mesma lista do ranking)
  function linhasMV(){
    podar();
    var esc0=typeof _mvEscopo==='function'?_mvEscopo():{gestor:true};
    return S.vendas.filter(function(v){ return esc0.gestor||(esc0.ids||[]).indexOf(v.user_id)!==-1; }).map(function(v){
      var u=users.find(function(x){ return x.sb_id===v.user_id; })||null;
      return Object.assign({}, v, { _clienteNome:v.cliente_nome||'—', _vendedorNome:u?u.nome:'—', _vendedorFoto:u?u.foto:null, _leadLocal:null, _userLocal:u });
    });
  }
  function atualizarCacheMV(){
    if(typeof _mvVendasCache==='undefined') return;
    for(var i=_mvVendasCache.length-1;i>=0;i--) if(_mvVendasCache[i]._demo) _mvVendasCache.splice(i,1);
    Array.prototype.push.apply(_mvVendasCache, linhasMV());
    _mvVendasCache.sort(function(a,b){ var x=String(a.data_fechamento||''), y=String(b.data_fechamento||''); return x<y?1:x>y?-1:0; });
  }
  envolver('renderMinhasVendas', function(orig){ return async function(){
    await orig.apply(this, arguments);
    if(!ativo()) return;
    atualizarCacheMV();
    try{ mvFiltrar(); }catch(e){}
  }; });
  envolver('mvSalvarEdicao', function(orig){ return async function(vendaId){
    if(!ativo()||!ehDemoId(String(vendaId))) return orig.apply(this, arguments);
    var v=S.vendas.find(function(x){ return x.id===vendaId; }); if(!v) return;
    var nome=(document.getElementById('mve-nome')||{}).value; nome=nome?nome.trim():'';
    var valor=unM((document.getElementById('mve-valor')||{}).value||'');
    var data=(document.getElementById('mve-data')||{}).value||v.data_fechamento;
    if(!valor){ showToast('Informe o valor.','ti-alert-triangle','#d97706'); return; }
    v.cliente_nome=nome||v.cliente_nome; v.valor_credito=valor; v.data_fechamento=data;
    if(v._leadId){ var l=leads.find(function(x){ return x.id===v._leadId; }); if(l){ l.credito=valor; l.nome=v.cliente_nome; } }
    document.getElementById('mv-edit-modal')&&document.getElementById('mv-edit-modal').remove();
    window._saveAtividade&&window._saveAtividade('ti-pencil','Venda de '+v.cliente_nome+' alterada para '+fmtR(valor),v.user_id);
    showToast('Venda atualizada!','ti-check');
    aposMudanca(); atualizarCacheMV();
    try{ _mvInvalidarCacheEAtualizar(); }catch(e){ try{ mvFiltrar(); }catch(e2){} }
  }; });
  envolver('_mvExcluirVendaExec', function(orig){ return async function(vendaId){
    var r=await orig.apply(this, arguments);
    if(ativo()&&ehDemoId(String(vendaId))){ atualizarCacheMV(); try{ mvFiltrar(); }catch(e){} }
    return r;
  }; });

  // Telas que leem os leads e os totais direto: conferem antes se algum lead de demonstração foi excluído
  ['renderDashboard','renderRelatorios','renderLances'].forEach(function(nome){
    envolver(nome, function(orig){ return function(){ podar(); return orig.apply(this, arguments); }; });
  });
  envolver('renderRanking', function(orig){ return function(){
    if(podar()&&window._aplicarFiltroVendas){ window._aplicarFiltroVendas(); return; }
    return orig.apply(this, arguments);
  }; });

  // Lances e agenda de demonstração ficam só aqui
  envolver('_syncLance', function(orig){ return async function(la){
    if(ativo()&&la){
      var lead=leads.find(function(l){ return l.id===la.leadId; });
      if(la._demo||(lead&&lead._demo)){ la._demo=true; if(S.lances.indexOf(la)===-1) S.lances.push(la); marcarOp(); agendarRender(); return true; }
    }
    return orig.apply(this, arguments);
  }; });
  envolver('_syncEvento', function(orig){ return async function(ev){
    if(ativo()&&ev){
      var lead=leads.find(function(l){ return l.id===ev.leadId; });
      if(ev._demo||(lead&&lead._demo)){ ev._demo=true; if(S.eventos.indexOf(ev)===-1) S.eventos.push(ev); marcarOp(); return true; }
    }
    return orig.apply(this, arguments);
  }; });
  envolver('_loadEventos', function(orig){ return async function(){
    var r=await orig.apply(this, arguments);
    if(ativo()){ try{ S.eventos.forEach(function(ev){ if(eventos.indexOf(ev)===-1) eventos.push(ev); }); }catch(e){} }
    return r;
  }; });

  // Equipes: equipe de demonstração não vai ao banco; equipe real não grava membro de demonstração
  envolver('_syncEquipe', function(orig){ return async function(eq){
    if(!ativo()||!eq) return orig.apply(this, arguments);
    var ehDemoUser=function(id){ var u=users.find(function(x){ return x.id===id; }); return !!(u&&u._demo); };
    var membros=eq.membroIds||[];
    if(eq._demo||(!eq.sb_id&&membros.length&&membros.every(ehDemoUser))){
      eq._demo=true; if(!S.equipes.some(function(e){ return e.id===eq.id; })) S.equipes.push(eq); aposMudanca(); return true;
    }
    var demoMb=membros.filter(ehDemoUser);
    var copia=Object.assign({}, eq, { membroIds:membros.filter(function(id){ return !ehDemoUser(id); }),
      supervisorId:ehDemoUser(eq.supervisorId)?null:eq.supervisorId, representanteId:ehDemoUser(eq.representanteId)?null:eq.representanteId });
    var ok=await orig.call(this, copia);
    if(ok){ eq.sb_id=copia.sb_id; (S.extraMembros=S.extraMembros||{})[eq.sb_id]=demoMb; }
    return ok;
  }; });
  envolver('_loadEquipes', function(orig){ return async function(){
    var r=await orig.apply(this, arguments);
    if(ativo()&&S.extraMembros){
      equipes.forEach(function(e){ var extra=e.sb_id&&S.extraMembros[e.sb_id]; if(extra) extra.forEach(function(id){ if(e.membroIds.indexOf(id)===-1) e.membroIds.push(id); }); });
      users.forEach(function(u){ var eq=equipes.find(function(e){ return (e.membroIds||[]).indexOf(u.id)!==-1; }); u.equipeId=eq?eq.id:null; });
    }
    return r;
  }; });

  // Atividades: as que falam de dados de demonstração não vão para o histórico real
  function textoDeDemo(t){
    t=String(t||'');
    if(Date.now()-S.ultimaOp>4000) return false;
    return S.users.some(function(u){ return t.indexOf(u.nome)!==-1; })||S.leads.some(function(l){ return l.nome&&t.indexOf(l.nome)!==-1; });
  }
  envolver('_saveAtividade', function(orig){ return async function(icon,text,targetUserId){
    if(ativo()&&(ehDemoId(targetUserId)||textoDeDemo(text))){
      var a={ icon:icon, text:text, time:'Agora', _userId:targetUserId||null, _demo:true, _ts:Date.now() };
      S.acts.unshift(a);
      if(window.activities) window.activities.unshift(a);
      try{ renderNotifPanel(); }catch(e){}
      return;
    }
    return orig.apply(this, arguments);
  }; });
  envolver('_loadAtividades', function(orig){ return async function(){
    var r=await orig.apply(this, arguments);
    if(ativo()){
      S.acts.forEach(function(a){ a.time=idade(a._ts); });
      window.activities=S.acts.concat((window.activities||[]).filter(function(a){ return !a._demo; }));
      try{ renderNotifPanel(); }catch(e){}
    }
    return r;
  }; });

  console.log('[Demo] wrappers instalados — _renderTudo:',typeof window._renderTudo,', _rpc:',typeof window._rpc);
})();

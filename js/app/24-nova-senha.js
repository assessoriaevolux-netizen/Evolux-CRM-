async function salvarNovaSenha(){
  var senha = document.getElementById('nova-senha-input').value;
  var confirma = document.getElementById('nova-senha-confirma').value;
  var errEl = document.getElementById('nova-senha-err');
  var btnTxt = document.getElementById('btn-nova-senha-txt');
  errEl.style.display='none';
  if(!senha||senha.length<6){ errEl.textContent='A senha deve ter pelo menos 6 caracteres.'; errEl.style.display='block'; return; }
  if(senha!==confirma){ errEl.textContent='As senhas não coincidem.'; errEl.style.display='block'; return; }
  btnTxt.textContent='Salvando...';
  document.getElementById('btn-salvar-nova-senha').disabled=true;
  var res = await window._sb.auth.updateUser({password: senha});
  if(res.error){
    errEl.textContent='Erro ao salvar senha. Tente novamente.';
    errEl.style.display='block';
    btnTxt.textContent='Salvar nova senha';
    document.getElementById('btn-salvar-nova-senha').disabled=false;
    return;
  }
  // Sucesso — fecha modal e redireciona para login
  document.getElementById('modal-nova-senha').style.display='none';
  await window._sb.auth.signOut();
  window.location.href='index.html';
}

async function openAbout(automatic=false){
  const info=await api('releaseInfo');
  if(automatic&&!info.showUpdate)return;
  const dialog=$('#about-dialog');
  $('#about-title').textContent=automatic?'本次更新':'关于与更新';
  $('#about-version').textContent='WordDesk · v'+info.version;
  $('#about-date').textContent=info.date;
  $('#about-changes').innerHTML=info.changes.map(text=>'<li>'+esc(text)+'</li>').join('');
  $('#about-error').textContent='';
  dialog.showModal();I18n.update();layout();
}
async function closeAbout(){
  const button=$('#about-close');button.disabled=true;
  try{await api('acknowledgeRelease');$('#about-dialog').close();layout();}
  catch(e){$('#about-error').textContent='未能保存更新提示状态，请重试关闭。';}
  finally{button.disabled=false;}
}
function bindAbout(){
  $('#open-about').onclick=()=>run(()=>openAbout());
  $('#about-close').onclick=closeAbout;
  $('#about-dialog').addEventListener('cancel',event=>{event.preventDefault();closeAbout();});
  $('#copy-version').onclick=()=>run(async()=>{await api('copyVersion');toast('版本信息已复制');});
}

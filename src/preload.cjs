const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('desk',{
  filePath:file=>webUtils.getPathForFile(file),
  invoke:(method,...args)=>ipcRenderer.invoke('desk',method,...args),
  onWorkKey:callback=>ipcRenderer.on('work-key',(_e,key)=>callback(key)),
  onStatus:callback=>ipcRenderer.on('status',(_e,data)=>callback(data))
});

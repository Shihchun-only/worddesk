(function(root){
  function senseContext(senses,index){
    const sense=senses[index];
    const parentSection=(sense.section||'').replace(/\s+(also|specifically|especially)$/i,'');
    if(parentSection!==sense.section){
      for(let i=index-1;i>=0;i--){
        const parent=senses[i];
        if(parent.pos===sense.pos&&parent.section===parentSection)return parent.editedDefinition??parent.definition;
      }
    }
    return sense.context||'';
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={senseContext};
  else root.senseContext=senseContext;
})(globalThis);

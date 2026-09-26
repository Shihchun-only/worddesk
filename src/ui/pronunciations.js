(function(root){
  const slash=value=>'/'+String(value||'').trim().replace(/^[/\\]+|[/\\]+$/g,'')+'/';
  function displayPronunciationGroups(entry){
    if(entry.source!=='cambridge')return entry.pronunciationGroups||[];
    const seen=new Set();
    const groups=entry.pronunciationGroups?.length?entry.pronunciationGroups:(entry.pronunciations||[]).map(p=>({form:p.form||entry.headword||'',region:p.region,items:[p]}));
    return groups.map(g=>{const region=({'英式':'UK','美式':'US',uk:'UK',us:'US'})[g.region]||g.region;return {...g,region,items:g.items.filter(p=>{const key=JSON.stringify([g.form,region,p.value,p.label||'',p.suffix||'']);if(seen.has(key))return false;seen.add(key);return true;})};}).filter(g=>g.items.length);
  }
  function pronunciationText(entry,{includeSource=true}={}){
    if(entry.pronunciationGroups?.length)return entry.pronunciationGroups.map(g=>`${g.form} (${[includeSource?(entry.source==='mw'?'MW':'剑桥'):'',g.pos,includeSource?g.edition:'',g.region==='MW'?'':g.region].filter(Boolean).join(' · ')}) ${g.items.map(p=>[p.label,slash(p.value),p.suffix].filter(Boolean).join(' ')).join(' ')}`).join('\n');
    return entry.pronunciations.map(p=>[includeSource?p.region:(/MW|剑桥|Cambridge/i.test(p.region||'')?'':p.region),p.form,p.label,slash(p.value),p.suffix].filter(Boolean).join(' ')).join('\n');
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={slash,pronunciationText,displayPronunciationGroups};
  else {root.displayPronunciationGroups=displayPronunciationGroups;root.pronunciationSlash=slash;root.pronunciationText=pronunciationText;}
})(globalThis);

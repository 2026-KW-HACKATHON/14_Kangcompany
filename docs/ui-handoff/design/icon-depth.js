/* Shared depth treatment for the existing SVG illustration library. */
(() => {
  const ns='http://www.w3.org/2000/svg',enhanced=new WeakSet();let serial=0;
  function enhance(root=document){
    const illustrations=[...(root.querySelectorAll?.('svg.art,svg.mini-art')||[])];
    if(root.matches?.('svg.art,svg.mini-art'))illustrations.unshift(root);
    for(const svg of illustrations){
      if(enhanced.has(svg))continue;
      enhanced.add(svg);
      // Cloned selections need fresh IDs so their gradient does not refer to another tile.
      for(const oldDefs of [...svg.children].filter(x=>x.tagName.toLowerCase()==='defs'&&x.querySelector('linearGradient[id^="wolgye-depth-"]')))oldDefs.remove();
      const id='wolgye-depth-'+(++serial);svg.dataset.depthIcon='ready';
      const defs=document.createElementNS(ns,'defs');defs.dataset.wolgyeDepth='true';
      for(const [name,top,bottom] of [['main','--icon-main-top','--icon-main-bottom'],['back','--icon-back-top','--icon-back-bottom'],['muted','--icon-muted-top','--icon-muted-bottom']]){
        const gradient=document.createElementNS(ns,'linearGradient');gradient.id=id+'-'+name;
        gradient.setAttribute('x1','15%');gradient.setAttribute('y1','0%');gradient.setAttribute('x2','75%');gradient.setAttribute('y2','100%');
        for(const [offset,token] of [['0%',top],['100%',bottom]]){const stop=document.createElementNS(ns,'stop');stop.setAttribute('offset',offset);stop.style.stopColor='var('+token+')';gradient.appendChild(stop);}
        defs.appendChild(gradient);svg.style.setProperty('--icon-'+name+'-paint','url(#'+gradient.id+')');
      }
      svg.prepend(defs);
    }
  }
  window.WolgyeIcons={enhance};enhance();
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)enhance(node);});
  observer.observe(document.body,{childList:true,subtree:true});
})();


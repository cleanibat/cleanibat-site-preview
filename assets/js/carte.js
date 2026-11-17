(() => {
  // Chaque ville : [nom, x SVG, y SVG, département]. Données géographiques intégrées.
  // Les puces .city-chip (button, a ou span) sont reliées aux repères par data-city (sinon leur texte).
  // Un clic sur une puce <a> suit le lien ; le survol et le focus mettent toujours la carte en surbrillance.
  const base='Lille';
  const villes=[["Lens",536.34,122.67,"Pas-de-Calais (62)"],["Arras",533.15,134.49,"Pas-de-Calais (62)"],["Béthune",524.71,113.76,"Pas-de-Calais (62)"],["Lille",550.73,105.05,"Nord (59)"],["Douai",551.31,128.01,"Nord (59)"],["Courrières",543.23,120.09,"Pas-de-Calais (62)"],["Hénin-Beaumont",543.25,123.53,"Pas-de-Calais (62)"],["Liévin",533.5,123.35,"Pas-de-Calais (62)"],["Carvin",543.95,117.2,"Pas-de-Calais (62)"],["Valenciennes",578.01,128.88,"Nord (59)"],["Cambrai",560.6,144.76,"Nord (59)"],["Boulogne-sur-Mer",463.01,96.76,"Pas-de-Calais (62)"],["La Chapelle-d'Armentières",540.25,101.32,"Nord (59)"],["Bailleul",530.49,95.48,"Nord (59)"],["Steenbecque",515.48,101.27,"Nord (59)"]];
  const fixedView=[454,53,194.34,151];
  const ns='http://www.w3.org/2000/svg';
  document.querySelectorAll('.cb-zone').forEach(root=>{
    if(root.dataset.initialized)return;root.dataset.initialized='true';
    const svg=root.querySelector('.cb-svg'),stage=root.querySelector('.cb-stage'),points=root.querySelector('.cb-points');
    const tooltip=root.querySelector('.cb-tooltip'),status=root.querySelector('[role="status"]');
    const chipByCity=new Map();root.querySelectorAll('.city-chip').forEach(c=>{const k=(c.dataset.city||c.textContent).trim();if(!chipByCity.has(k))chipByCity.set(k,c);});
    const buttons=villes.map(([name])=>chipByCity.get(name)||null),pins=[],pinScales=[];
    let hovered=null,focused=null,touched=null,active=null,lastPointer='';
    const make=(tag,attrs)=>{const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el;};
    villes.forEach(([name,x,y],i)=>{
      const location=make('g',{class:'cb-location',transform:`translate(${x} ${y})`,role:'button',tabindex:'0','aria-label':name});
      // Éviter que les cibles des communes voisines se recouvrent autour de Lens.
      const nearest=Math.min(...villes.filter((_,j)=>j!==i).map(([,vx,vy])=>Math.hypot(x-vx,y-vy)));
      const hitRadius=Math.min(4.3,nearest*.47);
      const hit=make('circle',{class:'cb-hit',cx:0,cy:0,r:hitRadius,fill:'transparent'});
      const dot=make('circle',{class:'cb-dot',cx:0,cy:0,r:Math.min(2.1,hitRadius*.8)});
      const halo=make('ellipse',{class:'cb-halo',cx:0,cy:0,rx:8,ry:3});
      const pin=make('g',{class:'cb-pin'});
      pin.append(make('path',{d:'M -1.5 -29 L 0 0 L 1.5 -29 Z',fill:'#ffffff',stroke:'#101d38','stroke-width':.8}),make('circle',{cx:0,cy:-33,r:5.5,fill:'#ffffff',stroke:'#101d38','stroke-width':1.2}),make('circle',{cx:-1,cy:-34,r:2,fill:'#eaf4e0'}));
      const size=make('g',{});size.append(halo,pin);location.append(hit,dot,size);points.append(location);pins.push(location);pinScales.push(size);
      const button=buttons[i];
      [button,location].forEach(control=>{
        if(!control)return;
        control.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){hovered=i;render();}});
        control.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'){hovered=null;render();}});
        control.addEventListener('pointerdown',e=>{lastPointer=e.pointerType;focused=null;if(e.pointerType!=='touch')touched=null;});
        control.addEventListener('focus',()=>{if(control.matches(':focus-visible')){focused=i;render();}});
        control.addEventListener('blur',()=>{focused=null;render();});
        control.addEventListener('click',e=>{
          if(lastPointer==='touch'&&e.detail!==0){touched=touched===i?null:i;hovered=null;focused=null;render();}
          else if(e.detail===0){focused=i;render();}
        });
      });
      location.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hovered=touched=null;focused=i;render();}});
    });
    function pinSize(){return Math.pow(fixedView[2]/1000,.55);}
    function resizePins(){pinScales.forEach(el=>el.setAttribute('transform',`scale(${pinSize()})`));}
    function position(){
      if(active===null)return;
      const [,x,y]=villes[active],p=svg.createSVGPoint();p.x=x;p.y=y-43*pinSize();
      const matrix=svg.getScreenCTM();if(!matrix)return;
      const screen=p.matrixTransform(matrix),box=stage.getBoundingClientRect(),half=tooltip.offsetWidth/2+6;
      tooltip.style.left=Math.max(half,Math.min(box.width-half,screen.x-box.left))+'px';
      tooltip.style.top=screen.y-box.top+'px';
    }
    function render(){
      const next=hovered??focused??touched;if(next===active)return;active=next;
      pins.forEach((pin,i)=>pin.classList.toggle('is-active',i===active));
      buttons.forEach((button,i)=>button&&button.classList.toggle('is-active',i===active));
      tooltip.classList.toggle('is-visible',active!==null);
      if(active!==null){const [name,,,dept]=villes[active];tooltip.querySelector('strong').textContent=name;tooltip.querySelector('small').textContent=name===base?'Notre siège':dept;status.textContent=name+' — '+(name===base?'notre siège':dept);position();}
      else status.textContent='';
    }
    root.addEventListener('keydown',e=>{
      lastPointer='';
      if(e.key==='Escape'){hovered=focused=touched=null;render();}
      if(e.key==='Tab'){hovered=touched=null;render();}
    });
    root.addEventListener('pointerdown',e=>{if(!e.target.closest('.city-chip,.cb-location')){hovered=focused=touched=null;render();}});
    resizePins();
    new ResizeObserver(position).observe(stage);
  });
})();

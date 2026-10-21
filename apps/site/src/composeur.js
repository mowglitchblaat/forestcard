// ---------- Composeur de carte : le dessin seul + cadre + écriteau + chiffres → les deux images de la carte ----------
// Partagé par l'admin (index.html) et l'atelier (atelier.html) : apps/site/build.ts l'insère dans les deux pages.
// Lit lignesEcriteau et COULEURS_CAT (packages/describe, livrés par le build).
// Le dessin et ses réglages sont gardés sur la version Standard (variantes_carte.dessin_path, .compo : 29-composition-cartes.sql) :
// l'image est refaite toute seule quand la carte change (stats, ultime, passifs, rareté).
const CPO=(()=>{
 const W=1488,H=2070,BANDE={ggez:[1294,1789],legendaire:[1349,1848],epique:[1200,1708],rare:[1094,1651],commun:[1430,1700],magie:[1610,2025],piege:[1690,2025]},ZONE_HAUT=1100;   // magie, piège : la zone libre du cadre sous la fenêtre du dessin
 const POLICES=['Lilita One','Russo One','Bangers','Cinzel Decorative','Pirata One','Metamorphous','Arial Black'];
 const DEF={police:'Lilita One',style:'pastille',taille:100,decal:0,marge:55,daUlt:true,lueur:false,details:true,dtaille:100,z:1,sx:1,sy:1,x:0,y:0,textes:null,dtextes:null};
 let polices=null;const chargerPolices=()=>polices||(polices=new Promise(ok=>{const l=document.createElement('link');l.rel='stylesheet';
  l.href='https://fonts.googleapis.com/css2?family=Lilita+One&family=Russo+One&family=Bangers&family=Cinzel+Decorative:wght@900&family=Pirata+One&family=Metamorphous&display=swap';
  l.onload=()=>Promise.all(POLICES.slice(0,6).map(p=>document.fonts.load(`80px "${p}"`).catch(()=>{}))).then(ok,ok);l.onerror=ok;document.head.appendChild(l);setTimeout(ok,4000)}));
 const imgs={};const charge=src=>imgs[src]||(imgs[src]=new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src}));
 const ALEA=['#f43f5e','#f59e0b','#22c55e','#3b82f6','#a855f7'];
 // couleur de texte d'une catégorie sur l'écriteau : sa couleur du catalogue ; les fonds sombres passent à leur couleur claire, « autre » en blanc
 const eclaircir=h=>{const v=parseInt(h.slice(1),16),r=v>>16,g=v>>8&255,b=v&255,l=(.2126*r+.7152*g+.0722*b)/255;if(l>.45)return h;const t=.45-l+.15,m=x=>Math.round(x+(255-x)*t);return `rgb(${m(r)},${m(g)},${m(b)})`};   // texte lisible sur l'écriteau
 const coul=c=>{const s=COULEURS_CAT[c]||COULEURS_CAT.autre;return c==='autre'?'#f4f4f5':['ultime','fatigue','rage','exec'].includes(c)?s.color:/^#[0-9a-f]{6}$/i.test(s.background)?eclaircir(s.background):s.background};
 const pastille=c=>(COULEURS_CAT[c]||COULEURS_CAT.autre);
 const rr=(x,a,b,w,h,r)=>{x.beginPath();x.moveTo(a+r,b);x.arcTo(a+w,b,a+w,b+h,r);x.arcTo(a+w,b+h,a,b+h,r);x.arcTo(a,b+h,a,b,r);x.arcTo(a,b,a+w,b,r);x.closePath()};
 const RANGS=['ggez','legendaire','epique','rare','commun'];   // le même rang que le site (rangRar) : d'après le nom de la rareté
 const tierDe=r=>{const n=String((r&&r.nom)||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');return RANGS.find(k=>n.includes(k))||'commun'};
 // les lignes de l'écriteau : automatiques (ultime puis passifs), ou le texte de l'admin ligne par ligne (la couleur suit l'effet de la même ligne)
 function lignes(carte,o){const auto=lignesEcriteau(carte);let L=auto;
  if(o.textes)L=o.textes.map((t,i)=>({t,c:(auto[i]||{}).c||'autre',ult:!!(auto[i]||{}).ult,d:(auto[i]||{}).d||'',types:(auto[i]||{}).types||[]}));
  if(o.dtextes)L=L.map((l,i)=>({...l,d:o.dtextes[i]??l.d}));
  return L.filter(l=>l.t.trim())}
 async function ecriteau(x,tier,L,o){const [y0,y1]=BANDE[tier],k=o.taille/100,police=s=>`${o.police==='Arial Black'?'900 ':''}${s}px "${o.police}","Arial Black",sans-serif`;
  const zone=tier==='magie'||tier==='piege',expl=o.details!==false&&L.some(l=>l.d&&l.d.trim()),maxW=W*.86,pst=o.style==='pastille',hmax=zone?(y1-ZONE_HAUT)*.92:expl?Math.min(860,H*.42):(y1-y0)*.86;
  const dfont=s=>`700 ${s}px "Segoe UI","Helvetica Neue",Arial,sans-serif`;
  // retour à la ligne d'une explication (4 lignes au plus, la dernière coupée par « … »)
  const wrap=(t,s,max)=>{x.font=dfont(s);const out=[];let cur='';for(const m of t.split(/\s+/)){const tt=cur?cur+' '+m:m;if(x.measureText(tt).width>max&&cur){out.push(cur);cur=m}else cur=tt}if(cur)out.push(cur);
   if(out.length>4){let z=out.slice(0,4),d=z[3];while(d.length&&x.measureText(d+' …').width>max)d=d.replace(/\s*\S+$/,'');z[3]=d+' …';return z}return out};
  // mise en page à l'échelle f : titres (ultime plus grand), explications en petit sous chaque titre
  const plan=f=>{const tU=150*k*f,tP=116*k*f,ds=64*k*f*(o.dtaille||100)/100,gap=26*k*f;
   const P=L.map(l=>{const da=l.ult&&o.daUlt,pt=pst&&!da,fn=v=>(da?'italic ':'')+police(v);let s=l.ult?tU:tP;x.font=fn(s);while(x.measureText(l.t).width>maxW*(pt?.9:1)&&s>30){s-=4;x.font=fn(s)}
    const th=s*(pt?1.25:1.02),dl=expl&&l.d&&l.d.trim()?wrap(l.d.trim(),ds,maxW*.96):[],dh=dl.length?ds*.3+dl.length*ds*1.18:0;return {l,da,pt,fn,s,th,dl,dh}});
   return {P,ds,gap,tot:P.reduce((a,p)=>a+p.th+p.dh,0)+gap*Math.max(0,P.length-1)}};
  let f=1,pl=plan(f);while(pl.tot>hmax&&f>.4){f*=.95;pl=plan(f)}
  const {P,ds,gap,tot}=pl;let cy0=(y0+y1)/2+o.decal;const m=o.marge*k;
  if(zone)cy0=Math.min(Math.max(cy0,ZONE_HAUT+tot/2+m*.4),y1-tot/2-m*.4);   // dans la zone libre du cadre, ou plus haut sur le dessin si le texte est grand ou déplacé
  else if(L.length&&cy0+tot/2+m>1800)cy0=1800-tot/2-m;   // l'écriteau ne descend pas sur le bas du cadre ni sur les chiffres
  const e0=L.length?cy0-tot/2-m:y0,e1=L.length?cy0+tot/2+m:y1;
  if(zone){if(L.length){x.save();rr(x,W*.05,cy0-tot/2-m*.4,W*.9,tot+m*.8,40);x.fillStyle='rgba(6,6,10,.55)';x.fill();x.restore()}}
  else if(tier==='commun'){const g=x.createLinearGradient(0,e0,0,e1);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.18,'rgba(8,10,9,.76)');g.addColorStop(.82,'rgba(8,10,9,.76)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,e0,W,e1-e0)}
  else{const p=await charge(`cadres/ecriteau-${tier}.png`);if(p)x.drawImage(p,0,y0,W,y1-y0,0,e0,W,e1-e0)}
  let y=cy0-tot/2;x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';const Z=[];   // zones de chaque ligne (en fraction de la carte) : l'overlay de combat les allume
  for(const {l,da,pt,fn,s,th,dl,dh} of P){const cy=y+th/2;x.font=fn(s);const tw=x.measureText(l.t).width;
   {const lw=Math.min(maxW,Math.max(tw+s*1.2,dl.length?maxW*.96:0)),y0z=y-gap*.35,h=th+dh+gap*.7;Z.push({types:l.types||[],ult:!!l.ult,c:l.c,col:pastille(l.c).background,x:+((W/2-lw/2)/W).toFixed(4),y:+(y0z/H).toFixed(4),w:+(lw/W).toFixed(4),h:+(h/H).toFixed(4)})}
   const grad=w=>{const g=x.createLinearGradient(W/2-w/2,0,W/2+w/2,0);ALEA.forEach((c,i)=>g.addColorStop(i/(ALEA.length-1),c));return g};
   if(da){if(o.lueur){x.save();x.shadowColor='rgba(255,40,30,.9)';x.shadowBlur=s*.4;x.fillStyle='#7a001c';x.fillText(l.t,W/2,cy);x.restore()}
    x.lineWidth=s*.07;x.strokeStyle='#d0132f';x.strokeText(l.t,W/2,cy);x.fillStyle='#7a001c';x.fillText(l.t,W/2,cy)}
   else if(pt){const C=pastille(l.c),pw=tw+s*1.1,ph=s*1.18;x.save();x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=s*.25;x.shadowOffsetY=s*.06;rr(x,W/2-pw/2,cy-ph/2,pw,ph,ph/2);
    x.fillStyle=l.c==='alea'?grad(pw):C.background;x.fill();x.restore();
    if(C.border){rr(x,W/2-pw/2,cy-ph/2,pw,ph,ph/2);x.lineWidth=s*.05;x.strokeStyle=C.border.split(' ').pop();x.stroke()}
    x.fillStyle=C.color;x.fillText(l.t,W/2,cy+s*.04)}   // texte net : pas de contour (le contour semi-transparent bavait sur les lettres)
   else{x.save();x.shadowColor='rgba(0,0,0,.6)';x.shadowBlur=s*.18;x.shadowOffsetY=s*.05;x.lineWidth=s*.2;x.strokeStyle='#0b0b0f';x.strokeText(l.t,W/2,cy);x.restore();
    x.fillStyle=l.c==='alea'?grad(tw):coul(l.c);x.fillText(l.t,W/2,cy)}
   y+=th;
   if(dl.length){x.font=dfont(ds);let yy=y+ds*.3+ds*.59;for(const t of dl){x.lineWidth=ds*.2;x.strokeStyle='rgba(8,8,12,.95)';x.strokeText(t,W/2,yy);x.fillStyle='#ffffff';x.fillText(t,W/2,yy);yy+=ds*1.18}y+=dh}
   y+=gap}
  return Z}
 // la carte entière, à la taille des cadres (1488 × 2070)
 async function rendre(x,args){const {dessin,carte,tier,o,chiffres}=args;await chargerPolices();x.clearRect(0,0,W,H);x.fillStyle='#14141c';x.fillRect(0,0,W,H);
  if(dessin){const s=Math.max(W/dessin.naturalWidth,H/dessin.naturalHeight)*o.z,w=dessin.naturalWidth*s*(o.sx||1),h=dessin.naturalHeight*s*(o.sy||1);x.drawImage(dessin,(W-w)/2+o.x*W,(H-h)/2+o.y*H,w,h)}
  let Z=[];const comb=carte.type==='combattant',LL=(args.lignes||lignes(carte,o)).filter(l=>l.t&&l.t.trim());if(comb&&LL.length)Z=await ecriteau(x,tier,LL,o);   // sans effet : pas d'écriteau
  for(const src of [`cadres/${carte.type}-${tier}.png`,...['legendaire','epique','rare','commun'].map(r=>`cadres/${carte.type}-${r}.png`),`cadres/combattant-${tier}.png`]){const f=await charge(src);if(f){x.drawImage(f,0,0,W,H);break}}
  if(!comb&&LL.length)Z=await ecriteau(x,carte.type==='piege'?'piege':'magie',LL,o);   // magie, piège : pas d'écriteau (charte), le texte va dans la zone libre du cadre, sous le dessin
  if(chiffres&&comb){const num=(v,cx,c)=>{if(v==null||v==='')return;const s=150;x.font=`900 ${s}px "Arial Black",sans-serif`;x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';
   x.lineWidth=s*.16;x.strokeStyle='#fff';x.strokeText(String(v),cx,H*.925);x.fillStyle=c;x.fillText(String(v),cx,H*.925)};num(carte.atq,W*.13,'#e0303c');num(carte.pv,W*.87,'#4747d6')}
  return Z}
 // image finale : réduite en haute qualité à 1440 px de haut, WebP 94 % (texte net ; la compression standard du site bavait sur les lettres)
 const FH=1440,FW=Math.round(W*FH/H);
 const blob=c=>{const r=document.createElement('canvas');r.width=FW;r.height=FH;const g=r.getContext('2d');g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(c,0,0,FW,FH);   // 2070 → 1440 : une seule étape, en haute qualité
  return new Promise(ok=>r.toBlob(ok,'image/webp',.94))};
 // les deux images de la carte (avec / sans chiffres ; sans chiffres seulement pour un combattant)
 async function images(args){const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  const zones=await rendre(x,{...args,chiffres:true});const a=await blob(c);let b=null;
  if(args.carte.type==='combattant'){await rendre(x,{...args,chiffres:false});b=await blob(c)}
  const f=(bl,n)=>bl?new File([bl],n,{type:'image/webp'}):null;return {carte:f(a,'carte.webp'),combat:f(b,'combat.webp'),zones}}
 const dessinDe=async src=>{try{const r=await fetch(src,{mode:'cors'});if(!r.ok)return null;const u=URL.createObjectURL(await r.blob());return await new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=u})}catch(e){return null}};
 // l'aperçu : le canvas prend la taille affichée (× densité de l'écran), l'image y est réduite en haute qualité
 const taille=cv=>{const r=cv.getBoundingClientRect(),d=Math.min(2,window.devicePixelRatio||1),w=Math.max(200,Math.round((r.width||300)*d)),h=Math.round(w*H/W);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}};
 const reduire=(src,cv)=>{taille(cv);let c=src;while(c.width>cv.width*2){const n=document.createElement('canvas');n.width=Math.round(c.width/2);n.height=Math.round(c.height/2);const g=n.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(c,0,0,n.width,n.height);c=n}
  const x=cv.getContext('2d');x.clearRect(0,0,cv.width,cv.height);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(c,0,0,cv.width,cv.height)};
 const VERSION='21/10 · v4';   // affichée dans le panneau : pour vérifier qu'on a la dernière version
 return {VERSION,W,H,DEF,POLICES,rendre,images,tierDe,lignes,dessinDe,chargerPolices,taille,reduire};
})();

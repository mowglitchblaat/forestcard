/* Moteur de combat — Jeu de cartes Twitch — version du 8 octobre 2026 (identique à celui intégré dans combat.html)
   simuler(joueurA, joueurB, {seed, regles}) -> { journal, gagnant, recompenses, ... }
   joueur = { pseudo, deck:[carte...] } ; carte = ligne de la table `cartes` (type, nom, atq, pv, passif, ultime, effet, image)
   Le calcul est entièrement déterminé par la seed : même seed = même combat (rejouable). */
(function(g){
const REG={maxTours:10,gain:50,perte:10,nul:20,plafondEsquive:75};
const VM={nom:'Aucune magie',effet:null,vide:1},VP={nom:'Aucun piège',effet:null,vide:1};
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const rd=Math.round;

function simuler(pA,pB,opt={}){
 const seed=opt.seed??(Math.random()*1e9|0),r=rng(seed),reg={...REG,...opt.regles},J=[];
 const roll=p=>r()*100<(p||0);
 const tire=(deck,t)=>{const l=deck.filter(c=>c.type===t);return l[Math.floor(r()*l.length)]};
 const normPas=p=>!p?[]:p.briques?p.briques.filter(b=>b&&b.type):(p.type?[p]:[]);   // passif unique (ancien format) ou plusieurs passifs { briques:[…] }
 const nw=p=>{const c=tire(p.deck,'combattant');if(!c)throw new Error(p.pseudo+" n'a aucun combattant dans son deck");const pl=normPas(c.passif);
  return{pseudo:p.pseudo,deck:p.deck,card:c,mag:tire(p.deck,'magie')||VM,pie:tire(p.deck,'piege')||VP,atq:c.atq,pv:c.pv,max:c.pv,pl:pl,ult:c.ultime,
   uh:[{u:c.ultime,uses:0,last:-99}],magOn:1,pieOn:1,decl:0,mdelta:[],st:{rage:[],fat:[],pcnt:[],rUsed:[],reanL:[],purs:[],hots:[],cl:0,bleeds:[],frost:[],fract:[],stun:0,skip:0,dbl:0,dots:[],curses:[],atkfx:[],esqb:0,ren:[],insens:0,prog:[],evite:pl.some(p=>p.type==='evite_mort'),mortUsed:0,bonus:0},
   cum:0,coups:0,rt:0,uses:0,last:-99,pend:0}};
 const S=[nw(pA),nw(pB)],id=s=>S.indexOf(s),adv=s=>S[1-id(s)],nom=s=>s.card.nom;
 S.forEach(s=>{if(s.mag.vide)s.magOn=0;if(s.pie.vide)s.pieOn=0});
 let tour=0,rv=0;
 let pendRev=[];
 const L=(t,txt,o={})=>{J.push({t,txt,...o,tour,pv:S.map(s=>s.pv),max:S.map(s=>s.max),atq:S.map(s=>s.atq)});if(t==='degats'&&pendRev.length)flush()};
 const amt=(e,b)=>e.u==='pct'?rd(b*e.val/100):(e.val||0);
 const over=()=>{flush();return S.some(s=>s.pv<=0)};

 function heal(s,n,k){if(s.pv<=0)return;const rb=Math.min(100,s.st.bleeds.reduce((a,b)=>a+(b.r||0),0));if(rb)n=rd(n*(100-rb)/100);n=Math.min(n,s.max-s.pv);if(n<=0)return;s.pv+=n;L('soin',`${nom(s)} récupère ${n} PV`,{c:id(s),n,k:k||(rv?'revive':undefined)});scan({t:'soin',who:id(s)})}
 function dmg(src,dst,n){
  n=Math.max(0,rd(n));
  if(dst.pv<=0)return 0;   // déjà à terre : ni nouveaux dégâts, ni « évite la mort » rejoué
  if(n>=dst.pv)scan({t:'mort',who:id(dst)});               // piège « le propriétaire meurt » : juste avant la mort
  let after=null;
  if(n>=dst.pv){
   const me=dst.magOn&&dst.mag.effet?dst.mag.effet:null,m=me?(me.type==='mort_evitee'?me:(me.briques||[]).find(b=>b.type==='mort_evitee')||null):null;
   if(m&&!dst.st.mortUsed&&(m.cond==='aucune'||(m.cond==='pv_max'?dst.max>=(m.seuil||0):dst.cum>=(m.seuil||0)))){
    dst.st.mortUsed=1;n=dst.pv-1;L('protege',`${nom(dst)} évite la mort (1 PV) !`,{c:id(dst)});after=()=>purifier(dst);   // reste à 1 PV, statuts négatifs retirés sur le moment
   }else if(dst.st.evite){dst.st.evite=0;n=dst.pv-1;L('protege',`${nom(dst)} évite la mort (passif) !`,{c:id(dst)});after=()=>purifier(dst)}
  }
  const lethal=n>=dst.pv;dst.pv-=n;src.cum+=n;
  if(lethal){const rs=reanSrc(dst);if(rs){dst.st.rUsed.push(rs);dst.pv=0;pendRev.push({d:dst,pct:rs.pctrev||0})}}   // la carte meurt vraiment ; elle revient juste après (voir flush)
  if(after)after();scan({t:'pv'});return n;
 }
 // Réanimation : sources possibles = effet donné par ultime/piège, passif, magie active
 function reanSrc(d){const c=[...d.st.reanL,...d.pl.filter(p=>p.type==='reanimation')];
  if(d.magOn&&d.mag.effet){const me=d.mag.effet;(me.type==='reanimation'?[me]:(me.briques||[]).filter(b=>b.type==='reanimation')).forEach(b=>c.push(b))}
  return c.find(z=>!d.st.rUsed.includes(z))}
 function flush(){while(pendRev.length){const{d,pct}=pendRev.shift();
   L('reanim_mort',`${nom(d)} est détruit !`,{c:id(d)});
   const v=Math.max(1,Math.min(d.max,rd(d.max*pct/100)));d.pv=v;
   L('reanim',`${nom(d)} est réanimé avec ${v} PV (${pct} %) !`,{c:id(d),n:v,k:'reanim'});
   purifier(d,true)}}
 // Pièges : chaque événement du combat est « scanné » pour voir si une condition est remplie
 function scan(ev){S.forEach((o,i)=>{
  const e=o.pie.effet;if(!o.pieOn||!e||!e.condition||o.decl>=(e.declenchements||1))return;
  const c=e.condition,x=adv(o),ia=1-i;
  const ok={adv_attaque:ev.t==='attaque'&&ev.by===ia&&x.coups===c.coups,adv_ultime:ev.t==='ultime'&&ev.by===ia,
   proprio_pv_sous:ev.t==='pv'&&o.pv>0&&o.pv/o.max*100<c.seuilpv,adv_pv_bas:ev.t==='pv'&&x.pv>0&&x.pv/x.max*100<c.seuilpv,
   adv_soigne:ev.t==='soin'&&ev.who===ia,proprio_soigne:ev.t==='soin'&&ev.who===i,proprio_meurt:ev.t==='mort'&&ev.who===i}[c.type];
  if(!ok)return;
  if(x.st.insens>0){L('piege',`Le piège de ${o.pseudo} est bloqué (insensible)`,{c:i});return}
  o.decl++;L('piege',`Piège de ${o.pseudo} : ${o.pie.nom} !`,{c:i,carte:o.pie.nom,img:o.pie.image||null});if(c.type==='proprio_meurt')rv=1;fx(e.effet,o,x);rv=0;S.forEach(s=>s.pend=1);
 })}
 // Effets : o = propriétaire de l'effet, x = adversaire. mg=true : effet de magie (annulable/volable)
 function fx(e,o,x,mg){
  if(!e)return;
  if(e.briques){e.briques.forEach(b=>fx(b,o,x,mg));return}      // effet « maison » composé de briques de base
  const T=e.cible==='adversaire'?x:o;
  const delta=(s,k,d)=>{if(mg)o.mdelta.push({s,k,d})};
  switch(e.type){
   case'atq_mod':{const d=amt(e,T.atq);T.atq=Math.max(0,T.atq+d);delta(T,'atq',d);L('stat',`ATQ de ${nom(T)} ${d>=0?'+':''}${d}`,{c:id(T),k:'mod',s:'ATQ',d});break}
   case'pv_mod':{const d=amt(e,T.max);T.max=Math.max(1,T.max+d);T.pv=Math.max(1,Math.min(T.max,T.pv+d));delta(T,'max',d);L('stat',`PV max de ${nom(T)} ${d>=0?'+':''}${d}`,{c:id(T),k:'mod',s:'PV max',d});break}
   case'soin':heal(o,amt(e,o.max));break;
   case'reanimation':if(!mg){o.st.reanL.push({pctrev:e.pctrev||0});L('statut',`${nom(o)} sera réanimé s'il meurt (${e.pctrev||0} % des PV max)`,{c:id(o)})}break;
   case'rage':{const n=amt({u:e.u,val:e.ragev||0},o.atq),t=e.ragetours||1;o.st.rage.push({n,t,fv:e.fatval||0,fu:e.u,ft:e.fattours||0});L('statut',`${nom(o)} entre en rage ! (+${n} dégâts par coup, ${t} tour${t>1?'s':''})`,{c:id(o),k:'rage'});break}
   case'fatigue':fatiguer((e.ciblem||e.cible)==='soi'?o:x,e.fatval||0,e.u,e.fattours||1);break;
   case'aleatoire':{const k=Math.max(1,e.nbalea||e.fois||1);for(let i=0;i<k&&!over();i++)effetAlea(o,x);break}
   case'soin_tours':{const n=amt(e,o.max),t=e.tours||1,h={n,t};o.st.hots.push(h);if(mg)o.mdelta.push({undo:()=>{o.st.hots=o.st.hots.filter(z=>z!==h)}});L('statut',`${nom(o)} se régénère (+${n} PV par tour, ${t} tour${t>1?'s':''})`,{c:id(o),k:'regen'});break}
   case'purification':{const t=e.cible==='adversaire'?x:o;purifier(t);const n=Math.max(0,(e.fois||1)-1);   // 1re purification tout de suite, puis « fois − 1 » autres, une tous les « every » tours
    if(n>0){const h={t,every:Math.max(1,e.every||1),left:n,c:0};o.st.purs.push(h);if(mg)o.mdelta.push({undo:()=>{o.st.purs=o.st.purs.filter(z=>z!==h)}})}break}
   case'degats':{const n=dmg(o,x,e.val);L('degats',`${nom(x)} subit ${n} dégâts directs`,{c:id(x),n});break}
   case'vol_vie':{const n=dmg(o,x,e.val);L('degats',`${nom(x)} subit ${n} dégâts`,{c:id(x),n});heal(o,n);break}
   case'annule_attaque':x.st.skip=1;L('statut',`La prochaine attaque de ${nom(x)} est annulée`,{c:id(x)});break;
   case'renvoi':o.st.ren.push({pct:e.val,t:e.tours||1});break;
   case'insensible_piege':o.st.insens=e.tours||1;break;
   case'annule_magies':if(x.magOn){x.magOn=0;undo(x);L('statut',`La magie de ${x.pseudo} est annulée`,{c:id(x)})}break;
   case'degats_tours':x.st.prog.push({t:e.tours||1,n:e.val,src:o});break;
   case'double_degats':o.st.dbl=e.tours||1;L('statut',`${nom(o)} double ses dégâts`,{c:id(o)});break;
   case'echange_atq':[o.atq,x.atq]=[x.atq,o.atq];L('stat',`${nom(o)} et ${nom(x)} échangent leur ATQ`,{k:'echange',cs:[id(o),id(x)],col:'bleu'});break;
   case'echange_atq_def':{const Q=(e.ciblem||e.cible)==='soi'?o:x;[Q.atq,Q.pv]=[Q.pv,Q.atq];Q.pv=Math.max(1,Q.pv);Q.max=Math.max(Q.max,Q.pv);L('stat',`${nom(Q)} : ATQ et PV échangés`,{k:'echange',c:id(Q)});break}   // cible : adversaire par défaut, ou soi
   case'echange_pv':[o.pv,x.pv]=[x.pv,o.pv];[o.max,x.max]=[x.max,o.max];L('stat',`${nom(o)} et ${nom(x)} échangent leurs PV`,{k:'echange',cs:[id(o),id(x)],col:'rouge'});break;
   case'echange_tout':[o.atq,x.atq]=[x.atq,o.atq];[o.pv,x.pv]=[x.pv,o.pv];[o.max,x.max]=[x.max,o.max];L('stat',`${nom(o)} et ${nom(x)} échangent ATQ et PV`,{k:'echange',cs:[id(o),id(x)],col:'mixte'});break;
   case'malediction':maudire((e.ciblem||e.cible)==='soi'?o:x,e.val||0,e.tours||1);break;
   case'saignement':saigner((e.ciblem||e.cible)==='soi'?o:x,e.pctpv||0,e.reducsoin||0,e.tours||1);break;
   case'gel':geler((e.ciblem||e.cible)==='soi'?o:x,e.annul||0,e.stunch||0,e.tours||1);break;
   case'fracture':fracturer((e.ciblem||e.cible)==='soi'?o:x,e.fchance||0,e.degfrac||0,e.tours||1);break;
   case'vol_ultime':{const h=x.uh.find(z=>z.u&&z.u.type);if(h){x.uh=x.uh.filter(z=>z!==h);o.uh.push({u:h.u,uses:0,last:-99});L('vol',`${o.pseudo} vole l'ultime de ${x.pseudo}`,{k:'vol_ultime',from:id(x),c:id(o)})}else L('statut',`${x.pseudo} n'a aucun ultime à voler`)}break;
   case'poison_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x;dotUn(M,'poison',e.degtour||0,e.tours||1);break}
   case'brulure_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x;dotUn(M,'brûlure',rd(M.max*(e.pctpv||0)/100),e.tours||1);break}
   case'etourdir_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x;M.st.stun=Math.max(M.st.stun,e.tours||1);L('statut',`${nom(M)} est étourdi (${e.tours||1} tour${(e.tours||1)>1?'s':''}) !`,{c:id(M),k:'etourdi'});break}
   case'atk_fatigue':case'atk_enchainement':case'atk_brulure':case'atk_poison':case'atk_etourdir':case'atk_saignement':case'atk_malediction':case'atk_fracture':case'atk_gel':{const q={...e,type:e.type.slice(4)};o.st.atkfx.push(q);if(mg)o.mdelta.push({undo:()=>{o.st.atkfx=o.st.atkfx.filter(z=>z!==q)}});
    L('statut',`L'attaque de ${nom(o)} peut maintenant ${{fatigue:'fatiguer',enchainement:'enchaîner les frappes',brulure:'brûler',poison:'empoisonner',etourdir:'étourdir',saignement:'faire saigner',malediction:'maudire',fracture:'fracturer',gel:'geler'}[q.type]} (${q.chance} %)`);break}
   case'esquive_mod':{const d=e.val||0;T.st.esqb+=d;if(mg)o.mdelta.push({undo:()=>{T.st.esqb-=d}});L('stat',`Esquive de ${nom(T)} ${d>=0?'+':''}${d} %`,{c:id(T),k:'esq',d});break}
   case'reset_ultime':T.uh.forEach(h=>{h.uses=0;h.last=-99});L('statut',`L'ultime de ${nom(T)} est réinitialisé !`,{c:id(T)});break;
   case'mort_evitee':if(!mg&&!o.st.mortUsed){o.st.evite=1;L('statut',`${nom(o)} est protégé : il évitera la mort une fois`,{c:id(o)})}break;   // en magie : lue directement dans dmg() ; en ultime / piège : protection posée à l'activation
   case'detruire':case'voler':{
    if(e.carte==='magie'&&x.magOn){x.magOn=0;undo(x);if(e.type==='voler'){fx(x.mag.effet,o,x,true);L('vol',`${o.pseudo} vole la magie de ${x.pseudo}`)}else L('vol',`La magie de ${x.pseudo} est détruite`)}
    else if(e.carte==='piege'&&x.pieOn){x.pieOn=0;if(e.type==='voler'){o.pie=x.pie;o.pieOn=1;o.decl=0;L('vol',`${o.pseudo} vole le piège de ${x.pseudo}`)}else L('vol',`Le piège de ${x.pseudo} est détruit`)}
    break}
   case'equiper':{const c=tire(o.deck.filter(k=>k!==o.mag&&k!==o.pie),e.carte);if(c){if(e.carte==='magie'){o.mag=c;o.magOn=1;fx(c.effet,o,x,true)}else{o.pie=c;o.pieOn=1;o.decl=0}L('vol',`${nom(o)} équipe ${c.nom}`)}break}
   default:L('inconnu',`Effet non géré par le moteur : ${e.type}`);
  }
 }
 // Malédiction : l'ATQ de la cible baisse de n points à chaque fin de tour pendant t tours (se cumule)
 // ── Statuts à TIK (brûlure, poison, saignement, malédiction) ──
 // « t tours » = t TIK au total : 1 TIK tout de suite à l'application, puis 1 TIK au début de chaque tour de la cible (jamais pendant le tour de l'adversaire).
 // Chaque application est une entrée à part : les statuts s'additionnent.
 function tikUn(s,kind,d){const x=adv(s);
  if(kind==='dots'){const n=dmg(x,s,d.n);L('degats',`${nom(s)} subit ${n} (${d.k})`,{c:id(s),n,k:d.k})}
  else if(kind==='bleeds'){const n=dmg(x,s,rd(s.max*d.pct/100));L('degats',`${nom(s)} subit ${n} (saignement)`,{c:id(s),n,k:'saignement'})}
  else if(kind==='curses'){const q=Math.min(d.n,s.atq);s.atq-=q;s.st.cl+=q;if(q>0)L('stat',`ATQ de ${nom(s)} −${q} (malédiction)`,{c:id(s),k:'malediction_tick',s:'ATQ',d:-q})}
  if(!s.st[kind].includes(d)||s.pv<=0)return;   // purifié ou mort pendant le TIK : rien de plus
  if(--d.t>0)return;
  s.st[kind]=s.st[kind].filter(z=>z!==d);
  const FIN={dots:()=>[d.k==='poison'?'poison':'brulure',`${d.k} de ${nom(s)} se termine`],bleeds:()=>['saignement',`Le saignement de ${nom(s)} s'arrête`],curses:()=>['malediction',`La malédiction de ${nom(s)} se termine`]}[kind]();
  L('finstatut',FIN[1],{c:id(s),k:FIN[0]})}
 function maudire(dst,n,t){const d={n,t};dst.st.curses.push(d);L('statut',`${nom(dst)} est maudit (ATQ −${n} par tour, ${t} tour${t>1?'s':''}) !`,{c:id(dst),k:'malediction'});tikUn(dst,'curses',d)}
 function saigner(d0,pct,r,t){const d={pct,r,t};d0.st.bleeds.push(d);L('statut',`${nom(d0)} saigne (${pct} % des PV max par tour, soins −${r} %, ${t} tour${t>1?'s':''}) !`,{c:id(d0),k:'saignement'});if(d0.pv>0)tikUn(d0,'bleeds',d)}
 function dotUn(M,k,n,t){const d={k,n,t};M.st.dots.push(d);L('statut',`${nom(M)} ${k==='poison'?'est empoisonné':'brûle'} !`,{c:id(M),k:k==='poison'?'poison':'brulure'});if(M.pv>0)tikUn(M,'dots',d)}
 function fatiguer(d,n,u,t,apresRage){const v=u==='pct'?rd(d.atq*n/100):n;t=t||1;d.st.fat.push({n:v,t});L('statut',`${nom(d)} est fatigué (dégâts −${v} par coup, ${t} tour${t>1?'s':''})${apresRage?' après la rage':''} !`,{c:id(d),k:'fatigue'})}

 // Effet aléatoire : tire au hasard (graine du combat) un effet parmi tous ceux du jeu, avec des valeurs adaptées aux stats des cartes
 function effetAlea(o,x){
  const ri=(a,b)=>a+Math.floor(r()*(b-a+1)),pv=(b,a,z)=>Math.max(1,rd(b*ri(a,z)/100));
  const POOL=[
   ['ATQ en hausse',()=>({type:'atq_mod',cible:'soi',val:ri(15,40),u:'pct'})],
   ["ATQ adverse en baisse",()=>({type:'atq_mod',cible:'adversaire',val:-ri(15,40),u:'pct'})],
   ['PV max en hausse',()=>({type:'pv_mod',cible:'soi',val:ri(10,30),u:'pct'})],
   ["PV max adverse en baisse",()=>({type:'pv_mod',cible:'adversaire',val:-ri(10,30),u:'pct'})],
   ['Soin',()=>({type:'soin',val:ri(15,35),u:'pct'})],
   ['Dégâts directs',()=>({type:'degats',val:pv(x.max,8,20)})],
   ['Vol de vie',()=>({type:'vol_vie',val:pv(x.max,6,15)})],
   ['Attaque adverse annulée',()=>({type:'annule_attaque'})],
   ['Dégâts doublés',()=>({type:'double_degats',tours:ri(1,2)})],
   ['Renvoi de dégâts',()=>({type:'renvoi',val:ri(30,70),tours:ri(1,3)})],
   ['Insensible aux pièges',()=>({type:'insensible_piege',tours:ri(1,3)})],
   ['Dégâts différés',()=>({type:'degats_tours',val:pv(x.max,15,30),tours:ri(2,3)})],
   ['Échange des ATQ',()=>({type:'echange_atq'})],
   ['Échange des PV',()=>({type:'echange_pv'})],
   ['Échange ATQ et PV',()=>({type:'echange_tout'})],
   ["ATQ et défense adverses échangés",()=>({type:'echange_atq_def',ciblem:'adversaire'})],
   ['Poison',()=>({type:'poison_effet',ciblem:'adversaire',degtour:pv(x.max,3,6),tours:ri(2,4)})],
   ['Brûlure',()=>({type:'brulure_effet',ciblem:'adversaire',pctpv:ri(3,8),tours:ri(2,4)})],
   ['Étourdissement',()=>({type:'etourdir_effet',ciblem:'adversaire',tours:ri(1,2)})],
   ['Malédiction',()=>({type:'malediction',ciblem:'adversaire',val:pv(o.atq,10,25),tours:ri(2,4)})],
   ['Saignement',()=>({type:'saignement',ciblem:'adversaire',pctpv:ri(3,7),reducsoin:ri(30,60),tours:ri(2,4)})],
   ['Gel',()=>({type:'gel',ciblem:'adversaire',annul:ri(30,60),stunch:ri(10,30),tours:ri(2,3)})],
   ['Fracture',()=>({type:'fracture',ciblem:'adversaire',fchance:ri(40,70),degfrac:pv(o.max,3,8),tours:ri(2,3)})],
   ['Fatigue adverse',()=>({type:'fatigue',ciblem:'adversaire',fatval:ri(15,35),u:'pct',fattours:ri(2,3)})],
   ['Rage',()=>({type:'rage',ragev:ri(20,50),u:'pct',ragetours:ri(2,3),fatval:ri(15,30),fattours:ri(1,2)})],
   ['Purification',()=>({type:'purification',cible:'soi'})],
   ['Régénération',()=>({type:'soin_tours',val:ri(5,12),u:'pct',tours:ri(2,4)})],
   ['Esquive en hausse',()=>({type:'esquive_mod',cible:'soi',val:ri(15,30)})],
   ["Vol de l'ultime adverse",()=>({type:'vol_ultime'})],
   ['Ultime rechargé',()=>({type:'reset_ultime'})],
   ['Magie adverse annulée',()=>({type:'annule_magies'})],
   ['Magie adverse détruite',()=>({type:'detruire',carte:'magie'})],
   ['Piège adverse détruit',()=>({type:'detruire',carte:'piege'})],
   ['Magie adverse volée',()=>({type:'voler',carte:'magie'})],
   ['Piège adverse volé',()=>({type:'voler',carte:'piege'})],
   ['Réanimation',()=>({type:'reanimation',pctrev:ri(30,60)})],
   ['Attaque de base : saignement',()=>({type:'atk_saignement',chance:ri(30,60),pctpv:ri(3,6),reducsoin:ri(30,50),tours:ri(2,3)})],
   ['Attaque de base : gel',()=>({type:'atk_gel',chance:ri(25,50),annul:ri(30,50),stunch:ri(10,25),tours:2})],
   ['Attaque de base : enchaînement',()=>({type:'atk_enchainement',chance:ri(30,50),max:3})]
  ];
  const[lab,mk]=POOL[Math.floor(r()*POOL.length)],e=mk();
  L('statut',`Effet aléatoire de ${nom(o)} : ${lab} !`,{c:id(o),k:'alea'});
  fx(e,o,x,false)}
 function geler(d,ann,sn,t){d.st.frost.push({ann,sn,t});L('statut',`${nom(d)} est gelé (${ann} % d'attaque annulée, ${sn} % d'être étourdi, ${t} tour${t>1?'s':''}) !`,{c:id(d),k:'gel'})}
 function fracturer(d,fc,dg,t){d.st.fract.push({fc,dg,t});L('statut',`${nom(d)} est fracturé (${fc} % de se blesser en attaquant, −${dg} PV, ${t} tour${t>1?'s':''}) !`,{c:id(d),k:'fracture'})}
// Purification : retire les statuts négatifs de t et lui rend l'ATQ perdu par malédiction
 function purifier(t,silent){const z=t.st,pk=[];z.pg=(z.pg||0)+1;
  z.dots.forEach(d=>pk.push(d.k==='poison'?'poison':'brulure'));z.curses.forEach(()=>pk.push('malediction'));z.bleeds.forEach(()=>pk.push('saignement'));z.frost.forEach(()=>pk.push('gel'));z.fat.forEach(()=>pk.push('fatigue'));z.fract.forEach(()=>pk.push('fracture'));
  const etd=z.stun>0||z.skip>0,rest=z.cl;z.dots=[];z.curses=[];z.bleeds=[];z.frost=[];z.fract=[];z.fat=[];z.stun=0;z.skip=0;z.cl=0;
  if(!silent)L('statut',`${nom(t)} est purifié${pk.length||etd||rest?'':' (rien à retirer)'} !`,{c:id(t),k:'purif'});
  if(rest>0){t.atq+=rest;L('stat',`ATQ de ${nom(t)} +${rest} (malédiction levée)`,{c:id(t),k:'mod',s:'ATQ',d:rest})}
  if(!silent){pk.forEach(k=>L('finstatut',`${k} dissipé`,{c:id(t),k}));}if(etd&&!silent)L('statut',`${nom(t)} n'est plus étourdi`,{c:id(t),k:'etourdi_fin'})}
 function undo(s){s.mdelta.forEach(d=>{if(d.undo){d.undo();return}d.s[d.k]-=d.d;if(d.k==='max')d.s.pv=Math.min(d.s.pv,d.s.max)});s.mdelta=[]}

 function ultime(s){
  if(s.pv<=0)return;
  for(const h of s.uh.slice()){const u=h.u;if(!u||!u.type)continue;
   if(u.utilisations>0&&h.uses>=u.utilisations)continue;
   if(tour-h.last<(u.delai_tours||0))continue;
   if(!((u.apres_tours&&tour>=u.apres_tours)||(u.sur_carte&&s.pend)))continue;
   h.uses++;h.last=tour;s.pend=0;L('ultime',`ULTIME de ${nom(s)} !`,{c:id(s)});fx(u,s,adv(s));scan({t:'ultime',by:id(s)});if(over())break}
 }
 function attaque(a){
  const d=adv(a),ia=id(a),idd=id(d);
  if(a.st.stun){a.st.stun--;L('statut',`${nom(a)} est étourdi, il n'attaque pas`,{c:ia,k:a.st.stun>0?'etourdi_tour':'etourdi_fin'});return}
  if(a.st.skip){a.st.skip=0;L('bloque',`L'attaque de ${nom(a)} est annulée`,{c:id(adv(a))});return}
  if(a.st.frost.length){const fa=Math.min(100,a.st.frost.reduce((q,f)=>q+f.ann,0)),fs=Math.min(100,a.st.frost.reduce((q,f)=>q+f.sn,0));
   if(roll(fa)){L('statut',`${nom(a)} est gelé : son attaque est annulée !`,{c:ia,k:'gel_bloque'});return}
   if(roll(fs)){L('statut',`${nom(a)} est paralysé par le givre : il n'attaque pas !`,{c:ia,k:'gel_bloque'});return}}
  let multi=1;a.pl.filter(p=>p.type==='multi_frappe').forEach(p=>{if(roll(p.chance))multi+=Math.max(0,(p.frappes||1)-1)});
  // Enchaînement : chaque source (passif, ou effet donné par une magie / un piège / un ultime) retente sa chance après chaque frappe en plus et s'arrête au 1er échec (plafond = frappes en plus, 10 par défaut)
  let extra=0;[...a.pl.filter(p=>p.type==='enchainement'),...a.st.atkfx.filter(q=>q.type==='enchainement')].forEach(q=>{const cap=q.max>0?q.max:10;let n=0;while(n<cap&&roll(q.chance))n++;extra+=n});
  multi+=extra;const base=multi-extra;
  a.coups++;L('attaque',`${nom(a)} attaque${base>1?` (${base} frappes)`:''}`,{c:ia});
  for(const f of a.st.fract){if(roll(f.fc)){const n=dmg(d,a,f.dg);L('degats',`${nom(a)} se blesse en attaquant (fracture) : ${n} dégâts`,{c:ia,n,k:'fracture'})}}
  if(over())return;
  for(let k=0;k<multi&&d.pv>0;k++){
   if(k>=base)L('attaque',`${nom(a)} enchaîne une frappe de plus !`,{c:ia,k:'enchaine'});
   const ech=Math.min(reg.plafondEsquive,d.pl.filter(p=>p.type==='esquive').reduce((q,p)=>q+(p.chance||0),0)+d.st.esqb);if(ech>0&&roll(ech)){L('esquive',`${nom(d)} esquive !`,{c:idd});continue} // l'esquive annule aussi les effets associés
   let n=Math.max(0,a.atq*(a.st.dbl>0?2:1)+a.st.bonus+a.st.rage.reduce((q,g)=>q+g.n,0)-a.st.fat.reduce((q,f)=>q+f.n,0));a.st.bonus=0;   // rage : dégâts en plus · fatigue : dégâts en moins
   d.pl.filter(p=>p.type==='reduc_degats').forEach(p=>{if(roll(p.chance)){L('bloque',`${nom(d)} bloque une partie des dégâts`,{c:idd});n=Math.max(0,n-amt(p,n))}});
   d.rt++;n=dmg(a,d,n);L('degats',`${nom(d)} subit ${n} dégâts`,{c:idd,n});
   d.pl.filter(p=>p.type==='renvoi').forEach(p=>{if(n>0){const b=dmg(d,a,amt(p,n));L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})}});
   d.st.ren.forEach(R=>{const b=dmg(d,a,n*R.pct/100);if(b>0)L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})});
   if(a.pv<=0||over())return;
   if(n>0&&d.pv>0){
    a.pl.filter(p=>p.type==='vol_pct_atq').forEach(p=>{if(roll(p.chance))heal(a,rd(n*p.pctatq/100))});
    {const ec=[...a.pl,...a.st.atkfx].filter(q=>q.type==='etourdir').reduce((q,p)=>q+(p.chance||0),0);   // chances d'étourdir cumulables (passifs + effets de magie)
     if(ec>0&&roll(Math.min(100,ec))){d.st.stun=Math.max(d.st.stun,1);L('statut',`${nom(d)} est étourdi !`,{c:idd,k:'etourdi'})}}
    for(const q of [...a.pl,...a.st.atkfx]){   // statuts donnés par les passifs et par les effets d'attaque de base
     if(q.type==='brulure'&&roll(q.chance))dotUn(d,'brûlure',rd(d.max*(q.pctpv||0)/100),q.tours||1);
     if(q.type==='poison'&&roll(q.chance))dotUn(d,'poison',q.degtour||0,q.tours||1);
     if(q.type==='saignement'&&roll(q.chance))saigner(d,q.pctpv||0,q.reducsoin||0,q.tours||1);
     if(q.type==='malediction'&&roll(q.chance))maudire(d,q.val||0,q.tours||1);
     if(q.type==='fracture'&&roll(q.chance))fracturer(d,q.fchance||0,q.degfrac||0,q.tours||1);
     if(q.type==='gel'&&roll(q.chance))geler(d,q.annul||0,q.stunch||0,q.tours||1);
     if(q.type==='fatigue'&&roll(q.chance))fatiguer(d,q.fatval||0,q.u,q.fattours||1)}
   }
   if(over())return;
  }
  scan({t:'attaque',by:ia});
 }
 // Début du tour d'une carte : TIK des statuts (brûlure en premier, puis poison, saignement, malédiction), puis régénération — avant l'ultime et l'attaque
 function debutTour(s){
  if(s.pv<=0)return;
  for(const kind of ['dots','bleeds','curses']){
   for(const d of s.st[kind].slice()){if(s.pv<=0||over())return;if(!s.st[kind].includes(d))continue;tikUn(s,kind,d)}}
  if(s.pv<=0)return;
  s.st.hots=s.st.hots.filter(h=>{if(s.pv<=0)return false;heal(s,h.n);if(--h.t>0)return true;L('statut',`La régénération de ${nom(s)} se termine`);return false});
 }
 // Fin du tour d'une carte : les durées qui dépendent de SES actions (rage, fatigue, gel, fracture, dégâts doublés) baissent d'un tour.
 // Un tour où elle est étourdie ou gelée compte aussi ; le tour de l'adversaire ne compte jamais.
 function finTourCarte(s){
  if(s.pv<=0)return;
  s.st.frost=s.st.frost.filter(f=>{if(--f.t>0)return true;L('finstatut',`${nom(s)} n'est plus gelé`,{c:id(s),k:'gel'});return false});
  s.st.fract=s.st.fract.filter(f=>{if(--f.t>0)return true;L('finstatut',`La fracture de ${nom(s)} guérit`,{c:id(s),k:'fracture'});return false});
  s.st.fat=s.st.fat.filter(f=>{if(--f.t>0)return true;L('finstatut',`La fatigue de ${nom(s)} se dissipe`,{c:id(s),k:'fatigue'});return false});   // avant la rage : la fatigue qui suit la rage commence au tour d'après
  s.st.rage=s.st.rage.filter(g=>{if(--g.t>0)return true;L('finstatut',`La rage de ${nom(s)} retombe`,{c:id(s),k:'rage'});if(g.ft>0&&g.fv>0)fatiguer(s,g.fv,g.fu,g.ft,true);return false});
  if(s.st.dbl>0)s.st.dbl--;
 }
 function finDeTour(){
  S.forEach(s=>{if(s.pv<=0)return;const x=adv(s);
   s.st.purs=s.st.purs.filter(h=>{if(h.t.pv<=0)return false;if(++h.c<h.every)return true;h.c=0;purifier(h.t);return --h.left>0});
   if(s.pv<=0)return;
   if(s.pv<=0)return;
   s.pl.forEach((p,pi)=>{
    if(p.type==='aleatoire'&&(!p.every||tour%p.every===0)&&roll(p.chance==null||p.chance===''?100:p.chance)&&!over())effetAlea(s,x);
    // Passif de purification : tous les X tours (vide = chaque tour), X fois au maximum (vide = illimité) ; ne se déclenche que s'il y a un statut négatif à retirer
    if(p.type==='purification'&&(!p.every||tour%p.every===0)&&(!p.fois||(s.st.pcnt[pi]||0)<p.fois)){const z=s.st;
     if(z.dots.length||z.curses.length||z.bleeds.length||z.frost.length||z.fract.length||z.fat.length||z.stun>0||z.skip>0||z.cl>0){s.st.pcnt[pi]=(s.st.pcnt[pi]||0)+1;purifier(s)}}
   if(p.type==='soin_tour')heal(s,amt(p,s.max));
   if(p.type==='atq_tours'&&tour%p.tours===0){const dd=amt(p,s.atq);s.atq+=dd;L('stat',`ATQ de ${nom(s)} +${dd}`,{c:id(s),k:'mod',s:'ATQ',d:dd})}
   if(p.type==='pv_tours'&&tour%p.tours===0){const d=amt(p,s.max);s.max+=d;s.pv+=d;L('stat',`PV max de ${nom(s)} +${d}`,{c:id(s),k:'mod',s:'PV max',d})}
   if(p.type==='bonus_frappe'&&s.rt>=(p.coups||1)){s.st.bonus=amt(p,s.atq);L('statut',`${nom(s)} prépare une contre-attaque renforcée`,{c:id(s)})}
   });
   if(s.pv<=0)return;
   s.st.prog=s.st.prog.filter(p=>{if(--p.t>0)return true;const n=dmg(p.src,s,p.n);L('degats',`${nom(s)} subit ${n} (dégâts différés)`,{c:id(s),n});return false});
   s.st.ren=s.st.ren.filter(R=>--R.t>0);if(s.st.insens>0)s.st.insens--;
  });
 }

 // ---- Déroulé ----
 const first=r()<.5?0:1,ordre=[S[first],S[1-first]];
 L('debut','Le combat commence !',{joueurs:S.map(s=>({pseudo:s.pseudo,carte:s.card.nom,image:s.card.image||null,imageCombat:s.card.imageCombat||null,magie:s.mag.nom,piege:s.pie.nom,magieImg:s.mag.image||null,piegeImg:s.pie.image||null})),premier:first});
 ordre.forEach(s=>{if(s.mag.effet){L('magie',`Magie de ${s.pseudo} : ${s.mag.nom}`,{c:id(s),carte:s.mag.nom,img:s.mag.image||null});fx(s.mag.effet,s,adv(s),true);S.forEach(k=>k.pend=1)}});
 for(tour=1;tour<=reg.maxTours&&!over();tour++){
  L('tour',`Tour ${tour}`);S.forEach(s=>s.rt=0);
  for(const a of ordre){if(over())break;debutTour(a);if(over())break;ultime(a);if(over())break;attaque(a);if(over())break;finTourCarte(a)}
  if(over())break;finDeTour();
 }
 const dead=S.map(s=>s.pv<=0);let w=null;
 if(dead[0]!==dead[1])w=dead[0]?1:0;else if(!dead[0]&&S[0].pv!==S[1].pv)w=S[0].pv>S[1].pv?0:1;
 const rec=w===null?[reg.nul,reg.nul]:w===0?[reg.gain,reg.perte]:[reg.perte,reg.gain];
 L('fin',w===null?'Match nul !':`${S[w].pseudo} remporte le combat !`,{gagnant:w,recompenses:rec});
 return{seed,regles:reg,gagnant:w,recompenses:rec,journal:J};
}
g.Moteur={simuler,REG};
if(typeof module!=='undefined')module.exports=g.Moteur;
})(typeof window!=='undefined'?window:globalThis);


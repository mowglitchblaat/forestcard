/* Moteur de combat — Jeu de cartes Twitch — version du 13 octobre 2026 (identique à celui intégré dans combat.html)
   simuler(joueurA, joueurB, {seed, regles}) -> { journal, gagnant, recompenses, ... }
   joueur = { pseudo, deck:[carte...] } ; carte = ligne de la table `cartes` (type, nom, atq, pv, passif, ultime, effet, image)
   Le calcul est entièrement déterminé par la seed : même seed = même combat (rejouable). */
(function(g){
const canon=e=>e&&typeof e.type==='string'&&e.type.indexOf('perso_')===0&&/etourd/.test(e.type)?{...e,type:'etourdir_effet'}:e;   // effet « perso » étourdissement : exécuté comme l'étourdissement du moteur
const canonP=p=>p&&typeof p.type==='string'&&p.type.indexOf('perso_')===0&&/etourd/.test(p.type)?{...p,type:'etourdir'}:p;
const REG={maxTours:10,gain:50,perte:10,nul:20,plafondEsquive:75,maxProlong:5};
const VM={nom:'Aucune magie',effet:null,vide:1},VP={nom:'Aucun piège',effet:null,vide:1};
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const rd=Math.round;

function simuler(pA,pB,opt={}){
 const seed=opt.seed??(Math.random()*1e9|0),r=rng(seed),reg={...REG,...opt.regles},J=[];
 const roll=p=>r()*100<(p||0);
 const tire=(deck,t,ex,cur)=>{let l=deck.filter(c=>c.type===t);if(ex){const l2=l.filter(c=>!ex.includes(c)),l3=l.filter(c=>!(cur||[]).includes(c));if(l2.length)l=l2;else if(l3.length)l=l3}return l[Math.floor(r()*l.length)]};   // prolongation : d'abord des cartes jamais jouées, sinon au moins différentes de celles en jeu
 const normPas=p=>!p?[]:p.briques?p.briques.filter(b=>b&&b.type).map(canonP):(p.type?[canonP(p)]:[]);   // passif unique (ancien format) ou plusieurs passifs { briques:[…] }
 const nw=(p,ex,cur)=>{const c=tire(p.deck,'combattant',ex,cur);if(!c)throw new Error(p.pseudo+" n'a aucun combattant dans son deck");const pl=normPas(c.passif);
  return{pseudo:p.pseudo,deck:p.deck,dos:p.dos||null,card:c,mag:tire(p.deck,'magie',ex,cur)||VM,pie:tire(p.deck,'piege',ex,cur)||VP,atq:c.atq,pv:c.pv,max:c.pv,pl:pl,ult:c.ultime,
   uh:[{u:c.ultime,uses:0,last:-99}],magOn:1,pieOn:1,decl:0,mdelta:[],st:{rage:[],fat:[],pcnt:[],rUsed:[],reanL:[],purs:[],hots:[],cl:0,bleeds:[],frost:[],fract:[],stun:0,skip:0,dbl:0,dots:[],curses:[],atkfx:[],esqb:0,ren:[],insens:0,prog:[],evite:pl.some(p=>p.type==='evite_mort'),mortUsed:0,bonus:0},
   cum:0,coups:0,rt:0,uses:0,last:-99,pend:0}};
 const S=[nw(pA),nw(pB)],id=s=>S.indexOf(s),adv=s=>S[1-id(s)],nom=s=>s.card.nom;
 S.forEach(s=>{if(s.mag.vide)s.magOn=0;if(s.pie.vide)s.pieOn=0});
 let tour=0,rv=0,SRC='magie';   // SRC : d'où vient l'effet en cours (magie, piege, ultime, passif) — sert à placer une carte volée
 let pendRev=[],pendEv=[];   // pendRev : réanimations en attente · pendEv : effets (pièges, « évite la mort ») à jouer APRÈS l'affichage des dégâts
 const L=(t,txt,o={})=>{if(t==='degats'&&o.n===0){flush();return}if(t==='stat'&&o.d===0)return;   // rien à montrer pour 0 dégât ou une stat inchangée
  J.push({t,txt,...o,tour,pv:S.map(s=>s.pv),max:S.map(s=>s.max),atq:S.map(s=>s.atq)});if(t==='degats')flush()};
 const amt=(e,b)=>e.u==='pct'?rd(b*e.val/100):(e.val||0);
 const over=()=>{flush();return S.some(s=>s.pv<=0)};

 function heal(s,n,k){if(s.pv<=0)return;const rb=Math.min(100,s.st.bleeds.reduce((a,b)=>a+(b.r||0),0));if(rb)n=rd(n*(100-rb)/100);n=Math.min(n,s.max-s.pv);if(n<=0)return;s.pv+=n;L('soin',`${nom(s)} récupère ${n} PV`,{c:id(s),n,k:k||(rv?'revive':undefined)});scan({t:'soin',who:id(s)})}
 function dmg(src,dst,n){
  n=Math.max(0,rd(n));
  if(dst.pv<=0)return 0;   // déjà à terre : ni nouveaux dégâts, ni « évite la mort » rejoué
  let after=null,capR=null;
  if(n>=dst.pv){
   // 1) « Évite la mort » passe AVANT tout (réanimation comprise) : la carte reste à 1 PV, les dégâts s'affichent d'abord, l'effet juste après
   const me=dst.magOn&&dst.mag.effet?dst.mag.effet:null,m=me?(me.type==='mort_evitee'?me:(me.briques||[]).find(b=>b.type==='mort_evitee')||null):null;
   if(m&&!dst.st.mortUsed&&(m.cond==='aucune'||(m.cond==='pv_max'?dst.max>=(m.seuil||0):dst.cum>=(m.seuil||0)))){
    dst.st.mortUsed=1;n=dst.pv-1;after=()=>{L('protege',`${nom(dst)} évite la mort (1 PV) !`,{c:id(dst)});purifier(dst)};
   }else if(dst.st.evite){dst.st.evite=0;n=dst.pv-1;after=()=>{L('protege',`${nom(dst)} évite la mort (passif) !`,{c:id(dst)});purifier(dst)}}
   else{   // piège « évite la mort » : son annonce est mise de côté pour apparaître APRÈS la ligne de dégâts
    const j0=J.length;scan({t:'mort',who:id(dst),only:1});const cap=J.splice(j0);
    if(dst.st.evite){dst.st.evite=0;n=dst.pv-1;after=()=>{cap.forEach(e=>J.push({...e,pv:S.map(s=>s.pv),max:S.map(s=>s.max),atq:S.map(s=>s.atq)}));L('protege',`${nom(dst)} évite la mort (piège) !`,{c:id(dst)});purifier(dst)}}
    else cap.forEach(e=>J.push(e));
   }
   // 2) pas de protection : les autres pièges « le propriétaire meurt » (dont la réanimation) se déclenchent maintenant
   //    Piège qui contient une réanimation : il se déclenche maintenant, mais il n'est MONTRÉ qu'après la mort : la carte se brise, se reforme, puis le piège apparaît (effet de surprise)
   if(!after){const pe=dst.pieOn&&dst.pie.effet,pf=pe&&pe.effet,rb=pf&&(pf.type==='reanimation'?pf:(pf.briques||[]).find(b=>b&&b.type==='reanimation')),x=adv(dst);
    if(rb&&pe.condition&&pe.condition.type==='proprio_meurt'&&dst.decl<(pe.declenchements||1)&&!(x.st.insens>0)){   // tout le piège est joué APRÈS la réanimation ; seule la réanimation est préparée maintenant
     dst.decl++;dst.st.reanL.push({pctrev:rb.pctrev||0});const reste=pf.briques?{briques:pf.briques.filter(b=>b!==rb)}:null;
     capR=()=>{L('piege',`Piège de ${dst.pseudo} : ${dst.pie.nom} !`,{c:id(dst),carte:dst.pie.nom,img:dst.pie.image||null});if(reste){rv=1;fx(reste,dst,x);rv=0}S.forEach(s=>s.pend=1)}}
    else scan({t:'mort',who:id(dst),skip:1})}
  }
  const lethal=n>=dst.pv;dst.pv-=n;src.cum+=n;
  if(lethal){const rs=reanSrc(dst);if(rs){dst.st.rUsed.push(rs);dst.pv=0;pendRev.push({d:dst,pct:rs.pctrev||0,cap:capR});capR=null}}
  if(capR)pendEv.push(capR);   // pas de réanimation au final : le piège se montre juste après les dégâts   // la carte meurt vraiment ; elle revient juste après (voir flush)
  if(after)pendEv.push(after);pendEv.push(()=>scan({t:'pv'}));return n;   // les effets se jouent juste après les dégâts, pas avant
 }
 // Réanimation : sources possibles = effet donné par ultime/piège, passif, magie active
 function reanSrc(d){const c=[...d.st.reanL,...d.pl.filter(p=>p.type==='reanimation')];
  if(d.magOn&&d.mag.effet){const me=d.mag.effet;(me.type==='reanimation'?[me]:(me.briques||[]).filter(b=>b.type==='reanimation')).forEach(b=>c.push(b))}
  return c.find(z=>!d.st.rUsed.includes(z))}
 function flushRev(){while(pendRev.length){const{d,pct,cap}=pendRev.shift();
   L('reanim_mort',`${nom(d)} est détruit !`,{c:id(d)});
   const v=Math.max(1,Math.min(d.max,rd(d.max*pct/100)));d.pv=v;
   L('reanim',`${nom(d)} est réanimé avec ${v} PV (${pct} %) !`,{c:id(d),n:v,k:'reanim'});
   purifier(d,true);
   if(cap)cap()}}   // le piège de réanimation apparaît une fois la carte reformée, puis ses autres effets
 function flush(){do{flushRev();if(pendEv.length)pendEv.shift()()}while(pendRev.length||pendEv.length)}
 // Pièges : chaque événement du combat est « scanné » pour voir si une condition est remplie
 function scan(ev){S.forEach((o,i)=>{
  const e=o.pie.effet;if(!o.pieOn||!e||!e.condition||o.decl>=(e.declenchements||1))return;
  if(ev.t==='mort'){const ie=e.effet&&(e.effet.type==='mort_evitee'||(e.effet.briques||[]).some(b=>b.type==='mort_evitee'));if(ev.only&&!ie)return;if(ev.skip&&ie)return}
  const c=e.condition,x=adv(o),ia=1-i;
  const ok={adv_attaque:ev.t==='attaque'&&ev.by===ia&&x.coups===c.coups,adv_ultime:ev.t==='ultime'&&ev.by===ia,
   proprio_pv_sous:ev.t==='pv'&&o.pv>0&&o.pv/o.max*100<c.seuilpv,adv_pv_bas:ev.t==='pv'&&x.pv>0&&x.pv/x.max*100<c.seuilpv,
   adv_soigne:ev.t==='soin'&&ev.who===ia,proprio_soigne:ev.t==='soin'&&ev.who===i,proprio_meurt:ev.t==='mort'&&ev.who===i}[c.type];
  if(!ok)return;
  if(x.st.insens>0){o.pbl=1;L('piege',`Le piège de ${o.pseudo} est bloqué (insensible)`,{c:i,k:'bloque',carte:o.pie.nom,img:o.pie.image||null});return}
  o.decl++;L('piege',`Piège de ${o.pseudo} : ${o.pie.nom} !`,{c:i,carte:o.pie.nom,img:o.pie.image||null});if(c.type==='proprio_meurt')rv=1;const s0=SRC;SRC='piege';fx(e.effet,o,x);SRC=s0;rv=0;S.forEach(s=>s.pend=1);
 })}
 // Effets : o = propriétaire de l'effet, x = adversaire. mg=true : effet de magie (annulable/volable)
 const UNEFOIS=['degats','vol_vie','soin','echange_atq','echange_atq_def','echange_pv','echange_tout','purification','vol_ultime','reset_ultime','aleatoire','detruire','voler','equiper'];
 function fx(e,o,x,mg,rt){   // rt : retour d'une magie annulée pour X tours — ses effets « une seule fois » ne se rejouent pas
  if(!e)return;
  e=canon(e);
  if(e.briques){e.briques.forEach(b=>fx(b,o,x,mg,rt));return}
  if(rt&&UNEFOIS.includes(e.type))return;      // effet « maison » composé de briques de base
  const T=e.cible==='adversaire'?x:o;
  const delta=(s,k,d)=>{if(mg)o.mdelta.push({s,k,d})};
  const U=f=>{if(mg)o.mdelta.push({undo:f})};
  const sv=M=>({cu:M.st.curses[0]&&{...M.st.curses[0]},bl:M.st.bleeds[0]&&{...M.st.bleeds[0]},dt:M.st.dots.map(z=>({...z})),fr:M.st.frost.length,fc:M.st.fract.length,st:M.st.stun,sk:M.st.skip});
  const fin=(M,k,t)=>L('finstatut',t,{c:id(M),k});
  const back=(M,b)=>U(()=>{   // retire ce que l'effet de magie a ajouté sur la carte M (statuts encore en cours)
   const c=M.st.curses[0];if(c){if(!b.cu){M.st.curses=[];fin(M,'malediction',`La malédiction de ${nom(M)} se termine`)}else c.n=b.cu.n}
   const l=M.st.bleeds[0];if(l){if(!b.bl){M.st.bleeds=[];fin(M,'saignement',`Le saignement de ${nom(M)} s'arrête`)}else{l.pct=b.bl.pct;l.r=b.bl.r}}
   M.st.dots.filter(z=>!b.dt.some(y=>y.k===z.k)).forEach(z=>fin(M,z.k==='poison'?'poison':'brulure',`${z.k} de ${nom(M)} se termine`));M.st.dots=M.st.dots.filter(z=>b.dt.some(y=>y.k===z.k));M.st.dots.forEach(z=>{const y=b.dt.find(q=>q.k===z.k);if(y)z.n=y.n});
   if(M.st.frost.length>b.fr&&!b.fr)fin(M,'gel',`${nom(M)} n'est plus gelé`);if(M.st.fract.length>b.fc&&!b.fc)fin(M,'fracture',`La fracture de ${nom(M)} guérit`);if(M.st.stun>b.st&&!b.st)fin(M,'etourdi',`${nom(M)} n'est plus étourdi`);
   M.st.frost=M.st.frost.slice(0,b.fr);M.st.fract=M.st.fract.slice(0,b.fc);M.st.stun=Math.min(M.st.stun,b.st);M.st.skip=Math.min(M.st.skip,b.sk)});
  if(mg&&['malediction','saignement','gel','fracture','poison_effet','brulure_effet','etourdir_effet','annule_attaque'].includes(e.type)){const M=e.type==='annule_attaque'?x:((e.ciblem||e.cible)==='soi'?o:x);back(M,sv(M))}
  switch(e.type){
   case'atq_mod':{const d=amt(e,T.atq);T.atq=Math.max(0,T.atq+d);delta(T,'atq',d);L('stat',`ATQ de ${nom(T)} ${d>=0?'+':''}${d}`,{c:id(T),k:'mod',s:'ATQ',d});break}
   case'pv_mod':{const d=amt(e,T.max);T.max=Math.max(1,T.max+d);T.pv=Math.max(1,Math.min(T.max,T.pv+d));delta(T,'max',d);L('stat',`PV max de ${nom(T)} ${d>=0?'+':''}${d}`,{c:id(T),k:'mod',s:'PV max',d});break}
   case'soin':heal(o,amt(e,o.max));break;
   case'reanimation':if(!mg){o.st.reanL.push({pctrev:e.pctrev||0});L('statut',`${nom(o)} sera réanimé s'il meurt (${e.pctrev||0} % des PV max)`,{c:id(o),rp:1})}break;
   case'rage':{const n=amt({u:e.u,val:e.ragev||0},o.atq),t=e.ragetours||1;const G={n,t,fv:e.fatval||0,fu:e.u,ft:e.fattours||0};o.st.rage.push(G);U(()=>{if(o.st.rage.includes(G)){o.st.rage=o.st.rage.filter(z=>z!==G);if(!o.st.rage.length)fin(o,'rage',`La rage de ${nom(o)} retombe`)}});L('statut',`${nom(o)} entre en rage ! (+${n} dégâts par coup, ${t} tour${t>1?'s':''})`,{c:id(o),k:'rage'});break}
   case'fatigue':{const M=(e.ciblem||e.cible)==='soi'?o:x,f0=M.st.fat[0]&&{...M.st.fat[0]},a0=M.atq;fatiguer(M,e.fatval||0,e.u,e.fattours||1);const lost=a0-M.atq;
    U(()=>{const f=M.st.fat[0];if(!f)return;const g=Math.min(lost,f.q);M.atq+=g;if(g>0)L('stat',`ATQ de ${nom(M)} +${g} (fatigue retirée)`,{c:id(M),k:'mod',s:'ATQ',d:g});if(!f0){M.st.fat=[];fin(M,'fatigue',`La fatigue de ${nom(M)} se dissipe`)}else{f.n=f0.n;f.t=f0.t;f.q=Math.max(0,f.q-lost)}});break}
   case'aleatoire':{const k=Math.max(1,e.nbalea||e.fois||1);for(let i=0;i<k&&!over();i++)effetAlea(o,x);break}
   case'soin_tours':{const n=amt(e,o.max),t=e.tours||1,h={n,t};o.st.hots.push(h);if(mg)o.mdelta.push({undo:()=>{o.st.hots=o.st.hots.filter(z=>z!==h)}});L('statut',`${nom(o)} se régénère (+${n} PV par tour, ${t} tour${t>1?'s':''})`,{c:id(o),k:'regen'});break}
   case'purification':{const t=e.cible==='adversaire'?x:o;purifier(t);const n=Math.max(0,(e.fois||1)-1);   // 1re purification tout de suite, puis « fois − 1 » autres, une tous les « every » tours
    if(n>0){const h={t,every:Math.max(1,e.every||1),left:n,c:0};o.st.purs.push(h);if(mg)o.mdelta.push({undo:()=>{o.st.purs=o.st.purs.filter(z=>z!==h)}})}break}
   case'degats':{const n=dmg(o,x,e.val);L('degats',`${nom(x)} subit ${n} dégâts directs`,{c:id(x),n});break}
   case'vol_vie':{const n=dmg(o,x,e.val);L('degats',`${nom(x)} subit ${n} dégâts`,{c:id(x),n});heal(o,n);break}
   case'annule_attaque':x.st.skip=1;L('statut',`La prochaine attaque de ${nom(x)} est annulée`,{c:id(x)});break;
   case'renvoi':{const R={pct:e.val,t:e.tours||1};o.st.ren.push(R);U(()=>{o.st.ren=o.st.ren.filter(z=>z!==R)});break}
   case'insensible_piege':o.st.insens=e.tours||1;U(()=>{o.st.insens=0});break;
   case'annule_magies':if(x.magAnn===1){x.magAnn=2;if(x.mag.effet)L('magie',`Magie de ${x.pseudo} : ${x.mag.nom}`,{c:id(x),carte:x.mag.nom,img:x.mag.image||null});L('statut',`La magie de ${x.pseudo} est annulée${x.magAnnT?` (${x.magAnnT} tour${x.magAnnT>1?'s':''})`:''}`,{c:id(x),k:'magie_annulee'})}   // annulée avant d'agir (début du combat) : elle est montrée puis barrée
    else if(x.magOn){x.magOn=0;undo(x);x.magAnnT=Math.max(0,parseInt(e.tours,10)||0);x.magNew=0;L('statut',`La magie de ${x.pseudo} est annulée${x.magAnnT?` (${x.magAnnT} tour${x.magAnnT>1?'s':''})`:''}`,{c:id(x),k:'magie_annulee'})}break;   // tours : 0 ou vide = jusqu'à la fin du combat
   case'degats_tours':{const P={t:e.tours||1,n:e.val,src:o};x.st.prog.push(P);U(()=>{x.st.prog=x.st.prog.filter(z=>z!==P)});break}
   case'double_degats':o.st.dbl=e.tours||1;U(()=>{o.st.dbl=0});L('statut',`${nom(o)} double ses dégâts`,{c:id(o)});break;
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
   case'etourdir_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x,ch=e.chance==null||e.chance===''?100:(+e.chance||0),T=Math.max(1,parseInt(e.tours,10)||1);   // chance vide = 100 %
    const ess=Math.max(1,parseInt(e.essais,10)||1);let ok=false;for(let k=0;k<ess&&!ok;k++)ok=roll(ch);   // X tentatives de suite, la 1re réussite suffit
    if(!ok){L('statut',`${nom(M)} résiste à l'étourdissement (${ch} % de chances${ess>1?', '+ess+' tentatives':''})`,{c:id(M)});break}
    M.st.stun=Math.max(M.st.stun,T);L('statut',`${nom(M)} est étourdi (${T} tour${T>1?'s':''}) !`,{c:id(M),k:'etourdi'});break}
   case'atk_fatigue':case'atk_enchainement':case'atk_brulure':case'atk_poison':case'atk_etourdir':case'atk_saignement':case'atk_malediction':case'atk_fracture':case'atk_gel':{const q={...e,type:e.type.slice(4)};o.st.atkfx.push(q);if(mg)o.mdelta.push({undo:()=>{o.st.atkfx=o.st.atkfx.filter(z=>z!==q)}});
    L('statut',`L'attaque de ${nom(o)} peut maintenant ${{fatigue:'fatiguer',enchainement:'enchaîner les frappes',brulure:'brûler',poison:'empoisonner',etourdir:'étourdir',saignement:'faire saigner',malediction:'maudire',fracture:'fracturer',gel:'geler'}[q.type]} (${q.chance} %)`);break}
   case'esquive_mod':{const d=e.val||0;T.st.esqb+=d;if(mg)o.mdelta.push({undo:()=>{T.st.esqb-=d}});L('stat',`Esquive de ${nom(T)} ${d>=0?'+':''}${d} %`,{c:id(T),k:'esq',d});break}
   case'reset_ultime':T.uh.forEach(h=>{h.uses=0;h.last=-99});L('statut',`L'ultime de ${nom(T)} est réinitialisé !`,{c:id(T)});break;
   case'mort_evitee':if(!mg&&!o.st.mortUsed){o.st.evite=1;L('statut',`${nom(o)} est protégé : il évitera la mort une fois`,{c:id(o)})}break;   // en magie : lue directement dans dmg() ; en ultime / piège : protection posée à l'activation
   case'detruire':case'voler':{
    if(e.carte==='magie'&&(x.magOn||x.magAnnT)){const etaitOn=x.magOn;x.magOn=0;x.magAnnT=0;if(etaitOn)undo(x);if(e.type==='voler'){const vs=SRC,sur=vs==='piege'?'piege':'magie';if(vs==='piege')o.pieOn=0;   // volée par un piège : elle prend la place de ce piège (qui est donc consommé)
      L('vol',`${o.pseudo} vole la magie de ${x.pseudo} : ${x.mag.nom}`,{c:id(o),k:'vol_carte',from:id(x),to:id(o),de:'magie',sur,carte:x.mag.nom,img:x.mag.image||null});fx(x.mag.effet,o,x,true)}else L('vol',`La magie de ${x.pseudo} est détruite`,{c:id(x),k:'magie_annulee'})}
    else if(e.carte==='piege'&&x.pieOn){x.pieOn=0;if(e.type==='voler'){const sur='piege';o.pie=x.pie;o.pieOn=1;o.decl=0;o.pbl=0;   // le piège volé prend la place du piège du voleur
      L('vol',`${o.pseudo} vole le piège de ${x.pseudo} : ${x.pie.nom}`,{c:id(o),k:'vol_carte',from:id(x),to:id(o),de:'piege',sur,carte:x.pie.nom,img:x.pie.image||null})}else L('vol',`Le piège de ${x.pseudo} est détruit`,{c:id(x),k:'piege_detruit',carte:x.pie.nom,img:x.pie.image||null})}
    break}
   case'equiper':{const c=tire(o.deck.filter(k=>k!==o.mag&&k!==o.pie),e.carte);if(c){if(e.carte==='magie'){o.mag=c;o.magOn=1;fx(c.effet,o,x,true)}else{o.pie=c;o.pieOn=1;o.decl=0}L('vol',`${nom(o)} équipe ${c.nom}`)}break}
   default:L('inconnu',`Effet non géré par le moteur : ${e.type}`);
  }
 }
 // Malédiction : l'ATQ de la cible baisse de n points à chaque fin de tour pendant t tours (se cumule)
 // ── Statuts à TIK (brûlure, poison, saignement, malédiction) ──
 // « t tours » = t TIK au total, comptés sur les tours de la carte touchée. Malédiction : TIK au début de son tour, avant son attaque. Brûlure, poison, saignement : TIK à la fin de son tour, juste après son attaque.
 // Un seul statut de chaque sorte par carte : il garde la même intensité à chaque tik. Si quelque chose le réapplique par-dessus, l'intensité s'additionne et la durée repart à zéro.
 function tikUn(s,kind,d){const x=adv(s);
  if(kind==='dots'){const n=dmg(x,s,d.n);L('degats',`${nom(s)} subit ${n} (${d.k})`,{c:id(s),n,k:d.k})}
  else if(kind==='bleeds'){const n=dmg(x,s,rd(s.max*d.pct/100));L('degats',`${nom(s)} subit ${n} (saignement)`,{c:id(s),n,k:'saignement'})}
  else if(kind==='curses'){const q=Math.min(d.n,s.atq);s.atq-=q;s.st.cl+=q;if(q>0)L('stat',`ATQ de ${nom(s)} −${q} (malédiction)`,{c:id(s),k:'malediction_tick',s:'ATQ',d:-q})}
  if(!s.st[kind].includes(d)||s.pv<=0)return;   // purifié ou mort pendant le TIK : rien de plus
  if(--d.t>0)return;
  s.st[kind]=s.st[kind].filter(z=>z!==d);
  const FIN={dots:()=>[d.k==='poison'?'poison':'brulure',`${d.k} de ${nom(s)} se termine`],bleeds:()=>['saignement',`Le saignement de ${nom(s)} s'arrête`],curses:()=>['malediction',`La malédiction de ${nom(s)} se termine`]}[kind]();
  L('finstatut',FIN[1],{c:id(s),k:FIN[0]})}
 function maudire(dst,n,t){let d=dst.st.curses[0];const cum=!!d;if(d){d.n+=n;d.t=Math.max(d.t,t)}else{d={n,t};dst.st.curses.push(d)}   // réapplication : l'intensité s'additionne et la durée repart à zéro
  L('statut',`${nom(dst)} est maudit${cum?' à nouveau':''} (ATQ −${d.n} par tour, ${d.t} tour${d.t>1?'s':''}) !`,{c:id(dst),k:'malediction'})}
 function saigner(d0,pct,r,t){let d=d0.st.bleeds[0];const cum=!!d;if(d){d.pct+=pct;d.r=Math.min(100,d.r+r);d.t=Math.max(d.t,t)}else{d={pct,r,t};d0.st.bleeds.push(d)}
  L('statut',`${nom(d0)} saigne${cum?' encore plus' :''} (${d.pct} % des PV max par tour, soins −${d.r} %, ${d.t} tour${d.t>1?'s':''}) !`,{c:id(d0),k:'saignement'})}
 function dotUn(M,k,n,t){let d=M.st.dots.find(z=>z.k===k);const cum=!!d;if(d){d.n+=n;d.t=Math.max(d.t,t)}else{d={k,n,t};M.st.dots.push(d)}
  L('statut',`${nom(M)} ${k==='poison'?'est empoisonné':'brûle'}${cum?' encore plus fort':''} !`,{c:id(M),k:k==='poison'?'poison':'brulure'})}
 // Fatigue : l'ATQ de la carte baisse tout de suite de n points (rendus à la fin ou à la purification). Une seule fatigue par carte :
 // si elle est réappliquée, sa DURÉE s'additionne mais son intensité ne s'additionne pas (on garde la plus forte).
 function fatiguer(d,n,u,t,apresRage){const v=Math.max(0,u==='pct'?rd(d.atq*n/100):(+n||0));t=Math.max(1,parseInt(t,10)||1);let f=d.st.fat[0];const cum=!!f;let lost=0;
  if(f){f.t+=t;if(v>f.n){lost=Math.min(v-f.n,d.atq);f.n=v;f.q+=lost}}
  else{lost=Math.min(v,d.atq);f={n:v,q:lost,t};d.st.fat.push(f)}
  d.atq-=lost;
  L('statut',`${nom(d)} est fatigué${cum?' plus longtemps':''} (ATQ −${f.n}, ${f.t} tour${f.t>1?'s':''})${apresRage?' après la rage':''} !`,{c:id(d),k:'fatigue'});
  if(lost>0)L('stat',`ATQ de ${nom(d)} −${lost} (fatigue)`,{c:id(d),k:'mod',s:'ATQ',d:-lost})}

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
// Purification : retire les statuts négatifs de t (sauf l'étourdissement) et lui rend l'ATQ perdu par malédiction
 function purifier(t,silent){const z=t.st,pk=[];z.pg=(z.pg||0)+1;
  z.dots.forEach(d=>pk.push(d.k==='poison'?'poison':'brulure'));z.curses.forEach(()=>pk.push('malediction'));z.bleeds.forEach(()=>pk.push('saignement'));z.frost.forEach(()=>pk.push('gel'));z.fat.forEach(()=>pk.push('fatigue'));z.fract.forEach(()=>pk.push('fracture'));
  const etd=z.skip>0,rest=z.cl,restF=z.fat.reduce((q,f)=>q+(f.q||0),0);if(etd)pk.push('annule');z.dots=[];z.curses=[];z.bleeds=[];z.frost=[];z.fract=[];z.fat=[];z.skip=0;z.cl=0;   // l'étourdissement n'est JAMAIS retiré : il fait toujours sauter la prochaine attaque
  if(!silent)L('statut',`${nom(t)} est purifié${pk.length||rest?(z.stun>0?" (sauf l'étourdissement)":''):(z.stun>0?" (l'étourdissement reste)":' (rien à retirer)')} !`,{c:id(t),k:'purif'});
  if(rest>0){t.atq+=rest;L('stat',`ATQ de ${nom(t)} +${rest} (malédiction levée)`,{c:id(t),k:'mod',s:'ATQ',d:rest})}
  if(restF>0){t.atq+=restF;L('stat',`ATQ de ${nom(t)} +${restF} (fatigue levée)`,{c:id(t),k:'mod',s:'ATQ',d:restF})}
  if(!silent){const LB={annule:"annulation d'attaque",brulure:'brûlure',malediction:'malédiction'};pk.forEach(k=>L('finstatut',`${LB[k]||k} dissipé${k==='annule'?'e':''}`,{c:id(t),k:k==='annule'?'etourdi':k}))}}
 function undo(s){s.mdelta.forEach(d=>{if(d.undo){d.undo();return}d.s[d.k]-=d.d;if(d.k==='max')d.s.pv=Math.min(d.s.pv,d.s.max)});s.mdelta=[]}

 function ultime(s){
  if(s.pv<=0)return;
  for(const h of s.uh.slice()){const u=h.u;if(!u||!u.type)continue;
   if(u.utilisations>0&&h.uses>=u.utilisations)continue;
   if(tour-h.last<(u.delai_tours||0))continue;
   if(!((u.apres_tours&&tour>=u.apres_tours)||(u.sur_carte&&s.pend)))continue;
   h.uses++;h.last=tour;s.pend=0;L('ultime',`ULTIME de ${nom(s)} !`,{c:id(s)});{const s0=SRC;SRC='ultime';fx(u,s,adv(s));SRC=s0}scan({t:'ultime',by:id(s)});if(over())break}
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
   else if(base>1)L('frappe',`Frappe ${k+1}/${base} de ${nom(a)}`,{c:ia});
   const ech=Math.min(reg.plafondEsquive,d.pl.filter(p=>p.type==='esquive').reduce((q,p)=>q+(p.chance||0),0)+d.st.esqb);if(ech>0&&roll(ech)){L('esquive',`${nom(d)} esquive !`,{c:idd});continue} // l'esquive annule aussi les effets associés
   let n=Math.max(0,a.atq*(a.st.dbl>0?2:1)+a.st.bonus+a.st.rage.reduce((q,g)=>q+g.n,0));a.st.bonus=0;   // rage : dégâts en plus · fatigue : dégâts en moins
   d.pl.filter(p=>p.type==='reduc_degats').forEach(p=>{if(roll(p.chance)){L('bloque',`${nom(d)} bloque une partie des dégâts`,{c:idd});n=Math.max(0,n-amt(p,n))}});
   d.rt++;n=dmg(a,d,n);L('degats',`${nom(d)} subit ${n} dégâts`,{c:idd,n});
   d.pl.filter(p=>p.type==='renvoi').forEach(p=>{if(n>0){const b=dmg(d,a,amt(p,n));L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})}});
   d.st.ren.forEach(R=>{const b=dmg(d,a,n*R.pct/100);if(b>0)L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})});
   if(a.pv<=0||over())return;
   if(n>0&&d.pv>0){
    a.pl.filter(p=>p.type==='vol_pct_atq').forEach(p=>{if(roll(p.chance))heal(a,rd(n*p.pctatq/100))});
    {const SQ=[...a.pl,...a.st.atkfx].filter(q=>q.type==='etourdir'&&(+q.chance||0)>0).map(q=>({...q,chance:+q.chance})),ec=SQ.reduce((q,p)=>q+p.chance,0);   // chances d'étourdir cumulables (passifs + effets de magie)
     const ess=Math.max(1,...SQ.map(q=>parseInt(q.essais,10)||1));let okS=false;for(let k=0;k<ess&&ec>0&&!okS;k++)okS=roll(Math.min(100,ec));
     if(ec>0&&okS){let u=r()*ec,src=SQ[SQ.length-1];for(const q of SQ){if(u<q.chance){src=q;break}u-=q.chance}   // la durée est celle de la source qui a déclenché
      const T=Math.max(1,parseInt(src.tours,10)||1);d.st.stun=Math.max(d.st.stun,T);L('statut',`${nom(d)} est étourdi${T>1?` (${T} tours)`:''} !`,{c:idd,k:'etourdi'})}}
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
 // Début du tour d'une carte : malédiction (l'ATQ baisse), puis régénération — avant l'ultime et l'attaque (les autres TIK de statut sont en fin de tour : voir tikFinDeTour)
 function debutTour(s){
  if(s.pv<=0)return;
  for(const d of s.st.curses.slice()){if(s.pv<=0||over())return;if(!s.st.curses.includes(d))continue;tikUn(s,'curses',d)}   // malédiction : l'ATQ baisse AVANT l'attaque de la carte maudite
  if(s.pv<=0)return;
  s.pl.forEach(p=>{if(p.type==='bonus_frappe'&&s.rt>=(p.coups||1)){s.st.bonus=amt(p,s.atq);L('statut',`${nom(s)} prépare une contre-attaque renforcée`,{c:id(s),k:'bonus'})}});s.rt=0;   // frappé X fois depuis son dernier tour : bonus sur l'attaque qui suit
  s.st.hots=s.st.hots.filter(h=>{if(s.pv<=0)return false;heal(s,h.n);if(--h.t>0)return true;L('statut',`La régénération de ${nom(s)} se termine`);return false});
 }
 // Fin du tour d'une carte : les durées qui dépendent de SES actions (rage, fatigue, gel, fracture, dégâts doublés) baissent d'un tour.
 // Un tour où elle est étourdie ou gelée compte aussi ; le tour de l'adversaire ne compte jamais.
 function finTourCarte(s){
  if(s.pv<=0)return;
  s.st.frost=s.st.frost.filter(f=>{if(--f.t>0)return true;L('finstatut',`${nom(s)} n'est plus gelé`,{c:id(s),k:'gel'});return false});
  s.st.fract=s.st.fract.filter(f=>{if(--f.t>0)return true;L('finstatut',`La fracture de ${nom(s)} guérit`,{c:id(s),k:'fracture'});return false});
  s.st.fat=s.st.fat.filter(f=>{if(--f.t>0)return true;L('finstatut',`La fatigue de ${nom(s)} se dissipe`,{c:id(s),k:'fatigue'});if(f.q>0){s.atq+=f.q;L('stat',`ATQ de ${nom(s)} +${f.q} (fatigue dissipée)`,{c:id(s),k:'mod',s:'ATQ',d:f.q})}return false});   // avant la rage : la fatigue qui suit la rage commence au tour d'après
  s.st.rage=s.st.rage.filter(g=>{if(--g.t>0)return true;L('finstatut',`La rage de ${nom(s)} retombe`,{c:id(s),k:'rage'});if(g.ft>0&&g.fv>0)fatiguer(s,g.fv,g.fu,g.ft,true);return false});
  if(s.st.dbl>0)s.st.dbl--;
  if(s.magAnnT>0&&--s.magAnnT===0&&!s.magOn&&s.mag.effet){const neuve=s.magNew;s.magOn=1;s.magAnn=0;s.magNew=0;   // fin de l'annulation : la magie revient (si elle n'avait jamais agi, elle agit en entier)
   L('statut',`La magie de ${s.pseudo} revient : ${s.mag.nom}`,{c:id(s),k:'magie_retour'});fx(s.mag.effet,s,adv(s),true,!neuve);S.forEach(k=>k.pend=1);if(s.pv<=0)return}
  s.st.ren=s.st.ren.filter(R=>--R.t>0);
  if(s.st.insens>0&&--s.st.insens===0){const x=adv(s),pe=x.pie.effet;   // fin de l'insensibilité : le piège adverse bloqué redevient actif s'il peut encore se déclencher
   if(x.pbl&&x.pieOn&&pe&&x.decl<(pe.declenchements||1)){x.pbl=0;L('statut',`Le piège de ${x.pseudo} redevient actif`,{c:id(x),k:'piege_rearme'})}}
 }
 // ── ORDRE FIXE DU TOUR D'UNE CARTE (le même pour tout le monde, qu'elle joue en premier ou en deuxième) ──
 //  1. début : malédiction (l'ATQ baisse), régénération        — debutTour
 //  2. ultime                                                  — ultime
 //  3. attaque (et ses effets : statuts posés, pièges…)        — attaque
 //  4. ses effets « à chaque tour » (ATQ / PV qui augmentent, soin, effet aléatoire) — passifsTour
 //  5. ses dégâts de statut (brûlure, poison, saignement), ses purifications, ses dégâts différés — statutsCarte
 //  6. fin de ses durées (gel, fracture, fatigue, rage, dégâts doublés, renvoi, insensibilité aux pièges) — finTourCarte
 // Aucun effet n'est rattaché au « tour » en général : chacun est rattaché au tour de SA carte.
 function passifsTour(s){
  if(s.pv<=0)return;const x=adv(s);
  s.pl.forEach(p=>{if(s.pv<=0)return;
   if(p.type==='aleatoire'&&(!p.every||tour%p.every===0)&&roll(p.chance==null||p.chance===''?100:p.chance)&&!over()){const s0=SRC;SRC='passif';effetAlea(s,x);SRC=s0}
   if(p.type==='soin_tour')heal(s,amt(p,s.max));
   if(p.type==='atq_tours'&&tour%p.tours===0){const dd=amt(p,s.atq);s.atq+=dd;L('stat',`ATQ de ${nom(s)} +${dd}`,{c:id(s),k:'mod',s:'ATQ',d:dd})}
   if(p.type==='pv_tours'&&tour%p.tours===0){const d=amt(p,s.max);s.max+=d;s.pv+=d;L('stat',`PV max de ${nom(s)} +${d}`,{c:id(s),k:'mod',s:'PV max',d})}
  })}
 function statutsCarte(s){
  if(s.pv<=0)return;
  for(const kind of ['dots','bleeds']){   // brûlure / poison dans l'ordre d'application, puis saignement
   for(const d of s.st[kind].slice()){if(s.pv<=0||over())return;if(!s.st[kind].includes(d))continue;tikUn(s,kind,d)}}
  if(s.pv<=0)return;
  s.st.purs=s.st.purs.filter(h=>{if(h.t.pv<=0)return false;if(++h.c<h.every)return true;h.c=0;purifier(h.t);return --h.left>0});
  if(s.pv<=0)return;
  s.pl.forEach((p,pi)=>{
   // Passif de purification : tous les X tours (vide = chaque tour), X fois au maximum (vide = illimité) ; ne se déclenche que s'il y a un statut négatif à retirer
   if(p.type==='purification'&&(!p.every||tour%p.every===0)&&(!p.fois||(s.st.pcnt[pi]||0)<p.fois)){const z=s.st;
    if(z.dots.length||z.curses.length||z.bleeds.length||z.frost.length||z.fract.length||z.fat.length||z.skip>0||z.cl>0){s.st.pcnt[pi]=(s.st.pcnt[pi]||0)+1;purifier(s)}}
  });
  if(s.pv<=0)return;
  s.st.prog=s.st.prog.filter(p=>{if(--p.t>0)return true;const n=dmg(p.src,s,p.n);L('degats',`${nom(s)} subit ${n} (dégâts différés)`,{c:id(s),n});return false});
 }
 // ---- Déroulé ----
 const first=r()<.5?0:1,ordre=[S[first],S[1-first]];
 const infos=()=>S.map(s=>({pseudo:s.pseudo,dos:s.dos,carte:s.card.nom,image:s.card.image||null,imageCombat:s.card.imageCombat||null,rar:s.card.rar||null,magie:s.mag.nom,piege:s.pie.nom,magieImg:s.mag.image||null,piegeImg:s.pie.image||null,ids:[s.card.id,s.mag.id,s.pie.id]}));
 const USED=S.map(s=>[s.card,s.mag,s.pie]);   // cartes déjà jouées par chaque joueur (évitées lors des prolongations)
 L('debut','Le combat commence !',{joueurs:infos(),premier:first});
 // Annulation de magie : réglée AVANT que les magies agissent, pour qu'aucun de leurs effets ne passe (la 1re carte qui joue a la priorité si les deux annulent)
 const aMag=e=>!!e&&(e.type==='annule_magies'||(e.briques||[]).some(b=>b&&b.type==='annule_magies'));
 const tAnn=e=>{const b=e.type==='annule_magies'?e:(e.briques||[]).find(b=>b&&b.type==='annule_magies');return Math.max(0,parseInt(b&&b.tours,10)||0)};   // 0 ou vide = jusqu'à la fin du combat
 const magies=()=>{
  ordre.forEach(s=>{const x=adv(s);if(s.magOn&&aMag(s.mag.effet)&&x.magOn){x.magOn=0;x.magAnn=1;x.magAnnT=tAnn(s.mag.effet);x.magNew=1}});
  ordre.forEach(s=>{if(s.mag.effet&&s.magAnn!==1&&s.magAnn!==2){L('magie',`Magie de ${s.pseudo} : ${s.mag.nom}`,{c:id(s),carte:s.mag.nom,img:s.mag.image||null});fx(s.mag.effet,s,adv(s),true);S.forEach(k=>k.pend=1)}})};
 magies();
 // Prolongation : au dernier tour, si aucune carte n'est tombée, chaque joueur tire 3 nouvelles cartes de son deck (1 combattant, 1 magie, 1 piège) et le combat continue, jusqu'au KO.
 // Sécurité : après reg.maxProlong prolongations (5 par défaut), la carte qui a le plus de PV l'emporte.
 const MAXP=reg.maxProlong??5;let manche=0,base=0;
 for(;;){
  for(tour=1;tour<=reg.maxTours&&!over();tour++){
   for(let oi=0;oi<2;oi++){const a=ordre[oi];if(over())break;L('tour',`Tour ${base+(tour-1)*2+oi+1}`,{c:id(a)});debutTour(a);if(over())break;ultime(a);if(over())break;attaque(a);if(over())break;passifsTour(a);if(over())break;statutsCarte(a);if(over())break;finTourCarte(a)}
  }
  if(over()||manche>=MAXP)break;
  manche++;base+=reg.maxTours*2;tour=0;
  const P=[pA,pB];[0,1].forEach(i=>{const o=S[i],n=nw(P[i],USED[i],[o.card,o.mag,o.pie]);USED[i].push(n.card,n.mag,n.pie);S[i]=n;if(n.mag.vide)n.magOn=0;if(n.pie.vide)n.pieOn=0});
  ordre[0]=S[first];ordre[1]=S[1-first];pendRev=[];pendEv=[];
  L('prolongation',`Prolongation${manche>1?' '+manche:''} ! Chacun tire 3 nouvelles cartes`,{joueurs:infos(),premier:first,manche});
  magies();
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

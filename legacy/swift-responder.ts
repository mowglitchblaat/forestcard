// @ts-nocheck
/* Fonction Supabase « jeu » (swift-responder) — Jeu de cartes Twitch
   Gère les combats (!combat et duels payants) et le booster quotidien (!quotidien).
   Reçoit l'appel de Streamer.bot, prépare les decks, calcule le combat avec le moteur (ci-dessous),
   enregistre monnaie, statistiques et historique, puis renvoie le journal du combat que l'overlay OBS va rejouer.
   Secrets à définir dans Supabase : COMBAT_SECRET (obligatoire) et SERVICE_KEY (ta clé secrète Supabase, facultatif si SUPABASE_SERVICE_ROLE_KEY existe). */

// ---------------- Réglages ----------------
// Le nombre de combats gratuits par jour se règle dans le site : Admin > Réglages (script 07-dos-et-reglages.sql).
const NOM_MONNAIE = 'gold';
const REGLES = { gain: 50, perte: 10, nul: 20, maxTours: 10 };   // récompenses du combat et nombre de tours maximum
const PAYER_ADVERSAIRE = true;   // true : l'adversaire (même absent) reçoit aussi récompense et statistiques ; false : seul le joueur qui lance le combat

/* Moteur de combat — Jeu de cartes Twitch — version du 13 octobre 2026 (identique à moteur-combat.js et combat.html : annulation de magie, pièges réactivés/détruits, vol de carte, piège de réanimation caché, prolongations, double KO) */

(function(g){
const chP=e=>(e.chance==null||e.chance==='')&&e.val!=null&&e.val!==''?e.val:e.chance;   // effet perso : la « Valeur » saisie dans l'admin est la chance en %
const canon=e=>e&&typeof e.type==='string'&&e.type.indexOf('perso_')===0&&/etourd/.test(e.type)?{...e,type:'etourdir_effet',chance:chP(e)}:e;   // effet « perso » étourdissement : exécuté comme l'étourdissement du moteur
const canonP=p=>p&&typeof p.type==='string'&&p.type.indexOf('perso_')===0&&/etourd/.test(p.type)?{...p,type:'etourdir',chance:chP(p)}:p;
const REG={maxTours:10,gain:50,perte:10,nul:20,plafondEsquive:75,maxProlong:3};
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
   uh:[{u:c.ultime,uses:0,last:-99}],magOn:1,pieOn:1,decl:0,mdelta:[],st:{rage:[],fat:[],pcnt:[],rUsed:[],reanL:[],purs:[],hots:[],cl:0,bleeds:[],frost:[],fract:[],stun:0,skip:0,blk:0,dbl:0,solide:0,marques:0,mseuil:0,joues:0,trA:null,transc:0,dots:[],cret:[],curses:[],atkfx:[],esqb:0,ren:[],insens:0,prog:[],vols:[],volDiff:[],pvol:[],av:0,avaleur:null,avale:null,repos:0,evite:pl.some(p=>p.type==='evite_mort')?1:0,mortUsed:0,bonus:0},
   cum:0,coups:0,rt:0,uses:0,last:-99,pend:0}};
 const S=[nw(pA),nw(pB)],id=s=>S.indexOf(s),adv=s=>S[1-id(s)],nom=s=>s.card.nom;
 S.forEach(s=>{if(s.mag.vide)s.magOn=0;if(s.pie.vide)s.pieOn=0});
 let tour=0,rv=0,SRC='magie';   // SRC : d'où vient l'effet en cours (magie, piege, ultime, passif) — sert à placer une carte volée
 let pendRev=[],pendEv=[],EXEC=0,PCH=0,NOREV=0;   // NOREV : dégâts de détonation (pas de réanimation)
    // PCH : profondeur de la chaîne de pièges en cours (un piège qui en déclenche un autre…)
   // EXEC : exécution en cours (ignore « évite la mort »)   // pendRev : réanimations en attente · pendEv : effets (pièges, « évite la mort ») à jouer APRÈS l'affichage des dégâts
 const L=(t,txt,o={})=>{if(t==='degats'&&o.n===0){flush();return}if(t==='stat'&&o.d===0)return;   // rien à montrer pour 0 dégât ou une stat inchangée
  J.push({t,txt,...o,tour,pv:S.map(s=>s.pv),max:S.map(s=>s.max),atq:S.map(s=>s.atq)});if(TRIG)trig(t,o,txt);if(t==='degats')flush()};
 // Déclencheurs d'ultime et conditions de piège « sur événement » (statut reçu, esquive, gros coup, piège, tour X…) : actifs seulement si une carte des decks s'en sert
 const NEWC=new Set(['proprio_statut','adv_statut','proprio_esquive','adv_esquive','proprio_attaque','proprio_coup_fort','adv_piege','tour_n','proprio_bloque','proprio_ultime']);
 const TRP=[...(pA.deck||[]),...(pB.deck||[])].some(c=>c&&c.effet&&c.effet.condition&&NEWC.has(c.effet.condition.type));
 const TRIG=TRP||[...(pA.deck||[]),...(pB.deck||[])].some(c=>c&&c.ultime&&c.ultime.udecl);
 const NEGK=new Set(['brulure','poison','saignement','malediction','gel','fatigue','etourdi','fracture']);
 function trig(t,o,txt){let ev=null;
  if(t==='statut'&&NEGK.has(o.k))ev={t:'st',who:o.c};
  else if(t==='esquive')ev={t:'esq',who:o.c};
  else if(t==='degats'&&o.n>0&&!['brûlure','brulure','poison','saignement'].includes(o.k))ev={t:'coup',who:o.c,n:o.n};
  else if(t==='piege'&&!o.k)ev={t:'piege',who:o.c};
  else if(t==='tour')ev={t:'tour',who:o.c,n:parseInt(String(txt).replace(/\D+/g,''),10)||0};
  else if(t==='bloque')ev={t:'bloque',who:o.c};
  else if(t==='soin')ev={t:'soin2',who:o.c};
  else if(t==='ultime')ev={t:'ult',who:o.c};
  else if(t==='attaque'&&!o.k)ev={t:'atk',who:o.c};
  if(!ev)return;
  S.forEach((s,i)=>s.uh.forEach(h=>{const u=h.u;if(!u||!u.udecl)return;const X=Math.max(1,parseInt(u.udx,10)||1),me=ev.who===i,ad=ev.who===1-i;
   if({coups_recus:ev.t==='atk'&&ad&&S[1-i].coups%X===0,attaques:ev.t==='atk'&&me&&s.coups%X===0,son_piege:ev.t==='piege'&&me,piege_adv:ev.t==='piege'&&ad,adv_ultime:ev.t==='ult'&&ad,
       statut:ev.t==='st'&&me,esquive:ev.t==='esq'&&me,soigne:ev.t==='soin2'&&me,coup_fort:ev.t==='coup'&&me&&ev.n>=X,bloque:ev.t==='bloque'&&me}[u.udecl])h.trg=1}));
  if(TRP)pendEv.push(()=>scan(ev))}
 const amt=(e,b)=>e.u==='pct'?rd(b*e.val/100):(e.val||0);
 const over=()=>{flush();return S.some(s=>s.pv<=0)};

 function heal(s,n,k){if(s.pv<=0)return;const rb=Math.min(100,s.st.bleeds.reduce((a,b)=>a+(b.r||0),0));if(rb)n=rd(n*(100-rb)/100);n=Math.min(n,s.max-s.pv);if(n<=0)return;s.pv+=n;L('soin',`${nom(s)} récupère ${n} PV`,{c:id(s),n,k:k||(rv?'revive':undefined)});scan({t:'soin',who:id(s)})}
 function dmg(src,dst,n){
  n=Math.max(0,rd(n));
  if(dst.pv<=0)return 0;   // déjà à terre : ni nouveaux dégâts, ni « évite la mort » rejoué
  let after=null,capR=null;
  if(n>=dst.pv){
   // 1) « Évite la mort » passe AVANT tout (réanimation comprise) : la carte reste à 1 PV, les dégâts s'affichent d'abord, l'effet juste après
   if(!EXEC){const me=dst.magOn&&dst.mag.effet?dst.mag.effet:null,m=me?(me.type==='mort_evitee'?me:(me.briques||[]).find(b=>b.type==='mort_evitee')||null):null;
   if(m&&!dst.st.mortUsed&&(m.cond==='aucune'||(m.cond==='pv_max'?dst.max>=(m.seuil||0):dst.cum>=(m.seuil||0)))){
    dst.st.mortUsed=1;n=dst.pv-1;after=()=>{L('protege',`${nom(dst)} évite la mort (1 PV) !`,{c:id(dst)});purifier(dst)};
   }else if(dst.st.evite>0){dst.st.evite--;n=dst.pv-1;after=()=>{L('protege',`${nom(dst)} évite la mort (passif) !`,{c:id(dst)});purifier(dst)}}
   else{   // piège « évite la mort » : son annonce est mise de côté pour apparaître APRÈS la ligne de dégâts
    const j0=J.length;scan({t:'mort',who:id(dst),only:1});const cap=J.splice(j0);
    if(dst.st.evite>0){dst.st.evite--;n=dst.pv-1;after=()=>{cap.forEach(e=>J.push({...e,pv:S.map(s=>s.pv),max:S.map(s=>s.max),atq:S.map(s=>s.atq)}));L('protege',`${nom(dst)} évite la mort (piège) !`,{c:id(dst)});purifier(dst)}}
    else cap.forEach(e=>J.push(e));
   }}
   // 2) pas de protection : les autres pièges « le propriétaire meurt » (dont la réanimation) se déclenchent maintenant
   //    Piège qui contient une réanimation : il se déclenche maintenant, mais il n'est MONTRÉ qu'après la mort : la carte se brise, se reforme, puis le piège apparaît (effet de surprise)
   if(!after){const pe=dst.pieOn&&dst.pie.effet,pf=pe&&pe.effet,rb=!NOREV&&pf&&(pf.type==='reanimation'?pf:(pf.briques||[]).find(b=>b&&b.type==='reanimation')),x=adv(dst);
    if(rb&&pe.condition&&pe.condition.type==='proprio_meurt'&&dst.decl<(pe.declenchements||1)&&!(x.st.insens>0)){   // tout le piège est joué APRÈS la réanimation ; seule la réanimation est préparée maintenant
     dst.decl++;dst.st.reanL.push({pctrev:rb.pctrev||0});const reste=pf.briques?{briques:pf.briques.filter(b=>b!==rb)}:null;
     capR=()=>{L('piege',`Piège de ${dst.pseudo} : ${dst.pie.nom} !`,{c:id(dst),carte:dst.pie.nom,img:dst.pie.image||null});if(reste){rv=1;fx(reste,dst,x);rv=0}S.forEach(s=>s.pend=1)}}
    else scan({t:'mort',who:id(dst),skip:1})}
  }
  const lethal=n>=dst.pv;dst.pv=Math.max(0,dst.pv-n);src.cum+=n;   // les PV s'arrêtent à 0 (jamais négatifs)
  if(lethal&&NOREV&&reanSrc(dst))pendEv.push(()=>L('statut',`${nom(dst)} est réduit en cendres : pas de réanimation !`,{c:id(dst),k:'anti_rea'}));
  if(lethal&&!NOREV){const rs=reanSrc(dst);if(rs){dst.st.rUsed.push(rs);dst.pv=0;pendRev.push({d:dst,pct:rs.pctrev||0,cap:capR});capR=null}}
  if(capR)pendEv.push(capR);   // pas de réanimation au final : le piège se montre juste après les dégâts   // la carte meurt vraiment ; elle revient juste après (voir flush)
  if(after)pendEv.push(after);pendEv.push(()=>scan({t:'pv'}));return n;   // les effets se jouent juste après les dégâts, pas avant
 }
 // Réanimation : sources possibles = effet donné par ultime/piège, passif, magie active
 function reanSrc(d){const c=[...d.st.reanL,...d.pl.filter(p=>p.type==='reanimation')];
  if(d.magOn&&d.mag.effet){const me=d.mag.effet;(me.type==='reanimation'?[me]:(me.briques||[]).filter(b=>b.type==='reanimation')).forEach(b=>c.push(b))}
  return c.find(z=>!d.st.rUsed.includes(z))}
 function flushRev(){while(pendRev.length){const{d,pct,cap}=pendRev.shift();
   L('reanim_mort',`${nom(d)} est détruit !`,{c:id(d)});d.st.marques=0;
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
  const ok={adv_attaque:ev.t==='attaque'&&ev.by===ia&&x.coups>0&&x.coups%Math.max(1,parseInt(c.coups,10)||1)===0,   // toutes les N attaques de l'adversaire (N, 2N, 3N…), jusqu'au nombre de déclenchements max
  adv_ultime:ev.t==='ultime'&&ev.by===ia,
   proprio_pv_sous:ev.t==='pv'&&o.pv>0&&o.pv/o.max*100<c.seuilpv,adv_pv_bas:ev.t==='pv'&&x.pv>0&&x.pv/x.max*100<c.seuilpv,
   adv_soigne:ev.t==='soin'&&ev.who===ia,proprio_soigne:ev.t==='soin'&&ev.who===i,proprio_meurt:ev.t==='mort'&&ev.who===i,
   proprio_statut:ev.t==='st'&&ev.who===i,adv_statut:ev.t==='st'&&ev.who===ia,proprio_esquive:ev.t==='esq'&&ev.who===i,adv_esquive:ev.t==='esq'&&ev.who===ia,
   proprio_attaque:ev.t==='atk'&&ev.who===i&&o.coups>0&&o.coups%Math.max(1,parseInt(c.coups,10)||1)===0,proprio_coup_fort:ev.t==='coup'&&ev.who===i&&ev.n>=Math.max(1,parseInt(c.seuildeg,10)||1),
   adv_piege:ev.t==='piege'&&ev.who===ia,tour_n:ev.t==='tour'&&ev.n===Math.max(1,parseInt(c.ntour,10)||1),proprio_bloque:ev.t==='bloque'&&ev.who===i,proprio_ultime:ev.t==='ult'&&ev.who===i}[c.type];
  if(!ok)return;
  if(PCH>=3)return;   // chaîne de pièges limitée à 3 (sinon deux pièges qui se déclenchent l'un l'autre tournent sans fin) : le piège reste armé pour plus tard
  if(x.st.insens>0){o.decl++;const reste=o.decl<(e.declenchements||1);o.pbl=reste?1:0;   // insensible : le piège se déclenche quand même (le déclenchement est consommé) mais son effet ne fait rien
   L('piege',`Le piège de ${o.pseudo} se déclenche mais ${nom(x)} est insensible${reste?'':' : piège épuisé'}`,{c:i,k:'bloque',carte:o.pie.nom,img:o.pie.image||null});return}
  o.decl++;L('piege',`Piège de ${o.pseudo} : ${o.pie.nom} !`,{c:i,carte:o.pie.nom,img:o.pie.image||null});if(c.type==='proprio_meurt')rv=1;const s0=SRC;SRC='piege';PCH++;try{fx(e.effet,o,x)}finally{PCH--}SRC=s0;rv=0;S.forEach(s=>s.pend=1);
 })}
 // Effets : o = propriétaire de l'effet, x = adversaire. mg=true : effet de magie (annulable/volable)
 const SANS_CIBLE=['voler','detruire','annule_magies','vol_ultime','copie_ultime','echange_atq','echange_atq_def','echange_pv','echange_tout','annule_attaque','bloque_attaque','marque_avalage','execution_direct'];   // sans objet quand la carte visée (avalée) est remplacée par celle qui joue l'effet
 const UNEFOIS=['degats','vol_vie','soin','echange_atq','echange_atq_def','echange_pv','echange_tout','purification','vol_ultime','copie_ultime','reset_ultime','aleatoire','detruire','voler','equiper'];
 function fx(e,o,x,mg,rt){   // rt : retour d'une magie annulée pour X tours — ses effets « une seule fois » ne se rejouent pas
  if(!e)return;
  e=canon(e);
  if(e.briques){e.briques.forEach(b=>fx(b,o,x,mg,rt));return}
  if(x.st.avaleur){x=x.st.avaleur;if(x===o&&SANS_CIBLE.includes(e.type))return}   // AVALAGE : la carte avalée ne reçoit rien, tout ce qui la visait touche la carte qui l'a avalée
  if(rt&&UNEFOIS.includes(e.type))return;      // effet « maison » composé de briques de base
  const T=e.cible==='adversaire'?x:o;
  const delta=(s,k,d)=>{if(mg)o.mdelta.push({s,k,d})};
  const U=f=>{if(mg)o.mdelta.push({undo:f})};
  const sv=M=>({cu:M.st.curses[0]&&{...M.st.curses[0]},bl:M.st.bleeds[0]&&{...M.st.bleeds[0]},dt:M.st.dots.map(z=>({...z})),fr:M.st.frost.length,fc:M.st.fract.length,st:M.st.stun,sk:M.st.skip,bk:M.st.blk});
  const fin=(M,k,t)=>L('finstatut',t,{c:id(M),k});
  const back=(M,b)=>U(()=>{   // retire ce que l'effet de magie a ajouté sur la carte M (statuts encore en cours)
   const c=M.st.curses[0];if(c){if(!b.cu){M.st.curses=[];fin(M,'malediction',`La malédiction de ${nom(M)} se termine`)}else c.n=b.cu.n}
   const l=M.st.bleeds[0];if(l){if(!b.bl){M.st.bleeds=[];fin(M,'saignement',`Le saignement de ${nom(M)} s'arrête`)}else{l.pct=b.bl.pct;l.r=b.bl.r}}
   M.st.dots.filter(z=>!b.dt.some(y=>y.k===z.k)).forEach(z=>fin(M,z.k==='poison'?'poison':'brulure',`${z.k} de ${nom(M)} se termine`));M.st.dots=M.st.dots.filter(z=>b.dt.some(y=>y.k===z.k));M.st.dots.forEach(z=>{const y=b.dt.find(q=>q.k===z.k);if(y)z.n=y.n});
   if(M.st.frost.length>b.fr&&!b.fr)fin(M,'gel',`${nom(M)} n'est plus gelé`);if(M.st.fract.length>b.fc&&!b.fc)fin(M,'fracture',`La fracture de ${nom(M)} guérit`);if(M.st.stun>b.st&&!b.st)fin(M,'etourdi',`${nom(M)} n'est plus étourdi`);
   M.st.frost=M.st.frost.slice(0,b.fr);M.st.fract=M.st.fract.slice(0,b.fc);M.st.stun=Math.min(M.st.stun,b.st);M.st.skip=Math.min(M.st.skip,b.sk);M.st.blk=Math.min(M.st.blk,b.bk)});
  if(mg&&['malediction','saignement','gel','fracture','poison_effet','brulure_effet','etourdir_effet','annule_attaque','bloque_attaque'].includes(e.type)){const M=e.type==='annule_attaque'||e.type==='bloque_attaque'?x:((e.ciblem||e.cible)==='soi'?o:x);back(M,sv(M))}
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
   case'detonation':detoner(o,(e.ciblem||e.cible)==='soi'?o:x,e);break;
   case'annule_attaque':x.st.skip=1;L('statut',`La prochaine attaque de ${nom(x)} est annulée`,{c:id(x)});break;
   // Attaque BLOQUÉE (≠ annulée) : l'attaque a lieu et touche, sans aucun dégât, mais ses statuts et ses marques (exécution, avalage) s'appliquent
   case'bloque_attaque':x.st.blk=1;L('statut',`La prochaine attaque de ${nom(x)} sera bloquée`,{c:id(x)});break;
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
   case'missiles':{const N=Math.max(1,parseInt(e.frappes,10)||3),ELS=['brulure','gel','malediction','poison','saignement','fatigue'];
    // Missiles : N missiles ; chacun EXPLOSE (détonation : dégâts bruts val + statuts consumés, bonus, dégâts de zone) puis peut poser un statut (que le missile suivant fera exploser)
    for(let k=1;k<=N&&x.pv>0&&o.pv>0;k++){
     L('missile',`${nom(o)} tire un missile${N>1?` (${k}/${N})`:''} !`,{c:id(x),from:id(o),n:k,tot:N});
     if(esquiver(x)){L('esquive',`${nom(x)} esquive le missile : il explose à côté !`,{c:id(x),k:'missile_esq'});   // esquivé : l'explosion à côté touche les deux cartes (dégâts de zone)
      const z=rd(Math.max(0,+e.val||0)*Math.max(0,+e.recul||0)/100);
      if(z>0){L('detonation',`💥 Le missile explose à côté de ${nom(x)} !`,{c:id(x),from:id(o),parts:[],mis:1,esq:1});
       for(const [s,v] of [[o,x],[x,o]]){if(v.pv<=0)continue;let b;NOREV=1;try{b=dmg(s,v,z)}finally{NOREV=0}if(b>0)L('degats',`${nom(v)} subit ${b} dégâts (souffle de l'explosion)`,{c:id(v),n:b,k:'detonation'})}}
      if(over())break;continue}
     const blq=o.st.blk>0;let n=0;if(blq){o.st.blk=0;L('bloque',`Le missile de ${nom(o)} est bloqué`,{c:id(x)})}   // bloqué : pas d'explosion, le statut passe quand même
     else n=detoner(o,x,e,true,1)||0;
     if(n>0&&o.pv>0){const rv=renvoiTot(x,n);if(rv>0){L('missile',`${nom(x)} renvoie le missile !`,{c:id(o),from:id(x),n:k,tot:N,retour:1});   // renvoi : le missile repart vers le tireur et explose sur lui
       let b;NOREV=1;try{b=dmg(x,o,rv)}finally{NOREV=0}L('detonation',`💥 Le missile renvoyé explose sur ${nom(o)} !`,{c:id(o),from:id(x),parts:[],mis:1});if(b>0)L('degats',`${nom(o)} subit ${b} dégâts (missile renvoyé)`,{c:id(o),n:b,k:'detonation'})}}
     if(o.pv<=0||over())break;
     const st=e.mstatut==='aleatoire'?ELS[Math.floor(r()*ELS.length)]:(ELS.includes(e.mstatut)?e.mstatut:null);
     if(st&&x.pv>0){const ch=e.chance==null||e.chance===''?100:(+e.chance||0),v=+e.sval||0,t=Math.max(1,parseInt(e.tours,10)||2);
      if(roll(ch))fx({brulure:{type:'brulure_effet',ciblem:'adversaire',pctpv:v,tours:t},gel:{type:'gel',ciblem:'adversaire',annul:v,stunch:0,tours:t},malediction:{type:'malediction',ciblem:'adversaire',val:v,tours:t},
       poison:{type:'poison_effet',ciblem:'adversaire',degtour:v,tours:t},saignement:{type:'saignement',ciblem:'adversaire',pctpv:v,reducsoin:+e.reducsoin||0,tours:t},fatigue:{type:'fatigue',ciblem:'adversaire',fatval:v,u:'pct',fattours:t}}[st],o,x,mg,rt)}
     if(over())break}
    break}
   case'souffle':{const ELS=['brulure','gel','malediction','poison','saignement','fatigue'],NS={brulure:'de feu',gel:'de glace',malediction:'maudit',poison:'empoisonné',saignement:'de sang',fatigue:"d'épuisement"};
    // statut « aleatoire » : un statut tiré au hasard à CHAQUE souffle · rechance : X % de souffler encore (retente, s'arrête au 1er échec, remax souffles en plus au maximum, 3 par défaut)
    const un=(k)=>{const el=e.statut==='aleatoire'?ELS[Math.floor(r()*ELS.length)]:(ELS.includes(e.statut)?e.statut:'brulure');
    L('souffle',`${nom(o)} crache un souffle ${NS[el]}${k>1?` (souffle n°${k})`:''} !`,{c:id(x),from:id(o),el,...(k>1?{n:k}:{})});
    if(esquiver(x)){L('esquive',`${nom(x)} esquive le souffle !`,{c:id(x)});return}   // esquivé : ni dégâts ni statut
    const blq=o.st.blk>0;if(blq){o.st.blk=0;L('bloque',`Le souffle de ${nom(o)} est bloqué`,{c:id(x)})}   // bloqué : 0 dégât, le statut passe quand même
    if(+e.val>0&&!blq){const n=dmg(o,x,reduire(x,+e.val));L('degats',`${nom(x)} subit ${n} dégâts (souffle)`,{c:id(x),n,k:'souffle'});renvoyer(x,o,n)}   // renvoi : seulement les dégâts
    if(x.pv>0){const ch=e.chance==null||e.chance===''?100:(+e.chance||0),v=+e.sval||0,t=Math.max(1,parseInt(e.tours,10)||2);
     if(roll(ch))fx({brulure:{type:'brulure_effet',ciblem:'adversaire',pctpv:v,tours:t},gel:{type:'gel',ciblem:'adversaire',annul:v,stunch:0,tours:t},malediction:{type:'malediction',ciblem:'adversaire',val:v,tours:t},
      poison:{type:'poison_effet',ciblem:'adversaire',degtour:v,tours:t},saignement:{type:'saignement',ciblem:'adversaire',pctpv:v,reducsoin:+e.reducsoin||0,tours:t},fatigue:{type:'fatigue',ciblem:'adversaire',fatval:v,u:'pct',fattours:t}}[el],o,x,mg,rt);
     else L('statut',`${nom(x)} résiste au souffle (${ch} % de chances)`,{c:id(x)})}};
    un(1);
    const rc=+e.rechance||0,rm=e.remax==null||e.remax===''?3:Math.max(0,parseInt(e.remax,10)||0);
    if(rc>0)for(let k=2;k<=rm+1&&x.pv>0&&o.pv>0&&!over();k++){if(!roll(rc))break;un(k)}
    break}
   case'execution':{const q={type:'execution',chance:e.chance==null||e.chance===''?100:+e.chance||0,seuilexec:e.seuilexec};o.st.atkfx.push(q);if(mg)o.mdelta.push({undo:()=>{o.st.atkfx=o.st.atkfx.filter(z=>z!==q)}});L('statut',`L'attaque de ${nom(o)} peut maintenant marquer la cible (${q.chance} %)`,{c:id(o),k:'exec_prep'});break}
   case'atk_avalage':{const q={type:'avalage',chance:e.chance,ratio:e.ratio,pctmache:e.pctmache,machebase:e.machebase,tours:e.tours,repos:e.repos};o.st.atkfx.push(q);if(mg)o.mdelta.push({undo:()=>{o.st.atkfx=o.st.atkfx.filter(z=>z!==q)}});L('statut',`L'attaque de ${nom(o)} peut maintenant préparer un avalage`,{c:id(o),k:'aval_prep'});break}
   case'marque_avalage':marquerAv(x,Math.max(1,parseInt(e.nbmarques,10)||1));break;
   case'execution_direct':{const m0=x.st.marques;marquer(x,Math.max(1,parseInt(e.nbmarques,10)||1),e.seuilexec);const add=x.st.marques-m0;
    if(add>0)U(()=>{if(x.pv<=0)return;x.st.marques=Math.max(0,x.st.marques-add);L('finstatut',`${nom(x)} perd ${add} marque${add>1?'s':''} d'exécution (${x.st.marques}/3)`,{c:id(x),k:'marque',n:x.st.marques})});break}   // magie volée / annulée : ses marques partent avec elle
   case'transcendance':{const A=porterTransc(o,e);if(A&&mg)o.mdelta.push({undo:()=>{if(o.st.trA!==A)return;if(!o.st.transc){o.st.trA=null;L('finstatut',`${nom(o)} perd la Transcendance`,{c:id(o),k:'transc_prep'})}else A.stop=1}});break}   // magie volée après un niveau : les niveaux acquis restent, plus de nouveau niveau
   case'solidification':{const ch=e.chance==null||e.chance===''?100:(+e.chance||0);if(solidifier(o,ch,e.tours)&&mg)o.mdelta.push({undo:()=>{if(o.st.solide>0){o.st.solide=0;L('finstatut',`${nom(o)} n'est plus solidifié`,{c:id(o),k:'solide'})}}});break}
   case'gel':geler((e.ciblem||e.cible)==='soi'?o:x,e.annul||0,e.stunch||0,e.tours||1);break;
   case'fracture':fracturer((e.ciblem||e.cible)==='soi'?o:x,e.fchance||0,e.degfrac||0,e.tours||1);break;
   case'copie_ultime':{const h=x.uh.find(z=>z.u&&z.u.type&&z.u.type!=='copie_ultime');   // copie : l'adversaire GARDE son ultime, la carte en reçoit une copie neuve
    if(!h)L('statut',`${x.pseudo} n'a aucun ultime à copier`);else if(o.uh.some(z=>z.u===h.u||z.src===h.u))L('statut',`${nom(o)} a déjà cet ultime`);
    else{o.uh.push({u:h.u,uses:0,last:-99,src:h.u});L('vol',`${o.pseudo} copie l'ultime de ${x.pseudo}`,{k:'copie_ultime',from:id(x),c:id(o)})}}break;
   case'vol_ultime':{const h=x.uh.find(z=>z.u&&z.u.type);if(h){x.uh=x.uh.filter(z=>z!==h);o.uh.push({u:h.u,uses:0,last:-99});L('vol',`${o.pseudo} vole l'ultime de ${x.pseudo}`,{k:'vol_ultime',from:id(x),c:id(o)})}else L('statut',`${x.pseudo} n'a aucun ultime à voler`)}break;
   case'poison_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x;dotUn(M,'poison',e.degtour||0,e.tours||1);break}
   case'brulure_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x;dotUn(M,'brûlure',rd(M.max*(e.pctpv||0)/100),e.tours||1);break}
   case'etourdir_effet':{const M=(e.ciblem||e.cible)==='soi'?o:x,ch=e.chance==null||e.chance===''?100:(+e.chance||0),T=Math.max(1,parseInt(e.tours,10)||1);   // chance vide = 100 %
    const ess=Math.max(1,parseInt(e.essais,10)||1);let ok=false;for(let k=0;k<ess&&!ok;k++)ok=roll(ch);   // X tentatives de suite, la 1re réussite suffit
    if(!ok){L('statut',`${nom(M)} résiste à l'étourdissement (${ch} % de chances${ess>1?', '+ess+' tentatives':''})`,{c:id(M)});break}
    if(M.st.solide>0){L('statut',`${nom(M)} est solidifié : l'étourdissement n'a aucun effet`,{c:id(M),k:'solide_bloque'});break}
    M.st.stun=Math.max(M.st.stun,T);L('statut',`${nom(M)} est étourdi (${T} tour${T>1?'s':''}) !`,{c:id(M),k:'etourdi'});break}
   case'atk_fatigue':case'atk_detonation':case'atk_enchainement':case'atk_brulure':case'atk_poison':case'atk_etourdir':case'atk_saignement':case'atk_malediction':case'atk_fracture':case'atk_gel':{const q={...e,type:e.type.slice(4)};o.st.atkfx.push(q);if(mg)o.mdelta.push({undo:()=>{o.st.atkfx=o.st.atkfx.filter(z=>z!==q)}});
    L('statut',`L'attaque de ${nom(o)} peut maintenant ${{fatigue:'fatiguer',enchainement:'enchaîner les frappes',brulure:'brûler',poison:'empoisonner',etourdir:'étourdir',saignement:'faire saigner',malediction:'maudire',fracture:'fracturer',gel:'geler'}[q.type]} (${q.chance} %)`);break}
   case'esquive_mod':{const d=e.val||0;T.st.esqb+=d;if(mg)o.mdelta.push({undo:()=>{T.st.esqb-=d}});L('stat',`Esquive de ${nom(T)} ${d>=0?'+':''}${d} %`,{c:id(T),k:'esq',d});break}
   case'reset_ultime':T.uh.forEach(h=>{h.uses=0;h.last=-99});L('statut',`L'ultime de ${nom(T)} est réinitialisé !`,{c:id(T)});break;
   case'mort_evitee':if(!mg){o.st.evite=(o.st.evite||0)+1;L('statut',`${nom(o)} est protégé : il évitera la mort une fois`,{c:id(o)})}break;   // en magie : lue directement dans dmg() ; en ultime / piège : protection posée à l'activation
   case'detruire':{
    if(e.carte==='magie'&&(x.magOn||x.magAnnT)){const etaitOn=x.magOn;x.magOn=0;x.magAnnT=0;if(etaitOn)undo(x);L('vol',`La magie de ${x.pseudo} est détruite`,{c:id(x),k:'magie_annulee'})}
    else if(e.carte==='piege'&&x.pieOn){x.pieOn=0;L('vol',`Le piège de ${x.pseudo} est détruit`,{c:id(x),k:'piege_detruit',carte:x.pie.nom,img:x.pie.image||null})}
    break}
   case'voler':{const n=parseInt(e.tourdecl,10)||0;
    if(n>1&&(mg||SRC==='magie')&&!rt){const V={e,at:n,src:SRC};o.st.volDiff.push(V);U(()=>{o.st.volDiff=o.st.volDiff.filter(z=>z!==V)});   // magie : le vol attend le début du X-ième tour de la carte
     L('statut',`${nom(o)} volera ${e.carte==='piege'?'le piège':'la magie'} adverse au début de son tour ${n}`,{c:id(o),k:'vol_prevu'});break}
    voler(o,x,e.carte,SRC,e.duree);break}
   case'equiper':{const c=tire(o.deck.filter(k=>k!==o.mag&&k!==o.pie),e.carte);if(c){if(e.carte==='magie'){o.mag=c;o.magOn=1;fx(c.effet,o,x,true)}else{o.pie=c;o.pieOn=1;o.decl=0}L('vol',`${nom(o)} équipe ${c.nom}`)}break}
   default:L('inconnu',`Effet non géré par le moteur : ${e.type}`);
  }
 }
 // Malédiction : l'ATQ de la cible baisse de n points à chaque fin de tour pendant t tours (se cumule)
 // ── Statuts à TIK (brûlure, poison, saignement, malédiction) ──
 // « t tours » = t TIK au total, comptés sur les tours de la carte touchée. Malédiction : TIK au début de son tour, avant son attaque. Brûlure, poison, saignement : TIK à la fin de son tour, juste après son attaque.
 // Un seul statut de chaque sorte par carte : il garde la même intensité à chaque tik. Si quelque chose le réapplique par-dessus, l'intensité s'additionne et la durée repart à zéro.
 // DÉTONATION : consume la brûlure, le poison et le saignement de la cible et inflige d'un coup tous leurs dégâts restants (+ bonus %, + X dégâts fixes)
 function detoner(o,t,q,muet,mis){if(t.pv<=0)return;const z=t.st,parts=[];let tot=0;
  const cs=q.conso==null||q.conso===''?100:Math.max(0,+q.conso||0);   // % des dégâts restants des statuts infligés d'un coup (100 = tout) ; les statuts sont TOUJOURS purgés
  z.dots.forEach(d=>{tot+=(d.n||0)*Math.max(0,d.t);parts.push(d.k==='poison'?'poison':'brulure')});
  z.bleeds.forEach(b=>{tot+=rd(t.max*(b.pct||0)/100)*Math.max(0,b.t);parts.push('saignement')});
  if(cs!==100)tot=rd(tot*cs/100);
  const bon=q.bonus==null||q.bonus===''?50:(+q.bonus||0),brut=Math.max(0,+q.val||0);
  if(!parts.length&&!brut){if(!muet)L('statut',`${nom(t)} n'a aucun statut à faire exploser`,{c:id(t),k:'deto_rien'});return}
  z.dots=[];z.bleeds=[];
  L('detonation',mis?`💥 Le missile explose sur ${nom(t)} !`:`💥 DÉTONATION sur ${nom(t)} !`,{c:id(t),from:id(o),parts,...(mis?{mis:1}:{})});
  parts.forEach(k=>L('finstatut',`${k==='brulure'?'La brûlure':k==='poison'?'Le poison':'Le saignement'} de ${nom(t)} explose`,{c:id(t),k}));
  let n0=rd(tot*(1+bon/100));if(t.st.solide>0&&n0>0){n0=rd(n0/2);L('statut',`${nom(t)} est solidifié : la détonation est amortie de moitié`,{c:id(t),k:'solide_bloque'})}   // solidification : moitié des dégâts des statuts
  n0+=brut;   // dégâts bruts de l'explosion : jamais réduits
  NOREV=1;let n;try{n=dmg(o,t,n0)}finally{NOREV=0}   // une carte tuée par l'explosion ne peut pas être réanimée
  L('degats',`${nom(t)} subit ${n} dégâts (${mis?'missile':'détonation'})`,{c:id(t),n,k:'detonation'});
  const rc=Math.max(0,+q.recul||0);if(rc>0&&o!==t&&o.pv>0){let b;NOREV=1;try{b=dmg(t,o,rd(n*rc/100))}finally{NOREV=0}if(b>0)L('degats',`${nom(o)} subit ${b} dégâts (souffle de l'explosion)`,{c:id(o),n:b,k:'detonation'})}return n}   // dégâts de zone : le poseur prend X % du souffle
 // Défenses contre les souffles et les missiles (comme contre une attaque)
 function esquiver(d){const ech=Math.min(reg.plafondEsquive,d.pl.filter(p=>p.type==='esquive').reduce((q,p)=>q+(p.chance||0),0)+d.st.esqb);return ech>0&&roll(ech)}
 function reduire(d,n){d.pl.filter(p=>p.type==='reduc_degats').forEach(p=>{if(n>0&&roll(p.chance)){L('bloque',`${nom(d)} bloque une partie des dégâts`,{c:id(d)});n=Math.max(0,n-amt(p,n))}});return n}
 function renvoiTot(d,n){if(n<=0)return 0;let t=0;d.pl.filter(p=>p.type==='renvoi').forEach(p=>{t+=amt(p,n)});d.st.ren.forEach(R=>{t+=n*R.pct/100});return rd(t)}
 function renvoyer(d,a,n){if(n<=0||a.pv<=0)return;d.pl.filter(p=>p.type==='renvoi').forEach(p=>{const b=dmg(d,a,amt(p,n));L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:id(a),n:b,k:'renvoi',from:id(d)})});
  d.st.ren.forEach(R=>{const b=dmg(d,a,n*R.pct/100);if(b>0)L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:id(a),n:b,k:'renvoi',from:id(d)})})}
 function tikUn(s,kind,d){const x=adv(s);
  if(kind==='dots'){const n=dmg(x,s,d.n);L('degats',`${nom(s)} subit ${n} (${d.k})`,{c:id(s),n,k:d.k})}
  else if(kind==='bleeds'){const n=dmg(x,s,rd(s.max*d.pct/100));L('degats',`${nom(s)} subit ${n} (saignement)`,{c:id(s),n,k:'saignement'})}
  else if(kind==='curses'){const q=Math.min(d.n,s.atq);s.atq-=q;s.st.cl+=q;if(q>0){s.st.cret.push({q,t:d.D||1});L('stat',`ATQ de ${nom(s)} −${q} (malédiction)`,{c:id(s),k:'malediction_tick',s:'ATQ',d:-q})}}   // chaque baisse est rendue « durée de la malédiction » tours plus tard
  if(!s.st[kind].includes(d)||s.pv<=0)return;   // purifié ou mort pendant le TIK : rien de plus
  if(--d.t>0)return;
  s.st[kind]=s.st[kind].filter(z=>z!==d);
  const FIN={dots:()=>[d.k==='poison'?'poison':'brulure',`${d.k} de ${nom(s)} se termine`],bleeds:()=>['saignement',`Le saignement de ${nom(s)} s'arrête`],curses:()=>['malediction',`La malédiction de ${nom(s)} se termine`]}[kind]();
  L('finstatut',FIN[1],{c:id(s),k:FIN[0]})}
 function maudire(dst,n,t){let d=dst.st.curses[0];const cum=!!d;if(d){d.n+=n;d.t=Math.max(d.t,t);d.D=Math.max(d.D||0,t)}else{d={n,t,D:t};dst.st.curses.push(d)}   // réapplication : l'intensité s'additionne et la durée repart à zéro
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
 function poolAlea(o,x){
  const ri=(a,b)=>a+Math.floor(r()*(b-a+1)),pv=(b,a,z)=>Math.max(1,rd(b*ri(a,z)/100));
  return [
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
   ['Souffle élémentaire',()=>({type:'souffle',val:pv(o.max,4,10),statut:['brulure','gel','malediction','poison','saignement','fatigue'][ri(0,5)],chance:ri(40,80),sval:ri(5,15),tours:ri(2,3)})],
   ['Exécution (attaque)',()=>({type:'execution',chance:ri(30,60),seuilexec:ri(8,15)})],
   ['Exécution (marques)',()=>({type:'execution_direct',nbmarques:ri(1,2),seuilexec:ri(8,15)})],
   ['Transcendance',()=>({type:'transcendance',tours:ri(2,4),patq:ri(10,20),ppv:ri(10,20),vv1:10,vv2:20,vv3:30})],
   ['Solidification',()=>({type:'solidification',chance:ri(50,100),tours:ri(1,3)})],
   ['Gel',()=>({type:'gel',ciblem:'adversaire',annul:ri(30,60),stunch:ri(10,30),tours:ri(2,3)})],
   ['Fracture',()=>({type:'fracture',ciblem:'adversaire',fchance:ri(40,70),degfrac:pv(o.max,3,8),tours:ri(2,3)})],
   ['Fatigue adverse',()=>({type:'fatigue',ciblem:'adversaire',fatval:ri(15,35),u:'pct',fattours:ri(2,3)})],
   ['Rage',()=>({type:'rage',ragev:ri(20,50),u:'pct',ragetours:ri(2,3),fatval:ri(15,30),fattours:ri(1,2)})],
   ['Purification',()=>({type:'purification',cible:'soi'})],
   ['Régénération',()=>({type:'soin_tours',val:ri(5,12),u:'pct',tours:ri(2,4)})],
   ['Esquive en hausse',()=>({type:'esquive_mod',cible:'soi',val:ri(15,30)})],
   ["Vol de l'ultime adverse",()=>({type:'vol_ultime'})],
   ["Copie de l'ultime adverse",()=>({type:'copie_ultime'})],
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
  ]}
 function effetAlea(o,x){const POOL=poolAlea(o,x);
  const[lab,mk]=POOL[Math.floor(r()*POOL.length)],e=mk();
  L('statut',`Effet aléatoire de ${nom(o)} : ${lab} !`,{c:id(o),k:'alea'});
  fx(e,o,x,false)}
 // Passifs tirables au hasard (Programmation sans liste), valeurs adaptées aux cartes
 function poolPassifs(o,x){
  const ri=(a,b)=>a+Math.floor(r()*(b-a+1)),pv=(b,a,z)=>Math.max(1,rd(b*ri(a,z)/100));
  return [
   ['Esquive',()=>({type:'esquive',chance:ri(15,30)})],
   ['Vol de vie',()=>({type:'vol_pct_atq',chance:ri(40,70),pctatq:ri(20,40)})],
   ['Brûlure',()=>({type:'brulure',chance:ri(30,50),pctpv:ri(3,6),tours:ri(2,3)})],
   ['Poison',()=>({type:'poison',chance:ri(30,50),degtour:pv(x.max,3,6),tours:ri(2,3)})],
   ['Saignement',()=>({type:'saignement',chance:ri(30,50),pctpv:ri(3,5),reducsoin:ri(30,50),tours:ri(2,3)})],
   ['Malédiction',()=>({type:'malediction',chance:ri(30,50),val:pv(o.atq,8,15),tours:ri(2,3)})],
   ['Étourdissement',()=>({type:'etourdir',chance:ri(15,30),tours:1})],
   ['Multi-frappe',()=>({type:'multi_frappe',chance:ri(30,50),frappes:2})],
   ['Enchaînement',()=>({type:'enchainement',chance:ri(30,50),max:3})],
   ['Réduction de dégâts',()=>({type:'reduc_degats',chance:ri(30,50),val:ri(20,40),u:'pct'})],
   ['Renvoi de dégâts',()=>({type:'renvoi',val:ri(15,30),u:'pct'})],
   ['Régénération',()=>({type:'soin_tour',val:ri(3,7),u:'pct'})],
   ['ATQ qui monte',()=>({type:'atq_tours',val:ri(10,20),u:'pct',tours:2})],
   ['Détonation',()=>({type:'detonation',chance:ri(20,40)})]
  ]}
 function geler(d,ann,sn,t){d.st.frost.push({ann,sn,t});L('statut',`${nom(d)} est gelé (${ann} % d'attaque annulée, ${sn} % d'être étourdi, ${t} tour${t>1?'s':''}) !`,{c:id(d),k:'gel'})}
 function fracturer(d,fc,dg,t){if(d.st.solide>0){d.st.solide=0;L('statut',`La solidification de ${nom(d)} se brise !`,{c:id(d),k:'solide_brise'})}d.st.fract.push({fc,dg,t});L('statut',`${nom(d)} est fracturé (${fc} % de se blesser en attaquant, −${dg} PV, ${t} tour${t>1?'s':''}) !`,{c:id(d),k:'fracture'})}
// Purification : retire les statuts négatifs de t (sauf l'étourdissement) et lui rend l'ATQ perdu par malédiction
 function purifier(t,silent){const z=t.st,pk=[];z.pg=(z.pg||0)+1;
  z.dots.forEach(d=>pk.push(d.k==='poison'?'poison':'brulure'));z.curses.forEach(()=>pk.push('malediction'));z.bleeds.forEach(()=>pk.push('saignement'));z.frost.forEach(()=>pk.push('gel'));z.fat.forEach(()=>pk.push('fatigue'));z.fract.forEach(()=>pk.push('fracture'));
  const etd=z.skip>0||z.blk>0,rest=z.cl,restF=z.fat.reduce((q,f)=>q+(f.q||0),0);if(etd)pk.push('annule');z.dots=[];z.curses=[];z.bleeds=[];z.frost=[];z.fract=[];z.fat=[];z.skip=0;z.blk=0;z.cl=0;z.cret=[];   // l'étourdissement n'est JAMAIS retiré : il fait toujours sauter la prochaine attaque
  if(!silent)L('statut',`${nom(t)} est purifié${pk.length||rest?(z.stun>0?" (sauf l'étourdissement)":''):(z.stun>0?" (l'étourdissement reste)":' (rien à retirer)')} !`,{c:id(t),k:'purif'});
  if(rest>0){t.atq+=rest;L('stat',`ATQ de ${nom(t)} +${rest} (malédiction levée)`,{c:id(t),k:'mod',s:'ATQ',d:rest})}
  if(restF>0){t.atq+=restF;L('stat',`ATQ de ${nom(t)} +${restF} (fatigue levée)`,{c:id(t),k:'mod',s:'ATQ',d:restF})}
  if(!silent){const LB={annule:"annulation d'attaque",brulure:'brûlure',malediction:'malédiction'};pk.forEach(k=>L('finstatut',`${LB[k]||k} dissipé${k==='annule'?'e':''}`,{c:id(t),k:k==='annule'?'etourdi':k}))}}
 // ── VOL d'une magie ou d'un piège ──
 // La carte volée vient se placer du côté du voleur : à la place du piège si c'est un piège qui vole, sinon à sa place de magie / de piège.
 // duree : nombre de tours DU VOLEUR pendant lesquels il la garde ; ensuite elle retourne à son propriétaire (vide ou 0 = jusqu'à la fin du combat).
 function voler(o,x,carte,src,duree){const D=Math.max(0,parseInt(duree,10)||0),dur=D?` (${D} tour${D>1?'s':''})`:'';
  if(carte==='magie'&&(x.magOn||x.magAnnT)){const etaitOn=x.magOn;x.magOn=0;x.magAnnT=0;x.magVol=1;if(etaitOn)undo(x);
   const sur=src==='piege'?'piege':'magie',prev=src==='piege'?{pie:o.pie,on:0,decl:o.decl,pbl:o.pbl}:null;if(src==='piege')o.pieOn=0;   // volée par un piège : elle prend la place de ce piège (qui est donc consommé)
   L('vol',`${o.pseudo} vole la magie de ${x.pseudo} : ${x.mag.nom}${dur}`,{c:id(o),k:'vol_carte',from:id(x),to:id(o),de:'magie',sur,carte:x.mag.nom,img:x.mag.image||null,duree:D});
   const n0=o.mdelta.length;fx(x.mag.effet,o,x,true);
   if(D>0)o.st.vols.push({t:D,de:'magie',sur,x,card:x.mag,prev,del:o.mdelta.splice(n0)})}   // ses effets sont gardés à part, pour être retirés au retour
  else if(carte==='piege'&&x.pieOn){x.pieOn=0;
   const prev={pie:o.pie,on:src==='piege'?0:o.pieOn,decl:o.decl,pbl:o.pbl},xd=x.decl;o.pie=x.pie;o.pieOn=1;o.decl=0;o.pbl=0;   // le piège volé prend la place du piège du voleur
   L('vol',`${o.pseudo} vole le piège de ${x.pseudo} : ${x.pie.nom}${dur}`,{c:id(o),k:'vol_carte',from:id(x),to:id(o),de:'piege',sur:'piege',carte:x.pie.nom,img:x.pie.image||null,duree:D});
   if(D>0)o.st.vols.push({t:D,de:'piege',sur:'piege',x,card:x.pie,prev,xd})}
 }
 // Fin d'un vol à durée : la carte retourne chez son propriétaire, et le voleur retrouve la carte qu'elle recouvrait
 function rendre(o,v){const x=v.x;if(x!==adv(o))return;
  const reste=c=>c&&!c.vide?{nom:c.nom,img:c.image||null}:null;
  if(v.de==='magie'){
   v.del.forEach(d=>{if(d.undo){d.undo();return}d.s[d.k]-=d.d;if(d.k==='max')d.s.pv=Math.min(d.s.pv,d.s.max)});   // le voleur perd les effets de la magie volée
   if(v.prev){o.pie=v.prev.pie;o.pieOn=v.prev.on;o.decl=v.prev.decl;o.pbl=v.prev.pbl}
   const ok=x.mag===v.card&&!x.magOn;x.magVol=0;
   L('vol',`${ok?'La magie retourne à '+x.pseudo:'La magie volée disparaît'} : ${v.card.nom}`,{c:id(x),k:'vol_retour',from:id(o),to:id(x),de:v.sur,sur:'magie',carte:v.card.nom,img:v.card.image||null,reste:reste(v.sur==='piege'?v.prev&&v.prev.pie:o.mag),ok:ok?1:0});
   if(ok&&v.card.effet){x.magOn=1;fx(v.card.effet,x,o,true,true);S.forEach(k=>k.pend=1)}}   // de retour : ses effets « une seule fois » ne se rejouent pas
  else{const tient=o.pie===v.card&&o.pieOn,max=(v.card.effet&&v.card.effet.declenchements)||1,used=v.xd+(tient?o.decl:0);
   o.pie=v.prev.pie;o.pieOn=v.prev.on;o.decl=v.prev.decl;o.pbl=v.prev.pbl;
   const ok=tient&&x.pie===v.card&&!x.pieOn;if(ok){x.decl=Math.min(used,max);x.pieOn=x.decl<max?1:0;x.pbl=0}
   L('vol',`${ok?'Le piège retourne à '+x.pseudo:'Le piège volé disparaît'} : ${v.card.nom}`,{c:id(x),k:'vol_retour',from:id(o),to:id(x),de:'piege',sur:'piege',carte:v.card.nom,img:v.card.image||null,reste:reste(v.prev.pie),ok:ok?1:0,epuise:ok&&!x.pieOn?1:0})}
 }
 function undo(s){s.mdelta.forEach(d=>{if(d.undo){d.undo();return}d.s[d.k]-=d.d;if(d.k==='max')d.s.pv=Math.min(d.s.pv,d.s.max)});s.mdelta=[]}

 function ultime(s){
  if(s.pv<=0)return;
  for(const h of s.uh.slice()){const u=h.u;if(!u||!u.type)continue;
   if(u.utilisations>0&&h.uses>=u.utilisations)continue;
   if(tour-h.last<(u.delai_tours||0))continue;
   const ud=u.udecl,uX=parseInt(u.udx,10)||50,etat=ud==='pv_sous'?s.pv/s.max*100<uX:ud==='adv_pv_sous'?adv(s).pv>0&&adv(s).pv/adv(s).max*100<uX:false;   // déclencheurs d'état : vérifiés au début de son tour
   if(!((u.apres_tours&&tour>=u.apres_tours)||(u.sur_carte&&s.pend)||h.trg||etat))continue;
   h.uses++;h.last=tour;s.pend=0;h.trg=0;L('ultime',`ULTIME de ${nom(s)} !`,{c:id(s)});{const s0=SRC;SRC='ultime';fx(u,s,adv(s));SRC=s0}scan({t:'ultime',by:id(s)});if(over())break}
 }
 function attaque(a){
  const d=adv(a),ia=id(a),idd=id(d);
  if(a.st.avale){L('statut',`${nom(a)} a la bouche pleine : il n'attaque pas`,{c:ia,k:'av_bloque'});return}   // avalage : aucune des deux cartes n'attaque
  if(a.st.avaleur){L('statut',`${nom(a)} est dans le ventre de ${nom(a.st.avaleur)} : il n'attaque pas`,{c:ia,k:'av_bloque'});return}
  if(a.st.repos>0){a.st.repos--;L('statut',`${nom(a)} digère : il n'attaque pas`,{c:ia,k:'digere'});return}
  if(a.st.stun){a.st.stun--;L('statut',`${nom(a)} est étourdi, il n'attaque pas`,{c:ia,k:a.st.stun>0?'etourdi_tour':'etourdi_fin'});return}
  if(a.st.skip){a.st.skip=0;L('bloque',`L'attaque de ${nom(a)} est annulée`,{c:id(adv(a))});return}
  const blq=a.st.blk>0;if(blq)a.st.blk=0;   // attaque bloquée : elle a lieu, chaque frappe touche à 0 dégât
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
  let avF=0;   // avalage : une seule marque (ou tentative) par attaque, même avec plusieurs frappes
  for(let k=0;k<multi&&d.pv>0;k++){
   if(k>=base)L('attaque',`${nom(a)} enchaîne une frappe de plus !`,{c:ia,k:'enchaine'});
   else if(base>1)L('frappe',`Frappe ${k+1}/${base} de ${nom(a)}`,{c:ia});
   const ech=Math.min(reg.plafondEsquive,d.pl.filter(p=>p.type==='esquive').reduce((q,p)=>q+(p.chance||0),0)+d.st.esqb);if(ech>0&&roll(ech)){L('esquive',`${nom(d)} esquive !`,{c:idd});continue} // l'esquive annule aussi les effets associés
   if(!avF&&d.pv>0&&d.st.av>=2&&!a.st.avale&&!d.st.avaleur){const q=[...a.pl,...a.st.atkfx].find(q=>q.type==='avalage');   // 3e attaque réussie : l'avalage remplace les dégâts (s'il échoue, les marques tombent et le coup porte normalement)
    if(q){avF=1;if(avaler(a,d,q))break}}
   let n=Math.max(0,a.atq*(a.st.dbl>0?2:1)+a.st.bonus+a.st.rage.reduce((q,g)=>q+g.n,0));a.st.bonus=0;   // rage : dégâts en plus · fatigue : dégâts en moins
   let bloquee=blq;if(blq){n=0;L('bloque',`L'attaque de ${nom(a)} est bloquée`,{c:idd})}
   else d.pl.filter(p=>p.type==='reduc_degats').forEach(p=>{if(roll(p.chance)){L('bloque',`${nom(d)} bloque une partie des dégâts`,{c:idd});n=Math.max(0,n-amt(p,n));if(n<=0)bloquee=true}});   // tout absorbé = attaque bloquée
   d.rt++;
   for(const q of [...a.pl,...a.st.atkfx])if(q.type==='execution'&&d.pv>0&&roll(q.chance==null||q.chance===''?100:+q.chance))marquer(d,1,q.seuilexec);   // Exécution : la marque se pose AVEC le coup, avant ses dégâts
   if(d.pv>0&&d.st.marques>=3&&d.pv-n<d.max*(d.st.mseuil||10)/100)n=executer(a,d);   // 3 marques et le coup la laisse sous le seuil : ce coup EST l'exécution (« évite la mort » ne joue pas, aucun soin ne passe avant)
   else{n=dmg(a,d,n);L('degats',`${nom(d)} subit ${n} dégâts`,{c:idd,n})}
   if(a.st.transc&&d.pv>0){const z=d.st;if(z.dots.length||z.curses.length||z.bleeds.length||z.frost.length||z.fract.length||z.fat.length||z.skip>0||z.blk>0||z.cl>0)purifier(d)}   // Transcendance : chaque coup qui touche purifie l'adversaire
   d.pl.filter(p=>p.type==='renvoi').forEach(p=>{if(n>0){const b=dmg(d,a,amt(p,n));L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})}});
   d.st.ren.forEach(R=>{const b=dmg(d,a,n*R.pct/100);if(b>0)L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})});
   if(a.pv<=0||over())return;
   if((n>0||bloquee)&&d.pv>0){   // coup bloqué : pas de vol de vie (aucun dégât), mais étourdissement et statuts s'appliquent
    if(n>0){if(a.st.transc&&a.st.trA){const p=a.st.trA.vv[a.st.transc-1]||0;if(p>0)heal(a,rd(n*p/100))}   // Transcendance : vol de vie du niveau atteint (% des dégâts infligés)
    a.pl.filter(p=>p.type==='vol_pct_atq').forEach(p=>{if(roll(p.chance))heal(a,rd(n*p.pctatq/100))})}
    {const SQ=[...a.pl,...a.st.atkfx].filter(q=>q.type==='etourdir'&&(+q.chance||0)>0).map(q=>({...q,chance:+q.chance})),ec=SQ.reduce((q,p)=>q+p.chance,0);   // chances d'étourdir cumulables (passifs + effets de magie)
     const ess=Math.max(1,...SQ.map(q=>parseInt(q.essais,10)||1));let okS=false;for(let k=0;k<ess&&ec>0&&!okS;k++)okS=roll(Math.min(100,ec));
     if(ec>0&&okS){let u=r()*ec,src=SQ[SQ.length-1];for(const q of SQ){if(u<q.chance){src=q;break}u-=q.chance}   // la durée est celle de la source qui a déclenché
      const T=Math.max(1,parseInt(src.tours,10)||1);if(d.st.solide>0)L('statut',`${nom(d)} est solidifié : l'étourdissement n'a aucun effet`,{c:idd,k:'solide_bloque'});else{d.st.stun=Math.max(d.st.stun,T);L('statut',`${nom(d)} est étourdi${T>1?` (${T} tours)`:''} !`,{c:idd,k:'etourdi'})}}}
    for(const q of [...a.pl,...a.st.atkfx])if(q.type==='detonation'&&d.pv>0&&roll(q.chance==null||q.chance===''?100:+q.chance))detoner(a,d,q,true);   // détonation AVANT les nouveaux statuts du coup : elle consume ceux déjà posés
    if(d.pv<=0||a.pv<=0||over())return;
    for(const q of [...a.pl,...a.st.atkfx]){   // statuts donnés par les passifs et par les effets d'attaque de base
     if(q.type==='brulure'&&roll(q.chance))dotUn(d,'brûlure',rd(d.max*(q.pctpv||0)/100),q.tours||1);
     if(q.type==='poison'&&roll(q.chance))dotUn(d,'poison',q.degtour||0,q.tours||1);
     if(q.type==='saignement'&&roll(q.chance))saigner(d,q.pctpv||0,q.reducsoin||0,q.tours||1);
     if(q.type==='malediction'&&roll(q.chance))maudire(d,q.val||0,q.tours||1);
     if(q.type==='fracture'&&roll(q.chance))fracturer(d,q.fchance||0,q.degfrac||0,q.tours||1);
     if(q.type==='gel'&&roll(q.chance))geler(d,q.annul||0,q.stunch||0,q.tours||1);
     if(q.type==='fatigue'&&roll(q.chance))fatiguer(d,q.fatval||0,q.u,q.fattours||1)}
   }
   if(!avF&&d.pv>0&&!a.st.avale&&!d.st.avaleur){const q=[...a.pl,...a.st.atkfx].find(q=>q.type==='avalage');   // avalage : 🍴 à la 1re attaque réussie, 🔪 à la 2e
    if(q){avF=1;if(d.st.av<2&&roll(q.chance==null||q.chance===''?100:+q.chance))marquerAv(d,1)}}
   if(over())return;
   if(a.st.avale)break;
  }
  scan({t:'attaque',by:ia});
 }
 // Début du tour d'une carte : malédiction (l'ATQ baisse), puis régénération — avant l'ultime et l'attaque (les autres TIK de statut sont en fin de tour : voir tikFinDeTour)
 // Exécution : marques sur la cible (3 maximum). À 3 marques, une attaque qui la laisse sous X % de ses PV max (10 % par défaut) l'exécute,
 //   même si elle devait éviter la mort. La réanimation reste possible. Les marques ne se purgent pas ; elles disparaissent quand la carte meurt.
 function marquer(d,n,seuil){if(d.pv<=0)return;const s=parseInt(seuil,10);if(Number.isFinite(s)&&s>0)d.st.mseuil=Math.max(d.st.mseuil,s);
  for(let k=0;k<n&&d.st.marques<3;k++){d.st.marques++;L('statut',`${nom(d)} reçoit une marque d'exécution (${d.st.marques}/3)`,{c:id(d),k:'marque',n:d.st.marques})}}
 function executer(a,d){L('statut',`${nom(d)} est EXÉCUTÉ !`,{c:id(d),k:'execution'});EXEC=1;const n=dmg(a,d,d.pv);EXEC=0;d.st.marques=0;L('degats',`${nom(d)} subit ${n} dégâts (exécution)`,{c:id(d),n,k:'execution'});return n}
 // AVALAGE : 🍴 fourchette à la 1re attaque réussie, 🔪 couteau à la 2e, puis à la 3e attaque réussie la carte tente d'avaler sa cible.
 //   Il faut des PV actuels ≥ ratio × l'ATQ de la cible (3 par défaut), sinon les marques tombent. Une fois avalée, la cible est mâchée à chaque tour de la carte
 //   qui avale (X % de ses PV max ou actuels), X fois (3), puis recrachée ; la carte qui avale digère ensuite X tours sans attaquer. Pendant l'avalage, aucune des deux n'attaque
 //   et tout ce qui visait la carte avalée touche la carte qui avale. Si la cible a des statuts négatifs (brûlure, gel, poison, malédiction, saignement, fatigue),
 //   ils passent tout de suite à la carte qui avale (×1,5 en intensité et en durée) : une seule mâche, puis la cible est recrachée.
 const NEG_AV=z=>z.dots.length||z.frost.length||z.curses.length||z.bleeds.length||z.fat.length;
 function marquerAv(d,n){if(d.pv<=0||d.st.avaleur)return;for(let k=0;k<n&&d.st.av<2;k++){d.st.av++;L('statut',`${nom(d)} reçoit ${d.st.av===1?'la fourchette 🍴':'le couteau 🔪'} (avalage ${d.st.av}/2)`,{c:id(d),k:'av_marque',n:d.st.av})}}
 function avaler(a,d,q){const ratio=Math.max(0,q.ratio==null||q.ratio===''?3:+q.ratio||0);d.st.av=0;
  if(a.pv<ratio*d.atq){L('statut',`${nom(a)} n'a pas assez de PV pour avaler ${nom(d)} (il faut ${ratio} × son ATQ) : les marques tombent`,{c:id(d),k:'av_rate'});return false}
  const A={v:d,n:0,max:Math.max(1,parseInt(q.tours,10)||3),pct:q.pctmache==null||q.pctmache===''?10:+q.pctmache||0,base:q.machebase==='actuels'?'actuels':'max',repos:Math.max(0,parseInt(q.repos,10)||0),neuf:1,unique:0};
  d.st.avaleur=a;a.st.avale=A;L('statut',`${nom(a)} AVALE ${nom(d)} !`,{c:id(a),k:'avale',cible:id(d)});
  if(NEG_AV(d.st)){A.unique=1;transfertAv(a,d)}
  return true}
 function transfertAv(a,d){const z=d.st,T=t=>Math.ceil((t||1)*1.5),dots=z.dots.slice(),fr=z.frost.slice(),cu=z.curses.slice(),bl=z.bleeds.slice(),fa=z.fat.slice(),rest=z.cl+fa.reduce((q,f)=>q+(f.q||0),0);
  const ks=[...new Set([...dots.map(x=>x.k==='poison'?'poison':'brulure'),...(fr.length?['gel']:[]),...(cu.length?['malediction']:[]),...(bl.length?['saignement']:[]),...(fa.length?['fatigue']:[])])];
  z.dots=[];z.frost=[];z.curses=[];z.cl=0;z.cret=[];z.bleeds=[];z.fat=[];
  L('statut',`Les statuts de ${nom(d)} passent à ${nom(a)}, plus forts (×1,5) !`,{c:id(a),k:'av_transfert',from:id(d),ks});
  ks.forEach(k=>L('finstatut',`${nom(d)} perd son statut (${k})`,{c:id(d),k}));
  if(rest>0){d.atq+=rest;L('stat',`ATQ de ${nom(d)} +${rest} (statuts partis)`,{c:id(d),k:'mod',s:'ATQ',d:rest})}
  dots.forEach(x=>dotUn(a,x.k,rd(x.n*1.5),T(x.t)));fr.forEach(f=>geler(a,Math.min(100,rd(f.ann*1.5)),Math.min(100,rd(f.sn*1.5)),T(f.t)));
  cu.forEach(c=>maudire(a,rd(c.n*1.5),T(c.t)));bl.forEach(b=>saigner(a,rd(b.pct*1.5),Math.min(100,rd(b.r*1.5)),T(b.t)));fa.forEach(f=>fatiguer(a,rd(f.n*1.5),'pts',T(f.t)))}
 function macher(s){const A=s.st.avale;if(!A)return;const v=A.v;
  if(v!==adv(s)||v.pv<=0){recracher(s,false);return}
  if(A.neuf){A.neuf=0;return}   // avalée pendant ce tour : la mâche commence à son tour suivant
  A.n++;const n=dmg(s,v,(A.base==='actuels'?v.pv:v.max)*A.pct/100);
  L('degats',`${nom(s)} mâche ${nom(v)} : ${n} dégâts${A.unique?'':` (${A.n}/${A.max})`}`,{c:id(v),n,k:'mache',by:id(s)});
  if(over())return;
  if(A.unique)recracher(s,false);else if(A.n>=A.max)recracher(s,true)}
 function recracher(s,complet){const A=s.st.avale;if(!A)return;const v=A.v;s.st.avale=null;if(v.st.avaleur===s)v.st.avaleur=null;
  L('statut',`${nom(s)} recrache ${nom(v)} !`,{c:id(s),k:'recrache',cible:id(v)});
  if(complet&&A.repos>0){s.st.repos=A.repos;L('statut',`${nom(s)} digère : il n'attaquera pas pendant ${A.repos} tour${A.repos>1?'s':''}`,{c:id(s),k:'digere_debut'})}}
 // Transcendance en 3 niveaux : au début de ses X-ième, 2X-ième et 3X-ième tours en la possédant (X = 4 par défaut), avant son attaque, la carte monte d'un niveau (I, II, III), jusqu'à la fin du combat.
 //   À chaque niveau : purifiée + étourdissement retiré, ATQ +X % et PV max +X % (15 % par défaut, sur les stats du moment).
 //   Dès le niveau I, chacune de ses attaques qui touche purifie l'adversaire et lui vole de la vie : 10 / 20 / 30 % des dégâts infligés par défaut (vv1, vv2, vv3).
 function porterTransc(s,e,silent){if(s.st.transc||s.st.trA)return null;const v=(k,d)=>{const n=parseInt(e[k],10);return Number.isFinite(n)&&n>=0?n:d};
  s.st.trA={n:Math.max(1,v('tours',4)),pa:v('patq',15),pp:v('ppv',15),vv:[v('vv1',10),v('vv2',20),v('vv3',30)],base:s.st.joues};if(!silent)L('statut',`${nom(s)} porte la Transcendance : elle transcendera au début de son tour ${s.st.trA.n}`,{c:id(s),k:'transc_prep'});return s.st.trA}
 function transcender(s){const A=s.st.trA,niv=++s.st.transc,R=['I','II','III'][niv-1];L('statut',`${nom(s)} TRANSCENDE (niveau ${R}) : vol de vie ${A.vv[niv-1]} %`,{c:id(s),k:'transc',niv});
  if(s.st.stun>0){s.st.stun=0;L('finstatut',`${nom(s)} n'est plus étourdi`,{c:id(s),k:'etourdi'})}purifier(s);   // purification visible : chaque statut retiré est annoncé (et disparaît de l'écran)
  const da=rd(s.atq*A.pa/100),dp=rd(s.max*A.pp/100);if(da){s.atq+=da;L('stat',`ATQ de ${nom(s)} +${da}`,{c:id(s),k:'mod',s:'ATQ',d:da})}if(dp){s.max+=dp;s.pv+=dp;L('stat',`PV max de ${nom(s)} +${dp}`,{c:id(s),k:'mod',s:'PV max',d:dp})}}
 // Solidification : insensible à l'étourdissement pendant X tours de l'adversaire. Ne se purge pas ; une fracture la brise. Un étourdissement déjà en cours reste.
 function solidifier(s,ch,t){t=Math.max(1,parseInt(t,10)||1);if(!roll(ch))return false;s.st.solide=Math.max(s.st.solide,t);L('statut',`${nom(s)} se solidifie (${t} tour${t>1?'s':''}) : insensible à l'étourdissement`,{c:id(s),k:'solide'});return true}
 function debutTour(s){
  if(s.pv<=0)return;
  s.pl.forEach(p=>{if(p.type==='solidification'&&!(s.st.solide>0))solidifier(s,p.chance==null||p.chance===''?100:(+p.chance||0),p.tours)});   // passif : tirage à chacun de ses tours
  {let g=0;s.st.cret=s.st.cret.filter(c=>{if(--c.t>0)return true;g+=c.q;return false});   // malédiction qui s'estompe : chaque baisse revient, une par une, dans l'ordre où elle est arrivée
   g=Math.min(g,s.st.cl);if(g>0){s.atq+=g;s.st.cl-=g;L('stat',`ATQ de ${nom(s)} +${g} (la malédiction s'estompe)`,{c:id(s),k:'mod',s:'ATQ',d:g})}}
  for(const d of s.st.curses.slice()){if(s.pv<=0||over())return;if(!s.st.curses.includes(d))continue;tikUn(s,'curses',d)}   // malédiction : l'ATQ baisse AVANT l'attaque de la carte maudite
  if(s.pv<=0)return;
  s.pl.forEach(p=>{if(p.type==='bonus_frappe'&&s.rt>=(p.coups||1)){s.st.bonus=amt(p,s.atq);L('statut',`${nom(s)} prépare une contre-attaque renforcée`,{c:id(s),k:'bonus'})}});s.rt=0;   // frappé X fois depuis son dernier tour : bonus sur l'attaque qui suit
  s.st.hots=s.st.hots.filter(h=>{if(s.pv<=0)return false;heal(s,h.n);if(--h.t>0)return true;L('statut',`La régénération de ${nom(s)} se termine`);return false});
  if(s.pv<=0)return;const nt=s.st.joues+1,x=adv(s);   // vols : au début du X-ième tour de la carte (magie à vol différé, passif de vol)
  s.st.volDiff=s.st.volDiff.filter(V=>{if(nt<V.at)return true;voler(s,x,V.e.carte,V.src,V.e.duree);return false});
  s.pl.forEach((p,pi)=>{if(p.type==='voler'&&!s.st.pvol[pi]&&nt>=Math.max(1,parseInt(p.tourdecl,10)||1)){s.st.pvol[pi]=1;voler(s,x,p.carte,'passif',p.duree)}});
  if(s.pv<=0||over())return;if(!s.st.trA&&!s.st.transc){const p=s.pl.find(q=>q.type==='transcendance');if(p){porterTransc(s,p,true);s.st.trA.base=0}}   // passif : possédée dès le début du combat
  {const A=s.st.trA;if(A&&!A.stop&&s.st.transc<3&&nt-A.base>=A.n*(s.st.transc+1))transcender(s)}   // Transcendance : niveaux I, II, III au début de ses X-ième, 2X-ième, 3X-ième tours, AVANT l'attaque
  if(s.pv<=0||over())return;s.pl.filter(p=>p.type==='programmation').forEach(p=>{if(s.pv>0&&!over())programmer(s,p)});   // Programmation : au début de son tour, avant l'attaque
 }
 // PROGRAMMATION (collection mécanique) — passif : à chaque tour de la carte, X % de chances de lancer une programmation.
 //   Les N premières programmations sont PASSIVES, ensuite 50 % passive / 50 % active.
 //   Passive : la carte acquiert au hasard un passif ou un ultime de sa liste programmable ; il dort (aucun effet) jusqu'à la prochaine activation.
 //   Active : les passifs programmés s'activent (pour toujours), et TOUS les ultimes programmés (anciens compris) se lancent.
 //   Un « évite la mort » ou une réanimation déjà utilisés ne reviennent pas.
 function programmer(s,p){const P=s.st.pgm=s.st.pgm||{n:0,dp:[],du:[],au:[]};
  if(!roll(p.chance==null||p.chance===''?100:(+p.chance||0)))return;
  const lst=x=>!x?[]:x.briques?x.briques.filter(b=>b&&b.type):(x.type?[x]:[]),lib=q=>q.lib||String(q.type).replace(/_/g,' ');
  const N=Math.max(0,parseInt(p.nbpassif,10)||0),passive=P.n<N||roll(50);P.n++;
  if(passive){const pool=[...normPas(p.passifs).map(q=>({k:'p',q})),...lst(p.ultimes).map(q=>({k:'u',q}))];
   let it;
   if(pool.length)it=pool[Math.floor(r()*pool.length)];
   else{const k=r()<.5?'p':'u',P0=k==='p'?poolPassifs(s,adv(s)):poolAlea(s,adv(s)),[lb,mk]=P0[Math.floor(r()*P0.length)];it={k,q:{...mk(),lib:lb}}}   /* sans liste : au hasard parmi tous les passifs / ultimes du jeu */
   (it.k==='p'?P.dp:P.du).push(it.q);
   L('statut',`${nom(s)} se programme : ${it.k==='p'?'passif':'ultime'} « ${lib(it.q)} » (en attente)`,{c:id(s),k:'prog',quoi:it.k});return}
  L('statut',`${nom(s)} : PROGRAMMATION ACTIVE !`,{c:id(s),k:'prog_act'});
  if(P.dp.length){const n=P.dp.length;P.dp.forEach(q=>s.pl.push(q));P.dp=[];L('statut',`${n} passif${n>1?'s':''} programmé${n>1?'s':''} de ${nom(s)} ${n>1?"s'activent":"s'active"}`,{c:id(s),k:'prog_on'})}
  P.au.push(...P.du);P.du=[];
  for(const u of P.au){if(s.pv<=0||over())break;L('ultime',`ULTIME programmé de ${nom(s)} : ${lib(u)} !`,{c:id(s)});{const s0=SRC;SRC='ultime';fx(u,s,adv(s));SRC=s0}scan({t:'ultime',by:id(s)})}
 }
 // Fin du tour d'une carte : les durées qui dépendent de SES actions (rage, fatigue, gel, fracture, dégâts doublés) baissent d'un tour.
 // Un tour où elle est étourdie ou gelée compte aussi ; le tour de l'adversaire ne compte jamais.
 function finTourCarte(s){
  if(s.pv>0)s.st.joues++;
  {const x=adv(s);if(x.st.solide>0&&--x.st.solide===0)L('finstatut',`${nom(x)} n'est plus solidifié`,{c:id(x),k:'solide'})}   // la solidification protège pendant les tours de l'adversaire
  if(s.pv<=0)return;
  s.st.frost=s.st.frost.filter(f=>{if(--f.t>0)return true;L('finstatut',`${nom(s)} n'est plus gelé`,{c:id(s),k:'gel'});return false});
  s.st.fract=s.st.fract.filter(f=>{if(--f.t>0)return true;L('finstatut',`La fracture de ${nom(s)} guérit`,{c:id(s),k:'fracture'});return false});
  s.st.fat=s.st.fat.filter(f=>{if(--f.t>0)return true;L('finstatut',`La fatigue de ${nom(s)} se dissipe`,{c:id(s),k:'fatigue'});if(f.q>0){s.atq+=f.q;L('stat',`ATQ de ${nom(s)} +${f.q} (fatigue dissipée)`,{c:id(s),k:'mod',s:'ATQ',d:f.q})}return false});   // avant la rage : la fatigue qui suit la rage commence au tour d'après
  s.st.rage=s.st.rage.filter(g=>{if(--g.t>0)return true;L('finstatut',`La rage de ${nom(s)} retombe`,{c:id(s),k:'rage'});if(g.ft>0&&g.fv>0)fatiguer(s,g.fv,g.fu,g.ft,true);return false});
  if(s.st.dbl>0)s.st.dbl--;
  if(s.magAnnT>0&&--s.magAnnT===0&&!s.magOn&&s.mag.effet){const neuve=s.magNew;s.magOn=1;s.magAnn=0;s.magNew=0;   // fin de l'annulation : la magie revient (si elle n'avait jamais agi, elle agit en entier)
   L('statut',`La magie de ${s.pseudo} revient : ${s.mag.nom}`,{c:id(s),k:'magie_retour'});fx(s.mag.effet,s,adv(s),true,!neuve);S.forEach(k=>k.pend=1);if(s.pv<=0)return}
  s.st.ren=s.st.ren.filter(R=>--R.t>0);
  s.st.vols=s.st.vols.filter(v=>{if(--v.t>0)return true;rendre(s,v);return false});   // vol à durée : décompté sur les tours du voleur
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
    if(z.dots.length||z.curses.length||z.bleeds.length||z.frost.length||z.fract.length||z.fat.length||z.skip>0||z.blk>0||z.cl>0){s.st.pcnt[pi]=(s.st.pcnt[pi]||0)+1;purifier(s)}}
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
  ordre.forEach(s=>{if(s.mag.effet&&s.magOn&&s.magAnn!==1&&s.magAnn!==2&&!s.magVol){L('magie',`Magie de ${s.pseudo} : ${s.mag.nom}`,{c:id(s),carte:s.mag.nom,img:s.mag.image||null});fx(s.mag.effet,s,adv(s),true)}})};   // la magie du début ne compte pas comme « une carte s'active » (sinon l'ultime partait toujours au 1er tour)
 magies();
 // Prolongation : au dernier tour, si aucune carte n'est tombée, chaque joueur tire 3 nouvelles cartes de son deck (1 combattant, 1 magie, 1 piège) et le combat continue, jusqu'au KO.
 // Après reg.maxProlong prolongations (3 par défaut), la carte qui a le plus de PV l'emporte (PV égaux = match nul).
 const MAXP=reg.maxProlong??3;let manche=0,base=0;
 for(;;){
  for(tour=1;tour<=reg.maxTours&&!over();tour++){
   for(let oi=0;oi<2;oi++){const a=ordre[oi];if(over())break;L('tour',`Tour ${base+(tour-1)*2+oi+1}`,{c:id(a)});debutTour(a);if(over())break;ultime(a);if(over())break;attaque(a);if(over())break;macher(a);if(over())break;passifsTour(a);if(over())break;statutsCarte(a);if(over())break;finTourCarte(a)}
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


// ---------------- Serveur ----------------
const ERREURS = {
  JOUEUR_INCONNU: "Connecte-toi d'abord au site avec Twitch pour jouer.",
  DECK_INVALIDE: "Ton deck n'est plus valide : il faut maintenant 10 cartes (3 combattants, 3 magies, 3 pièges + 1 libre). Complète-le dans l'onglet Mon deck du site !",
  DEJA_JOUE: "Tu as déjà fait ton combat gratuit aujourd'hui, reviens demain !",
  ADVERSAIRE_INCONNU: "Joueur introuvable : il doit s'être connecté au site au moins une fois.",
  ADVERSAIRE_SOI: "Tu ne peux pas te défier toi-même.",
  ADVERSAIRE_SANS_DECK: "Ce joueur n'a pas de deck valide (10 cartes) pour l'instant.",
  AUCUN_ADVERSAIRE: "Aucun adversaire disponible pour l'instant.",
  DEJA_RECLAME: 'Tu as déjà récupéré ton booster quotidien, reviens demain !',
  AUCUN_BOOSTER_QUOTIDIEN: "Aucun booster n'est distribué en ce moment.",
};
const txt = (m, status = 200) => new Response(m, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

function entetes() {
  const K = Deno.env.get('SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: K, 'Content-Type': 'application/json' };
  if (!K.startsWith('sb_')) h.Authorization = 'Bearer ' + K;
  return h;
}
async function rpc(nom, args) {
  const U = Deno.env.get('SUPABASE_URL');
  const r = await fetch(`${U}/rest/v1/rpc/${nom}`, { method: 'POST', headers: entetes(), body: JSON.stringify(args) });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { ok: r.ok, data };
}
// Lecture / écriture directe d'une table (clé secrète)
async function rest(chemin, opt = {}) {
  const U = Deno.env.get('SUPABASE_URL');
  const r = await fetch(`${U}/rest/v1/${chemin}`, { method: opt.method || 'GET', headers: { ...entetes(), ...(opt.headers || {}) }, body: opt.body });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { ok: r.ok, data };
}
const jourParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });   // AAAA-MM-JJ
// Minuit (heure de Paris) du jour en cours, au format ISO avec décalage horaire (+01:00 l'hiver, +02:00 l'été)
function debutJourParis() {
  const j = jourParis(), midi = new Date(j + 'T12:00:00Z');
  const h = parseInt(midi.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }), 10);
  const dec = h - 12;
  return `${j}T00:00:00${dec >= 0 ? '+' : '-'}${String(Math.abs(dec)).padStart(2, '0')}:00`;
}
// Gains des combats (Admin > Réglages) : gold par victoire / défaite / nul, multiplicateur des soirées spéciales (×2…) avec heure de fin facultative
async function reglesGains() {
  const v = {};
  try {
    const r = await rest('reglages_jeu?cle=in.(gain_victoire,gain_defaite,gain_nul,multiplicateur_gains,multiplicateur_fin)&select=cle,valeur');
    if (r.ok && Array.isArray(r.data)) r.data.forEach(x => { v[x.cle] = x.valeur; });
  } catch { /* réglages illisibles : gains par défaut */ }
  const nb = (x, d) => { const n = parseFloat(x); return Number.isFinite(n) && n >= 0 ? n : d; };
  const fin = v.multiplicateur_fin ? new Date(v.multiplicateur_fin) : null;
  const mult = fin && !isNaN(fin.getTime()) && fin.getTime() < Date.now() ? 1 : Math.min(10, nb(v.multiplicateur_gains, 1));
  return { mult, gain: Math.round(nb(v.gain_victoire, REGLES.gain) * mult), perte: Math.round(nb(v.gain_defaite, REGLES.perte) * mult), nul: Math.round(nb(v.gain_nul, REGLES.nul) * mult) };
}
// Événement Bounty (Admin > Réglages) : une prime aléatoire (entre min et max gold) apparaît à la fin des combats
// et se partage entre les deux joueurs (ex. 70 % gagnant / 30 % perdant ; match nul : moitié-moitié). Heure de fin facultative.
async function reglesBounty() {
  const v = {};
  try {
    const r = await rest('reglages_jeu?cle=in.(bounty_actif,bounty_min,bounty_max,bounty_part_gagnant,bounty_chance,bounty_tout,bounty_fin)&select=cle,valeur');
    if (r.ok && Array.isArray(r.data)) r.data.forEach(x => { v[x.cle] = x.valeur; });
  } catch { return null; }
  if (String(v.bounty_actif) !== '1') return null;
  const fin = v.bounty_fin ? new Date(v.bounty_fin) : null;
  if (fin && !isNaN(fin.getTime()) && fin.getTime() < Date.now()) return null;
  const nb = (x, d, max) => { const n = parseFloat(x); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
  const min = Math.round(nb(v.bounty_min, 5, 100000)), max = Math.max(min, Math.round(nb(v.bounty_max, 90, 100000)));
  return { min, max, part: nb(v.bounty_part_gagnant, 70, 100), chance: nb(v.bounty_chance, 30, 100), tout: nb(v.bounty_tout, 10, 100) };
}
// Anti-farm : nombre maximum de combats entre deux mêmes joueurs par jour (Admin > Réglages, 0 = pas de limite)
async function limiteMemeAdversaire() {
  try {
    const r = await rest('reglages_jeu?cle=eq.combats_meme_adversaire_par_jour&select=valeur');
    if (r.ok && Array.isArray(r.data) && r.data[0]) { const n = parseInt(r.data[0].valeur, 10); if (Number.isFinite(n) && n >= 0) return n; }
  } catch { /* réglage illisible : valeur par défaut */ }
  return 3;
}
// Combats déjà joués aujourd'hui entre x et y, dans les deux sens (null si le compte est illisible : on ne bloque pas)
async function combatsEntre(x, y) {
  try {
    const r = await rest(`historique_combats?select=id&cree_le=gte.${encodeURIComponent(debutJourParis())}` +
      `&or=(and(joueur_a.eq.${x},joueur_b.eq.${y}),and(joueur_a.eq.${y},joueur_b.eq.${x}))`);
    return r.ok && Array.isArray(r.data) ? r.data.length : null;
  } catch { return null; }
}

// Rareté de chaque carte (couleur, nom) pour les effets de brillance pendant le combat — ne bloque jamais un combat en cas de souci
async function ajouterRaretes(cartes) {
  try {
    const ids = [...new Set(cartes.map((c) => c && c.id).filter((x) => x != null))];
    if (!ids.length) return;
    const r = await rest(`cartes?id=in.(${ids.join(',')})&select=id,raretes(nom,couleur,poids)`);
    if (!r.ok || !Array.isArray(r.data)) return;
    const m = {}; r.data.forEach((x) => { m[x.id] = Array.isArray(x.raretes) ? x.raretes[0] : x.raretes; });
    cartes.forEach((c) => { if (c && m[c.id]) c.rar = m[c.id]; });
  } catch (_) { /* sans rareté : pas de brillance, rien d'autre */ }
}

// Dos de carte choisi par chaque joueur (dos de base si aucun choix) — ne bloque jamais un combat en cas de souci
async function dosDe(ids) {
  const out = {};
  try {
    const rj = await rest(`joueurs?id=in.(${ids.join(',')})&select=id,dos_actif`);
    const rd = await rest('dos_cartes?select=id,image,par_defaut');
    const joueurs = rj.ok && Array.isArray(rj.data) ? rj.data : [], dos = rd.ok && Array.isArray(rd.data) ? rd.data : [];
    const base = dos.find(d => d.par_defaut);
    for (const id of ids) {
      const j = joueurs.find(x => x.id === id), choisi = j && j.dos_actif ? dos.find(d => d.id === j.dos_actif) : null;
      out[id] = (choisi || base || {}).image || null;
    }
  } catch { /* pas de dos : l'overlay affiche le dos standard */ }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-secret') !== Deno.env.get('COMBAT_SECRET')) return txt('Accès refusé.', 401);
  let b = {}; try { b = await req.json(); } catch { return txt('Requête illisible.', 400); }
  if (!b.twitch_id) return txt('Joueur manquant.', 400);

  // ----- Booster quotidien : 1 à 3 boosters, une fois par jour -----
  if (b.mode === 'booster_quotidien') {
    const r = await rpc('reclamer_booster_quotidien', { p_twitch_id: String(b.twitch_id) });
    if (!r.ok) {
      const code = String((r.data && r.data.message) || '');
      return txt(ERREURS[code] || 'Impossible de récupérer le booster quotidien (' + code + ').', 409);
    }
    const d = r.data, liste = (d.detail || []).map(x => `${x.quantite}× ${x.booster}`).join(', ');
    return txt(`🎁 ${d.pseudo} reçoit ${d.quantite} booster${d.quantite > 1 ? 's' : ''} : ${liste} ! Ouvre-les avec !booster`);
  }

  const mode = b.mode === 'payant' ? 'payant' : 'quotidien';

  // Un duel doit toujours viser un joueur précis
  if (mode === 'payant' && !String(b.adversaire || '').trim()) return txt("Écris le @ du joueur que tu veux défier.", 400);

  // 0) combats gratuits du jour : nombre réglable dans Admin > Réglages
  let joueurId = null, limite = 1, deja = 0, quota = false;
  if (mode === 'quotidien') {
    try {
      const rj = await rest(`joueurs?twitch_id=eq.${encodeURIComponent(String(b.twitch_id))}&select=id&limit=1`);
      if (rj.ok && Array.isArray(rj.data) && rj.data[0]) {
        joueurId = rj.data[0].id;
        const rr = await rest('reglages_jeu?cle=eq.combats_gratuits_par_jour&select=valeur');
        if (rr.ok && Array.isArray(rr.data) && rr.data[0]) { const n = parseInt(rr.data[0].valeur, 10); if (Number.isFinite(n) && n >= 0) limite = n; }
        const rc = await rest(`combats_gratuits_jour?joueur_id=eq.${joueurId}&jour=eq.${jourParis()}&select=nb`);
        if (!rc.ok) throw new Error('compteur illisible');
        deja = Array.isArray(rc.data) && rc.data[0] ? rc.data[0].nb : 0;
        quota = true;
      }
    } catch { quota = false; }   // en cas de souci, on garde la règle d'origine (1 combat gratuit par jour)
    if (quota && deja >= limite) {
      return txt(limite === 0 ? "Les combats gratuits sont désactivés pour le moment."
        : `Tu as déjà fait ${limite > 1 ? 'tes ' + limite + ' combats gratuits' : 'ton combat gratuit'} aujourd'hui, reviens demain !`, 409);
    }
  }

  // 1) decks et quota quotidien
  const argsPrep = { p_twitch_id: String(b.twitch_id), p_mode: mode, p_adversaire: b.adversaire || null };
  let prep = await rpc('preparer_combat', argsPrep);
  if (!prep.ok && quota && String((prep.data && prep.data.message) || '') === 'DEJA_JOUE') {
    // Notre compteur autorise encore un combat : on libère le combat gratuit d'origine puis on réessaie
    await rpc('rendre_combat_quotidien', { p_joueur: joueurId });
    prep = await rpc('preparer_combat', argsPrep);
  }
  if (!prep.ok) {
    const code = String((prep.data && prep.data.message) || '');
    return txt(ERREURS[code] || 'Impossible de lancer le combat (' + code + ').', 409);
  }
  // 1 bis) decks de 10 cartes obligatoires (3 combattants, 3 magies, 3 pièges + 1 libre) : les anciens decks de 9 cartes ne jouent plus
  const deckOK = (d) => Array.isArray(d) && new Set(d.map((c) => c && c.id)).size === 10 &&
    ['combattant', 'magie', 'piege'].every((t) => d.filter((c) => c && c.type === t).length >= 3);
  for (let essai = 0; ; essai++) {
    if (!deckOK(prep.data.a.deck)) {
      if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: prep.data.a.id });
      return txt(ERREURS.DECK_INVALIDE, 409);
    }
    if (deckOK(prep.data.b.deck)) break;
    if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: prep.data.a.id });
    if (b.adversaire || essai >= 5) return txt(b.adversaire ? ERREURS.ADVERSAIRE_SANS_DECK : ERREURS.AUCUN_ADVERSAIRE, 409);
    const p2 = await rpc('preparer_combat', argsPrep);   // adversaire au hasard avec un ancien deck : on en tire un autre
    if (!p2.ok) { const code = String((p2.data && p2.data.message) || ''); return txt(ERREURS[code] || 'Impossible de lancer le combat (' + code + ').', 409); }
    prep = p2;
  }
  // 1 ter) anti-farm : limite de combats contre le même adversaire par jour
  const maxPaire = await limiteMemeAdversaire();
  if (maxPaire > 0) {
    // Adversaire tiré au hasard (!combat sans @) : on retente quelques fois pour tomber sur un autre joueur
    for (let essai = 0; ; essai++) {
      const n = await combatsEntre(prep.data.a.id, prep.data.b.id);
      if (n === null || n < maxPaire) break;
      if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: prep.data.a.id });
      if (b.adversaire || essai >= 4) {
        return txt(`${prep.data.a.pseudo} et ${prep.data.b.pseudo} se sont déjà affrontés ${maxPaire} fois aujourd'hui : ` +
          (b.adversaire ? "défie quelqu'un d'autre ou reviens demain !" : "aucun autre adversaire disponible pour l'instant, reviens plus tard !"), 409);
      }
      const p2 = await rpc('preparer_combat', argsPrep);
      if (!p2.ok) { const code = String((p2.data && p2.data.message) || ''); return txt(ERREURS[code] || 'Impossible de lancer le combat (' + code + ').', 409); }
      prep = p2;
    }
  }
  const { a, b: adv } = prep.data;

  // 2) calcul du combat (une seule fois, ici)
  let res, G = { mult: 1 };
  try {
    const dos = await dosDe([a.id, adv.id]);
    G = await reglesGains();
    await ajouterRaretes([...(a.deck || []), ...(adv.deck || [])]);
    res = globalThis.Moteur.simuler({ pseudo: a.pseudo, deck: a.deck, dos: dos[a.id] }, { pseudo: adv.pseudo, deck: adv.deck, dos: dos[adv.id] },
      { seed: Math.floor(Math.random() * 1e9), regles: { ...REGLES, gain: G.gain, perte: G.perte, nul: G.nul } });
  } catch (e) {
    if (mode === 'quotidien') await rpc('rendre_combat_quotidien', { p_joueur: a.id });
    return txt('Le combat a rencontré une erreur, il n\'est pas décompté.', 500);
  }

  // 3) récompenses et statistiques
  const w = res.gagnant;                                         // 0 = lanceur, 1 = adversaire, null = nul
  const gains = [res.recompenses[0], PAYER_ADVERSAIRE ? res.recompenses[1] : 0];
  // Bounty : prime aléatoire partagée entre les deux joueurs (s'ajoute aux gains du combat)
  let bounty = null;
  try {
    const B = await reglesBounty();
    if (B && Math.random() * 100 < B.chance) {
      const total = B.min + Math.floor(Math.random() * (B.max - B.min + 1));
      let parts, tout = false;
      if (w === null) { const h = Math.ceil(total / 2); parts = [h, total - h]; }
      else { tout = Math.random() * 100 < B.tout; const pg = tout ? total : Math.round(total * B.part / 100); parts = w === 0 ? [pg, total - pg] : [total - pg, pg]; }
      if (!PAYER_ADVERSAIRE) parts[1] = 0;
      gains[0] += parts[0]; gains[1] += parts[1];
      bounty = { total, parts, tout };
    }
  } catch { bounty = null; }   // un souci sur la prime ne bloque jamais le combat
  res.recompenses = gains;
  const fin = res.journal[res.journal.length - 1]; if (fin && fin.t === 'fin') { fin.recompenses = gains; if (bounty) fin.bounty = bounty; }
  const dmg = [0, 0], gros = [0, 0]; let tours = 0;
  for (const e of res.journal) {
    if (e.t === 'tour') tours++;
    if (e.t === 'degats' && e.c != null && e.n > 0) { const s = 1 - e.c; dmg[s] += e.n; if (e.n > gros[s]) gros[s] = e.n; }
  }
  const debut = res.journal.find(e => e.t === 'debut');
  const issue = i => w === null ? 'nul' : (w === i ? 'victoire' : 'defaite');
  const lignes = [[a.id, adv.id, 0]];
  if (PAYER_ADVERSAIRE) lignes.push([adv.id, a.id, 1]);
  for (const [jid, aid, i] of lignes) {
    await rpc('enregistrer_combat', { p_joueur: jid, p_adversaire: aid, p_resultat: issue(i), p_gain: gains[i], p_tours: tours,
      p_plus_gros_coup: gros[i], p_degats: dmg[i], p_cartes: [...new Set(res.journal.filter(e => (e.t === 'debut' || e.t === 'prolongation') && e.joueurs).flatMap(e => e.joueurs[i].ids || []).filter(Boolean))], p_mode: mode, p_seed: res.seed });
  }

  // historique des parties : une ligne par combat, avec son déroulé (ne bloque jamais un combat — script 08-historique.sql)
  try {
    const J = (debut && debut.joueurs) || [];
    const deroule = res.journal.filter(e => e.t !== 'debut').map(e => { const o = { tour: e.tour, t: e.t, txt: e.txt }; if (e.c != null) o.c = e.c; return o; });
    const h = await rest('historique_combats', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      mode, joueur_a: a.id, joueur_b: adv.id, pseudo_a: a.pseudo, pseudo_b: adv.pseudo,
      carte_a: J[0] ? J[0].carte : null, carte_b: J[1] ? J[1].carte : null,
      magie_a: J[0] ? J[0].magie : null, magie_b: J[1] ? J[1].magie : null,
      piege_a: J[0] ? J[0].piege : null, piege_b: J[1] ? J[1].piege : null,
      gagnant: w, gain_a: gains[0], gain_b: gains[1], tours, seed: res.seed, deroule }) });
    if (!h.ok) console.error('historique_combats :', JSON.stringify(h.data));
  } catch (e) { console.error('historique_combats :', String(e)); }

  // compteur des combats gratuits du jour
  if (mode === 'quotidien' && quota) {
    try {
      await rest('combats_gratuits_jour?on_conflict=joueur_id,jour', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ joueur_id: a.id, jour: jourParis(), nb: deja + 1 }) });
    } catch { /* sans gravité */ }
  }

  // 4) messages pour le chat
  const nomW = w === null ? null : (w === 0 ? a.pseudo : adv.pseudo);
  const gagne = (p, g) => `${p} gagne ${g} ${NOM_MONNAIE}`;
  const recompenses = PAYER_ADVERSAIRE ? `${gagne(a.pseudo, gains[0])}, ${gagne(adv.pseudo, gains[1])}.` : `${gagne(a.pseudo, gains[0])}.`;
  res.annonce = w === null ? `🤝 Match nul entre ${a.pseudo} et ${adv.pseudo} ! ${recompenses}`
    : `🏆 ${nomW} remporte le combat contre ${w === 0 ? adv.pseudo : a.pseudo} ! ${recompenses}`;
  if (G.mult !== 1) res.annonce += ` (🔥 gains ×${G.mult} !)`;
  if (bounty) res.annonce += bounty.tout ? ` 💰 BOUNTY de ${bounty.total} ${NOM_MONNAIE} : ${nomW} rafle tout !`
    : ` 💰 Bounty de ${bounty.total} ${NOM_MONNAIE} : ${a.pseudo} +${bounty.parts[0]}${PAYER_ADVERSAIRE ? `, ${adv.pseudo} +${bounty.parts[1]}` : ''} !`;
  const intro = `⚔️ ${a.pseudo} affronte ${adv.pseudo} !`;
  return new Response(JSON.stringify(res), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-message': encodeURIComponent(intro) } });
});
/* Moteur de combat — Jeu de cartes Twitch
   simuler(joueurA, joueurB, {seed, regles}) -> { journal, gagnant, recompenses, ... }
   joueur = { pseudo, deck:[carte...] } ; carte = ligne de la table `cartes` (type, nom, atq, pv, passif, ultime, effet, image)
   Le calcul est entièrement déterminé par la seed : même seed = même combat (rejouable). */
(function(g){
const REG={maxTours:10,gain:50,perte:10,nul:20,plafondEsquive:75};
const rng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const rd=Math.round;

function simuler(pA,pB,opt={}){
 const seed=opt.seed??(Math.random()*1e9|0),r=rng(seed),reg={...REG,...opt.regles},J=[];
 const roll=p=>r()*100<(p||0);
 const tire=(deck,t)=>{const l=deck.filter(c=>c.type===t);return l[Math.floor(r()*l.length)]};
 const nw=p=>{const c=tire(p.deck,'combattant'),pa=c.passif||{};
  return{pseudo:p.pseudo,deck:p.deck,card:c,mag:tire(p.deck,'magie'),pie:tire(p.deck,'piege'),atq:c.atq,pv:c.pv,max:c.pv,pas:pa,ult:c.ultime,
   magOn:1,pieOn:1,decl:0,mdelta:[],st:{stun:0,skip:0,dbl:0,dots:[],curses:[],ren:[],insens:0,prog:[],evite:pa.type==='evite_mort',mortUsed:0,bonus:0},
   cum:0,coups:0,rt:0,uses:0,last:-99,pend:0}};
 const S=[nw(pA),nw(pB)],id=s=>S.indexOf(s),adv=s=>S[1-id(s)],nom=s=>s.card.nom;
 let tour=0,rv=0;
 const L=(t,txt,o={})=>J.push({t,txt,...o,tour,pv:S.map(s=>s.pv),max:S.map(s=>s.max),atq:S.map(s=>s.atq)});
 const amt=(e,b)=>e.u==='pct'?rd(b*e.val/100):(e.val||0);
 const over=()=>S.some(s=>s.pv<=0);

 function heal(s,n,k){n=Math.min(n,s.max-s.pv);if(n<=0)return;s.pv+=n;L('soin',`${nom(s)} récupère ${n} PV`,{c:id(s),n,k:k||(rv?'revive':undefined)});scan({t:'soin',who:id(s)})}
 function dmg(src,dst,n){
  n=Math.max(0,rd(n));
  if(n>=dst.pv)scan({t:'mort',who:id(dst)});               // piège « le propriétaire meurt » : juste avant la mort
  let after=null;
  if(n>=dst.pv){
   const m=dst.magOn&&dst.mag.effet&&dst.mag.effet.type==='mort_evitee'?dst.mag.effet:null;
   if(m&&!dst.st.mortUsed&&(m.cond==='pv_max'?dst.max>=m.seuil:dst.cum>=m.seuil)){
    dst.st.mortUsed=1;n=dst.pv-1;L('protege',`${nom(dst)} évite la mort (1 PV) !`,{c:id(dst)});if(m.pct)after=()=>heal(dst,rd(dst.max*m.pct/100),'revive');
   }else if(dst.st.evite){dst.st.evite=0;n=dst.pv-1;L('protege',`${nom(dst)} évite la mort (passif) !`,{c:id(dst)})}
  }
  dst.pv-=n;src.cum+=n;if(after)after();scan({t:'pv'});return n;
 }
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
  if(e.briques){e.briques.forEach(b=>fx(b,o,x,mg));return}      // effet « maison » composé de briques de base (multi-effet)
  const T=e.cible==='adversaire'?x:o;
  const delta=(s,k,d)=>{if(mg)o.mdelta.push({s,k,d})};
  switch(e.type){
   case'atq_mod':{const d=amt(e,T.atq);T.atq=Math.max(0,T.atq+d);delta(T,'atq',d);L('stat',`ATQ de ${nom(T)} ${d>=0?'+':''}${d}`,{c:id(T),k:'mod',s:'ATQ',d});break}
   case'pv_mod':{const d=amt(e,T.max);T.max=Math.max(1,T.max+d);T.pv=Math.max(1,Math.min(T.max,T.pv+d));delta(T,'max',d);L('stat',`PV max de ${nom(T)} ${d>=0?'+':''}${d}`,{c:id(T),k:'mod',s:'PV max',d});break}
   case'soin':heal(o,amt(e,o.max));break;
   case'degats':{const n=dmg(o,x,e.val);L('degats',`${nom(x)} subit ${n} dégâts directs`,{c:id(x),n});break}
   case'vol_vie':{const n=dmg(o,x,e.val);L('degats',`${nom(x)} subit ${n} dégâts`,{c:id(x),n});heal(o,n);break}
   case'annule_attaque':x.st.skip=1;L('statut',`La prochaine attaque de ${nom(x)} est annulée`,{c:id(x)});break;
   case'renvoi':o.st.ren.push({pct:e.val,t:e.tours||1});break;
   case'insensible_piege':o.st.insens=e.tours||1;break;
   case'annule_magies':if(x.magOn){x.magOn=0;undo(x);L('statut',`La magie de ${x.pseudo} est annulée`,{c:id(x)})}break;
   case'degats_tours':x.st.prog.push({t:e.tours||1,n:e.val,src:o});break;
   case'double_degats':o.st.dbl=e.tours||1;L('statut',`${nom(o)} double ses dégâts`,{c:id(o)});break;
   case'echange_atq':[o.atq,x.atq]=[x.atq,o.atq];L('stat',`${nom(o)} et ${nom(x)} échangent leur ATQ`,{k:'echange',cs:[id(o),id(x)],col:'bleu'});break;
   case'echange_atq_def':[x.atq,x.pv]=[x.pv,x.atq];x.max=Math.max(x.max,x.pv);L('stat',`${nom(x)} : ATQ et PV échangés`,{k:'echange',c:id(x)});break;
   case'echange_pv':[o.pv,x.pv]=[x.pv,o.pv];[o.max,x.max]=[x.max,o.max];L('stat',`${nom(o)} et ${nom(x)} échangent leurs PV`,{k:'echange',cs:[id(o),id(x)],col:'rouge'});break;
   case'echange_tout':[o.atq,x.atq]=[x.atq,o.atq];[o.pv,x.pv]=[x.pv,o.pv];[o.max,x.max]=[x.max,o.max];L('stat',`${nom(o)} et ${nom(x)} échangent ATQ et PV`,{k:'echange',cs:[id(o),id(x)],col:'mixte'});break;
   case'malediction':maudire((e.ciblem||e.cible)==='soi'?o:x,e.val||0,e.tours||1);break;   // par défaut sur l'adversaire
   case'mort_evitee':break;                                    // lue directement dans dmg()
   case'detruire':case'voler':{
    if(e.carte==='magie'&&x.magOn){x.magOn=0;undo(x);if(e.type==='voler'){fx(x.mag.effet,o,x,true);L('vol',`${o.pseudo} vole la magie de ${x.pseudo}`)}else L('vol',`La magie de ${x.pseudo} est détruite`)}
    else if(e.carte==='piege'&&x.pieOn){x.pieOn=0;if(e.type==='voler'){o.pie=x.pie;o.pieOn=1;o.decl=0;L('vol',`${o.pseudo} vole le piège de ${x.pseudo}`)}else L('vol',`Le piège de ${x.pseudo} est détruit`)}
    break}
   case'equiper':{const c=tire(o.deck.filter(k=>k!==o.mag&&k!==o.pie),e.carte);if(c){if(e.carte==='magie'){o.mag=c;o.magOn=1;fx(c.effet,o,x,true)}else{o.pie=c;o.pieOn=1;o.decl=0}L('vol',`${nom(o)} équipe ${c.nom}`)}break}
   default:L('inconnu',`Effet non géré par le moteur : ${e.type}`);
  }
 }
 function undo(s){s.mdelta.forEach(d=>{d.s[d.k]-=d.d;if(d.k==='max')d.s.pv=Math.min(d.s.pv,d.s.max)});s.mdelta=[]}
 // Malédiction : l'ATQ de la cible baisse de n points à chaque fin de tour pendant t tours (se cumule)
 function maudire(dst,n,t){dst.st.curses.push({n,t});L('statut',`${nom(dst)} est maudit (ATQ −${n} par tour, ${t} tour${t>1?'s':''}) !`,{c:id(dst),k:'malediction'})}

 function ultime(s){
  const u=s.ult;if(!u||!u.type||s.pv<=0)return;
  if(u.utilisations>0&&s.uses>=u.utilisations)return;
  if(tour-s.last<(u.delai_tours||0))return;
  if(!((u.apres_tours&&tour>=u.apres_tours)||(u.sur_carte&&s.pend)))return;
  s.uses++;s.last=tour;s.pend=0;L('ultime',`ULTIME de ${nom(s)} !`,{c:id(s)});fx(u,s,adv(s));scan({t:'ultime',by:id(s)});
 }
 function attaque(a){
  const d=adv(a),ia=id(a),idd=id(d);
  if(a.st.stun){a.st.stun=0;L('statut',`${nom(a)} est étourdi, il n'attaque pas`,{c:ia,k:'etourdi_fin'});return}
  if(a.st.skip){a.st.skip=0;L('bloque',`L'attaque de ${nom(a)} est annulée`,{c:id(adv(a))});return}
  let multi=a.pas.type==='multi_frappe'&&roll(a.pas.chance)?a.pas.frappes:1;
  a.coups++;L('attaque',`${nom(a)} attaque${multi>1?` (${multi} frappes)`:''}`,{c:ia});
  // Enchaînement : après chaque frappe on retente la chance ; au premier échec, on s'arrête (max = plafond de frappes en plus, 10 par défaut)
  const ench=a.pas.type==='enchainement',cap=a.pas.max>0?a.pas.max:10;
  for(let k=0;k<multi&&d.pv>0;k++,ench&&d.pv>0&&k<=cap&&roll(a.pas.chance)&&multi++){
   if(ench&&k>0)L('attaque',`${nom(a)} enchaîne une frappe de plus !`,{c:ia,k:'enchaine'});
   if(d.pas.type==='esquive'&&roll(Math.min(reg.plafondEsquive,d.pas.chance))){L('esquive',`${nom(d)} esquive !`,{c:idd});continue} // l'esquive annule aussi les effets associés
   let n=a.atq*(a.st.dbl>0?2:1)+a.st.bonus;a.st.bonus=0;
   if(d.pas.type==='reduc_degats'&&roll(d.pas.chance)){L('bloque',`${nom(d)} bloque une partie des dégâts`,{c:idd});n=Math.max(0,n-amt(d.pas,n))}
   d.rt++;n=dmg(a,d,n);L('degats',`${nom(d)} subit ${n} dégâts`,{c:idd,n});
   if(d.pas.type==='renvoi'&&n>0){const b=dmg(d,a,amt(d.pas,n));L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})}
   d.st.ren.forEach(R=>{const b=dmg(d,a,n*R.pct/100);if(b>0)L('degats',`${nom(a)} subit ${b} dégâts renvoyés`,{c:ia,n:b,k:'renvoi',from:idd})});
   const p=a.pas;
   if(n>0&&d.pv>0){
    if(p.type==='vol_pct_atq'&&roll(p.chance))heal(a,rd(n*p.pctatq/100));
    if(p.type==='etourdir'&&roll(p.chance)){d.st.stun=1;L('statut',`${nom(d)} est étourdi !`,{c:idd,k:'etourdi'})}
    if(p.type==='brulure'&&roll(p.chance)){d.st.dots.push({k:'brûlure',n:rd(d.max*p.pctpv/100),t:p.tours});L('statut',`${nom(d)} brûle !`,{c:idd,k:'brulure'})}
    if(p.type==='poison'&&roll(p.chance)){d.st.dots.push({k:'poison',n:p.degtour,t:p.tours});L('statut',`${nom(d)} est empoisonné !`,{c:idd,k:'poison'})}
    if(p.type==='malediction'&&roll(p.chance))maudire(d,p.val,p.tours);
   }
   if(over())return;
  }
  scan({t:'attaque',by:ia});
 }
 function finDeTour(){
  S.forEach(s=>{if(s.pv<=0)return;const x=adv(s);
   s.st.dots=s.st.dots.filter(d=>{const n=dmg(x,s,d.n);L('degats',`${nom(s)} subit ${n} (${d.k})`,{c:id(s),n,k:d.k});if(--d.t>0)return true;L('finstatut',`${d.k} de ${nom(s)} se termine`,{c:id(s),k:d.k==='poison'?'poison':'brulure'});return false});
   s.st.curses=s.st.curses.filter(c=>{const q=Math.min(c.n,s.atq);s.atq-=q;if(q>0)L('stat',`ATQ de ${nom(s)} −${q} (malédiction)`,{c:id(s),k:'malediction_tick',s:'ATQ',d:-q});if(--c.t>0)return true;L('finstatut',`La malédiction de ${nom(s)} se termine`,{c:id(s),k:'malediction'});return false});
   if(s.pas.type==='soin_tour')heal(s,amt(s.pas,s.max));
   if(s.pas.type==='atq_tours'&&tour%s.pas.tours===0){const dd=amt(s.pas,s.atq);s.atq+=dd;L('stat',`ATQ de ${nom(s)} +${dd}`,{c:id(s),k:'mod',s:'ATQ',d:dd})}
   if(s.pas.type==='pv_tours'&&tour%s.pas.tours===0){const d=amt(s.pas,s.max);s.max+=d;s.pv+=d;L('stat',`PV max de ${nom(s)} +${d}`,{c:id(s),k:'mod',s:'PV max',d})}
   if(s.pas.type==='bonus_frappe'&&s.rt>=s.pas.coups){s.st.bonus=amt(s.pas,s.atq);L('statut',`${nom(s)} prépare une contre-attaque renforcée`,{c:id(s)})}
   s.st.prog=s.st.prog.filter(p=>{if(--p.t>0)return true;const n=dmg(p.src,s,p.n);L('degats',`${nom(s)} subit ${n} (dégâts différés)`,{c:id(s),n});return false});
   s.st.ren=s.st.ren.filter(R=>--R.t>0);if(s.st.insens>0)s.st.insens--;if(s.st.dbl>0)s.st.dbl--;
  });
 }

 // ---- Déroulé ----
 const first=r()<.5?0:1,ordre=[S[first],S[1-first]];
 L('debut','Le combat commence !',{joueurs:S.map(s=>({pseudo:s.pseudo,carte:s.card.nom,image:s.card.image||null,magie:s.mag.nom,piege:s.pie.nom,magieImg:s.mag.image||null,piegeImg:s.pie.image||null})),premier:first});
 ordre.forEach(s=>{if(s.mag.effet){L('magie',`Magie de ${s.pseudo} : ${s.mag.nom}`,{c:id(s),carte:s.mag.nom,img:s.mag.image||null});fx(s.mag.effet,s,adv(s),true);S.forEach(k=>k.pend=1)}});
 for(tour=1;tour<=reg.maxTours&&!over();tour++){
  L('tour',`Tour ${tour}`);S.forEach(s=>s.rt=0);
  for(const a of ordre){if(over())break;ultime(a);if(over())break;attaque(a)}
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

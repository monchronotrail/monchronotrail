// engine.js — moteur de calcul Monchronotrail, SOURCE UNIQUE.
// Embarqué tel quel (texte brut, via build.js) dans chaque page pour l'usage
// côté client (calculator.html), et importé directement en Node par build.js
// pour pré-calculer statiquement le tableau "Quel temps selon votre niveau ?"
// au moment de la génération — jamais deux copies de la même logique.
//
// Aucune fonction ici ne touche au DOM : c'est ce qui permet de l'exécuter
// aussi bien dans un navigateur que côté serveur (Node) sans modification.

// ---------- kilomètre-effort (référence ITRA) ----------
// 1 km-effort = 1 km à plat, ou 100 m de D+.
const TERRAIN = { roulant:1.00, technique:1.10, montagne:1.18 };
const TERRAIN_LABEL = { roulant:'🟢 Roulant', technique:'🔴 Technique', montagne:'🏔️ Haute montagne' };

function effortKm(D, Dplus){
  return D + (Dplus||0)/100;
}

// L'exposant de Riegel (1,06) n'a été validé par son auteur que jusqu'au
// marathon — au-delà, la perte de rythme n'est plus linéaire de la même
// façon. Exposant variable par palier, aligné sur les catégories OFFICIELLES
// ITRA/FFA basées sur le km-effort :
//   ≤ 115 km-effort   : format standard                          → 1,06
//   115–210 km-effort : ultra-trail / catégorie FFA "XL"          → 1,11
//   > 210 km-effort    : catégorie FFA "XXL" (100 miles et plus)   → 1,17
function riegelExponent(effortTarget){
  if(effortTarget <= 115) return 1.06;
  if(effortTarget <= 210) return 1.11;
  return 1.17;
}

function riegel(TrefSec, effortRef, effortTarget){
  return TrefSec * Math.pow(effortTarget/effortRef, riegelExponent(effortTarget));
}

function predict(TrefSec, effortRef, Dtarget, Dplus, terrain, extra){
  const effortTarget = effortKm(Dtarget, Dplus);
  const Tbase = riegel(TrefSec, effortRef, effortTarget);
  const Ct = TERRAIN[terrain] ?? 1.00;
  const Cx = extra || 1.00;
  return { total: Tbase*Ct*Cx, Tbase, Ct, Cx, effortTarget, density: Dtarget>0 ? Dplus/Dtarget : 0 };
}

// ---------- formatage ----------
function formatTime(totalSeconds){
  if(!isFinite(totalSeconds) || totalSeconds<=0) return '--:--:--';
  const s = Math.round(totalSeconds);
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  return h+'h'+String(m).padStart(2,'0');
}
function formatHM(totalSeconds){
  const s = Math.round(totalSeconds);
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  return String(h)+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}
function formatPace(secPerKm){
  if(!isFinite(secPerKm) || secPerKm<=0) return '';
  let m = Math.floor(secPerKm/60);
  let s = Math.round(secPerKm%60);
  if(s===60){ s=0; m+=1; }
  return m+"'"+String(s).padStart(2,'0')+'/km';
}
function parseTime(str){
  if(!str) return null;
  const parts = str.trim().split(':').map(s=>s.trim());
  if(parts.some(p=>p==='' || isNaN(Number(p)))) return null;
  let h=0,m=0,s=0;
  if(parts.length===3){ [h,m,s]=parts.map(Number); }
  else if(parts.length===2){ [h,m]=parts.map(Number); }
  else if(parts.length===1){ h=Number(parts[0]); }
  else return null;
  return h*3600+m*60+s;
}

// Exposition : window.MCT côté navigateur (déjà utilisé par build.js et par
// calculator.html lui-même), module.exports côté Node (build.js).
if (typeof window !== 'undefined') {
  window.MCT = { predict, riegel, effortKm, riegelExponent, TERRAIN, TERRAIN_LABEL, formatTime, formatHM, formatPace, parseTime };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { predict, riegel, effortKm, riegelExponent, TERRAIN, TERRAIN_LABEL, formatTime, formatHM, formatPace, parseTime };
}

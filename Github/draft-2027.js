#!/usr/bin/env node
// scripts/draft-2027.js — prépare les éditions N+1 en BROUILLON à partir de l'édition N.
//
// Pourquoi : les gens cherchent « [course] 2027 » dès l'automne, avant que les
// organisateurs aient confirmé dates et parcours. On crée la fiche tout de suite,
// clairement marquée « non confirmée » (bandeau + statut TO_VERIFY), puis on la
// met à jour quand l'information officielle sort. Aucune date n'est inventée :
// elle reste « à confirmer, habituellement en <mois> ».
//
// Usage (depuis la racine du dépôt) :
//   node scripts/draft-2027.js                       → liste les événements sans édition 2027 (aperçu)
//   node scripts/draft-2027.js utmb vvx --write      → ajoute les brouillons 2027 de ces événements à races.json
//   node scripts/draft-2027.js --all --write         → tous les événements sans 2027
//   options : --from=2026 --to=2027 (par défaut)
//
// Les brouillons sont en status TO_VERIFY → ils n'entrent PAS dans le classement
// des barrières horaires (réservé aux données VERIFIED).

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
const FROM = parseInt(opt('from') || '2026', 10);
const TO = parseInt(opt('to') || String(FROM + 1), 10);
const WRITE = args.includes('--write');
const ALL = args.includes('--all');
const slugs = args.filter(a => !a.startsWith('--'));

const file = path.join(__dirname, '..', 'races.json');
const races = JSON.parse(fs.readFileSync(file, 'utf-8'));
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

// Un événement est déjà couvert s'il a une édition TO, OU une fiche dont la date officielle tombe en TO
// (cas d'une fiche étiquetée N mais portant déjà la date N+1 : inutile de créer un doublon).
const hasTarget = new Set(races.filter(r => r.edition === TO || String(r.date || '').startsWith(String(TO) + '-')).map(r => r.slug));
const sources = races.filter(r => r.edition === FROM && !hasTarget.has(r.slug));
const events = [...new Set(sources.map(r => r.slug))];

if(!WRITE){
  console.log(`${events.length} événement(s) avec une édition ${FROM} et sans édition ${TO} :`);
  events.forEach(s => console.log(`  ${s}  (${sources.filter(r => r.slug === s).length} format(s))`));
  console.log('\nAjouter : node scripts/draft-2027.js <slug...> --write   (ou --all --write)');
  process.exit(0);
}

const chosen = ALL ? events : slugs;
const unknown = chosen.filter(s => !events.includes(s));
if(unknown.length){ console.error('Slugs inconnus ou déjà couverts :', unknown.join(', ')); process.exit(1); }

const swap = s => typeof s === 'string' ? s.split(String(FROM)).join(String(TO)) : s;
const drafts = sources.filter(r => chosen.includes(r.slug)).map(r => {
  const iso = (r.date || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
  const d = JSON.parse(JSON.stringify(r));
  d.id = swap(r.id);
  d.season = TO; d.edition = TO;
  d.date = iso ? `à confirmer, habituellement en ${MONTHS[parseInt(iso[2], 10) - 1]}` : 'à confirmer';
  d.status = 'TO_VERIFY';
  d.draft = true;
  d.verificationDate = null;
  d.aidStations = [];
  d.gpxAvailable = false; d.gpxUrl = null; d.gpxDistance = null; d.gpxElevationGain = null;
  d.relatedRaces = (r.relatedRaces || []).map(swap);
  delete d.previousResults;
  d.notes = `Brouillon ${TO} : distance, dénivelé et terrain repris de l'édition ${FROM}, non confirmés par l'organisateur. À vérifier sur le site officiel dès l'annonce de l'édition ${TO}, puis passer en VERIFIED et retirer "draft".`;
  return d;
});

const existing = new Set(races.map(r => r.id));
const fresh = drafts.filter(d => !existing.has(d.id));
fs.writeFileSync(file, JSON.stringify(races.concat(fresh), null, 2) + '\n', 'utf-8');
console.log(`${fresh.length} brouillon(s) ${TO} ajouté(s) à races.json pour : ${chosen.join(', ')}`);

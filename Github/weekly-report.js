#!/usr/bin/env node
// scripts/weekly-report.js — « Revue du lundi » : ce qui demande une action humaine cette semaine.
// Lit races.json uniquement (aucun accès réseau). Sortie : Markdown avec cases à cocher.
//   node weekly-report.js              → à la date du jour
//   node weekly-report.js --date=2027-05-31   → simulation à une autre date

const fs = require('fs');
const path = require('path');
const ROOT = fs.existsSync(path.join(__dirname, 'races.json')) ? __dirname : path.join(__dirname, '..'); // fonctionne à côté de build.js ou dans scripts/
const HERE = path.basename(__dirname) === 'scripts' ? 'scripts/' : ''; // pour afficher les bonnes commandes
const races = JSON.parse(fs.readFileSync(path.join(ROOT, 'races.json'), 'utf-8'));
const dateArg = (process.argv.find(a => a.startsWith('--date=')) || '').slice(7);
const TODAY = new Date((dateArg || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const isIso = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const dayDiff = r => Math.round((new Date(r.date + 'T00:00:00Z') - TODAY) / 864e5);
const site = r => r.officialSite ? ` — [site officiel](${r.officialSite})` : '';
const label = r => `${r.name} ${r.formatName || r.distance + ' km'} ${r.edition}`;
const bySlug = {};
races.forEach(r => (bySlug[r.slug] = bySlug[r.slug] || []).push(r));

const out = [];
const CAP = 10; // au-delà, on résume pour que le rapport reste lisible
const section = (title, lines, hint) => {
  if(!lines.length) return;
  const shown = lines.slice(0, CAP);
  if(lines.length > CAP) shown.push(`- … et ${lines.length - CAP} autre(s) (voir races.json)`);
  out.push(`### ${title} (${lines.length})`, hint ? `_${hint}_` : '', ...shown, '');
};

// 1. Courses courues les 7 derniers jours
const justRun = races.filter(r => isIso(r.date) && dayDiff(r) < 0 && dayDiff(r) >= -7);
section('Courses courues cette semaine', justRun.map(r => `- [ ] ${label(r)} (${r.date})${site(r)}`),
  "Récupérer les résultats officiels (vainqueur, dernier finisher, finishers) et les mettre dans `previousResults` de l'édition suivante ; vérifier si la date de l'édition suivante est annoncée.");

// 2. Courses des 21 prochains jours
const soon = races.filter(r => isIso(r.date) && dayDiff(r) >= 0 && dayDiff(r) <= 21);
section('Courses dans les 21 prochains jours', soon.map(r => `- [ ] ${label(r)} (${r.date}, dans ${dayDiff(r)} j)${site(r)}`),
  'Vérifier distance, D+ et barrière horaire sur le site officiel : les organisateurs modifient parfois le parcours au dernier moment.');

// 3. Brouillons à confirmer (priorité si le mois habituel est dans les 5 prochains mois)
const draftEvents = [...new Set(races.filter(r => r.draft).map(r => r.slug))];
const draftLines = draftEvents.map(slug => {
  const rs = races.filter(r => r.slug === slug && r.draft), r0 = rs[0];
  const m = String(r0.date || '').match(/habituellement en (\p{L}+)/u);
  const mi = m ? MONTHS.indexOf(m[1]) : -1;
  let soonish = false;
  if(mi >= 0){ const diff = (mi - TODAY.getUTCMonth() + 12) % 12; soonish = diff <= 5; }
  return { soonish, line: `- [ ] ${soonish ? '**À confirmer en priorité** — ' : ''}${r0.name} ${r0.edition} (${rs.length} format${rs.length > 1 ? 's' : ''}${m ? ', habituellement en ' + m[1] : ''})${site(r0)}` };
}).sort((a, b) => Number(b.soonish) - Number(a.soonish));
section('Brouillons non confirmés', draftLines.map(x => x.line),
  "Quand l'organisateur annonce date et parcours : corriger la fiche dans races.json, passer en VERIFIED et retirer \"draft\".");

// 4. Événements sans édition à venir
const noNext = Object.keys(bySlug).filter(slug => {
  const rs = bySlug[slug];
  return !rs.some(r => r.draft || !isIso(r.date) || dayDiff(r) >= 0) && rs.every(r => isIso(r.date));
});
section('Événements sans édition à venir', noNext.map(slug => {
  const last = Math.max(...bySlug[slug].map(r => r.edition));
  return `- [ ] ${bySlug[slug][0].name} (dernière édition ${last}) → \`node ${HERE}draft-2027.js ${slug} --from=${last} --write\``;
}), 'Créer un brouillon de la prochaine édition pour capter les recherches « [course] + année ».');

// 5. Données VERIFIED à re-vérifier (> 120 jours, édition à venir)
const stale = races.filter(r => r.status === 'VERIFIED' && !r.draft && isIso(r.verificationDate) && isIso(r.date) && dayDiff(r) >= 0 &&
  (TODAY - new Date(r.verificationDate + 'T00:00:00Z')) / 864e5 > 120);
section('Données vérifiées depuis plus de 120 jours (édition à venir)', stale.map(r => `- [ ] ${label(r)} — vérifié le ${r.verificationDate}${site(r)}`),
  'Relire la page officielle ; mettre à jour verificationDate même si rien n\'a changé.');

// 6. Incohérences de données
const bad = races.filter(r => { const m = String(r.date || '').match(/^(\d{4})-/); return m && Number(m[1]) !== r.edition; });
section('Incohérences edition / date', bad.map(r => `- [ ] ${r.id} : edition ${r.edition} mais date ${r.date}`),
  "L'année de la date doit correspondre à l'édition (sinon le bandeau « édition passée » et les URL sont faux).");

out.unshift(`## Revue du lundi — ${iso(TODAY)}`, '');
if(out.length === 2) out.push('Rien à signaler cette semaine.');
console.log(out.join('\n'));

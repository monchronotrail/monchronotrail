#!/usr/bin/env node
// scripts/check-redirects.js — repère les URL qui existent en ligne mais disparaissent du prochain build
// et n'ont pas de redirection dans redirects.json (cause n°1 de 404 après un renommage de fiche).
//
// Usage (après `node build.js`) :
//   node scripts/check-redirects.js                       → compare avec https://monchronotrail.fr/sitemap.xml
//   node scripts/check-redirects.js --live-file=ancien.xml → compare avec un sitemap local (tests)
// Sortie : texte Markdown. Code de sortie toujours 0 (c'est un signal, pas un blocage).

const fs = require('fs');
const path = require('path');
const ROOT = fs.existsSync(path.join(__dirname, 'races.json')) ? __dirname : path.join(__dirname, '..'); // fonctionne à côté de build.js ou dans scripts/
const SITE = 'https://monchronotrail.fr';
const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };

const locs = xml => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].replace(SITE, '').replace(/\/?$/, '/'));

(async () => {
  const newFile = path.join(ROOT, 'dist', 'sitemap.xml');
  if(!fs.existsSync(newFile)){ console.log('### Redirections\nBuild absent : lancez `node build.js` avant ce contrôle.'); return; }
  let liveXml;
  try {
    const f = arg('live-file');
    liveXml = f ? fs.readFileSync(f, 'utf-8') : await (await fetch(SITE + '/sitemap.xml')).text();
  } catch(e){ console.log('### Redirections\nImpossible de lire le sitemap en ligne : ' + e.message); return; }

  const live = new Set(locs(liveXml)), next = new Set(locs(fs.readFileSync(newFile, 'utf-8')));
  let redirects = [];
  try { redirects = JSON.parse(fs.readFileSync(path.join(ROOT, 'redirects.json'), 'utf-8')); } catch(e){}
  const covered = new Set(redirects.map(r => r.from.replace(/\/?$/, '/')));
  const vanished = [...live].filter(u => !next.has(u));
  const missing = vanished.filter(u => !covered.has(u));

  console.log('### Redirections');
  if(!missing.length){ console.log(`Aucune URL en ligne ne disparaît sans redirection (${vanished.length} déplacée(s), toutes couvertes).`); return; }
  console.log(`${missing.length} URL en ligne vont disparaître sans redirection :`);
  missing.forEach(u => console.log(`- [ ] ${u} → ajouter une entrée { "from": "${u}", "to": "…" } dans redirects.json`));
})();

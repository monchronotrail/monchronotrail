// build.js — générateur de site statique "maison", sans dépendance npm.
// Usage : node build.js
// Génère le dossier dist/ à partir de partials/, _data/races.json et static/.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');

function read(p){ return fs.readFileSync(path.join(ROOT, p), 'utf-8'); }
function write(relPath, content){
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}
function copyFile(src, destRelative){
  const full = path.join(OUT, destRelative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.copyFileSync(path.join(ROOT, src), full);
}
function slugify(s){
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
function esc(s){
  return String(s==null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const CALCULATOR = read('calculator.html');

function headTags({ title, description, canonical, ogImage }){
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="6RNrLnFiwV0YLz-zANz05xXeqNK1txyjKySIgYK1_Cs" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">`;
}

function page(headHtml, bodyHtml){
  return `<!DOCTYPE html>
<html lang="fr">
<head>
${headHtml}
</head>
<body style="margin:0;background:#F1F3EE;padding:24px 12px;">
${bodyHtml}
</body>
</html>
`;
}

// ---------------------------------------------------------------------
// 1. Chargement des données de courses (avant la home, pour pouvoir y
//    lister les courses disponibles)
// ---------------------------------------------------------------------
const races = JSON.parse(read('races.json'));

const DIFFICULTY_LABELS = { 1:'Roulant', 2:'Vallonné', 3:'Montagne', 4:'Montagne technique', 5:'Très montagneux / très technique' };
const STATUS_LABELS = {
  VERIFIED: '✅ Vérifié',
  SECONDARY_SOURCE: '🟡 Source secondaire',
  CONFLICT: '⚠️ Sources en conflit — à confirmer',
  TO_VERIFY: '🔍 À vérifier'
};

function raceUrlPath(r){
  const formatSlug = r.formatName ? slugify(r.formatName) : slugify(r.distance + 'km');
  return `/${r.slug}/${r.edition}/${formatSlug}/`;
}
function eventUrlPath(slug, edition){
  return `/${slug}/${edition}/`;
}

const bySlug = {};
races.forEach(r => { (bySlug[r.slug] = bySlug[r.slug] || []).push(r); });

// ---------------------------------------------------------------------
// 2. Page d'accueil — le calculateur identique à avant, plus une section
//    "Courses disponibles" générée automatiquement depuis races.json.
// ---------------------------------------------------------------------
const homeCoursesHtml = Object.keys(bySlug).map(slug => {
  const list = bySlug[slug];
  const first = list[0];
  return `<a href="${eventUrlPath(first.slug, first.edition)}" style="background:rgba(255,255,255,.08);border:1px solid rgba(240,193,121,.4);color:#F0C179;padding:6px 12px;border-radius:20px;font-size:13.5px;text-decoration:none;margin:0 8px 8px 0;display:inline-block;">${esc(first.name)} ${first.edition} →</a>`;
}).join('');

const heroCoursesBar = `
  <div style="background:#2F4A3C;padding:0 28px 24px;">
    <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#9FB5A5;margin-bottom:10px;">Courses disponibles</div>
    <div>${homeCoursesHtml || '<span style="color:#9FB5A5;font-size:13.5px;">Aucune course ajoutée pour le moment.</span>'}</div>
    <div style="margin-top:4px;"><a href="/calendrier-trails-2026/" style="color:#F0C179;font-size:13px;text-decoration:none;">Voir le calendrier complet →</a></div>
  </div>
`;

// Insère la barre juste après le bandeau (hero), avant la 1re section du formulaire —
// uniquement sur la page d'accueil, le partial CALCULATOR original reste inchangé
// pour les pages de courses.
const heroSplitIdx = CALCULATOR.indexOf('<div class="tc-section">');
const homeCalculator = CALCULATOR.slice(0, heroSplitIdx) + heroCoursesBar + '\n  ' + CALCULATOR.slice(heroSplitIdx);

const homeHead = headTags({
  title: 'Calculateur de temps trail et ultra-trail gratuit | Monchronotrail',
  description: "Monchronotrail : calculez gratuitement votre temps prévisionnel sur un trail ou un ultra-trail (30, 60, 80, 100 km...) à partir d'un chrono de référence, du dénivelé positif et du terrain. Pensé pour les néo-traileurs.",
  canonical: 'https://monchronotrail.netlify.app/',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});
write('index.html', page(homeHead, homeCalculator));

// ---------------------------------------------------------------------
// 3. Pages statiques copiées telles quelles
// ---------------------------------------------------------------------
copyFile('mentions-legales.html', 'mentions-legales.html');
copyFile('politique-confidentialite.html', 'politique-confidentialite.html');
copyFile('favicon.svg', 'favicon.svg');
copyFile('og-image.png', 'og-image.png');

// ---------------------------------------------------------------------
// 4. Pages de courses — générées depuis races.json
// ---------------------------------------------------------------------
races.forEach(race => {
  const url = 'https://monchronotrail.netlify.app' + raceUrlPath(race);
  const formatLabel = race.formatName || (race.distance + ' km');
  const title = `${race.name} ${formatLabel} ${race.edition} : estimez votre temps de course | Monchronotrail`;
  const description = `Estimez votre temps sur ${race.name} (${race.distance} km, ${race.elevationGain} m D+) avec Monchronotrail, calculateur gratuit basé sur votre niveau et le profil du parcours.`;

  const formatButtons = bySlug[race.slug].map(r => {
    const active = r.id === race.id;
    return `<a href="${raceUrlPath(r)}" class="tc-btn${active ? '' : ' secondary'}" style="text-decoration:none;display:inline-block;margin:0 8px 8px 0;">${esc(r.formatName || r.distance + ' km')}</a>`;
  }).join('');

  const aidStationsHtml = (race.aidStations || []).map(a =>
    `<div class="tc-splits-result-row"><span class="tc-splits-point">${esc(a.name)}<small>km ${a.kilometer}${a.elevationGainCumulative ? (' · ' + a.elevationGainCumulative + ' m D+ cumulés') : ''}</small></span></div>`
  ).join('');

  const relatedHtml = (race.relatedRaces || []).map(id => {
    const rr = races.find(x => x.id === id);
    if (!rr) return '';
    return `<a href="${raceUrlPath(rr)}" style="color:var(--forest);">${esc(rr.name)} ${esc(rr.formatName || rr.distance + ' km')}</a>`;
  }).filter(Boolean).join(' · ');

  const density = race.distance > 0 ? (race.elevationGain / race.distance) : 0;

  const prefillScript = `
<script>
(function(){
  function prefill(){
    var d = document.getElementById('tc-target-dist');
    var dp = document.getElementById('tc-target-dplus');
    if(d) d.value = ${JSON.stringify(race.distance)};
    if(dp) dp.value = ${JSON.stringify(race.elevationGain)};
    var terrainMap = {1:'roulant',2:'roulant',3:'modere',4:'technique',5:'montagne'};
    var terrainVal = terrainMap[${JSON.stringify(race.technicalDifficulty || 3)}] || 'modere';
    var radio = document.querySelector('input[name="tc-terrain"][value="'+terrainVal+'"]');
    if(radio) radio.checked = true;
    document.querySelectorAll('#tc-terrain-group label').forEach(function(l){ l.classList.remove('checked'); });
    if(radio) radio.closest('label').classList.add('checked');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefill);
  else prefill();
})();
</script>`;

  // Balisage Schema.org (SportsEvent) — aide Google à comprendre qu'il s'agit
  // d'un événement sportif. La date n'est incluse que si elle est confirmée
  // (au format ISO), pour ne jamais publier de donnée structurée inventée.
  const isoDateMatch = (race.date || '').match(/^\d{4}-\d{2}-\d{2}$/);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${race.name} ${formatLabel} ${race.edition}`,
    sport: 'Trail running',
    description: race.description || undefined,
    ...(isoDateMatch ? { startDate: race.date } : {}),
    location: race.location ? { '@type': 'Place', name: race.location } : undefined,
    organizer: race.organizer ? { '@type': 'Organization', name: race.organizer, url: race.officialSite || undefined } : undefined,
    url: url
  };
  const structuredDataScript = `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`;

  const body = `
${structuredDataScript}
<div style="max-width:720px;margin:0 auto 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16211C;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a> · <a href="${eventUrlPath(race.slug, race.edition)}" style="color:#2F4A3C;">${esc(race.name)} ${race.edition} — tous les formats</a></p>
  <h1 style="font-family:Georgia,'Iowan Old Style',serif;font-weight:normal;font-size:26px;line-height:1.3;">${esc(race.name)} ${esc(formatLabel)} ${race.edition} : estimez votre temps de course</h1>
  <p style="font-size:14.5px;line-height:1.6;">${esc(race.description || '')} Utilisez le calculateur ci-dessous pour obtenir une estimation personnalisée de votre temps de course.</p>

  <div>${formatButtons}</div>

  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0;">
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">Distance</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${race.distance} km</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">D+</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${race.elevationGain} m</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">D-</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${race.elevationLoss || '—'}</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">Altitude max</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${race.maxElevation ? race.maxElevation + ' m' : '—'}</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">Terrain</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${esc(race.terrainType || '—')}</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">Difficulté Monchronotrail</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${race.difficulty}/5 — ${DIFFICULTY_LABELS[race.difficulty] || '—'}</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;border-bottom:1px solid #D8DED4;">Date</td><td style="padding:7px 0;text-align:right;border-bottom:1px solid #D8DED4;">${esc(race.date || 'à confirmer')}</td></tr>
    <tr><td style="padding:7px 0;color:#5C6B66;">Lieu</td><td style="padding:7px 0;text-align:right;">${esc(race.location || '—')}</td></tr>
  </table>
  <p style="font-size:12px;color:#5C6B66;line-height:1.5;">Statut des données : ${STATUS_LABELS[race.status] || esc(race.status)} — vérifié le ${race.verificationDate || '—'}.${race.notes ? ' ' + esc(race.notes) : ''} ${race.sourceUrl ? `<a href="${esc(race.sourceUrl)}" style="color:#2F4A3C;">Source</a>` : ''}</p>
</div>

${CALCULATOR}

<div style="max-width:720px;margin:24px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16211C;">
  ${aidStationsHtml ? `<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;">Temps de passage estimés</h2>
  <p style="font-size:13px;color:#5C6B66;">Utilisez le bouton "➕ Calculer mes temps de passage" ci-dessus avec les ravitaillements officiels de ${esc(race.name)} :</p>
  <div>${aidStationsHtml}</div>` : ''}

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Comment Monchronotrail estime votre temps ?</h2>
  <p style="font-size:14px;line-height:1.6;">L'estimation tient compte de votre niveau (via un chrono de référence route ou trail), de la distance, du dénivelé positif, du profil du parcours et de sa technicité. Ce n'est pas une prédiction exacte, mais une aide pour préparer votre course et fixer un objectif réaliste.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Quelle est la difficulté de ${esc(race.name)} ${esc(formatLabel)} ?</h2>
  <p style="font-size:14px;line-height:1.6;">Avec ${race.elevationGain} m de D+ sur ${race.distance} km (soit environ ${density.toFixed(0)} m/km), ce format est classé ${race.difficulty}/5 sur l'échelle Monchronotrail : ${DIFFICULTY_LABELS[race.difficulty] || '—'}.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">FAQ</h2>
  <p style="font-size:14px;line-height:1.6;"><strong>Quel temps faut-il pour terminer ${esc(race.name)} ${esc(formatLabel)} ?</strong><br>Ça dépend surtout de votre niveau et de votre expérience sur ce type de terrain — utilisez le calculateur ci-dessus avec un chrono récent pour une estimation personnalisée.</p>
  <p style="font-size:14px;line-height:1.6;"><strong>Le dénivelé est-il pris en compte ?</strong><br>Oui, le D+ et sa densité au kilomètre font partie du calcul, ainsi que la technicité du terrain.</p>
  <p style="font-size:14px;line-height:1.6;"><strong>Peut-on obtenir des temps de passage ?</strong><br>Oui, une fois votre chrono estimé, un bouton optionnel permet de calculer vos temps de passage aux ravitaillements.</p>
  <p style="font-size:14px;line-height:1.6;"><strong>L'estimation est-elle fiable ?</strong><br>C'est une estimation indicative : météo, ravitaillement, gestion d'allure et forme du jour font varier le résultat réel de ±10 à 20 %.</p>

  ${relatedHtml ? `<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Vous préparez une autre course ?</h2><p style="font-size:14px;">${relatedHtml}</p>` : ''}

  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>
${prefillScript}
`;

  const head = headTags({ title, description, canonical: url, ogImage: 'https://monchronotrail.netlify.app/og-image.png' });
  write(raceUrlPath(race).slice(1) + 'index.html', page(head, body));
});

// ---------------------------------------------------------------------
// 5. Pages événement — une par événement/édition, listant les formats.
//    C'est ici que la page d'accueil renvoie désormais (Trail du Sancy →
//    choisissez votre format), plutôt que directement vers un format.
// ---------------------------------------------------------------------
const byEventEdition = {};
races.forEach(r => {
  const key = r.slug + '::' + r.edition;
  (byEventEdition[key] = byEventEdition[key] || []).push(r);
});

Object.values(byEventEdition).forEach(list => {
  const first = list[0];
  const url = 'https://monchronotrail.netlify.app' + eventUrlPath(first.slug, first.edition);
  const title = `${first.name} ${first.edition} : choisissez votre format | Monchronotrail`;
  const description = `${first.name} ${first.edition} : découvrez les formats disponibles (${list.map(r => r.formatName || r.distance + ' km').join(', ')}) et estimez votre temps de course avec Monchronotrail.`;

  const formatCards = list.map(r => {
    const density = r.distance > 0 ? (r.elevationGain / r.distance) : 0;
    return `<a href="${raceUrlPath(r)}" style="display:block;text-decoration:none;color:#16211C;border:1px solid #D8DED4;border-radius:8px;padding:16px 18px;margin-bottom:12px;">
      <div style="font-family:Georgia,serif;font-size:18px;color:#2F4A3C;margin-bottom:4px;">${esc(r.formatName || r.distance + ' km')} →</div>
      <div style="font-size:13.5px;color:#5C6B66;">${r.distance} km · ${r.elevationGain} m D+ (${density.toFixed(0)} m/km) · ${DIFFICULTY_LABELS[r.difficulty] || '—'}${r.date ? ' · ' + esc(r.date) : ''}</div>
    </a>`;
  }).join('');

  const body = `
<div style="max-width:720px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16211C;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a></p>
  <h1 style="font-family:Georgia,'Iowan Old Style',serif;font-weight:normal;font-size:28px;">${esc(first.name)} ${first.edition}</h1>
  <p style="font-size:14.5px;line-height:1.6;">${esc(first.description || '')}</p>
  <p style="font-size:13.5px;color:#5C6B66;">${esc(first.location || '')}</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Choisissez votre format</h2>
  ${formatCards}

  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>`;

  const head2 = headTags({ title, description, canonical: url, ogImage: 'https://monchronotrail.netlify.app/og-image.png' });
  write(eventUrlPath(first.slug, first.edition).slice(1) + 'index.html', page(head2, body));
});
// ---------------------------------------------------------------------
// 6. Page calendrier (liste tous les formats)
// ---------------------------------------------------------------------
const calendarRows = races.map(r =>
  `<li style="margin-bottom:8px;"><a href="${raceUrlPath(r)}" style="color:#2F4A3C;font-weight:600;">${esc(r.name)} ${esc(r.formatName || r.distance+' km')}</a> — ${esc(r.date || 'date à confirmer')}, ${esc(r.location || '')}</li>`
).join('\n');
const calendarHead = headTags({
  title: 'Calendrier des trails 2026 | Monchronotrail',
  description: 'Les principales courses de trail disponibles sur Monchronotrail, avec calculateur de temps intégré pour chacune.',
  canonical: 'https://monchronotrail.netlify.app/calendrier-trails-2026/',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});
const calendarBody = `
<div style="max-width:720px;margin:0 auto;font-family:-apple-system,sans-serif;color:#16211C;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a></p>
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;">Calendrier des trails 2026</h1>
  <p style="font-size:14px;">Les courses disponibles sur Monchronotrail, avec calculateur de temps personnalisé pour chacune.</p>
  <ul style="font-size:14.5px;line-height:1.6;padding-left:20px;">${calendarRows}</ul>
</div>`;
write('calendrier-trails-2026/index.html', page(calendarHead, calendarBody));

// ---------------------------------------------------------------------
// 7. Sitemap
// ---------------------------------------------------------------------
const eventUrls = Object.values(byEventEdition).map(list => 'https://monchronotrail.netlify.app' + eventUrlPath(list[0].slug, list[0].edition));
const urls = [
  'https://monchronotrail.netlify.app/',
  'https://monchronotrail.netlify.app/calendrier-trails-2026/',
  ...eventUrls,
  ...races.map(r => 'https://monchronotrail.netlify.app' + raceUrlPath(r))
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>monthly</changefreq></url>`).join('\n')}
</urlset>
`);

console.log(`Build terminé : ${urls.length} pages générées dans dist/`);

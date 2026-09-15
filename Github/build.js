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

// Détecte si ce build tourne sur Cloudflare (variable CF_PAGES=1, fixée
// automatiquement par Cloudflare pendant ses propres builds, jamais présente
// chez Netlify). Sert uniquement à empêcher Google d'indexer cette copie
// "miroir" utilisée pour prévisualiser le développement — la version Netlify
// n'est jamais affectée par cette variable et reste indexable normalement.
const IS_CLOUDFLARE_BUILD = process.env.CF_PAGES === '1';

function headTags({ title, description, canonical, ogImage }){
  return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="google-site-verification" content="6RNrLnFiwV0YLz-zANz05xXeqNK1txyjKySIgYK1_Cs" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${IS_CLOUDFLARE_BUILD ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<link rel="icon" type="image/svg+xml" href="/favicon.svg">
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
// Regroupement par mois — sert à la fois au bandeau d'accueil et à la
// page calendrier. La plupart des dates sont au format ISO (2026-08-27) ;
// certaines sont encore au format texte ("à confirmer, habituellement
// fin septembre") tant que l'édition n'est pas officiellement annoncée —
// dans ce cas on essaie de repérer le nom du mois dans le texte, sinon
// la course part dans le groupe "Dates à confirmer".
const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const MONTH_SLUGS = ['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];

function monthIndexOf(dateStr){
  if(!dateStr) return null;
  const iso = dateStr.match(/^(\d{4})-(\d{2})-\d{2}/);
  if(iso) return parseInt(iso[2],10) - 1;
  const lower = dateStr.toLowerCase();
  for(let i=0;i<MONTHS.length;i++){
    if(lower.indexOf(MONTHS[i]) !== -1) return i;
  }
  return null;
}

const byMonth = {}; // 0-11 -> [races]
const undatedRaces = [];
races.forEach(r => {
  const m = monthIndexOf(r.date);
  if(m===null){ undatedRaces.push(r); return; }
  (byMonth[m] = byMonth[m] || []).push(r);
});
const monthsPresent = Object.keys(byMonth).map(Number).sort((a,b)=>a-b);

// ---------------------------------------------------------------------
// 2. Page d'accueil — le calculateur identique à avant, plus un calendrier
//    par mois généré automatiquement depuis races.json (remplace l'ancienne
//    liste plate "Courses disponibles", qui ne passait pas bien à l'échelle).
// ---------------------------------------------------------------------
const homeMonthsHtml = monthsPresent.map(m =>
  `<a href="/calendrier-trails-2026/#${MONTH_SLUGS[m]}" style="background:rgba(255,255,255,.08);border:1px solid rgba(240,193,121,.4);color:#F0C179;padding:6px 14px;border-radius:20px;font-size:13.5px;text-decoration:none;margin:0 8px 8px 0;display:inline-block;">${MONTHS[m].charAt(0).toUpperCase()+MONTHS[m].slice(1)} <span style="opacity:.7;">(${byMonth[m].length})</span></a>`
).join('');

// Sélection resserrée de courses "phares" mises en avant à gauche du bandeau
// (à ajuster à la main ici — pas piloté par races.json, c'est un choix éditorial).
const FEATURED_SLUGS = ['utmb', 'diagonale-des-fous', 'marathon-du-mont-blanc', 'ultra-marin'];
const homeFeaturedHtml = FEATURED_SLUGS
  .filter(slug => bySlug[slug])
  .map(slug => {
    const first = bySlug[slug][0];
    return `<a href="${eventUrlPath(first.slug, first.edition)}" style="background:rgba(255,255,255,.08);border:1px solid rgba(240,193,121,.4);color:#F0C179;padding:6px 14px;border-radius:20px;font-size:13.5px;text-decoration:none;margin:0 8px 8px 0;display:inline-block;">${esc(first.name)} →</a>`;
  }).join('');

const heroCoursesBar = `
  <div style="background:#2F4A3C;padding:0 28px 24px;">
    <div style="display:flex;gap:28px;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#9FB5A5;margin-bottom:10px;">Courses phares</div>
        <div>${homeFeaturedHtml || '<span style="color:#9FB5A5;font-size:13.5px;">Aucune course ajoutée pour le moment.</span>'}</div>
        <div style="margin-top:4px;"><a href="/courses/" style="color:#F0C179;font-size:13px;text-decoration:none;">Rechercher une course par nom →</a></div>
      </div>
      <div style="flex:1;min-width:220px;">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#9FB5A5;margin-bottom:10px;">Calendrier</div>
        <div>${homeMonthsHtml || '<span style="color:#9FB5A5;font-size:13.5px;">Aucune course ajoutée pour le moment.</span>'}</div>
        <div style="margin-top:4px;"><a href="/calendrier-trails-2026/" style="color:#F0C179;font-size:13px;text-decoration:none;">Voir le calendrier complet →</a></div>
      </div>
    </div>
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
// FAQ générique — vit uniquement sur la page d'accueil désormais (elle
// vivait avant dans le partial calculateur partagé, donc dupliquée mot
// pour mot sur les 53 pages course ; chaque page course a sa propre FAQ
// spécifique générée plus bas, pas besoin de doublon générique en plus).
const homeFaqItems = [
  { q: 'Combien de temps pour faire un trail de 60 km ?',
    a: "Ça dépend surtout de trois choses : votre niveau actuel (via un chrono de référence récent), le dénivelé positif du parcours, et la technicité du terrain. Un même 60 km peut se courir en 6h sur un parcours roulant et peu de D+, ou en 9h+ sur un parcours technique et très vallonné. Le calculateur ci-dessus vous donne une estimation personnalisée en tenant compte de ces trois facteurs." },
  { q: 'Comment estimer son temps sur un premier ultra-trail ?',
    a: "La méthode la plus fiable consiste à partir d'un chrono récent (route ou trail) et à l'ajuster progressivement pour la distance, le dénivelé et le terrain visés, plutôt que d'extrapoler à la louche depuis un temps sur marathon. C'est exactement ce que fait ce calculateur, avec en plus la possibilité d'enregistrer vos propres courses passées pour affiner l'estimation au fil du temps." },
  { q: 'Pourquoi mon temps réel est différent de la prédiction ?',
    a: "La météo, le ravitaillement, la gestion d'allure, la nuit, ou simplement la forme du jour font varier le résultat réel de ±10 à 20 % par rapport à n'importe quel modèle mathématique. C'est pour ça que l'outil affiche une fourchette plutôt qu'un chiffre unique, et s'affine avec votre historique de courses." },
  { q: 'Ce calculateur de trail est-il gratuit ?',
    a: 'Oui, entièrement gratuit et sans inscription. Vos données restent stockées uniquement dans votre navigateur.' },
];
const homeFaqHtml = homeFaqItems.map((item,i) =>
  `<p class="tc-sub" style="margin-bottom:6px;${i>0?'margin-top:16px;':''}"><strong>${esc(item.q)}</strong></p><p class="tc-sub">${esc(item.a)}</p>`
).join('\n');
const homeFaqStructuredData = {
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: homeFaqItems.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } }))
};
const homeFaqSection = `
<script type="application/ld+json">${JSON.stringify(homeFaqStructuredData)}</script>
<div class="tc-section" style="max-width:720px;margin:0 auto;">
  <h2>Questions fréquentes</h2>
  ${homeFaqHtml}
</div>`;

write('index.html', page(homeHead, homeCalculator + homeFaqSection));

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

  function lightRow(label, sublabel, value){
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #D8DED4;font-size:13.5px;">'+
      '<span>'+label+(sublabel ? '<br><small style="color:#5C6B66;font-size:11.5px;">'+sublabel+'</small>' : '')+'</span>'+
      '<span style="color:#2F4A3C;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;">'+value+'</span>'+
    '</div>';
  }

  const aidStationsHtml = (race.aidStations || []).map(a =>
    lightRow(esc(a.name), 'km '+a.kilometer+(a.elevationGainCumulative ? ' · '+a.elevationGainCumulative+' m D+ cumulés' : ''), '')
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
  window.MCT_RACE_EXTRA = ${JSON.stringify(race.extraDifficultyFactor || 1.00)};
  function prefill(){
    var d = document.getElementById('tc-target-dist');
    var dp = document.getElementById('tc-target-dplus');
    if(d) d.value = ${JSON.stringify(race.distance)};
    if(dp) dp.value = ${JSON.stringify(race.elevationGain)};
    var terrainMap = {1:'roulant',2:'roulant',3:'technique',4:'technique',5:'montagne'};
    var terrainVal = terrainMap[${JSON.stringify(race.technicalDifficulty || 3)}] || 'technique';
    var radio = document.querySelector('input[name="tc-terrain"][value="'+terrainVal+'"]');
    if(radio) radio.checked = true;
    document.querySelectorAll('#tc-terrain-group label').forEach(function(l){ l.classList.remove('checked'); });
    if(radio) radio.closest('label').classList.add('checked');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefill);
  else prefill();
})();
</script>`;

  // "Profils types" : réutilise le moteur déjà chargé sur la page (window.MCT,
  // exposé par le calculateur lui-même) — aucun second moteur de calcul.
  const profilesScript = `
<script>
(function(){
  function renderProfiles(){
    var el = document.getElementById('tc-profiles-table');
    if(!el) return;
    if(!window.MCT){ el.innerHTML = '<p style="font-size:13px;color:#5C6B66;">Calculateur non disponible.</p>'; return; }
    var profiles = [
      {label:"Marathon en 2h45", h:2, m:45},
      {label:"Marathon en 3h00", h:3, m:0},
      {label:"Marathon en 3h30", h:3, m:30},
      {label:"Marathon en 4h00", h:4, m:0},
      {label:"Marathon en 4h20", h:4, m:20}
    ];
    var terrainMap = {1:'roulant',2:'roulant',3:'technique',4:'technique',5:'montagne'};
    var terrain = terrainMap[${JSON.stringify(race.technicalDifficulty || 3)}] || 'technique';
    var extra = ${JSON.stringify(race.extraDifficultyFactor || 1.00)};
    var rows = profiles.map(function(p){
      var refSec = p.h*3600 + p.m*60;
      var r = window.MCT.predict(refSec, 42.195, ${JSON.stringify(race.distance)}, ${JSON.stringify(race.elevationGain)}, terrain, extra);
      return '<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #D8DED4;font-size:13.5px;">'+
        '<span>'+p.label+'</span>'+
        '<span style="color:#2F4A3C;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">'+window.MCT.formatTime(r.total)+'</span>'+
      '</div>';
    }).join('');
    el.innerHTML = rows;
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderProfiles);
  else renderProfiles();
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

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Monchronotrail', item: 'https://monchronotrail.netlify.app/' },
      { '@type': 'ListItem', position: 2, name: `${race.name} ${race.edition}`, item: 'https://monchronotrail.netlify.app' + eventUrlPath(race.slug, race.edition) },
      { '@type': 'ListItem', position: 3, name: formatLabel, item: url }
    ]
  };
  const breadcrumbScript = `<script type="application/ld+json">${JSON.stringify(breadcrumbData)}</script>`;

  // Contenu FAQ — défini une seule fois ici, réutilisé à la fois pour
  // l'affichage visible (visite normale) ET pour le balisage FAQPage
  // (Google), pour ne jamais avoir de contenu structuré différent de ce
  // que voit réellement le visiteur.
  // Contenu FAQ — défini une seule fois ici, réutilisé à la fois pour
  // l'affichage visible (visite normale) ET pour le balisage FAQPage
  // (Google), pour ne jamais avoir de contenu structuré différent de ce
  // que voit réellement le visiteur. Les réponses intègrent des données
  // propres à CETTE course (densité, difficulté, nb de ravitos) plutôt
  // qu'un texte générique recopié sur chaque page.
  const isUltra = race.distance >= 80;
  const isAccessible = race.difficulty <= 2;
  const tailoredQ = isUltra
    ? { q: `Ce format de ${race.name} est-il adapté pour un premier ultra-trail ?`,
        a: `Avec ${race.distance} km et ${race.elevationGain} m D+ (difficulté ${race.difficulty}/5 sur l'échelle Monchronotrail), ${isAccessible ? "c'est un format qui reste envisageable pour une première expérience longue, à condition d'avoir déjà couru un marathon ou un trail de 50-60 km." : "c'est un format exigeant, plutôt recommandé après une première expérience réussie sur un ultra plus court ou moins technique."}` }
    : { q: `${race.name} ${formatLabel} est-il accessible à un coureur qui découvre le trail long ?`,
        a: `Avec ${race.distance} km et ${race.elevationGain} m D+ (${density.toFixed(0)} m/km, difficulté ${race.difficulty}/5), ${isAccessible ? "ce format est raisonnablement accessible si vous avez déjà une base d'endurance (marathon ou trail court)." : "ce format demande déjà une vraie expérience de la distance et du dénivelé — mieux vaut avoir couru un premier trail long avant de s'y engager."}` };

  const faqItems = [
    { q: `Quel temps faut-il pour terminer ${race.name} ${formatLabel} ?`,
      a: `Sur ce parcours de ${race.distance} km et ${race.elevationGain} m D+ (soit environ ${density.toFixed(0)} m/km), le temps dépend surtout de votre niveau. Utilisez le calculateur ci-dessus avec un chrono récent pour une estimation personnalisée, ou repérez-vous dans les profils par niveau ci-dessous.` },
    { q: `Le dénivelé est-il pris en compte ?`,
      a: `Oui : à ${density.toFixed(0)} m/km, ce parcours est classé ${race.difficulty}/5 sur l'échelle Monchronotrail. Le D+ est intégré au calcul via la méthode du "kilomètre-effort" (référence ITRA : 100 m de D+ = 1 km-effort), avec la technicité du terrain en complément.` },
    { q: `Peut-on obtenir des temps de passage ?`,
      a: race.aidStations && race.aidStations.length
        ? `Oui — les ${race.aidStations.length} ravitaillements officiels de ${race.name} sont listés plus bas ; utilisez le bouton "➕ Calculer mes temps de passage" ci-dessus pour obtenir une estimation à chacun.`
        : `Oui, une fois votre chrono estimé, un bouton optionnel permet de calculer vos temps de passage — les ravitaillements officiels de cette édition ne sont pas encore renseignés dans notre base.` },
    tailoredQ,
    { q: `L'estimation est-elle fiable ?`,
      a: `C'est une estimation indicative : météo, ravitaillement, gestion d'allure et forme du jour font varier le résultat réel de ±10 à 20 %. Statut des données de cette course : ${STATUS_LABELS[race.status] || race.status}.` },
  ];
  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
  const faqStructuredDataScript = `<script type="application/ld+json">${JSON.stringify(faqStructuredData)}</script>`;
  const faqHtml = faqItems.map(item =>
    `<p style="font-size:14px;line-height:1.6;"><strong>${esc(item.q)}</strong><br>${esc(item.a)}</p>`
  ).join('\n  ');

  const body = `
${structuredDataScript}
${faqStructuredDataScript}
${breadcrumbScript}
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
  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;">Quel temps selon votre niveau ?</h2>
  <p style="font-size:13px;color:#5C6B66;">Estimation calculée par le même moteur que le calculateur ci-dessus, pour un coureur de référence sur marathon (sans historique personnel, donc à ajuster selon votre profil).</p>
  <div id="tc-profiles-table">
    <p style="font-size:13px;color:#5C6B66;font-style:italic;">Calcul en cours…</p>
  </div>

  ${aidStationsHtml ? `<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Temps de passage estimés</h2>
  <p style="font-size:13px;color:#5C6B66;">Utilisez le bouton "➕ Calculer mes temps de passage" ci-dessus avec les ravitaillements officiels de ${esc(race.name)} :</p>
  <div>${aidStationsHtml}</div>` : ''}

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Comment Monchronotrail estime votre temps ?</h2>
  <p style="font-size:14px;line-height:1.6;">L'estimation tient compte de votre niveau (via un chrono de référence route ou trail), de la distance, du dénivelé positif, du profil du parcours et de sa technicité. Ce n'est pas une prédiction exacte, mais une aide pour préparer votre course et fixer un objectif réaliste.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Quelle est la difficulté de ${esc(race.name)} ${esc(formatLabel)} ?</h2>
  <p style="font-size:14px;line-height:1.6;">Avec ${race.elevationGain} m de D+ sur ${race.distance} km (soit environ ${density.toFixed(0)} m/km), ce format est classé ${race.difficulty}/5 sur l'échelle Monchronotrail : ${DIFFICULTY_LABELS[race.difficulty] || '—'}.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">FAQ</h2>
  ${faqHtml}

  ${relatedHtml ? `<h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;">Vous préparez une autre course ?</h2><p style="font-size:14px;">${relatedHtml}</p>` : ''}

  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/methodologie/" style="color:#5C6B66;">Méthodologie</a> · <a href="/a-propos/" style="color:#5C6B66;">À propos</a> · <a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>
${prefillScript}
${profilesScript}
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

  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/methodologie/" style="color:#5C6B66;">Méthodologie</a> · <a href="/a-propos/" style="color:#5C6B66;">À propos</a> · <a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>`;

  const head2 = headTags({ title, description, canonical: url, ogImage: 'https://monchronotrail.netlify.app/og-image.png' });
  write(eventUrlPath(first.slug, first.edition).slice(1) + 'index.html', page(head2, body));
});
// ---------------------------------------------------------------------
// 6. Page calendrier (liste tous les formats)
// ---------------------------------------------------------------------
const calendarHead = headTags({
  title: 'Calendrier des trails 2026 | Monchronotrail',
  description: 'Les principales courses de trail disponibles sur Monchronotrail, classées par mois, avec calculateur de temps intégré pour chacune.',
  canonical: 'https://monchronotrail.netlify.app/calendrier-trails-2026/',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});

function raceRow(r){
  return `<li style="margin-bottom:8px;"><a href="${raceUrlPath(r)}" style="color:#2F4A3C;font-weight:600;text-decoration:none;">${esc(r.name)} ${esc(r.formatName || r.distance+' km')}</a> — ${esc(r.date || 'date à confirmer')}${r.location ? ', '+esc(r.location) : ''}</li>`;
}

const monthNav = monthsPresent.map(m =>
  `<a href="#${MONTH_SLUGS[m]}" style="color:#2F4A3C;font-size:13px;text-decoration:none;border:1px solid #D8DED4;border-radius:20px;padding:5px 12px;margin:0 6px 6px 0;display:inline-block;">${MONTHS[m].charAt(0).toUpperCase()+MONTHS[m].slice(1)}</a>`
).join('');

const monthSections = monthsPresent.map(m => `
  <h2 id="${MONTH_SLUGS[m]}" style="font-family:Georgia,serif;font-weight:normal;font-size:20px;margin-top:30px;border-top:1px solid #D8DED4;padding-top:20px;">${MONTHS[m].charAt(0).toUpperCase()+MONTHS[m].slice(1)}</h2>
  <ul style="font-size:14.5px;line-height:1.6;padding-left:20px;">${byMonth[m].map(raceRow).join('\n')}</ul>
`).join('');

const undatedSection = undatedRaces.length ? `
  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:20px;margin-top:30px;border-top:1px solid #D8DED4;padding-top:20px;">Dates à confirmer</h2>
  <ul style="font-size:14.5px;line-height:1.6;padding-left:20px;">${undatedRaces.map(raceRow).join('\n')}</ul>
` : '';

const calendarBody = `
<div style="max-width:720px;margin:0 auto;font-family:-apple-system,sans-serif;color:#16211C;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a></p>
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;">Calendrier des trails 2026</h1>
  <p style="font-size:14px;">Les courses disponibles sur Monchronotrail, classées par mois, avec calculateur de temps personnalisé pour chacune.</p>
  <div style="margin:16px 0;">${monthNav}</div>
  ${monthSections}
  ${undatedSection}
  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/methodologie/" style="color:#5C6B66;">Méthodologie</a> · <a href="/a-propos/" style="color:#5C6B66;">À propos</a> · <a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>`;
write('calendrier-trails-2026/index.html', page(calendarHead, calendarBody));

// ---------------------------------------------------------------------
// 6bis. Page "Courses" — recherche par nom / distance / D+, entièrement
//       client-side (les données sont embarquées dans la page, pas
//       d'appel réseau nécessaire pour chercher).
// ---------------------------------------------------------------------
const coursesSearchData = races.map(r => ({
  name: r.name, format: r.formatName || (r.distance + ' km'), url: raceUrlPath(r),
  distance: r.distance, elevationGain: r.elevationGain, location: r.location || '', date: r.date || ''
}));
const coursesHead = headTags({
  title: 'Toutes les courses | Monchronotrail',
  description: 'Recherchez une course de trail ou ultra-trail par nom, distance ou dénivelé, et obtenez une estimation de temps personnalisée.',
  canonical: 'https://monchronotrail.netlify.app/courses/',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});
const coursesBody = `
<div style="max-width:720px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16211C;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a></p>
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;">Toutes les courses</h1>
  <p style="font-size:14px;">${races.length} formats disponibles. Recherchez par nom, ou filtrez par distance.</p>

  <input type="text" id="tc-course-search" placeholder="Rechercher une course (ex. Templiers, UTMB...)"
    style="width:100%;padding:10px 12px;border:1px solid #D8DED4;border-radius:6px;font-size:14px;margin:14px 0;box-sizing:border-box;">

  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
    <button type="button" class="tc-dist-filter" data-max="999" style="background:#2F4A3C;color:#fff;border:none;padding:6px 12px;border-radius:20px;font-size:12.5px;cursor:pointer;">Toutes distances</button>
    <button type="button" class="tc-dist-filter" data-max="45" style="background:transparent;color:#2F4A3C;border:1px solid #2F4A3C;padding:6px 12px;border-radius:20px;font-size:12.5px;cursor:pointer;">≤ 45 km</button>
    <button type="button" class="tc-dist-filter" data-max="80" style="background:transparent;color:#2F4A3C;border:1px solid #2F4A3C;padding:6px 12px;border-radius:20px;font-size:12.5px;cursor:pointer;">45-80 km</button>
    <button type="button" class="tc-dist-filter" data-max="999" data-min="80" style="background:transparent;color:#2F4A3C;border:1px solid #2F4A3C;padding:6px 12px;border-radius:20px;font-size:12.5px;cursor:pointer;">80 km et plus</button>
  </div>

  <div id="tc-course-results"></div>
  <p id="tc-course-empty" style="display:none;font-size:13.5px;color:#5C6B66;font-style:italic;">Aucune course ne correspond à cette recherche.</p>
</div>
<script>
(function(){
  var DATA = ${JSON.stringify(coursesSearchData)};
  var searchInput = document.getElementById('tc-course-search');
  var resultsEl = document.getElementById('tc-course-results');
  var emptyEl = document.getElementById('tc-course-empty');
  var buttons = document.querySelectorAll('.tc-dist-filter');
  var activeMin = 0, activeMax = 999;

  function render(){
    var q = (searchInput.value || '').toLowerCase().trim();
    var filtered = DATA.filter(function(r){
      var matchesText = !q || (r.name + ' ' + r.format + ' ' + r.location).toLowerCase().indexOf(q) !== -1;
      var matchesDist = r.distance >= activeMin && r.distance <= activeMax;
      return matchesText && matchesDist;
    });
    resultsEl.innerHTML = filtered.map(function(r){
      return '<a href="' + r.url + '" style="display:block;text-decoration:none;color:#16211C;border-bottom:1px solid #D8DED4;padding:12px 0;">' +
        '<div style="font-weight:600;color:#2F4A3C;">' + r.name + ' — ' + r.format + '</div>' +
        '<div style="font-size:12.5px;color:#5C6B66;margin-top:2px;">' + r.distance + ' km · ' + r.elevationGain + ' m D+' + (r.location ? ' · ' + r.location : '') + '</div>' +
      '</a>';
    }).join('');
    emptyEl.style.display = filtered.length === 0 ? 'block' : 'none';
  }

  searchInput.addEventListener('input', render);
  buttons.forEach(function(btn){
    btn.addEventListener('click', function(){
      buttons.forEach(function(b){ b.style.background='transparent'; b.style.color='#2F4A3C'; });
      btn.style.background = '#2F4A3C'; btn.style.color = '#fff';
      activeMin = parseFloat(btn.dataset.min || '0');
      activeMax = parseFloat(btn.dataset.max || '999');
      render();
    });
  });

  render();
})();
</script>`;
write('courses/index.html', page(coursesHead, coursesBody));

// ---------------------------------------------------------------------
// 6ter. Pages de contenu : Méthodologie et À propos — profondeur de
//       contenu réelle (pas un blog), liées depuis le pied de page de
//       toutes les pages courses et depuis l'accueil.
// ---------------------------------------------------------------------
const methodoHead = headTags({
  title: 'Comment fonctionne le calculateur Monchronotrail ? | Méthodologie',
  description: "Détail de la méthode de calcul de Monchronotrail : méthode du kilomètre-effort (référence ITRA), formule de Riegel, coefficient de technicité, calibration personnelle.",
  canonical: 'https://monchronotrail.netlify.app/methodologie/',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});
const methodoBody = `
<div style="max-width:720px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16211C;line-height:1.6;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a></p>
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:28px;">Comment fonctionne le calculateur Monchronotrail ?</h1>
  <p style="font-size:14.5px;">Monchronotrail estime votre temps de course sur un trail ou un ultra-trail à partir d'une performance de référence (route ou trail), ajustée à la distance, au dénivelé positif et à la technicité du terrain.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Étape 1 — Le kilomètre-effort (méthode ITRA)</h2>
  <p style="font-size:14px;">Distance et dénivelé sont d'abord combinés en une seule "distance-effort", selon la règle utilisée par l'ITRA pour classer la difficulté des courses : <strong>1 km à plat = 1 km-effort, et chaque 100 m de D+ = 1 km-effort supplémentaire</strong>. Un trail de 60 km avec 3000 m de D+ pèse donc 90 km-effort — l'équivalent, en termes d'effort, d'un peu plus qu'un 90 km plat.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Étape 2 — La formule de Riegel</h2>
  <p style="font-size:14px;">Un chrono récent (marathon, semi, 10 km, ou une course de trail) est projeté sur cette distance-effort grâce à la formule de Riegel (exposant 1,06), qui modélise la perte de vitesse liée à l'endurance sur un effort plus long.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Étape 3 — La technicité du terrain</h2>
  <p style="font-size:14px;">Un dernier coefficient, indépendant du volume de D+ (déjà intégré à l'étape 1), tient compte du caractère technique du terrain lui-même : roulant, technique, ou haute montagne.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Étape 4 — La calibration personnelle</h2>
  <p style="font-size:14px;">Si vous enregistrez vos propres courses passées (temps prédit vs temps réel), Monchronotrail calcule un facteur de correction personnel (moyenne des écarts observés, plafonnée à ±30 % pour éviter qu'une seule course inhabituelle ne fausse tout) et l'applique aux futures estimations. C'est volontairement simple : une moyenne, pas un modèle prédictif complexe.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Pourquoi une fourchette plutôt qu'un chiffre unique ?</h2>
  <p style="font-size:14px;">Aucun modèle ne peut prédire la météo, un coup de mou à 3h du matin, ou une mauvaise gestion des ravitaillements. La fourchette affichée reflète cette incertitude réelle plutôt que de donner une fausse precision.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Un modèle qui s'ajuste avec des retours réels</h2>
  <p style="font-size:14px;">La méthode a évolué après un premier retour terrain : sur le Trail du Sancy (61 km, 3200 m D+), le modèle initial donnait une estimation largement en dehors des chronos réellement observés au classement. La méthode du kilomètre-effort a corrigé cet écart et reste, à notre connaissance, la meilleure base disponible pour continuer à affiner le modèle au fil des retours.</p>

  <h2 style="font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:24px;">Les limites, honnêtement</h2>
  <p style="font-size:14px;">Le modèle reste une estimation mathématique. Il ne remplace pas l'expérience, un avis médical, ou une bonne préparation. Certaines données de courses affichées sur le site sont encore au statut "à vérifier" — c'est indiqué explicitement sur chaque page concernée plutôt que masqué.</p>

  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/a-propos/" style="color:#5C6B66;">À propos</a> · <a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>`;
write('methodologie/index.html', page(methodoHead, methodoBody));

const aboutHead = headTags({
  title: 'À propos de Monchronotrail | Pourquoi ce calculateur existe',
  description: "L'histoire derrière Monchronotrail : deux courses où l'estimation de temps s'est révélée totalement fausse, et la décision d'y remédier.",
  canonical: 'https://monchronotrail.netlify.app/a-propos/',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});
const aboutBody = `
<div style="max-width:720px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#16211C;line-height:1.6;">
  <p style="font-size:13px;"><a href="/" style="color:#2F4A3C;">← Monchronotrail</a></p>
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:28px;">Pourquoi Monchronotrail existe</h1>
  <p style="font-size:14.5px;">Sur mes deux premières longues courses, j'ai complètement raté mes estimations de temps.</p>
  <p style="font-size:14px;">Sur l'Ultra-Marin (60 km, Golfe du Morbihan), je visais 7 à 8 heures. Réel : 6h36. Sur un 80 km / 3200 m D+ en Auvergne, je visais 13 à 15 heures. Réel : 11h30. Dans les deux cas, un écart énorme entre ce à quoi je m'attendais et la réalité — au point de fausser complètement ma stratégie de course, mes ravitaillements, et mon mental en cours de route.</p>
  <p style="font-size:14px;">Je me suis rendu compte qu'il n'existait pas d'outil simple, gratuit et honnête pour estimer son temps sur un trail long ou un ultra quand on découvre ce format. Alors je l'ai construit.</p>
  <p style="font-size:14px;">Monchronotrail est gratuit, sans publicité, et le restera pendant sa phase de test. Le modèle de calcul évolue au fil des retours réels de coureurs — s'il vous semble faux sur une course en particulier, c'est justement ce genre de retour qui permet de l'améliorer.</p>
  <p style="font-size:14px;">Pour comprendre comment le calcul fonctionne en détail, voir la <a href="/methodologie/" style="color:#2F4A3C;">page méthodologie</a>.</p>

  <p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/methodologie/" style="color:#5C6B66;">Méthodologie</a> · <a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>
</div>`;
write('a-propos/index.html', page(aboutHead, aboutBody));

// ---------------------------------------------------------------------
// 6quater. Page 404 personnalisée (Netlify la sert automatiquement si
//          nommée 404.html à la racine du site publié).
// ---------------------------------------------------------------------
const notFoundHead = headTags({
  title: 'Page introuvable | Monchronotrail',
  description: "Cette page n'existe pas ou plus sur Monchronotrail.",
  canonical: 'https://monchronotrail.netlify.app/404.html',
  ogImage: 'https://monchronotrail.netlify.app/og-image.png'
});
const notFoundBody = `
<div style="max-width:600px;margin:80px auto;text-align:center;font-family:-apple-system,sans-serif;color:#16211C;">
  <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;">Page introuvable</h1>
  <p style="font-size:14.5px;color:#5C6B66;">Cette page n'existe pas, ou plus — la course a peut-être changé d'adresse.</p>
  <p style="margin-top:20px;"><a href="/" style="color:#fff;background:#C97B2E;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;">Retour au calculateur</a> &nbsp; <a href="/courses/" style="color:#2F4A3C;text-decoration:none;font-size:14px;">Chercher une course →</a></p>
</div>`;
write('404.html', page(notFoundHead, notFoundBody));

// ---------------------------------------------------------------------
// 7. Sitemap
// ---------------------------------------------------------------------
const eventUrls = Object.values(byEventEdition).map(list => 'https://monchronotrail.netlify.app' + eventUrlPath(list[0].slug, list[0].edition));
const urls = [
  'https://monchronotrail.netlify.app/',
  'https://monchronotrail.netlify.app/courses/',
  'https://monchronotrail.netlify.app/calendrier-trails-2026/',
  'https://monchronotrail.netlify.app/methodologie/',
  'https://monchronotrail.netlify.app/a-propos/',
  ...eventUrls,
  ...races.map(r => 'https://monchronotrail.netlify.app' + raceUrlPath(r))
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><changefreq>monthly</changefreq></url>`).join('\n')}
</urlset>
`);

// ---------------------------------------------------------------------
// 8. robots.txt
// ---------------------------------------------------------------------
write('robots.txt', IS_CLOUDFLARE_BUILD
  ? `User-agent: *\nDisallow: /\n`
  : `User-agent: *\nAllow: /\n\nSitemap: https://monchronotrail.netlify.app/sitemap.xml\n`
);

console.log(`Build terminé : ${urls.length} pages générées dans dist/`);

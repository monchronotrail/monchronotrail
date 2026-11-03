// seo-pages.js — pages "intention" et guides evergreen de Monchronotrail.
//
// Appelé depuis build.js (section 2bis). Génère, avec le MÊME moteur de calcul
// que le calculateur (engine.js) :
//   - /temps-trail/                  hub des pages par distance
//   - /temps-trail/<N>-km/           une page par distance (tableau niveau × profil)
//   - /guides/                       hub des guides
//   - /guides/<slug>/                4 guides evergreen
// Rien n'est inventé : tous les chiffres viennent du moteur ou de races.json.
// Retourne { urls, homeSectionHtml } (urls → sitemap, homeSectionHtml → accueil).

module.exports = function buildSeoPages(ctx){
  const { races, engine, write, page, headTags, esc, raceUrlPath, eventUrlPath,
          fmtNum, isPastEdition, buildIso } = ctx;

  const SITE = 'https://monchronotrail.fr';
  const OG = SITE + '/og-image.png';
  const PUB_DATE = buildIso; // date de (re)génération : sert de dateModified

  // ---------- styles partagés (mêmes valeurs que le reste du site) ----------
  const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const WRAP = `max-width:720px;margin:0 auto;font-family:${FONT};color:#16211C;line-height:1.6;`;
  const H1 = "font-family:Georgia,'Iowan Old Style',serif;font-weight:normal;font-size:26px;line-height:1.3;";
  const H2 = "font-family:Georgia,serif;font-weight:normal;font-size:19px;margin-top:26px;";
  const P = 'font-size:14.5px;';
  const TD = 'padding:7px 8px 7px 0;border-bottom:1px solid #D8DED4;font-size:13.5px;';
  const TH = 'text-align:left;color:#5C6B66;font-weight:normal;font-size:12px;padding:6px 8px 6px 0;border-bottom:1px solid #D8DED4;';
  const LINK = 'color:#2F4A3C;';
  const CTA = 'display:inline-block;color:#fff;background:#C97B2E;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;';

  const footer = `<p style="font-size:12.5px;color:#5C6B66;margin-top:28px;border-top:1px solid #D8DED4;padding-top:14px;"><a href="/temps-trail/" style="color:#5C6B66;">Temps par distance</a> · <a href="/guides/" style="color:#5C6B66;">Guides</a> · <a href="/methodologie/" style="color:#5C6B66;">Méthodologie</a> · <a href="/a-propos/" style="color:#5C6B66;">À propos</a> · <a href="/classements/barrieres-horaires-les-plus-serrees/" style="color:#5C6B66;">Barrières horaires : le classement</a> · <a href="/mentions-legales.html" style="color:#5C6B66;">Mentions légales</a> · <a href="/politique-confidentialite.html" style="color:#5C6B66;">Politique de confidentialité</a></p>`;

  const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  const breadcrumb = items => ld({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: SITE + it[1] }))
  });
  const faqLd = items => ld({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(it => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } }))
  });
  const faqHtml = items => items.map(it =>
    `<p style="font-size:14px;"><strong>${esc(it.q)}</strong><br>${esc(it.a)}</p>`).join('\n  ');

  function table(headers, rows){
    return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;margin:14px 0;">
    <thead><tr>${headers.map(h => `<th style="${TH}">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td style="${TD}${i === 0 ? 'color:#16211C;' : 'color:#2F4A3C;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;'}">${c}</td>`).join('')}</tr>`).join('\n    ')}</tbody>
  </table></div>`;
  }

  // ---------- helpers de calcul ----------
  const TERRAIN_LABEL = { roulant: 'Roulant', technique: 'Technique', montagne: 'Haute montagne' };
  function predict(refSec, km, dplus, terrain){
    return engine.predict(refSec, 42.195, km, dplus, terrain, 1.0).total;
  }
  // Durée arrondie à 5 min : un chrono estimé à la seconde serait une fausse précision.
  function fmtDur(sec){
    const m = Math.round(sec / 300) * 5, h = Math.floor(m / 60), mm = m % 60;
    return mm === 0 ? `${h} h` : `${h}h${String(mm).padStart(2, '0')}`;
  }
  function fmtRef(sec){ // 12600 -> "3h30"
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return m === 0 ? `${h}h00` : `${h}h${String(m).padStart(2, '0')}`;
  }
  const kmEffort = (km, dplus) => km + dplus / 100;

  const LEVELS = [9900, 10800, 12600, 14400, 16200, 18000]; // marathon 2h45 … 5h00
  const SCENARIOS = [
    { label: 'Roulant',               dpk: 10, terrain: 'roulant',  desc: 'chemins et sentiers peu vallonnés' },
    { label: 'Vallonné / technique',  dpk: 30, terrain: 'technique', desc: 'relief marqué, sentiers techniques' },
    { label: 'Montagne',              dpk: 50, terrain: 'montagne', desc: 'fort dénivelé, terrain de montagne' }
  ];

  // ---------- 1. Pages par distance ----------
  const DISTANCES = [
    { km: 20,  intro: "Le 20 km est souvent la porte d'entrée du trail : assez court pour être couru sans stratégie de ravitaillement compliquée, mais assez long pour que le dénivelé change déjà nettement le chrono." },
    { km: 30,  intro: "Autour de 30 km, on quitte le format découverte : le dénivelé et la gestion de l'effort comptent autant que la vitesse de base." },
    { km: 40,  intro: "Le 40 km est l'étape classique entre le trail court et le trail long : on commence à devoir penser alimentation et hydratation en course." },
    { km: 50,  intro: "Le 50 km est un cap symbolique avant l'ultra : au-delà du marathon, l'écart entre une estimation « à plat » et la réalité se creuse vite." },
    { km: 60,  intro: "À 60 km, la course dure plusieurs heures de plus qu'un marathon et la fatigue accumulée pèse davantage que la vitesse pure." },
    { km: 80,  intro: "À partir de 80 km, on entre dans l'ultra-trail : les ravitaillements, la gestion de l'allure et parfois la nuit deviennent des paramètres à part entière du chrono." },
    { km: 100, intro: "Le 100 km est la distance emblématique de l'ultra-trail. L'exposant de fatigue utilisé par Monchronotrail y est plus élevé que sur les formats courts, ce qui allonge sensiblement les estimations." },
    { km: 160, intro: "Au-delà de 150 km, on parle d'ultra de très longue distance : sommeil, nuit(s) et logistique deviennent centraux, et le modèle applique son exposant de fatigue le plus élevé pour les parcours qui dépassent 210 km-effort." }
  ];

  const distUrl = km => `/temps-trail/${km}-km/`;
  const distName = km => km >= 80 ? `ultra-trail de ${km} km` : `trail de ${km} km`;
  const dplusFor = (km, dpk) => Math.round(km * dpk / 50) * 50;

  // Dernière édition connue de chaque événement → courses proches de la distance visée.
  const latestBySlug = {};
  races.forEach(r => { if(!latestBySlug[r.slug] || r.edition > latestBySlug[r.slug]) latestBySlug[r.slug] = r.edition; });
  function racesNear(km){
    return races
      .filter(r => r.edition === latestBySlug[r.slug] && Math.abs(r.distance - km) <= km * 0.15)
      .sort((a, b) => Math.abs(a.distance - km) - Math.abs(b.distance - km))
      .slice(0, 12);
  }

  const distPageList = DISTANCES.map(d => d.km);

  DISTANCES.forEach(d => {
    const km = d.km;
    const dp = SCENARIOS.map(s => dplusFor(km, s.dpk));
    const rows = LEVELS.map(ref => [
      `Marathon en ${fmtRef(ref)}`,
      ...SCENARIOS.map((s, i) => fmtDur(predict(ref, km, dp[i], s.terrain)))
    ]);
    const headers = ['Niveau de référence', ...SCENARIOS.map((s, i) => `${s.label}<br><small style="font-size:11px;">≈ ${dp[i]} m D+</small>`)];

    const t4 = SCENARIOS.map((s, i) => predict(14400, km, dp[i], s.terrain));
    const t35 = SCENARIOS.map((s, i) => predict(12600, km, dp[i], s.terrain));
    const spread = t35[2] / t35[0];

    const near = racesNear(km);
    const nearHtml = near.length ? `
  <h2 style="${H2}">Courses d'environ ${km} km suivies par Monchronotrail</h2>
  <p style="${P}">Chaque fiche contient le dénivelé réel, le calculateur pré-rempli et les temps estimés par niveau.</p>
  <ul style="font-size:14.5px;padding-left:20px;">${near.map(r =>
    `<li style="margin-bottom:6px;"><a href="${raceUrlPath(r)}" style="${LINK}font-weight:600;text-decoration:none;">${esc(r.name)} ${esc(r.formatName || r.distance + ' km')} ${r.edition}</a> — ${r.distance} km, ${r.elevationGain} m D+${isPastEdition(r) ? ' (édition passée)' : ''}${r.draft ? ' (édition non confirmée)' : ''}</li>`).join('\n    ')}</ul>` : '';

    const faq = [
      { q: `Quel temps pour un ${distName(km)} quand on court un marathon en 4h ?`,
        a: `Avec un marathon en 4h00 sur route, Monchronotrail estime environ ${fmtDur(t4[0])} sur un parcours roulant (≈ ${dp[0]} m D+), ${fmtDur(t4[1])} sur un parcours vallonné et technique (≈ ${dp[1]} m D+) et ${fmtDur(t4[2])} en montagne (≈ ${dp[2]} m D+). Ce sont des ordres de grandeur : météo, ravitaillements et forme du jour font varier le résultat réel de 10 à 20 %.` },
      { q: `Pourquoi le même ${km} km peut-il se courir en des temps très différents ?`,
        a: `Parce que le dénivelé et la technicité du terrain pèsent autant que la distance. Pour un marathon en 3h30, l'estimation passe de ${fmtDur(t35[0])} sur un ${km} km roulant à ${fmtDur(t35[2])} sur un ${km} km de montagne, soit environ ${fmtNum(spread, 1)} fois plus long.` },
      { q: `Comment obtenir une estimation précise pour ma course de ${km} km ?`,
        a: `Utilisez le calculateur gratuit avec un chrono de référence récent (route ou trail), puis renseignez la distance, le dénivelé positif et le terrain de votre course. Si elle figure dans notre base, sa fiche est déjà pré-remplie.` }
    ];

    const idx = distPageList.indexOf(km);
    const prev = distPageList[idx - 1], next = distPageList[idx + 1];
    const neighbours = [prev, next].filter(Boolean).map(k =>
      `<a href="${distUrl(k)}" style="${LINK}">${k >= 80 ? 'Ultra-trail' : 'Trail'} ${k} km</a>`).join(' · ');

    const url = SITE + distUrl(km);
    const title = km >= 80 ? `Ultra-trail ${km} km : quel temps selon votre niveau ? | Monchronotrail`
                            : `Trail ${km} km : quel temps selon votre niveau ? | Monchronotrail`;
    const description = `${km >= 80 ? 'Ultra-trail' : 'Trail'} de ${km} km : temps estimés pour un marathon de 2h45 à 5h00, selon le dénivelé (≈ ${dp[0]} à ${dp[2]} m D+) et le terrain. Tableau et calculateur gratuit.`;

    const body = `
${breadcrumb([['Monchronotrail', '/'], ['Temps par distance', '/temps-trail/'], [`${km} km`, distUrl(km)]])}
${faqLd(faq)}
<div style="${WRAP}">
  <p style="font-size:13px;"><a href="/" style="${LINK}">← Monchronotrail</a> · <a href="/temps-trail/" style="${LINK}">Temps par distance</a></p>
  <h1 style="${H1}">Combien de temps pour un ${distName(km)} ?</h1>
  <p style="${P}">${esc(d.intro)}</p>
  <p style="${P}">Le tableau ci-dessous donne le temps estimé par le moteur de Monchronotrail pour un ${km} km, selon votre niveau (exprimé par un chrono de marathon sur route) et le profil du parcours.</p>

  <h2 style="${H2}">Temps estimés selon votre niveau</h2>
  ${table(headers, rows)}
  <p style="font-size:12.5px;color:#5C6B66;">Hypothèses : ${SCENARIOS.map((s, i) => `<strong>${s.label}</strong> = ${s.desc}, ≈ ${dp[i]} m D+ (${kmEffort(km, dp[i]).toFixed(0)} km-effort)`).join(' ; ')}. Durées arrondies à 5 minutes. Estimation indicative, sans historique personnel : <a href="/" style="${LINK}">le calculateur</a> affine le résultat avec votre propre référence.</p>

  <p style="margin:18px 0;"><a href="/" style="${CTA}">Calculer mon temps sur ${km} km</a></p>

  <h2 style="${H2}">Pourquoi un même ${km} km varie autant</h2>
  <p style="${P}">Monchronotrail convertit d'abord la course en <a href="/guides/km-effort-explique/" style="${LINK}">kilomètres-effort</a> (1 km à plat = 100 m de dénivelé positif), puis applique un coefficient de technicité. Sur ${km} km, passer de ${dp[0]} à ${dp[2]} m de D+ fait passer l'effort de ${kmEffort(km, dp[0]).toFixed(0)} à ${kmEffort(km, dp[2]).toFixed(0)} km-effort. Pour un marathon en 3h30, cela représente environ ${fmtNum(spread, 1)} fois plus de temps entre le profil roulant et le profil montagne. Le détail du calcul est expliqué dans la <a href="/methodologie/" style="${LINK}">méthodologie</a> et dans le guide <a href="/guides/convertir-temps-marathon-en-temps-trail/" style="${LINK}">convertir son temps de marathon en temps de trail</a>.</p>
  ${nearHtml}

  <h2 style="${H2}">Questions fréquentes</h2>
  ${faqHtml(faq)}

  <h2 style="${H2}">Autres distances</h2>
  <p style="${P}">${neighbours} · <a href="/temps-trail/" style="${LINK}">toutes les distances</a></p>
  ${footer}
</div>`;
    write(distUrl(km).slice(1) + 'index.html', page(headTags({ title, description, canonical: url, ogImage: OG }), body));
  });

  // Hub des pages par distance
  const hubDistBody = `
${breadcrumb([['Monchronotrail', '/'], ['Temps par distance', '/temps-trail/']])}
<div style="${WRAP}">
  <p style="font-size:13px;"><a href="/" style="${LINK}">← Monchronotrail</a></p>
  <h1 style="${H1}">Combien de temps pour un trail ? Estimations par distance</h1>
  <p style="${P}">Choisissez une distance pour voir le temps estimé selon votre niveau au marathon et le profil du parcours (roulant, vallonné, montagne). Tous les chiffres sont calculés par le même moteur que le calculateur.</p>
  <ul style="font-size:15px;line-height:2;padding-left:20px;">${DISTANCES.map(d => `<li><a href="${distUrl(d.km)}" style="${LINK}font-weight:600;">${d.km >= 80 ? 'Ultra-trail' : 'Trail'} de ${d.km} km</a></li>`).join('\n    ')}</ul>
  <p style="${P}">Pour une course précise, <a href="/courses/" style="${LINK}">retrouvez-la dans la liste des courses</a> ou lancez directement <a href="/" style="${LINK}">le calculateur</a>.</p>
  ${footer}
</div>`;
  write('temps-trail/index.html', page(headTags({
    title: 'Temps de course en trail par distance (20 à 160 km) | Monchronotrail',
    description: 'Combien de temps pour un trail de 20, 30, 50, 80, 100 ou 160 km ? Estimations selon votre niveau au marathon, le dénivelé et le terrain.',
    canonical: SITE + '/temps-trail/', ogImage: OG
  }), hubDistBody));

  // ---------- 2. Guides evergreen ----------
  // 2a. Exemples chiffrés réutilisés dans les guides
  const REF35 = 12600;
  const examples = [
    { km: 30,  dp: 1500, terrain: 'technique' },
    { km: 50,  dp: 2500, terrain: 'technique' },
    { km: 80,  dp: 4000, terrain: 'montagne' },
    { km: 100, dp: 5000, terrain: 'montagne' }
  ].map(e => ({ ...e, ke: kmEffort(e.km, e.dp), t: predict(REF35, e.km, e.dp, e.terrain) }));

  const exRows = examples.map(e => [
    `${e.km} km / ${e.dp} m D+ (${TERRAIN_LABEL[e.terrain].toLowerCase()})`,
    `${e.ke.toFixed(0)}`, fmtDur(e.t), `× ${fmtNum(e.t / REF35, 1)}`
  ]);

  // km-effort de courses réelles de la base (dernière édition, réparties du plus court au plus long)
  const latestRaces = races.filter(r => r.edition === latestBySlug[r.slug] && r.elevationGain != null)
    .map(r => ({ r, ke: kmEffort(r.distance, r.elevationGain) })).sort((a, b) => a.ke - b.ke);
  const pick = [];
  if(latestRaces.length){
    const n = Math.min(8, latestRaces.length);
    for(let i = 0; i < n; i++) pick.push(latestRaces[Math.round(i * (latestRaces.length - 1) / Math.max(1, n - 1))]);
  }
  const seenIds = new Set();
  const realRows = pick.filter(p => !seenIds.has(p.r.id) && seenIds.add(p.r.id)).map(p => [
    `<a href="${raceUrlPath(p.r)}" style="${LINK}text-decoration:none;font-family:${FONT};">${esc(p.r.name)} ${esc(p.r.formatName || p.r.distance + ' km')}</a>`,
    `${p.r.distance} km`, `${p.r.elevationGain} m`, `${p.ke.toFixed(0)}`
  ]);

  // Exemple de temps de passage (parcours fictif, clairement présenté comme tel)
  const segs = [ { km: 12, dp: 700 }, { km: 13, dp: 600 }, { km: 12, dp: 700 }, { km: 13, dp: 500 } ];
  const segTotalKm = segs.reduce((s, x) => s + x.km, 0), segTotalDp = segs.reduce((s, x) => s + x.dp, 0);
  const segTotalT = predict(REF35, segTotalKm, segTotalDp, 'technique');
  const segKe = segs.map(s => kmEffort(s.km, s.dp)), segKeSum = segKe.reduce((a, b) => a + b, 0);
  let cumKm = 0, cumT = 0;
  const segRows = segs.map((s, i) => {
    cumKm += s.km; const part = segTotalT * segKe[i] / segKeSum; cumT += part;
    return [`Ravito ${i + 1 < segs.length ? i + 1 : '(arrivée)'} — km ${cumKm}`, `${s.km} km / ${s.dp} m D+`, `${segKe[i].toFixed(0)}`, fmtDur(cumT)];
  });

  // Linéaire naïf vs modèle (premier ultra)
  const naive100 = REF35 * (100 / 42.195);
  const model100 = predict(REF35, 100, 4500, 'montagne');
  const model100flat = predict(REF35, 100, 0, 'roulant');

  const guides = [
    {
      slug: 'convertir-temps-marathon-en-temps-trail',
      h1: 'Convertir son temps de marathon en temps de trail',
      title: 'Convertir son temps de marathon en temps de trail | Monchronotrail',
      description: "Comment passer d'un chrono de marathon à un temps de trail : kilomètre-effort, exposant de fatigue, technicité. Méthode et exemples chiffrés.",
      intro: "Un marathon en 3h30 ne veut pas dire un 50 km de trail en 5 heures : multiplier par la distance ne marche pas. Voici la méthode utilisée par Monchronotrail, en trois étapes, avec des exemples chiffrés.",
      faq: [
        { q: 'Peut-on simplement multiplier son temps de marathon pour estimer un trail ?', a: "Non : le dénivelé, la technicité et la fatigue cumulée rendent la relation non linéaire. Un simple produit en croix sous-estime fortement les temps sur ultra." },
        { q: 'Quel chrono de référence faut-il utiliser ?', a: "Un chrono récent sur route ou trail, de préférence marathon, semi-marathon ou 10 km. Le calculateur accepte aussi une référence trail avec son propre dénivelé." }
      ],
      sections: () => `
  <h2 style="${H2}">Étape 1 — Transformer le trail en distance-effort</h2>
  <p style="${P}">On additionne la distance et le dénivelé positif converti en kilomètres : <strong>distance-effort = distance + D+ / 100</strong>. Un trail de 50 km avec 2 500 m de D+ représente donc 75 km-effort. Voir le guide <a href="/guides/km-effort-explique/" style="${LINK}">km-effort expliqué</a>.</p>
  <h2 style="${H2}">Étape 2 — Projeter le chrono avec un exposant de fatigue</h2>
  <p style="${P}">Le temps de référence est projeté sur la nouvelle distance-effort avec une loi de puissance (formule de Riegel) : <strong>T = T<sub>réf</sub> × (distance-effort cible / distance-effort référence)<sup>b</sup></strong>. L'exposant <em>b</em> augmente avec la longueur de l'épreuve : 1,06 jusqu'à 115 km-effort, 1,11 entre 115 et 210 km-effort, 1,17 au-delà. Plus c'est long, plus on ralentit proportionnellement.</p>
  <h2 style="${H2}">Étape 3 — Appliquer la technicité du terrain</h2>
  <p style="${P}">Un dernier coefficient tient compte du terrain lui-même : roulant × 1,00, technique × 1,10, haute montagne × 1,18. Certaines courses exceptionnelles reçoivent un facteur spécifique (par exemple la Diagonale des Fous).</p>
  <h2 style="${H2}">Exemples pour un marathon en 3h30</h2>
  ${table(['Parcours', 'Km-effort', 'Temps estimé', 'Rapport au marathon'], exRows)}
  <p style="font-size:12.5px;color:#5C6B66;">Estimations Monchronotrail, arrondies à 5 minutes, pour un marathon sur route (sans D+) couru en 3h30. Indicatif : ±10 à 20 % selon la météo, les ravitaillements et la forme du jour.</p>
  <h2 style="${H2}">Les limites de la conversion</h2>
  <p style="${P}">Aucun modèle ne remplace l'expérience : l'altitude, la chaleur, la nuit ou un terrain très particulier peuvent dépasser ce que le km-effort capte. Plus vous enregistrez de courses passées dans le calculateur, plus la prédiction se calibre sur votre profil réel (<a href="/methodologie/" style="${LINK}">méthodologie</a>).</p>`
    },
    {
      slug: 'km-effort-explique',
      h1: 'Le kilomètre-effort expliqué simplement',
      title: 'Kilomètre-effort : définition, calcul et exemples | Monchronotrail',
      description: "Qu'est-ce que le kilomètre-effort en trail ? Définition, formule (distance + D+/100), exemples sur de vraies courses et limites de la méthode.",
      intro: "Le kilomètre-effort sert à comparer des courses de distances et de dénivelés différents avec une seule unité. C'est la brique de base du calcul de Monchronotrail.",
      faq: [
        { q: "Comment calculer le kilomètre-effort d'une course ?", a: "On ajoute à la distance en kilomètres le dénivelé positif divisé par 100 : un parcours de 42 km avec 2 000 m de D+ fait 62 km-effort." },
        { q: 'Le km-effort tient-il compte de la descente et de la technicité ?', a: "Non : il ne mesure que distance et D+. Monchronotrail y ajoute un coefficient de technicité et, pour quelques courses, un facteur spécifique." }
      ],
      sections: () => `
  <h2 style="${H2}">Définition et formule</h2>
  <p style="${P}">Le kilomètre-effort (km-effort) convertit le dénivelé positif en distance équivalente : <strong>100 m de D+ = 1 km à plat</strong>. La distance-effort d'un parcours vaut donc <strong>distance + D+ / 100</strong>. C'est la convention utilisée par l'ITRA pour classer la difficulté des courses.</p>
  <h2 style="${H2}">Exemples sur des courses suivies par Monchronotrail</h2>
  ${realRows.length ? table(['Course', 'Distance', 'D+', 'Km-effort'], realRows) : ''}
  <p style="font-size:12.5px;color:#5C6B66;">Données issues de la base Monchronotrail (dernière édition renseignée de chaque course).</p>
  <h2 style="${H2}">À quoi sert-il concrètement ?</h2>
  <p style="${P}">À comparer : un 30 km avec 2 000 m de D+ (50 km-effort) est plus exigeant qu'un 45 km presque plat. À estimer : on projette son chrono de référence sur la distance-effort de la course visée (voir <a href="/guides/convertir-temps-marathon-en-temps-trail/" style="${LINK}">convertir son temps de marathon en temps de trail</a>).</p>
  <h2 style="${H2}">Ses limites</h2>
  <p style="${P}">Le km-effort ignore la technicité du terrain (sentiers, racines, pierriers), l'altitude, la chaleur et la durée de l'effort. C'est pourquoi Monchronotrail ajoute un coefficient de technicité (1,00 / 1,10 / 1,18) et un exposant de fatigue qui augmente avec la distance-effort. Pour une estimation sur une distance donnée, voir aussi <a href="/temps-trail/" style="${LINK}">les temps par distance</a>.</p>`
    },
    {
      slug: 'temps-de-passage-trail',
      h1: 'Estimer ses temps de passage sur un trail',
      title: 'Temps de passage trail : comment les estimer | Monchronotrail',
      description: "Comment estimer ses temps de passage aux ravitaillements d'un trail : découpage en km-effort, arrêts, fatigue croissante. Exemple chiffré.",
      intro: "Connaître son chrono final ne suffit pas : on veut savoir quand on arrivera à chaque ravitaillement, pour s'organiser et surveiller les barrières horaires. Voici une méthode simple et ses limites.",
      faq: [
        { q: 'Comment répartir son temps entre les ravitaillements ?', a: "En proportion du kilomètre-effort de chaque tronçon (distance + D+/100), puis en ajoutant un temps d'arrêt à chaque ravitaillement." },
        { q: 'Faut-il compter la fatigue dans les temps de passage ?', a: "Oui, au moins qualitativement : on ralentit davantage en fin de course, donc les derniers tronçons demandent plus de temps que leur km-effort ne le laisse penser. Gardez une marge, surtout vers l'arrivée." }
      ],
      sections: () => `
  <h2 style="${H2}">Principe : découper en tronçons de km-effort</h2>
  <p style="${P}">Un tronçon plat de 10 km et un tronçon de 10 km avec 800 m de D+ ne se courent pas à la même vitesse. On calcule donc le <a href="/guides/km-effort-explique/" style="${LINK}">km-effort</a> de chaque tronçon entre ravitaillements, puis on répartit le temps total estimé au prorata.</p>
  <h2 style="${H2}">Exemple (parcours fictif, marathon en 3h30)</h2>
  <p style="${P}">Un trail de ${segTotalKm} km avec ${segTotalDp} m de D+ sur terrain technique, quatre tronçons. Temps total estimé : environ ${fmtDur(segTotalT)}.</p>
  ${table(['Point', 'Tronçon', 'Km-effort', 'Passage (cumulé)'], segRows)}
  <p style="font-size:12.5px;color:#5C6B66;">Exemple pédagogique : les ravitaillements et le profil sont inventés pour illustrer la méthode. Pour une vraie course, utilisez les distances et D+ officiels de l'organisateur.</p>
  <h2 style="${H2}">Ce que ce découpage simple oublie</h2>
  <p style="${P}">Deux choses : les <strong>arrêts</strong> aux ravitaillements (quelques minutes chacun selon votre habitude, à ajouter) et la <strong>fatigue croissante</strong> : les derniers tronçons sont en pratique plus lents que leur km-effort ne le prévoit. Le bouton « Calculer mes temps de passage » du <a href="/" style="${LINK}">calculateur</a> donne une estimation à chaque ravitaillement ; gardez malgré tout une marge sur les derniers tronçons.</p>
  <h2 style="${H2}">Pourquoi c'est utile</h2>
  <p style="${P}">Les temps de passage permettent de comparer votre progression à votre plan, de prévenir vos proches et surtout de vérifier votre marge sur les <a href="/classements/barrieres-horaires-les-plus-serrees/" style="${LINK}">barrières horaires</a>, qui sont souvent le vrai juge de paix sur un ultra.</p>`
    },
    {
      slug: 'estimer-son-temps-premier-ultra-erreurs',
      h1: 'Estimer son temps sur un premier ultra : 5 erreurs classiques',
      title: 'Premier ultra-trail : 5 erreurs en estimant son temps | Monchronotrail',
      description: "Extrapoler depuis le marathon, ignorer le dénivelé, oublier les arrêts : les erreurs classiques d'estimation sur un premier ultra, avec exemple chiffré.",
      intro: "Sur un premier ultra, l'estimation de temps est souvent fausse, dans un sens ou dans l'autre. Voici cinq erreurs fréquentes et comment les éviter.",
      faq: [
        { q: 'Pourquoi mon temps réel diffère-t-il de la prédiction sur un ultra ?', a: "Météo, nuit, ravitaillements, gestion d'allure et forme du jour font varier le résultat de 10 à 20 % autour de n'importe quel modèle." },
        { q: 'Vaut-il mieux viser large ou serré ?', a: "Une fourchette est plus honnête qu'un chiffre unique : préparez un plan prudent, puis ajustez en course selon vos sensations et les barrières horaires." }
      ],
      sections: () => `
  <h2 style="${H2}">1. Extrapoler linéairement depuis le marathon</h2>
  <p style="${P}">Rapporter son marathon à 100 km au prorata de la distance donnerait ici environ ${fmtDur(naive100)} pour un marathon en 3h30. ${model100flat > naive100 ? `Or, même sur un 100 km sans dénivelé, le modèle donne environ ${fmtDur(model100flat)} : la fatigue ralentit proportionnellement plus on avance.` : `Le modèle, lui, tient compte de la fatigue cumulée qui s'ajoute à mesure qu'on avance.`} Avec 4 500 m de D+ en montagne, l'estimation monte à environ ${fmtDur(model100)}.</p>
  <h2 style="${H2}">2. Négliger le dénivelé et la technicité (ou les compter deux fois)</h2>
  <p style="${P}">Le D+ doit être converti en <a href="/guides/km-effort-explique/" style="${LINK}">km-effort</a> une seule fois ; la technicité du terrain s'ajoute à part. Deux parcours de même distance et de même D+ peuvent différer fortement selon le terrain.</p>
  <h2 style="${H2}">3. Oublier le temps passé aux ravitaillements</h2>
  <p style="${P}">Plusieurs minutes par ravitaillement, multipliées par une dizaine de points, pèsent sur un chrono d'ultra. Voir <a href="/guides/temps-de-passage-trail/" style="${LINK}">estimer ses temps de passage</a>.</p>
  <h2 style="${H2}">4. Partir trop vite</h2>
  <p style="${P}">Un départ trop rapide se paie en seconde moitié de course. Un plan réaliste suppose une allure qu'on pourrait tenir bien au-delà de la distance prévue.</p>
  <h2 style="${H2}">5. Se fier à un chiffre unique</h2>
  <p style="${P}">Une estimation est une fourchette, pas une promesse. Elle peut d'ailleurs se tromper dans les deux sens : l'auteur du site a surestimé ses temps sur ses deux premières longues courses (voir <a href="/a-propos/" style="${LINK}">À propos</a>). L'important est de connaître l'ordre de grandeur et la marge par rapport à la barrière horaire.</p>
  <p style="margin:18px 0;"><a href="/" style="${CTA}">Estimer mon temps sur mon prochain ultra</a></p>`
    }
  ];

  guides.forEach(g => {
    const url = SITE + '/guides/' + g.slug + '/';
    const body = `
${breadcrumb([['Monchronotrail', '/'], ['Guides', '/guides/'], [g.h1, '/guides/' + g.slug + '/']])}
${faqLd(g.faq)}
${ld({ '@context': 'https://schema.org', '@type': 'Article', headline: g.h1, description: g.description,
  datePublished: PUB_DATE, dateModified: PUB_DATE, inLanguage: 'fr', mainEntityOfPage: url,
  author: { '@type': 'Organization', name: 'Monchronotrail', url: SITE + '/' },
  publisher: { '@type': 'Organization', name: 'Monchronotrail', url: SITE + '/' } })}
<div style="${WRAP}">
  <p style="font-size:13px;"><a href="/" style="${LINK}">← Monchronotrail</a> · <a href="/guides/" style="${LINK}">Guides</a></p>
  <h1 style="${H1}">${esc(g.h1)}</h1>
  <p style="${P}">${esc(g.intro)}</p>
  ${g.sections()}
  <h2 style="${H2}">Questions fréquentes</h2>
  ${faqHtml(g.faq)}
  <h2 style="${H2}">À lire aussi</h2>
  <p style="${P}">${guides.filter(x => x.slug !== g.slug).map(x => `<a href="/guides/${x.slug}/" style="${LINK}">${esc(x.h1)}</a>`).join(' · ')}</p>
  ${footer}
</div>`;
    write('guides/' + g.slug + '/index.html', page(headTags({ title: g.title, description: g.description, canonical: url, ogImage: OG }), body));
  });

  const guidesHubBody = `
${breadcrumb([['Monchronotrail', '/'], ['Guides', '/guides/']])}
<div style="${WRAP}">
  <p style="font-size:13px;"><a href="/" style="${LINK}">← Monchronotrail</a></p>
  <h1 style="${H1}">Guides pour estimer son temps en trail et en ultra</h1>
  <p style="${P}">Des explications courtes et chiffrées pour comprendre comment passer d'un chrono de référence à un temps de course réaliste.</p>
  <ul style="font-size:15px;padding-left:20px;line-height:1.8;">${guides.map(g => `<li><a href="/guides/${g.slug}/" style="${LINK}font-weight:600;">${esc(g.h1)}</a><br><span style="font-size:13.5px;color:#5C6B66;">${esc(g.description)}</span></li>`).join('\n    ')}</ul>
  <p style="${P}">Pour une distance précise : <a href="/temps-trail/" style="${LINK}">temps estimés par distance</a>.</p>
  ${footer}
</div>`;
  write('guides/index.html', page(headTags({
    title: 'Guides trail et ultra : estimer son temps de course | Monchronotrail',
    description: "Guides pratiques pour estimer son temps en trail et ultra-trail : conversion marathon/trail, km-effort, temps de passage, erreurs classiques.",
    canonical: SITE + '/guides/', ogImage: OG
  }), guidesHubBody));

  // ---------- 3. Bloc d'accueil (maillage interne + WebApplication) ----------
  const pill = 'display:inline-block;border:1px solid #D8DED4;border-radius:20px;padding:5px 12px;margin:0 6px 8px 0;font-size:13px;text-decoration:none;color:#2F4A3C;';
  const homeSectionHtml = `
${ld({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Monchronotrail',
  url: SITE + '/', applicationCategory: 'SportsApplication', operatingSystem: 'Any', inLanguage: 'fr',
  description: "Calculateur gratuit de temps de course pour trail et ultra-trail, selon le niveau, le dénivelé et le terrain.",
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } })}
<div class="tc-section" style="max-width:720px;margin:0 auto;">
  <h2>Estimer son temps selon la distance</h2>
  <p class="tc-sub">Un tableau par distance, du 20 km à l'ultra de 160 km :</p>
  <div>${DISTANCES.map(d => `<a href="${distUrl(d.km)}" style="${pill}">${d.km} km</a>`).join('')}</div>
  <h2 style="margin-top:20px;">Guides</h2>
  <ul class="tc-sub" style="padding-left:20px;">${guides.map(g => `<li><a href="/guides/${g.slug}/" style="color:#2F4A3C;">${esc(g.h1)}</a></li>`).join('')}</ul>
</div>`;

  const urls = [
    SITE + '/temps-trail/', ...DISTANCES.map(d => SITE + distUrl(d.km)),
    SITE + '/guides/', ...guides.map(g => SITE + '/guides/' + g.slug + '/')
  ];
  return { urls, homeSectionHtml };
};

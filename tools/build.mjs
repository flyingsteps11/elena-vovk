// Builds the static parts of the site. No dependencies: node tools/build.mjs
//  0. joins the admin's one-file-per-entry folders in content/ into data/<section>.json;
//  1. puts partials/header.html and partials/footer.html into every page between
//     <!-- @header --> … <!-- /@header --> and <!-- @footer --> … <!-- /@footer -->,
//     marking the current section from <body data-page="…">;
//  2. writes works/<id>.html for every published work, news/<id>.html for every published note,
//     games/<id>.html for every published game (crossword, quiz, «Найди пару», «Расставь по порядку»)
//     and the list of games in games.html;
//  3. writes sitemap.xml.
// Run it after changing a partial or anything in content/; the GitHub Action runs it on every push.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutCrossword } from './crossword.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://elena-vovk.netlify.app/';
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const write = (p, s) => { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), s); };

// 0. the admin keeps one file per entry in content/; the pages read one JSON per section from data/
const entries = (dir) => (existsSync(join(ROOT, dir)) ? readdirSync(join(ROOT, dir)) : [])
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const e = JSON.parse(read(`${dir}/${f}`));
    // an entry made in the admin has no id field: its file name is the id
    if (!e.id) e.id = f.replace(/\.json$/, '');
    return e;
  });
const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title || a.name).localeCompare(String(b.title || b.name), 'ru');
const byYear = (a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || String(a.title || a.event).localeCompare(String(b.title || b.event), 'ru');
const putData = (name, obj) => {
  const out = JSON.stringify(obj, null, 2) + '\n';
  const path = `data/${name}.json`;
  if (!existsSync(join(ROOT, path)) || read(path) !== out) { write(path, out); console.log('data', path); }
};
if (existsSync(join(ROOT, 'content'))) {
  putData('works', { works: entries('content/works').sort(byYear) });
  putData('materials', { disciplines: entries('content/disciplines').sort(byOrder), materials: entries('content/materials').sort(byOrder) });
  putData('achievements', {
    category: existsSync(join(ROOT, 'content/category.json')) ? JSON.parse(read('content/category.json')) : {},
    awards: entries('content/awards').sort(byYear),
  });
  putData('student-success', { items: entries('content/success').sort(byYear) });
  putData('news', { news: entries('content/news').sort((a, b) => String(b.date).localeCompare(String(a.date))) });
  putData('games', {
    crosswords: entries('content/crosswords').sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru')),
    quizzes: entries('content/quizzes').sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru')),
    matches: entries('content/matches').sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru')),
    orders: entries('content/orders').sort((a, b) => String(a.title).localeCompare(String(b.title), 'ru')),
  });
}

const header = read('partials/header.html');
const footer = read('partials/footer.html');
// which header group holds which page
const GROUPS = { about: ['achievements'], students: ['materials', 'success', 'games'] };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderPartial(src, { root, page }) {
  let out = src.replaceAll('{{root}}', root);
  // links to sections of the main page stay inside the page when we are on it
  if (page === 'home') out = out.replaceAll('href="index.html#', 'href="#').replaceAll('href="index.html"', 'href="#top"');
  const key = { work: 'works', note: 'news', game: 'games' }[page] || page;
  out = out.replaceAll(`data-key="${key}"`, `data-key="${key}" aria-current="page"`);
  for (const [group, keys] of Object.entries(GROUPS)) {
    if (keys.includes(key)) out = out.replaceAll(`data-group="${group}"`, `data-group="${group}" data-current`);
  }
  return out.trimEnd();
}

function fillPage(html, root) {
  const page = (html.match(/<body[^>]*data-page="([^"]+)"/) || [])[1] || '';
  const put = (s, name, part) => s.replace(
    new RegExp(`<!-- @${name} -->[\\s\\S]*?<!-- /@${name} -->`),
    () => `<!-- @${name} -->\n${renderPartial(part, { root, page })}\n<!-- /@${name} -->`,
  );
  return put(put(html, 'header', header), 'footer', footer);
}

// 1. pages in the site root
const pages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
for (const f of pages) {
  const html = read(f);
  if (!html.includes('<!-- @header -->')) continue;
  const out = fillPage(html, '');
  if (out !== html) { write(f, out); console.log('page', f); }
}

// 2. one page per work
const safeUrl = (u) => {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '';
  return u.replace(/^\/+/, '');
};
const ext = (u) => ((u.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '').toUpperCase();
const fileName = (u) => { try { return decodeURIComponent(u.split('?')[0].split('/').pop()); } catch { return u.split('/').pop(); } };
const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');
// a site path seen from works/<id>.html
const up = (u) => (/^https?:/i.test(u) ? u : '../' + u);

const works = (JSON.parse(read('data/works.json')).works || [])
  .filter((w) => w && w.title && w.id && /^[a-z0-9-]+$/.test(w.id) && w.published !== false)
  .map((w, i) => ({ ...w, _i: i }))
  .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || a._i - b._i);

const plate = (w) => `<span class="wplate" aria-hidden="true"><span class="wplate__type">${esc(w.type || 'Работа')}</span><span class="wplate__year num">${esc(w.year || '')}</span></span>`;
const meta = (w) => `<span>${esc([w.type, w.year].filter(Boolean).join(', '))}</span>${w.discipline ? `<span class="code num">${esc(w.discipline)}</span>` : ''}`;

function ticket(w) {
  const file = safeUrl(w.file), link = safeUrl(w.link);
  let body;
  if (file) {
    const local = !/^https?:/i.test(file) && existsSync(join(ROOT, file));
    const size = local ? sizeText(statSync(join(ROOT, file)).size) : '';
    body = `<p class="ticket__row"><span class="code">${esc(ext(file) || 'ФАЙЛ')}</span><span class="ticket__name">${esc(fileName(file))}</span><span class="ticket__size num">${size}</span></p>
          <div class="ticket__acts"><a class="btn" href="${esc(up(file))}" download="${esc(fileName(file))}" aria-label="Скачать файл ${esc(fileName(file))}">Скачать <span class="arr arr--down">↓</span></a><a class="btn btn--light" href="${esc(up(file))}" target="_blank" rel="noopener">Открыть в браузере</a></div>`;
  } else {
    body = '<p class="small">Файл этой работы пока не выложен.</p>';
  }
  const away = link ? `\n          <a class="tlink ticket__link" href="${esc(up(link))}" target="_blank" rel="noopener">Работа на другом сайте <span>→</span></a>` : '';
  return `<div class="${file ? 'ticket' : 'ticket ticket--none'}">\n          ${body}${away}\n        </div>`;
}

function workPage(w) {
  const cover = safeUrl(w.cover);
  const others = works.filter((o) => o.id !== w.id)
    .sort((a, b) => (b.type === w.type) - (a.type === w.type))
    .slice(0, 3);
  const desc = w.description || `${w.type || 'Работа'} преподавателя Е. А. Вовк, ${w.year || ''}.`;
  const url = `${SITE}works/${w.id}.html`;
  const ogImage = cover ? (/^https?:/i.test(cover) ? cover : SITE + cover) : SITE + 'og.jpg';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#351a2b">
<title>${esc(w.title)} — Е. А. Вовк</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(w.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23351a2b%22/%3E%3Ctext x=%2232%22 y=%2247%22 font-family=%22Georgia,serif%22 font-size=%2244%22 text-anchor=%22middle%22 fill=%22%23edccbe%22%3EВ%3C/text%3E%3C/svg%3E">
<script>document.documentElement.classList.add('js');setTimeout(function(){if(!window.__pageReady)document.documentElement.classList.remove('js')},2500)</script>
<link rel="preload" href="../fonts/vollkorn-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/vollkorn-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/literata-digits.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/kit.css">
</head>
<body id="top" data-page="work">
<!-- @header -->
<!-- /@header -->

<main>
<article class="wpage" aria-labelledby="work-h">
  <div class="wrap">
    <p class="wpage__back" data-r style="--i:0"><a class="tlink" href="../works.html">← Каталог работ</a></p>
    <div class="wpage__card">
      <div class="stripe" aria-hidden="true"></div>
      <div class="wpage__head">
        <h1 id="work-h" data-r style="--i:1">${esc(w.title)}</h1>
        <p class="meta" data-r style="--i:2">${meta(w)}</p>
      </div>
      <div class="wpage__grid">
        <div class="wpage__body">
          ${w.description ? `<p class="wpage__desc" data-r style="--i:3">${esc(w.description)}</p>` : ''}
          <div class="wpage__file" data-r style="--i:4">
          ${ticket(w)}
          </div>
        </div>
        <figure class="wpage__cover" data-r="pic" style="--i:2">${cover
          ? `<img src="${esc(up(cover))}" alt="" width="1000" height="750" decoding="async" fetchpriority="high">`
          : plate(w)}</figure>
      </div>
    </div>
  </div>
</article>
${others.length ? `
<section class="wmore on-dark" aria-labelledby="more-h">
  <div class="wrap">
    <h2 id="more-h" data-r style="--i:0">Другие работы</h2>
    <ul class="wmore__list">
${others.map((o, i) => {
    const oc = safeUrl(o.cover);
    const pic = oc ? `<img src="${esc(up(oc))}" alt="" width="1000" height="750" loading="lazy" decoding="async">` : plate(o);
    return `      <li data-r style="--i:${i + 1}"><a class="wmore__card" href="${o.id}.html"><span class="wmore__pic">${pic}</span><span class="wmore__title">${esc(o.title)}</span><span class="meta">${meta(o)}</span></a></li>`;
  }).join('\n')}
    </ul>
    <p class="wmore__all"><a class="btn btn--light" href="../works.html">Весь каталог <span class="arr" aria-hidden="true">→</span></a></p>
  </div>
</section>` : ''}
</main>

<!-- @footer -->
<!-- /@footer -->

<script src="../js/base.js"></script>
</body>
</html>
`;
}

if (existsSync(join(ROOT, 'works'))) rmSync(join(ROOT, 'works'), { recursive: true });
for (const w of works) write(`works/${w.id}.html`, fillPage(workPage(w), '../'));
console.log('work pages', works.length);

// 2b. one page per news note, in the calendar-leaf look of news.html
const notes = (JSON.parse(read('data/news.json')).news || [])
  .filter((n) => n && n.title && n.id && /^[a-z0-9-]+$/i.test(n.id) && /^\d{4}-\d{2}-\d{2}$/.test(n.date || '') && n.published !== false)
  .sort((a, b) => b.date.localeCompare(a.date));
const ruDate = (iso, opts) => new Intl.DateTimeFormat('ru-RU', opts).format(new Date(iso + 'T12:00:00'));
const fullDate = (iso) => ruDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
const paras = (text) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const leafDate = (n) => {
  const d = new Date(n.date + 'T12:00:00');
  const month = ruDate(n.date, { day: 'numeric', month: 'long' }).replace(/^\d+\s/, '');
  return `<div class="leaf__date" aria-hidden="true"><span class="leaf__day num">${d.getDate()}</span><span class="leaf__month">${esc(month)}</span><span class="leaf__dow">${esc(ruDate(n.date, { weekday: 'long' }))}</span><span class="leaf__year num">${d.getFullYear()}</span></div>`;
};
const noteCard = (n) => {
  const pic = safeUrl(n.image);
  const lead = paras(n.text)[0];
  return `      <article class="leaf${pic ? '' : ' leaf--noimg'}">${leafDate(n)}<div class="leaf__body"><h3><a class="leaf__link" href="${n.id}.html">${esc(n.title)}</a></h3><time class="sr-only" datetime="${n.date}">${esc(fullDate(n.date))}</time>${lead ? `<p class="leaf__lead">${esc(lead)}</p>` : ''}</div>${pic ? `<figure class="leaf__pic"><img src="${esc(up(pic))}" alt="" loading="lazy" decoding="async"></figure>` : ''}</article>`;
};

function notePage(n, i) {
  const pic = safeUrl(n.image);
  const text = paras(n.text);
  const desc = (text[0] || n.title).slice(0, 200);
  const url = `${SITE}news/${n.id}.html`;
  const ogImage = pic ? (/^https?:/i.test(pic) ? pic : SITE + pic) : SITE + 'og.jpg';
  // the three notes nearest in time, newer before older
  const others = notes.map((o, j) => ({ o, j })).filter((x) => x.j !== i)
    .sort((a, b) => Math.abs(a.j - i) - Math.abs(b.j - i) || a.j - b.j).slice(0, 3)
    .sort((a, b) => a.j - b.j).map((x) => x.o);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#351a2b">
<title>${esc(n.title)} — Е. А. Вовк</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(n.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="article:published_time" content="${n.date}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23351a2b%22/%3E%3Ctext x=%2232%22 y=%2247%22 font-family=%22Georgia,serif%22 font-size=%2244%22 text-anchor=%22middle%22 fill=%22%23edccbe%22%3EВ%3C/text%3E%3C/svg%3E">
<script>document.documentElement.classList.add('js');setTimeout(function(){if(!window.__pageReady)document.documentElement.classList.remove('js')},2500)</script>
<link rel="preload" href="../fonts/vollkorn-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/vollkorn-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/literata-digits.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/kit.css">
</head>
<body id="top" data-page="note">
<!-- @header -->
<!-- /@header -->

<main>
<div class="npage">
  <div class="wrap">
    <p class="wpage__back" data-r style="--i:0"><a class="tlink" href="../news.html">← Все новости</a></p>
    <article class="note" data-r style="--i:1" aria-labelledby="note-h">
      <div class="note__side">
        <div class="note__stack" aria-hidden="true"><div class="note__cal"><span class="note__mon">${esc(ruDate(n.date, { month: 'long' }))}</span><span class="note__day num">${Number(n.date.slice(8))}</span><span class="note__dow">${esc(ruDate(n.date, { weekday: 'long' }))}</span><span class="note__yr num">${n.date.slice(0, 4)}</span></div></div>
      </div>
      <div class="note__body">
        <h1 id="note-h">${esc(n.title)}</h1>
        <p class="note__meta"><a href="../news.html">Новости</a> · <time datetime="${n.date}">${esc(fullDate(n.date))}</time></p>
        ${text.length ? `<p class="note__lead">${esc(text[0])}</p>` : ''}
        ${text.length > 1 ? `<div class="note__text">
${text.slice(1).map((p) => `          <p>${esc(p)}</p>`).join('\n')}
        </div>` : ''}
        ${pic ? `<figure class="note__pic"><img src="${esc(up(pic))}" alt="" decoding="async" fetchpriority="high"></figure>` : ''}
      </div>
    </article>
  </div>
</div>
${others.length ? `
<section class="nmore" aria-labelledby="more-h">
  <div class="wrap">
    <h2 id="more-h" data-r style="--i:0">Другие записи</h2>
    <div class="nmore__list">
${others.map(noteCard).join('\n')}
    </div>
    <p class="nmore__all"><a class="btn" href="../news.html">Все новости <span class="arr" aria-hidden="true">→</span></a></p>
  </div>
</section>` : ''}
</main>

<!-- @footer -->
<!-- /@footer -->

<script src="../js/base.js"></script>
</body>
</html>
`;
}

if (existsSync(join(ROOT, 'news'))) rmSync(join(ROOT, 'news'), { recursive: true });
notes.forEach((n, i) => write(`news/${n.id}.html`, fillPage(notePage(n, i), '../')));
console.log('news pages', notes.length);

// 2c. one page per crossword, and their cards in games.html
const disciplines = existsSync(join(ROOT, 'data/materials.json')) ? (JSON.parse(read('data/materials.json')).disciplines || []) : [];
const discOf = (id) => disciplines.find((d) => d.id === id);
const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
const wordsText = (n) => `${n} ${plural(n, 'слово', 'слова', 'слов')}`;
// answers travel base64-encoded: the page source does not give them away at a glance
const enc = (s) => Buffer.from(s, 'utf8').toString('base64');
const cellOf = (w, k) => (w.x + (w.dir === 'down' ? 0 : k)) + ',' + (w.y + (w.dir === 'down' ? k : 0));
const crosswords = (existsSync(join(ROOT, 'data/games.json')) ? (JSON.parse(read('data/games.json')).crosswords || []) : [])
  .filter((c) => c && c.title && c.id && /^[a-z0-9-]+$/.test(c.id) && c.published !== false)
  .map((c) => ({ ...c, grid: layoutCrossword(c.words, c.variant) }))
  .filter((c) => c.grid && c.grid.words.length >= 2);
for (const c of crosswords) if (c.grid.skipped.length) console.log(`crossword ${c.id}: did not fit:`, c.grid.skipped.join(', '));

// a small picture of the grid for the catalog card
const gridSvg = (g) => {
  const set = new Set();
  g.words.forEach((w) => { for (let k = 0; k < w.answer.length; k++) set.add(cellOf(w, k)); });
  const rects = [...set].map((p) => { const [x, y] = p.split(','); return `<rect x="${x}" y="${y}" width="1" height="1"/>`; }).join('');
  return `<svg viewBox="-0.2 -0.2 ${g.width + 0.4} ${g.height + 0.4}" aria-hidden="true" focusable="false"><g fill="#f6e3da" stroke="#351a2b" stroke-width=".08">${rects}</g></svg>`;
};

function gamePage(c) {
  const g = c.grid, n = g.words.length;
  const desc = c.description || `Кроссворд «${c.title}»: ${wordsText(n)} по бухгалтерскому учёту.`;
  const num = new Map();
  const labels = new Map();
  g.words.forEach((w) => {
    if (!num.has(w.x + ',' + w.y)) num.set(w.x + ',' + w.y, w.n);
    for (let k = 0; k < w.answer.length; k++) {
      const p = cellOf(w, k);
      if (!labels.has(p)) labels.set(p, []);
      labels.get(p).push(`${w.n} ${w.dir === 'down' ? 'по вертикали' : 'по горизонтали'}, буква ${k + 1} из ${w.answer.length}`);
    }
  });
  let cells = '';
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const p = x + ',' + y;
      if (!labels.has(p)) { cells += '<span class="cw__x"></span>'; continue; }
      const nn = num.get(p);
      cells += `<span class="cw__c" data-x="${x}" data-y="${y}">${nn ? `<span class="cw__n">${nn}</span>` : ''}<input maxlength="2" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next" aria-label="${esc(labels.get(p).join('; '))}"></span>`;
    }
  }
  const list = (dir, title) => {
    const ws = g.words.map((w, i) => ({ ...w, i })).filter((w) => w.dir === dir);
    return ws.length ? `<section><h2>${title}</h2><ol>${ws.map((w) => `<li data-w="${w.i}"><b>${w.n}.</b> ${esc(w.clue)} <span class="len">(${w.answer.length})</span></li>`).join('')}</ol></section>` : '';
  };
  const data = { id: c.id, words: g.words.map((w) => ({ n: w.n, dir: w.dir, x: w.x, y: w.y, a: enc(w.answer), clue: w.clue })) };
  return gameShell(c, {
    kind: 'Кроссворд', desc, size: wordsText(n), data, script: 'crossword.js', body: `
      ${c.description ? `<p class="cw__desc">${esc(c.description)}</p>` : ''}
      <div class="cw__card"><button type="button" data-act="prev" aria-label="Предыдущая подсказка">‹</button><div><span class="cw__no"></span><p class="cw__q" aria-live="polite"></p></div><button type="button" data-act="next" aria-label="Следующая подсказка">›</button></div>
      <div class="cw__board" style="--w:${g.width}"><div class="cw__grid">${cells}</div></div>
      <div class="cw__prog" aria-hidden="true">${g.words.map(() => '<i></i>').join('')}</div>
      <details class="cw__clues" open><summary>Все подсказки</summary>${list('across', 'По горизонтали')}${list('down', 'По вертикали')}</details>
      <div class="cw__bar"><button class="btn" type="button" data-act="check">Проверить</button><button class="btn btn--light" type="button" data-act="hint">Открыть букву</button><button class="btn btn--light" type="button" data-act="reset">Начать заново</button><p class="cw__status" role="status">Разгадано 0 из ${n}</p></div>
      <p class="cw__done" hidden>Кроссворд разгадан! Все ${wordsText(n)} на месте.</p>`,
  });
}

// a quiz: questions with lettered answers, checked at once with an explanation (the exam-ticket look)
const questionsText = (n) => `${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}`;
const quizzes = (existsSync(join(ROOT, 'data/games.json')) ? (JSON.parse(read('data/games.json')).quizzes || []) : [])
  .filter((q) => q && q.title && q.id && /^[a-z0-9-]+$/.test(q.id) && q.published !== false && !crosswords.some((c) => c.id === q.id))
  .map((q) => ({ ...q, questions: (q.questions || []).filter((x) => x && x.question && (x.options || []).filter((o) => o && o.text).length >= 2 && x.options.some((o) => o && o.correct)) }))
  .filter((q) => q.questions.length);

// a small exam ticket with one answer chosen, for the catalog card
const ticketSvg = '<svg viewBox="0 0 120 90" aria-hidden="true" focusable="false"><rect x="14" y="8" width="92" height="74" fill="#f6e3da"/><path d="M22 18h60" stroke="#351a2b" stroke-width="3"/><path d="M22 26h44" stroke="#c48a76" stroke-width="2"/><g fill="#e3b9a7"><rect x="22" y="34" width="76" height="8"/><rect x="22" y="56" width="76" height="8"/><rect x="22" y="67" width="76" height="8"/></g><rect x="22" y="45" width="76" height="8" fill="#351a2b"/></svg>';

function quizPage(q) {
  const n = q.questions.length;
  const desc = q.description || `Викторина «${q.title}»: ${questionsText(n)} по бухгалтерскому учёту.`;
  const data = {
    id: q.id,
    shuffle: q.shuffle !== false,
    questions: q.questions.map((x) => {
      const opts = x.options.filter((o) => o && o.text);
      const img = safeUrl(x.image);
      return { q: x.question, img: img ? up(img) : '', why: x.explain || '', opts: opts.map((o) => String(o.text)), a: enc(JSON.stringify(opts.map((o, k) => (o.correct ? k : -1)).filter((k) => k >= 0))) };
    }),
  };
  return gameShell(q, {
    kind: 'Викторина', desc, size: questionsText(n), data, script: 'quiz.js', body: `
      ${q.description ? `<p class="cw__desc">${esc(q.description)}</p>` : ''}
      <div class="qz"><noscript><p>Для викторины нужен включённый JavaScript.</p></noscript></div>`,
  });
}

// «Найди пару»: terms on the left, definitions on the right, joined by a thread when they match
const pairsText = (n) => `${n} ${plural(n, 'пара', 'пары', 'пар')}`;
const matches = (existsSync(join(ROOT, 'data/games.json')) ? (JSON.parse(read('data/games.json')).matches || []) : [])
  .filter((m) => m && m.title && m.id && /^[a-z0-9-]+$/.test(m.id) && m.published !== false
    && !crosswords.some((c) => c.id === m.id) && !quizzes.some((q) => q.id === m.id))
  .map((m) => ({ ...m, pairs: (m.pairs || []).filter((p) => p && p.term && p.definition) }))
  .filter((m) => m.pairs.length >= 2);

// two columns of cards joined by threads, for the catalog card
const pairsSvg = '<svg viewBox="0 0 120 90" aria-hidden="true" focusable="false"><g fill="#f6e3da"><rect x="8" y="12" width="36" height="12"/><rect x="8" y="32" width="36" height="12"/><rect x="8" y="52" width="36" height="12"/><rect x="76" y="12" width="36" height="12"/><rect x="76" y="32" width="36" height="12"/><rect x="76" y="52" width="36" height="12"/></g><path d="M44 18 C60 18 60 58 76 58 M44 38 C60 38 60 18 76 18" fill="none" stroke="#d9a441" stroke-width="2.5"/><path d="M44 58 C60 58 60 38 76 38" fill="none" stroke="#e3b9a7" stroke-width="2" stroke-dasharray="3 3"/></svg>';

function matchPage(m) {
  const n = m.pairs.length;
  const desc = m.description || `Найди пару «${m.title}»: ${pairsText(n)} «термин — определение» по бухгалтерскому учёту.`;
  const data = { id: m.id, p: enc(JSON.stringify(m.pairs.map((p) => [String(p.term), String(p.definition)]))) };
  return gameShell(m, {
    kind: 'Найди пару', desc, size: pairsText(n), data, script: 'match.js', body: `
      ${m.description ? `<p class="cw__desc">${esc(m.description)}</p>` : ''}
      <div class="mt"><noscript><p>Для игры нужен включённый JavaScript.</p></noscript></div>`,
  });
}

// «Расставь по порядку»: the steps of a procedure, shuffled, to be put back in order
const stepsText = (n) => `${n} ${plural(n, 'шаг', 'шага', 'шагов')}`;
const orders = (existsSync(join(ROOT, 'data/games.json')) ? (JSON.parse(read('data/games.json')).orders || []) : [])
  .filter((o) => o && o.title && o.id && /^[a-z0-9-]+$/.test(o.id) && o.published !== false
    && ![...crosswords, ...quizzes, ...matches].some((g) => g.id === o.id))
  .map((o) => ({ ...o, steps: (o.steps || []).map((s) => String((s && s.text) || '').trim()).filter(Boolean) }))
  .filter((o) => o.steps.length >= 3);

// a numbered list with one row lifted out of place, for the catalog card
const orderSvg = '<svg viewBox="0 0 120 90" aria-hidden="true" focusable="false"><g fill="#f6e3da"><rect x="22" y="10" width="80" height="12"/><rect x="22" y="28" width="80" height="12"/><rect x="22" y="64" width="80" height="12"/></g><rect x="28" y="44" width="80" height="13" fill="#e3b9a7" transform="rotate(-3 68 50)"/><g fill="#d9a441"><rect x="10" y="10" width="12" height="12"/><rect x="10" y="28" width="12" height="12"/></g><rect x="10" y="64" width="12" height="12" fill="#a5566a"/></svg>';

function orderPage(o) {
  const n = o.steps.length;
  const desc = o.description || `Расставь по порядку «${o.title}»: ${stepsText(n)} по бухгалтерскому учёту.`;
  const data = { id: o.id, s: enc(JSON.stringify(o.steps)), why: o.explain || '' };
  return gameShell(o, {
    kind: 'Расставь по порядку', desc, size: stepsText(n), data, script: 'order.js', body: `
      ${o.description ? `<p class="cw__desc">${esc(o.description)}</p>` : ''}
      <div class="od"><p class="od__task">${esc(o.task || 'Расположите шаги в правильной последовательности.')}</p><noscript><p>Для игры нужен включённый JavaScript.</p></noscript></div>`,
  });
}

// the page around a game: the same head, header, back link and footer for every kind
function gameShell(g, { kind, desc, size, data, script, body }) {
  const d = discOf(g.discipline);
  const url = `${SITE}games/${g.id}.html`;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#351a2b">
<title>${kind} «${esc(g.title)}» — Е. А. Вовк</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${kind} «${esc(g.title)}»">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}og.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23351a2b%22/%3E%3Ctext x=%2232%22 y=%2247%22 font-family=%22Georgia,serif%22 font-size=%2244%22 text-anchor=%22middle%22 fill=%22%23edccbe%22%3EВ%3C/text%3E%3C/svg%3E">
<script>document.documentElement.classList.add('js');setTimeout(function(){if(!window.__pageReady)document.documentElement.classList.remove('js')},2500)</script>
<link rel="preload" href="../fonts/vollkorn-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/vollkorn-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="../fonts/literata-digits.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../css/base.css">
<link rel="stylesheet" href="../css/kit.css">
<link rel="stylesheet" href="../css/games.css">
</head>
<body id="top" data-page="game">
<!-- @header -->
<!-- /@header -->

<main>
<div class="cwp">
  <div class="wrap">
    <p class="wpage__back"><a class="tlink" href="../games.html">← Все игры</a></p>
    <article class="cw${kind === 'Кроссворд' ? '' : ' cw--quiz'}" aria-labelledby="cw-h">
      <header class="cw__head">
        <h1 id="cw-h">${kind} · ${esc(g.title)}</h1>
        <p class="cw__meta">${d ? `<span class="code num">${esc(d.code)}</span>` : ''}<span>${size}</span></p>
      </header>${body}
    </article>
  </div>
</div>
</main>

<!-- @footer -->
<!-- /@footer -->

<script type="application/json" id="cw-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>
<script src="../js/base.js"></script>
<script src="../js/${script}"></script>
</body>
</html>
`;
}

if (existsSync(join(ROOT, 'games'))) rmSync(join(ROOT, 'games'), { recursive: true });
for (const c of crosswords) write(`games/${c.id}.html`, fillPage(gamePage(c), '../'));
for (const q of quizzes) write(`games/${q.id}.html`, fillPage(quizPage(q), '../'));
for (const m of matches) write(`games/${m.id}.html`, fillPage(matchPage(m), '../'));
for (const o of orders) write(`games/${o.id}.html`, fillPage(orderPage(o), '../'));
console.log('game pages', crosswords.length + quizzes.length + matches.length + orders.length);
if (existsSync(join(ROOT, 'games.html'))) {
  const games = [
    ...crosswords.map((c) => ({ g: c, kind: 'Кроссворд', pic: gridSvg(c.grid), size: wordsText(c.grid.words.length) })),
    ...quizzes.map((q) => ({ g: q, kind: 'Викторина', pic: ticketSvg, size: questionsText(q.questions.length) })),
    ...matches.map((m) => ({ g: m, kind: 'Найди пару', pic: pairsSvg, size: pairsText(m.pairs.length) })),
    ...orders.map((o) => ({ g: o, kind: 'Расставь по порядку', pic: orderSvg, size: stepsText(o.steps.length) })),
  ].sort((a, b) => String(a.g.title).localeCompare(String(b.g.title), 'ru'));
  const cards = games.length
    ? `<ul class="gcat__list">\n${games.map(({ g, kind, pic, size }, i) => {
      const d = discOf(g.discipline);
      const meta = [d && d.code, size].filter(Boolean).map(esc).join(' · ');
      return `        <li data-r style="--i:${i}"><a class="gcard" href="games/${g.id}.html"><span class="gcard__pic">${pic}</span><span class="gcard__kind">${kind}</span><span class="gcard__title">${esc(g.title)}</span><span class="gcard__meta">${meta}</span></a></li>`;
    }).join('\n')}\n      </ul>`
    : '<p class="gcat__empty">Игры скоро появятся.</p>';
  const html = read('games.html');
  const out = html.replace(/<!-- @games -->[\s\S]*?<!-- \/@games -->/, () => `<!-- @games -->\n      ${cards}\n      <!-- /@games -->`);
  if (out !== html) { write('games.html', out); console.log('page games.html (list)'); }
}

// 3. sitemap
const urls = [
  ...pages.filter((f) => f !== '404.html').map((f) => (f === 'index.html' ? SITE : SITE + f)),
  ...works.map((w) => `${SITE}works/${w.id}.html`),
  ...notes.map((n) => `${SITE}news/${n.id}.html`),
  ...crosswords.map((c) => `${SITE}games/${c.id}.html`),
  ...quizzes.map((q) => `${SITE}games/${q.id}.html`),
  ...matches.map((m) => `${SITE}games/${m.id}.html`),
  ...orders.map((o) => `${SITE}games/${o.id}.html`),
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
console.log('sitemap', urls.length, 'urls');

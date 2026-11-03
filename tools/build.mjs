// Builds the static parts of the site. No dependencies: node tools/build.mjs
//  0. joins the admin's one-file-per-entry folders in content/ into data/<section>.json;
//  1. puts partials/header.html and partials/footer.html into every page between
//     <!-- @header --> … <!-- /@header --> and <!-- @footer --> … <!-- /@footer -->,
//     marking the current section from <body data-page="…">;
//  2. writes works/<id>.html for every published work and news/<id>.html for every published note;
//  3. writes sitemap.xml.
// Run it after changing a partial or anything in content/; the GitHub Action runs it on every push.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://flyingsteps11.github.io/elena-vovk/';
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
}

const header = read('partials/header.html');
const footer = read('partials/footer.html');
// which header group holds which page
const GROUPS = { about: ['achievements'], students: ['materials', 'success'] };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderPartial(src, { root, page }) {
  let out = src.replaceAll('{{root}}', root);
  // links to sections of the main page stay inside the page when we are on it
  if (page === 'home') out = out.replaceAll('href="index.html#', 'href="#').replaceAll('href="index.html"', 'href="#top"');
  const key = { work: 'works', note: 'news' }[page] || page;
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
const paras = (text) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const leafDate = (n) => {
  const d = new Date(n.date + 'T12:00:00');
  const month = ruDate(n.date, { day: 'numeric', month: 'long' }).replace(/^\d+\s/, '');
  return `<div class="leaf__date" aria-hidden="true"><span class="leaf__day num">${d.getDate()}</span><span class="leaf__month">${esc(month)}</span><span class="leaf__dow">${esc(ruDate(n.date, { weekday: 'long' }))}</span><span class="leaf__year num">${d.getFullYear()}</span></div>`;
};
const noteCard = (n) => {
  const pic = safeUrl(n.image);
  const lead = paras(n.text)[0];
  return `      <article class="leaf${pic ? '' : ' leaf--noimg'}">${leafDate(n)}<div class="leaf__body"><h3><a class="leaf__link" href="${n.id}.html">${esc(n.title)}</a></h3><time class="sr-only" datetime="${n.date}">${esc(ruDate(n.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</time>${lead ? `<p class="leaf__lead">${esc(lead)}</p>` : ''}</div>${pic ? `<figure class="leaf__pic"><img src="${esc(up(pic))}" alt="" loading="lazy" decoding="async"></figure>` : ''}</article>`;
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
    <article class="leaf leaf--page" data-r style="--i:1" aria-labelledby="note-h">
      ${leafDate(n)}
      <div class="leaf__body">
        <h1 id="note-h">${esc(n.title)}</h1>
        <time class="sr-only" datetime="${n.date}">${esc(ruDate(n.date, { day: 'numeric', month: 'long', year: 'numeric' }))}</time>
        <div class="leaf__text">
${text.map((p) => `          <p>${esc(p)}</p>`).join('\n')}
        </div>
        ${pic ? `<figure class="leaf__pic"><img src="${esc(up(pic))}" alt="" decoding="async" fetchpriority="high"></figure>` : ''}
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

// 3. sitemap
const urls = [
  ...pages.filter((f) => f !== '404.html').map((f) => (f === 'index.html' ? SITE : SITE + f)),
  ...works.map((w) => `${SITE}works/${w.id}.html`),
  ...notes.map((n) => `${SITE}news/${n.id}.html`),
];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
console.log('sitemap', urls.length, 'urls');

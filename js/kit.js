// Shared by the inner pages (materials, achievements, student success, news): data loading,
// pictures with a drawn fallback, the file ticket, filter chips, state in the address, the dialog.
window.kit = (() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const plural = (n, [one, few, many]) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  };
  // Absolute links stay; site paths are made relative so they work under /elena-vovk/
  const safeUrl = (u) => {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) return '';
    return u.replace(/^\/+/, '');
  };
  const ext = (u) => (u.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1]?.toUpperCase() || '';
  const fileName = (u) => { try { return decodeURIComponent(u.split('?')[0].split('/').pop()); } catch { return u.split('/').pop(); } };
  const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(n / 1024)) + ' КБ');
  const sizes = new Map();
  const fileSize = (url) => {
    if (!sizes.has(url)) {
      // only our own files: a request to another site would need its permission
      sizes.set(url, /^https?:/i.test(url) ? Promise.resolve(0)
        : fetch(url, { method: 'HEAD' }).then((r) => Number(r.headers.get('content-length')) || 0).catch(() => 0));
    }
    return sizes.get(url);
  };

  const load = (url) => fetch(url, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const published = (list) => (Array.isArray(list) ? list : []).filter((x) => x && x.published !== false);

  // A drawn cover: the kind of thing above, a large figure below
  const plate = (top, bottom) => {
    const p = el('span', 'wplate');
    p.setAttribute('aria-hidden', 'true');
    p.append(el('span', 'wplate__type', top), el('span', 'wplate__year num', bottom ?? ''));
    return p;
  };
  const picture = (box, src, fallback, { eager = false, alt = '' } = {}) => {
    box.replaceChildren();
    src = safeUrl(src);
    if (!src) { box.append(fallback()); return; }
    const img = el('img');
    img.alt = alt; img.decoding = eager ? 'sync' : 'async'; img.loading = eager ? 'eager' : 'lazy';
    img.src = src;
    img.addEventListener('error', () => box.replaceChildren(fallback()), { once: true });
    box.append(img);
  };

  // The file, issued like a ticket from the receipt book
  const ticket = (fileUrl, linkUrl, { none = 'Файл пока не выложен.' } = {}) => {
    const file = safeUrl(fileUrl), link = safeUrl(linkUrl);
    const box = el('div', file ? 'ticket' : 'ticket ticket--none');
    if (file) {
      const size = el('span', 'ticket__size num', '');
      const row = el('p', 'ticket__row');
      row.append(el('span', 'code', ext(file) || 'ФАЙЛ'), el('span', 'ticket__name', fileName(file)), size);
      fileSize(file).then((n) => { if (n) size.textContent = sizeText(n); });
      const dl = el('a', 'btn');
      dl.href = file; dl.setAttribute('download', fileName(file));
      dl.setAttribute('aria-label', 'Скачать файл ' + fileName(file));
      dl.append('Скачать ', el('span', 'arr arr--down', '↓'));
      const view = el('a', 'btn btn--light', 'Открыть в браузере');
      view.href = file; view.target = '_blank'; view.rel = 'noopener';
      const acts = el('div', 'ticket__acts');
      acts.append(dl, view);
      box.append(row, acts);
    } else if (!link) {
      box.append(el('p', 'small', none));
    }
    if (link) {
      const a = el('a', file ? 'tlink ticket__link' : 'btn');
      a.href = link; a.target = '_blank'; a.rel = 'noopener';
      a.append(file ? 'Открыть ссылку ' : 'Перейти по ссылке ', el('span', 'arr', '→'));
      box.append(a);
    }
    return box;
  };

  // Filter chips: one pressed at a time
  const chips = (box, options, current, onPick) => {
    box.replaceChildren(...options.map(({ label, value }) => {
      const b = el('button', null, label);
      b.type = 'button'; b.dataset.value = value;
      b.addEventListener('click', () => onPick(value));
      return b;
    }));
    box.hidden = options.length < 3;
    const mark = (v) => [...box.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
    mark(current);
    return mark;
  };

  // State in the address: ?key=value, without a reload
  const query = {
    get: (name, fallback = '') => new URLSearchParams(location.search).get(name) || fallback,
    set(values, { push = false } = {}) {
      const q = new URLSearchParams(location.search);
      Object.entries(values).forEach(([k, v]) => (v == null || v === '' || v === 'all' ? q.delete(k) : q.set(k, v)));
      const qs = q.toString();
      history[push ? 'pushState' : 'replaceState'](history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    },
  };

  // The dialog opens in one piece and gives focus back to what opened it
  const dialog = (dlg, closeBtn) => {
    let back = null;
    const close = () => {
      if (!dlg.open) return;
      dlg.close();
      document.documentElement.classList.remove('menu-open');
      if (back) back.focus({ preventScroll: true });
    };
    closeBtn.addEventListener('click', close);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    return {
      open(from) {
        back = from || document.activeElement;
        if (!dlg.open) dlg.showModal();
        document.documentElement.classList.add('menu-open');
        dlg.scrollTop = 0;
      },
      close,
    };
  };

  return { $, el, plural, safeUrl, ext, fileName, load, published, plate, picture, ticket, chips, query, dialog };
})();

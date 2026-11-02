// Shared by every page: stripe band, rolling figures, reveals, phone menu.
// Pages that add content later call window.site.reveal(nodes) / window.site.roll(nodes).
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Stripe bars for the card band
  document.querySelectorAll('.stripe').forEach((stripe) => {
    const n = Math.max(12, Math.ceil(stripe.offsetWidth / 28) | 1);
    for (let i = 0; i < n; i++) { const s = document.createElement('span'); s.style.setProperty('--s', i); stripe.append(s); }
  });

  // Rolling figures
  const roll = (els) => {
    els.forEach((el) => {
      const value = el.textContent.trim();
      const said = Object.assign(document.createElement('span'), { className: 'sr-only', textContent: value });
      const shown = Object.assign(document.createElement('span'), { className: 'roll__digits' });
      shown.setAttribute('aria-hidden', 'true');
      let i = 0;
      for (const ch of value) {
        if (!/\d/.test(ch)) { shown.append(ch); continue; }
        const col = Object.assign(document.createElement('span'), { className: 'roll__col' });
        const strip = Object.assign(document.createElement('span'), { className: 'roll__strip' });
        strip.style.setProperty('--d', ch); strip.style.setProperty('--i', i++);
        col.append(strip); shown.append(col);
      }
      el.classList.remove('is-in');
      el.classList.add('roll'); el.replaceChildren(said, shown);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((el) => el.classList.add('is-in'))));
  };
  roll([...document.querySelectorAll('[data-roll]')]);

  // Section reveals, once
  const items = new Set();
  let io = null;
  if ('IntersectionObserver' in window && !reduce) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); items.delete(e.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    // a fast jump (keyboard End, an anchor) can skip the observer: reveal whatever is already above the fold
    let tick = 0;
    const sweep = () => {
      tick = 0;
      for (const el of items) if (el.getBoundingClientRect().top < innerHeight * 0.95) { el.classList.add('is-in'); io.unobserve(el); items.delete(el); }
    };
    addEventListener('scroll', () => { if (!tick) tick = requestAnimationFrame(sweep); }, { passive: true });
    addEventListener('load', sweep);
  }
  const reveal = (els) => {
    els.forEach((el) => {
      if (!io) { el.classList.add('is-in'); return; }
      items.add(el); io.observe(el);
    });
  };
  reveal([...document.querySelectorAll('[data-r]')]);

  // Phone menu: full-screen list of sections
  const menuBtn = document.querySelector('.menu-btn');
  const menu = document.getElementById('mnav');
  if (menuBtn && menu) {
    const links = [...menu.querySelectorAll('a')];
    const closeBtn = menu.querySelector('.mnav__close');
    let hideTimer = 0;
    const setOpen = (open, refocus = true) => {
      clearTimeout(hideTimer);
      if (open) { menu.hidden = false; menu.getBoundingClientRect(); menu.classList.add('is-open'); }
      else { menu.classList.remove('is-open'); hideTimer = setTimeout(() => { menu.hidden = true; }, reduce ? 0 : 220); }
      menuBtn.setAttribute('aria-expanded', String(open));
      document.documentElement.classList.toggle('menu-open', open);
      if (open) menu.focus({ preventScroll: true });
      else if (refocus) menuBtn.focus({ preventScroll: true });
    };
    menuBtn.addEventListener('click', () => setOpen(true));
    closeBtn.addEventListener('click', () => setOpen(false));
    links.forEach((a) => a.addEventListener('click', () => setOpen(false, false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setOpen(false); });
    matchMedia('(min-width: 901px)').addEventListener('change', (m) => { if (m.matches) setOpen(false, false); });
  }

  // Header dropdowns: hover or click opens; Esc, a click outside or leaving with Tab closes
  const dds = [...document.querySelectorAll('.dd')];
  const hover = matchMedia('(hover: hover)').matches;
  const setDd = (dd, open) => {
    dd.classList.toggle('is-open', open);
    dd.querySelector('.dd__btn').setAttribute('aria-expanded', String(open));
  };
  dds.forEach((dd) => {
    const btn = dd.querySelector('.dd__btn');
    const links = [...dd.querySelectorAll('.dd__list a')];
    btn.addEventListener('click', () => {
      // with a mouse the list is already open from hovering, so a click keeps it open
      const open = hover ? true : !dd.classList.contains('is-open');
      dds.forEach((x) => x !== dd && setDd(x, false));
      setDd(dd, open);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setDd(dd, true); links[0].focus(); }
    });
    dd.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dd.classList.contains('is-open')) { setDd(dd, false); btn.focus(); return; }
      const i = links.indexOf(document.activeElement);
      if (i > -1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        links[(i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
      }
    });
    dd.addEventListener('focusout', (e) => { if (!dd.contains(e.relatedTarget)) setDd(dd, false); });
    if (hover) {
      let t = 0;
      dd.addEventListener('mouseenter', () => { clearTimeout(t); dds.forEach((x) => x !== dd && setDd(x, false)); setDd(dd, true); });
      dd.addEventListener('mouseleave', () => { t = setTimeout(() => setDd(dd, false), 180); });
    }
  });
  document.addEventListener('click', (e) => dds.forEach((dd) => { if (!dd.contains(e.target)) setDd(dd, false); }));

  // "#top" is the very top of the page, above the sticky header
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href="#top"]');
    if (!a) return;
    e.preventDefault();
    scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
  });

  window.site = { reduce, reveal, roll };
  window.__pageReady = true;
})();

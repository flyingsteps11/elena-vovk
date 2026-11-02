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

  window.site = { reduce, reveal, roll };
  window.__pageReady = true;
})();

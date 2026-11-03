// «Найди пару» on games/<id>.html: terms on the left, definitions on the right in another order.
// Pick one on each side; a right pair stays joined by a thread, a wrong one flashes and counts as a mistake.
// On a phone the terms become a row of chips above the definitions, and a found pair shows its term on the card.
// Pairs come from #cw-data (written by tools/build.mjs); the fewest mistakes are kept in this browser only.
(() => {
  const box = document.querySelector('.mt');
  const dataEl = document.getElementById('cw-data');
  if (!box || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  let pairs = [];
  try { pairs = JSON.parse(decodeURIComponent(escape(atob(data.p)))); } catch { return; }
  const key = 'mt:' + data.id;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const narrow = matchMedia('(max-width: 760px)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const best = {
    get() { try { const v = localStorage.getItem(key); return v === null ? null : Number(v); } catch { return null; } },
    set(v) { try { localStorage.setItem(key, String(v)); } catch { /* private mode */ } },
  };

  let sel = null, found = 0, errors = 0, board, svg, status;
  const joined = new Set();

  function start() {
    sel = null; found = 0; errors = 0; joined.clear();
    const left = shuffle(pairs.map((_, i) => i));
    let right = shuffle(pairs.map((_, i) => i));
    // the right column never repeats the left order
    if (pairs.length > 2) while (right.every((v, i) => v === left[i])) right = shuffle(right);
    box.innerHTML = `
      <div class="mt__board">
        <ol class="mt__col mt__terms" aria-label="Термины">${left.map((i) => `<li><button class="mt__item" type="button" data-side="l" data-i="${i}" aria-pressed="false">${esc(pairs[i][0])}</button></li>`).join('')}</ol>
        <ol class="mt__col mt__defs" aria-label="Определения">${right.map((i) => `<li><button class="mt__item" type="button" data-side="r" data-i="${i}" aria-pressed="false"><span class="mt__tag"></span>${esc(pairs[i][1])}</button></li>`).join('')}</ol>
        <svg class="mt__threads" aria-hidden="true" focusable="false"></svg>
      </div>
      <p class="mt__done" hidden></p>
      <div class="mt__bar"><span class="mt__status" role="status"></span><button class="btn btn--light" type="button" data-act="again">Начать заново</button></div>`;
    board = box.querySelector('.mt__board');
    svg = box.querySelector('.mt__threads');
    status = box.querySelector('.mt__status');
    box.querySelectorAll('.mt__item').forEach((b) => b.addEventListener('click', () => pick(b)));
    box.querySelector('[data-act="again"]').addEventListener('click', start);
    count();
  }

  const item = (side, i) => box.querySelector(`.mt__item[data-side="${side}"][data-i="${i}"]`);
  const count = () => { status.textContent = `Соединено ${found} из ${pairs.length} · ${errors} ${plural(errors, 'ошибка', 'ошибки', 'ошибок')}`; };

  function select(b) {
    if (sel) { sel.classList.remove('is-sel'); sel.setAttribute('aria-pressed', 'false'); }
    sel = b;
    if (b) { b.classList.add('is-sel'); b.setAttribute('aria-pressed', 'true'); }
  }

  function pick(b) {
    if (b.classList.contains('is-done')) return;
    if (!sel || sel === b || sel.dataset.side === b.dataset.side) { select(sel === b ? null : b); return; }
    const l = sel.dataset.side === 'l' ? sel : b, r = l === sel ? b : sel;
    select(null);
    if (l.dataset.i === r.dataset.i) {
      joined.add(l.dataset.i);
      [l, r].forEach((x) => { x.classList.add('is-done'); x.setAttribute('aria-disabled', 'true'); x.removeAttribute('aria-pressed'); });
      r.querySelector('.mt__tag').textContent = pairs[+l.dataset.i][0];
      found++;
      draw();
      if (found === pairs.length) finish();
    } else {
      errors++;
      [l, r].forEach((x) => x.classList.add('is-bad'));
      const miss = thread(l, r, true);
      setTimeout(() => { [l, r].forEach((x) => x.classList.remove('is-bad')); miss?.remove(); }, reduce.matches ? 400 : 700);
    }
    count();
  }

  // a curved thread from the right edge of a term to the left edge of its definition
  function thread(l, r, wrong) {
    if (narrow.matches) return null;
    const B = board.getBoundingClientRect(), L = l.getBoundingClientRect(), R = r.getBoundingClientRect();
    const x1 = L.right - B.left, y1 = L.top + L.height / 2 - B.top, x2 = R.left - B.left, y2 = R.top + R.height / 2 - B.top, mx = (x1 + x2) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
    path.setAttribute('class', wrong ? 'is-bad' : '');
    svg.appendChild(path);
    return path;
  }
  function draw() {
    svg.replaceChildren();
    joined.forEach((i) => thread(item('l', i), item('r', i), false));
  }

  function finish() {
    const prev = best.get();
    if (prev === null || errors < prev) best.set(errors);
    const done = box.querySelector('.mt__done');
    done.hidden = false;
    done.innerHTML = `<b>Все пары найдены!</b> ${errors ? `Ошибок: ${errors}.` : 'Без единой ошибки.'} ${prev !== null && errors < prev ? `Это лучше прежнего результата (${prev}).` : prev !== null ? `Лучший результат в этом браузере: ${prev} ${plural(prev, 'ошибка', 'ошибки', 'ошибок')}.` : ''}`;
    const again = box.querySelector('[data-act="again"]');
    again.textContent = 'Сыграть ещё раз';
    again.classList.remove('btn--light');
    again.focus({ preventScroll: true });
  }

  addEventListener('resize', () => { if (board) draw(); });
  narrow.addEventListener('change', () => { if (board) draw(); });
  start();
})();

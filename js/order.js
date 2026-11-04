// «Расставь по порядку» on games/<id>.html: the steps come shuffled in a numbered list.
// Two rows swap places, the rest stay put: drag a row onto another (mouse or pen), or tap one row
// and then another (the way on a phone), or move a row by one with the ↑ ↓ buttons.
// «Проверить» marks the rows already in place with a gold number and the rest in rose, and counts the attempt.
// Steps come from #cw-data (written by tools/build.mjs); the fewest attempts are kept in this browser only.
(() => {
  const box = document.querySelector('.od');
  const dataEl = document.getElementById('cw-data');
  if (!box || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  let steps = [];
  try { steps = JSON.parse(decodeURIComponent(escape(atob(data.s)))); } catch { return; }
  const key = 'od:' + data.id;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const best = {
    get() { try { const v = localStorage.getItem(key); return v === null ? null : Number(v); } catch { return null; } },
    set(v) { try { localStorage.setItem(key, String(v)); } catch { /* private mode */ } },
  };
  const task = box.querySelector('.od__task');

  let list, status, attempts, solved, sel = null, dragged = false, said = '';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function start() {
    attempts = 0; solved = false; sel = null; said = '';
    box.classList.remove('is-solved');
    let order = shuffle(steps.map((_, i) => i));
    // never start already solved
    while (order.every((v, i) => v === i)) order = shuffle(order);
    box.innerHTML = '';
    if (task) box.appendChild(task);
    box.insertAdjacentHTML('beforeend', `
      <ol class="od__list">${order.map((k) => `<li class="od__row" data-k="${k}" tabindex="0"><span class="od__n"></span><span class="od__grip" aria-hidden="true">⋮⋮</span><span class="od__text">${esc(steps[k])}</span><span class="od__arr"><button type="button" data-d="-1" aria-label="Поднять выше">↑</button><button type="button" data-d="1" aria-label="Опустить ниже">↓</button></span></li>`).join('')}</ol>
      <p class="od__done" hidden></p>
      <div class="od__bar"><span class="od__status" role="status"></span><button class="btn" type="button" data-act="check">Проверить</button></div>`);
    list = box.querySelector('.od__list');
    status = box.querySelector('.od__status');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]');
      if (b) { move(b.closest('.od__row'), +b.dataset.d, b.dataset.d); return; }
      const li = e.target.closest('.od__row');
      // the click that ends a drag is not a tap
      if (dragged) { dragged = false; return; }
      if (li) tap(li);
    });
    list.addEventListener('keydown', (e) => {
      const li = e.target.closest('.od__row');
      if (li && e.target === li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(li); }
      if (e.key === 'Escape' && sel) pick(null);
    });
    list.addEventListener('pointerdown', drag);
    box.querySelector('[data-act="check"]').addEventListener('click', check);
    renumber();
  }

  const rows = () => [...list.children];
  function renumber() {
    rows().forEach((li, i) => {
      li.querySelector('.od__n').textContent = i + 1;
      li.querySelector('[data-d="-1"]').disabled = i === 0;
      li.querySelector('[data-d="1"]').disabled = i === steps.length - 1;
    });
  }
  // any change wipes the marks of the last check
  const clearMarks = () => rows().forEach((li) => li.classList.remove('is-ok', 'is-no'));

  // the status line hints what to do while a row is picked, and gets its old text back after
  const say = (text) => { status.textContent = text; };
  function pick(li) {
    if (sel) sel.classList.remove('is-sel');
    sel = li;
    list.classList.toggle('is-picking', !!li);
    if (li) {
      li.classList.add('is-sel');
      said = status.textContent;
      say(`Шаг ${rows().indexOf(li) + 1} выбран — нажмите строку, с которой его поменять`);
    } else say(said);
  }

  // two rows exchange places and nothing else moves; both glide to their new spots
  function swap(a, b) {
    if (solved || a === b) { pick(null); return; }
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const mark = document.createElement('li');
    list.replaceChild(mark, a);
    list.replaceChild(a, b);
    list.replaceChild(b, mark);
    pick(null);
    clearMarks(); renumber();
    if (reduce) return;
    [[a, ra], [b, rb]].forEach(([li, was]) => {
      const now = li.getBoundingClientRect();
      li.animate([{ transform: `translateY(${was.top - now.top}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22,1,0.36,1)' });
    });
  }

  function tap(li) {
    if (solved) return;
    if (!sel) pick(li);
    else if (sel === li) pick(null);
    else swap(sel, li);
  }

  function move(li, d, focusDir) {
    if (solved) return;
    const sib = d < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    swap(li, sib);
    const keep = li.querySelector(`[data-d="${focusDir}"]`);
    (keep && !keep.disabled ? keep : li.querySelector('button:not(:disabled)'))?.focus();
  }

  // dragging with a mouse or pen: the row follows the pointer, the row under it is marked,
  // and on release the two swap. On touch screens rows are swapped by tapping, so the page still scrolls
  function drag(e) {
    dragged = false;
    const li = e.target.closest('.od__row');
    if (solved || !li || e.target.closest('button') || e.pointerType === 'touch' || e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    // captured from the press on, so the release reaches this row even if the pointer is far away by then
    try { li.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const y0 = e.clientY, x0 = e.clientX;
    let on = false, over = null;
    const under = (ev) => {
      li.style.visibility = 'hidden';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      li.style.visibility = '';
      const row = el && el.closest('.od__row');
      return row && row.parentElement === list && row !== li ? row : null;
    };
    const onMove = (ev) => {
      if (!on) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        on = true; dragged = true;
        pick(null);
        li.classList.add('is-lift');
      }
      li.style.transform = `translateY(${ev.clientY - y0}px)`;
      const t = under(ev);
      if (t !== over) { over?.classList.remove('is-target'); over = t; over?.classList.add('is-target'); }
    };
    const end = (ev) => {
      li.removeEventListener('pointermove', onMove);
      li.removeEventListener('pointerup', end);
      li.removeEventListener('pointercancel', end);
      li.removeEventListener('lostpointercapture', end);
      if (!on) {
        // a quick flick can reach the other row without any move event in between
        const t = ev.type === 'pointerup' && Math.hypot(ev.clientX - x0, ev.clientY - y0) >= 6 && under(ev);
        if (t) { dragged = true; swap(li, t); }
        return;
      }
      on = false;
      over?.classList.remove('is-target');
      li.classList.remove('is-lift');
      li.style.transform = '';
      if (ev.type === 'pointerup' && over) swap(li, over);
    };
    li.addEventListener('pointermove', onMove);
    li.addEventListener('pointerup', end);
    li.addEventListener('pointercancel', end);
    li.addEventListener('lostpointercapture', end);
  }

  function check() {
    if (solved) { start(); return; }
    if (sel) pick(null);
    attempts++;
    let ok = 0;
    rows().forEach((li, i) => {
      const right = +li.dataset.k === i;
      if (right) ok++;
      li.classList.toggle('is-ok', right);
      li.classList.toggle('is-no', !right);
    });
    status.textContent = `На своём месте ${ok} из ${steps.length} · ${attempts} ${plural(attempts, 'попытка', 'попытки', 'попыток')}`;
    if (ok === steps.length) finish();
  }

  function finish() {
    solved = true;
    box.classList.add('is-solved');
    rows().forEach((li) => li.querySelectorAll('button').forEach((b) => { b.disabled = true; }));
    const prev = best.get();
    if (prev === null || attempts < prev) best.set(attempts);
    const done = box.querySelector('.od__done');
    done.hidden = false;
    done.innerHTML = `<b>Порядок верный!</b> ${attempts === 1 ? 'С первой попытки.' : `Попыток: ${attempts}.`} ${prev !== null && attempts < prev ? `Это лучше прежнего результата (${prev}).` : prev !== null ? `Лучший результат в этом браузере: ${prev} ${plural(prev, 'попытка', 'попытки', 'попыток')}.` : ''}${data.why ? `<span class="od__why">${esc(data.why)}</span>` : ''}`;
    const btn = box.querySelector('[data-act="check"]');
    btn.textContent = 'Сыграть ещё раз';
    btn.focus({ preventScroll: true });
  }

  start();
})();

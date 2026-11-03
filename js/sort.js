// «Разложи по корзинам» on games/<id>.html: shuffled cards lie in a pile above the bins.
// A card goes into a bin by dragging it (mouse or pen), or by tapping the card and then the bin;
// a card already in a bin can be moved again the same way, the pile included. «Проверить» marks
// the cards that sit in the right bin in gold and the rest in rose, and counts the attempt.
// Bins come from #cw-data (written by tools/build.mjs); the fewest attempts are kept in this browser only.
(() => {
  const box = document.querySelector('.sb');
  const dataEl = document.getElementById('cw-data');
  if (!box || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  let bins = [];
  try { bins = JSON.parse(decodeURIComponent(escape(atob(data.b)))); } catch { return; }
  const cards = bins.flatMap(([, items], b) => items.map((text) => ({ text, b })));
  const key = 'sb:' + data.id;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const best = {
    get() { try { const v = localStorage.getItem(key); return v === null ? null : Number(v); } catch { return null; } },
    set(v) { try { localStorage.setItem(key, String(v)); } catch { /* private mode */ } },
  };
  const task = box.querySelector('.sb__task');

  let pile, status, sel, attempts, solved, dragged = false;

  function start() {
    attempts = 0; solved = false; sel = null;
    box.classList.remove('is-solved', 'is-picking');
    box.innerHTML = '';
    if (task) box.appendChild(task);
    box.insertAdjacentHTML('beforeend', `
      <div class="sb__pile" data-to="-1" aria-label="Стопка карточек">${shuffle(cards.map((_, i) => i)).map((k) => `<button class="sb__card" type="button" data-k="${k}">${esc(cards[k].text)}</button>`).join('')}</div>
      <div class="sb__bins">${bins.map(([name], b) => `<section class="sb__bin" data-to="${b}"><button class="sb__head" type="button" aria-label="Положить в «${esc(name)}»">${esc(name)}<span class="sb__count"></span></button><div class="sb__in"></div></section>`).join('')}</div>
      <p class="sb__done" hidden></p>
      <div class="sb__bar"><span class="sb__status" role="status"></span><button class="btn" type="button" data-act="check">Проверить</button></div>`);
    pile = box.querySelector('.sb__pile');
    status = box.querySelector('.sb__status');
    box.querySelectorAll('.sb__card').forEach((c) => c.addEventListener('pointerdown', drag));
    box.querySelector('[data-act="check"]').addEventListener('click', check);
    update();
  }

  const placed = () => [...box.querySelectorAll('.sb__in .sb__card')];
  function update() {
    box.querySelectorAll('.sb__bin').forEach((bin) => {
      const n = bin.querySelectorAll('.sb__card').length;
      bin.querySelector('.sb__count').textContent = n ? ` · ${n}` : '';
    });
    pile.classList.toggle('is-empty', !pile.children.length);
    if (!solved) status.textContent = `Разложено ${placed().length} из ${cards.length}`;
  }

  function pick(card) {
    if (sel) sel.classList.remove('is-sel');
    sel = card && card !== sel ? card : null;
    if (sel) sel.classList.add('is-sel');
    box.classList.toggle('is-picking', !!sel);
  }

  // the card goes to the end of the bin (or back to the pile); its old mark is wiped
  function put(card, to) {
    const dest = to < 0 ? pile : box.querySelector(`.sb__bin[data-to="${to}"] .sb__in`);
    if (!dest || card.parentElement === dest) { pick(null); return; }
    card.classList.remove('is-ok', 'is-no', 'is-drop');
    dest.appendChild(card);
    void card.offsetWidth;
    card.classList.add('is-drop');
    pick(null);
    update();
  }

  box.addEventListener('click', (e) => {
    if (solved) return;
    const card = e.target.closest('.sb__card');
    if (card) {
      // the click that ends a drag is not a tap
      if (dragged) { dragged = false; return; }
      // tapping a card in another place while one is picked: the picked card goes there
      if (sel && sel !== card && card.parentElement !== sel.parentElement) {
        put(sel, +card.closest('[data-to]').dataset.to);
        return;
      }
      pick(card);
      return;
    }
    const to = e.target.closest('[data-to]');
    if (sel && to) put(sel, +to.dataset.to);
  });

  // dragging with a mouse or pen: the card follows the pointer and drops into whatever lies under it;
  // on touch screens the tap-tap way is used, so cards never get in the way of scrolling
  function drag(e) {
    dragged = false;
    if (solved || e.pointerType === 'touch' || e.button !== 0) return;
    const card = e.currentTarget;
    const x0 = e.clientX, y0 = e.clientY;
    let on = false, over = null;
    const target = (ev) => {
      card.style.visibility = 'hidden';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      card.style.visibility = '';
      return el && el.closest('.sb [data-to]');
    };
    const onMove = (ev) => {
      if (!on) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        on = true; dragged = true;
        card.setPointerCapture(e.pointerId);
        card.classList.add('is-lift');
        pick(null);
      }
      card.style.transform = `translate(${ev.clientX - x0}px,${ev.clientY - y0}px) rotate(-2deg)`;
      const t = target(ev);
      if (t !== over) { over?.classList.remove('is-over'); over = t; over?.classList.add('is-over'); }
    };
    const onUp = (ev) => {
      card.removeEventListener('pointermove', onMove);
      card.removeEventListener('pointerup', onUp);
      card.removeEventListener('pointercancel', onUp);
      if (!on) return;
      over?.classList.remove('is-over');
      card.classList.remove('is-lift');
      card.style.transform = '';
      const t = ev.type === 'pointerup' && target(ev);
      if (t) put(card, +t.dataset.to);
    };
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerup', onUp);
    card.addEventListener('pointercancel', onUp);
  }

  function check() {
    if (solved) { start(); return; }
    pick(null);
    if (pile.children.length) {
      status.textContent = `Сначала разложите все карточки: в стопке ещё ${pile.children.length}`;
      pile.classList.remove('is-nudge'); void pile.offsetWidth; pile.classList.add('is-nudge');
      return;
    }
    attempts++;
    let ok = 0;
    placed().forEach((c) => {
      const right = cards[+c.dataset.k].b === +c.closest('[data-to]').dataset.to;
      if (right) ok++;
      c.classList.remove('is-drop');
      c.classList.toggle('is-ok', right);
      c.classList.toggle('is-no', !right);
    });
    status.textContent = `Верно ${ok} из ${cards.length} · ${attempts} ${plural(attempts, 'попытка', 'попытки', 'попыток')}`;
    if (ok === cards.length) finish();
  }

  function finish() {
    solved = true;
    box.classList.add('is-solved');
    const prev = best.get();
    if (prev === null || attempts < prev) best.set(attempts);
    const done = box.querySelector('.sb__done');
    done.hidden = false;
    done.innerHTML = `<b>Всё разложено верно!</b> ${attempts === 1 ? 'С первой попытки.' : `Попыток: ${attempts}.`} ${prev !== null && attempts < prev ? `Это лучше прежнего результата (${prev}).` : prev !== null ? `Лучший результат в этом браузере: ${prev} ${plural(prev, 'попытка', 'попытки', 'попыток')}.` : ''}${data.why ? `<span class="sb__why">${esc(data.why)}</span>` : ''}`;
    const btn = box.querySelector('[data-act="check"]');
    btn.textContent = 'Сыграть ещё раз';
    btn.focus({ preventScroll: true });
  }

  start();
})();

// «Расставь по порядку» on games/<id>.html: the steps come shuffled in a numbered list.
// A row moves by dragging its grip (mouse or finger) or with the ↑ ↓ buttons; «Проверить» marks
// the rows already in place with a gold number and the rest in rose, and counts the attempt.
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

  let list, status, attempts, solved;

  function start() {
    attempts = 0; solved = false;
    box.classList.remove('is-solved');
    let order = shuffle(steps.map((_, i) => i));
    // never start already solved
    while (order.every((v, i) => v === i)) order = shuffle(order);
    box.innerHTML = '';
    if (task) box.appendChild(task);
    box.insertAdjacentHTML('beforeend', `
      <ol class="od__list">${order.map((k) => `<li class="od__row" data-k="${k}"><span class="od__n"></span><span class="od__grip" aria-hidden="true">⋮⋮</span><span class="od__text">${esc(steps[k])}</span><span class="od__arr"><button type="button" data-d="-1" aria-label="Поднять выше">↑</button><button type="button" data-d="1" aria-label="Опустить ниже">↓</button></span></li>`).join('')}</ol>
      <p class="od__done" hidden></p>
      <div class="od__bar"><span class="od__status" role="status"></span><button class="btn" type="button" data-act="check">Проверить</button></div>`);
    list = box.querySelector('.od__list');
    status = box.querySelector('.od__status');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-d]');
      if (b) move(b.closest('.od__row'), +b.dataset.d, b.dataset.d);
    });
    list.querySelectorAll('.od__grip').forEach((g) => g.addEventListener('pointerdown', drag));
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

  function move(li, d, focusDir) {
    if (solved) return;
    const sib = d < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!sib) return;
    if (d < 0) list.insertBefore(li, sib); else list.insertBefore(sib, li);
    clearMarks(); renumber();
    const keep = li.querySelector(`[data-d="${focusDir}"]`);
    (keep && !keep.disabled ? keep : li.querySelector('button:not(:disabled)'))?.focus();
  }

  // dragging by the grip: the row follows the pointer and swaps places with its neighbours
  function drag(e) {
    if (solved) return;
    const li = e.currentTarget.closest('.od__row');
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    let lastY = e.clientY;
    li.classList.add('is-lift');
    clearMarks();
    const onMove = (ev) => {
      li.style.transform = `translateY(${ev.clientY - lastY}px)`;
      const prev = li.previousElementSibling, next = li.nextElementSibling;
      const r = li.getBoundingClientRect(), mid = r.top + r.height / 2;
      if (prev && mid < prev.getBoundingClientRect().top + prev.offsetHeight / 2) {
        list.insertBefore(li, prev); lastY -= prev.offsetHeight + 8; li.style.transform = `translateY(${ev.clientY - lastY}px)`; renumber();
      } else if (next && mid > next.getBoundingClientRect().top + next.offsetHeight / 2) {
        list.insertBefore(next, li); lastY += next.offsetHeight + 8; li.style.transform = `translateY(${ev.clientY - lastY}px)`; renumber();
      }
    };
    const onUp = () => {
      li.classList.remove('is-lift');
      li.style.transform = '';
      e.target.removeEventListener('pointermove', onMove);
      e.target.removeEventListener('pointerup', onUp);
      e.target.removeEventListener('pointercancel', onUp);
    };
    e.target.addEventListener('pointermove', onMove);
    e.target.addEventListener('pointerup', onUp);
    e.target.addEventListener('pointercancel', onUp);
  }

  function check() {
    if (solved) { start(); return; }
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

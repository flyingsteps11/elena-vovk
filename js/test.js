// A test by discipline on tests/<id>.html, done like a computer exam: one question per screen,
// a navigator of numbered squares (answered — dark, skipped — rose), a countdown when the test
// has a time limit, and at the end the grade, the review of every question and a result sheet to print.
// Each attempt draws its own questions from the bank and shuffles the options. The attempt in progress
// is kept in this browser, so reloading the page neither loses the answers nor restarts the clock.
// Questions come from #cw-data (written by tools/build.mjs).
(() => {
  const box = document.querySelector('.ts');
  const dataEl = document.getElementById('cw-data');
  if (!box || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  let bank = [];
  try { bank = JSON.parse(decodeURIComponent(escape(atob(data.q)))); } catch { return; }
  const N = Math.min(bank.length, data.n || bank.length);
  const MIN = data.min || 0;
  const [G5, G4, G3] = data.g || [90, 75, 60];
  const key = 'ts:' + data.id, runKey = key + ':run', whoKey = 'ts:who';
  const LETTERS = 'АБВГДЕЖЗИК';
  const GRADE = { 5: 'отлично', 4: 'хорошо', 3: 'удовлетворительно', 2: 'неудовлетворительно' };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
  };
  const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // typed answers are compared without case, spaces, ё, a trailing % or «руб.»; a comma counts as a point
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[\s ]+/g, '').replace(/,/g, '.')
    .replace(/(%|руб\.?|р\.?)$/, '').replace(/\.$/, '');
  const gradeOf = (pct) => (pct >= G5 ? 5 : pct >= G4 ? 4 : pct >= G3 ? 3 : 2);

  let run = null, tick = 0;
  const save = () => store.set(runKey, run);
  const answered = (i) => {
    const a = run.ans[i];
    return Array.isArray(a) ? a.length > 0 : typeof a === 'string' ? a.trim() !== '' : false;
  };

  // ── the first screen: what the test is, the grading, the name for the result sheet ──
  function intro() {
    clearInterval(tick);
    const saved = store.get(runKey);
    const valid = saved && saved.order && saved.order.length === N && saved.order.every((qi) => bank[qi]);
    // the time ran out while the page was closed: the attempt is graded as it stands
    if (valid && saved.deadline && saved.deadline <= Date.now()) { run = saved; finish(true); return; }
    const live = valid;
    const best = store.get(key);
    const who = store.get(whoKey) || {};
    box.innerHTML = `
      <div class="ts__intro">
        <dl class="ts__facts">
          <div><dt>Вопросов</dt><dd class="num">${N}${bank.length > N ? `<small> из ${bank.length}</small>` : ''}</dd></div>
          <div><dt>Время</dt><dd class="num">${MIN ? `${MIN}<small> ${plural(MIN, 'минута', 'минуты', 'минут')}</small>` : '<small>без ограничения</small>'}</dd></div>
          <div><dt>Оценка</dt><dd class="ts__scale"><span><b>5</b> от ${G5} %</span><span><b>4</b> от ${G4} %</span><span><b>3</b> от ${G3} %</span></dd></div>
        </dl>
        <ul class="ts__rules">
          <li>Вопросы идут по одному. Любой можно пропустить и вернуться к нему по номеру в навигаторе.</li>
          <li>${MIN ? 'Когда время выйдет, тест завершится сам и будет оценён по данным ответам.' : 'Время не ограничено, но засекается.'}</li>
          <li>В конце — оценка, разбор каждого вопроса и бланк результата, который можно распечатать или сохранить в PDF.</li>
        </ul>
        <div class="ts__who">
          <label>Фамилия и имя<input id="ts-name" type="text" autocomplete="name" maxlength="80" value="${esc(who.name || '')}"></label>
          <label>Группа<input id="ts-group" type="text" maxlength="20" value="${esc(who.group || '')}"></label>
          <p class="ts__note">Нужны только для бланка результата. Никуда не отправляются.</p>
        </div>
        ${best ? `<p class="ts__best">Лучший результат в этом браузере: <b>${best.grade}</b> (${best.pct} %)</p>` : ''}
        <div class="ts__bar">${live ? '<button class="btn" type="button" data-act="resume">Продолжить начатый тест</button><button class="btn btn--light" type="button" data-act="start">Начать заново</button>' : '<button class="btn" type="button" data-act="start">Начать тест</button>'}</div>
      </div>`;
    box.querySelector('[data-act="start"]').addEventListener('click', () => { begin(); });
    box.querySelector('[data-act="resume"]')?.addEventListener('click', () => { run = saved; remember(); exam(); });
  }
  function remember() {
    const name = box.querySelector('#ts-name').value.trim(), group = box.querySelector('#ts-group').value.trim();
    store.set(whoKey, { name, group });
    if (run) { run.who = { name, group }; save(); }
  }

  function begin() {
    const order = shuffle(bank.map((_, i) => i)).slice(0, N);
    run = {
      order,
      perm: order.map((qi) => shuffle(bank[qi].o.map((_, k) => k))),
      ans: {}, seen: [0], cur: 0,
      start: Date.now(), deadline: MIN ? Date.now() + MIN * 60000 : 0,
      who: {},
    };
    remember();
    exam();
  }

  // ── the exam: navigator and clock on top, one question, the moves below ──
  function exam() {
    box.innerHTML = `
      <div class="ts__top">
        <ol class="ts__nav" aria-label="Вопросы">${run.order.map((_, i) => `<li><button type="button" data-go="${i}" aria-label="Вопрос ${i + 1}">${i + 1}</button></li>`).join('')}</ol>
        <p class="ts__time num"${MIN ? ' role="timer"' : ''}><span class="sr-only">${MIN ? 'Осталось времени' : 'Прошло времени'} </span><b></b></p>
      </div>
      <div class="ts__card"></div>
      <div class="ts__confirm" hidden></div>
      <div class="ts__bar">
        <span class="ts__moves"><button class="btn btn--light" type="button" data-act="prev">← Назад</button><button class="btn btn--light" type="button" data-act="next"></button></span>
        <button class="btn" type="button" data-act="finish">Завершить тест</button>
      </div>
      <p class="sr-only" role="status" id="ts-sr"></p>`;
    box.querySelector('.ts__nav').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
    box.querySelector('[data-act="prev"]').addEventListener('click', () => go(run.cur - 1));
    box.querySelector('[data-act="next"]').addEventListener('click', next);
    box.querySelector('[data-act="finish"]').addEventListener('click', askFinish);
    clearInterval(tick);
    tick = setInterval(time, 1000);
    time();
    if (!run) return; // the time ran out while the page was closed
    show();
    box.closest('article').scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  function time() {
    const el = box.querySelector('.ts__time');
    if (!el || !run) return;
    if (!MIN) { el.lastElementChild.textContent = clock(Date.now() - run.start); return; }
    const left = run.deadline - Date.now();
    el.lastElementChild.textContent = clock(left);
    el.classList.toggle('is-low', left <= 60000);
    const s = Math.round(left / 1000);
    if (s === 300 || s === 60) box.querySelector('#ts-sr').textContent = `Осталось ${s / 60} ${plural(s / 60, 'минута', 'минуты', 'минут')}`;
    if (left <= 0) finish(true);
  }

  function marks() {
    box.querySelectorAll('.ts__nav button').forEach((b, i) => {
      b.classList.toggle('is-done', answered(i));
      b.classList.toggle('is-skip', !answered(i) && run.seen.includes(i) && i !== run.cur);
      b.classList.toggle('is-cur', i === run.cur);
      if (i === run.cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    // on the phone the navigator is one scrolling strip: keep the current square in sight
    const nav = box.querySelector('.ts__nav'), cur = nav.children[run.cur];
    if (nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.offsetLeft - nav.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2;
    box.querySelector('[data-act="next"]').textContent = answered(run.cur) ? 'Далее →' : 'Пропустить →';
    box.querySelector('[data-act="prev"]').disabled = run.cur === 0;
  }

  function show() {
    const i = run.cur, q = bank[run.order[i]];
    const card = box.querySelector('.ts__card');
    const hint = { one: 'Выберите один ответ', many: 'Выберите все верные ответы', text: 'Введите ответ' }[q.t];
    let body;
    if (q.t === 'text') {
      body = `<label class="ts__field"><span class="sr-only">Ваш ответ</span><input class="ts__input" type="text" autocomplete="off" spellcheck="false" maxlength="120" value="${esc(run.ans[i] || '')}" placeholder="Ответ"></label>`;
    } else {
      const chosen = run.ans[i] || [];
      body = `<ul class="ts__opts" role="${q.t === 'one' ? 'radiogroup' : 'group'}" aria-label="${hint}">${run.perm[i].map((k, j) => `<li><button class="ts__opt ts__opt--${q.t}" type="button" role="${q.t === 'one' ? 'radio' : 'checkbox'}" aria-checked="${chosen.includes(k)}" data-k="${k}"><span class="ts__mark" aria-hidden="true">${q.t === 'one' ? LETTERS[j] : ''}</span><span>${esc(q.o[k][0])}</span></button></li>`).join('')}</ul>`;
    }
    card.innerHTML = `<p class="ts__no">Вопрос <b class="num">${i + 1}</b> из ${N} · <span>${hint}</span></p><h2 class="ts__q">${esc(q.q)}</h2>${body}`;
    if (q.t === 'text') {
      const input = card.querySelector('input');
      input.addEventListener('input', () => { run.ans[i] = input.value; save(); marks(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    } else {
      card.querySelector('.ts__opts').addEventListener('click', (e) => {
        const b = e.target.closest('.ts__opt');
        if (!b) return;
        const k = +b.dataset.k;
        let a = run.ans[i] || [];
        a = q.t === 'one' ? [k] : a.includes(k) ? a.filter((x) => x !== k) : [...a, k];
        run.ans[i] = a;
        card.querySelectorAll('.ts__opt').forEach((o) => o.setAttribute('aria-checked', String(a.includes(+o.dataset.k))));
        save(); marks();
      });
    }
    box.querySelector('.ts__confirm').hidden = true;
    marks();
  }

  function go(i) {
    if (i < 0 || i >= N) return;
    run.cur = i;
    if (!run.seen.includes(i)) run.seen.push(i);
    save(); show();
    box.querySelector('.ts__card input, .ts__card .ts__opt')?.focus({ preventScroll: true });
  }
  // «Далее» goes on to the next question still without an answer; when none is left, it offers to finish
  function next() {
    for (let s = 1; s < N; s++) {
      const i = (run.cur + s) % N;
      if (!answered(i)) { go(i); return; }
    }
    askFinish();
  }

  function askFinish() {
    const left = run.order.filter((_, i) => !answered(i)).length;
    const c = box.querySelector('.ts__confirm');
    c.hidden = false;
    c.innerHTML = left
      ? `<p>Без ответа ${left === 1 ? 'остался' : 'осталось'} ${left} ${plural(left, 'вопрос', 'вопроса', 'вопросов')}. Они будут засчитаны как неверные.</p><span><button class="btn btn--light" type="button" data-act="back">Вернуться к вопросам</button><button class="btn" type="button" data-act="end">Завершить</button></span>`
      : `<p>На все вопросы есть ответы. Сдать тест? Изменить ответы после этого будет нельзя.</p><span><button class="btn btn--light" type="button" data-act="back">Проверить ещё раз</button><button class="btn" type="button" data-act="end">Сдать тест</button></span>`;
    c.querySelector('[data-act="back"]').addEventListener('click', () => {
      c.hidden = true;
      const i = run.order.findIndex((_, j) => !answered(j));
      go(i < 0 ? 0 : i);
    });
    c.querySelector('[data-act="end"]').addEventListener('click', () => finish(false));
    c.querySelector('[data-act="end"]').focus();
  }

  // ── the result: the grade, the sheet with the name, and the review of every question ──
  function finish(timeUp) {
    clearInterval(tick);
    const end = run.deadline ? Math.min(Date.now(), run.deadline) : Date.now();
    const rows = run.order.map((qi, i) => {
      const q = bank[qi], a = run.ans[i];
      let ok = false, yours = '', right = '';
      if (q.t === 'text') {
        ok = typeof a === 'string' && q.a.some((x) => norm(x) === norm(a));
        yours = (a || '').trim(); right = q.a[0];
      } else {
        const want = q.o.map((o, k) => (o[1] ? k : -1)).filter((k) => k >= 0);
        const got = Array.isArray(a) ? a : [];
        ok = got.length === want.length && want.every((k) => got.includes(k));
        yours = got.map((k) => q.o[k][0]).join('; '); right = want.map((k) => q.o[k][0]).join('; ');
      }
      return { q, ok, yours, right };
    });
    const good = rows.filter((r) => r.ok).length;
    const pct = Math.round((good / N) * 100);
    const grade = gradeOf(pct);
    const prev = store.get(key);
    if (!prev || pct > prev.pct) store.set(key, { grade, pct });
    store.del(runKey);
    const who = run.who || {};
    const date = new Date(end).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    box.innerHTML = `
      <section class="ts__sheet" aria-labelledby="ts-res">
        <div class="ts__grade ts__grade--${grade}"><span class="num">${grade}</span><small>${GRADE[grade]}</small></div>
        <div class="ts__sum">
          <h2 id="ts-res">${timeUp ? 'Время вышло — тест завершён' : 'Тест завершён'}</h2>
          <p class="ts__score num">Верно ${good} из ${N} · ${pct} %</p>
          <dl class="ts__meta">
            <div><dt>Студент</dt><dd>${esc(who.name || '—')}</dd></div>
            <div><dt>Группа</dt><dd>${esc(who.group || '—')}</dd></div>
            <div><dt>Тест</dt><dd>${esc(data.title)}</dd></div>
            ${data.disc ? `<div class="ts__wide"><dt>Дисциплина</dt><dd>${esc(data.disc)}</dd></div>` : ''}
            <div><dt>Дата</dt><dd>${esc(date)}</dd></div>
            <div><dt>Затрачено</dt><dd class="num">${clock(end - run.start)}${MIN ? ` из ${MIN}:00` : ''}</dd></div>
          </dl>
          ${prev && pct > prev.pct ? `<p class="ts__best">Это лучше прежнего результата (${prev.grade}, ${prev.pct} %).</p>` : prev ? `<p class="ts__best">Лучший результат в этом браузере: ${prev.grade} (${prev.pct} %).</p>` : ''}
        </div>
      </section>
      <h3 class="ts__rh">Разбор ответов</h3>
      <ol class="ts__review">${rows.map((r, i) => `
        <li class="${r.ok ? 'is-ok' : 'is-no'}"><span class="ts__rn num" aria-label="${r.ok ? 'верно' : 'неверно'}">${i + 1}</span><div>
          <p class="ts__rq">${esc(r.q.q)}</p>
          <p><span class="ts__rl">Ваш ответ:</span> ${r.yours ? esc(r.yours) : '<i>нет ответа</i>'}</p>
          ${r.ok ? '' : `<p><span class="ts__rl">Верно:</span> ${esc(r.right)}</p>`}
          ${r.q.e ? `<p class="ts__re">${esc(r.q.e)}</p>` : ''}
        </div></li>`).join('')}
      </ol>
      <div class="ts__bar ts__noprint"><button class="btn btn--light" type="button" data-act="print">Распечатать или сохранить PDF</button><button class="btn" type="button" data-act="again">Пройти заново</button></div>`;
    box.querySelector('[data-act="print"]').addEventListener('click', () => window.print());
    box.querySelector('[data-act="again"]').addEventListener('click', intro);
    run = null;
    box.closest('article').scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  intro();
})();

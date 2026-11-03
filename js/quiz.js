// Quiz on games/<id>.html in the exam-ticket look: one question at a time, answers А–Г,
// checked at once with the explanation, a strip of results above, the total at the end.
// Questions come from #cw-data (written by tools/build.mjs); the right answers are lightly encoded.
// The best result is kept in this browser only (localStorage).
(() => {
  const box = document.querySelector('.qz');
  const dataEl = document.getElementById('cw-data');
  if (!box || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const decode = (s) => { try { return JSON.parse(atob(s)); } catch { return []; } };
  const all = data.questions.map((q) => ({ ...q, right: decode(q.a) }));
  const LETTERS = 'АБВГДЕЖЗ';
  const key = 'qz:' + data.id;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const best = {
    get() { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } },
    set(v) { try { localStorage.setItem(key, String(v)); } catch { /* private mode */ } },
  };

  let qs, k, marks, picked, done;

  function start() {
    qs = (data.shuffle ? shuffle(all) : all).map((q) => {
      // the answers are shuffled too; a question keeps knowing which of them are right
      const order = data.shuffle ? shuffle(q.opts.map((_, i) => i)) : q.opts.map((_, i) => i);
      return { ...q, order };
    });
    k = 0; marks = []; done = false;
    show();
  }

  const tick = () => `<div class="qz__tick" aria-hidden="true">${qs.map((_, i) => `<i class="${marks[i] === true ? 'ok' : marks[i] === false ? 'no' : i === k && !done ? 'cur' : ''}"></i>`).join('')}</div>`;
  const score = () => {
    const n = marks.filter((m) => m === true).length, m = marks.filter((x) => x !== undefined).length;
    return m ? `Верно ${n} из ${m}` : '';
  };

  function show() {
    const q = qs[k];
    const multi = q.right.length > 1;
    picked = new Set();
    box.innerHTML = `${tick()}
      <p class="qz__no">Вопрос ${k + 1} из ${qs.length}${multi ? ' · несколько верных ответов' : ''}</p>
      <h2 class="qz__q" tabindex="-1">${esc(q.q)}</h2>
      ${q.img ? `<img class="qz__img" src="${esc(q.img)}" alt="">` : ''}
      <ol class="qz__opts">${q.order.map((o, i) => `<li><button class="qz__opt" type="button" data-o="${o}"${multi ? ' aria-pressed="false"' : ''}><b>${LETTERS[i] || i + 1}</b><span>${esc(q.opts[o])}</span><em></em></button></li>`).join('')}</ol>
      <div class="qz__after" aria-live="polite"></div>
      <div class="qz__bar"><span class="qz__score">${score()}</span>${multi ? '<button class="btn" type="button" data-act="answer" disabled>Ответить</button>' : ''}</div>`;
    box.querySelectorAll('.qz__opt').forEach((b) => b.addEventListener('click', () => {
      if (done) return;
      const o = +b.dataset.o;
      if (!multi) { picked = new Set([o]); answer(); return; }
      if (picked.has(o)) picked.delete(o); else picked.add(o);
      b.setAttribute('aria-pressed', String(picked.has(o)));
      box.querySelector('[data-act="answer"]').disabled = !picked.size;
    }));
    box.querySelector('[data-act="answer"]')?.addEventListener('click', answer);
    if (k) box.querySelector('.qz__q').focus({ preventScroll: true });
  }

  function answer() {
    const q = qs[k];
    done = true;
    const ok = q.right.length === picked.size && q.right.every((r) => picked.has(r));
    marks[k] = ok;
    box.querySelectorAll('.qz__opt').forEach((b) => {
      const o = +b.dataset.o;
      b.disabled = true;
      if (q.right.includes(o)) { b.classList.add('is-ok'); b.querySelector('em').textContent = 'верно'; }
      else if (picked.has(o)) { b.classList.add('is-no'); b.querySelector('em').textContent = 'ваш ответ'; }
    });
    box.querySelector('.qz__tick').outerHTML = tick();
    box.querySelector('.qz__after').innerHTML = `<p class="qz__verdict ${ok ? 'ok' : 'no'}">${ok ? 'Верно!' : 'Неверно.'}</p>${q.why ? `<p class="qz__why">${esc(q.why)}</p>` : ''}`;
    const last = k === qs.length - 1;
    const bar = box.querySelector('.qz__bar');
    bar.innerHTML = `<span class="qz__score">${score()}</span><button class="btn" type="button" data-act="next">${last ? 'Итог' : 'Дальше'} <span class="arr" aria-hidden="true">→</span></button>`;
    const next = bar.querySelector('[data-act="next"]');
    next.addEventListener('click', () => { if (last) finish(); else { k++; done = false; show(); } });
    next.focus({ preventScroll: true });
  }

  function finish() {
    const n = marks.filter(Boolean).length, total = qs.length;
    const prev = best.get();
    if (n > prev) best.set(n);
    const share = n / total;
    const verdict = share === 1 ? 'Без единой ошибки. Отлично!'
      : share >= 0.8 ? 'Очень хорошо: осталось повторить пару тем.'
        : share >= 0.5 ? 'Неплохо, но стоит повторить ошибки ниже.'
          : 'Есть над чем поработать: посмотрите разбор и попробуйте ещё раз.';
    const wrong = qs.filter((_, i) => !marks[i]);
    box.innerHTML = `${tick()}
      <div class="qz__result">
        <p class="qz__total"><b class="num">${n}</b> из ${total}</p>
        <h2 class="qz__q" tabindex="-1">${verdict}</h2>
        <p class="qz__best">${n > prev && prev ? `Новый лучший результат! Прежний: ${prev} из ${total}.` : `Лучший результат в этом браузере: ${Math.max(n, prev)} из ${total}.`}</p>
      </div>
      ${wrong.length ? `<section class="qz__review"><h3>Разбор ${wrong.length} ${plural(wrong.length, 'ошибки', 'ошибок', 'ошибок')}</h3><ol>${wrong.map((q) => `<li><p>${esc(q.q)}</p><p class="qz__right">Верно: ${q.right.map((r) => esc(q.opts[r])).join('; ')}</p>${q.why ? `<p class="qz__whysmall">${esc(q.why)}</p>` : ''}</li>`).join('')}</ol></section>` : ''}
      <div class="qz__bar"><button class="btn" type="button" data-act="again">Пройти ещё раз</button><a class="btn btn--light" href="../games.html">Все игры</a></div>`;
    box.querySelector('[data-act="again"]').addEventListener('click', start);
    box.querySelector('.qz__q').focus({ preventScroll: true });
    box.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  start();
})();

// Crossword on games/<id>.html. The grid and the clues come from the page (written by tools/build.mjs);
// the answers come from #cw-data, lightly encoded so they are not readable at a glance.
// Letters typed are kept in this browser only (localStorage), nothing is sent anywhere.
(() => {
  const root = document.querySelector('.cw');
  const dataEl = document.getElementById('cw-data');
  if (!root || !dataEl) return;
  const data = JSON.parse(dataEl.textContent);
  const norm = (s) => String(s || '').toUpperCase().replace(/Ё/g, 'Е');
  const decode = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ''; } };
  const words = data.words.map((w, i) => ({ ...w, i, answer: decode(w.a), cells: [] }));

  const cells = new Map();
  root.querySelectorAll('.cw__c').forEach((el) => {
    const input = el.querySelector('input');
    cells.set(el.dataset.x + ',' + el.dataset.y, { el, input, x: +el.dataset.x, y: +el.dataset.y, words: [] });
  });
  words.forEach((w) => {
    for (let k = 0; k < w.answer.length; k++) {
      const c = cells.get((w.x + (w.dir === 'down' ? 0 : k)) + ',' + (w.y + (w.dir === 'down' ? k : 0)));
      if (!c) continue;
      c.ch = w.answer[k];
      c.words.push(w);
      w.cells.push(c);
    }
  });

  const clueEls = [...root.querySelectorAll('.cw__clues li')];
  const progEls = [...root.querySelectorAll('.cw__prog i')];
  const statusEl = root.querySelector('.cw__status');
  const doneEl = root.querySelector('.cw__done');
  const cardNo = root.querySelector('.cw__no');
  const cardQ = root.querySelector('.cw__q');
  const clues = root.querySelector('.cw__clues');
  const narrow = matchMedia('(max-width: 760px)');
  if (clues && narrow.matches) clues.open = false;

  let cur = null, word = words[0];
  const key = 'cw:' + data.id;
  const letters = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'буква' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'буквы' : 'букв');
  const card = (w) => {
    if (!cardNo) return;
    cardNo.textContent = w.n + ' по ' + (w.dir === 'down' ? 'вертикали' : 'горизонтали') + ' · ' + w.answer.length + ' ' + letters(w.answer.length);
    cardQ.textContent = w.clue;
  };

  const save = () => { try { localStorage.setItem(key, [...cells.values()].map((c) => c.input.value || '.').join('')); } catch { /* private mode */ } };
  const load = () => {
    try {
      const s = localStorage.getItem(key);
      if (s && s.length === cells.size) [...cells.values()].forEach((c, k) => { c.input.value = s[k] === '.' ? '' : s[k]; });
    } catch { /* private mode */ }
  };

  const solved = (w) => w.cells.every((c) => norm(c.input.value) === c.ch);
  function refresh() {
    let n = 0;
    words.forEach((w) => {
      const ok = solved(w);
      if (ok) n++;
      if (clueEls[w.i]) clueEls[w.i].classList.toggle('ok', ok);
      if (progEls[w.i]) progEls[w.i].classList.toggle('ok', ok);
    });
    if (statusEl) statusEl.textContent = 'Разгадано ' + n + ' из ' + words.length;
    const all = n === words.length;
    root.classList.toggle('is-done', all);
    if (doneEl) doneEl.hidden = !all;
  }

  function select(c, w) {
    cur = c;
    word = w && c.words.includes(w) ? w : (c.words.includes(word) ? word : c.words[0]);
    cells.forEach((o) => o.el.classList.remove('hl', 'cur'));
    word.cells.forEach((o) => o.el.classList.add('hl'));
    c.el.classList.add('cur');
    clueEls.forEach((li) => li.classList.toggle('act', +li.dataset.w === word.i));
    card(word);
    if (document.activeElement !== c.input) c.input.focus({ preventScroll: narrow.matches });
  }
  const firstEmpty = (w) => w.cells.find((c) => !c.input.value) || w.cells[0];
  const step = (d) => {
    const k = word.cells.indexOf(cur) + d;
    if (k >= 0 && k < word.cells.length) select(word.cells[k], word);
  };
  const go = (d) => { const w = words[(word.i + d + words.length) % words.length]; select(firstEmpty(w), w); };

  cells.forEach((c) => {
    c.input.addEventListener('focus', () => { if (cur !== c) select(c); });
    // a second click on the same cell turns to the other word through it
    c.input.addEventListener('mousedown', () => {
      if (cur === c && c.words.length > 1) setTimeout(() => select(c, c.words.find((w) => w !== word)), 0);
    });
    c.input.addEventListener('input', () => {
      const v = norm(c.input.value).replace(/[^A-ZА-Я]/g, '');
      c.input.value = v.slice(-1);
      c.el.classList.remove('bad', 'given');
      if (c.input.value) step(1);
      save(); refresh();
    });
    c.input.addEventListener('keydown', (e) => {
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) {
        e.preventDefault();
        const [dx, dy] = arrows[e.key];
        const dir = dx ? 'across' : 'down';
        const next = cells.get((c.x + dx) + ',' + (c.y + dy));
        if (word.dir !== dir && c.words.some((w) => w.dir === dir)) select(c, c.words.find((w) => w.dir === dir));
        else if (next) select(next, next.words.find((w) => w.dir === dir));
      } else if (e.key === 'Backspace' && !c.input.value) {
        e.preventDefault();
        step(-1);
        if (cur !== c) { cur.input.value = ''; cur.el.classList.remove('bad', 'given'); save(); refresh(); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(e.shiftKey ? -1 : 1);
      }
    });
  });

  clueEls.forEach((li) => li.addEventListener('click', () => { const w = words[+li.dataset.w]; select(firstEmpty(w), w); }));
  root.querySelector('[data-act="prev"]')?.addEventListener('click', () => go(-1));
  root.querySelector('[data-act="next"]')?.addEventListener('click', () => go(1));
  root.querySelector('[data-act="check"]')?.addEventListener('click', () => {
    cells.forEach((c) => c.el.classList.toggle('bad', !!c.input.value && norm(c.input.value) !== c.ch));
    const wrong = root.querySelectorAll('.cw__c.bad').length;
    if (wrong && statusEl) statusEl.textContent = 'Ошибок: ' + wrong + '. Исправьте зачёркнутые буквы';
  });
  root.querySelector('[data-act="hint"]')?.addEventListener('click', () => {
    const c = cur && norm(cur.input.value) !== cur.ch ? cur : word.cells.find((o) => norm(o.input.value) !== o.ch);
    if (!c) return;
    c.input.value = c.ch;
    c.el.classList.remove('bad');
    c.el.classList.add('given');
    select(c, word);
    save(); refresh();
  });
  root.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
    if (!confirm('Стереть все буквы и начать заново?')) return;
    cells.forEach((c) => { c.input.value = ''; c.el.classList.remove('bad', 'given'); });
    save(); refresh();
    select(words[0].cells[0], words[0]);
  });

  load();
  refresh();
  card(words[0]);
})();

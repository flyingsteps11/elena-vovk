// Lays out a crossword from a list of { answer, clue }. Used by build.mjs; no dependencies.
// The same words and the same variant always give the same grid: the layout is tried many times
// in a seeded order and the best one is kept (all words placed first, then the smallest grid).

// letters only, upper case, Ё counts as Е
export const normWord = (s) => String(s || '').toUpperCase().replace(/Ё/g, 'Е').replace(/[^A-ZА-Я]/g, '');

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function tryLayout(words) {
  const cells = new Map();
  const placed = [];
  const key = (x, y) => x + ',' + y;
  // how many letters a word would share, or -1 when it does not fit there
  const fit = (w, x, y, down) => {
    const dx = down ? 0 : 1, dy = down ? 1 : 0;
    if (cells.has(key(x - dx, y - dy)) || cells.has(key(x + dx * w.length, y + dy * w.length))) return -1;
    let cross = 0;
    for (let i = 0; i < w.length; i++) {
      const cx = x + dx * i, cy = y + dy * i, c = cells.get(key(cx, cy));
      if (c) { if (c.ch !== w[i] || c[down ? 'down' : 'across']) return -1; cross++; continue; }
      if (cells.has(key(cx + dy, cy + dx)) || cells.has(key(cx - dy, cy - dx))) return -1;
    }
    return cross;
  };
  const put = (wd, x, y, down) => {
    for (let i = 0; i < wd.w.length; i++) {
      const k = key(x + (down ? 0 : i), y + (down ? i : 0));
      const c = cells.get(k) || { ch: wd.w[i] };
      c[down ? 'down' : 'across'] = true;
      cells.set(k, c);
    }
    placed.push({ ...wd, x, y, down });
  };
  const [first, ...rest] = words;
  put(first, 0, 0, false);
  let queue = rest;
  // words that found no crossing yet get another chance once more words are on the grid
  for (let pass = 0; pass < 3 && queue.length; pass++) {
    const left = [];
    for (const wd of queue) {
      let best = null;
      for (const p of placed) {
        for (let i = 0; i < p.w.length; i++) {
          for (let j = 0; j < wd.w.length; j++) {
            if (p.w[i] !== wd.w[j]) continue;
            const down = !p.down;
            const x = p.down ? p.x - j : p.x + i, y = p.down ? p.y + i : p.y - j;
            const s = fit(wd.w, x, y, down);
            if (s > 0 && (!best || s > best.s)) best = { x, y, down, s };
          }
        }
      }
      if (best) put(wd, best.x, best.y, best.down); else left.push(wd);
    }
    queue = left;
  }
  const xs = placed.flatMap((p) => [p.x, p.x + (p.down ? 0 : p.w.length - 1)]);
  const ys = placed.flatMap((p) => [p.y, p.y + (p.down ? p.w.length - 1 : 0)]);
  const mx = Math.min(...xs), my = Math.min(...ys);
  const W = Math.max(...xs) - mx + 1, H = Math.max(...ys) - my + 1;
  placed.forEach((p) => { p.x -= mx; p.y -= my; });
  return { W, H, placed, skipped: queue };
}

export function layoutCrossword(list, variant = 1) {
  const words = [];
  const seen = new Set();
  for (const it of list || []) {
    const w = normWord(it && it.answer);
    if (w.length < 2 || seen.has(w)) continue;
    seen.add(w);
    words.push({ w, clue: String(it.clue || '').trim() });
  }
  if (!words.length) return null;
  const rand = rng(Number(variant || 1) * 7919 + 17);
  let best = null;
  for (let t = 0; t < 60; t++) {
    // long words first, with a little noise so every try is different
    const order = words.map((wd) => ({ wd, k: wd.w.length + rand() * 3 })).sort((a, b) => b.k - a.k).map((o) => o.wd);
    const L = tryLayout(order);
    const ratio = Math.max(L.W, L.H) / Math.min(L.W, L.H);
    const score = L.placed.length * 1000 - L.W * L.H - ratio * 8;
    if (!best || score > best.score) best = { ...L, score };
  }
  // numbers in reading order; a cell that starts two words carries one number
  const starts = [...new Set(best.placed.map((p) => p.y * 1000 + p.x))].sort((a, b) => a - b);
  const out = best.placed
    .map((p) => ({ n: starts.indexOf(p.y * 1000 + p.x) + 1, dir: p.down ? 'down' : 'across', x: p.x, y: p.y, answer: p.w, clue: p.clue }))
    .sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir === 'across' ? -1 : 1));
  return { width: best.W, height: best.H, words: out, skipped: best.skipped.map((s) => s.w) };
}

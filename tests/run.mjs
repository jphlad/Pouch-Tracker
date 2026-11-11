// Run: TZ=America/Los_Angeles node tests/run.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../js/stats.js';
import { computeContext, selectCards } from '../js/health.js';
import { mergeImport, toCSV } from '../js/io.js';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n    ', e.message); }
}

let n = 0;
const E = (iso, count = 1, mg = 9, context = 'Working') =>
  ({ id: `e${n++}`, timestamp: new Date(iso).toISOString(), productId: 'p1', count, mgPerPouch: mg, context });

// local-time constructor helper
const L = (y, m, d, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi);

console.log('stats');
test('mg math', () => {
  assert.equal(S.entryMg({ count: 2, mgPerPouch: 9 }), 18);
  assert.equal(S.entryMg({ count: 4, mgPerPouch: 11 }), 44);
});
test('bands', () => {
  assert.equal(S.bandFor(0).id, 'light');
  assert.equal(S.bandFor(29.9).id, 'light');
  assert.equal(S.bandFor(30).id, 'moderate');
  assert.equal(S.bandFor(60).id, 'heavy');
  assert.equal(S.bandFor(99.9).id, 'heavy');
  assert.equal(S.bandFor(100).id, 'very_heavy');
});
test('day bucketing uses local time (11:30pm stays on its own day)', () => {
  const es = [E(L(2026, 11, 10, 23, 30)), E(L(2026, 11, 11, 0, 30))];
  const m = S.byDay(es);
  assert.equal(m.get('2026-11-10').mg, 9);
  assert.equal(m.get('2026-11-11').mg, 9);
});
test('DST: addDays/daysBetween across fall-back (Nov 1 2026)', () => {
  assert.equal(S.dayKey(S.addDays(L(2026, 10, 31), 1)), '2026-11-01');
  assert.equal(S.dayKey(S.addDays(L(2026, 10, 31), 2)), '2026-11-02');
  assert.equal(S.daysBetween(L(2026, 10, 30), L(2026, 11, 3)), 4);
});
test('DST: addDays across spring-forward (Mar 8 2026)', () => {
  assert.equal(S.dayKey(S.addDays(L(2026, 3, 7), 1)), '2026-03-08');
  assert.equal(S.dayKey(S.addDays(L(2026, 3, 7), 2)), '2026-03-09');
  const series = S.dailySeries([E(L(2026, 3, 8, 1, 30)), E(L(2026, 3, 8, 23, 0))], L(2026, 3, 7), L(2026, 3, 9));
  assert.deepEqual(series.map((r) => r.mg), [0, 18, 0]);
});
test('recentAvg uses completed days and shortens denominator', () => {
  const now = L(2026, 11, 10, 15);
  // started 3 days ago: 18mg, 36mg, then today 9 (excluded)
  const es = [E(L(2026, 11, 8, 10), 2), E(L(2026, 11, 9, 10), 4), E(L(2026, 11, 10, 9))];
  const a = S.recentAvg(es, now, 7);
  assert.equal(a.days, 2);
  assert.equal(a.mg, 27);
});
test('recentAvg falls back to today on day one', () => {
  const now = L(2026, 11, 10, 15);
  const a = S.recentAvg([E(L(2026, 11, 10, 9), 2)], now, 7);
  assert.equal(a.mg, 18);
});
test('rolling average', () => {
  assert.deepEqual(S.rollingAvg([2, 4, 6], 2), [2, 3, 5]);
});

console.log('health triggers');
const now = L(2026, 11, 20, 12);
function daily(fromDay, toDay, perDay) {
  const out = [];
  for (let d = fromDay; d <= toDay; d++) out.push(...perDay(d));
  return out;
}
test('no triggers on flat, daytime, single-pouch use', () => {
  const es = daily(1, 19, (d) => [E(L(2026, 11, d, 10)), E(L(2026, 11, d, 14)), E(L(2026, 11, d, 18))]);
  // extend history back so prior windows exist
  es.push(...daily(1, 31, (d) => [E(L(2026, 10, d, 10)), E(L(2026, 10, d, 14)), E(L(2026, 10, d, 18))]));
  const t = computeContext(es, now).triggers;
  assert.equal(t.mg_up_20, false);
  assert.equal(t.strength_up, false);
  assert.equal(t.late_use, false);
  assert.equal(t.early_first, false);
  assert.equal(t.multi_pouch, false);
  assert.equal(t.idle_context, false);
});
test('mg_up_20 fires on a 50% jump', () => {
  const es = [
    ...daily(23, 31, (d) => [E(L(2026, 10, d, 12), 2)]),
    ...daily(1, 5, (d) => [E(L(2026, 11, d, 12), 2)]),
    ...daily(6, 19, (d) => [E(L(2026, 11, d, 12), 3)]),
  ];
  assert.equal(computeContext(es, now).triggers.mg_up_20, true);
});
test('strength_up fires when switching 9mg → 11mg', () => {
  const es = [
    ...daily(1, 21, (d) => [E(L(2026, 10, d, 12), 1, 9)]),
    ...daily(22, 31, (d) => [E(L(2026, 10, d, 12), 1, 9)]),
    ...daily(1, 19, (d) => [E(L(2026, 11, d, 12), 1, 11)]),
  ];
  assert.equal(computeContext(es, now).triggers.strength_up, true);
});
test('late_use fires at ≥25% after 9pm', () => {
  const es = daily(6, 19, (d) => [E(L(2026, 11, d, 12)), E(L(2026, 11, d, 22))]);
  assert.equal(computeContext(es, now).triggers.late_use, true);
});
test('early_first fires when median first log < 8am', () => {
  const es = daily(10, 19, (d) => [E(L(2026, 11, d, 7, 15)), E(L(2026, 11, d, 13))]);
  assert.equal(computeContext(es, now).triggers.early_first, true);
});
test('multi_pouch fires at ≥20% doubles', () => {
  const es = daily(10, 19, (d) => [E(L(2026, 11, d, 10), 2), E(L(2026, 11, d, 13)), E(L(2026, 11, d, 16))]);
  assert.equal(computeContext(es, now).triggers.multi_pouch, true);
});
test('idle_context fires when Sitting around ≥35%', () => {
  const es = daily(1, 19, (d) => [E(L(2026, 11, d, 10), 1, 9, 'Sitting around'), E(L(2026, 11, d, 13))]);
  assert.equal(computeContext(es, now).triggers.idle_context, true);
});
test('card selection respects bands, order and dismissal', () => {
  const cards = JSON.parse(readFileSync(new URL('../data/health-cards.json', import.meta.url)));
  const es = daily(1, 19, (d) => Array.from({ length: 7 }, (_, i) => E(L(2026, 11, d, 9 + i), 1, 11)));
  const { cards: shown, context } = selectCards(cards, es, {}, now);
  assert.equal(context.band.id, 'heavy'); // 77mg/day
  assert.ok(shown.some((c) => c.id === 'heart-long-term'));
  assert.ok(!shown.some((c) => c.id === 'light-band'));
  const firstAlways = shown.findIndex((c) => c.trigger === 'always');
  const lastBand = shown.map((c) => c.trigger.startsWith('band:')).lastIndexOf(true);
  assert.ok(lastBand < firstAlways);
  const dismissed = { 'gums': L(2026, 12, 20).toISOString() };
  assert.ok(!selectCards(cards, es, dismissed, now).cards.some((c) => c.id === 'gums'));
  assert.ok(shown.find((c) => c.id === 'absorption-basics').numbers.includes('77'));
});

console.log('io');
test('import merges by id without duplicating', () => {
  const cur = { products: [{ id: 'p1', brand: 'Velo' }], entries: [E(L(2026, 11, 1))], settings: { contexts: ['A'] } };
  const file = { version: 1, products: [{ id: 'p1', brand: 'Velo' }, { id: 'p2', brand: 'ZYN' }], entries: [cur.entries[0], E(L(2026, 11, 2))], settings: { contexts: ['B'] } };
  const out = mergeImport(cur, file);
  assert.equal(out.products.length, 2);
  assert.equal(out.entries.length, 2);
});
test('export → import round-trip is lossless', () => {
  const data = { products: [{ id: 'p1', brand: 'Velo', line: 'Plus', flavor: 'Spearmint', mg: 9 }], entries: [E(L(2026, 11, 3), 2)], settings: { contexts: ['Working'] } };
  const json = JSON.parse(JSON.stringify({ version: 1, ...data }));
  const out = mergeImport({ products: [], entries: [], settings: {} }, json);
  assert.deepEqual(out.entries, data.entries);
  assert.deepEqual(out.products, data.products);
});
test('csv has header and one row per entry', () => {
  const p = [{ id: 'p1', brand: 'Velo', line: 'Plus', flavor: 'Spear, mint', mg: 9 }];
  const csv = toCSV([E(L(2026, 11, 3), 2)], p).trim().split('\n');
  assert.equal(csv.length, 2);
  assert.ok(csv[1].includes('"Spear, mint"'));
  assert.ok(csv[1].includes(',18,'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

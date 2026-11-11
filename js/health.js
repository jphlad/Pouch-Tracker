// Chooses which health cards to show and computes their "Your numbers" line.
import {
  addDays, inRange, recentAvg, bandFor, periodCompare, avgStrength, lateShare,
  firstLogMinutes, median, multiRate, shareBy, entryMg, fmtMg, fmtMinutes,
  ABSORB_LOW, ABSORB_HIGH, POUCH_HOURS, dayKey,
} from './stats.js';

const IDLE_CONTEXT = 'Sitting around';

export function computeContext(entries, now = new Date()) {
  const avg = recentAvg(entries, now, 7);
  const band = bandFor(avg.mg);
  const yesterday = addDays(now, -1);
  const last14 = inRange(entries, addDays(yesterday, -13), now);
  const last30 = inRange(entries, addDays(yesterday, -29), now);
  const daysLogged = new Set(entries.map((e) => dayKey(e.timestamp))).size;

  const cmp14 = periodCompare(entries, now, 14);
  const cmp30 = periodCompare(entries, now, 30);
  const strCur = avgStrength(cmp30.cur), strPrev = avgStrength(cmp30.prev);
  const firsts = firstLogMinutes(last14).map((x) => x.minutes);
  const medFirst = median(firsts);
  const late = lateShare(last14);
  const multi = multiRate(last14);
  const ctx30 = shareBy(last30, (e) => e.context);
  const idle = ctx30.find((c) => c.key === IDLE_CONTEXT);

  const triggers = {
    always: true,
    mg_up_20: cmp14.prevDaysLogged >= 7 && cmp14.prevMg > 0 && cmp14.curMg >= cmp14.prevMg * 1.2,
    strength_up: cmp30.cur.length >= 5 && cmp30.prev.length >= 5 && strCur - strPrev >= 1,
    late_use: last14.length >= 5 && late >= 0.25,
    early_first: firsts.length >= 3 && medFirst != null && medFirst < 8 * 60,
    multi_pouch: last14.length >= 5 && multi >= 0.2,
    idle_context: last30.length >= 5 && !!idle && idle.share >= 0.35,
  };

  return {
    avg, band, daysLogged, cmp14, strCur, strPrev, medFirst, late, multi, idle, triggers,
  };
}

function pct(x) { return `${Math.round(x * 100)}%`; }

export function numbersLine(key, c) {
  if (c.daysLogged < 3) return null;
  const a = c.avg;
  switch (key) {
    case 'absorbed_estimate':
      return `Your 7-day average: ${fmtMg(a.mg)}mg/day labeled · ~${fmtMg(a.mg * ABSORB_LOW)}–${fmtMg(a.mg * ABSORB_HIGH)}mg est. absorbed`;
    case 'seven_day_avg':
      return `Your 7-day average: ${fmtMg(a.mg)}mg/day · ${fmtMg(a.pouches)} pouches/day`;
    case 'contact_hours':
      return `~${fmtMg(a.pouches * POUCH_HOURS)} hours/day of pouch contact (${fmtMg(a.pouches)} pouches × 45 min)`;
    case 'period_change':
      return c.cmp14.pct == null ? null :
        `Last 14 days: ${fmtMg(c.cmp14.curMg)}mg/day vs ${fmtMg(c.cmp14.prevMg)}mg/day before (${c.cmp14.pct >= 0 ? '+' : ''}${pct(c.cmp14.pct)})`;
    case 'strength_change':
      return `Avg strength: ${fmtMg(c.strCur)}mg/pouch this month vs ${fmtMg(c.strPrev)}mg last month`;
    case 'late_share':
      return `${pct(c.late)} of your last 14 days' nicotine was after 9pm`;
    case 'first_pouch_time':
      return `Typical first pouch (last 14 days): ${fmtMinutes(c.medFirst)}`;
    case 'multi_share':
      return `${pct(c.multi)} of your recent logs were 2× or more`;
    case 'context_share':
      return c.idle ? `"Sitting around": ${pct(c.idle.share)} of your last 30 days' mg` : null;
    default:
      return null;
  }
}

function matches(trigger, c) {
  if (trigger.startsWith('band:')) return trigger.slice(5).split(',').includes(c.band.id);
  return !!c.triggers[trigger];
}

export function selectCards(cards, entries, dismissed = {}, now = new Date()) {
  const c = computeContext(entries, now);
  const live = (card) => {
    const until = dismissed[card.id];
    return !(until && new Date(until) > now);
  };
  const shown = cards.filter((card) => matches(card.trigger, c) && live(card));
  const rank = (card) => (card.trigger === 'always' ? 2 : card.trigger.startsWith('band:') ? 1 : 0);
  shown.sort((x, y) => rank(x) - rank(y));
  return {
    context: c,
    cards: shown.map((card) => ({ ...card, numbers: card.showNumbers ? numbersLine(card.showNumbers, c) : null })),
  };
}

export { entryMg };

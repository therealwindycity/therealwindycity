/* ============================================================================
   WorkDesk — score.js
   "WorkScore": one 0–100 number that answers the only question that matters at
   6am — is this worth driving to?

   Every score is explainable: rank() returns the component breakdown so the UI
   can print exactly why a job landed where it did. No black boxes.
   ========================================================================== */
(function (global) {
  'use strict';
  const WD = (global.WorkDesk = global.WorkDesk || {});
  const { clamp, norm, parseDate } = WD;

  const DEFAULT_WEIGHTS = {
    pay: 34,          // real net $/hr
    distance: 24,     // how far you'd drive
    timing: 16,       // how soon it starts + how fresh the post is
    match: 18,        // does it want the skills you actually have
    buyer: 8          // what your own history says about this company
  };

  const DEFAULT_PROFILE = {
    home: { label: 'Cheyenne, WY', city: 'Cheyenne', state: 'WY', lat: 41.1400, lng: -104.8202 },
    payFloorHourly: 35,       // below this, don't bother
    payTargetHourly: 65,      // at or above this, full marks
    payFloorFlat: 120,
    maxMiles: 120,            // hard filter default
    idealMiles: 35,           // full marks inside this
    defaultJobHours: 3,       // used when a flat rate has no stated window
    skills: ['cabling','cat6','fiber','pos','point of sale','network','server','rack and stack',
             'break fix','tablet','printer','wireless','low voltage','decommission','refresh'],
    blockedCompanies: [],
    blockedKeywords: ['roof','overnight','travel required','per diem only','unpaid'],
    requiredKeywords: [],
    platformHaircut: { fieldnation: 0.10, workmarket: 0.00 },  // verify against YOUR plan
    weights: DEFAULT_WEIGHTS
  };

  function profileOf(settings) {
    const p = Object.assign({}, DEFAULT_PROFILE, settings.profile || {});
    p.home = Object.assign({}, DEFAULT_PROFILE.home, (settings.profile || {}).home || {});
    p.weights = Object.assign({}, DEFAULT_WEIGHTS, (settings.profile || {}).weights || {});
    p.platformHaircut = Object.assign({}, DEFAULT_PROFILE.platformHaircut, (settings.profile || {}).platformHaircut || {});
    p.skills = (p.skills || []).map(s => norm(s)).filter(Boolean);
    return p;
  }

  /* ------------------------------------------------------- net hourly */
  function netHourly(order, profile) {
    const cut = profile.platformHaircut && profile.platformHaircut[order.platform];
    const fee = (typeof cut === 'number' && !isNaN(cut)) ? cut : 0;
    let base = order.hourly;

    if (base == null && order.pay && order.pay.amount != null) {
      if (order.pay.type === 'hourly') base = order.pay.amount;
      else {
        const winHours = WD.hoursBetween(order.start, order.end);
        const hours = (winHours && winHours > 0.25 && winHours < 200) ? winHours
                    : (order.duration_hint || profile.defaultJobHours);
        base = hours ? order.pay.amount / hours : null;
        if (base != null) order.__hours_used = hours;
      }
    }
    if (base == null) return null;
    const gross = base * (order.pay && order.pay.units > 1 ? 1 : 1);   // per-tech rate
    return { gross, net: gross * (1 - fee), fee };
  }

  function netTotal(order, profile) {
    if (!order.pay || order.pay.amount == null) return null;
    const cut = (profile.platformHaircut && profile.platformHaircut[order.platform]) || 0;
    const gross = order.pay.type === 'hourly'
      ? order.pay.amount * (order.__hours_used || profile.defaultJobHours)
      : order.pay.amount;
    return { gross, net: gross * (1 - cut), fee: cut };
  }

  /* ------------------------------------------------------- components */
  function payComponent(order, profile) {
    const nh = netHourly(order, profile);
    if (!nh) return { score: 0.35, why: 'no pay posted', detail: null };
    const floor = profile.payFloorHourly, target = profile.payTargetHourly;
    if (nh.net <= 0) return { score: 0, why: 'zero pay', detail: nh };
    if (nh.net >= target) return { score: 1, why: 'above your target', detail: nh };
    if (nh.net <= floor * 0.5) return { score: 0.08, why: 'well under your floor', detail: nh };
    if (nh.net <= floor) {
      const s = 0.15 + 0.35 * (nh.net / (floor || 1));
      return { score: s, why: 'under your floor', detail: nh };
    }
    const s = 0.5 + 0.5 * ((nh.net - floor) / Math.max(1, target - floor));
    return { score: clamp(s, 0, 1), why: 'in your range', detail: nh };
  }

  function distanceComponent(order, profile) {
    const mi = order.distance_mi;
    if (mi == null) return { score: 0.45, why: 'distance unknown', detail: null };
    if (mi <= profile.idealMiles) return { score: 1, why: 'inside your ideal radius', detail: mi };
    if (mi >= profile.maxMiles) return { score: 0.05, why: 'past your max radius', detail: mi };
    const s = 1 - 0.85 * ((mi - profile.idealMiles) / Math.max(1, profile.maxMiles - profile.idealMiles));
    return { score: clamp(s, 0, 1), why: 'outside ideal, inside max', detail: mi };
  }

  function timingComponent(order, profile) {
    const start = parseDate(order.start);
    const posted = parseDate(order.posted_at);
    let s = 0.5, why = 'no date posted';

    if (start) {
      const days = (start - Date.now()) / 86400000;
      if (days < -1) { s = 0.02; why = 'start date already passed'; }
      else if (days <= 0.5) { s = 1.0; why = 'starts today'; }
      else if (days <= 2) { s = 0.95; why = 'starts in ~' + Math.round(days) + 'd'; }
      else if (days <= 5) { s = 0.9; why = 'starts in ' + Math.round(days) + 'd'; }
      else if (days <= 14) { s = 0.75; why = 'starts in ' + Math.round(days) + 'd'; }
      else if (days <= 45) { s = 0.55; why = Math.round(days) + 'd out'; }
      else { s = 0.35; why = Math.round(days) + 'd out'; }
    }
    if (posted) {
      const ageH = (Date.now() - posted) / 3600000;
      if (ageH <= 2) s = clamp(s + 0.18, 0, 1);
      else if (ageH <= 12) s = clamp(s + 0.10, 0, 1);
      else if (ageH > 168) s = clamp(s - 0.15, 0, 1);
      if (!start) { s = clamp(0.35 + (ageH <= 12 ? 0.2 : 0), 0, 1); why = ageH <= 12 ? 'fresh post, no date' : 'old post'; }
    }
    return { score: clamp(s, 0, 1), why };
  }

  function matchComponent(order, profile) {
    const mine = profile.skills || [];
    if (!mine.length) return { score: 0.5, why: 'no skills set', hits: [] };
    const hay = norm([order.title, order.description, (order.work_types || []).join(' '),
                      (order.skills || []).join(' '), (order.requirements || []).join(' ')].join(' '));
    const hits = mine.filter(s => s && hay.includes(s));
    const score = clamp(0.25 + 0.75 * Math.min(1, hits.length / Math.max(2, Math.min(5, mine.length))), 0, 1);
    return { score, why: hits.length ? hits.length + ' skill match' + (hits.length > 1 ? 'es' : '') : 'no skill overlap', hits };
  }

  function buyerComponent(order, profile, history) {
    const c = norm(order.company);
    if (!c) return { score: 0.5, why: 'no company listed' };
    if ((profile.blockedCompanies || []).some(b => c.includes(norm(b)))) return { score: 0, why: 'on your block list' };
    const h = history && history[c];
    if (!h) return { score: 0.55, why: 'no history with this buyer' };
    let s = 0.55, why = '';
    if (h.won) { s = 1; why = h.won + ' won here'; }
    else if (h.applied) { s = 0.62; why = h.applied + ' applied, no result yet'; }
    else if (h.ignored) { s = 0.35; why = 'you ignored ' + h.ignored + ' here'; }
    else if (h.saved) { s = 0.6; why = h.saved + ' saved, not applied yet'; }
    if (h.lost) { s = Math.max(0.15, s - 0.25); why += (why ? ' · ' : '') + h.lost + ' lost'; }
    // never leave the Buyer-history bar without a reason
    if (!why) why = 'seen before, no outcome recorded';
    return { score: clamp(s, 0, 1), why, h };
  }

  function keywordComponent(order, profile) {
    const hay = norm([order.title, order.description, (order.work_types || []).join(' ')].join(' '));
    const blocked = (profile.blockedKeywords || []).filter(k => k && hay.includes(norm(k)));
    const required = (profile.requiredKeywords || []).filter(k => k && !hay.includes(norm(k)));
    return { blocked, missing: required, ok: !blocked.length && !required.length };
  }

  /* --------------------------------------------------------------- rank */
  function rank(order, profile, history) {
    const w = profile.weights || DEFAULT_WEIGHTS;
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;

    const pay = payComponent(order, profile);
    const dist = distanceComponent(order, profile);
    const time = timingComponent(order, profile);
    const match = matchComponent(order, profile);
    const buyer = buyerComponent(order, profile, history);
    const kw = keywordComponent(order, profile);

    let score = (pay.score * w.pay + dist.score * w.distance + time.score * w.timing +
                 match.score * w.match + buyer.score * w.buyer) / total;

    const flags = [];
    if (kw.blocked.length) { score *= 0.25; flags.push('blocked keyword: ' + kw.blocked.join(', ')); }
    if (kw.missing.length) { score *= 0.4; flags.push('missing required: ' + kw.missing.join(', ')); }
    if (pay.detail && pay.detail.net < profile.payFloorHourly) flags.push('under pay floor');
    if (dist.detail != null && dist.detail > profile.maxMiles) flags.push('past max miles');
    if (order.geo_precision === 'state') flags.push('distance is a rough state-level estimate');
    if (!order.pay || order.pay.amount == null) flags.push('no pay posted');

    score = clamp(score, 0, 1) * 100;

    return {
      score: Math.round(score),
      parts: { pay, distance: dist, timing: time, match, buyer, keyword: kw },
      flags,
      netHourly: pay.detail,
      netTotal: netTotal(order, profile),
      label: score >= 80 ? 'strong' : score >= 62 ? 'decent' : score >= 45 ? 'marginal' : score >= 25 ? 'weak' : 'skip'
    };
  }

  function rankAll(orders, profile, history) {
    return orders.map(o => { o.rank = rank(o, profile, history); return o; })
                 .sort((a, b) => b.rank.score - a.rank.score);
  }

  /* ------------------------------------------------------ explain line */
  function explain(r, order, profile) {
    const p = [];
    if (r.netHourly) p.push(WD.money(r.netHourly.net, 0) + '/hr net' +
      (r.netHourly.fee ? ' (after ' + Math.round(r.netHourly.fee * 100) + '% fee)' : ''));
    else if (order.pay && order.pay.amount != null) p.push(WD.money(order.pay.amount) + ' ' + (order.pay.type === 'hourly' ? '/hr' : order.pay.type === 'per_unit' ? '/' + (order.pay.unit_label || 'unit') : 'flat'));
    if (order.distance_mi != null) p.push(WD.distLabel(order.distance_mi) + (order.drive_min ? ' ≈' + order.drive_min + ' min' : ''));
    if (order.start) p.push('starts ' + WD.dayLabel(order.start));
    if (r.parts.match.hits && r.parts.match.hits.length) p.push('matches: ' + r.parts.match.hits.slice(0, 4).join(', '));
    return p.join(' · ');
  }

  Object.assign(WD, {
    DEFAULT_WEIGHTS, DEFAULT_PROFILE, profileOf,
    netHourly, netTotal, rank, rankAll, explain,
    payComponent, distanceComponent, timingComponent, matchComponent, buyerComponent
  });
})(typeof window !== 'undefined' ? window : globalThis);

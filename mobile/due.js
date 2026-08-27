/* How often each round comes round.

   In HOURS, because hours are what the machine wears in. A truck parked for
   three weeks on a broken wheel motor has not put debris on its plugs, and a
   dozer that worked every shift of those three weeks has. The fleet's own
   figures are hours, the OEM's figures are hours, and parts are ordered against
   hours — the calendar is a rendering of them, not the other way round.

   The rendering needs a rate, and the fleet's is two ten-hour shifts:

       250 h  ÷  20 h/day  =  12.5 days

   That is the assumption, in one place, and it is only a default. A machine
   that has been inspected twice has told us its OWN hours per day — two hour
   meter readings and the dates they were taken on — and where that is known it
   is used instead, because a light vehicle doing eight hours a day should not
   be called overdue on a haul truck's calendar.

   ---------------------------------------------------------------------------
   THE FILTER CUT IS TWO INTERVALS, NOT ONE.

   The engine filter is cut every 500 h and the rest every 1000. That is not a
   detail to round away: cutting a hydraulic filter twice as often as it needs
   is a filter thrown away, an hour of a fitter's shift and a machine held,
   times a fleet of 1,128.

   So the ROUND is due at the shortest of its parts — somebody has to be at the
   machine at 500 h for the engine filter — and each part carries its own
   figure, so the sheet can say which filters this visit is actually for. Every
   second visit is all of them.
   ---------------------------------------------------------------------------

   Rounds this fleet has not given an hour figure for keep the calendar interval
   they already used, and say so rather than having one invented for them.

   Written to `self` rather than `window`: the service worker imports this file
   to decide what to cache, and a service worker has no window. */
(function (G) {
  'use strict';

  var D = {
    /* Two ten-hour shifts. Every hour figure below becomes a date through this
       number, and this is the line to change if the operating pattern does. */
    HOURS_PER_DAY: 20,

    /* A machine's own rate is only believed inside these bounds. Outside them
       the arithmetic is being fed something that is not an operating pattern —
       an hour meter that was replaced, a date typed wrong, two rounds recorded
       on one day — and 20 is a better answer than 300. */
    RATE_MIN: 3,
    RATE_MAX: 24,
    /* Two readings a day apart cannot measure a daily rate: one shift's
       rounding is the whole answer. */
    RATE_MIN_DAYS: 5,

    /* h — walked on hours.
       d — walked on the calendar, because nobody has given this round an hour
           figure and inventing one would be worse than carrying forward what
           the fleet already does. `carried` says so out loud.
       parts — where one round covers things that come round at different
           rates. The round itself is due at the shortest of them. */
    EVERY: {
      /* Confirmed for the Terex TR60 haul trucks — final drive magnetic plugs
         at 250 h. Everything else on site keeps that figure until somebody
         states one for it, and `byClass` is where a stated one goes. */
      MP:   { h: 250 },
      FC:   { h: 500, parts: { ENG: 500, TRANS: 1000, HYD: 1000, FUEL: 1000, LUBE: 1000 } },
      /* Undercarriage is not one interval. A dozer's chain is in the ground
         every hour it works; an excavator's carries the machine and turns far
         less, and running both at 500 h walked the excavators eight times more
         often than anybody asked for. Both figures are stated, and between them
         they cover every machine the round fits — 22 dozers and 21 excavators. */
      UC:   { h: 1000, byClass: { DOZ: 1000, EXC: 4000 } },
      GET:  { h: 500 },
      /* Body inspection on the Komatsu HM400 articulated trucks at 4,000 h. The
         sixteen rigid trucks this round also fits have no stated figure, so they
         keep the one they were already walked on rather than inheriting the
         ADTs' — see `carried`. */
      TB:   { h: 1000, byClass: { AT: 4000 } },
      INSP: { h: 500 },
      /* Still no hour figure for these two, so they keep the calendar the
         fleet already ran them on. Carried forward rather than converted: 30
         days is what somebody chose, and 600 h is a number nobody has said. */
      TEMP: { d: 30, carried: 1 },
      LUBE: { d: 30, carried: 1 },
    },
    FALLBACK: { d: 30, carried: 1 },
  };

  /* THE INTERVAL IS A PROPERTY OF THE ROUND AND THE MACHINE, NOT THE ROUND.

     It used to be the round alone, so one number had to serve a dozer and an
     excavator, and whichever number was chosen was wrong for one of them. A
     class with a stated figure gets it; a class without keeps the round's own,
     and says so rather than being quietly given somebody else's.

     `cls` is optional everywhere, so every existing call still answers exactly
     as it did — the round's figure — and only a caller that knows which machine
     it is asking about gets the sharper answer. */
  function spec(type, cls) {
    var s = D.EVERY[type] || D.FALLBACK;
    if (!cls || !s.byClass) return s;
    var h = s.byClass[cls];
    if (h == null) {
      /* A class this round fits but nobody has given a figure for. It keeps the
         round's interval and is flagged, so a coverage sheet can show which
         machines are being walked on a carried-forward number. */
      return Object.assign({}, s, { carriedClass: 1 });
    }
    return Object.assign({}, s, { h: h });
  }
  D.spec = spec;
  /* Every class this round is walked on at its own stated figure, as
     [{cls, h}] — what a coverage row needs to say "1,000 h dozers ·
     4,000 h excavators" instead of one number that is wrong for one of them. */
  D.byClass = function (type) {
    var s = D.EVERY[type] || D.FALLBACK;
    if (!s.byClass) return null;
    return Object.keys(s.byClass).map(function (c) {
      return { cls: c, h: s.byClass[c] };
    });
  };

  /* The interval in hours, or null when this round is walked on the calendar.
     `part` narrows it to one thing inside the round — the engine filter rather
     than the filter round. */
  D.hours = function (type, part, cls) {
    var s = spec(type, cls);
    if (part && s.parts && s.parts[part] != null) return s.parts[part];
    return s.h != null ? s.h : null;
  };

  /* The interval in days at a given rate. A calendar round answers with its own
     figure and ignores the rate entirely — that is what makes it a calendar
     round. */
  D.days = function (type, part, hoursPerDay, cls) {
    var s = spec(type, cls), h = D.hours(type, part, cls);
    if (h == null) return s.d;
    var r = hoursPerDay > 0 ? hoursPerDay : D.HOURS_PER_DAY;
    return h / r;
  };

  /* Which parts of this round are due at this visit, given how many hours the
     machine has done since the round was last walked. A round with no parts
     answers with null: all of it, every time. */
  D.partsDue = function (type, sinceHours) {
    var s = spec(type);
    if (!s.parts) return null;
    var out = [];
    Object.keys(s.parts).forEach(function (k) {
      if (sinceHours == null || sinceHours >= s.parts[k]) out.push(k);
    });
    return out;
  };

  /* ---- the machine's own hours per day -----------------------------------
     Two hour meter readings and the dates they were taken on. This is the
     second measurement the whole schedule waits for: before it, every machine
     on the fleet is assumed to run the same shift; after it, each one is
     scheduled on what it actually does.

     trail: [{d:"YYYY-MM-DD", h:<smu>}], any order. Returns null rather than a
     guess whenever the readings cannot support one. */
  D.rateFrom = function (trail) {
    if (!trail || trail.length < 2) return null;
    var pts = trail.filter(function (r) {
      return r && r.d && r.h != null && r.h !== '' && isFinite(Number(r.h));
    }).map(function (r) { return { t: Date.parse(r.d + 'T00:00:00Z'), h: Number(r.h) }; })
      .filter(function (r) { return isFinite(r.t); })
      .sort(function (a, b) { return a.t - b.t; });
    if (pts.length < 2) return null;
    var a = pts[0], b = pts[pts.length - 1];
    var days = (b.t - a.t) / 86400000;
    if (days < D.RATE_MIN_DAYS) return null;
    var r = (b.h - a.h) / days;
    if (!isFinite(r) || r < D.RATE_MIN || r > D.RATE_MAX) return null;
    return Math.round(r * 10) / 10;
  };

  /* ---- when is this unit next due ----------------------------------------
     Everything the due list needs, worked out once so the app and the dashboard
     cannot drift on it.

     in:  { type, last:{d,h,f}, today, rate }
            last.d  the date the round was last walked
            last.h  the hour meter at that time, if it was written down
            last.f  hours to the soonest condemn on that round, where two
                    readings made one
            rate    the machine's own hours per day, or nothing for the fleet
                    assumption

     `why` comes back as "wear" when the forecast, not the interval, is what
     brings the round forward — a machine whose worst point reaches its limit in
     300 hours is due in 300 hours, whatever the schedule says. A due list that
     cannot say WHY a unit is on it is a due list nobody trusts twice. */
  D.next = function (o) {
    o = o || {};
    /* o.cls lets the caller say which machine this is, so a dozer and an
       excavator are not both due on one number. Omitted, it behaves as before. */
    var s = spec(o.type, o.cls), last = o.last || {};
    var measured = o.rate > 0;
    var rate = measured ? o.rate : D.HOURS_PER_DAY;
    var today = o.today || isoToday();
    var daysSince = dayDiff(last.d, today);
    if (daysSince == null) return null;

    var calendar = s.h == null;
    /* On a calendar round the hours are shown for context and decide nothing. */
    var hoursSince = Math.round(daysSince * rate);
    var interval = calendar ? s.d * rate : s.h;

    /* The forecast beats the schedule when it is sooner. It was taken on the
       round being counted from, so the same hours spend it. */
    var why = '';
    var left = interval - hoursSince;
    if (last.f != null && isFinite(Number(last.f))) {
      var wear = Number(last.f) - hoursSince;
      if (wear < left) { left = wear; why = 'wear'; }
    }

    var days = calendar && !why ? s.d - daysSince : left / rate;
    return {
      daysSince: daysSince,
      hoursSince: hoursSince,
      dueInHours: Math.round(left),
      dueInDays: Math.round(days),
      over: days < 0,
      rate: rate,
      measured: measured,
      basis: calendar && !why ? 'days' : 'hours',
      smuNow: last.h != null && last.h !== '' && isFinite(Number(last.h))
        ? Math.round(Number(last.h) + hoursSince) : null,
      why: why,
    };
  };

  function isoToday() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function dayDiff(from, to) {
    if (!from) return null;
    var a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.floor((b - a) / 86400000);
  }
  D.dayDiff = dayDiff;

  G.DUE = D;
})(typeof self !== 'undefined' ? self : this);

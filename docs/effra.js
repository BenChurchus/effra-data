/*
 * Effra stats engine + small UI helpers, shared by index.html and master.html.
 * Everything is derived from matches.json (full rosters per match), so the
 * public site and the master sheet can never disagree.
 *
 * Conventions
 *  - Rates (win %, captain win %, pair win %) use decided games (W+D+L) as the
 *    denominator; a match with no recorded result counts as an appearance only.
 *  - Per-game stats divide by appearances.
 *  - Streaks run over a player's own appearances in order (season, GW); weeks
 *    they didn't play don't break a streak. A draw breaks win and loss streaks.
 *  - "OG" / "Own goal" rows are not players.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- basics

  const NON_PLAYERS = new Set(['og', 'own goal']);
  const isPlayerName = (n) => !!n && !NON_PLAYERS.has(String(n).trim().toLowerCase());
  const byChrono = (a, b) => (Number(a.year) || 0) - (Number(b.year) || 0) || a.gw - b.gw;
  const matchKey = (m) => `${m.year ?? ''}-${m.gw}`;
  const gwLabel = (g, withYear = true) => `${withYear && g.year ? `${g.year} ` : ''}GW${g.gw}`;

  function seasons(matches) {
    return Array.from(new Set(matches.map(m => m.year).filter(y => y != null))).sort((a, b) => a - b);
  }

  function filterBySeason(matches, year) {
    if (year == null || year === 'all') return matches;
    return matches.filter(m => String(m.year) === String(year));
  }

  const record = () => ({ n: 0, W: 0, D: 0, L: 0 });
  function addResult(rec, r) {
    rec.n += 1;
    if (r === 'W' || r === 'D' || r === 'L') rec[r] += 1;
  }
  const decided = (rec) => rec.W + rec.D + rec.L;
  const winRate = (rec) => (decided(rec) ? rec.W / decided(rec) : null);
  /** Win calc: draws count as half a win, (W + ½D) ÷ (W + D + L). Neutralises draws. */
  const winCalc = (rec) => (decided(rec) ? (rec.W + 0.5 * rec.D) / decided(rec) : null);
  const minus = (a, b) => ({ n: a.n - b.n, W: a.W - b.W, D: a.D - b.D, L: a.L - b.L });

  // Which per-player stats a match's scorecard recorded. Older data without
  // the field is assumed to have everything (the 2026 layout).
  const ALL_TRACKED = ['goals', 'assists', 'clean_sheets', 'captain'];
  const tracks = (m) => new Set(Array.isArray(m.tracked) ? m.tracked : ALL_TRACKED);
  const sideResult = (m, side) => (side === 1 ? m.team1_result : m.team2_result);
  const roster = (m, side) => ((side === 1 ? m.team1_players : m.team2_players) || []).filter(p => isPlayerName(p.player));
  const ownGoals = (m, side) => ((side === 1 ? m.team1_players : m.team2_players) || [])
    .filter(p => !isPlayerName(p.player)).reduce((s, p) => s + (p.goals || 0), 0);

  // ------------------------------------------------------------- per player

  function longestStreak(games, pred) {
    let best = { length: 0, from: null, to: null };
    let cur = 0, start = null;
    for (const g of games) {
      if (pred(g)) {
        if (cur === 0) start = g;
        cur += 1;
        if (cur > best.length) best = { length: cur, from: start, to: g };
      } else {
        cur = 0;
      }
    }
    return best;
  }

  function currentStreak(games) {
    if (!games.length) return null;
    const last = games[games.length - 1].result;
    if (!last) return null;
    let n = 0;
    for (let i = games.length - 1; i >= 0 && games[i].result === last; i--) n++;
    return { result: last, length: n };
  }

  /** One row per player with every derived stat. */
  function buildPlayers(matches) {
    const map = new Map();
    for (const m of matches.slice().sort(byChrono)) {
      for (const side of [1, 2]) {
        const result = sideResult(m, side);
        const mine = roster(m, side);
        const theirs = roster(m, 3 - side);
        const seen = new Set();
        for (const p of mine) {
          if (seen.has(p.player)) continue; // guard against a name listed twice
          seen.add(p.player);
          if (!map.has(p.player)) map.set(p.player, { name: p.player, games: [] });
          map.get(p.player).games.push({
            key: matchKey(m), year: m.year, gw: m.gw, venue: m.venue, side, result,
            tracked: tracks(m),
            goals: p.goals || 0, assists: p.assists || 0, cs: p.clean_sheets || 0,
            captain: !!p.is_captain,
            teamGoals: side === 1 ? m.team1_goals : m.team2_goals,
            oppGoals: side === 1 ? m.team2_goals : m.team1_goals,
            teammates: mine.map(x => x.player).filter(n => n !== p.player),
            opponents: theirs.map(x => x.player),
          });
        }
      }
    }
    const out = [];
    for (const p of map.values()) {
      const rec = record(), cap = record();
      let goals = 0, assists = 0, cs = 0, goalsInATracked = 0;
      for (const g of p.games) {
        addResult(rec, g.result);
        if (g.captain) addResult(cap, g.result);
        goals += g.goals; assists += g.assists; cs += g.cs;
        if (g.tracked.has('assists')) goalsInATracked += g.goals;
      }
      const apps = p.games.length;
      // Per-game rates only over games whose scorecard recorded that stat
      // (2024/25 sheets recorded goals only), so old seasons don't count as zeros.
      const appsA = p.games.filter(g => g.tracked.has('assists')).length;
      const appsCS = p.games.filter(g => g.tracked.has('clean_sheets')).length;
      const csGames = p.games.filter(g => g.cs > 0).length;
      const per = (n, d) => (d ? n / d : null);
      out.push({
        name: p.name, games: p.games, apps, appsA, appsCS, rec, cap,
        goals, assists, cs, ga: goals + assists,
        gpg: goals / apps, apg: per(assists, appsA), gapg: per(goalsInATracked + assists, appsA), cspg: per(cs, appsCS),
        // share of tracked appearances with a clean sheet credited (a game counts once)
        csGames, csPct: per(csGames, appsCS),
        winPct: winRate(rec), capWinPct: winRate(cap), winCalc: winCalc(rec), capWinCalc: winCalc(cap),
        streaks: {
          win: longestStreak(p.games, g => g.result === 'W'),
          loss: longestStreak(p.games, g => g.result === 'L'),
          unbeaten: longestStreak(p.games, g => g.result === 'W' || g.result === 'D'),
          scoring: longestStreak(p.games, g => g.goals > 0),
          current: currentStreak(p.games),
        },
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ------------------------------------------------------------------ pairs

  /** Exact two-sided binomial test p-value for k successes in n trials at p=0.5. */
  function binomialP(k, n) {
    if (n === 0) return 1;
    const probs = [];
    let c = 1; // C(n, 0)
    for (let i = 0; i <= n; i++) {
      probs.push(c * Math.pow(0.5, n));
      c = (c * (n - i)) / (i + 1);
    }
    const pk = probs[k];
    let p = 0;
    for (const q of probs) if (q <= pk * (1 + 1e-9)) p += q;
    return Math.min(1, p);
  }

  /**
   * Every pair of players who've shared a pitch. `with` is their shared
   * team record; `vs` is from a's point of view (a is alphabetically first).
   */
  function buildPairs(matches) {
    const map = new Map();
    const get = (x, y) => {
      const [a, b] = x < y ? [x, y] : [y, x];
      const k = `${a}\u0000${b}`;
      if (!map.has(k)) map.set(k, { a, b, with: record(), withGoals: 0, vs: { n: 0, aW: 0, D: 0, bW: 0 }, games: [] });
      return map.get(k);
    };
    for (const m of matches) {
      const t1 = roster(m, 1), t2 = roster(m, 2);
      const names1 = Array.from(new Set(t1.map(p => p.player)));
      const names2 = Array.from(new Set(t2.map(p => p.player)));
      const goalsOf = (list, n) => list.filter(p => p.player === n).reduce((s, p) => s + (p.goals || 0), 0);
      for (const [names, list, side] of [[names1, t1, 1], [names2, t2, 2]]) {
        for (let i = 0; i < names.length; i++) {
          for (let j = i + 1; j < names.length; j++) {
            const pr = get(names[i], names[j]);
            addResult(pr.with, sideResult(m, side));
            pr.withGoals += goalsOf(list, names[i]) + goalsOf(list, names[j]);
            pr.games.push({ key: matchKey(m), year: m.year, gw: m.gw, venue: m.venue, together: true, result: sideResult(m, side) });
          }
        }
      }
      for (const x of names1) {
        for (const y of names2) {
          if (x === y) continue;
          const pr = get(x, y);
          const aSide = pr.a === x ? 1 : 2;
          const r = sideResult(m, aSide);
          pr.vs.n += 1;
          if (r === 'W') pr.vs.aW += 1;
          else if (r === 'L') pr.vs.bW += 1;
          else if (r === 'D') pr.vs.D += 1;
          pr.games.push({ key: matchKey(m), year: m.year, gw: m.gw, venue: m.venue, together: false, aResult: r });
        }
      }
    }
    for (const pr of map.values()) {
      pr.withPct = winRate(pr.with);
      pr.withCalc = winCalc(pr.with);
      pr.withGpg = pr.with.n ? pr.withGoals / pr.with.n : null;
      pr.vsP = binomialP(pr.vs.aW, pr.vs.aW + pr.vs.bW);
      pr.games.sort(byChrono);
    }
    return Array.from(map.values());
  }

  /** A pair re-oriented so `me` is the first player. */
  function orientPair(pr, me) {
    const flip = pr.a !== me;
    return {
      me, other: flip ? pr.a : pr.b,
      with: pr.with, withPct: pr.withPct, withCalc: pr.withCalc, withGoals: pr.withGoals, withGpg: pr.withGpg,
      vs: { n: pr.vs.n, W: flip ? pr.vs.bW : pr.vs.aW, D: pr.vs.D, L: flip ? pr.vs.aW : pr.vs.bW },
      vsPct: (() => { const d = pr.vs.aW + pr.vs.bW + pr.vs.D; return d ? (flip ? pr.vs.bW : pr.vs.aW) / d : null; })(),
      vsP: pr.vsP,
      vsCalc: (() => { const d = pr.vs.aW + pr.vs.bW + pr.vs.D; return d ? ((flip ? pr.vs.bW : pr.vs.aW) + 0.5 * pr.vs.D) / d : null; })(),
      games: pr.games.map(g => g.together ? g : { ...g, result: flip ? ({ W: 'L', L: 'W' }[g.aResult] || g.aResult) : g.aResult }),
    };
  }

  function pairingsFor(pairs, me) {
    return pairs.filter(p => p.a === me || p.b === me).map(p => orientPair(p, me));
  }

  // ---------------------------------------------------------- data darling

  /**
   * Win-rate impact: a player's win % minus what their team-mates managed in
   * games *without* them, weighted by games shared. Positive = teams do
   * better with them in. Used as a data-led nudge for the subjective award.
   */
  function addImpact(players, pairs) {
    const byName = new Map(players.map(p => [p.name, p]));
    const pairIndex = new Map();
    for (const pr of pairs) pairIndex.set(`${pr.a}\u0000${pr.b}`, pr);
    for (const x of players) {
      let wSum = 0, eSum = 0;
      for (const pr of pairs) {
        if (pr.a !== x.name && pr.b !== x.name) continue;
        if (!pr.with.n) continue;
        const t = byName.get(pr.a === x.name ? pr.b : pr.a);
        if (!t) continue;
        const without = winRate(minus(t.rec, pr.with));
        if (without == null) continue;
        wSum += pr.with.n;
        eSum += pr.with.n * without;
      }
      x.expectedWinPct = wSum ? eSum / wSum : null;
      x.impact = x.winPct != null && x.expectedWinPct != null ? x.winPct - x.expectedWinPct : null;
    }
  }

  // ----------------------------------------------------------------- awards

  // Agreed with the gaffer (Nov 2026): fixed cut-offs, not scaled by season.
  // 12+ apps to qualify for individual awards (11 doesn't count); 8+ games
  // for any pairing (together for Better Together / Gruesome Twosome,
  // decided games against each other for Nemesis); 3+ captaincies.
  // eslint-disable-next-line no-unused-vars
  function defaultThresholds(matchCount) {
    return { minApps: 12, minCaps: 3, minPairGames: 8, minVsGames: 8 };
  }

  const fmt = {
    pg: (v) => (v == null ? '–' : v.toFixed(2)),
    pct: (v) => (v == null ? '–' : `${Math.round(v * 100)}%`),
    signedPct: (v) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))} pts`),
    wdl: (r) => `${r.W}-${r.D}-${r.L}`,
    /** Coloured record, e.g. [10W][4D][5L]; letters keep it readable without colour. */
    wdlHtml: (r) => `<span class="wdl" aria-label="${r.W} won, ${r.D} drawn, ${r.L} lost"><span class="W">${r.W}W</span><span class="D">${r.D}D</span><span class="L">${r.L}L</span></span>`,
    /** Win-rate meter: single-hue bar with the number beside it. */
    meterHtml: (v) => (v == null ? '–' : `<span class="meter"><span class="track" aria-hidden="true"><span class="fill" style="width:${Math.round(v * 100)}%"></span></span><span class="n">${Math.round(v * 100)}%</span></span>`),
    p: (v) => (v == null ? '–' : v < 0.001 ? '<0.001' : v.toFixed(3)),
    span: (s) => (s && s.length ? (s.from.key === s.to.key ? gwLabel(s.from) : `${gwLabel(s.from)} → ${gwLabel(s.to)}`) : ''),
  };

  /** Rank `items` by `value` (desc unless asc), return winners (ties) + top list. */
  function rank(items, value, { asc = false, tiebreak } = {}) {
    const scored = items.map(it => ({ it, v: value(it) })).filter(x => x.v != null && !Number.isNaN(x.v));
    scored.sort((x, y) => (asc ? x.v - y.v : y.v - x.v) || (tiebreak ? tiebreak(x.it, y.it) : 0));
    if (!scored.length) return { winners: [], value: null, ranked: [] };
    const top = scored[0].v;
    const winners = scored.filter(x => Math.abs(x.v - top) < 1e-9).map(x => x.it);
    return { winners, value: top, ranked: scored };
  }

  function computeAwards(matches, opts = {}) {
    const players = buildPlayers(matches);
    const pairs = buildPairs(matches);
    addImpact(players, pairs);
    const t = { ...defaultThresholds(matches.length), ...opts };
    const q = players.filter(p => p.apps >= t.minApps);
    // assist / clean-sheet awards need enough games where those were recorded
    const qA = players.filter(p => p.appsA >= t.minApps);
    const qCS = players.filter(p => p.appsCS >= t.minApps);
    const qCap = players.filter(p => decided(p.cap) >= t.minCaps);
    const qPair = pairs.filter(p => decided(p.with) >= t.minPairGames);
    const qVs = pairs.filter(p => p.vs.aW + p.vs.bW >= t.minVsGames);
    const appsRule = `min ${t.minApps} apps`;

    const names = (list) => list.map(p => p.name);
    const runners = (r, label, val, n = 5) => r.ranked.slice(0, n).map(x => ({ label: label(x.it), value: val(x.it, x.v) }));
    const pairName = (pr) => `${pr.a} & ${pr.b}`;

    const playerAward = (id, name, explanation, value, display, { asc = false, pool = q, rule = appsRule, detail } = {}) => {
      const r = rank(pool, value, { asc, tiebreak: (a, b) => b.apps - a.apps });
      return {
        id, name, explanation, rule,
        winners: names(r.winners),
        value: r.value == null ? '' : display(r.winners[0], r.value),
        detail: r.winners.length && detail ? detail(r.winners[0]) : '',
        runnersUp: runners(r, p => p.name, (p, v) => display(p, v)),
      };
    };

    const awards = [];
    const golden = playerAward('golden-boot', 'Golden Boot', 'Most goals per game', p => p.gpg,
      (p, v) => `${fmt.pg(v)} goals/game`, { detail: p => `${p.goals} goals in ${p.apps} apps` });
    const wooden = playerAward('wooden-boot', 'Wooden Boot', 'Fewest goals per game', p => p.gpg,
      (p, v) => `${fmt.pg(v)} goals/game`, { asc: true, detail: p => `${p.goals} goals in ${p.apps} apps` });
    const aRule = `min ${t.minApps} apps with assists recorded`;
    const assist = playerAward('assist-king', 'Assist King', 'Most assists per game', p => p.apg,
      (p, v) => `${fmt.pg(v)} assists/game`, { pool: qA, rule: aRule, detail: p => `${p.assists} assists in ${p.appsA} apps` });
    const ga = playerAward('g-plus-a', 'G+A', 'Most goals + assists per game (only awarded if different from both Golden Boot and Assist King)',
      p => p.gapg, (p, v) => `${fmt.pg(v)} G+A/game`, { pool: qA, rule: aRule, detail: p => `${Math.round(p.gapg * p.appsA)} G+A in ${p.appsA} apps` });
    const clash = ga.winners.filter(n => golden.winners.includes(n) || assist.winners.includes(n));
    if (clash.length) {
      ga.note = `Not awarded: ${clash.join(', ')} already won ${golden.winners.some(n => clash.includes(n)) ? 'Golden Boot' : 'Assist King'}.`;
      ga.notAwarded = true;
    }
    awards.push(golden, wooden, assist, ga);

    awards.push(
      playerAward('cleanest-sheets', 'Cleanest Sheets', 'Most clean sheets per game', p => p.cspg,
        (p, v) => `${fmt.pg(v)} CS/game · ${fmt.pct(p.csPct)} of games`, { pool: qCS, rule: `min ${t.minApps} apps with clean sheets recorded`, detail: p => `${p.cs} clean sheets in ${p.appsCS} apps` }),
      playerAward('soiled-sheets', 'Soiled Sheets', 'Fewest clean sheets per game', p => p.cspg,
        (p, v) => `${fmt.pg(v)} CS/game · ${fmt.pct(p.csPct)} of games`, { asc: true, pool: qCS, rule: `min ${t.minApps} apps with clean sheets recorded`, detail: p => `${p.cs} clean sheets in ${p.appsCS} apps` }),
      playerAward('armband-anchor', 'Armband Anchor', 'Highest win rate as captain', p => p.capWinPct,
        (p, v) => `${fmt.pct(v)} as captain`, { pool: qCap, rule: `min ${t.minCaps} captaincies`, detail: p => `${fmt.wdl(p.cap)} (W-D-L)` }),
      playerAward('asleep-at-the-wheel', 'Asleep at the Wheel', 'Lowest win rate as captain', p => p.capWinPct,
        (p, v) => `${fmt.pct(v)} as captain`, { asc: true, pool: qCap, rule: `min ${t.minCaps} captaincies`, detail: p => `${fmt.wdl(p.cap)} (W-D-L)` }),
      playerAward('winners-always-win', 'Winners Always Win', 'Highest win %', p => p.winPct,
        (p, v) => `${fmt.pct(v)} win rate`, { detail: p => `${fmt.wdl(p.rec)} (W-D-L)` }),
    );

    const pairAward = (id, name, explanation, asc) => {
      const r = rank(qPair, p => p.withPct, { asc, tiebreak: (a, b) => decided(b.with) - decided(a.with) });
      return {
        id, name, explanation, rule: `min ${t.minPairGames} games together`,
        winners: r.winners.map(pairName),
        value: r.value == null ? '' : `${fmt.pct(r.value)} together`,
        detail: r.winners.length ? `${fmt.wdl(r.winners[0].with)} (W-D-L) in ${r.winners[0].with.n} games` : '',
        runnersUp: runners(r, pairName, (p, v) => `${fmt.pct(v)} · ${fmt.wdl(p.with)}`),
      };
    };
    awards.push(pairAward('better-together', 'Better Together', 'Highest win % as a pair', false),
      pairAward('gruesome-twosome', 'Gruesome Twosome', 'Lowest win % as a pair', true));

    const streakAward = (id, name, explanation, kind, unit) => {
      const r = rank(players, p => p.streaks[kind].length || null, { tiebreak: (a, b) => b.apps - a.apps });
      return {
        id, name, explanation, rule: 'all players',
        winners: names(r.winners),
        value: r.value == null ? '' : `${r.value} ${unit}`,
        detail: r.winners.map(p => `${p.name}: ${fmt.span(p.streaks[kind])}`).join(' · '),
        runnersUp: runners(r, p => p.name, (p, v) => `${v} · ${fmt.span(p.streaks[kind])}`),
      };
    };
    awards.push(
      streakAward('rainbow-road', 'Rainbow Road', 'Longest win streak', 'win', 'wins in a row'),
      streakAward('jamie-vardy', 'Jamie Vardy Award', 'Longest scoring streak', 'scoring', 'games in a row scoring'),
      streakAward('skid-mark', 'Skid Mark', 'Longest losing streak', 'loss', 'losses in a row'),
    );

    awards.push(playerAward('data-darling', 'Data Darling',
      'Subjective. Data nudge: biggest win-rate impact, i.e. their win % minus what their team-mates win without them',
      p => p.impact, (p, v) => fmt.signedPct(v),
      { detail: p => `wins ${fmt.pct(p.winPct)} vs team-mates' ${fmt.pct(p.expectedWinPct)} without them` }));
    awards[awards.length - 1].subjective = true;

    const nem = rank(qVs, p => -Math.log10(Math.max(p.vsP, 1e-12)), {
      tiebreak: (a, b) => Math.abs(b.vs.aW - b.vs.bW) - Math.abs(a.vs.aW - a.vs.bW),
    });
    const nemLine = (p) => {
      const [hi, lo, hiW, loW] = p.vs.aW >= p.vs.bW ? [p.a, p.b, p.vs.aW, p.vs.bW] : [p.b, p.a, p.vs.bW, p.vs.aW];
      return `${hi} ${hiW}–${loW} ${lo}${p.vs.D ? ` (${p.vs.D} D)` : ''}`;
    };
    awards.push({
      id: 'nemesis', name: 'Nemesis', explanation: 'The two players with the most statistically significant win/loss record when on opposite teams',
      rule: `min ${t.minVsGames} decided games against each other; exact binomial test`,
      winners: nem.winners.map(pairName),
      value: nem.winners.length ? nemLine(nem.winners[0]) : '',
      detail: nem.winners.length ? `p = ${fmt.p(nem.winners[0].vsP)}${nem.winners[0].vsP >= 0.05 ? ' (not significant at 5%)' : ''}` : '',
      runnersUp: runners(nem, pairName, p => `${nemLine(p)} · p=${fmt.p(p.vsP)}`),
    });

    return { awards, players, pairs, thresholds: t };
  }

  // ------------------------------------------------------------- UI helpers

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Sortable table. columns: [{key, label, value(row) -> sortable, html(row) -> cell html,
   * num?: bool, title?: string, sticky?: bool}]. Click a header to sort; click again to flip.
   */
  function sortableTable(container, columns, rows, { sortKey, desc = true, rowAttrs, caption } = {}) {
    const state = { key: sortKey || columns[0].key, desc };
    function render() {
      const col = columns.find(c => c.key === state.key) || columns[0];
      const sorted = rows.slice().sort((a, b) => {
        const va = col.value(a), vb = col.value(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
        return state.desc ? -cmp : cmp;
      });
      container.innerHTML = `
        <table class="data">
          ${caption ? `<caption>${caption}</caption>` : ''}
          <thead><tr>${columns.map(c => `
            <th scope="col" class="${c.num ? 'num' : ''} ${c.sticky ? 'sticky-col' : ''}"
                aria-sort="${c.key === state.key ? (state.desc ? 'descending' : 'ascending') : 'none'}"
                ${c.title ? `title="${escapeHtml(c.title)}"` : ''}>
              <button type="button" data-sort="${c.key}">${c.label}<span class="sort-ind" aria-hidden="true">${c.key === state.key ? (state.desc ? '▾' : '▴') : ''}</span></button>
            </th>`).join('')}</tr></thead>
          <tbody>${sorted.map(r => `<tr ${rowAttrs ? rowAttrs(r) : ''}>${columns.map(c =>
            `<td class="${c.num ? 'num' : ''} ${c.sticky ? 'sticky-col' : ''}">${c.html ? c.html(r) : escapeHtml(c.value(r) ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;
    }
    container.onclick = (e) => {
      const btn = e.target.closest('button[data-sort]');
      if (!btn) return;
      const key = btn.dataset.sort;
      if (state.key === key) state.desc = !state.desc;
      else { state.key = key; state.desc = typeof (columns.find(c => c.key === key).value(rows[0] || {})) !== 'string'; }
      render();
    };
    render();
    return { rows: () => rows, columns };
  }

  // ----------------------------------------------------------------- venues

  /** One player's record per venue (games with no venue are counted separately). */
  function venueSplit(games) {
    const map = new Map();
    let unknown = 0;
    for (const g of games) {
      if (!g.venue) { unknown += 1; continue; }
      if (!map.has(g.venue)) map.set(g.venue, { venue: g.venue, rec: record(), goals: 0 });
      const v = map.get(g.venue);
      addResult(v.rec, g.result);
      v.goals += g.goals;
    }
    const rows = Array.from(map.values()).map(v => ({ ...v, winPct: winRate(v.rec), winCalc: winCalc(v.rec), gpg: v.goals / v.rec.n }));
    return { rows: rows.sort((a, b) => b.rec.n - a.rec.n), unknown };
  }

  /** Squad-level view of each venue: goals per match, top scorer, best record there. */
  function venueTable(matches, players, minGames = 3) {
    const map = new Map();
    for (const m of matches) {
      if (!m.venue) continue;
      if (!map.has(m.venue)) map.set(m.venue, { venue: m.venue, n: 0, goals: 0, draws: 0 });
      const v = map.get(m.venue);
      v.n += 1;
      v.goals += (m.team1_goals || 0) + (m.team2_goals || 0);
      if (m.team1_result === 'D') v.draws += 1;
    }
    for (const v of map.values()) {
      const per = players.map(p => {
        const gs = p.games.filter(g => g.venue === v.venue);
        const rec = record();
        gs.forEach(g => addResult(rec, g.result));
        return { name: p.name, n: gs.length, goals: gs.reduce((s, g) => s + g.goals, 0), rec, winPct: winRate(rec) };
      }).filter(x => x.n);
      const scorer = per.slice().sort((a, b) => b.goals - a.goals || a.n - b.n)[0];
      const best = per.filter(x => decided(x.rec) >= minGames).sort((a, b) => b.winPct - a.winPct || b.n - a.n)[0];
      Object.assign(v, { gpm: v.goals / v.n, drawPct: v.draws / v.n, scorer, best, regulars: per.length });
    }
    return { rows: Array.from(map.values()).sort((a, b) => b.n - a.n), unknown: matches.filter(m => !m.venue).length };
  }

  // ------------------------------------------------------ data-quality notes
  /**
   * Plain-English caveats for the matches in scope: which stats the
   * scorecards didn't record, and source-sheet slips we know about.
   * Returns [] when there's nothing to say (e.g. 2026 alone).
   */
  const KNOWN_SLIPS = [
    [2024, 7, 'Jan'], [2024, 9, 'Jay'], [2024, 40, 'Joe'],
    [2025, 5, 'LG'], [2025, 24, 'Dave & Gman'], [2025, 32, 'Bill'],
  ];
  function dataNotes(matches) {
    const notes = [];
    const old = Array.from(new Set(matches.filter(m => !tracks(m).has('assists')).map(m => m.year))).sort();
    if (old.length) {
      notes.push(`${old.join(' & ')} scorecards recorded teams, goals and results only: no assists, clean sheets or captains. ` +
        'Those stats and their awards cover 2026 onward, and per-game figures use only games where they were recorded.');
      notes.push('Older sheets were typed by hand after the fact and some entries look off, so treat 2024/25 numbers as approximate.');
    }
    const years = new Set(matches.map(m => m.year));
    const slips = KNOWN_SLIPS.filter(([y]) => years.has(y));
    if (slips.length) {
      notes.push(`Same name on both teams in the source sheet (kept as recorded): ${slips.map(([y, g, n]) => `${y} GW${g} (${n})`).join(', ')}.`);
    }
    const noVenue = matches.filter(m => !m.venue).length;
    if (noVenue > matches.length * 0.2) notes.push(`${noVenue} of ${matches.length} matches have no venue recorded.`);
    return notes;
  }

  // ------------------------------------------------------------ theme toggle
  // Cycles auto -> light -> dark. "auto" follows the OS. Stored per browser.
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: 'Auto', light: 'Light', dark: 'Dark' };
  const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
  function getTheme() {
    try { return THEMES.includes(localStorage.getItem('effra-theme')) ? localStorage.getItem('effra-theme') : 'auto'; } catch { return 'auto'; }
  }
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  function mountThemeToggle(btn) {
    const paint = () => {
      const t = getTheme();
      btn.innerHTML = `<span aria-hidden="true">${THEME_ICON[t]}</span><span class="theme-label">${THEME_LABEL[t]}</span>`;
      btn.setAttribute('aria-label', `Theme: ${THEME_LABEL[t]}. Click to change.`);
    };
    btn.addEventListener('click', () => {
      const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
      try { localStorage.setItem('effra-theme', next); } catch { /* private mode: still switch for this view */ }
      applyTheme(next);
      paint();
    });
    paint();
  }

  function toCsv(columns, rows) {
    const cell = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [columns.map(c => cell(c.csvLabel || c.label.replace(/<[^>]+>/g, ''))).join(','),
      ...rows.map(r => columns.map(c => cell(c.csv ? c.csv(r) : c.value(r))).join(','))].join('\n');
  }

  function downloadText(filename, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  root.Effra = {
    isPlayerName, byChrono, matchKey, gwLabel, seasons, filterBySeason, tracks, dataNotes, venueSplit, venueTable,
    record, addResult, decided, winRate, winCalc, sideResult, roster, ownGoals,
    buildPlayers, buildPairs, orientPair, pairingsFor, binomialP, addImpact,
    defaultThresholds, computeAwards, fmt,
    escapeHtml, sortableTable, toCsv, downloadText, mountThemeToggle, applyTheme, getTheme,
  };
})(typeof window !== 'undefined' ? window : globalThis);

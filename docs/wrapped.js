/*
 * Season Wrapped: a tap-through, story-style reveal of one player's season,
 * written like the group chat would write it.
 *
 * Built entirely from the shared engine (Effra), so every number matches the
 * site. Awards only appear for finished seasons so awards night isn't spoilt.
 * Banter lines are picked from pools by how good/bad the stat is, seeded per
 * player + season, so everyone gets different lines and replays are stable.
 *
 * Controls: tap right / → / Space = next, tap left / ← = back, Esc = close.
 * Share: a 1080×1920 story image via the phone's share sheet (Instagram,
 * WhatsApp...), or a PNG download where sharing files isn't supported.
 */
(function (root) {
  'use strict';
  const E = root.Effra;
  const esc = (v) => E.escapeHtml(v);
  const fmt = E.fmt;

  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  // ---------------------------------------------------------------- banter

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** Stable pick per player/season/slot, so lines differ between players but not between replays. */
  const picker = (seed) => (slot, lines) => lines[hash(`${seed}|${slot}`) % lines.length];

  const LINES = {
    intro: [
      'Let’s see if you were actually any good.',
      'The numbers don’t lie. Unlike you in the group chat.',
      'Grab a pint. Some of this is going to sting.',
      'You asked for this. Well, someone did.',
      'Brought to you by the Effra Debtsheet. Settle up.',
      'Officially sanctioned by the Godking of Effra.',
      'Christmas jumper optional. Bib mandatory.',
    ],
    appsHigh: [
      'Do you even have a job?',
      'Your other half must love Tuesdays and Thursdays.',
      'Never misses. Turning up, that is.',
      'More reliable than the actual pitch booking.',
      'Top of the poll every single week.',
      'Never once claimed first sub. Allegedly.',
    ],
    appsMid: [
      'Turns up when it suits. Fair enough.',
      'Reliable. Like a Southern Rail timetable.',
      'Present enough to have an opinion on the teams.',
      'Five mins late, first sub please. Classic.',
      'Your poll replies have been noted by the gaffer.',
    ],
    appsLow: [
      'Part-time hero. Heavy emphasis on part-time.',
      'Seen less often than a ref at 5-a-side.',
      'Treats the WhatsApp poll as a suggestion.',
      'Squad rotation, he calls it.',
      'Permanent first-reserve energy.',
      'Paid your fiver, didn’t play. First pay, first play, mate.',
    ],
    goalsTop: [
      'Never passed when shooting was an option. Correctly, it turns out.',
      'Ball hog? He prefers “clinical”.',
      'The goal frame has a restraining order out.',
      'Somebody said you’d never win the Golden Boot again. Somebody was wrong.',
      'Haaland-Bot-3000 has nothing on you.',
    ],
    goalsGood: [
      'Respectable. Not that you’ll shut up about it.',
      'A genuine threat. Occasionally.',
      'Decent return. The other 90% were “unlucky”.',
    ],
    goalsLow: [
      'Your shooting boots are still in the box they came in.',
      'Heard you’re “more of a creative player”.',
      'Goals are overrated anyway. Right?',
      'Hit the target more often in the pub quiz.',
      'Haaland-Bot-3000 you are not.',
      'Fewer goals than Cape Verde, a country of about half a million.',
    ],
    goalsNone: [
      'Not one. The strikers’ union has been notified.',
      'Zero. The own-goal column outscored you.',
      'A goal-shy season. Goal-terrified, really.',
    ],
    bestDay: [
      'Absolute worldie of a shift.',
      'Still talking about it, aren’t you.',
      'Peaked early? Peaked, anyway.',
    ],
    assistsHigh: [
      'Selfless. Or just can’t finish. We’ll never know.',
      'Everyone else’s highlight reel starts with you.',
      'Pass master. Ball doesn’t stick, but in a good way.',
    ],
    assistsLow: [
      'Passing appears to be optional for you.',
      'Treats the ball like it owes him money.',
      'Assists? Never heard of her.',
    ],
    winGlory: ['Glory hunter.', 'Whatever team you’re on, it wins. Suspicious.', 'Born winner. Insufferable with it.',
      'Pure Pop Brixton energy: loud, sweaty, winning.',
    ],
    winGood: ['Comfortably above average. Comfortably.', 'More Ws than Ls. Frame it.', 'Solid. Not spectacular. Very Championship.'],
    winCoin: ['Coin-flip merchant.', 'Perfectly average. Like a Wetherspoons breakfast.', 'You win some, you lose some. Mostly some.'],
    winBad: [
      'Statistically, your team-mates should ask for a transfer.',
      'Bad luck? Sure. Every week? Hmm.',
      'The kiss of death in a bib.',
      'Teams pick you to make it fair. On the other lot.',
      'Even Cape Verde had a better tournament.',
      'Bib him.',
    ],
    lossRun: ['Even Spurs fans winced.', 'A proper slump. Character building, apparently.', 'Did you check the boots were on the right feet?',
      'Longer run of misery than an England penalty shoot-out.',
      'VAR’s fault, obviously.',
    ],
    winRun: ['Unstoppable. Briefly.', 'Prime Ronaldo energy. For about a fortnight.', 'Couldn’t lose if you tried. And you didn’t try.',
      'Further than England got. Just about.',
    ],
    partner: ['Get a room.', 'Bromance of the season.', 'Should be playing in matching boots.', 'Telepathic. Or just both very good. Unclear.',
      'Book them a table at the Leyton Star.',
      'Matching bibs. Matching smiles.',
    ],
    avoid: ['Keep these two apart. For everyone’s sake.', 'Chemistry of a wet weekend in Rhyl.', 'Never again.'],
    nemesis: ['Lives in your head rent-free.', 'You’d swap teams to avoid him. Admit it.', 'Pure kryptonite.', 'Your Prime Minister. He owns you.',
      'Reported to Infantino. Nothing will be done.',
    ],
    victim: ['Your personal punchbag.', 'Feels bad for him. Not that bad.', 'Free three points.'],
    capGood: ['Born leader. Unbearable about it, presumably.', 'Armband suits you. Annoyingly.', 'Gaffer material. Don’t let it go to your head.',
      'Godking-of-Effra levels of leadership.',
    ],
    capMid: ['Wore it. That’s about all.', 'Captain by name.'],
    capBad: ['Picking teams isn’t your calling. Neither is leading them.', 'Captain? More like passenger.', 'Hand it back.',
      'Picked teams like a corrupt FIFA official.',
    ],
    awardsNone: ['No silverware. Not even a participation medal.', 'Trophy cabinet: still flat-packed.', 'The awards committee had other ideas.',
      'Not even Fastest Pint. Come on.',
    ],
    awardsSome: ['Cabinet’s filling up.', 'Make room on the mantelpiece.', 'Insufferable at the awards night. Guaranteed.'],
    outro: ['Same again next season? Lower the bar, maybe.', 'Screenshot this. Lord it over the chat.', 'Nobody asked. Share it anyway.',
      'See you at the Leyton Star.',
      'Bank details in the group. You know the drill.',
      'Bibs sponsored by Enron. Season sponsored by you.',
    ],
  };

  // World Cup 2026 sweepstake draw (from Crell's daily previews in the group).
  const SWEEP = {
    Ben: ['Switzerland', 'Jordan', 'Bosnia'], Bill: ['Sweden', 'Germany'], Char: ['Netherlands', 'Turkey'],
    Crell: ['Portugal', 'South Korea', 'DR Congo'], Dan: ['Argentina', 'Czechia'], Dave: ['Iraq', 'USA'],
    Davis: ['France', 'Curacao'], Gman: ['Morocco', 'Uzbekistan'], JPH: ['Croatia', 'Austria'],
    Jay: ['Australia', 'Belgium', 'Ecuador'], Jez: ['Ivory Coast', 'Japan', 'Paraguay'],
    Joe: ['Senegal', 'Saudi Arabia', 'New Zealand'], Joel: ['Brazil', 'Tunisia'],
    Kempy: ['England', 'Norway', 'Panama'], LG: ['Egypt', 'Mexico'], Leo: ['Colombia', 'Haiti'],
    Luke: ['Cape Verde', 'Ghana'], Nairn: ['Scotland'], Thorny: ['Uruguay', 'Canada', 'Algeria'],
    'Will Mac': ['South Africa', 'Iran'],
  };
  const SWEEP_LINES = {
    England: 'England <i>and</i> Norway. Haaland-Bot-3000 on your side and still no £75.',
    Iraq: 'Drew the worst team in the tournament, got your fiver back. Technically a win.',
    'Cape Verde': 'Cape Verde. Turned the whole group into Cape Verde fans. You’re welcome.',
    Scotland: 'Scotland. Five quid on hope. Classic.',
    Spain: 'Spain. Took the lot.',
  };
  const SWEEP_GENERIC = [
    'Didn’t win the £75. Didn’t win much else either.',
    'Five quid well spent. Probably.',
    'Carried through the group stage by Crell’s match previews.',
    'Blame the draw. Jez definitely didn’t fix it.',
  ];

  // Headlines are the hype; the sarcasm lives in the lines underneath.
  const HEADS = {
    apps: ['Reporting for duty', 'Clocking in', 'Turning up like a pro', 'Boots on, every week'],
    goals: ['Back of the net', 'Goal machine mode', 'Ball meets net', 'Bang! And again'],
    goalsNone: ['Saving them for next season', 'Goals loading…', 'The best is yet to come'],
    assists: ['Provider-in-chief', 'Gift-wrapped goals', 'The creator', 'Assist o’clock'],
    winUp: ['Winning feeling', 'Ws collected', 'Results, baby', 'Victory lap'],
    winDown: ['Every loss is a lesson', 'Character-building season', 'Plenty of learning'],
    runUp: ['On fire', 'Hot streak', 'Unstoppable run', 'Can’t stop, won’t stop'],
    runDown: ['The comeback starts here', 'Rock bottom (bounce incoming)', 'Only up from here'],
    partner: ['Dream team', 'Partner in crime', 'Perfect match', 'Double act'],
    nemesis: ['Arch-rival', 'Your final boss', 'The one to beat'],
    victim: ['Your favourite opponent', 'Easy pickings', 'Happy hunting ground'],
    captain: ['Armband energy', 'Skipper mode', 'Leader of the pack'],
    awards: ['Trophy time', 'Silverware check', 'The cabinet'],
    type: ['Scouting report says…', 'And your player type is…', 'The verdict is in'],
  };

  // Player "type": the stat they're most exceptional at among regulars.
  const TYPES = [
    { key: 'gpg', name: 'The Finisher', line: 'Goals follow you around. So does your ego.' },
    { key: 'apg', name: 'The Playmaker', line: 'Does all the work so someone else can celebrate.' },
    { key: 'cspg', name: 'The Brick Wall', line: 'Nothing gets past. Not even banter.' },
    { key: 'winPct', name: 'The Winner', line: 'Whatever team you’re on wins. We’re checking the bibs.' },
    { key: 'impact', name: 'The Lucky Charm', line: 'Teams win more with you in. Nobody can explain why.' },
  ];
  const STAT_NAME = { gpg: 'goals per game', apg: 'assists per game', cspg: 'clean sheets per game', winPct: 'win rate', impact: 'win impact' };

  function percentile(pool, key, v) {
    const vals = pool.map(p => p[key]).filter(x => x != null);
    if (v == null || !vals.length) return null;
    return (vals.filter(x => x < v - 1e-12).length + 0.5 * vals.filter(x => Math.abs(x - v) <= 1e-12).length) / vals.length;
  }

  /** 1-based rank of `name` among `pool` by `value` (desc), with pool size. */
  function rankOf(pool, name, value) {
    const vals = pool.map(p => ({ n: p.name, v: value(p) })).filter(x => x.v != null);
    const me = vals.find(x => x.n === name);
    if (!me) return null;
    return { rank: vals.filter(x => x.v > me.v).length + 1, of: vals.length };
  }
  const rankText = (r, what) => (r ? `${r.rank === 1 ? 'The most' : `${ordinal(r.rank)} most`} ${what} in the squad` : '');

  // ---------------------------------------------------------------- slides

  /**
   * Build the slides for one player. ctx = { matches, players, pairs, t,
   * year ('all' | '2026' ...), latestYear }.
   */
  function build(name, ctx) {
    const p = ctx.players.find(x => x.name === name);
    if (!p) return null;
    const say = picker(`${name}|${ctx.year}`);
    const seasonName = ctx.year === 'all' ? 'All-time' : ctx.year;
    const all = ctx.players;
    const regulars = all.filter(x => x.apps >= ctx.t.minApps);
    const pool = regulars.length >= 3 ? regulars : all;
    const slides = [];
    const first = p.games[0], last = p.games[p.games.length - 1];
    const pct = (key) => percentile(pool, key, p[key]);

    // 0. club splash: the crest drops in, then auto-advances
    slides.push({ theme: 'splash', splash: true, kicker: 'Effra Rovers FC presents', big: `${esc(seasonName)}<br>Wrapped`, unit: '' });

    // 1. intro
    slides.push({
      theme: 'brand', kicker: `${seasonName} Wrapped`, big: esc(p.name),
      sub: ctx.year === 'all' ? 'Every game you’ve played for Effra Rovers.' : `Your ${ctx.year} season at Effra Rovers.`,
      extra: say('intro', LINES.intro),
    });

    // 2. appearances
    const rApps = rankOf(all, name, x => x.apps);
    const appsBand = rApps && rApps.rank <= 3 ? 'appsHigh' : p.apps < ctx.t.minApps ? 'appsLow' : 'appsMid';
    slides.push({
      theme: 'navy', kicker: say('h-apps', HEADS.apps), big: `${p.apps}`, unit: p.apps === 1 ? 'appearance' : 'appearances',
      sub: `${rankText(rApps, 'appearances')}. First game ${E.gwLabel(first)}${p.apps > 1 ? `, last seen ${E.gwLabel(last)}` : ''}.`,
      extra: say('apps', LINES[appsBand]),
    });

    // 3. goals + best game
    const rGoals = rankOf(all, name, x => x.goals);
    const gPct = pct('gpg');
    const goalsBand = p.goals === 0 ? 'goalsNone' : rGoals && rGoals.rank <= 2 ? 'goalsTop' : (gPct ?? 0) >= 0.5 ? 'goalsGood' : 'goalsLow';
    const bestGame = p.games.slice().sort((a, b) => b.goals - a.goals || E.byChrono(b, a))[0];
    slides.push({
      theme: 'gold', kicker: say('h-goals', HEADS[p.goals ? 'goals' : 'goalsNone']), big: `${p.goals}`, unit: p.goals === 1 ? 'goal' : 'goals',
      sub: p.goals ? `That’s ${fmt.pg(p.gpg)} a game. ${rankText(rGoals, 'goals')}.` : 'Nil. Nada. Zilch.',
      extra: [
        say('goals', LINES[goalsBand]),
        bestGame && bestGame.goals >= 3
          ? `Best day: <b>${bestGame.goals} goals</b> in ${esc(E.gwLabel(bestGame))}${bestGame.venue ? ` at ${esc(bestGame.venue)}` : ''} (${bestGame.result === 'W' ? 'won' : bestGame.result === 'L' ? 'lost, somehow,' : 'drew'} ${bestGame.teamGoals}–${bestGame.oppGoals}). ${say('bestDay', LINES.bestDay)}`
          : '',
      ].filter(Boolean).join('<br><br>'),
    });

    // 4. assists (only where tracked)
    if (p.appsA) {
      const rA = rankOf(all.filter(x => x.appsA), name, x => x.assists);
      const aPct = pct('apg');
      slides.push({
        theme: 'brand', kicker: say('h-assists', HEADS.assists), big: `${p.assists}`, unit: p.assists === 1 ? 'assist' : 'assists',
        sub: `That’s ${fmt.pg(p.apg)} a game. ${rankText(rA, 'assists')}.`,
        extra: [say('assists', LINES[(aPct ?? 0) >= 0.5 ? 'assistsHigh' : 'assistsLow']),
          p.appsA < p.apps ? `<span class="w-note">Assists only recorded for ${p.appsA} of your ${p.apps} games.</span>` : ''].filter(Boolean).join('<br><br>'),
      });
    }

    // 5. record + biggest win
    const rWin = rankOf(pool, name, x => x.winPct);
    const w = p.winPct ?? 0;
    const winBand = w >= 0.6 ? 'winGlory' : w >= 0.5 ? 'winGood' : w >= 0.4 ? 'winCoin' : 'winBad';
    const bigWin = p.games.filter(g => g.result === 'W' && g.teamGoals != null)
      .sort((a, b) => (b.teamGoals - b.oppGoals) - (a.teamGoals - a.oppGoals))[0];
    slides.push({
      theme: w >= 0.5 ? 'win' : 'loss', kicker: say('h-win', HEADS[w >= 0.5 ? 'winUp' : 'winDown']), big: fmt.pct(p.winPct), unit: 'games won',
      sub: `${fmt.wdlHtml(p.rec)}${p.apps >= ctx.t.minApps && rWin ? ` · ${rWin.rank === 1 ? 'the best' : `${ordinal(rWin.rank)} best`} win rate among regulars` : ''}`,
      extra: [say('win', LINES[winBand]),
        bigWin ? `Biggest win: <b>${bigWin.teamGoals}–${bigWin.oppGoals}</b> in ${esc(E.gwLabel(bigWin))}.` : 'Still waiting on that first win…'].join('<br><br>'),
    });

    // 6. streaks
    const s = p.streaks;
    slides.push({
      theme: s.loss.length > s.win.length ? 'loss' : 'navy',
      kicker: say('h-run', HEADS[s.loss.length > s.win.length ? 'runDown' : 'runUp']),
      big: `${Math.max(s.win.length, s.loss.length)}`,
      unit: s.loss.length > s.win.length ? 'losses in a row' : (s.win.length === 1 ? 'win in a row' : 'wins in a row'),
      sub: s.loss.length > s.win.length
        ? `Your worst run: ${esc(fmt.span(s.loss))}. Best winning run? ${s.win.length}.`
        : s.win.length ? `Your best winning run: ${esc(fmt.span(s.win))}.` : '',
      extra: [
        s.loss.length > s.win.length ? say('loss', LINES.lossRun) : s.win.length >= 5 ? say('winrun', LINES.winRun) : '',
        s.scoring.length >= 3 ? `Scored in <b>${s.scoring.length}</b> straight games (${esc(fmt.span(s.scoring))}).` : '',
        s.loss.length >= 4 && s.loss.length <= s.win.length ? `We won’t mention the <b>${s.loss.length}</b> losses in a row. Oh.` : '',
      ].filter(Boolean).join('<br><br>'),
    });

    // 7. best partner / 8. nemesis
    const mine = E.pairingsFor(ctx.pairs, name);
    const minPair = Math.min(ctx.t.minPairGames, Math.max(3, Math.round(p.apps / 4)));
    const partners = mine.filter(r => E.decided(r.with) >= minPair).sort((a, b) => b.withPct - a.withPct || b.with.n - a.with.n);
    if (partners.length) {
      const bp = partners[0];
      const worst = partners[partners.length - 1];
      slides.push({
        theme: 'win', kicker: say('h-partner', HEADS.partner), big: esc(bp.other), unit: '',
        sub: `Your best partner. Together: ${fmt.wdlHtml(bp.with)}, <b>${fmt.pct(bp.withPct)}</b> in ${bp.with.n} games. ${say('partner', LINES.partner)}`,
        extra: worst && worst.other !== bp.other && worst.withPct < (bp.withPct ?? 0)
          ? `Worst partner: <b>${esc(worst.other)}</b>, ${fmt.pct(worst.withPct)} together. ${say('avoid', LINES.avoid)}` : '',
      });
    }
    const minVs = Math.min(ctx.t.minVsGames, Math.max(3, Math.round(p.apps / 4)));
    const rivals = mine.filter(r => r.vs.W + r.vs.L >= minVs);
    const nemesis = rivals.slice().sort((a, b) => (a.vsPct ?? 1) - (b.vsPct ?? 1) || b.vs.n - a.vs.n)[0];
    const victim = rivals.slice().sort((a, b) => (b.vsPct ?? 0) - (a.vsPct ?? 0) || b.vs.n - a.vs.n)[0];
    if (nemesis && (nemesis.vsPct ?? 1) < 0.5) {
      slides.push({
        theme: 'loss', kicker: say('h-nem', HEADS.nemesis), big: esc(nemesis.other), unit: '',
        sub: `Your nemesis. Against him you’re ${fmt.wdlHtml(nemesis.vs)}: ${fmt.pct(nemesis.vsPct)}. ${say('nemesis', LINES.nemesis)}`,
        extra: victim && victim.other !== nemesis.other && (victim.vsPct ?? 0) > 0.5
          ? `Silver lining: you own <b>${esc(victim.other)}</b> (${fmt.wdlHtml(victim.vs)}). ${say('victim', LINES.victim)}` : '',
      });
    } else if (victim && (victim.vsPct ?? 0) > 0.5) {
      slides.push({
        theme: 'win', kicker: say('h-victim', HEADS.victim), big: esc(victim.other), unit: '',
        sub: `Against him you’re ${fmt.wdlHtml(victim.vs)}: ${fmt.pct(victim.vsPct)}. ${say('victim', LINES.victim)}`,
        extra: 'No nemesis. Nobody scares you. Yet.',
      });
    }

    // 9. captaincy
    if (p.cap.n) {
      const cw = p.capWinPct ?? 0;
      slides.push({
        theme: 'gold', kicker: say('h-cap', HEADS.captain), big: `${p.cap.n}`, unit: p.cap.n === 1 ? 'game as captain' : 'games as captain',
        sub: `With the armband: ${fmt.wdlHtml(p.cap)}, a <b>${fmt.pct(p.capWinPct)}</b> win rate.`,
        extra: say('cap', LINES[cw >= 0.6 ? 'capGood' : cw <= 0.35 ? 'capBad' : 'capMid']),
      });
    }

    // 10. awards: the real ones from awards night (accolades.json) for
    // finished seasons or all-time; never the live season, so no spoilers.
    const finished = ctx.year !== 'all' && Number(ctx.year) < Number(ctx.latestYear);
    const real = Array.isArray(ctx.accolades) && ctx.accolades.length
      ? ctx.accolades.filter(a => a.winners.includes(name) && (ctx.year === 'all' || a.season === Number(ctx.year)))
      : null;
    if (finished || (ctx.year === 'all' && real && real.length)) {
      const ICON = { trophy: '🏆', medal: '🏅', booby: '🥄' };
      const won = real ?? E.computeAwards(ctx.matches).awards
        .filter(a => !a.notAwarded && a.winners.some(x => x === name || x.split(' & ').includes(name)))
        .map(a => ({ award: a.name, kind: 'trophy' }));
      const shown = won.slice(0, 7);
      const boobies = won.filter(a => a.kind === 'booby').length;
      slides.push({
        theme: 'gold', kicker: say('h-awards', HEADS.awards), big: `${won.length}`, unit: won.length === 1 ? 'award' : 'awards',
        sub: shown.map(a => `${ICON[a.kind] || '🏆'} <b>${esc(a.award)}</b>${ctx.year === 'all' && a.season ? ` <span class="w-note">’${String(a.season).slice(2)}</span>` : ''}`).join('<br>')
          + (won.length > shown.length ? `<br><span class="w-note">…and ${won.length - shown.length} more</span>` : ''),
        extra: boobies && boobies === won.length ? 'All wooden spoons. Still counts. Sort of.' : say('awards', LINES[won.length ? 'awardsSome' : 'awardsNone']),
      });
    }

    // 10b. World Cup 2026 sweepstake (2026 and all-time Wrapped only)
    const drew = SWEEP[name];
    if (drew && (ctx.year === 'all' || ctx.year === '2026')) {
      const special = drew.map(t => SWEEP_LINES[t]).find(Boolean);
      slides.push({
        theme: 'navy', kicker: 'World Cup 2026 sweepstake', big: esc(drew[0]), unit: '',
        sub: drew.length > 1 ? `Also drew: ${drew.slice(1).map(esc).join(' &amp; ')}.` : 'One team. All eggs, one basket.',
        extra: special || say('sweep', SWEEP_GENERIC),
      });
    }

    // 11. player type
    const scored = TYPES.map(t => ({ ...t, pct: pct(t.key) })).filter(t => t.pct != null);
    const top = scored.slice().sort((a, b) => b.pct - a.pct)[0];
    const winP = pct('winPct'), impP = pct('impact');
    let type;
    if (top && top.pct >= 0.6) type = top;
    else if (winP != null && impP != null && winP <= 0.2 && impP <= 0.2) {
      type = { name: 'The Liability', line: 'Teams do better without you. The data’s been very clear.', pct: null };
    } else if (rApps && rApps.rank <= 3) type = { name: 'The Ever-Present', line: 'Rain or shine, there you are. Bless.', pct: null };
    else type = { name: 'The Squad Player', line: 'Every team needs one. Apparently.', pct: null };
    slides.push({
      theme: type.name === 'The Liability' ? 'loss' : 'brand', kicker: say('h-type', HEADS.type), big: esc(type.name), unit: '',
      sub: type.line,
      extra: type.pct != null ? `Top ${Math.max(1, Math.round((1 - type.pct) * 100))}% of regulars for ${STAT_NAME[type.key]}.` : '',
    });

    // 12. summary
    const tiles = [
      ['Apps', p.apps], ['Goals', p.goals], p.appsA ? ['Assists', p.assists] : ['Goals/game', fmt.pg(p.gpg)],
      ['Win rate', fmt.pct(p.winPct)], ['Best run', `${s.win.length}W`],
      partners[0] ? ['Best partner', partners[0].other] : ['Worst run', `${s.loss.length}L`],
    ];
    const outro = say('outro', LINES.outro);
    slides.push({
      theme: 'summary', kicker: `${esc(p.name)} · ${seasonName}`, big: esc(type.name), unit: '',
      summary: tiles.map(([k, v]) => [k, esc(v)]), share: true, extra: outro,
    });
    return { name: p.name, season: seasonName, slides, story: { type: type.name, line: type.line, tiles, outro } };
  }

  // ------------------------------------------------- Instagram story image

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  let crestImg = null;
  function loadCrest() {
    if (crestImg) return crestImg;
    crestImg = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'assets/crest.png';
    });
    return crestImg;
  }

  function fitText(ctx, text, maxWidth, weight, size, min = 40) {
    let s = size;
    do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 4; } while (ctx.measureText(text).width > maxWidth && s > min);
    return s + 4;
  }
  function wrapLines(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  /** Render the summary as a 1080×1920 JPEG (Instagram story size). */
  async function storyImage(data) {
    const W = 1080, H = 1920, PAD = 90;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, '#2c64a8'); bg.addColorStop(0.45, '#163a6b'); bg.addColorStop(1, '#081627');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.85, 120, 0, W * 0.85, 120, 700);
    glow.addColorStop(0, 'rgba(224,185,58,0.35)'); glow.addColorStop(1, 'rgba(224,185,58,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e0b93a'; g.fillRect(0, H - 22, W, 22);

    const crest = await loadCrest();
    let y = 150;
    if (crest) {
      const d = 260;
      g.save(); g.beginPath(); g.arc(W / 2, y + d / 2, d / 2 + 8, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.restore();
      g.drawImage(crest, W / 2 - d / 2, y, d, d);
      y += d + 70;
    }
    g.textAlign = 'center'; g.fillStyle = '#e0b93a';
    g.font = `800 40px ${FONT}`;
    g.fillText(`EFFRA ROVERS FC · ${String(data.season).toUpperCase()} WRAPPED`, W / 2, y); y += 150;

    g.fillStyle = '#ffffff';
    const nameSize = fitText(g, data.name, W - PAD * 2, 900, 170, 80);
    g.font = `900 ${nameSize}px ${FONT}`; g.fillText(data.name, W / 2, y); y += 110;

    g.fillStyle = '#e0b93a';
    const typeSize = fitText(g, data.story.type, W - PAD * 2, 800, 84, 50);
    g.font = `800 ${typeSize}px ${FONT}`; g.fillText(data.story.type, W / 2, y); y += 80;

    g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = `500 42px ${FONT}`;
    for (const line of wrapLines(g, data.story.line, W - PAD * 2)) { g.fillText(line, W / 2, y); y += 56; }
    y += 50;

    const cols = 2, gap = 28, tw = (W - PAD * 2 - gap) / cols, th = 190;
    data.story.tiles.forEach(([label, value], i) => {
      const x = PAD + (i % cols) * (tw + gap), ty = y + Math.floor(i / cols) * (th + gap);
      g.fillStyle = 'rgba(255,255,255,0.11)'; roundRect(g, x, ty, tw, th, 28); g.fill();
      g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = `800 30px ${FONT}`;
      g.fillText(String(label).toUpperCase(), x + 36, ty + 62);
      g.fillStyle = '#ffffff';
      const vs = fitText(g, String(value), tw - 72, 900, 84, 44);
      g.font = `900 ${vs}px ${FONT}`; g.fillText(String(value), x + 36, ty + 152);
    });
    y += Math.ceil(data.story.tiles.length / cols) * (th + gap) + 40;

    g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `italic 600 40px ${FONT}`;
    for (const line of wrapLines(g, data.story.outro, W - PAD * 2)) { g.fillText(line, W / 2, y); y += 54; }

    g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = `600 32px ${FONT}`;
    g.fillText('benchurchus.github.io/effra-data', W / 2, H - 70);

    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.92));
  }

  async function shareStory(btn) {
    const data = state.data;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Making your story…';
    try {
      const blob = await storyImage(data);
      const file = new File([blob], `effra-wrapped-${data.name.toLowerCase().replace(/\W+/g, '-')}-${String(data.season).toLowerCase()}.jpg`, { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // phone share sheet: Instagram (Stories / Feed / DM), WhatsApp, etc.
        await navigator.share({ files: [file], title: `${data.name}’s Effra Wrapped`, text: `${data.name}’s ${data.season} Effra Wrapped` });
        btn.textContent = 'Shared ✓';
      } else {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        btn.textContent = 'Saved ✓ post it from your phone';
      }
    } catch (e) {
      btn.textContent = e && e.name === 'AbortError' ? label : 'Couldn’t make the image';
    } finally {
      btn.disabled = false;
      setTimeout(() => { if (btn.isConnected) btn.textContent = label; }, 3500);
    }
  }

  async function shareLink(btn) {
    const url = location.href;
    try {
      if (navigator.share) { await navigator.share({ title: `${state.data.name}’s ${state.data.season} Effra Wrapped`, url }); return; }
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Link copied ✓';
    } catch { /* cancelled */ }
  }

  // ------------------------------------------------------------------- UI

  let overlay = null, state = null;
  const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function slideHtml(sl, i) {
    if (sl.splash) {
      return `<section class="w-slide w-splash" data-i="${i}" aria-roledescription="slide">
        <div class="w-splash-crest"><span class="w-ring"></span><span class="w-ring r2"></span><img src="assets/crest.png" alt="Effra Rovers FC crest"></div>
        <div class="w-kicker">${sl.kicker}</div>
        <div class="w-big">${sl.big}</div>
        <div class="w-confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</div>
      </section>`;
    }
    return `<section class="w-slide w-${sl.theme}" data-i="${i}" aria-roledescription="slide">
      ${sl.crest ? '<img class="w-crest" src="assets/crest.png" alt="">' : ''}
      <div class="w-kicker">${sl.kicker}</div>
      <div class="w-big">${sl.big}${sl.unit ? ` <span class="w-unit">${sl.unit}</span>` : ''}</div>
      ${sl.sub ? `<div class="w-sub">${sl.sub}</div>` : ''}
      ${sl.summary ? `<div class="w-grid">${sl.summary.map(([k, v]) => `<div><div class="w-k">${k}</div><div class="w-v">${v}</div></div>`).join('')}</div>` : ''}
      ${sl.extra ? `<div class="w-extra">${sl.extra}</div>` : ''}
      ${sl.share ? `<div class="w-actions">
          <button type="button" class="w-btn insta" data-act="story">📸 Share to Instagram</button>
          <button type="button" class="w-btn ghost" data-act="share">Share link</button>
          <button type="button" class="w-btn ghost" data-act="restart">Watch again</button>
        </div>` : ''}
    </section>`;
  }

  function show(i) {
    const n = state.data.slides.length;
    state.i = Math.max(0, Math.min(n - 1, i));
    overlay.querySelectorAll('.w-slide').forEach((el, k) => {
      el.classList.toggle('active', k === state.i);
      el.setAttribute('aria-hidden', String(k !== state.i));
    });
    overlay.querySelectorAll('.w-bar > span').forEach((el, k) => el.classList.toggle('done', k <= state.i));
    overlay.querySelector('.w-live').textContent = `Slide ${state.i + 1} of ${n}`;
    overlay.querySelector('.w-hint').hidden = state.i === n - 1;
    clearTimeout(state.auto);
    if (state.data.slides[state.i].splash) state.auto = setTimeout(() => { if (state && state.i === 0) show(1); }, reduceMotion() ? 1500 : 2600);
    // count-up on the big number (skipped for reduced motion)
    const big = overlay.querySelector(`.w-slide[data-i="${state.i}"] .w-big`);
    const node = big && big.firstChild;
    if (node && node.nodeType === 3 && /^\d+$/.test(node.textContent.trim()) && !reduceMotion()) {
      const target = Number(node.textContent.trim());
      const start = performance.now(), dur = Math.min(900, 300 + target * 15);
      const tick = (now) => {
        const k = Math.min(1, (now - start) / dur);
        node.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3)))) + ' ';
        if (k < 1 && overlay) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  function close() {
    if (!overlay) return;
    document.removeEventListener('keydown', onKey);
    if (state) clearTimeout(state.auto);
    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';
    if (state && state.opener) state.opener.focus();
    if (state && state.onClose) state.onClose();
    state = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { if (e.target.closest && e.target.closest('button:not(.w-nav)')) return; e.preventDefault(); show(state.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(state.i - 1); }
  }

  function open(name, ctx, { opener, onClose } = {}) {
    const data = build(name, ctx);
    if (!data) return;
    close();
    loadCrest(); // warm up for the story image
    state = { data, i: 0, opener, onClose };
    overlay = document.createElement('div');
    overlay.className = 'w-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `${data.name}’s ${data.season} Wrapped`);
    overlay.innerHTML = `
      <div class="w-frame">
        <div class="w-bar" aria-hidden="true">${data.slides.map(() => '<span></span>').join('')}</div>
        <button type="button" class="w-close" data-act="close" aria-label="Close Wrapped">✕</button>
        <div class="w-stage">${data.slides.map(slideHtml).join('')}</div>
        <button type="button" class="w-nav prev" data-act="prev" aria-label="Previous"></button>
        <button type="button" class="w-nav next" data-act="next" aria-label="Next"></button>
        <div class="w-live sr-only" aria-live="polite"></div>
        <div class="w-hint" aria-hidden="true">tap to continue</div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      const act = el?.dataset.act;
      if (act === 'close' || e.target === overlay) close();
      else if (act === 'next') show(state.i + 1);
      else if (act === 'prev') show(state.i - 1);
      else if (act === 'story') shareStory(el);
      else if (act === 'share') shareLink(el);
      else if (act === 'restart') show(0);
    });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    show(0);
    overlay.querySelector('.w-nav.next').focus();
  }

  root.EffraWrapped = { build, open, close, storyImage };
})(typeof window !== 'undefined' ? window : globalThis);

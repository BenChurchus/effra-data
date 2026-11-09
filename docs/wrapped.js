/*
 * Season Wrapped: a tap-through, story-style reveal of one player's season.
 * Built entirely from the shared engine (Effra), so every number matches the
 * site. Awards only appear for finished seasons so awards night isn't spoilt.
 *
 * Controls: tap right / → / Space = next, tap left / ← = back, Esc = close.
 */
(function (root) {
  'use strict';
  const E = root.Effra;
  const esc = (v) => E.escapeHtml(v);
  const fmt = E.fmt;

  const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  /** 1-based rank of `name` by `key` among `pool` (desc), with pool size. */
  function rankOf(pool, name, value, { asc = false } = {}) {
    const vals = pool.map(p => ({ n: p.name, v: value(p) })).filter(x => x.v != null);
    const me = vals.find(x => x.n === name);
    if (!me) return null;
    const better = vals.filter(x => (asc ? x.v < me.v : x.v > me.v) - 0).length;
    return { rank: better + 1, of: vals.length };
  }
  const rankText = (r, what) => (r ? `${r.rank === 1 ? 'The most' : `${ordinal(r.rank)} most`} ${what} in the squad` : '');

  // Player "type": the stat they're most exceptional at among regulars.
  const TYPES = [
    { key: 'gpg', name: 'The Finisher', line: 'Goals just follow you around.' },
    { key: 'apg', name: 'The Playmaker', line: 'Everyone else’s goals start with you.' },
    { key: 'cspg', name: 'The Brick Wall', line: 'Nothing gets past on your watch.' },
    { key: 'winPct', name: 'The Winner', line: 'Whatever team you’re on, it wins.' },
    { key: 'impact', name: 'The Lucky Charm', line: 'Teams simply win more with you in them.' },
  ];
  function percentile(pool, key, v) {
    const vals = pool.map(p => p[key]).filter(x => x != null);
    if (v == null || !vals.length) return null;
    return (vals.filter(x => x < v - 1e-12).length + 0.5 * vals.filter(x => Math.abs(x - v) <= 1e-12).length) / vals.length;
  }

  /**
   * Build the slides for one player. ctx = { matches, players, pairs, t,
   * year ('all' | '2026' ...), latestYear }.
   */
  function build(name, ctx) {
    const p = ctx.players.find(x => x.name === name);
    if (!p) return null;
    const seasonName = ctx.year === 'all' ? 'All-time' : ctx.year;
    const all = ctx.players;
    const regulars = all.filter(x => x.apps >= ctx.t.minApps);
    const pool = regulars.length >= 3 ? regulars : all;
    const slides = [];
    const first = p.games[0], last = p.games[p.games.length - 1];

    // 1. intro
    slides.push({
      theme: 'brand', kicker: `${seasonName} Wrapped`, big: esc(p.name),
      sub: ctx.year === 'all' ? 'Every game you’ve played for Effra Rovers. Let’s go.' : `Your ${ctx.year} season at Effra Rovers. Let’s go.`,
      crest: true,
    });

    // 2. appearances
    const rApps = rankOf(all, name, x => x.apps);
    slides.push({
      theme: 'navy', kicker: 'You turned up', big: `${p.apps}`, unit: p.apps === 1 ? 'time' : 'times',
      sub: `${rankText(rApps, 'appearances')}. First game: ${E.gwLabel(first)}${p.apps > 1 ? `, latest: ${E.gwLabel(last)}` : ''}.`,
    });

    // 3. goals + best game
    const rGoals = rankOf(all, name, x => x.goals);
    const bestGame = p.games.slice().sort((a, b) => b.goals - a.goals || E.byChrono(b, a))[0];
    slides.push({
      theme: 'gold', kicker: 'You scored', big: `${p.goals}`, unit: p.goals === 1 ? 'goal' : 'goals',
      sub: p.goals
        ? `${fmt.pg(p.gpg)} a game. ${rankText(rGoals, 'goals')}.`
        : 'Not one. The defenders’ union thanks you.',
      extra: bestGame && bestGame.goals >= 2
        ? `Best day: <b>${bestGame.goals} goals</b> in ${esc(E.gwLabel(bestGame))}${bestGame.venue ? ` at ${esc(bestGame.venue)}` : ''} (${bestGame.result === 'W' ? 'won' : bestGame.result === 'L' ? 'lost' : 'drew'} ${bestGame.teamGoals}–${bestGame.oppGoals}).`
        : '',
    });

    // 4. assists (only where tracked)
    if (p.appsA) {
      const rA = rankOf(all.filter(x => x.appsA), name, x => x.assists);
      slides.push({
        theme: 'brand', kicker: 'You set up', big: `${p.assists}`, unit: p.assists === 1 ? 'goal' : 'goals',
        sub: `${fmt.pg(p.apg)} assists a game. ${rankText(rA, 'assists')}.`,
        extra: p.appsA < p.apps ? `<span class="w-note">Assists recorded for ${p.appsA} of your ${p.apps} games.</span>` : '',
      });
    }

    // 5. record + biggest win
    const rWin = rankOf(pool, name, x => x.winPct);
    const bigWin = p.games.filter(g => g.result === 'W' && g.teamGoals != null)
      .sort((a, b) => (b.teamGoals - b.oppGoals) - (a.teamGoals - a.oppGoals))[0];
    slides.push({
      theme: (p.winPct ?? 0) >= 0.5 ? 'win' : 'navy', kicker: 'You won', big: fmt.pct(p.winPct), unit: 'of your games',
      sub: `${fmt.wdlHtml(p.rec)}${p.apps >= ctx.t.minApps && rWin ? ` · ${rWin.rank === 1 ? 'The best' : `${ordinal(rWin.rank)} best`} win rate among regulars` : ''}`,
      extra: bigWin ? `Biggest win: <b>${bigWin.teamGoals}–${bigWin.oppGoals}</b> in ${esc(E.gwLabel(bigWin))}.` : 'Still waiting on that first win…',
    });

    // 6. streaks
    const s = p.streaks;
    slides.push({
      theme: 'navy', kicker: 'On a run', big: `${s.win.length}`, unit: s.win.length === 1 ? 'win in a row' : 'wins in a row',
      sub: s.win.length ? `Your best winning run: ${esc(fmt.span(s.win))}.` : '',
      extra: [
        s.scoring.length >= 2 ? `Scored in <b>${s.scoring.length}</b> straight games (${esc(fmt.span(s.scoring))}).` : '',
        s.unbeaten.length > s.win.length ? `Went <b>${s.unbeaten.length}</b> unbeaten.` : '',
        s.loss.length >= 3 ? `And the less said about those <b>${s.loss.length}</b> losses in a row, the better.` : '',
      ].filter(Boolean).join('<br>'),
    });

    // 7. best partner / 8. nemesis
    const mine = E.pairingsFor(ctx.pairs, name);
    const minPair = Math.min(ctx.t.minPairGames, Math.max(3, Math.round(p.apps / 4)));
    const partners = mine.filter(r => E.decided(r.with) >= minPair).sort((a, b) => b.withPct - a.withPct || b.with.n - a.with.n);
    if (partners.length) {
      const bp = partners[0];
      const worst = partners[partners.length - 1];
      slides.push({
        theme: 'win', kicker: 'Your best partner', big: esc(bp.other), unit: '',
        sub: `Together: ${fmt.wdlHtml(bp.with)}, a <b>${fmt.pct(bp.withPct)}</b> win rate in ${bp.with.n} games.`,
        extra: worst && worst.other !== bp.other && worst.withPct < (bp.withPct ?? 0)
          ? `Maybe avoid <b>${esc(worst.other)}</b>: ${fmt.pct(worst.withPct)} together.` : '',
      });
    }
    const minVs = Math.min(ctx.t.minVsGames, Math.max(3, Math.round(p.apps / 4)));
    const rivals = mine.filter(r => r.vs.W + r.vs.L >= minVs);
    const nemesis = rivals.slice().sort((a, b) => (a.vsPct ?? 1) - (b.vsPct ?? 1) || b.vs.n - a.vs.n)[0];
    const victim = rivals.slice().sort((a, b) => (b.vsPct ?? 0) - (a.vsPct ?? 0) || b.vs.n - a.vs.n)[0];
    if (nemesis && (nemesis.vsPct ?? 1) < 0.5) {
      slides.push({
        theme: 'loss', kicker: 'Your nemesis', big: esc(nemesis.other), unit: '',
        sub: `Against them you’re ${fmt.wdlHtml(nemesis.vs)}: ${fmt.pct(nemesis.vsPct)}.`,
        extra: victim && victim.other !== nemesis.other && (victim.vsPct ?? 0) > 0.5
          ? `But you own <b>${esc(victim.other)}</b>: ${fmt.wdlHtml(victim.vs)} against them.` : '',
      });
    } else if (victim && (victim.vsPct ?? 0) > 0.5) {
      slides.push({
        theme: 'win', kicker: 'You own', big: esc(victim.other), unit: '',
        sub: `Against them you’re ${fmt.wdlHtml(victim.vs)}: ${fmt.pct(victim.vsPct)}. No nemesis in sight.`,
      });
    }

    // 9. captaincy
    if (p.cap.n) {
      slides.push({
        theme: 'gold', kicker: 'You wore the armband', big: `${p.cap.n}`, unit: p.cap.n === 1 ? 'time' : 'times',
        sub: `As captain: ${fmt.wdlHtml(p.cap)}, a <b>${fmt.pct(p.capWinPct)}</b> win rate.`,
        extra: (p.capWinPct ?? 0) >= 0.6 ? 'Born leader.' : (p.capWinPct ?? 1) <= 0.3 ? 'Maybe let someone else pick the team.' : '',
      });
    }

    // 10. awards (finished seasons only)
    const finished = ctx.year !== 'all' && Number(ctx.year) < Number(ctx.latestYear);
    if (finished) {
      const won = E.computeAwards(ctx.matches).awards.filter(a => !a.notAwarded && a.winners.some(w => w === name || w.split(' & ').includes(name)));
      slides.push({
        theme: 'gold', kicker: 'Silverware', big: won.length ? `${won.length}` : '0', unit: won.length === 1 ? 'award' : 'awards',
        sub: won.length ? won.map(a => `🏆 <b>${esc(a.name)}</b>`).join('<br>') : 'No silverware this time. There’s always next season.',
      });
    }

    // 11. player type
    const scored = TYPES.map(t => ({ ...t, pct: percentile(pool, t.key, p[t.key]) })).filter(t => t.pct != null);
    const top = scored.sort((a, b) => b.pct - a.pct)[0];
    const type = top && top.pct >= 0.6 ? top
      : rApps && rApps.rank <= 3 ? { name: 'The Ever-Present', line: 'Rain or shine, you’re there.', pct: null }
      : { name: 'The Squad Player', line: 'Every team needs one. Glue, not glitter.', pct: null };
    slides.push({
      theme: 'brand', kicker: 'Your player type', big: esc(type.name), unit: '',
      sub: type.line,
      extra: type.pct != null ? `Top ${Math.max(1, Math.round((1 - type.pct) * 100))}% of regulars for ${({ gpg: 'goals per game', apg: 'assists per game', cspg: 'clean sheets per game', winPct: 'win rate', impact: 'win impact' })[type.key]}.` : '',
    });

    // 12. summary
    const tiles = [
      ['Apps', p.apps], ['Goals', p.goals], p.appsA ? ['Assists', p.assists] : null,
      ['Win rate', fmt.pct(p.winPct)], ['Best run', `${s.win.length}W`],
      partners[0] ? ['Best partner', esc(partners[0].other)] : null,
    ].filter(Boolean);
    slides.push({
      theme: 'summary', kicker: `${esc(p.name)} · ${seasonName}`, big: esc(type.name), unit: '',
      summary: tiles, share: true,
    });
    return { name: p.name, season: seasonName, slides };
  }

  // ------------------------------------------------------------------- UI

  let overlay = null, state = null;
  const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function slideHtml(sl, i) {
    return `<section class="w-slide w-${sl.theme}" data-i="${i}" aria-roledescription="slide">
      ${sl.crest ? '<img class="w-crest" src="assets/crest.png" alt="">' : ''}
      <div class="w-kicker">${sl.kicker}</div>
      <div class="w-big">${sl.big}${sl.unit ? ` <span class="w-unit">${sl.unit}</span>` : ''}</div>
      ${sl.sub ? `<div class="w-sub">${sl.sub}</div>` : ''}
      ${sl.extra ? `<div class="w-extra">${sl.extra}</div>` : ''}
      ${sl.summary ? `<div class="w-grid">${sl.summary.map(([k, v]) => `<div><div class="w-k">${k}</div><div class="w-v">${v}</div></div>`).join('')}</div>` : ''}
      ${sl.share ? `<div class="w-actions"><button type="button" class="w-btn" data-act="share">Share</button><button type="button" class="w-btn ghost" data-act="restart">Watch again</button></div>` : ''}
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
    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';
    if (state && state.opener) state.opener.focus();
    if (state && state.onClose) state.onClose();
    state = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { if (e.target.closest && e.target.closest('button')) return; e.preventDefault(); show(state.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(state.i - 1); }
  }

  async function share() {
    const url = location.href;
    const title = `${state.data.name}’s ${state.data.season} Effra Wrapped`;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      const b = overlay.querySelector('[data-act="share"]');
      b.textContent = 'Link copied ✓';
    } catch { /* user cancelled */ }
  }

  function open(name, ctx, { opener, onClose } = {}) {
    const data = build(name, ctx);
    if (!data) return;
    close();
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
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close' || e.target === overlay) close();
      else if (act === 'next') show(state.i + 1);
      else if (act === 'prev') show(state.i - 1);
      else if (act === 'share') share();
      else if (act === 'restart') show(0);
    });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    show(0);
    overlay.querySelector('.w-nav.next').focus();
  }

  root.EffraWrapped = { build, open, close };
})(typeof window !== 'undefined' ? window : globalThis);

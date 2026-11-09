/*
 * Small, dependency-free SVG charts for the Effra site.
 *  - radarChart: percentile profile (0–1 on every axis), <= 2 series:
 *    the subject in series-1, the comparison in neutral grey (emphasis form).
 *  - lineChart: cumulative counts over a player's games, <= 2 series on one
 *    axis, direct end labels + legend, crosshair tooltip (mouse, touch, keys).
 * Every chart is paired with a table view by the caller (tooltips never gate).
 */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (v) => root.Effra.escapeHtml(v);

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      // CSS custom properties aren't valid in SVG presentation attributes,
      // so colour tokens go through style instead.
      if (typeof v === 'string' && v.startsWith('var(')) n.style.setProperty(k, v);
      else n.setAttribute(k, v);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function tooltip(container) {
    let tip = container.querySelector(':scope > .tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.setAttribute('role', 'status');
      tip.hidden = true;
      container.appendChild(tip);
    }
    return {
      show(svg, x, y, html) {
        const box = svg.getBoundingClientRect();
        const cbox = container.getBoundingClientRect();
        const vb = svg.viewBox.baseVal;
        const sx = box.width / vb.width, sy = box.height / vb.height;
        let left = box.left - cbox.left + x * sx;
        const top = box.top - cbox.top + y * sy - 8;
        tip.innerHTML = html;
        tip.hidden = false;
        const half = tip.offsetWidth / 2;
        left = Math.max(half, Math.min(cbox.width - half, left));
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
      },
      hide() { tip.hidden = true; },
    };
  }

  /**
   * axes: [{label}]; series: [{name, color (css), values: [0..1|null], display: [string]}]
   * The last series is drawn on top (put the subject last).
   */
  function radarChart(container, { axes, series, title }) {
    container.innerHTML = '';
    const W = 340, H = 300, cx = W / 2, cy = 148, R = 100;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title || 'Radar chart' });
    container.appendChild(svg);
    const n = axes.length;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];

    const grid = el('g', { class: 'grid' }, svg);
    for (const f of [0.25, 0.5, 0.75, 1]) {
      el('polygon', { points: axes.map((_, i) => pt(i, f).join(',')).join(' ') }, grid);
    }
    const axisG = el('g', { class: 'axis' }, svg);
    axes.forEach((a, i) => {
      const [x, y] = pt(i, 1);
      el('line', { x1: cx, y1: cy, x2: x, y2: y }, axisG);
      const [lx, ly] = pt(i, 1.17);
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      const t = el('text', { x: lx, y: ly + 4, 'text-anchor': anchor, class: 'ink' }, svg);
      t.textContent = a.label;
    });
    // ring scale label (percentile)
    const s = el('text', { x: cx + 4, y: cy - R * 0.5 - 2, class: 'tick' }, svg);
    s.textContent = '50th';

    const tip = tooltip(container);
    series.forEach((ser) => {
      const pts = ser.values.map((v, i) => pt(i, v == null ? 0 : Math.max(0.02, v)));
      el('polygon', {
        points: pts.map(p => p.join(',')).join(' '),
        fill: ser.color, 'fill-opacity': ser.fillOpacity ?? 0.12,
        stroke: ser.color, 'stroke-width': 2, 'stroke-linejoin': 'round',
      }, svg);
      pts.forEach(([x, y], i) => {
        if (ser.values[i] == null) return;
        el('circle', { cx: x, cy: y, r: 4, fill: ser.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
        const hit = el('circle', { cx: x, cy: y, r: 12, fill: 'transparent', tabindex: 0,
          'aria-label': `${ser.name}, ${axes[i].label}: ${ser.display[i]}` }, svg);
        const html = `<b>${esc(ser.name)}</b> · ${esc(axes[i].label)}<br>${esc(ser.display[i])}`;
        hit.addEventListener('pointerenter', () => tip.show(svg, x, y, html));
        hit.addEventListener('focus', () => tip.show(svg, x, y, html));
        hit.addEventListener('pointerleave', () => tip.hide());
        hit.addEventListener('blur', () => tip.hide());
      });
    });
  }

  function niceMax(v) {
    if (v <= 5) return 5;
    const step = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= v) return m * step;
    return 10 * step;
  }

  /**
   * points: [{label, ...}] in x order; series: [{name, color, values: [number]}]
   * tooltipHtml(i) -> html for the hovered x.
   */
  function lineChart(container, { points, series, title, tooltipHtml, yLabel }) {
    container.innerHTML = '';
    const W = 600, H = 250, m = { l: 34, r: 92, t: 12, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title || 'Line chart', tabindex: 0 });
    container.appendChild(svg);
    const n = points.length;
    const yMax = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
    const x = (i) => m.l + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
    const y = (v) => m.t + ph - (v / yMax) * ph;

    const grid = el('g', { class: 'grid' }, svg);
    const ticks = 4;
    for (let k = 0; k <= ticks; k++) {
      const v = (yMax * k) / ticks;
      el('line', { x1: m.l, x2: m.l + pw, y1: y(v), y2: y(v) }, grid);
      const t = el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
      t.textContent = Number.isInteger(v) ? v : v.toFixed(1);
    }
    el('line', { x1: m.l, x2: m.l + pw, y1: y(0), y2: y(0), stroke: 'var(--axis)' }, svg);
    if (yLabel) {
      const t = el('text', { x: m.l - 6, y: m.t - 2, 'text-anchor': 'end' }, svg);
      t.textContent = yLabel;
    }
    const every = Math.max(1, Math.ceil(n / 6));
    points.forEach((p, i) => {
      if (i % every && i !== n - 1) return;
      if (i !== n - 1 && n - 1 - i < every * 0.6) return; // avoid colliding with last label
      const t = el('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', class: 'tick' }, svg);
      t.textContent = p.label;
    });

    const ends = [];
    series.forEach((s) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      const last = s.values[n - 1] ?? 0;
      el('circle', { cx: x(n - 1), cy: y(last), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      ends.push({ s, y: y(last), last });
    });
    // direct end labels, nudged apart so they never overlap
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    for (const e of ends) {
      const t = el('text', { x: x(n - 1) + 10, y: e.y + 4, class: 'ink' }, svg);
      t.textContent = `${e.s.name} ${e.last}`;
    }

    // crosshair layer
    const cross = el('line', { y1: m.t, y2: m.t + ph, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    const dots = series.map(s => el('circle', { r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg));
    const tip = tooltip(container);
    let active = null;
    function show(i) {
      active = i;
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      series.forEach((s, k) => {
        dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(s.values[i]));
        dots[k].setAttribute('visibility', 'visible');
      });
      const topY = Math.min(...series.map(s => y(s.values[i])));
      tip.show(svg, x(i), topY, tooltipHtml(i));
    }
    function hide() {
      active = null; cross.setAttribute('visibility', 'hidden');
      dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.hide();
    }
    const overlay = el('rect', { x: m.l - 10, y: 0, width: pw + 20, height: H, fill: 'transparent' }, svg);
    const idxAt = (evt) => {
      const box = svg.getBoundingClientRect();
      const vx = ((evt.clientX - box.left) / box.width) * W;
      return n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((vx - m.l) / pw) * (n - 1))));
    };
    overlay.addEventListener('pointermove', (e) => show(idxAt(e)));
    overlay.addEventListener('pointerdown', (e) => show(idxAt(e)));
    overlay.addEventListener('pointerleave', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = active == null ? (e.key === 'ArrowRight' ? 0 : n - 1) : active + (e.key === 'ArrowRight' ? 1 : -1);
        show(Math.max(0, Math.min(n - 1, next)));
      } else if (e.key === 'Escape') hide();
    });
    svg.addEventListener('blur', hide);
  }

  function legend(items) {
    return `<div class="legend">${items.map(i =>
      `<span><span class="sw" style="background:${i.color}"></span>${esc(i.name)}</span>`).join('')}</div>`;
  }

  root.EffraCharts = { radarChart, lineChart, legend };
})(typeof window !== 'undefined' ? window : globalThis);

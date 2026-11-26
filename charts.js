// Zero-dependency SVG charts, radial gauges, sparklines and icons.
// Built strictly with document.createElementNS (no innerHTML, CSP-safe).

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else if (child) node.appendChild(child);
  }
  return node;
}

export function icon(name, size = 18) {
  const paths = {
    today: [['M12 3v2', 'M12 19v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M3 12h2', 'M19 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41'], ['circle', { cx: 12, cy: 12, r: 4 }]],
    run: [['M13 4a2 2 0 1 0 0 .01', 'M6 21l3-6 2 2v4', 'M9 11l3-3 4 2 2-2', 'M12 8l-2 4 4 3 3-1']],
    lift: [['M6.5 6.5v11', 'M17.5 6.5v11', 'M3 9v6', 'M21 9v6', 'M6.5 12h11']],
    sleep: [['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']],
    archive: [['M3 3v18h18', 'M7 15l4-4 3 3 5-6']],
    sun: [['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41'], ['circle', { cx: 12, cy: 12, r: 4 }]],
    moon: [['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z']],
    heart: [['M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z']],
    flame: [['M12 22c4.5 0 7-3.2 7-7.2 0-3.5-2.2-6.2-4.5-8.8-.3 2.2-1.5 3.3-2.5 3.8.3-2.9-.8-5.6-3-7.8 0 3.3-2.5 5.2-3.5 7.5A7 7 0 0 0 5 14.8C5 18.8 7.5 22 12 22z']],
    shoe: [['M3 16c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-1.2a2 2 0 0 0-1.4-1.9l-4.6-1.4-3-4.5H9L7 11l-3 1.5A2 2 0 0 0 3 14.3V16z']],
    trophy: [['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4z', 'M7 6H4v2a3 3 0 0 0 3 3', 'M17 6h3v2a3 3 0 0 1-3 3']],
    check: [['M20 6L9 17l-5-5']],
    chevron: [['M6 9l6 6 6-6']],
    refresh: [['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6']],
    pulse: [['M2 12h4l3-7 4 14 3-7h6']],
  };
  const def = paths[name] || paths.pulse;
  const svg = svgEl('svg', {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'aria-hidden': 'true', class: 'ico',
  });
  def[0].forEach((d) => svg.appendChild(svgEl('path', { d })));
  if (def[1]) svg.appendChild(svgEl(def[1][0], def[1][1]));
  return svg;
}

export function radialRing({
  value, max = 100, size = 112, stroke = 9, color = '#22c55e',
  label = '', sublabel = '', displayValue = null,
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null || value === undefined || max <= 0
    ? 0
    : Math.max(0, Math.min(1, value / max));
  const dashOffset = c * (1 - pct);

  const svg = svgEl('svg', {
    width: size, height: size, viewBox: `0 0 ${size} ${size}`,
    class: 'radial-ring', role: 'img', 'aria-label': `${label}: ${displayValue ?? value ?? 'no data'}`,
  });

  // Track circle
  svg.appendChild(svgEl('circle', {
    cx: size / 2, cy: size / 2, r,
    fill: 'none', stroke: 'var(--ring-track)', 'stroke-width': stroke,
  }));

  // Progress arc
  if (pct > 0) {
    svg.appendChild(svgEl('circle', {
      cx: size / 2, cy: size / 2, r,
      fill: 'none', stroke: color, 'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-dasharray': c.toFixed(2),
      'stroke-dashoffset': dashOffset.toFixed(2),
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
      class: 'radial-arc',
    }));
  }

  const valText = displayValue !== null ? String(displayValue)
    : (value === null || value === undefined ? '—' : String(Math.round(value)));

  const txt = svgEl('text', {
    x: size / 2, y: sublabel ? size / 2 - 2 : size / 2 + 5,
    'text-anchor': 'middle', class: 'radial-val',
  }, [valText]);
  svg.appendChild(txt);

  if (sublabel) {
    svg.appendChild(svgEl('text', {
      x: size / 2, y: size / 2 + 15,
      'text-anchor': 'middle', class: 'radial-sub',
    }, [sublabel]));
  }

  return svg;
}

export function sparkline({
  points = [], width = 140, height = 38, color = '#38bdf8', target = null,
}) {
  const valid = points.map((v, i) => (v !== null && v !== undefined && Number.isFinite(v) ? { i, v } : null)).filter(Boolean);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`, class: 'sparkline', preserveAspectRatio: 'none',
  });
  if (valid.length < 2) return svg;

  const vals = valid.map((p) => p.v);
  if (target !== null) vals.push(target);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max === min) { min -= 1; max += 1; }
  const padY = 4;
  const xOf = (i) => (i / Math.max(1, points.length - 1)) * (width - 8) + 4;
  const yOf = (v) => height - padY - ((v - min) / (max - min)) * (height - padY * 2);

  if (target !== null) {
    const ty = yOf(target);
    svg.appendChild(svgEl('line', {
      x1: 2, y1: ty, x2: width - 2, y2: ty,
      stroke: 'var(--border-strong)', 'stroke-dasharray': '3 3', 'stroke-width': 1,
    }));
  }

  const dLine = valid.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.i).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
  const first = valid[0];
  const last = valid[valid.length - 1];
  const dArea = `${dLine} L${xOf(last.i).toFixed(1)},${height} L${xOf(first.i).toFixed(1)},${height} Z`;

  svg.appendChild(svgEl('path', { d: dArea, fill: color, 'fill-opacity': 0.14 }));
  svg.appendChild(svgEl('path', { d: dLine, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  svg.appendChild(svgEl('circle', { cx: xOf(last.i), cy: yOf(last.v), r: 3, fill: color }));
  return svg;
}

export function lineChart({
  labels = [], series = [], height = 220, yMin = null, yMax = null,
  yUnit = '', band = null, targetLine = null, invertY = false,
}) {
  const width = 640;
  const pad = { top: 18, right: 18, bottom: 32, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const allVals = [];
  series.forEach((s) => s.values.forEach((v) => { if (v !== null && v !== undefined && Number.isFinite(v)) allVals.push(v); }));
  if (band) { allVals.push(band.low, band.high); }
  if (targetLine) { allVals.push(targetLine.value); }

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });
  if (!allVals.length) {
    svg.appendChild(svgEl('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty' }, ['No data in selected range']));
    return svg;
  }

  let lo = yMin !== null ? yMin : Math.min(...allVals);
  let hi = yMax !== null ? yMax : Math.max(...allVals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  if (yMin === null) lo = Math.max(0, lo - span * 0.1);
  if (yMax === null) hi = hi + span * 0.1;

  const n = Math.max(1, labels.length);
  const xOf = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v) => {
    const ratio = (v - lo) / (hi - lo);
    return invertY ? pad.top + ratio * plotH : pad.top + (1 - ratio) * plotH;
  };

  // Horizontal gridlines
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = lo + ((hi - lo) * t) / ticks;
    const y = yOf(val);
    svg.appendChild(svgEl('line', {
      x1: pad.left, y1: y, x2: width - pad.right, y2: y,
      stroke: 'var(--grid-line)', 'stroke-width': 1,
    }));
    const lbl = Math.abs(val) >= 100 ? Math.round(val) : Math.round(val * 10) / 10;
    svg.appendChild(svgEl('text', {
      x: pad.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-axis',
    }, [`${lbl}${yUnit}`]));
  }

  // Shaded target band (e.g. Zone 2 132-163 bpm)
  if (band) {
    const yTop = Math.min(yOf(band.high), yOf(band.low));
    const yBot = Math.max(yOf(band.high), yOf(band.low));
    svg.appendChild(svgEl('rect', {
      x: pad.left, y: yTop, width: plotW, height: Math.max(1, yBot - yTop),
      fill: band.color || '#22c55e', 'fill-opacity': 0.13, rx: 4,
    }));
    if (band.label) {
      svg.appendChild(svgEl('text', {
        x: width - pad.right - 6, y: yTop + 13, 'text-anchor': 'end',
        class: 'chart-band-label', fill: band.color || '#22c55e',
      }, [band.label]));
    }
  }

  // Target dashed line
  if (targetLine) {
    const ty = yOf(targetLine.value);
    svg.appendChild(svgEl('line', {
      x1: pad.left, y1: ty, x2: width - pad.right, y2: ty,
      stroke: targetLine.color || '#22c55e', 'stroke-width': 1.4, 'stroke-dasharray': '5 4',
    }));
    if (targetLine.label) {
      svg.appendChild(svgEl('text', {
        x: width - pad.right - 4, y: ty - 5, 'text-anchor': 'end',
        class: 'chart-band-label', fill: targetLine.color || '#22c55e',
      }, [targetLine.label]));
    }
  }

  // Series paths & points
  series.forEach((s) => {
    const pts = [];
    s.values.forEach((v, i) => {
      if (v !== null && v !== undefined && Number.isFinite(v)) pts.push({ i, v, x: xOf(i), y: yOf(v) });
    });
    if (!pts.length) return;
    if (pts.length > 1) {
      const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      if (s.area) {
        const base = pad.top + plotH;
        const dA = `${d} L${pts[pts.length - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
        svg.appendChild(svgEl('path', { d: dA, fill: s.color, 'fill-opacity': 0.12 }));
      }
      svg.appendChild(svgEl('path', {
        d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.3,
        'stroke-dasharray': s.dashed ? '4 4' : null,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
    }
    if (s.dots !== false && pts.length <= 45) {
      pts.forEach((p) => {
        const dotColor = s.pointColor ? s.pointColor(p.v, p.i) : s.color;
        const dot = svgEl('circle', {
          cx: p.x, cy: p.y, r: pts.length > 25 ? 2.8 : 4,
          fill: dotColor, stroke: 'var(--bg-card)', 'stroke-width': 1.5,
        });
        const tip = `${labels[p.i] || ''}: ${p.v}${yUnit}`;
        dot.appendChild(svgEl('title', {}, [tip]));
        svg.appendChild(dot);
      });
    }
  });

  // X-axis labels (max 7 evenly spaced)
  const step = Math.max(1, Math.ceil(labels.length / 7));
  for (let i = 0; i < labels.length; i += step) {
    svg.appendChild(svgEl('text', {
      x: xOf(i), y: height - 8, 'text-anchor': 'middle', class: 'chart-axis',
    }, [labels[i]]));
  }
  if (labels.length > 1 && (labels.length - 1) % step !== 0) {
    svg.appendChild(svgEl('text', {
      x: xOf(labels.length - 1), y: height - 8, 'text-anchor': 'end', class: 'chart-axis',
    }, [labels[labels.length - 1]]));
  }

  return svg;
}

export function barChart({
  items = [], width = 640, height = 220, yUnit = '', targetLine = null,
  stacked = false, series = [], color = '#38bdf8', yMax = null,
}) {
  const pad = { top: 18, right: 16, bottom: 32, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg' });
  if (!items.length) {
    svg.appendChild(svgEl('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'chart-empty' }, ['No data yet']));
    return svg;
  }

  const totals = items.map((it) => {
    if (stacked) return series.reduce((a, s) => a + (Number(it[s.key]) || 0), 0);
    if (series.length) return Math.max(...series.map((s) => Number(it[s.key]) || 0));
    return Number(it.value) || 0;
  });
  let maxVal = yMax !== null ? yMax : Math.max(...totals, targetLine ? targetLine.value : 0, 1);
  maxVal = maxVal * 1.12;

  const yOf = (v) => pad.top + (1 - v / maxVal) * plotH;

  // Gridlines
  for (let t = 0; t <= 4; t++) {
    const val = (maxVal * t) / 4;
    const y = yOf(val);
    svg.appendChild(svgEl('line', {
      x1: pad.left, y1: y, x2: width - pad.right, y2: y,
      stroke: 'var(--grid-line)', 'stroke-width': 1,
    }));
    const lbl = maxVal >= 1000 ? `${(val / 1000).toFixed(1)}k` : (maxVal >= 20 ? Math.round(val) : Math.round(val * 10) / 10);
    svg.appendChild(svgEl('text', {
      x: pad.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-axis',
    }, [`${lbl}${yUnit}`]));
  }

  const slotW = plotW / items.length;
  const barGap = items.length > 35 ? 1.5 : (items.length > 16 ? 3 : 6);

  items.forEach((it, i) => {
    const slotX = pad.left + i * slotW;
    if (stacked) {
      const bw = Math.max(2, slotW - barGap);
      let acc = 0;
      series.forEach((s) => {
        const v = Number(it[s.key]) || 0;
        if (v <= 0) return;
        const yTop = yOf(acc + v);
        const yBot = yOf(acc);
        const rect = svgEl('rect', {
          x: slotX + barGap / 2, y: yTop, width: bw, height: Math.max(1, yBot - yTop),
          fill: s.color, rx: items.length > 30 ? 1 : 2.5,
        });
        rect.appendChild(svgEl('title', {}, [`${it.tooltip || it.label} • ${s.label}: ${v}${yUnit}`]));
        svg.appendChild(rect);
        acc += v;
      });
    } else if (series.length > 1) {
      const groupW = Math.max(4, slotW - barGap);
      const subW = Math.max(2, (groupW - 2) / series.length);
      series.forEach((s, si) => {
        const v = Number(it[s.key]) || 0;
        if (v <= 0) return;
        const yTop = yOf(v);
        const h = Math.max(1, pad.top + plotH - yTop);
        const rect = svgEl('rect', {
          x: slotX + barGap / 2 + si * (subW + 1), y: yTop, width: subW, height: h,
          fill: s.color, 'fill-opacity': s.opacity ?? 1, rx: 2.5,
        });
        rect.appendChild(svgEl('title', {}, [`${it.tooltip || it.label} • ${s.label}: ${v}${yUnit}`]));
        svg.appendChild(rect);
      });
    } else {
      const bw = Math.max(2, slotW - barGap);
      const v = Number(it.value) || 0;
      if (v > 0) {
        const yTop = yOf(v);
        const h = Math.max(1, pad.top + plotH - yTop);
        const rect = svgEl('rect', {
          x: slotX + barGap / 2, y: yTop, width: bw, height: h,
          fill: it.color || color, rx: items.length > 30 ? 1.5 : 3.5,
        });
        rect.appendChild(svgEl('title', {}, [`${it.tooltip || it.label}: ${v}${yUnit}`]));
        svg.appendChild(rect);
      }
    }

    if (it.marker) {
      svg.appendChild(svgEl('circle', {
        cx: slotX + slotW / 2, cy: pad.top - 6, r: 4, fill: '#f59e0b',
      }, [svgEl('title', {}, [it.marker])]));
    }
  });

  if (targetLine) {
    const ty = yOf(targetLine.value);
    svg.appendChild(svgEl('line', {
      x1: pad.left, y1: ty, x2: width - pad.right, y2: ty,
      stroke: targetLine.color || '#22c55e', 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
    }));
    if (targetLine.label) {
      svg.appendChild(svgEl('text', {
        x: width - pad.right - 4, y: ty - 5, 'text-anchor': 'end',
        class: 'chart-band-label', fill: targetLine.color || '#22c55e',
      }, [targetLine.label]));
    }
  }

  const step = Math.max(1, Math.ceil(items.length / 8));
  for (let i = 0; i < items.length; i += step) {
    svg.appendChild(svgEl('text', {
      x: pad.left + i * slotW + slotW / 2, y: height - 8, 'text-anchor': 'middle', class: 'chart-axis',
    }, [items[i].label]));
  }

  return svg;
}

export function zoneBar({ z1 = 0, z2 = 0, z3 = 0, z4 = 0, z5 = 0 }) {
  const zones = [
    { key: 'Z1', val: Number(z1) || 0, color: '#64748b' },
    { key: 'Z2', val: Number(z2) || 0, color: '#22c55e' },
    { key: 'Z3', val: Number(z3) || 0, color: '#eab308' },
    { key: 'Z4', val: Number(z4) || 0, color: '#f97316' },
    { key: 'Z5', val: Number(z5) || 0, color: '#f43f5e' },
  ];
  const total = zones.reduce((a, z) => a + z.val, 0);
  const wrap = document.createElement('div');
  wrap.className = 'zone-bar-wrap';
  if (total <= 0) {
    const empty = document.createElement('span');
    empty.className = 'muted-xs';
    empty.textContent = 'No HR zone stream';
    wrap.appendChild(empty);
    return wrap;
  }
  const bar = document.createElement('div');
  bar.className = 'zone-bar';
  zones.forEach((z) => {
    if (z.val <= 0) return;
    const pct = (z.val / total) * 100;
    const seg = document.createElement('div');
    seg.className = 'zone-seg';
    seg.style.width = pct.toFixed(1) + '%';
    seg.style.background = z.color;
    seg.title = `${z.key}: ${z.val.toFixed(1)} min (${Math.round(pct)}%)`;
    bar.appendChild(seg);
  });
  wrap.appendChild(bar);
  return wrap;
}

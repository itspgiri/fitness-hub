// Safe DOM helpers — zero innerHTML, strict textContent & createElement only.

import { sparkline } from './charts.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'onClick') node.addEventListener('click', v);
    else if (k === 'onChange') node.addEventListener('change', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  list.forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
    else node.appendChild(c);
  });
  return node;
}

export function pill(text, tone = 'muted') {
  return el('span', { class: `pill pill-${tone}`, text });
}

export function legend(items) {
  return el('div', { class: 'legend-row' }, items.map((it) =>
    el('span', { class: 'legend-item' }, [
      el('span', { class: 'legend-swatch', style: { background: it.color } }),
      it.label,
    ]),
  ));
}

export function kpiCard({ label, value, unit = '', sub = '', badge = null, spark = null, color = '#38bdf8', target = null }) {
  const top = el('div', { class: 'kpi-top' }, [
    el('span', { text: label }),
    badge,
  ]);
  const valRow = el('div', { class: 'kpi-val' }, [
    value === null || value === undefined || value === '' ? '—' : String(value),
    unit ? el('span', { class: 'kpi-unit', text: unit }) : null,
  ]);
  const kids = [top, valRow];
  if (sub) kids.push(el('div', { class: 'kpi-sub', text: sub }));
  if (spark && spark.length > 1) kids.push(sparkline({ points: spark, color, target }));
  return el('div', { class: 'kpi-card' }, kids);
}

export function safeExternalLink(url, text) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return el('a', {
      href: u.toString(),
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'chip',
      text,
      style: { textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
    });
  } catch {
    return null;
  }
}

import { $ as byId, svgNode as svg } from './app-utils.js';

// The static directory and route descriptions are the source for all views.
const nodes = new Map([...document.querySelectorAll('#stages li')].map(item => [item.id, {
  id: item.id, title: item.querySelector('h3').textContent, kind: item.querySelector('small').textContent,
  summary: item.querySelector('p').textContent, source: item.querySelector('a').href,
  point: item.dataset.point.split(' ').map(Number),
}]));
const routes = new Map([...document.querySelectorAll('[data-mode]')].map(item => [item.dataset.mode, {
  id: item.dataset.mode, title: item.textContent,
  edges: item.dataset.edges.split(' ').map(pair => {
    const [from, to] = pair.split('-');
    return { from, to };
  }),
}]));
const mode = byId('mode'), stage = byId('stage'), plot = byId('plot');
const compact = matchMedia('(max-width: 600px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const homeYaw = -0.10, homeTilt = 0.12;
let yaw = homeYaw, tilt = homeTilt, drag;
let activeNodes = [], activeEdges = [];

function viewFor(id) {
  const route = routes.get(id);
  const ids = new Set(route.edges.flatMap(({ from, to }) => [from, to]));
  return { nodes: [...nodes.values()].filter(node => ids.has(node.id)), edges: route.edges };
}
function fragment(id) {
  return '#' + new URLSearchParams({ route: mode.value, stage: id });
}
function project([x, y, z]) {
  const depth = x * Math.sin(yaw) + z * Math.cos(yaw);
  const dx = x * Math.cos(yaw) - z * Math.sin(yaw);
  const dy = y * Math.cos(tilt) - depth * Math.sin(tilt);
  const scale = 680 / (680 - (y * Math.sin(tilt) + depth * Math.cos(tilt)));
  return compact.matches ? { x: dy * scale, y: dx * scale * 0.59, scale }
    : { x: dx * scale, y: dy * scale, scale };
}
function position(node) {
  // Parallel evidence lanes have distinct positions on a full scan. The three
  // linear routes spread only the stages taking part across the available view.
  if (mode.value === 'full') return node.point;
  const index = activeNodes.indexOf(node);
  const span = activeNodes.length === 2 ? 375 : 655;
  return [(index / (activeNodes.length - 1) - 0.5) * span,
    index % 2 === 0 ? -42 : 42, index % 2 === 0 ? -20 : 25];
}
function fitPoints(points, frame) {
  const padX = 28, padY = 42;
  const coordinates = [...points.values()];
  const limit = Math.min(1, ...coordinates.flatMap(({ x, y }) => [
    (frame.width / 2 - padX) / Math.max(1, Math.abs(x)),
    (frame.height / 2 - padY) / Math.max(1, Math.abs(y)),
  ]));
  for (const point of coordinates) { point.x *= limit; point.y *= limit; }
  return limit;
}

// Labels stay horizontal as the camera moves. Fit them inside the panel and
// keep them clear of stage markers and earlier labels, starting with selection.
function placeLabels(points, frame) {
  const labels = [...byId('geometry').querySelectorAll('.node text')].map(label => ({
    label, point: points.get(label.parentNode.dataset.stage), bounds: label.getBBox(),
    selected: label.parentNode.dataset.stage === stage.value,
  })).sort((a, b) => Number(b.selected) - Number(a.selected));
  const occupied = [...points.values()].map(({ x, y, scale }) => ({
    left: x - 15 * scale, right: x + 15 * scale, top: y - 14 * scale, bottom: y + 15 * scale,
  }));
  function overlap(a, b) {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }
  for (const { label, point, bounds } of labels) {
    const half = bounds.width / 2 + 4;
    const above = 30 - bounds.y + 3, below = bounds.height - (30 - bounds.y) + 3;
    let best;
    for (const dy of [36, -24, 55, -46, 77, -68, 99, -90]) {
      const y = Math.max(frame.y + above + 2, Math.min(frame.y + frame.height - below - 2, point.y + dy));
      for (const dx of [0, -20, 20, -40, 40, -60, 60, -80, 80]) {
        const x = Math.max(frame.x + half + 2, Math.min(frame.x + frame.width - half - 2, point.x + dx));
        const rect = { left: x - half, right: x + half, top: y - above, bottom: y + below };
        const area = occupied.reduce((sum, other) => sum + overlap(rect, other), 0);
        const cost = 1000 * area + Math.abs(x - point.x) + Math.abs(y - point.y - 36);
        if (!best || cost < best.cost) best = { rect, x, y, cost };
        if (cost === 0) break;
      }
      if (best.cost === 0) break;
    }
    const x = best.x;
    occupied.push(best.rect);
    label.setAttribute('x', x - point.x);
    label.setAttribute('y', best.y - point.y);
    if (Math.abs(best.y - point.y) > 40 || Math.abs(x - point.x) > 18) {
      const leader = svg('path', { class: 'leader', d: 'M0 0L' + (x - point.x) + ',' +
        (best.y - point.y + (best.y > point.y ? -14 : 4)) });
      label.parentNode.prepend(leader);
    }
  }
}
function draw() {
  const short = activeNodes.length === 2;
  const box = compact.matches ? (short ? '-175 -170 350 350' : '-172 -220 344 460')
    : (short ? '-340 -140 680 280' : '-425 -161 850 327');
  plot.setAttribute('viewBox', box);
  const geometry = document.createDocumentFragment();
  // A back plane shares the camera with the stages, making depth visible on rotation.
  const points = new Map(activeNodes.map(node => [node.id, project(position(node))]));
  const frame = plot.viewBox.baseVal;
  const fit = fitPoints(points, frame);
  const tracks = [];
  function track(from, to) {
    const a = project(from), b = project(to);
    tracks.push('M' + a.x * fit + ',' + a.y * fit + 'L' + b.x * fit + ',' + b.y * fit);
  }
  for (let x = -360; x <= 360; x += 60) track([x, -135, -95], [x, 135, -95]);
  for (let y = -135; y <= 135; y += 45) track([-360, y, -95], [360, y, -95]);
  geometry.append(svg('path', { class: 'mesh', d: tracks.join(' ') }));
  for (const edge of activeEdges) {
    const a = points.get(edge.from), b = points.get(edge.to);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 22) continue;
    const inset = (14 * b.scale + 3) / distance;
    const selected = edge.from === stage.value || edge.to === stage.value;
    geometry.append(svg('line', { class: selected ? 'edge active' : 'edge', x1: a.x, y1: a.y,
      x2: b.x - (b.x - a.x) * inset, y2: b.y - (b.y - a.y) * inset, 'marker-end': selected ? 'url(#active-arrow)' : 'url(#arrow)' }));
  }
  for (const node of [...activeNodes].sort((a, b) => points.get(a.id).scale - points.get(b.id).scale)) {
    const p = points.get(node.id);
    const group = svg('g', { class: node.id === stage.value ? 'node selected' : 'node',
      'data-stage': node.id, transform: 'translate(' + p.x + ' ' + p.y + ')' });
    group.append(svg('rect', { x: -45, y: -14, width: 90, height: 48, fill: 'transparent' }));
    const gem = svg('g', { class: 'gem', transform: 'scale(' + p.scale + ')' });
    if (node.id === stage.value) gem.append(svg('ellipse', { class: 'halo', rx: 21, ry: 12 }));
    gem.append(svg('polygon', { class: 'cap', points: '0,-12 12,-5 0,2 -12,-5' }),
      svg('polygon', { class: 'lit', points: '-12,-5 0,2 0,14 -12,6' }),
      svg('polygon', { class: 'shade', points: '0,2 12,-5 12,6 0,14' }));
    group.append(gem);
    const title = svg('text', { y: 30 });
    title.textContent = node.title;
    group.append(title);
    geometry.append(group);
  }
  byId('geometry').replaceChildren(geometry);
  placeLabels(points, frame);
}
function links(label, ids) {
  const row = document.createElement('p');
  const name = document.createElement('strong');
  name.textContent = label;
  row.append(name, document.createElement('br'));
  if (!ids.length) row.append('None on this route');
  for (const id of ids) {
    const link = document.createElement('a');
    link.href = fragment(id);
    link.textContent = nodes.get(id).title;
    row.append(link, ' ');
  }
  return row;
}
function inspect(id) {
  stage.value = activeNodes.some(node => node.id === id) ? id : activeNodes[0].id;
  const node = nodes.get(stage.value);
  byId('focus-name').textContent = node.title;
  byId('focus-kind').textContent = node.kind;
  byId('focus-summary').textContent = node.summary;
  byId('source').href = node.source;
  byId('source').textContent = node.title + ' source';
  byId('handoffs').replaceChildren(
    links('Receives from', activeEdges.filter(edge => edge.to === node.id).map(edge => edge.from)),
    links('Hands off to', activeEdges.filter(edge => edge.from === node.id).map(edge => edge.to)));
  byId('permalink').href = fragment(node.id);
  byId('jump-details').setAttribute('aria-label', 'Stage details for ' + node.title);
  draw();
}
function setRoute(routeId, id) {
  mode.value = routes.has(routeId) ? routeId : 'full';
  const view = viewFor(mode.value);
  activeNodes = view.nodes;
  activeEdges = view.edges;
  byId('route-count').textContent = activeNodes.length + ' stages · ' + activeEdges.length
    + (activeEdges.length === 1 ? ' handoff' : ' handoffs');
  stage.replaceChildren(...activeNodes.map(node => new Option(node.title, node.id)));
  yaw = homeYaw; tilt = homeTilt;
  inspect(id);
}
function follow() {
  const params = new URLSearchParams(location.hash.slice(1));
  setRoute(params.get('route'), params.get('stage'));
}
mode.replaceChildren(...[...routes.values()].map(route => new Option(route.title, route.id)));
mode.addEventListener('change', () => {
  setRoute(mode.value, stage.value);
  history.replaceState(null, '', fragment(stage.value));
});
stage.addEventListener('change', () => {
  inspect(stage.value);
  history.replaceState(null, '', fragment(stage.value));
});
window.addEventListener('hashchange', () => {
  if (location.hash.startsWith('#route=')) {
    const target = new URLSearchParams(location.hash.slice(1));
    if (target.get('route') === mode.value) inspect(target.get('stage'));
    else follow();
    byId('focus-name').focus();
  }
});
function rotate(offset, vertical = 0) {
  yaw = Math.max(-0.68, Math.min(0.68, yaw + offset));
  tilt = Math.max(-0.21, Math.min(0.21, tilt + vertical));
  draw();
}
byId('jump-details').addEventListener('click', () => byId('focus-name').focus());
byId('left').addEventListener('click', () => rotate(-0.17));
byId('right').addEventListener('click', () => rotate(0.17));
byId('reset').addEventListener('click', () => { yaw = homeYaw; tilt = homeTilt; draw(); });
// After a fast graph swipe Chromium can deliver a stationary camera tap's
// touchend without a click. Activate valid taps here and cancel their native
// click, leaving the same button click handlers for mouse and keyboard users.
const camera = document.querySelector('.camera');
let cameraTap;
camera.addEventListener('touchstart', event => {
  const button = event.target.closest('button');
  const touch = event.touches[0];
  cameraTap = event.touches.length === 1 && button ? { button, id: touch.identifier,
    x: touch.clientX, y: touch.clientY } : undefined;
}, { passive: true });
camera.addEventListener('touchmove', event => {
  const touch = event.touches[0];
  if (cameraTap && (event.touches.length !== 1 ||
    Math.hypot(touch.clientX - cameraTap.x, touch.clientY - cameraTap.y) > 8)) cameraTap = undefined;
}, { passive: true });
camera.addEventListener('touchcancel', () => { cameraTap = undefined; });
camera.addEventListener('touchend', event => {
  const tap = cameraTap, touch = event.changedTouches[0];
  cameraTap = undefined;
  if (!tap || !event.cancelable || event.touches.length || touch.identifier !== tap.id ||
    Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > 8 ||
    !tap.button.contains(document.elementFromPoint(touch.clientX, touch.clientY))) return;
  event.preventDefault();
  tap.button.focus({ preventScroll: true });
  tap.button.click();
}, { passive: false });
plot.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: event.clientX,
    startY: event.clientY, node: event.target.closest('[data-stage]')?.dataset.stage, moved: false };
  plot.setPointerCapture(event.pointerId);
});
plot.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  if (Math.hypot(event.clientX - drag.start, event.clientY - drag.startY) > 5) drag.moved = true;
  if (drag.moved && !reduced.matches) {
    rotate((event.clientX - drag.x) / 240, (event.clientY - drag.y) / 400);
    drag.x = event.clientX; drag.y = event.clientY;
  }
});
plot.addEventListener('pointerup', event => {
  if (!drag || drag.id !== event.pointerId) return;
  if (!drag.moved && drag.node) {
    inspect(drag.node);
    history.replaceState(null, '', fragment(stage.value));
  }
  drag = undefined;
});
plot.addEventListener('lostpointercapture', () => { drag = undefined; });
compact.addEventListener('change', draw);
byId('download').addEventListener('click', () => {
  const route = routes.get(mode.value);
  const researchRoute = { id: route.id, title: route.title,
    nodes: activeNodes.map(({ point, ...node }) => node), edges: activeEdges };
  const bytes = JSON.stringify({ data: { researchRoute } }, null, 2) + '\n';
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }));
  const link = document.createElement('a');
  link.download = 'research-route-' + route.id + '.json'; link.href = url; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
byId('explorer').hidden = false;
follow();

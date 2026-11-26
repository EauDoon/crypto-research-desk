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
let yaw = 0, tilt = 0, drag;
let activeNodes = [], activeEdges = [];

function viewFor(id) {
  const route = routes.get(id);
  const ids = new Set(route.edges.flatMap(({ from, to }) => [from, to]));
  return { nodes: [...nodes.values()].filter(node => ids.has(node.id)), edges: route.edges };
}
function fragment(id) {
  return '#' + new URLSearchParams({ route: mode.value, stage: id });
}
function project(node) {
  const [x, y, z] = node.point;
  const depth = x * Math.sin(yaw) + z * Math.cos(yaw);
  const dx = x * Math.cos(yaw) - z * Math.sin(yaw);
  const dy = y * Math.cos(tilt) - depth * Math.sin(tilt);
  const scale = 680 / (680 - (y * Math.sin(tilt) + depth * Math.cos(tilt)));
  return compact.matches ? { x: dy * scale, y: dx * scale * 0.84, scale }
    : { x: dx * scale, y: dy * scale, scale };
}
function draw() {
  plot.setAttribute('viewBox', compact.matches ? '-205 -345 410 690' : '-435 -172 870 344');
  const geometry = document.createDocumentFragment();
  const points = new Map(activeNodes.map(node => [node.id, project(node)]));
  for (const edge of activeEdges) {
    const a = points.get(edge.from), b = points.get(edge.to);
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    if (distance < 22) continue;
    const inset = (10 * b.scale + 3) / distance;
    geometry.append(svg('line', { class: 'edge', x1: a.x, y1: a.y,
      x2: b.x - (b.x - a.x) * inset, y2: b.y - (b.y - a.y) * inset, 'marker-end': 'url(#arrow)' }));
  }
  for (const node of [...activeNodes].sort((a, b) => points.get(a.id).scale - points.get(b.id).scale)) {
    const p = points.get(node.id);
    const group = svg('g', { class: node.id === stage.value ? 'node selected' : 'node',
      'data-stage': node.id, transform: 'translate(' + p.x + ' ' + p.y + ')' });
    group.append(svg('rect', { x: -45, y: -14, width: 90, height: 48, fill: 'transparent' }));
    group.append(svg('circle', { r: 8 * p.scale }));
    const title = svg('text', { y: 26 });
    title.textContent = node.title;
    group.append(title);
    geometry.append(group);
  }
  byId('geometry').replaceChildren(geometry);
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
  draw();
}
function setRoute(routeId, id) {
  mode.value = routes.has(routeId) ? routeId : 'full';
  const view = viewFor(mode.value);
  activeNodes = view.nodes;
  activeEdges = view.edges;
  stage.replaceChildren(...activeNodes.map(node => new Option(node.title, node.id)));
  yaw = 0; tilt = 0;
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
    follow();
    byId('focus-name').focus();
  }
});
function rotate(offset, vertical = 0) {
  yaw = Math.max(-0.68, Math.min(0.68, yaw + offset));
  tilt = Math.max(-0.21, Math.min(0.21, tilt + vertical));
  draw();
}
byId('left').addEventListener('click', () => rotate(-0.17));
byId('right').addEventListener('click', () => rotate(0.17));
byId('reset').addEventListener('click', () => { yaw = 0; tilt = 0; draw(); });
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
follow();
byId('explorer').hidden = false;

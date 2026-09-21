import {
  MAX_PACKET_BYTES, MAX_JSON_INPUT_BYTES, HORIZONS, SCENARIOS, REVIEW_ASSERTIONS,
  parsePacket, validatePacket, blankPacket, timestamp, formatPrice,
  exportMarkdown, repairQueue, evidenceAudit, sourceMatches, filterEvidence, horizonOverview,
  exportScenarioCsv, comparePackets, riskHandoff, restoreResearchDraft, referenceSensitivity,
  validationReceipt, sourceOriginAudit, exportEvidenceCsv, verifyReceipt, exportResearchBundle,
  readResearchBundle, monitoringChecklist, exportMonitoringCsv, renewResearchPacket,
  repairWorksheet, evidenceChronology, evidenceAgeCheck, sourceCitation,
  classifyHypotheticalPrice, intervalProbabilityBounds, comparisonWorksheet, exportRiskWorksheetCsv,
} from './packet.js';
import { examplePacket } from './example.js';
import { $, element, setText, announce, validationError } from './app-utils.js';

export const STORAGE_KEY = 'crypto-research-desk.packet.v1';
export let packet = examplePacket();
export let activeHorizon = '12h';
export let origin = 'Synthetic example';
export let dirty = false;
export let undoHistory = [];
export let pinnedBaseline = null;
export let comparisonBaseline = null;
export let baselineImportSequence = 0;
export let receiptCheckSequence = 0;
export let editorMode = 'details';
export let editorInitial = '';
export let importSequence = 0;
export let lastValidation = '';
export let editorOpener = null;
export let printDetailsState = null;
export let unreadableSavedDraft = null;
export let chartOverflowCleanup = () => {};
export let scenarioOverflowCleanups = [];
export const editor = $('packet-editor');
export const form = $('details-form');
export const reviewLabels = { pending: 'Pending review', deliver: 'Deliver, as recorded', deliver_with_warning: 'Deliver with warning, as recorded', repair: 'Repair required', withhold: 'Withhold' };
export const methodLabels = { basis: 'Probability basis', description: 'Method', sourceWindow: 'Source window',
  observationFrequency: 'Observation frequency', sampleSize: 'Sample size', transformations: 'Transformations',
  regimeAdjustment: 'Regime adjustment', eventAssumptions: 'Event assumptions', limitations: 'Calibration and limits' };
export const sourceFields = [
  ['id', 'Source ID', 'input', 40], ['title', 'Title', 'input', 200], ['url', 'Public HTTPS URL', 'input', 2048],
  ['type', 'Source type', 'select'], ['publishedAt', 'Published at (ISO, with offset)', 'input', 35],
  ['capturedAt', 'Captured at (ISO, with offset)', 'input', 35], ['claim', 'Supported claim', 'textarea', 5000],
  ['excerpt', 'Supplied excerpt', 'textarea', 5000],
];
export const scenarioFields = [
  ['probability', 'Probability (%)'], ['confidence', 'Confidence'], ['driver', 'Driver'],
  ['trigger', 'Observable trigger'], ['invalidation', 'Scenario invalidation'],
];

export function setPacket(next) { packet = next; }
export function setActiveHorizon(next) { activeHorizon = next; }
export function setOrigin(next) { origin = next; }
export function setDirty(next) { dirty = next; }
export function setUndoHistory(next) { undoHistory = next; }
export function pushUndo(snapshot) {
  undoHistory.push(snapshot);
  if (undoHistory.length > 10) undoHistory.shift();
}
export function popUndo() { return undoHistory.pop(); }
export function setPinnedBaseline(next) { pinnedBaseline = next; }
export function setComparisonBaseline(next) { comparisonBaseline = next; }
export function incrementBaselineImportSequence() { baselineImportSequence++; }
export function setBaselineImportSequence(next) { baselineImportSequence = next; }
export function incrementReceiptCheckSequence() { receiptCheckSequence++; }
export function setReceiptCheckSequence(next) { receiptCheckSequence = next; }
export function setEditorMode(next) { editorMode = next; }
export function setEditorInitial(next) { editorInitial = next; }
export function incrementImportSequence() { importSequence++; }
export function setImportSequence(next) { importSequence = next; }
export function setLastValidation(next) { lastValidation = next; }
export function setEditorOpener(next) { editorOpener = next; }
export function setPrintDetailsState(next) { printDetailsState = next; }
export function setUnreadableSavedDraft(next) { unreadableSavedDraft = next; }
export function setChartOverflowCleanup(next) { chartOverflowCleanup = next; }
export function setScenarioOverflowCleanups(next) { scenarioOverflowCleanups = next; }

export function saveLocally() {
  if (!$('remember-packet').checked) return;
  try {
    const serialized = JSON.stringify(packet);
    if (new TextEncoder().encode(serialized).length > MAX_PACKET_BYTES) throw new Error('Too large.');
    localStorage.setItem(STORAGE_KEY, serialized);
    $('app-error').hidden = true;
    setText('storage-status', 'Saved in this browser only. Shared-device users can access this draft. Export a separate backup.');
  } catch {
    setDirty(true);
    $('remember-packet').checked = false;
    setText('storage-status', 'Saving failed. A previous draft may remain. Export the open packet and clear saved data when storage is available.');
    announce('Browser storage is unavailable or full. Your open packet remains in memory; export a backup.', true);
  }
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
export function reviewSignature(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(canonical(value));
  // Normalize sourceIds whitespace too. The form submit handler trims each id,
  // so a packet whose sourceIds contain leading/trailing whitespace is
  // recorded under the form's canonical form. Without the same trim here,
  // a single innocent research edit trips the review-reset guard with the
  // misleading "Save research input changes separately from a new review"
  // error, even though the user never touched the review.
  const normalizedSourceIds = Array.isArray(value.sourceIds)
    ? [...value.sourceIds].map((id) => typeof id === 'string' ? id.trim() : id).sort()
    : value.sourceIds;
  const normalized = {
    ...value,
    sourceIds: normalizedSourceIds,
    assertions: Array.isArray(value.assertions)
      ? [...value.assertions].sort((left, right) => String(left?.id).localeCompare(String(right?.id)))
      : value.assertions,
  };
  return JSON.stringify(canonical(normalized));
}
export function researchChanged(candidate) {
  const withoutReview = value => JSON.stringify(canonical(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'riskReview'))));
  return withoutReview(candidate) !== withoutReview(packet);
}

export function applyPacket(candidate, label, localEdit = false, restoring = false) {
  let reviewReset = false;
  if (localEdit && researchChanged(candidate)) {
    if (reviewSignature(candidate.riskReview) !== reviewSignature(packet.riskReview)) {
      const error = new Error('Save research input changes separately from a new review. The current packet is unchanged; your editor contents are preserved.');
      error.issuePaths = ['riskReview.status'];
      throw error;
    }
    const emptyReview = blankPacket().riskReview;
    reviewReset = reviewSignature(candidate.riskReview) !== reviewSignature(emptyReview);
    candidate.riskReview = emptyReview;
  }
  const now = Date.now();
  const report = validatePacket(candidate, now);
  if (!report.valid) throw validationError(report);
  incrementImportSequence();
  incrementBaselineImportSequence();
  $('app-error').hidden = true;
  setDirty(localEdit ? dirty || JSON.stringify(canonical(candidate)) !== JSON.stringify(canonical(packet)) : false);
  if (!restoring) {
    if (localEdit && JSON.stringify(candidate) !== JSON.stringify(packet)) {
      pushUndo(structuredClone(packet));
    } else if (!localEdit) setUndoHistory([]);
  }
  if (restoring) setDirty(true);
  setPacket(candidate);
  setOrigin(label);
  setComparisonBaseline(null);
  if (pinnedBaseline && (pinnedBaseline.asset.symbol !== packet.asset.symbol || pinnedBaseline.asset.quoteCurrency !== packet.asset.quoteCurrency)) setPinnedBaseline(null);
  // Effects that mutate the live UI are attached by the render and events modules
  // through these well-known hooks; calling them here keeps the applyPacket flow
  // self-contained without circular imports at module-evaluation time.
  onClearComparison();
  onRenderPinnedBaseline();
  onClearSensitivity();
  onClearReceiptCheck();
  onRender(true, now);
  saveLocally();
  return { reviewReset, report };
}

export function confirmReplacement() {
  const current = JSON.stringify(canonical(packet));
  const meaningful = dirty || $('remember-packet').checked || (current !== JSON.stringify(canonical(blankPacket()))
    && current !== JSON.stringify(canonical(examplePacket())));
  return !meaningful || window.confirm('Replace the open research packet? Export a copy first if you need to keep it.');
}

export function field(name) { return form.elements.namedItem(name); }
export function numericInput(id) { return parsePacket('{"value":' + $(id).value + '}').value; }
export function editableFieldForPath(path) {
  const fields = {
    'asset.symbol': 'symbol', 'asset.name': 'name', 'asset.quoteCurrency': 'quoteCurrency', 'asset.venue': 'venue',
    'reference.price': 'price', 'reference.capturedAt': 'capturedAt', 'reference.timezone': 'timezone',
    preparedBy: 'preparedBy', thesis: 'thesis', disconfirmingEvidence: 'disconfirmingEvidence',
    invalidation: 'invalidation', liquidity: 'liquidity',
    'riskReview.status': 'reviewStatus', 'riskReview.reviewer': 'reviewer',
    'riskReview.reviewedAt': 'reviewedAt', 'riskReview.sourceIds': 'sourceIds', 'riskReview.notes': 'reviewNotes',
  };
  if (fields[path]) return field(fields[path]);
  const method = /^method\.(\w+)$/.exec(path);
  if (method) return field('method-' + method[1]);
  const source = /^sources(?:\[(\d+)\])?(?:\.(\w+))?$/.exec(path);
  if (source) return source[1] === undefined ? field('source-0-type') ?? $('add-source')
    : field('source-' + source[1] + '-' + (source[2] ?? 'id'));
  const horizon = /^horizons(?:\[(\d+)\])?(?:\.(status|gapReason|endAt))?$/.exec(path);
  if (horizon) return horizon[2] === 'endAt' ? field('capturedAt')
    : field('horizon-' + (horizon[1] ?? '0') + '-' + (horizon[2] ?? 'status'));
  const scenario = /^horizons\[(\d+)\]\.scenarios(?:\[(\d+)\])?(?:\.(\w+))?$/.exec(path);
  if (scenario) {
    const [horizonIndex, scenarioIndex = '0', key = 'probability'] = scenario.slice(1);
    if (key === 'lower' || key === 'upper') {
      const threshold = scenarioIndex === '0' || (scenarioIndex === '1' && key === 'lower') ? 'bearCeiling' : 'bullFloor';
      return field('horizon-' + horizonIndex + '-' + threshold);
    }
    return field('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-' + key);
  }
  if (/^risks(?:\[|$)/.test(path)) return field('risks');
  if (/^unknowns(?:\[|$)/.test(path)) return field('unknowns');
  if (path === 'asset') return field('symbol');
  if (path === 'reference') return field('price');
  if (path === 'riskReview') return field('reviewStatus');
  const assertion = /^riskReview\.assertions(?:\[(\d+)\])?(?:\.(result|evidence|severity|repair))?$/.exec(path);
  if (assertion) return field('assertion-' + (assertion[1] ?? '0') + '-' + (assertion[2] ?? 'result'));
  return null;
}
export function clearInvalidMarker(target) {
  target.removeAttribute('aria-invalid');
  const describedBy = (target.getAttribute('aria-describedby') || '').split(/\s+/)
    .filter(id => id && id !== 'editor-error');
  if (describedBy.length) target.setAttribute('aria-describedby', describedBy.join(' '));
  else target.removeAttribute('aria-describedby');
}
export function clearEditorError() {
  for (const target of editor.querySelectorAll('[aria-invalid="true"]')) clearInvalidMarker(target);
  $('editor-error').textContent = '';
  $('editor-error').hidden = true;
}
export function markInvalid(target) {
  target.setAttribute('aria-invalid', 'true');
  const describedBy = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  describedBy.add('editor-error');
  target.setAttribute('aria-describedby', [...describedBy].join(' '));
}
export function sourceEditorValues() {
  return [...$('source-editor-list').children].map((_, index) => Object.fromEntries(
    sourceFields.map(([key]) => [key, String(field('source-' + index + '-' + key).value)]),
  ));
}

export function download(contents, type, suffix, filename = null) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = element('a');
  const instant = timestamp(packet.reference.capturedAt);
  const label = instant === null ? 'Undated' : packet.reference.capturedAt.slice(0, 10);
  anchor.href = url;
  anchor.download = filename ?? '(' + label + ')' + (packet.asset.symbol ? packet.asset.symbol + ' ' : '') + suffix;
  anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function importFile(file) {
  const sequence = ++importSequence;
  if (!file) return;
  try {
    if (file.size > MAX_JSON_INPUT_BYTES) throw new Error('The JSON file must be no larger than 320 KiB.');
    let imported;
    try { imported = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error('The packet must be valid UTF-8 JSON without replacement-decoded bytes.'); }
    const parsed = parsePacket(imported);
    const candidate = parsed?.format === 'crypto-research-bundle.v1' ? await readResearchBundle(imported) : parsed;
    const report = validatePacket(candidate);
    if (!report.valid) throw validationError(report);
    if (sequence !== importSequence || !confirmReplacement()) return;
    const applied = applyPacket(candidate, 'Imported packet');
    announce('Packet imported locally. No research data was sent to a server. ' + (applied.report.complete ? 'Structure is complete.' : 'Review the listed data gaps.'));
  } catch (error) { if (sequence === importSequence) announce(error.message, true); }
  finally { $('packet-file').value = ''; }
}

// Hooks installed by the render module at evaluation time. The state module
// holds the hook names; the render module assigns them. This breaks the
// otherwise-circular import between applyPacket (state) and render* (render).
export let onClearComparison = () => {};
export let onRenderPinnedBaseline = () => {};
export let onClearSensitivity = () => {};
export let onClearReceiptCheck = () => {};
export let onRender = () => {};
export function setOnClearComparison(fn) { onClearComparison = fn; }
export function setOnRenderPinnedBaseline(fn) { onRenderPinnedBaseline = fn; }
export function setOnClearSensitivity(fn) { onClearSensitivity = fn; }
export function setOnClearReceiptCheck(fn) { onClearReceiptCheck = fn; }
export function setOnRender(fn) { onRender = fn; }

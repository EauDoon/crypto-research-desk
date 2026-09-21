import {
  HORIZONS, REVIEW_ASSERTIONS, parsePacket, endAt, validatePacket, blankPacket,
  formatPrice, exportMarkdown, exportScenarioCsv, exportEvidenceCsv, exportMonitoringCsv,
  exportRiskWorksheetCsv, repairWorksheet, evidenceChronology, sourceOriginAudit,
  evidenceAudit, evidenceAgeCheck, classifyHypotheticalPrice, intervalProbabilityBounds,
  referenceSensitivity, validationReceipt, verifyReceipt, exportResearchBundle,
  readResearchBundle, monitoringChecklist, comparePackets, comparisonWorksheet, riskHandoff,
  restoreResearchDraft, renewResearchPacket, sourceCitation, MAX_JSON_INPUT_BYTES,
} from './packet.js';
import { examplePacket } from './example.js';
import {
  packet, activeHorizon, dirty, undoHistory, pinnedBaseline, comparisonBaseline,
  baselineImportSequence, receiptCheckSequence, editorMode, editorInitial, editor,
  form, importSequence, printDetailsState, unreadableSavedDraft, lastValidation,
  methodLabels,
  setActiveHorizon, setDirty, popUndo, setPinnedBaseline, setComparisonBaseline,
  incrementBaselineImportSequence, setBaselineImportSequence, incrementReceiptCheckSequence,
  incrementImportSequence, setEditorOpener, setPrintDetailsState, setUnreadableSavedDraft,
  setLastValidation, setReceiptCheckSequence, applyPacket, confirmReplacement,
  saveLocally, STORAGE_KEY, field, numericInput, sourceEditorValues,
  editableFieldForPath, clearEditorError, researchChanged, download, importFile,
} from './app-state.js';
import { $, element, setText, announce, validationError, validationSignature, listInto } from './app-utils.js';
import {
  openEditor, closeEditor, editorSnapshot, editorError, completeEdit,
  populateForm, showHorizonMode, renderSourceEditor, renderReviewSources,
  revealEditorTarget, renderHorizonEditor,
} from './app-editor.js';
import {
  render, renderSources, renderScenarios, refreshHorizonLabels, renderEvidenceAge,
  renderRepairs, renderEvidenceAudit, renderOverview, renderPinnedBaseline, renderMonitoring,
  clearComparison, showComparison, clearSensitivity, clearReceiptCheck,
} from './app-render.js';

function refreshExpiry() {
  const now = Date.now();
  if (document.visibilityState !== 'visible') return now;
  const report = validatePacket(packet, now);
  // Compare against the serialized validation signature, not the lastValidation
  // mutable binding, because a refresh interval in another module can read a
  // stale snapshot and skip re-rendering the live UI.
  const signature = JSON.stringify([report.valid, report.complete, report.chartEligible,
    report.errorCount, report.gapCount, report.warningCount,
    report.omittedIssueCounts, report.errors, report.gaps, report.warnings]);
  if (lastValidation === signature) { renderOverview(now); return now; }
  const activeId = document.activeElement?.id;
  // Keep scenario controls and open editor fields intact when only time has changed.
  render(false, now);
  const focusTarget = activeId ? $(activeId) ?? (activeId === 'chart-scroll' ? $('chart-heading') : null) : null;
  focusTarget?.focus({ preventScroll: true });
  announce('Time-sensitive checks changed. Review the current gaps before using or exporting this packet.');
  return now;
}

function selectHorizon(id, focus = false) {
  setActiveHorizon(id);
  const now = refreshExpiry();
  renderScenarios(); refreshHorizonLabels(now);
  if (focus) $('tab-' + id).focus();
}

function updateNavigation() {
  const hash = window.location.hash || '#workspace';
  for (const link of document.querySelectorAll('.sidebar nav a')) {
    if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

// File / packet lifecycle events
$('load-demo').addEventListener('click', () => {
  if (!confirmReplacement()) return;
  applyPacket(examplePacket(), 'Synthetic example');
  announce('Synthetic example loaded. Every price, probability, source, and review is fictional.');
});
$('new-packet').addEventListener('click', () => {
  if (!confirmReplacement()) return;
  applyPacket(blankPacket(), 'Local draft');
  announce('Blank research packet created. Unsupported forecasts remain incomplete.');
  openEditor('details');
});
$('import-packet').addEventListener('click', () => $('packet-file').click());
$('packet-file').addEventListener('change', event => { void importFile(event.target.files?.[0]); });
$('import-zone').addEventListener('dragover', event => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = Array.from(event.dataTransfer.types).includes('Files') ? 'copy' : 'none';
  }
});
$('import-zone').addEventListener('drop', event => {
  event.preventDefault();
  if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) {
    incrementImportSequence();
    announce('Drop one JSON file at a time.', true);
    return;
  }
  if (event.dataTransfer.files.length !== 1) {
    incrementImportSequence();
    announce('Drop one JSON file at a time.', true);
    return;
  }
  void importFile(event.dataTransfer.files[0]);
});

// Editor events
$('edit-details').addEventListener('click', () => openEditor('details'));
$('edit-json').addEventListener('click', () => openEditor('json'));
$('add-source').addEventListener('click', () => {
  const sources = sourceEditorValues();
  if (sources.length >= 32) return;
  sources.push({ id: '', title: '', url: '', type: 'primary', publishedAt: '', capturedAt: '', claim: '', excerpt: '' });
  clearEditorError(); renderSourceEditor(sources);
  field('source-' + (sources.length - 1) + '-id').focus();
});
$('source-editor-list').addEventListener('click', event => {
  const remove = event.target.closest('button[data-remove-source]');
  if (!remove) return;
  const sources = sourceEditorValues();
  sources.splice(Number(remove.dataset.removeSource), 1);
  clearEditorError(); renderSourceEditor(sources);
  (sources.length ? field('source-' + Math.min(Number(remove.dataset.removeSource), sources.length - 1) + '-id') : $('add-source')).focus();
});
$('horizon-editor-list').addEventListener('change', event => {
  if (!event.target.name?.endsWith('-status')) return;
  clearEditorError();
  showHorizonMode(event.target.closest('details'), event.target.value === 'complete');
});
$('close-editor').addEventListener('click', closeEditor);
editor.addEventListener('cancel', closeEditor);
editor.addEventListener('close', () => {
  const opener = editorOpener?.isConnected ? editorOpener : editorOpener?.id ? $(editorOpener.id) : null;
  (opener?.getClientRects().length ? opener : $('edit-details')).focus({ preventScroll: true });
});
editor.addEventListener('input', event => { if (event.target.matches?.('[aria-invalid="true"]')) clearEditorError(); });
editor.addEventListener('change', event => { if (event.target.matches?.('[aria-invalid="true"]')) clearEditorError(); });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (editorSnapshot() === editorInitial) { editor.close(); announce('No changes were made.'); return; }
  try {
    const candidate = structuredClone(packet);
    const value = name => String(field(name).value);
    const number = (name, path) => {
      if (value(name) === '') return null;
      try { return parsePacket('{"value":' + value(name) + '}').value; }
      catch (error) { error.issuePaths = [path]; throw error; }
    };
    for (const name of ['symbol', 'name', 'quoteCurrency', 'venue']) candidate.asset[name] = value(name);
    candidate.reference = { price: number('price', 'reference.price'), capturedAt: value('capturedAt'), timezone: value('timezone') };
    for (const name of ['preparedBy', 'thesis', 'disconfirmingEvidence', 'invalidation', 'liquidity']) candidate[name] = value(name);
    candidate.method = Object.fromEntries(Object.keys(methodLabels).map(key => [key, value('method-' + key)]));
    candidate.method.sampleSize = number('method-sampleSize', 'method.sampleSize');
    candidate.sources = sourceEditorValues();
    candidate.horizons = HORIZONS.map((definition, horizonIndex) => {
      const status = value('horizon-' + horizonIndex + '-status');
      const horizon = { id: definition.id, endAt: candidate.reference.capturedAt === packet.reference.capturedAt
        ? packet.horizons[horizonIndex].endAt : endAt(candidate.reference.capturedAt, definition.hours), status,
        gapReason: status === 'incomplete' ? value('horizon-' + horizonIndex + '-gapReason') : '', scenarios: [] };
      if (status === 'complete') {
        const bearCeiling = number('horizon-' + horizonIndex + '-bearCeiling', 'horizons[' + horizonIndex + '].scenarios[0].upper');
        const bullFloor = number('horizon-' + horizonIndex + '-bullFloor', 'horizons[' + horizonIndex + '].scenarios[1].upper');
        horizon.scenarios = ['Bear', 'Base', 'Bull'].map((label, scenarioIndex) => ({
          label, lower: [0, bearCeiling, bullFloor][scenarioIndex], upper: [bearCeiling, bullFloor, null][scenarioIndex],
          probability: number('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-probability',
            'horizons[' + horizonIndex + '].scenarios[' + scenarioIndex + '].probability'),
          driver: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-driver'),
          trigger: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-trigger'),
          invalidation: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-invalidation'),
          confidence: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-confidence'),
        }));
      }
      return horizon;
    });
    for (const name of ['risks', 'unknowns']) {
      if (value(name) !== packet[name].join('\n')) {
        if (packet[name].some(item => /[\r\n]/.test(item))) {
          const error = new Error('The existing ' + name + ' list contains a multiline entry. Edit that list in the full packet editor to preserve its structure.');
          error.issuePaths = [name];
          throw error;
        }
        candidate[name] = value(name).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      }
    }
    candidate.riskReview = {
      status: value('reviewStatus'), reviewer: value('reviewer'), reviewedAt: value('reviewedAt'),
      notes: value('reviewNotes'), sourceIds: value('sourceIds').split(',').map(item => item.trim()).filter(Boolean),
      assertions: REVIEW_ASSERTIONS.map((definition, index) => ({
        id: definition.id, ...Object.fromEntries(['result', 'evidence', 'severity', 'repair'].map(key => [key, value('assertion-' + index + '-' + key)])),
      })),
    };
    completeEdit(candidate);
  } catch (error) { editorError(error); }
});
$('apply-json').addEventListener('click', () => {
  try { completeEdit(parsePacket($('packet-json').value)); } catch (error) { editorError(error, $('packet-json')); }
});
$('copy-json').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
    await navigator.clipboard.writeText(JSON.stringify(packet, null, 2) + '\n');
    announce('Raw JSON copied locally. The open packet was not changed or uploaded.');
  } catch {
    announce('Clipboard access failed. Use Export JSON to keep the raw packet.', true);
  }
});

// Export / print events
$('export-json').addEventListener('click', () => {
  download(JSON.stringify(packet, null, 2) + '\n', 'application/json', 'Research Packet.json');
  announce('JSON export prepared. Keep the downloaded file as your portable research record.');
});
$('export-brief').addEventListener('click', () => {
  try {
    download(exportMarkdown(packet), 'text/markdown; charset=utf-8', 'Research Brief.md');
    announce('Brief export prepared, including unresolved gaps. Use Print / PDF for the chart.');
  } catch (error) { announce(error.message, true); }
});
window.addEventListener('beforeprint', () => {
  if (printDetailsState) return;
  setPrintDetailsState([...document.querySelectorAll('details')].map(node => [node, node.open]));
  render(false);
  for (const [node] of printDetailsState) node.open = true;
});
window.addEventListener('afterprint', () => {
  if (!printDetailsState) return;
  for (const [node, open] of printDetailsState) if (node.isConnected) node.open = open;
  setPrintDetailsState(null);
});
$('print-packet').addEventListener('click', () => window.print());

// Local storage events
$('remember-packet').addEventListener('change', () => {
  if ($('remember-packet').checked) saveLocally();
  else {
    try {
      const hadSavedDraft = localStorage.getItem(STORAGE_KEY) !== null;
      localStorage.removeItem(STORAGE_KEY);
      if (hadSavedDraft) setDirty(true);
      setText('storage-status', hadSavedDraft
        ? 'Saved draft removed. The open packet is still in memory; export it before closing.'
        : 'No saved draft was present. The open packet is unchanged.');
    } catch {
      $('remember-packet').checked = true;
      announce('Saved draft removal failed. Storage is unavailable; a previous draft may remain.', true);
    }
  }
});
$('recover-saved').addEventListener('click', () => {
  if (unreadableSavedDraft === null) return;
  download(JSON.stringify({ storageKey: STORAGE_KEY, rawValue: unreadableSavedDraft }, null, 2) + '\n',
    'application/json; charset=utf-8', '', 'Unparsed Saved Research Draft.json');
  announce('A recovery wrapper containing the raw saved value was downloaded without changing browser storage. Treat it as untrusted data.');
});
$('clear-saved').addEventListener('click', () => {
  const prompt = unreadableSavedDraft === null ? 'Remove this app’s saved browser draft? The open packet will stay in memory.'
    : 'Permanently remove the unreadable saved draft? Download its raw data first if you may need to recover it.';
  if (!window.confirm(prompt)) return;
  try {
    const openPacketWasRemembered = $('remember-packet').checked;
    const hadSavedDraft = localStorage.getItem(STORAGE_KEY) !== null;
    localStorage.removeItem(STORAGE_KEY);
    setUnreadableSavedDraft(null);
    if (openPacketWasRemembered) setDirty(true);
    $('remember-packet').checked = false;
    $('remember-packet').disabled = false;
    $('recover-saved').hidden = true;
    $('app-error').hidden = true;
    setText('storage-status', hadSavedDraft
      ? 'Saved draft removed. The open packet remains in memory. Other browser storage was not changed.'
      : 'No saved draft was present. The open packet and other browser storage were not changed.');
    announce(hadSavedDraft
      ? 'This app’s saved draft was removed. Export the open packet if you need a backup.'
      : 'There was no saved draft to remove. The open packet is unchanged.');
  } catch { announce('Saved draft removal failed. A previous draft may remain; check browser storage settings.', true); }
});

// Window-level events
window.addEventListener('resize', () => {
  if (!editor.open) return;
  requestAnimationFrame(() => {
    const target = editorMode === 'json' ? $('packet-json') : document.activeElement;
    if (target instanceof HTMLElement && $('editor-scroll').contains(target)) revealEditorTarget(target);
  });
});
$('horizon-tabs').addEventListener('click', event => {
  const tab = event.target.closest('button[data-horizon]');
  if (tab) selectHorizon(tab.dataset.horizon, true);
});
$('horizon-tabs').addEventListener('keydown', event => {
  const index = HORIZONS.findIndex(item => item.id === activeHorizon);
  const next = { ArrowRight: (index + 1) % 4, ArrowLeft: (index + 3) % 4, Home: 0, End: 3 }[event.key];
  if (next !== undefined) { event.preventDefault(); selectHorizon(HORIZONS[next].id, true); }
});
window.addEventListener('hashchange', updateNavigation);
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  setDirty(true);
  $('remember-packet').checked = false;
  $('remember-packet').disabled = true;
  $('clear-saved').disabled = true;
  setText('storage-status', 'Browser storage changed in another tab. Saving and clearing are locked until reload.');
  announce('Another tab changed the saved draft. Your open packet is unchanged. Export it, then reload before saving or clearing.');
});
window.addEventListener('beforeunload', event => {
  if ((dirty && !$('remember-packet').checked) || (editor.open && editorSnapshot() !== editorInitial)) {
    event.preventDefault(); event.returnValue = '';
  }
});

// Source filter events
$('source-search').addEventListener('input', renderSources);
$('source-type').addEventListener('change', renderSources);
$('source-coverage').addEventListener('change', renderSources);

// Evidence events
$('evidence-age-limit').addEventListener('input', () => renderEvidenceAge());
$('export-repairs').addEventListener('click', () => {
  try { download(JSON.stringify(repairWorksheet(packet), null, 2) + '\n', 'application/json; charset=utf-8', 'Repair Worksheet.json'); announce('Repair worksheet exported with exact field paths and any omitted issue counts.'); }
  catch (error) { announce(error.message, true); }
});
$('export-csv').addEventListener('click', () => {
  try {
    download(exportScenarioCsv(packet), 'text/csv; charset=utf-8', 'Scenario Research.csv');
    announce('Scenario CSV prepared with packet cutoff, research labels, and gate status.');
  } catch (error) { announce(error.message, true); }
});
$('export-evidence-csv').addEventListener('click', () => {
  try { download(exportEvidenceCsv(packet), 'text/csv; charset=utf-8', 'Evidence.csv'); announce('Complete evidence CSV prepared. Filters do not remove records; review coverage remains self-reported.'); }
  catch (error) { announce(error.message, true); }
});

// Comparison events
$('clear-comparison').addEventListener('click', clearComparison);
$('compare-packets').addEventListener('click', () => {
  setComparisonBaseline(null); $('export-comparison').disabled = true;
  try { showComparison(parsePacket($('comparison-json').value)); }
  catch (error) { $('comparison-results').replaceChildren(); setText('comparison-status', error.message); }
});
$('comparison-json').addEventListener('input', () => {
  setComparisonBaseline(null); $('export-comparison').disabled = true; $('comparison-results').replaceChildren(); $('comparison-status').textContent = '';
});
$('export-comparison').addEventListener('click', () => {
  try {
    if (!comparisonBaseline) throw new Error('Compare a valid previous packet before exporting.');
    download(JSON.stringify(comparisonWorksheet(comparisonBaseline, packet), null, 2) + '\n', 'application/json; charset=utf-8', 'Comparison Worksheet.json');
    announce('Comparison worksheet exported with both full packets and explicit change-list omission counts.');
  } catch (error) { announce(error.message, true); }
});

// Risk events
$('export-risk-handoff').addEventListener('click', () => {
  try {
    download(JSON.stringify(riskHandoff(packet), null, 2) + '\n', 'application/json; charset=utf-8', 'Independent Review Handoff.json');
    announce('Incomplete risk handoff prepared. Attach the mandate, run ledger, and conflict receipts before independent review.');
  } catch (error) { announce(error.message, true); }
});
$('export-risk-worksheet').addEventListener('click', () => {
  try { download(exportRiskWorksheetCsv(packet), 'text/csv; charset=utf-8', 'Submitted Risk Worksheet.csv'); announce('Submitted assertion worksheet exported. Non-PASS assertions appear first by severity. Reviewer identity and evidence remain unverified.'); }
  catch (error) { announce(error.message, true); }
});

// Undo event
$('undo-edit').addEventListener('click', () => {
  if (!undoHistory.length) return;
  try {
    const restored = restoreResearchDraft(undoHistory.at(-1));
    popUndo();
    applyPacket(restored, 'Restored session edit', false, true);
    announce('Previous research inputs restored. Review reset to pending. Undo history is memory-only and ends when the page closes or a packet is replaced.');
  } catch (error) { announce(error.message, true); }
});

// Sensitivity events
$('classification-price').addEventListener('input', () => { $('classification-results').replaceChildren(); $('classification-status').textContent = ''; });
for (const id of ['probability-lower', 'probability-upper']) $(id).addEventListener('input', () => { $('probability-results').replaceChildren(); $('probability-status').textContent = ''; });
$('calculate-probability-bounds').addEventListener('click', () => {
  try {
    if (!$('probability-lower').value.trim()) throw new Error('Enter the included lower price. Leave only the upper price blank for an unbounded interval.');
    const lower = numericInput('probability-lower'), upper = $('probability-upper').value.trim() ? numericInput('probability-upper') : null;
    listInto('probability-results', intervalProbabilityBounds(packet, lower, upper).map(row =>
      row.horizon + ': ' + row.minimumPercent + '% to ' + row.maximumPercent + '%'), 'No eligible scenarios.');
    setText('probability-status', 'Bounds for [' + formatPrice(lower) + ', ' + (upper === null ? 'unbounded' : formatPrice(upper)) + ') ' + packet.asset.quoteCurrency + '. Submitted interval masses only; no distribution within a scenario is assumed.');
  } catch (error) { $('probability-results').replaceChildren(); setText('probability-status', error.message); }
});
$('classify-price').addEventListener('click', () => {
  try {
    if (!$('classification-price').value.trim()) throw new Error('Enter a hypothetical price, including 0 when intended.');
    const price = numericInput('classification-price');
    listInto('classification-results', classifyHypotheticalPrice(packet, price).map(row =>
      row.horizon + ': ' + row.scenario + ', ' + row.range + '; submitted interval probability ' + row.intervalProbability + '%'), 'No eligible scenarios.');
    setText('classification-status', 'Hypothetical price ' + formatPrice(price) + ' ' + packet.asset.quoteCurrency + '. Probabilities describe whole intervals, not this exact price. Research and review are unchanged.');
  } catch (error) { $('classification-results').replaceChildren(); setText('classification-status', error.message); }
});
$('calculate-sensitivity').addEventListener('click', () => {
  try {
    const rows = referenceSensitivity(packet, numericInput('sensitivity-price'));
    const percent = value => (Math.abs(value) > 1e8 ? value.toExponential(3) : value.toFixed(3)) + '%';
    listInto('sensitivity-results', rows.map(item => item.label + ': bear ceiling ' + percent(item.bearDistance) + '; bull floor ' + percent(item.bullDistance)), 'No eligible thresholds.');
    setText('sensitivity-status', 'Hypothetical arithmetic only. Original packet, probabilities, and review are unchanged.');
  } catch (error) { $('sensitivity-results').replaceChildren(); setText('sensitivity-status', error.message); }
});

// Receipt events
$('export-receipt').addEventListener('click', async () => {
  const button = $('export-receipt'); button.disabled = true;
  const snapshot = structuredClone(packet);
  try {
    const receipt = await validationReceipt(snapshot);
    download(JSON.stringify(receipt, null, 2) + '\n', 'application/json; charset=utf-8', '', snapshot.asset.symbol + ' Research Check Receipt.json');
    announce('Check receipt prepared for the packet snapshot at click time. Export matching packet JSON to reproduce its SHA-256.');
  } catch (error) { announce('Check receipt unavailable: ' + error.message, true); }
  finally { button.disabled = false; }
});

// Baseline events
$('pin-baseline').addEventListener('click', () => {
  incrementBaselineImportSequence();
  if (!packet.asset.symbol) { announce('Name the asset before pinning a comparison baseline.', true); return; }
  setPinnedBaseline(structuredClone(packet)); renderPinnedBaseline();
});
$('clear-baseline').addEventListener('click', () => { incrementBaselineImportSequence(); setPinnedBaseline(null); clearComparison(); renderPinnedBaseline(); });
$('export-baseline').addEventListener('click', () => {
  if (!pinnedBaseline) return;
  download(JSON.stringify(pinnedBaseline, null, 2) + '\n', 'application/json; charset=utf-8', '', pinnedBaseline.asset.symbol + ' Comparison Baseline.json');
  announce('Pinned baseline exported as standard packet JSON. Import it as a baseline to compare without replacing the open packet.');
});
$('import-baseline').addEventListener('click', () => $('baseline-file').click());
$('baseline-file').addEventListener('change', async event => {
  const sequence = incrementBaselineImportSequence(), file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_JSON_INPUT_BYTES) throw new Error('Baseline JSON must be no larger than 320 KiB.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    const parsed = parsePacket(text);
    const candidate = parsed.format === 'crypto-research-bundle.v1' ? await readResearchBundle(text) : parsed;
    if (sequence !== baselineImportSequence) return;
    comparePackets(candidate, packet);
    setPinnedBaseline(structuredClone(candidate)); clearComparison(); renderPinnedBaseline();
    announce('Comparison baseline imported locally. The open packet and its submitted review were not replaced.');
  } catch (error) { if (sequence === baselineImportSequence) announce('Baseline import failed: ' + error.message + ' The prior baseline and open packet remain unchanged.', true); }
  finally { if ($('baseline-file').files?.[0] === file) $('baseline-file').value = ''; }
});

// Review source picker events
$('review-source-picker').addEventListener('toggle', () => { if ($('review-source-picker').open) renderReviewSources(); });
field('sourceIds').addEventListener('input', renderReviewSources);

// Receipt verification events
$('receipt-json').addEventListener('input', () => { incrementReceiptCheckSequence(); $('receipt-result').textContent = ''; $('verify-receipt').disabled = false; });
$('verify-receipt').addEventListener('click', async () => {
  const sequence = incrementReceiptCheckSequence(); $('verify-receipt').disabled = true;
  try {
    const result = await verifyReceipt($('receipt-json').value, structuredClone(packet));
    if (sequence !== receiptCheckSequence) return;
    setText('receipt-result', 'Packet digest: ' + (result.digestMatches ? 'MATCH' : 'MISMATCH') + '. Recorded local checks: ' + (result.recordMatches ? 'MATCH' : 'MISMATCH') + '. Current chart gate: ' + (result.currentChartEligible ? 'eligible, unauthenticated' : 'withheld') + '. This is not authentication.');
  } catch (error) { if (sequence === receiptCheckSequence) setText('receipt-result', error.message); }
  finally { if (sequence === receiptCheckSequence) $('verify-receipt').disabled = false; }
});
$('export-bundle').addEventListener('click', async () => {
  const button = $('export-bundle'); button.disabled = true; const snapshot = structuredClone(packet);
  try { download(await exportResearchBundle(snapshot), 'application/json; charset=utf-8', '', (snapshot.asset.symbol || 'Unnamed') + ' Research Bundle.json'); announce('Packet and matching check receipt exported together. Import JSON accepts this bundle and rechecks its contents locally.'); }
  catch (error) { announce(error.message, true); }
  finally { button.disabled = false; }
});

// Renewal event
$('renew-packet').addEventListener('click', () => {
  if (!confirmReplacement()) return;
  try {
    const draft = renewResearchPacket(packet);
    // Research edits must carry the prior review into the guarded reset path.
    // When research is already renewed, retain the renewal helper's blank review.
    if (researchChanged(draft)) draft.riskReview = structuredClone(packet.riskReview);
    applyPacket(draft, 'Renewal draft', true);
    openEditor('details');
    setText('editor-help', 'Renewal preserves dated sources and research as unverified starting material. Supply a new reference and newly supported scenarios. Old probabilities and review were cleared; undo can restore previous research inputs.');
    const target = field('price'); target.focus({ preventScroll: true }); revealEditorTarget(target);
    announce('Renewal draft created. All four forecasts are incomplete and the review is pending. Carried-forward evidence has not been refreshed.');
  } catch (error) { announce(error.message, true); }
});

// Make updateNavigation and refreshExpiry reachable to the bootstrap module.
export { updateNavigation, refreshExpiry };

setInterval(refreshExpiry, 60000);
document.addEventListener('visibilitychange', refreshExpiry);

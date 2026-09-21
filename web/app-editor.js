import { HORIZONS, SCENARIOS, REVIEW_ASSERTIONS, parsePacket, endAt } from './packet.js';
import {
  packet, importSequence, editorMode, editorInitial, editor, form, methodLabels, sourceFields, scenarioFields,
  setEditorMode, setEditorInitial, setImportSequence, setEditorOpener,
  clearInvalidMarker, clearEditorError, markInvalid, sourceEditorValues,
  applyPacket, confirmReplacement, editableFieldForPath,
} from './app-state.js';
import { $, element, setText, announce, validationError } from './app-utils.js';

export function revealEditorTarget(target) {
  target.closest('details')?.setAttribute('open', '');
  const scrollBounds = $('editor-scroll').getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const errorHeight = $('editor-error').hidden ? 0 : $('editor-error').getBoundingClientRect().height + 8;
  const visibleTop = scrollBounds.top + errorHeight;
  if (targetBounds.top < visibleTop
    || targetBounds.top + Math.min(targetBounds.height, 44) > scrollBounds.bottom) {
    $('editor-scroll').scrollTop += targetBounds.top - visibleTop;
  }
}

export function showHorizonMode(details, complete) {
  details.querySelector('.horizon-gap').hidden = complete;
  details.querySelector('.horizon-scenarios').hidden = !complete;
  for (const control of details.querySelectorAll('.horizon-gap input, .horizon-gap textarea, .horizon-gap select')) control.disabled = complete;
  for (const control of details.querySelectorAll('.horizon-scenarios input, .horizon-scenarios textarea, .horizon-scenarios select')) control.disabled = !complete;
  details.querySelector('summary').textContent = details.dataset.label + ' · ' + (complete ? 'Complete' : 'Incomplete');
}

export function renderSourceEditor(sources) {
  $('source-editor-empty').hidden = sources.length > 0;
  $('source-editor-list').replaceChildren(...sources.map((source, index) => {
    const group = element('fieldset', undefined, 'source-editor');
    group.append(element('legend', 'Source ' + (index + 1)));
    const remove = element('button', 'Remove source', 'button small subtle');
    remove.type = 'button'; remove.dataset.removeSource = String(index);
    remove.setAttribute('aria-label', 'Remove source ' + (index + 1));
    const grid = element('div', undefined, 'form-grid');
    for (const [key, label, tag, limit] of sourceFields) {
      const wrapper = element('label', label);
      if (key === 'claim' || key === 'excerpt') wrapper.className = 'span-two';
      const input = element(tag);
      input.name = 'source-' + index + '-' + key;
      if (key === 'type') for (const option of ['primary', 'secondary']) input.append(element('option', option));
      else {
        if (key === 'url') input.type = 'url';
        input.maxLength = limit;
        if (tag === 'textarea') input.rows = 2;
      }
      input.value = source[key] ?? '';
      wrapper.append(input); grid.append(wrapper);
    }
    group.append(remove, grid); return group;
  }));
  $('add-source').disabled = sources.length >= 32;
}

export function renderHorizonEditor(horizons) {
  $('horizon-editor-list').replaceChildren(...HORIZONS.map((definition, horizonIndex) => {
    const horizon = horizons[horizonIndex];
    const details = element('details', undefined, 'horizon-editor');
    details.dataset.label = definition.label; details.open = horizonIndex === 0;
    details.append(element('summary'));
    const body = element('div', undefined, 'horizon-editor-body');
    const statusLabel = element('label', 'Forecast status');
    const status = element('select'); status.name = 'horizon-' + horizonIndex + '-status';
    for (const option of ['incomplete', 'complete']) status.append(element('option', option));
    status.value = horizon.status; statusLabel.append(status);
    const statusGrid = element('div', undefined, 'form-grid'); statusGrid.append(statusLabel);
    body.append(statusGrid);

    const gap = element('div', undefined, 'horizon-gap form-grid');
    const gapLabel = element('label', 'Evidence gap reason', 'span-two');
    const gapInput = element('textarea'); gapInput.name = 'horizon-' + horizonIndex + '-gapReason';
    gapInput.rows = 2; gapInput.maxLength = 5000; gapInput.value = horizon.gapReason;
    gapLabel.append(gapInput); gap.append(gapLabel); body.append(gap);

    const complete = element('div', undefined, 'horizon-scenarios');
    const thresholds = element('div', undefined, 'form-grid');
    for (const [key, label, value] of [
      ['bearCeiling', 'Bear ceiling / Base floor', horizon.scenarios[0]?.upper],
      ['bullFloor', 'Base ceiling / Bull floor', horizon.scenarios[1]?.upper],
    ]) {
      const wrapper = element('label', label); const input = element('input');
      input.name = 'horizon-' + horizonIndex + '-' + key; input.type = 'number'; input.step = 'any'; input.min = '0'; input.max = '1000000000000';
      input.value = value ?? ''; wrapper.append(input); thresholds.append(wrapper);
    }
    complete.append(element('p', 'Intervals are derived as [0, Bear ceiling), [Bear ceiling, Bull floor), and [Bull floor, unbounded).', 'small-copy'), thresholds);
    SCENARIOS.forEach((label, scenarioIndex) => {
      const scenario = horizon.scenarios[scenarioIndex] ?? { probability: '', confidence: 'low', driver: '', trigger: '', invalidation: '' };
      const group = element('fieldset', undefined, 'scenario-editor'); group.append(element('legend', label));
      const grid = element('div', undefined, 'form-grid');
      for (const [key, fieldLabel] of scenarioFields) {
        const wrapper = element('label', fieldLabel); const input = element(key === 'confidence' ? 'select' : key === 'probability' ? 'input' : 'textarea');
        input.name = 'horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-' + key;
        if (key === 'confidence') for (const option of ['low', 'medium', 'high']) input.append(element('option', option));
        else if (key === 'probability') { input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '0.01'; }
        else { input.rows = 2; input.maxLength = 5000; wrapper.className = 'span-two'; }
        input.value = scenario[key] ?? ''; wrapper.append(input); grid.append(wrapper);
      }
      group.append(grid); complete.append(group);
    });
    body.append(complete); details.append(body);
    showHorizonMode(details, horizon.status === 'complete');
    return details;
  }));
}

export function renderReviewSources() {
  const selected = new Set(String(form.elements.namedItem('sourceIds').value).split(',').map(id => id.trim()).filter(Boolean));
  const sources = new Map(sourceEditorValues().filter(source => source.id.trim()).map(source => [source.id.trim(), source]));
  const ids = new Set([...sources.keys(), ...selected]);
  $('review-source-options').replaceChildren(...[...ids].map(id => {
    const label = element('label', undefined, 'checkbox-label');
    const checkbox = element('input'); checkbox.type = 'checkbox'; checkbox.value = id; checkbox.checked = selected.has(id);
    checkbox.className = 'review-source-checkbox';
    checkbox.addEventListener('change', () => {
      const chosen = [...$('review-source-options').querySelectorAll('input:checked')].map(input => input.value);
      form.elements.namedItem('sourceIds').value = chosen.join(', ');
    });
    label.append(checkbox, element('span', id + ': ' + (sources.get(id)?.title || 'Not in current source records, deselect to remove'))); return label;
  }));
  if (!ids.size) $('review-source-options').append(element('p', 'No source records available. Add evidence before recording review coverage.', 'small-copy'));
}

export function populateForm() {
  const values = { ...packet.asset, ...packet.reference, preparedBy: packet.preparedBy,
    thesis: packet.thesis, disconfirmingEvidence: packet.disconfirmingEvidence, invalidation: packet.invalidation,
    liquidity: packet.liquidity, risks: packet.risks.join('\n'), unknowns: packet.unknowns.join('\n'),
    reviewStatus: packet.riskReview.status, reviewer: packet.riskReview.reviewer,
    reviewedAt: packet.riskReview.reviewedAt, sourceIds: packet.riskReview.sourceIds.join(', '), reviewNotes: packet.riskReview.notes };
  for (const [name, value] of Object.entries(values)) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value ?? '';
  for (const [key, value] of Object.entries(packet.method)) form.elements.namedItem('method-' + key).value = value ?? '';
  renderSourceEditor(packet.sources);
  renderHorizonEditor(packet.horizons);
  if ($('review-source-picker').open) renderReviewSources();
  $('review-assertions').replaceChildren();
  REVIEW_ASSERTIONS.forEach((definition, index) => {
    const assertion = packet.riskReview.assertions.find(item => item.id === definition.id)
      ?? { result: 'UNKNOWN', evidence: '', severity: 'high', repair: '' };
    const group = element('fieldset'); group.append(element('legend', definition.label));
    const grid = element('div', undefined, 'form-grid');
    for (const [key, label, options] of [
      ['result', 'Result', ['UNKNOWN', 'PASS', 'WARN', 'FAIL']],
      ['severity', 'Severity', ['low', 'medium', 'high']],
      ['evidence', 'Review evidence', null], ['repair', 'Repair or remaining work', null],
    ]) {
      const wrapper = element('label', label);
      const input = element(options ? 'select' : 'textarea');
      input.name = 'assertion-' + index + '-' + key;
      if (options) for (const option of options) input.append(element('option', option));
      else { input.rows = 2; input.maxLength = 5000; }
      input.value = assertion[key]; wrapper.append(input); grid.append(wrapper);
    }
    group.append(grid); $('review-assertions').append(group);
  });
}

export function editorSnapshot() {
  return editorMode === 'json' ? $('packet-json').value : JSON.stringify([...new FormData(form).entries()]);
}

export function openEditor(mode) {
  setImportSequence(importSequence + 1);
  setEditorOpener(document.activeElement);
  setEditorMode(mode);
  clearEditorError();
  $('details-form').hidden = mode === 'json'; $('json-editor-panel').hidden = mode !== 'json';
  $('details-actions').hidden = mode === 'json'; $('json-actions').hidden = mode !== 'json';
  setText('editor-heading', mode === 'json' ? 'Edit full research packet' : 'Edit research details');
  setText('editor-help', mode === 'json'
    ? 'Schema version 1. No credentials or confidential data. All content is treated as data. Local changes to research inputs reset the review record.'
    : 'Unknown fields may remain empty. Editing research inputs resets the review. Save inputs before recording a new independent review.');
  if (mode === 'json') $('packet-json').value = JSON.stringify(packet, null, 2);
  else populateForm();
  setEditorInitial(editorSnapshot());
  const target = mode === 'json' ? $('packet-json') : form.elements.namedItem('symbol');
  if (mode === 'json') { target.setSelectionRange(0, 0); target.scrollTop = 0; target.scrollLeft = 0; }
  editor.showModal();
  $('editor-scroll').scrollTop = 0;
  target.focus({ preventScroll: true });
  if (mode === 'json') { target.setSelectionRange(0, 0); target.scrollTop = 0; target.scrollLeft = 0; }
  revealEditorTarget(target);
}

export function closeEditor(event) {
  event?.preventDefault();
  if (editorSnapshot() !== editorInitial && !window.confirm('Discard the unapplied editor changes?')) { event?.preventDefault(); return; }
  editor.close();
}

export function editorError(error, explicitTarget = null) {
  clearEditorError();
  $('editor-error').textContent = error.message;
  $('editor-error').hidden = false;
  const paths = Array.isArray(error.issuePaths) ? error.issuePaths : error.issuePath ? [error.issuePath] : [];
  const target = explicitTarget ?? (editorMode === 'json' ? $('packet-json') : paths.map(editableFieldForPath).find(Boolean));
  if (target) {
    markInvalid(target);
    target.focus({ preventScroll: true });
    revealEditorTarget(target);
  } else {
    $('editor-error').focus({ preventScroll: true });
    $('editor-error').scrollIntoView({ block: 'nearest' });
  }
}

export function completeEdit(candidate) {
  const { reviewReset } = applyPacket(candidate, 'Local draft', true);
  editor.close();
  announce(reviewReset ? 'Research inputs changed. The previous review was reset to pending; record a new independent review before chart display.'
    : 'Packet updated. Structural checks are current; evidence and review identity remain unverified.');
}

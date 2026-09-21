import { baselineImportSequence, STORAGE_KEY, setPacket, setOrigin, setDirty, setUnreadableSavedDraft, editableFieldForPath } from './app-state.js';
import { parsePacket, validatePacket } from './packet.js';
import { $, setText, announce, supportsPageMarginIdentity } from './app-utils.js';
import { renderPinnedBaseline, render } from './app-render.js';
import { updateNavigation } from './app-events.js';

// Restore a saved draft from localStorage if one exists. A corrupt or invalid
// draft is preserved so the user can recover its raw bytes; no overwrite.
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    setUnreadableSavedDraft(saved);
    const candidate = parsePacket(saved);
    if (!validatePacket(candidate).valid) throw new Error('Invalid saved packet.');
    setPacket(candidate);
    setOrigin('Restored browser draft');
    $('remember-packet').checked = true;
    setText('storage-status', 'Restored from this browser. Shared-device users can access the saved draft.');
    setUnreadableSavedDraft(null);
  }
} catch {
  $('remember-packet').disabled = true;
  $('recover-saved').hidden = baselineImportSequence === 0;
  setText('storage-status', 'Browser storage is unavailable. Local saving is disabled.');
  announce('The saved draft could not be loaded. It was not deleted or overwritten. A synthetic example is shown; local saving is locked.', true);
}

// Initial render of the live UI. Wrapped in a try/catch so an unhandled render
// failure still removes the app-unavailable class and hides the startup status.
try {
  renderPinnedBaseline();
  render();
  updateNavigation();
} finally {
  document.documentElement.classList.toggle('page-margin-identity', supportsPageMarginIdentity());
  $('startup-status').hidden = true;
  document.documentElement.classList.remove('app-unavailable');
}

// Tiny self-check: ensure the editable field lookup covers the common paths
// the editor exposes. Tests live elsewhere; this just makes a missing path
// obvious in the console when the editor first opens.
for (const path of ['asset.symbol', 'thesis', 'reference.price', 'riskReview.status', 'sources[0].id', 'horizons[0].status']) {
  if (!editableFieldForPath(path) && document.body.contains($('edit-details'))) {
    console.warn('No editor field mapped for path', path);
  }
}

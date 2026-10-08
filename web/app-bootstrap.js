import { STORAGE_KEY, setPacket, setOrigin, setUnreadableSavedDraft } from './app-state.js';
import { parsePacket, validatePacket } from './packet.js';
import { $, setText, announce, supportsPageMarginIdentity } from './app-utils.js';
import { renderPinnedBaseline, render } from './app-render.js';
import { updateNavigation } from './app-events.js';

// Restore a saved draft from localStorage if one exists. Storage that cannot be
// read and a draft that cannot be used are different failures and are reported
// separately. A corrupt or invalid draft is preserved so the user can recover
// its raw bytes; nothing is deleted or overwritten.
let saved = null;
let storageReadable = true;
try {
  saved = localStorage.getItem(STORAGE_KEY);
} catch {
  storageReadable = false;
}
if (!storageReadable) {
  $('remember-packet').disabled = true;
  $('recover-saved').hidden = true;
  setText('storage-status', 'Browser storage is unavailable. Local saving is disabled.');
  announce('Browser storage is unavailable. A synthetic example is shown and local saving is disabled.', true);
} else if (saved !== null) {
  try {
    setUnreadableSavedDraft(saved);
    const candidate = parsePacket(saved);
    if (!validatePacket(candidate).valid) throw new Error('Invalid saved packet.');
    setPacket(candidate);
    setOrigin('Restored browser draft');
    $('remember-packet').checked = true;
    setText('storage-status', 'Restored from this browser. Shared-device users can access the saved draft.');
    setUnreadableSavedDraft(null);
  } catch {
    $('remember-packet').disabled = true;
    $('recover-saved').hidden = false;
    setText('storage-status', 'The saved draft is unreadable. It was kept unchanged; download or clear it before saving again.');
    announce('The saved draft could not be loaded. It was not deleted or overwritten. A synthetic example is shown; local saving is locked.', true);
  }
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

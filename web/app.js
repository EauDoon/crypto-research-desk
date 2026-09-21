// Public entry point for the research workbench UI.
// The module is split into focused siblings (state, render, editor, events,
// bootstrap). Each sibling is loaded for its side effects; the original public
// import surface is preserved as the re-exports below.
import './app-state.js';
import './app-render.js';
import './app-editor.js';
import './app-events.js';
import './app-bootstrap.js';

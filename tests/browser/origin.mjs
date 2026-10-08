// The one loopback origin the browser suite serves and guards. Set
// BROWSER_TEST_PORT to run the suite while another local server holds the
// default preview port; every guard and probe follows this value.
const configured = process.env.BROWSER_TEST_PORT ?? '4173';
if (!/^[1-9]\d{0,4}$/.test(configured) || Number(configured) > 65535) {
  throw new Error('BROWSER_TEST_PORT must be a TCP port from 1 to 65535.');
}
export const PREVIEW_PORT = Number(configured);
export const PREVIEW_ORIGIN = 'http://127.0.0.1:' + PREVIEW_PORT;

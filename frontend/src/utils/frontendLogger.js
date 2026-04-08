/**
 * Frontend Log Buffer — ring buffer that captures bridge traffic,
 * JS errors, and key component lifecycle events.
 *
 * Exposed as window._frontendLogs (string[]) so Python can read it
 * via runJavaScript for the "Logs kopieren" debug report.
 */

const MAX_ENTRIES = 200;
const MAX_DATA_LEN = 100;

let buffer = [];

function pad(n) {
  return String(n).padStart(2, '0');
}

function timestamp() {
  const d = new Date();
  return (
    pad(d.getHours()) + ':' +
    pad(d.getMinutes()) + ':' +
    pad(d.getSeconds()) + '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

function truncate(val) {
  if (val === undefined || val === null) return '';
  let s = typeof val === 'string' ? val : JSON.stringify(val);
  if (s.length > MAX_DATA_LEN) {
    s = s.substring(0, MAX_DATA_LEN) + '…';
  }
  return s;
}

/**
 * Add a log entry.
 * @param {string} source — e.g. 'ankiReceive', 'bridgeAction', 'error'
 * @param {string|object} message — free-form or object (will be truncated)
 */
export function frontendLog(source, message) {
  const entry = `${timestamp()} [${source}] ${truncate(message)}`;
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
  // Keep window reference in sync
  window._frontendLogs = buffer;
}

/**
 * Initialize the logger: expose buffer on window, install global
 * error handlers. Call once from main.jsx before React renders.
 */
export function initFrontendLogger() {
  window._frontendLogs = buffer;
  // Expose log function globally so modules without direct import
  // (e.g. actions.js) can call it without circular dependencies.
  window._frontendLog = frontendLog;

  frontendLog('init', 'Frontend logger initialized');

  // Global JS errors
  window.addEventListener('error', (event) => {
    frontendLog('error', `${event.message} at ${event.filename}:${event.lineno}`);
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    frontendLog('error', `unhandledrejection: ${msg}`);
  });
}

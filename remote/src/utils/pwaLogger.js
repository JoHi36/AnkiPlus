/**
 * PWA Logger — Ring buffer with copy-to-clipboard support.
 * Logs relay connection events so we can debug pairing issues.
 */

const MAX_ENTRIES = 150;
const _logs = [];

function _ts() {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function pwaLog(source, message) {
  const entry = `${_ts()} [${source}] ${message}`;
  _logs.push(entry);
  if (_logs.length > MAX_ENTRIES) _logs.shift();
}

export function getPwaLogs() {
  return _logs.slice();
}

export function copyPwaLogs() {
  const text = [
    'AnkiPlus PWA Debug Logs',
    `URL: ${window.location.href}`,
    `Token: ${localStorage.getItem('ankiplus-remote-token') ? 'present (' + localStorage.getItem('ankiplus-remote-token').substring(0, 8) + '...)' : 'none'}`,
    `Time: ${new Date().toISOString()}`,
    '============================================================',
    ..._logs,
  ].join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

// Capture unhandled errors
window.addEventListener('error', (e) => {
  pwaLog('error', `${e.message} at ${e.filename}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  pwaLog('error', `unhandled rejection: ${e.reason}`);
});

pwaLog('init', 'PWA logger initialized');

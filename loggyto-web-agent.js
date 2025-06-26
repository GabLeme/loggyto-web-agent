(function () {
  function getConfig() {
    const script = document.currentScript || [...document.getElementsByTagName('script')].pop();
    return {
      endpoint: script.getAttribute('data-endpoint'),
      apiKey: script.getAttribute('data-api-key'),
      apiSecret: script.getAttribute('data-api-secret')
    };
  }

  const { endpoint, apiKey, apiSecret } = getConfig();

  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  const originalConsole = {};

  levels.forEach((level) => {
    originalConsole[level] = console[level];
  });

  if (!endpoint || !apiKey || !apiSecret) return;

  const LOG_ENDPOINT = new URL(endpoint).pathname;

  function generateMessageId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  function isSelfLogging(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.pathname === LOG_ENDPOINT;
    } catch {
      return false;
    }
  }

  function sendLoggytoLog(level, message, labels = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      messageId: generateMessageId(),
      message,
      level: level.toUpperCase(),
      timestampInferred: false,
      labels
    };

    // Protege contra logar a própria falha de envio
    try {
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'x-api-secret': apiSecret
        },
        body: JSON.stringify(payload)
      }).catch(() => { /* silencioso */ });
    } catch (_) { /* silencioso */ }
  }

  // Interceptar console
  levels.forEach((level) => {
    const original = originalConsole[level];
    console[level] = function (...args) {
      original.apply(console, args);
      try {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
        sendLoggytoLog(level, message, { type: 'console' });
      } catch (_) { /* silencioso */ }
    };
  });

  // window.onerror
  window.onerror = function (msg, url, lineNo, columnNo, error) {
    if (isSelfLogging(url)) return;

    sendLoggytoLog('error', msg, {
      type: 'window.onerror',
      url,
      lineNo: lineNo?.toString(),
      columnNo: columnNo?.toString(),
      stack: error?.stack || ''
    });
  };

  // window.onunhandledrejection
  window.onunhandledrejection = function (event) {
    sendLoggytoLog('error', 'Unhandled Promise rejection', {
      type: 'unhandledrejection',
      reason: typeof event.reason === 'object' ? JSON.stringify(event.reason) : event.reason
    });
  };

  // Interceptar fetch
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const requestUrl = args[0];
      if (isSelfLogging(requestUrl)) {
        return originalFetch(...args);
      }

      const response = await originalFetch(...args);
      if (!response.ok) {
        sendLoggytoLog('warn', `Fetch to ${response.url} failed with status ${response.status}`, {
          type: 'fetch',
          status: response.status.toString()
        });
      }
      return response;
    } catch (err) {
      const requestUrl = args[0];
      if (!isSelfLogging(requestUrl)) {
        sendLoggytoLog('error', `Fetch failed: ${err.message}`, {
          type: 'fetch'
        });
      }
      throw err;
    }
  };
})();

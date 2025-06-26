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

  if (!endpoint || !apiKey || !apiSecret) {
    console.warn('[Loggyto Agent] Config missing: endpoint/apiKey/apiSecret');
    return;
  }

  function generateMessageId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
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

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-api-secret': apiSecret
      },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach((level) => {
    const original = console[level];
    console[level] = function (...args) {
      original.apply(console, args);
      const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
      sendLoggytoLog(level, message, { type: 'console' });
    };
  });

  window.onerror = function (msg, url, lineNo, columnNo, error) {
    sendLoggytoLog('error', msg, {
      type: 'window.onerror',
      url,
      lineNo: lineNo?.toString(),
      columnNo: columnNo?.toString(),
      stack: error?.stack || ''
    });
  };

  window.onunhandledrejection = function (event) {
    sendLoggytoLog('error', 'Unhandled Promise rejection', {
      type: 'unhandledrejection',
      reason: typeof event.reason === 'object' ? JSON.stringify(event.reason) : event.reason
    });
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);
      if (!response.ok) {
        sendLoggytoLog('warn', `Fetch to ${response.url} failed with status ${response.status}`, {
          type: 'fetch',
          status: response.status.toString()
        });
      }
      return response;
    } catch (err) {
      sendLoggytoLog('error', `Fetch failed: ${err.message}`, {
        type: 'fetch'
      });
      throw err;
    }
  };
})();

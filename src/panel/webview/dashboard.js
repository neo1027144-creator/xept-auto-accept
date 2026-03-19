// Xept Dashboard — Webview frontend logic (Vanilla JS)
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();
  let state = null;

  // ── Message handling ─────────────────────────────

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'stateUpdate') {
      state = msg.payload;
      render(state);
    }
  });

  // ── Render ───────────────────────────────────────

  function render(s) {
    // Status
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'status-indicator ' + (s.isRunning ? (s.health === 'reconnecting' ? 'reconnecting' : 'running') : 'stopped');
    text.textContent = s.isRunning ? 'Running' : 'Stopped';

    document.getElementById('click-count').textContent = s.clickCount.toString();
    const cdpEl = document.getElementById('cdp-status');
    cdpEl.textContent = s.health === 'connected' ? '● Connected' : s.health === 'reconnecting' ? '◐ Reconnecting' : '○ Disconnected';

    // Toggles
    setChecked('toggle-autoAcceptFileEdits', s.config.autoAcceptFileEdits);
    setChecked('toggle-autoRun', s.config.autoRun);
    setChecked('toggle-autoAllow', s.config.autoAllow);
    setChecked('toggle-autoRetryEnabled', s.config.autoRetryEnabled);

    // Tag lists
    renderTags('blocked-list', 'blockedCommands', s.config.blockedCommands || []);
    renderTags('allowed-list', 'allowedCommands', s.config.allowedCommands || []);
    renderTags('custom-list', 'customButtonTexts', s.config.customButtonTexts || []);

    // Advanced
    const slider = document.getElementById('delay-slider');
    const delayVal = s.config.acceptDelay != null ? s.config.acceptDelay : 2000;
    slider.value = delayVal;
    document.getElementById('delay-value').textContent = (delayVal / 1000).toFixed(1) + 's';

    // Logs
    renderLogs(s.logs);
  }

  function setChecked(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function renderTags(containerId, configKey, items) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    items.forEach((item, index) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.innerHTML = `<span>${escapeHtml(item)}</span><span class="tag-remove" data-key="${configKey}" data-index="${index}">×</span>`;
      container.appendChild(tag);
    });
  }

  function renderLogs(logs) {
    const container = document.getElementById('log-list');
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div class="log-empty">No activity yet</div>';
      return;
    }
    container.innerHTML = logs.map(l =>
      `<div class="log-entry"><span class="log-time">${escapeHtml(l.time)}</span><span class="log-icon">${l.icon}</span><span class="log-text">${escapeHtml(l.text)}</span></div>`
    ).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Event listeners ──────────────────────────────

  // Toggle switches
  ['autoAcceptFileEdits', 'autoRun', 'autoAllow', 'autoRetryEnabled'].forEach(key => {
    const el = document.getElementById('toggle-' + key);
    if (el) {
      el.addEventListener('change', () => {
        vscode.postMessage({ type: 'toggleConfig', key, value: el.checked });
      });
    }
  });

  // Tag remove (delegated)
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList && target.classList.contains('tag-remove')) {
      const key = target.dataset.key;
      const index = parseInt(target.dataset.index, 10);
      vscode.postMessage({ type: 'removeListItem', key, index });
    }
  });

  // Tag add buttons
  setupAddButton('blocked-add', 'blocked-input', 'blockedCommands');
  setupAddButton('allowed-add', 'allowed-input', 'allowedCommands');
  setupAddButton('custom-add', 'custom-input', 'customButtonTexts');

  function setupAddButton(btnId, inputId, configKey) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    const doAdd = () => {
      const value = input.value.trim();
      if (value) {
        vscode.postMessage({ type: 'addListItem', key: configKey, value });
        input.value = '';
      }
    };

    btn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });
  }

  // Delay slider (debounced)
  let delayTimer = null;
  const delaySlider = document.getElementById('delay-slider');
  if (delaySlider) {
    delaySlider.addEventListener('input', () => {
      const val = parseInt(delaySlider.value, 10);
      document.getElementById('delay-value').textContent = (val / 1000).toFixed(1) + 's';
      clearTimeout(delayTimer);
      delayTimer = setTimeout(() => {
        vscode.postMessage({ type: 'updateConfig', key: 'acceptDelay', value: val });
      }, 300);
    });
  }



  // Advanced section toggle
  const advToggle = document.getElementById('advanced-toggle');
  const advBody = document.getElementById('advanced-body');
  const chevron = advToggle ? advToggle.querySelector('.chevron') : null;
  if (advToggle && advBody) {
    advToggle.addEventListener('click', () => {
      advBody.classList.toggle('collapsed');
      if (chevron) chevron.classList.toggle('collapsed');
    });
  }

  // ── Init ─────────────────────────────────────────

  vscode.postMessage({ type: 'ready' });
})();

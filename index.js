(async function autoClicker() {
  // ===== Utilities =====
  const delay = (ms) => new Promise(res => setTimeout(res, ms));
  const q  = (sel, root=document) => root.querySelector(sel);
  const qa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const isEnabled = (el) =>
    !!el && el.disabled !== true && el.getAttribute?.('aria-disabled') !== 'true';

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style && style.display !== 'none' && style.visibility !== 'hidden' && !!el.offsetParent;
  };

  const safeLog = (msg) => { try { console.log(msg); } catch {} };

  function realClick(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
    try {
      el.dispatchEvent?.(new PointerEvent('pointerdown', { bubbles: true }));
      el.dispatchEvent?.(new MouseEvent('mousedown',   { bubbles: true }));
      el.dispatchEvent?.(new PointerEvent('pointerup', { bubbles: true }));
      el.dispatchEvent?.(new MouseEvent('mouseup',     { bubbles: true }));
    } catch {}
    try { el.click(); return true; } catch { return false; }
  }

  async function waitForEnabled(selector, timeoutMs = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = q(selector);
      if (isEnabled(el)) return el;
      await delay(100);
    }
    return null;
  }

  function buttonByText(text, scope=document) {
    const btns = qa('button', scope);
    // Prefer buttons inside obvious popups (e.g., .action-panel) if present
    const actionPanels = qa('.action-panel');
    for (const panel of actionPanels) {
      const b = qa('button', panel).find(b => b.textContent.trim() === text && isVisible(b) && isEnabled(b));
      if (b) return b;
    }
    return btns.find(b => b.textContent.trim() === text && isVisible(b) && isEnabled(b)) || null;
  }

  async function waitAndClosePopup(text='Close', timeoutMs=7000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const b = buttonByText(text);
      if (b) { realClick(b); safeLog('Popup closed.'); return true; }
      await delay(100);
    }
    return false;
  }

  // ===== Stamina (Recharge) =====
  function findStaminaBox() {
    return qa('.top-bar .resources-wrapper .resource-box')
      .find(box => q('img[src*="stamina"]', box)) || null;
  }

  function parseStamina(box) {
    const span = q('.resource-text', box);
    if (!span) return null;
    const m = span.textContent.trim().match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return { current: parseInt(m[1], 10), max: parseInt(m[2], 10) };
  }

  function setNativeValue(el, value) {
    try {
      const proto = Object.getPrototypeOf(el);
      const desc  = Object.getOwnPropertyDescriptor(proto, 'value');
      const setter = desc && desc.set;
      if (setter) setter.call(el, String(value));
      else el.value = String(value);
    } catch { el.value = String(value); }
  }

  async function ensureStamina() {
    try {
      const box = findStaminaBox();
      if (!box) return;

      const s = parseStamina(box);
      if (!s) return;
      const { current, max } = s;
      if (current >= max) return;

      const need = Math.max(1, max - current);
      const plus = q('img.plus-button', box);
      if (!plus) return;

      safeLog(`Stamina low (${current}/${max}) → recharging ${need}.`);
      realClick(plus);
      await delay(300);

      // Wait for input field
      let input = null;
      for (let i = 0; i < 40; i++) {
        input = q('input.counter-input[type="number"]');
        if (input) break;
        await delay(100);
      }
      if (!input) return;

      // React-safe value set + events
      input.focus();
      setNativeValue(input, need);
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      await delay(200);

      // Wait for enabled Exchange
      let exchange = await waitForEnabled('button.menu-energy-btn', 5000);

      // Fallback: try minimal 1 if still disabled
      if (!exchange) {
        input.focus();
        setNativeValue(input, 1);
        input.dispatchEvent(new Event('input',  { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
        exchange = await waitForEnabled('button.menu-energy-btn', 3000);
      }

      if (!exchange) { safeLog('Exchange did not enable — skipping recharge.'); return; }

      realClick(exchange);
      safeLog('Exchange button clicked.');
      await delay(500);

      // Close the Transaction Result popup
      await waitAndClosePopup('Close', 7000);
      await delay(300);
    } catch (e) {
      safeLog('Stamina routine error — continuing.');
    }
  }

  // ===== Main loop =====
  await delay(300); // let UI settle

  while (true) {
    try {
      const items = qa('.left-scroll-list img');
      for (const el of items) {
        // 1) Ensure stamina
        await ensureStamina();

        // 2) Activate item
        realClick(el);
        await delay(1000);

        const panel = q('.right-detail-panel') || document;

        // 3) ACTION: Claim / Mine
        const actionBtn = q('.mine-button', panel);
        const label = actionBtn?.textContent?.trim();

        // Claim (only if enabled)
        if (label === 'Claim' && isEnabled(actionBtn)) {
          realClick(actionBtn);
          safeLog('Claim button clicked.');
          await delay(1000);
          continue;
        }

        // Mine (only if enabled)
        if (label === 'Mine' && isEnabled(actionBtn)) {
          realClick(actionBtn);
          safeLog('Mine button clicked.');
          await delay(10000);                // wait for completion & popup
          await waitAndClosePopup('Close', 5000); // close Mine popup if present

          // Try Repair if it becomes enabled shortly after mining
          const repairReady = await waitForEnabled('.right-detail-panel .repair-button:not([disabled])', 5000);
          if (repairReady) {
            realClick(repairReady);
            safeLog('Repair button clicked.');
            await delay(10000);                  // wait after repair
            await waitAndClosePopup('Close', 5000); // close Repair popup if present
          }

          continue;
        }

        // 4) If Mine not enabled → try Repair (enabled only)
        const repairBtn = q('.right-detail-panel .repair-button:not([disabled])', panel);
        if (isEnabled(repairBtn)) {
          realClick(repairBtn);
          safeLog('Repair button clicked.');
          await delay(10000);
          await waitAndClosePopup('Close', 5000);
        }
      }
    } catch (e) {
      safeLog('Loop error — continuing.');
    }
  }
})();

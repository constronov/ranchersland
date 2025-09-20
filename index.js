(async function autoClicker() {
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  const q  = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // --- helpers ---
  function isEnabled(el) {
    return !!el && el.disabled !== true && el.getAttribute('aria-disabled') !== 'true';
  }

  function realClick(el) {
    if (!isEnabled(el)) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }));
      el.click();
      return true;
    } catch {
      try { el.click(); return true; } catch { return false; }
    }
  }

  function getEnabledButtonByText(text) {
    return qa('button').find(b => b.textContent.trim() === text && isEnabled(b)) || null;
  }

  async function waitForEnabled(selector, timeoutMs = 3000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const el = q(selector);
      if (isEnabled(el)) return el;
      await delay(100);
    }
    return null;
  }

  async function waitAndClosePopup(text = 'Close', timeoutMs = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const btn = getEnabledButtonByText(text);
      if (btn) {
        realClick(btn);
        console.log('Popup closed.');
        return true;
      }
      await delay(100);
    }
    return false;
  }

  // --- stamina ---
  function findStaminaBox() {
    return qa('.top-bar .resources-wrapper .resource-box')
      .find(box => q('img[src*="stamina"]', box)) || null;
  }
  function parseStaminaFromBox(box) {
    const span = q('.resource-text', box);
    if (!span) return null;
    const m = span.textContent.trim().match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return { current: parseInt(m[1], 10), max: parseInt(m[2], 10) };
  }
  async function ensureStamina() {
    const box = findStaminaBox(); if (!box) return;
    const s = parseStaminaFromBox(box); if (!s) return;
    const { current, max } = s;
    if (current >= max) return;

    const need = max - current;
    const plus = q('img.plus-button', box); if (!plus) return;

    console.log(`Stamina low (${current}/${max}) → recharging ${need}.`);
    realClick(plus);
    await delay(300);

    // wait for the input
    let input = null;
    for (let i = 0; i < 30; i++) {
      input = q('input.counter-input[type="number"]');
      if (input) break;
      await delay(100);
    }
    if (!input) return;

    input.focus();
    input.value = String(need);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const exchangeBtn = await waitForEnabled('button.menu-energy-btn', 7000);
    if (!exchangeBtn) return;
    realClick(exchangeBtn);
    console.log('Exchange button clicked.');
    await delay(800);
  }

  // --- main loop ---
  await delay(300);

  while (true) {
    const items = qa('.left-scroll-list img');
    for (const el of items) {
      // 1) stamina
      await ensureStamina();

      // 2) activate item
      realClick(el);
      await delay(1000);

      const panel = q('.right-detail-panel') || document;

      // buttons (enabled only)
      const actionBtn = q('.mine-button:not([disabled])', panel);
      const claimBtn  = actionBtn && actionBtn.textContent.trim() === 'Claim' ? actionBtn : null;
      const mineBtn   = actionBtn && actionBtn.textContent.trim() === 'Mine'  ? actionBtn : null;

      // Claim
      if (isEnabled(claimBtn)) {
        realClick(claimBtn);
        console.log('Claim button clicked.');
        await delay(1000);
        continue;
      }

      // Mine
      if (isEnabled(mineBtn)) {
        realClick(mineBtn);
        console.log('Mine button clicked.');
        await delay(10000); // wait for completion/popup

        // Close popup after Mine (if present)
        await waitAndClosePopup('Close', 5000);

        // Try Repair if it becomes enabled within 3s
        const repairAfterMine = await waitForEnabled('.right-detail-panel .repair-button:not([disabled])', 3000);
        if (repairAfterMine) {
          realClick(repairAfterMine);
          console.log('Repair button clicked.');
          await delay(10000); // wait after repair

          // Close popup after Repair (if present)
          await waitAndClosePopup('Close', 5000);
        }

        continue;
      }

      // If Mine is not enabled, try Repair ONLY if enabled
      const repairBtn = q('.right-detail-panel .repair-button:not([disabled])', panel);
      if (isEnabled(repairBtn)) {
        realClick(repairBtn);
        console.log('Repair button clicked.');
        await delay(10000); // wait after repair

        // Close popup after Repair (if present)
        await waitAndClosePopup('Close', 5000);
      }
    }
  }
})();

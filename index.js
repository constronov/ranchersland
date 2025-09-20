async function ensureStamina() {
  try {
    const q  = (sel, root = document) => root.querySelector(sel);
    const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    function isEnabled(el) {
      return !!el && el.disabled !== true && el.getAttribute?.('aria-disabled') !== 'true';
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
    async function waitForEnabled(selector, timeoutMs = 5000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const el = q(selector);
        if (isEnabled(el)) return el;
        await delay(100);
      }
      return null;
    }
    function realClick(el) {
      if (!isEnabled(el)) return false;
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown',   { bubbles: true }));
        el.dispatchEvent(new PointerEvent('pointerup',   { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup',     { bubbles: true }));
        el.click();
        return true;
      } catch {
        try { el.click(); return true; } catch { return false; }
      }
    }
    async function waitAndClosePopup(text = 'Close', timeoutMs = 7000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const btn = qa('button').find(b => b.textContent.trim() === text && isEnabled(b));
        if (btn) { realClick(btn); console.log('Recharge popup closed.'); return true; }
        await delay(100);
      }
      return false;
    }

    // find stamina box via stamina icon
    const staminaBox = qa('.top-bar .resources-wrapper .resource-box')
      .find(box => q('img[src*="stamina"]', box));
    if (!staminaBox) return;

    // parse "current/max"
    const span = q('.resource-text', staminaBox);
    if (!span) return;
    const m = span.textContent.trim().match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return;
    const current = parseInt(m[1], 10);
    const max     = parseInt(m[2], 10);
    if (!(current < max)) return;

    const need = Math.max(1, max - current);
    const plusBtn = q('img.plus-button', staminaBox);
    if (!plusBtn) return;

    console.log(`Stamina low (${current}/${max}) → recharging ${need}.`);
    realClick(plusBtn);
    await delay(300);

    // wait for input
    let input = null;
    for (let i = 0; i < 40; i++) {
      input = q('input.counter-input[type="number"]');
      if (input) break;
      await delay(100);
    }
    if (!input) return;

    // set value (React-safe) and trigger events
    input.focus();
    setNativeValue(input, need);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    await delay(150);

    // enable & click Exchange
    let exchangeBtn = await waitForEnabled('button.menu-energy-btn', 5000);
    if (!exchangeBtn) {
      // fallback: try minimal value 1
      input.focus();
      setNativeValue(input, 1);
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      exchangeBtn = await waitForEnabled('button.menu-energy-btn', 3000);
    }
    if (!exchangeBtn) { console.log('Exchange button did not enable.'); return; }

    realClick(exchangeBtn);
    console.log('Exchange button clicked.');
    await delay(500);

    // NEW: close "Transaction Result" popup (Close button)
    await waitAndClosePopup('Close', 7000);
    await delay(300);
  } catch {
    console.log('Error in ensureStamina, continuing.');
  }
}

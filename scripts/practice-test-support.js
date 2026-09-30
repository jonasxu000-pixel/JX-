const { createRuntime } = require('../game/runtime');

function createMockContext() {
  const texts = [];
  const base = { texts, fillText(text) { texts.push(String(text)); }, measureText(text) { return { width: Array.from(String(text)).reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.55), 0) * (parseInt(this.font.match(/\d+/), 10) || 14) }; } };
  return new Proxy(base, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  } });
}

function createTestRuntime(width = 375, height = 667, context) {
  const storage = {};
  const ctx = context || createMockContext();
  const wx = {
    createCanvas() { return { getContext() { return ctx; } }; },
    getSystemInfoSync() { return { screenWidth: width, screenHeight: height, pixelRatio: 1, statusBarHeight: 20 }; },
    getMenuButtonBoundingClientRect() { return { bottom: 56, right: width - 20 }; },
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = JSON.parse(JSON.stringify(value)); },
    showModal(options) { this.modal = options; },
    showToast() {},
  };
  const runtime = createRuntime(wx);
  return { runtime, wx, storage, ctx };
}

module.exports = { createMockContext, createTestRuntime };

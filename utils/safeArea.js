const DEFAULT_CONTENT_TOP = 28;

function getMenuButtonRect(wxApi) {
  if (!wxApi || typeof wxApi.getMenuButtonBoundingClientRect !== 'function') return null;
  try {
    const rect = wxApi.getMenuButtonBoundingClientRect();
    if (!rect || !Number.isFinite(rect.bottom) || rect.bottom <= 0) return null;
    return rect;
  } catch (err) {
    return null;
  }
}

function getContentTop(wxApi, gap = 12) {
  const menuRect = getMenuButtonRect(wxApi);
  if (menuRect) return Math.ceil(menuRect.bottom + gap);

  if (wxApi && typeof wxApi.getSystemInfoSync === 'function') {
    try {
      const system = wxApi.getSystemInfoSync() || {};
      if (Number.isFinite(system.statusBarHeight) && system.statusBarHeight > 0) {
        return Math.ceil(system.statusBarHeight + 44 + gap);
      }
    } catch (err) {
      // Fall through to the stable layout used by older clients and tests.
    }
  }

  return DEFAULT_CONTENT_TOP;
}

module.exports = {
  DEFAULT_CONTENT_TOP,
  getContentTop,
  getMenuButtonRect,
};

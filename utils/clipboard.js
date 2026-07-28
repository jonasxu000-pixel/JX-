function copyText(wxApi, text) {
  return new Promise((resolve, reject) => {
    if (!wxApi || typeof wxApi.setClipboardData !== 'function') {
      reject(new Error('当前微信版本不支持复制'));
      return;
    }

    try {
      wxApi.setClipboardData({
        data: String(text),
        success: resolve,
        fail(err) {
          reject(new Error((err && (err.errMsg || err.message)) || '复制失败'));
        },
      });
    } catch (err) {
      reject(err);
    }
  });
}

function readClipboardText(wxApi) {
  return new Promise((resolve, reject) => {
    if (!wxApi || typeof wxApi.getClipboardData !== 'function') {
      reject(new Error('当前微信版本不支持读取剪贴板'));
      return;
    }

    try {
      wxApi.getClipboardData({
        success(res) {
          resolve(String((res && res.data) || ''));
        },
        fail(err) {
          reject(new Error((err && (err.errMsg || err.message)) || '读取剪贴板失败'));
        },
      });
    } catch (err) {
      reject(err);
    }
  });
}

function extractRoomId(text) {
  const match = String(text || '').match(/(?:^|\D)(\d{6})(?!\d)/);
  return match ? match[1] : '';
}

function showToast(wxApi, title, icon = 'none') {
  if (!wxApi || typeof wxApi.showToast !== 'function') return;
  wxApi.showToast({
    title,
    icon,
    duration: 1600,
  });
}

module.exports = {
  copyText,
  extractRoomId,
  readClipboardText,
  showToast,
};

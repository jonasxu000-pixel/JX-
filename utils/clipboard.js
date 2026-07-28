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
  showToast,
};

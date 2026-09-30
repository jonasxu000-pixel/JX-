const KEY = 'qiyu_room_session_v1';
function read(wxApi) {
  try {
    const data = wxApi && wxApi.getStorageSync && wxApi.getStorageSync(KEY);
    if (!data || !/^\d{6}$/.test(String(data.roomId || '')) || !/^[a-f0-9]{36}$/i.test(String(data.viewId || '')) || !['host','guest'].includes(data.role) || !Number.isFinite(data.at) || Date.now() - data.at > (data.waiting ? 30 * 60 * 1000 : 6 * 60 * 60 * 1000)) return null;
    return { roomId: data.roomId, viewId: data.viewId, role: data.role, color: data.role === 'host' ? 'black' : 'white', waiting: Boolean(data.waiting) };
  } catch (_) { return null; }
}
function save(wxApi, scene, status = 'playing') {
  try {
    if (wxApi && wxApi.setStorageSync) wxApi.setStorageSync(KEY, { roomId: scene.roomId, viewId: scene.viewId, role: scene.role, at: Date.now(), waiting: status === 'waiting' });
  } catch (_) { /* Recovery is optional; room actions remain server-authoritative. */ }
}
function clear(wxApi, roomId) {
  const current = read(wxApi);
  if (!current || current.roomId !== roomId) return;
  try { wxApi.setStorageSync(KEY, null); } catch (_) { /* Next entry revalidates with the server. */ }
}
module.exports = { KEY, read, save, clear };

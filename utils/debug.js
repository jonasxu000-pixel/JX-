/**
 * Debug Toolkit - 联机对战调试工具
 * 挂载到 window 对象，方便在控制台直接调用
 * 用法：checkRoomView('36 位 viewId')
 */

const db = wx.cloud.database();

/**
 * 1. 查看当前云环境
 */
function checkEnv() {
  const env = wx.cloud.database().config.env;
  console.log('✅ 当前云环境 ID:', env);
  return env;
}

/**
 * 2. 查看当前用户 OpenId
 */
function checkOpenId() {
  console.log('⏳ 正在获取 OpenId...');
  return wx.cloud.callFunction({ name: 'login' }).then(res => {
    const openid = res.result.openid;
    console.log('✅ 当前用户 OpenId:', openid);
    return openid;
  }).catch(err => {
    console.error('❌ 获取 OpenId 失败:', err);
    return null;
  });
}

/**
 * 3. 查看客户端可见的脱敏房间状态
 * @param {string} viewId
 */
function checkRoomView(viewId) {
  if (!viewId) {
    console.warn('️ 请传入创建或加入房间后返回的 viewId');
    return Promise.resolve();
  }
  console.log(`⏳ 正在查询房间脱敏视图: ${viewId}`);
  return db.collection('roomViews').doc(viewId).get().then(res => {
    console.log('✅ 房间脱敏视图获取成功:');
    console.dir(res.data);
    return res.data;
  }).catch(err => {
    console.error(`❌ 房间视图 ${viewId} 查询失败:`, err);
    return null;
  });
}

/**
 * 4. 验证 watch 是否启动
 * 监听房间 5 秒，若无报错则视为启动成功
 * @param {string} viewId
 */
function checkWatch(viewId) {
  if (!viewId) {
    console.warn('️ 请传入创建或加入房间后返回的 viewId');
    return Promise.resolve();
  }
  console.log(`⏳ 正在启动对房间视图 ${viewId} 的监听...`);

  return new Promise((resolve) => {
    const watcher = db.collection('roomViews').doc(viewId).watch({
      onChange(snapshot) {
        console.log('✅ Watch 触发! 数据类型:', snapshot.docChanges[0]?.dataType);
      },
      onError(err) {
        console.error('❌ Watch 启动失败:', err);
        resolve(false);
      },
    });

    console.log('✅ Watch 已建立，观察 3 秒后自动关闭...');
    setTimeout(() => {
      watcher.close();
      console.log('✅ Watch 已关闭，测试完成');
      resolve(true);
    }, 3000);
  });
}

/**
 * 5. 验证 roomAction 云函数
 * 发送 ping 指令，验证连通性
 */
function checkRoomAction() {
  console.log(' 正在调用 roomAction (ping)...');
  return wx.cloud.callFunction({
    name: 'roomAction',
    data: { action: 'ping' }
  }).then(res => {
    console.log('✅ roomAction 返回值:', res.result);
    return res.result;
  }).catch(err => {
    console.error(' roomAction 调用失败:', err);
    return null;
  });
}

// 挂载到全局，方便在控制台调用
if (typeof window !== 'undefined') {
  window.checkEnv = checkEnv;
  window.checkOpenId = checkOpenId;
  window.checkRoomView = checkRoomView;
  window.checkWatch = checkWatch;
  window.checkRoomAction = checkRoomAction;
}

module.exports = {
  checkEnv,
  checkOpenId,
  checkRoomView,
  checkWatch,
  checkRoomAction,
};

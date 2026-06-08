App({
  globalData: {
    gameStatus: null,
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d8g33m3x28826d0ab',
      traceUser: true,
    });
    console.log('Cloud initialized');
  },
});

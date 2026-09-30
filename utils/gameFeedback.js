const progress = require('./progressStore');

function createFeedback(wxApi) {
  let audio = null;
  return {
    move(human = true) {
      const settings = progress.read(wxApi).settings;
      if (settings.sound && wxApi && wxApi.createInnerAudioContext) {
        try {
          if (!audio) {
            audio = wxApi.createInnerAudioContext();
            audio.src = 'assets/stone.wav';
            audio.volume = 0.45;
            if (audio.onError) audio.onError(() => {});
          }
          audio.stop();
          audio.play();
        } catch (_) { /* Feedback must never interrupt a move. */ }
      }
      if (human && settings.vibration && wxApi && wxApi.vibrateShort) {
        try { wxApi.vibrateShort({ type: 'light', fail() {} }); } catch (_) { /* Older clients. */ }
      }
    },
    pause() { if (audio) { try { audio.stop(); } catch (_) { /* Already stopped. */ } } },
  };
}

module.exports = { createFeedback };

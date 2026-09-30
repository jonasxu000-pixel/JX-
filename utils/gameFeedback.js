const progress = require('./progressStore');

function createFeedback(wxApi) {
  let audio = null;
  let music = null;
  let foreground = true;
  let startedByTouch = false;
  let musicPlaying = false;
  function syncMusic() {
    if (!foreground || !startedByTouch || !progress.read(wxApi).settings.music) {
      if (music) { try { music.pause(); } catch (_) { /* Older clients. */ } }
      musicPlaying = false;
      return;
    }
    if (!wxApi || !wxApi.createInnerAudioContext) return;
    try {
      if (!music) {
        music = wxApi.createInnerAudioContext(); music.src = 'assets/lobby-music.wav';
        music.loop = true; music.volume = 0.18;
        if (music.onError) music.onError(() => { musicPlaying = false; });
        if (music.onPause) music.onPause(() => { musicPlaying = false; });
      }
      if (!musicPlaying) { music.play(); musicPlaying = true; }
    } catch (_) { /* Optional ambience must not interrupt navigation. */ }
  }
  return {
    interact() { startedByTouch = true; syncMusic(); },
    syncMusic,
    resume() { foreground = true; syncMusic(); },
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
    pause() { foreground = false; musicPlaying = false; if (audio) { try { audio.stop(); } catch (_) { /* Already stopped. */ } } if (music) { try { music.pause(); } catch (_) { /* Already paused. */ } } },
  };
}

module.exports = { createFeedback };

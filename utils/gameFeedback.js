const progress = require('./progressStore');

function createFeedback(wxApi) {
  let audio = null;
  let selectAudio = null;
  let winAudio = null;
  let loseAudio = null;
  let music = null;
  let foreground = true;
  let startedByTouch = false;
  let musicPlaying = false;

  function playEffect(instance, src, volume) {
    if (!wxApi || !wxApi.createInnerAudioContext) return instance;
    try {
      if (!instance) {
        instance = wxApi.createInnerAudioContext();
        instance.src = src;
        instance.volume = volume;
        if (instance.onError) instance.onError(() => {});
      }
      instance.stop();
      instance.play();
    } catch (_) { /* Feedback must never interrupt a move. */ }
    return instance;
  }

  function stopInstance(instance) {
    if (!instance) return;
    try { instance.stop(); } catch (_) { /* Already stopped. */ }
  }

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
    select() {
      const settings = progress.read(wxApi).settings;
      if (settings.sound) {
        selectAudio = playEffect(selectAudio, 'assets/stone-select.wav', 0.32);
      }
      if (settings.vibration && wxApi && wxApi.vibrateShort) {
        try { wxApi.vibrateShort({ type: 'light', fail() {} }); } catch (_) { /* Older clients. */ }
      }
    },
    move(human = true) {
      const settings = progress.read(wxApi).settings;
      if (settings.sound) {
        audio = playEffect(audio, 'assets/stone.wav', 0.45);
      }
      if (human && settings.vibration && wxApi && wxApi.vibrateShort) {
        try { wxApi.vibrateShort({ type: 'light', fail() {} }); } catch (_) { /* Older clients. */ }
      }
    },
    result(outcome) {
      if (!foreground) return;
      const settings = progress.read(wxApi).settings;
      if (!settings.sound) return;
      if (outcome === 'win') {
        winAudio = playEffect(winAudio, 'assets/win.wav', 0.35);
      } else if (outcome === 'loss' || outcome === 'draw') {
        loseAudio = playEffect(loseAudio, 'assets/lose.wav', 0.35);
      }
    },
    pause() {
      foreground = false;
      musicPlaying = false;
      stopInstance(audio);
      stopInstance(selectAudio);
      stopInstance(winAudio);
      stopInstance(loseAudio);
      if (music) { try { music.pause(); } catch (_) { /* Already paused. */ } }
    },
  };
}

module.exports = { createFeedback };

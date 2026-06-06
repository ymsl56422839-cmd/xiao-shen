let rec = null;
let listening = false;
let transcript = '';
let onResult = null;
let onState = null;
let silenceTimer = null;
let ttsReady = false;

// Warm up TTS on first user gesture
export function warmup() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  u.rate = 1;
  window.speechSynthesis.speak(u);
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
  window.speechSynthesis.getVoices();
  ttsReady = true;
}

export function init(cbs) {
  onResult = cbs.onResult;
  onState = cbs.onState;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onState?.('noapi'); return false; }
  rec = new SR();
  rec.lang = 'zh-CN';
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++)
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
    if (final) { transcript = final; resetSilence(); }
    const last = e.results[e.results.length-1];
    const interim = last && !last.isFinal ? last[0].transcript : '';
    onResult?.(final || transcript, interim);
  };

  rec.onerror = (e) => {
    if (e.error === 'not-allowed') onState?.('denied');
    else if (e.error === 'no-speech') { /* user didn't speak yet, keep listening */ }
    else if (e.error === 'aborted') { /* intentional stop */ }
    else { console.warn('Speech err:', e.error); }
    if (listening) setTimeout(() => restart(), 500);
  };

  rec.onend = () => {
    if (listening) restart();
  };

  rec.onspeechend = () => {
    // Speech ended naturally - force process any accumulated text
    if (transcript.trim()) {
      const text = transcript.trim();
      transcript = '';
      onResult?.(text, '');
    }
  };

  return true;
}

function resetSilence() {
  clearTimeout(silenceTimer);
}

function restart() {
  if (!listening || !rec) return;
  try { rec.start(); } catch { 
    setTimeout(() => { try { rec.start(); } catch {} }, 300);
  }
}

export function startListen() {
  if (!rec) return;
  listening = true;
  transcript = '';
  try { rec.start(); onState?.('listening'); } catch {
    try { rec.stop(); } catch {}
    setTimeout(() => { try { rec.start(); onState?.('listening'); } catch {} }, 200);
  }
}

export function stopListen() {
  listening = false;
  clearTimeout(silenceTimer);
  try { rec.stop(); } catch {}
  onState?.('idle');
}

export function speak(text, startCb, endCb) {
  if (!('speechSynthesis' in window)) { endCb?.(); return false; }

  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1.05;
  u.pitch = 1.1;
  u.volume = 1;

  const voices = window.speechSynthesis.getVoices();
  let voice = voices.find(x => x.lang.startsWith('zh-CN'));
  if (!voice) voice = voices.find(x => x.lang.startsWith('zh-TW'));
  if (!voice) voice = voices.find(x => x.lang.startsWith('zh'));
  if (voice) u.voice = voice;

  u.onstart = () => startCb?.();
  u.onend = () => endCb?.();
  u.onerror = () => endCb?.();

  // On some platforms, speak() needs to be called after a small delay
  // to work properly, especially on iOS
  setTimeout(() => {
    try {
      window.speechSynthesis.speak(u);
    } catch { endCb?.(); }
  }, 100);

  return true;
}

export function stopSpeak() {
  try { window.speechSynthesis?.cancel(); } catch {}
}

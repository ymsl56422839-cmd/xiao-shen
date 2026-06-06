let rec = null;
let listening = false;
let transcript = '';
let onResult = null;
let onState = null;
let silenceTimer = null;
let voicesReady = false;
let allVoices = [];

// Preload voices
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    allVoices = window.speechSynthesis.getVoices();
    voicesReady = true;
  };
  allVoices = window.speechSynthesis.getVoices();
  if (allVoices.length > 0) voicesReady = true;
}

export function warmup() {
  if (!('speechSynthesis' in window)) return;
  // Unlock TTS by speaking a silent utterance
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  u.rate = 0.1;
  try { window.speechSynthesis.speak(u); } catch {}
  // Also try to load voices
  window.speechSynthesis.getVoices();
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
    else if (e.error === 'no-speech') {}
    else if (e.error === 'aborted') {}
    else console.warn('Speech err:', e.error);
    if (listening) setTimeout(() => restart(), 500);
  };

  rec.onend = () => { if (listening) restart(); };

  return true;
}

function resetSilence() { clearTimeout(silenceTimer); }

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
  u.rate = 1.0;
  u.pitch = 1.1;
  u.volume = 1;

  // Try to pick Chinese voice, but don't block if none found
  const voices = window.speechSynthesis.getVoices();
  const zh = voices.find(x => x.lang.startsWith('zh-CN')) ||
             voices.find(x => x.lang.startsWith('zh-TW')) ||
             voices.find(x => x.lang.startsWith('zh'));
  if (zh) u.voice = zh;

  u.onstart = () => startCb?.();
  u.onend = () => endCb?.();
  u.onerror = (e) => {
    console.warn('TTS err:', e?.error);
    // Retry without specific voice
    if (zh) {
      const u2 = new SpeechSynthesisUtterance(text);
      u2.lang = 'zh-CN';
      u2.rate = 1.0;
      u2.pitch = 1.1;
      u2.volume = 1;
      u2.onstart = () => startCb?.();
      u2.onend = () => endCb?.();
      u2.onerror = () => endCb?.();
      window.speechSynthesis.speak(u2);
    } else {
      endCb?.();
    }
  };

  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeak() {
  try { window.speechSynthesis?.cancel(); } catch {}
}

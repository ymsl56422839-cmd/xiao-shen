let rec = null;
let listening = false;
let transcript = '';
let onResult = null;
let onState = null;
let silenceTimer = null;

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
    const interim = (e.results[e.results.length-1]?.[0]?.transcript) || '';
    onResult?.(final || transcript, interim);
  };

  rec.onerror = (e) => {
    if (e.error === 'not-allowed') onState?.('denied');
    else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.warn('Speech err:', e.error);
      restartListen();
    }
  };

  rec.onend = () => {
    if (!listening) return;
    restartListen();
  };

  return true;
}

function resetSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (transcript.trim()) {
      const text = transcript.trim();
      transcript = '';
      onResult?.(text, '');
    }
  }, 1500);
}

export function startListen() {
  if (!rec) return;
  listening = true;
  transcript = '';
  try { rec.start(); onState?.('listening'); } catch {
    try { rec.abort(); } catch {}
    setTimeout(() => { try { rec.start(); onState?.('listening'); } catch {} }, 200);
  }
}

export function stopListen() {
  listening = false;
  clearTimeout(silenceTimer);
  try { rec.abort(); } catch {}
  onState?.('idle');
}

async function restartListen() {
  if (!listening || !rec) return;
  await sleep(300);
  try { rec.start(); } catch {}
}

export function speak(text, startCb, endCb) {
  if (!('speechSynthesis' in window)) { endCb?.(); return false; }
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1.0;
  u.pitch = 1.1;

  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(x => x.lang.startsWith('zh-CN')) || voices.find(x => x.lang.startsWith('zh'));
  if (v) u.voice = v;

  u.onstart = () => startCb?.();
  u.onend = () => endCb?.();
  u.onerror = () => endCb?.();

  window.speechSynthesis.speak(u);
  return true;
}

export function stopSpeak() {
  try { window.speechSynthesis?.cancel(); } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

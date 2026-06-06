let rec = null;
let listening = false;
let transcript = '';
let onResult = null;
let onState = null;
let silenceTimer = null;
let audioEl = null;

export function warmup() {
  // Create the shared audio element
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.preload = 'auto';
  }
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
    if (listening) setTimeout(() => restart(), 500);
  };

  rec.onend = () => { if (listening) restart(); };

  warmup();
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
  if (!audioEl) audioEl = new Audio();

  // Stop any ongoing playback
  try { audioEl.pause(); } catch {}

  // Split long text into chunks for Google TTS (max ~200 chars)
  const maxChars = 180;
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }
    // Find a good break point
    let cut = maxChars;
    const breakers = ['。', '！', '？', '，', '.', '!', '?', ',', ' '];
    for (const b of breakers) {
      const idx = remaining.lastIndexOf(b, maxChars);
      if (idx > maxChars * 0.5) { cut = idx + 1; break; }
    }
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  let idx = 0;
  startCb?.();

  function playNext() {
    if (idx >= chunks.length) { endCb?.(); return; }
    const url = `/api/tts?text=${encodeURIComponent(chunks[idx])}`;
    audioEl.src = url;
    audioEl.onended = () => { idx++; playNext(); };
    audioEl.onerror = () => { idx++; playNext(); };
    audioEl.load();
    audioEl.play().catch(() => { idx++; playNext(); });
  }

  playNext();
  return true;
}

export function stopSpeak() {
  try {
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
  } catch {}
}

let recognition = null;
let isRecording = false;
let lastTranscript = '';

let onResult = null;
let onState = null;

export function initVoice({ onSpeechResult, onSpeechState }) {
  onResult = onSpeechResult;
  onState = onSpeechState;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onState?.('unsupported');
    return false;
  }

  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    let final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
    }
    if (final) lastTranscript = final;
    onResult?.(lastTranscript, '');
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed') {
      onState?.('denied');
    } else if (e.error !== 'no-speech') {
      onState?.('error');
    }
    isRecording = false;
  };

  recognition.onend = () => {
    const text = lastTranscript.trim();
    lastTranscript = '';
    isRecording = false;
    if (text) onResult?.(text, '');
    onState?.('end');
  };

  return true;
}

export async function toggleRecording() {
  if (!recognition) return;

  if (isRecording) {
    recognition.stop();
    onState?.('processing');
  } else {
    lastTranscript = '';
    try {
      await recognition.start();
      isRecording = true;
      onState?.('recording');
    } catch {
      onState?.('error');
    }
  }
}

export function speak(text, { onStart, onEnd }) {
  if (!('speechSynthesis' in window)) {
    onEnd?.();
    return false;
  }

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 1.0;
  utter.pitch = 1.1;
  utter.volume = 1;

  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    setTimeout(() => {
      voices = window.speechSynthesis.getVoices();
      const v = voices.find(x => x.lang.startsWith('zh-CN')) || voices.find(x => x.lang.startsWith('zh'));
      if (v) utter.voice = v;
      window.speechSynthesis.speak(utter);
    }, 200);
  } else {
    const v = voices.find(x => x.lang.startsWith('zh-CN')) || voices.find(x => x.lang.startsWith('zh'));
    if (v) utter.voice = v;
    window.speechSynthesis.speak(utter);
  }

  utter.onstart = () => onStart?.();
  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();

  return true;
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}

export function getIsRecording() {
  return isRecording;
}

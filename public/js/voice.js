let recognition = null;
let isRecording = false;
let lastTranscript = '';

let onSpeechResult = null;
let onSpeechStateChange = null;

export function initVoice({ onResult, onStateChange }) {
  onSpeechResult = onResult;
  onSpeechStateChange = onStateChange;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not supported');
    onSpeechStateChange?.('unsupported');
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '';
    lastTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        lastTranscript += result[0].transcript;
      } else {
        interim += result[0].transcript;
      }
    }
    onSpeechResult?.(lastTranscript, interim);
  };

  recognition.onerror = (event) => {
    console.error('Speech error:', event.error);
    if (event.error === 'no-speech') {
      // no-speech is common when user doesn't talk
      // just stop quietly
    }
    isRecording = false;
    onSpeechStateChange?.('error');
  };

  recognition.onend = () => {
    const text = lastTranscript.trim();
    lastTranscript = '';
    isRecording = false;
    if (text) {
      onSpeechResult?.(text, '');
    }
    onSpeechStateChange?.('end');
  };

  return true;
}

export function startRecording() {
  if (!recognition) return false;
  try {
    lastTranscript = '';
    recognition.start();
    isRecording = true;
    onSpeechStateChange?.('recording');
    return true;
  } catch {
    // Already started, restart
    try { recognition.abort(); } catch {}
    try {
      recognition.start();
      isRecording = true;
      onSpeechStateChange?.('recording');
      return true;
    } catch {
      return false;
    }
  }
}

export function stopRecording() {
  if (!recognition || !isRecording) return;
  try {
    recognition.stop();
  } catch {}
}

export function speak(text, { onStart, onEnd }) {
  if (!('speechSynthesis' in window)) return false;

  window.speechSynthesis.cancel();

  // Load voices if needed
  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    // voices might be async-loaded; try again after a tick
    setTimeout(() => {
      speak(text, { onStart, onEnd });
    }, 100);
    return true;
  }

  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'zh-CN';
  utter.rate = 1.0;
  utter.pitch = 1.15;
  utter.volume = 1;

  const zhVoice = voices.find(v => v.lang.startsWith('zh-CN')) ||
                   voices.find(v => v.lang.startsWith('zh-TW')) ||
                   voices.find(v => v.lang.startsWith('zh'));
  if (zhVoice) utter.voice = zhVoice;

  utter.onstart = () => onStart?.();
  utter.onend = () => onEnd?.();
  utter.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utter);
  onSpeechStateChange?.('speaking');
  return true;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    onSpeechStateChange?.('idle');
  }
}

export function getIsRecording() {
  return isRecording;
}

export function isSpeaking() {
  return 'speechSynthesis' in window && window.speechSynthesis.speaking;
}

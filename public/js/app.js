import { getSettings, saveSettings, addToLog, checkPIN, isConfigured } from './storage.js';
import { initVoice, toggleRecording, speak, stopSpeaking } from './voice.js';
import { initCamera, startCamera, stopCamera, captureFrame } from './camera.js';
import { initAvatar, setExpression } from './avatar.js';

const $ = id => document.getElementById(id);

let state = 'idle';
let mode = 'voice'; // 'voice' | 'camera'
let messages = [];

let dom = {};

async function callAPI(text, image, mime) {
  const s = getSettings();
  const body = {
    messages,
    deepseekKey: s.deepseekKey,
    ...(s.geminiKey ? { geminiKey: s.geminiKey } : {})
  };
  if (image) { body.image = image; body.mimeType = mime; }
  else if (text) { messages.push({ role: 'user', content: text }); body.messages = messages; }

  const r = await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.reply) messages.push({ role: 'assistant', content: d.reply });
  return d;
}

function doSpeak(text) {
  setExpression('speaking');
  speak(text, {
    onStart: () => setExpression('speaking'),
    onEnd: () => { setExpression('default'); if (mode === 'voice') setUI('idle'); }
  });
}

function setUI(st) {
  state = st;
  const mic = $('mic-btn'), micTxt = $('mic-text'), status = $('status');

  mic.classList.remove('rec', 'think');
  switch (st) {
    case 'idle':
      micTxt.textContent = '点我说话';
      mic.classList.add('listen');
      status.textContent = '🦊 点按钮跟我说话吧';
      break;
    case 'recording':
      mic.classList.add('rec');
      micTxt.textContent = '正在听...';
      status.textContent = '🎙️ 小深在听你说...';
      break;
    case 'thinking':
      mic.classList.add('think');
      micTxt.textContent = '思考中';
      status.textContent = '🤔 让我想想...';
      break;
    case 'speaking':
      mic.classList.remove('listen');
      micTxt.textContent = '小深在说';
      status.textContent = '🦊 小深在说话...';
      break;
  }
}

// Voice mode
async function handleVoiceTap() {
  if (state === 'speaking') { stopSpeaking(); setUI('idle'); return; }
  if (state === 'thinking') return;
  await toggleRecording();
}

function onSpeechResult(text) {
  if (text) processText(text);
}

function onSpeechState(st) {
  if (st === 'recording') setUI('recording');
  else if (st === 'processing') { setUI('thinking'); }
  else if (st === 'end') { /* handled by result */ }
  else if (st === 'denied') showMsg('需要麦克风权限才能说话');
  else if (st === 'error') { setUI('idle'); showMsg('没听清，打字试试'); }
}

async function processText(text) {
  if (!text?.trim()) return;
  setUI('thinking');
  try {
    addToLog({ role: 'user', content: text });
    const d = await callAPI(text);
    if (d.reply) { addToLog({ role: 'assistant', content: d.reply }); showReply(d.reply); doSpeak(d.reply); }
    else setUI('idle');
  } catch { setUI('idle'); showMsg('网络出问题了'); }
}

function showReply(text) {
  $('reply-text').textContent = text;
  $('reply-bubble').style.display = 'block';
}

// Camera mode
async function enterCamera() {
  mode = 'camera';
  $('voice-area').style.display = 'none';
  $('camera-area').style.display = 'flex';
  const ok = await startCamera();
  if (!ok) { exitCamera(); showMsg('摄像头打不开，请授权后重试'); }
}

function exitCamera() {
  stopCamera();
  mode = 'voice';
  $('voice-area').style.display = '';
  $('camera-area').style.display = 'none';
  setUI('idle');
}

async function handleCameraSnap() {
  if (state === 'thinking' || state === 'speaking') return;
  const img = captureFrame();
  if (!img) { showMsg('摄像头没准备好'); return; }
  setUI('thinking');
  $('cam-status').textContent = '🔍 让我看看...';
  try {
    addToLog({ role: 'user', content: '[拍照]' });
    const d = await callAPI(null, img, 'image/jpeg');
    if (d.reply) {
      addToLog({ role: 'assistant', content: d.reply });
      showReply(d.reply);
      doSpeak(d.reply);
      $('cam-status').textContent = d.imageDescription || '看到了！';
    }
    setExpression('default');
  } catch { setUI('idle'); showMsg('识别超时'); }
}

// Settings
function openSettings() {
  $('settings').style.display = 'flex';
  $('settings-panel').style.display = 'none';
}

function pinSubmit() {
  if (checkPIN($('pin-inp').value)) {
    $('pin-box').style.display = 'none';
    $('settings-panel').style.display = 'block';
    const s = getSettings();
    $('s-ds').value = s.deepseekKey || '';
    $('s-gk').value = s.geminiKey || '';
  } else { showMsg('密码不对'); }
}

function saveSettingsUI() {
  saveSettings({ deepseekKey: $('s-ds').value.trim(), geminiKey: $('s-gk').value.trim(), parentPIN: document.getElementById('s-pin')?.value?.trim() || '1234' });
  showMsg('已保存 ✅');
  closeSettings();
}

function closeSettings() {
  $('settings').style.display = 'none';
}

function showMsg(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2000);
}

// Boot
function boot() {
  if (!isConfigured()) return showSetup();

  $('app').innerHTML = `
<div id="main" class="main">
  <div class="top"><span class="title">🦊 小深</span><button id="gear" class="gear">⚙️</button></div>
  <div id="fox-box" class="fox-box"></div>
  <div id="reply-bubble" class="bubble"><div class="b-arrow"></div><span id="reply-text"></span></div>
  <div id="status" class="status-text">🦊 点按钮跟我说话吧</div>

  <div id="voice-area" class="voice-area">
    <div class="mic-wrap">
      <button id="mic-btn" class="mic"><span class="mic-icon">🎤</span></button>
      <div id="mic-text" class="mic-label">点我说话</div>
    </div>
    <div class="input-row">
      <input id="text-inp" class="text-inp" placeholder="或者打字跟我聊...">
      <button id="send-btn" class="send-btn">发送</button>
    </div>
  </div>

  <div id="camera-area" class="camera-area" style="display:none">
    <video id="camera-video" autoplay playsinline></video>
    <canvas id="camera-canvas" style="display:none"></canvas>
    <div id="cam-status" class="cam-status">📷 对准想让我看的东西</div>
    <div class="cam-ctrls">
      <button id="cam-snap" class="cam-snap-btn">📷 看看这是什么</button>
      <button id="cam-close" class="cam-close-btn">✕</button>
    </div>
  </div>

  <div class="tabs">
    <button id="tab-voice" class="tab on">🎤 语音</button>
    <button id="tab-cam" class="tab">📷 视频</button>
  </div>
</div>

<div id="settings" class="settings-scr" style="display:none">
  <div id="settings-panel" class="settings-panel" style="display:none">
    <div class="s-head"><button id="s-back" class="s-back">← 返回</button><h2>家长设置</h2></div>
    <div class="s-body">
      <label>DeepSeek API Key</label><input id="s-ds" type="password" placeholder="sk-...">
      <label>Gemini API Key</label><input id="s-gk" type="password" placeholder="AIza...">
      <button id="s-save" class="btn1">💾 保存</button>
    </div>
  </div>
  <div id="pin-box" class="pin-box">
    <h3>🔐 家长密码</h3>
    <input id="pin-inp" type="password" maxlength="6" placeholder="默认: 1234">
    <button id="pin-ok" class="btn1">确认</button>
  </div>
</div>
<div id="toast" class="toast"></div>`;

  initAvatar('fox-box');
  initVoice({ onSpeechResult, onSpeechState });
  initCamera({ onFrame: null });

  // Preload voices
  speechSynthesis?.getVoices();

  // Events
  $('mic-btn').addEventListener('click', handleVoiceTap);
  $('send-btn').addEventListener('click', () => { const v = $('text-inp').value.trim(); if (v) { $('text-inp').value = ''; processText(v); } });
  $('text-inp').addEventListener('keydown', e => { if (e.key === 'Enter') { const v = $('text-inp').value.trim(); if (v) { $('text-inp').value = ''; processText(v); } } });

  $('tab-cam').addEventListener('click', () => { $('tab-voice').classList.remove('on'); $('tab-cam').classList.add('on'); enterCamera(); });
  $('tab-voice').addEventListener('click', () => { $('tab-cam').classList.remove('on'); $('tab-voice').classList.add('on'); exitCamera(); });

  $('cam-snap').addEventListener('click', handleCameraSnap);
  $('cam-close').addEventListener('click', () => { exitCamera(); $('tab-cam').classList.remove('on'); $('tab-voice').classList.add('on'); });

  $('gear').addEventListener('click', openSettings);
  $('pin-ok').addEventListener('click', pinSubmit);
  $('pin-inp').addEventListener('keydown', e => { if (e.key === 'Enter') pinSubmit(); });
  $('s-back').addEventListener('click', closeSettings);
  $('s-save').addEventListener('click', saveSettingsUI);

  setUI('idle');
}

function showSetup() {
  $('app').innerHTML = `
<div class="setup">
  <div class="setup-card">
    <div id="setup-fox" class="fox-box"></div>
    <h1>欢迎来到小深的世界 🦊</h1>
    <p>先帮小深设置一下</p>
    <label>DeepSeek API Key *</label><input id="su-ds" type="password" placeholder="sk-..." required>
    <label>Gemini API Key <small>(拍照需要)</small></label><input id="su-gk" type="password" placeholder="AIza...">
    <button id="su-save" class="btn1">🔑 保存并开始</button>
  </div>
</div>
<div id="toast" class="toast"></div>`;

  initAvatar('setup-fox');
  $('su-save').addEventListener('click', () => {
    const ds = $('su-ds').value.trim();
    if (!ds) { showMsg('请填 DeepSeek API Key'); return; }
    saveSettings({ deepseekKey: ds, geminiKey: $('su-gk').value.trim() });
    boot();
  });
}

boot();

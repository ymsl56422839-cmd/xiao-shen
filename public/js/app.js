import { getSettings, saveSettings, addToLog, checkPIN, isConfigured, getApiKeys } from './storage.js';
import { initVoice, startRecording, stopRecording, speak, stopSpeaking } from './voice.js';
import { initCamera, startCamera, stopCamera, captureFrame } from './camera.js';
import { initAvatar, setExpression, setAvatarVisible } from './avatar.js';

// ========== State ==========
let state = 'setup'; // setup | idle | recording | thinking | speaking | camera | cam_thinking
let messageHistory = [];
let refreshTimer = null;
let preSpeakingState = 'idle';

// ========== DOM refs ==========
const $ = (id) => document.getElementById(id);

function initDom() {
  return {
    // Shared
    appContainer: $('app'),
    toast: $('toast'),

    // Setup
    setupScreen: $('setup-screen'),
    dsKeyInput: $('ds-key'),
    gkKeyInput: $('gk-key'),
    setupSaveBtn: $('setup-save'),
    setupSkipGemini: $('setup-skip-gemini'),

    // Main
    mainScreen: $('main-screen'),
    foxContainer: $('fox-container'),
    statusText: $('status-text'),
    responseBubble: $('response-bubble'),
    responseText: $('response-text'),

    // Voice mode
    voicePanel: $('voice-panel'),
    micBtn: $('mic-btn'),
    micLabel: $('mic-label'),
    textInput: $('text-input'),
    textSendBtn: $('text-send'),

    // Camera mode
    cameraPanel: $('camera-panel'),
    cameraVideo: $('camera-video'),
    cameraCanvas: $('camera-canvas'),
    cameraBtn: $('camera-btn'),
    closeCameraBtn: $('close-camera'),

    // Settings
    settingsScreen: $('settings-screen'),
    pinBox: $('pin-box'),
    settingsBtn: $('settings-btn'),
    pinInput: $('pin-input'),
    pinSubmitBtn: $('pin-submit'),
    settingsPanel: $('settings-panel'),
    settingsBackBtn: $('settings-back'),
    settingsDsKey: $('settings-ds-key'),
    settingsGkKey: $('settings-gk-key'),
    settingsFilter: $('settings-filter'),
    settingsPIN: $('settings-pin'),
    settingsSave: $('settings-save'),
    logContainer: $('log-container'),

    // Tabs
    tabVoice: $('tab-voice'),
    tabCamera: $('tab-camera'),
  };
}

let dom = {};

// ========== API call ==========
async function callAI(userMessage, imageBase64, mimeType) {
  const { deepseekKey, geminiKey } = getApiKeys();

  const body = {
    messages: messageHistory,
    deepseekKey,
    ...(geminiKey ? { geminiKey } : {}),
  };

  if (imageBase64) {
    body.image = imageBase64;
    body.mimeType = mimeType;
    // Don't add user message for camera mode - gemini does it
  } else if (userMessage) {
    messageHistory.push({ role: 'user', content: userMessage });
    body.messages = messageHistory;
  }

  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error('API error: ' + resp.status);
  }

  const data = await resp.json();

  if (data.error) {
    throw new Error(data.error);
  }

  const reply = data.reply || '';

  if (reply) {
    messageHistory.push({ role: 'assistant', content: reply });
  }

  return { reply, imageDescription: data.imageDescription };
}

// ========== Content filter ==========
function filterContent(text) {
  const settings = getSettings();
  if (!settings.contentFilter) return text;

  const words = settings.contentFilter.split(',').map(w => w.trim()).filter(Boolean);
  let filtered = text;
  for (const word of words) {
    const re = new RegExp(word, 'gi');
    filtered = filtered.replace(re, '***');
  }
  return filtered;
}

// ========== Show response ==========
function showResponse(text) {
  const filtered = filterContent(text);
  dom.responseText.textContent = filtered;
  dom.responseBubble.style.display = 'block';

  // Speak the response
  setAvatarVisible(true);
  setExpression('speaking');
  preSpeakingState = state;
  setState('speaking');

  speak(filtered, {
    onStart: () => {
      setExpression('speaking');
    },
    onEnd: () => {
      const returnState = preSpeakingState === 'camera' || preSpeakingState === 'cam_thinking' ? 'camera' : 'idle';
      setState(returnState);
      setExpression('default');
    }
  });
}

// ========== State machine ==========
function setState(newState) {
  state = newState;
  updateUI();
}

function updateUI() {
  const { mainScreen, voicePanel, cameraPanel, micBtn, micLabel, statusText } = dom;

  // Reset everything
  voicePanel.style.display = 'none';
  cameraPanel.style.display = 'none';
  micBtn.classList.remove('recording', 'thinking');
  setAvatarVisible(true);

  switch (state) {
    case 'setup':
      break;

    case 'idle':
      mainScreen.classList.remove('camera-mode');
      voicePanel.style.display = 'flex';
      micLabel.textContent = '按住说话';
      statusText.textContent = '🎤 按住按钮跟我说话吧～';
      setExpression('default');
      break;

    case 'recording':
      mainScreen.classList.remove('camera-mode');
      voicePanel.style.display = 'flex';
      micBtn.classList.add('recording');
      micLabel.textContent = '松开发送';
      statusText.textContent = '🎙️ 正在听你说...';
      setExpression('thinking');
      break;

    case 'thinking':
      mainScreen.classList.remove('camera-mode');
      voicePanel.style.display = 'flex';
      micBtn.classList.add('thinking');
      micLabel.textContent = '思考中...';
      statusText.textContent = '🤔 让我想想...';
      setExpression('thinking');
      break;

    case 'speaking':
      // keep current panel visible
      statusText.textContent = '🦊 小深正在说...';
      break;

    case 'camera':
      mainScreen.classList.add('camera-mode');
      cameraPanel.style.display = 'flex';
      voicePanel.style.display = 'none';
      statusText.textContent = '📷 我正在看呢，你想让我看什么？';
      setExpression('default');
      break;

    case 'cam_thinking':
      mainScreen.classList.add('camera-mode');
      cameraPanel.style.display = 'flex';
      statusText.textContent = '🤔 让我仔细看看...';
      setExpression('thinking');
      break;
  }
}

// ========== Voice mode ==========
function handleMicPress() {
  if (state === 'speaking') {
    stopSpeaking();
    setState('idle');
    return;
  }
  if (state === 'thinking') return;

  startRecording();
  setState('recording');
}

function handleMicRelease() {
  if (state !== 'recording') return;
  stopRecording();
}

function handleSpeechResult(text, interim) {
  if (interim) {
    dom.statusText.textContent = `🎙️ ${interim}`;
    return;
  }
  if (text) {
    processUserMessage(text);
  }
}

function handleSpeechState(st) {
  if (st === 'end') {
    // handled by onresult
  } else if (st === 'error') {
    setState('idle');
    showToast('没有听清，请再试一次');
  } else if (st === 'unsupported') {
    // Voice not supported, rely on text input only
    dom.micBtn.style.opacity = '0.3';
    dom.micLabel.textContent = '语音不可用，请打字聊天';
    dom.textInput.placeholder = '在这里打字跟我聊天...';
  }
}

async function processUserMessage(text) {
  if (!text.trim()) return;

  setState('thinking');
  dom.responseBubble.style.display = 'none';

  try {
    messageHistory = []; // reset for fresh voice session
    if (messageHistory.length > 20) {
      messageHistory = messageHistory.slice(-20);
    }

    addToLog({ type: 'voice', role: 'user', content: text });

    const { reply } = await callAI(text);

    if (reply) {
      addToLog({ type: 'voice', role: 'assistant', content: reply });
      showResponse(reply);
    } else {
      setState('idle');
      showToast('小深没想好说什么，再试试吧');
    }
  } catch (err) {
    console.error(err);
    setState('idle');
    showToast('网络出问题了，检查一下 API Key 吧');
  }
}

// ========== Camera mode ==========
async function handleCameraStart() {
  setState('camera');
  setAvatarVisible(true);

    const ok = await startCamera();
    if (!ok) {
      dom.tabCamera.classList.remove('active');
      dom.tabVoice.classList.add('active');
      setState('idle');
      showToast('无法打开摄像头，请确认已授权');
      return;
    }
}

function handleCameraClose() {
  stopCamera();
  setState('idle');
}

function handleFrameCaptured(base64, mimeType) {
  if (state !== 'camera' && state !== 'cam_thinking') return;
  processCameraFrame(base64, mimeType);
}

async function processCameraFrame(base64, mimeType) {
  if (state === 'speaking' || state === 'cam_thinking') return;
  if (!getApiKeys().geminiKey) {
    showToast('需要先配置 Gemini API Key 才能识别画面');
    return;
  }

  setState('cam_thinking');

  // Keep only last few messages to save tokens
  if (messageHistory.length > 10) {
    messageHistory = messageHistory.slice(-10);
  }

  try {
    addToLog({ type: 'camera', role: 'user', content: '[拍照]' });

    const { reply, imageDescription } = await callAI(null, base64, mimeType);

    if (imageDescription) {
      addToLog({ type: 'camera', role: 'system', content: imageDescription });
      dom.statusText.textContent = `🔍 ${imageDescription}`;
    }

    if (reply) {
      addToLog({ type: 'camera', role: 'assistant', content: reply });
      showResponse(reply);
    } else {
      setState('camera');
    }
  } catch (err) {
    console.error(err);
    setState('camera');
    showToast('识别超时，再试一次');
  }
}

// ========== Manual frame capture ==========
function handleManualCapture() {
  if (state !== 'camera') return;
  const img = captureFrame();
  if (img) {
    showToast('正在分析...');
  }
}

// ========== Settings ==========
function handleSettingsOpen() {
  if (state === 'speaking') stopSpeaking();
  if (state === 'camera' || state === 'cam_thinking') {
    stopCamera();
    messageHistory = [];
  }

  const settings = getSettings();
  if (!settings.deepseekKey) {
    // No PIN needed for first-time setup
    showSettingsPanel();
    return;
  }

  dom.settingsScreen.style.display = 'flex';
  dom.settingsPanel.style.display = 'none';
  dom.pinInput.value = '';
  dom.settingsBtn.style.display = 'none';
}

function handlePINSubmit() {
  if (checkPIN(dom.pinInput.value)) {
    showSettingsPanel();
    dom.pinInput.value = '';
  } else {
    showToast('密码不对哦');
  }
}

function showSettingsPanel() {
  dom.pinBox.style.display = 'none';
  dom.settingsPanel.style.display = 'block';
  dom.settingsScreen.style.display = 'flex';

  const settings = getSettings();
  dom.settingsDsKey.value = settings.deepseekKey;
  dom.settingsGkKey.value = settings.geminiKey;
  dom.settingsFilter.value = settings.contentFilter;
  dom.settingsPIN.value = settings.parentPIN;

  renderLog();
}

function handleSettingsSave() {
  saveSettings({
    deepseekKey: dom.settingsDsKey.value.trim(),
    geminiKey: dom.settingsGkKey.value.trim(),
    contentFilter: dom.settingsFilter.value.trim(),
    parentPIN: dom.settingsPIN.value.trim() || '1234',
  });

  showToast('设置已保存 ✅');

  // If this was first-time setup
  if (state === 'setup') {
    startMainApp();
  }
}

function handleSettingsBack() {
  dom.settingsScreen.style.display = 'none';
  dom.settingsBtn.style.display = 'block';

  if (!isConfigured()) {
    showSetup();
  } else {
    setState('idle');
  }
}

function renderLog() {
  const settings = getSettings();
  const logs = settings.conversationLog || [];
  dom.logContainer.innerHTML = logs.length === 0
    ? '<p style="color:#999;text-align:center;padding:20px;">还没有对话记录</p>'
    : logs.slice(0, 100).map(l => {
        const time = new Date(l.time).toLocaleTimeString('zh-CN');
        const role = l.role === 'user' ? '👦 孩子' :
                     l.role === 'assistant' ? '🦊 小深' :
                     l.role === 'system' ? '📷 画面' : '📝';
        const type = l.type ? `[${l.type}] ` : '';
        return `<div class="log-entry"><span class="log-time">${time}</span> <span class="log-role">${role}</span> <span class="log-content">${type}${l.content}</span></div>`;
      }).join('');
}

// ========== Setup screen ==========
function showSetup() {
  setState('setup');
  dom.appContainer.innerHTML = `
    <div id="setup-screen" class="setup-screen">
      <div class="setup-card">
        <div class="fox-avatar" id="setup-fox"></div>
        <h1>欢迎来到小深的世界 🦊</h1>
        <p>先帮小深设置一下，马上就能跟它聊天啦～</p>
        <form id="setup-form" onsubmit="return false">
          <label>DeepSeek API Key *</label>
          <input id="ds-key" type="password" placeholder="sk-..." required>
          <label>Gemini API Key <small>(拍照识别需要)</small></label>
          <input id="gk-key" type="password" placeholder="AIza...">
          <div class="setup-actions">
            <button type="button" id="setup-save" class="btn-primary">🔑 保存并开始</button>
            <button type="button" id="setup-skip-gemini" class="btn-text">先跳过 Gemini，只用语音聊天</button>
          </div>
        </form>
      </div>
    </div>`;

  // Re-init DOM refs
  dom = initDom();

  initAvatar('setup-fox');
  setExpression('default');

  dom.setupSaveBtn.addEventListener('click', () => {
    const ds = dom.dsKeyInput.value.trim();
    if (!ds) {
      showToast('请填写 DeepSeek API Key');
      return;
    }
    saveSettings({
      deepseekKey: ds,
      geminiKey: dom.gkKeyInput.value.trim(),
    });
    showToast('设置成功！');
    startMainApp();
  });

  dom.setupSkipGemini.addEventListener('click', () => {
    const ds = dom.dsKeyInput.value.trim();
    if (!ds) {
      showToast('请填写 DeepSeek API Key');
      return;
    }
    saveSettings({
      deepseekKey: ds,
      geminiKey: '',
    });
    showToast('已跳过 Gemini 配置');
    startMainApp();
  });
}

// ========== Main app ==========
function startMainApp() {
  if (!isConfigured()) {
    showSetup();
    return;
  }

  state = 'idle';
  messageHistory = [];

  dom.appContainer.innerHTML = `
    <div id="main-screen" class="main-screen">
      <div class="top-bar">
        <span class="top-title">🦊 小深</span>
        <button id="settings-btn" class="icon-btn" title="家长设置">⚙️</button>
      </div>

      <div id="fox-container" class="fox-main"></div>

      <div class="status-bar">
        <span id="status-text">🎤 按住按钮跟我说话吧～</span>
      </div>

      <div id="response-bubble" class="response-bubble" style="display:none">
        <div class="bubble-arrow"></div>
        <span id="response-text"></span>
      </div>

      <!-- Voice panel -->
      <div id="voice-panel" class="voice-panel">
        <div class="input-row">
          <input id="text-input" type="text" class="text-input" placeholder="或者打字跟我聊...">
          <button id="text-send" class="send-btn">发送</button>
        </div>
        <div class="mic-area">
          <button id="mic-btn" class="mic-btn">
            <span class="mic-icon">🎤</span>
          </button>
          <span id="mic-label" class="mic-label">按住说话</span>
        </div>
      </div>

      <!-- Camera panel -->
      <div id="camera-panel" class="camera-panel" style="display:none">
        <video id="camera-video" autoplay playsinline></video>
        <canvas id="camera-canvas" style="display:none"></canvas>
        <div class="camera-controls">
          <button id="camera-btn" class="camera-capture-btn">📷 拍一下</button>
          <button id="close-camera" class="close-btn">✕ 关闭</button>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="tab-bar">
        <button id="tab-voice" class="tab-btn active">
          <span class="tab-icon">🎤</span>
          <span>语音聊天</span>
        </button>
        <button id="tab-camera" class="tab-btn">
          <span class="tab-icon">📷</span>
          <span>视频通话</span>
        </button>
      </div>
    </div>

    <!-- Settings screen -->
    <div id="settings-screen" class="settings-screen" style="display:none">
      <div id="settings-panel" class="settings-panel" style="display:none">
        <div class="settings-header">
          <button id="settings-back" class="icon-btn">← 返回</button>
          <h2>家长设置</h2>
        </div>
        <div class="settings-body">
          <label>DeepSeek API Key <small>*</small></label>
          <input id="settings-ds-key" type="password" placeholder="sk-...">

          <label>Gemini API Key <small>(拍照识别)</small></label>
          <input id="settings-gk-key" type="password" placeholder="AIza...">

          <label>内容过滤词 <small>(逗号分隔)</small></label>
          <input id="settings-filter" type="text" placeholder="暴力,血腥,...">

          <label>家长密码 <small>(4-6位数字)</small></label>
          <input id="settings-pin" type="text" maxlength="6" placeholder="1234">

          <button id="settings-save" class="btn-primary">💾 保存设置</button>

          <div class="log-section">
            <h3>📋 对话记录</h3>
            <div id="log-container" class="log-container"></div>
          </div>
        </div>
      </div>

      <!-- PIN entry -->
      <div id="pin-box" class="pin-box">
        <h3>🔐 请输入家长密码</h3>
        <input id="pin-input" type="password" maxlength="6" placeholder="输入密码...">
        <button id="pin-submit" class="btn-primary">确认</button>
        <p style="font-size:12px;color:#999;margin-top:8px;">默认密码: 1234</p>
      </div>
    </div>

    <div id="toast" class="toast"></div>
  `;

  // Re-init DOM refs
  dom = initDom();

  // Init modules
  initAvatar('fox-container');
  initVoice({
    onResult: handleSpeechResult,
    onStateChange: handleSpeechState,
  });
  initCamera({
    onFrame: handleFrameCaptured,
    onState: null,
  });

  // Build GEMINI URL constant fix for voice
  // (No-op, just ensuring init runs)

  // Voice panel events
  dom.micBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleMicPress();
  });
  dom.micBtn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    handleMicRelease();
  });
  dom.micBtn.addEventListener('pointerleave', (e) => {
    handleMicRelease();
  });
  dom.micBtn.addEventListener('pointercancel', (e) => {
    handleMicRelease();
  });

  // Also support click (for desktop testing)
  dom.micBtn.addEventListener('click', () => {
    if (state === 'speaking') {
      stopSpeaking();
      setState('idle');
    }
  });

  dom.textSendBtn.addEventListener('click', () => {
    const text = dom.textInput.value.trim();
    if (text) {
      dom.textInput.value = '';
      processUserMessage(text);
    }
  });

  dom.textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = dom.textInput.value.trim();
      if (text) {
        dom.textInput.value = '';
        processUserMessage(text);
      }
    }
  });

  // Camera panel events
  dom.tabCamera.addEventListener('click', () => {
    dom.tabVoice.classList.remove('active');
    dom.tabCamera.classList.add('active');
    if (state !== 'camera' && state !== 'cam_thinking' && state !== 'speaking') {
      handleCameraStart();
    }
  });

  dom.tabVoice.addEventListener('click', () => {
    dom.tabCamera.classList.remove('active');
    dom.tabVoice.classList.add('active');
    if (state === 'camera' || state === 'cam_thinking') {
      handleCameraClose();
    } else {
      setState('idle');
    }
  });

  dom.cameraBtn.addEventListener('click', handleManualCapture);
  dom.closeCameraBtn.addEventListener('click', () => {
    handleCameraClose();
    dom.tabCamera.classList.remove('active');
    dom.tabVoice.classList.add('active');
    setState('idle');
  });

  // Settings events
  dom.settingsBtn.addEventListener('click', handleSettingsOpen);
  dom.pinSubmitBtn.addEventListener('click', handlePINSubmit);
  dom.pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handlePINSubmit();
  });
  dom.settingsSave.addEventListener('click', handleSettingsSave);
  dom.settingsBack.addEventListener('click', handleSettingsBack);

  // Load voices early (needs a user gesture on some browsers)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
  }

  setState('idle');
  updateUI();
}

// ========== Toast ==========
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// ========== Boot ==========
function boot() {
  dom = initDom();

  if (isConfigured()) {
    startMainApp();
  } else {
    showSetup();
  }
}

document.addEventListener('DOMContentLoaded', boot);

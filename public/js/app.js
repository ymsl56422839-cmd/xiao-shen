import { get, set, ready, checkPin, addLog } from './storage.js';
import { init as initVoice, startListen, stopListen, speak, stopSpeak, warmup } from './voice.js';
import { init as initCam, start as camStart, stop as camStop, snap } from './camera.js';
import { initAvatar, setExpression } from './avatar.js';

const $ = id => document.getElementById(id);

let state = 'home';    // home | call
let sub = 'idle';       // idle | listening | thinking | speaking
let camOn = false;
let msgs = [];
let visionTimer = null;
let dom = {};

// ===== API =====
async function api(text, img64) {
  const s = get();
  const body = { messages: msgs, deepseekKey: s.deepseekKey };
  if (s.geminiKey) body.geminiKey = s.geminiKey;
  if (img64) { body.image = img64; body.mimeType = 'image/jpeg'; }
  else if (text) { msgs.push({ role: 'user', content: text }); body.messages = msgs; }

  const r = await fetch('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.reply) msgs.push({ role: 'assistant', content: d.reply });
  return d;
}

function doSpeak(text) {
  setExpression('speaking');
  const ok = speak(text,
    () => { sub = 'speaking'; updateUI(); },
    () => {
      setExpression('default');
      sub = 'idle';
      updateUI();
      if (state === 'call') startListen();
    }
  );
  if (!ok) {
    // TTS not supported, just show text and restart listening
    showBubble(text);
    setTimeout(() => {
      setExpression('default');
      sub = 'idle';
      updateUI();
      if (state === 'call') startListen();
    }, text.length * 100 + 2000);
  }
}

function showBubble(text) {
  $('bubble-text').textContent = text;
  $('bubble').style.display = 'block';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { $('bubble').style.display = 'none'; }, 8000);
}
let bubbleTimer = null;

// ===== Voice call logic =====
function onSpeechResult(text, interim) {
  if (interim) {
    $('call-status').textContent = '🎙️ ' + interim;
    return;
  }
  if (text && state === 'call' && sub !== 'speaking') {
    sub = 'thinking';
    updateUI();
    stopListen();
    processUserText(text);
  }
}

function onSpeechState(st) {
  if (st === 'listening') { sub = 'listening'; updateUI(); }
  else if (st === 'denied') { showToast('请允许麦克风'); }
  else if (st === 'noapi') { showToast('浏览器不支持语音'); }
}

async function processUserText(text) {
  try {
    addLog({ role: 'user', content: text });
    const d = await api(text);
    if (d.reply) {
      addLog({ role: 'assistant', content: d.reply });
      showBubble(d.reply);
      $('call-status').textContent = '🦊 小深在说...';
      doSpeak(d.reply);
    } else {
      sub = 'idle'; updateUI(); startListen();
    }
  } catch {
    showToast('网络出错了');
    sub = 'idle'; updateUI(); startListen();
  }
}

// ===== Camera vision logic =====
async function visionCheck() {
  if (!camOn || state !== 'call' || sub === 'speaking') return;
  const img = snap();
  if (!img) return;
  try {
    addLog({ role: 'user', content: '[摄像头看到画面]' });
    const d = await api(null, img);
    if (d.reply && sub !== 'speaking') {
      addLog({ role: 'assistant', content: d.reply });
      $('cam-hint').textContent = d.imageDescription || '';
      showBubble(d.reply);
      $('call-status').textContent = '🦊 小深在说...';
      stopListen();
      doSpeak(d.reply);
    }
  } catch {}
}

function startVisionLoop() {
  visionTimer = setInterval(visionCheck, 6000);
}

function stopVisionLoop() {
  clearInterval(visionTimer);
  visionTimer = null;
}

// ===== Enter / Exit call =====
async function enterCall(useCam) {
  state = 'call';
  camOn = useCam;
  msgs = [];

  showCallScreen();

  // iOS: unlock speechSynthesis immediately in new DOM while still in click chain
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch {}
    const unlock = new SpeechSynthesisUtterance(' ');
    unlock.volume = 0;
    try { window.speechSynthesis.speak(unlock); } catch {}
  }

  if (camOn) {
    const ok = await camStart();
    if (!ok) { camOn = false; showToast('摄像头未授权'); }
    else startVisionLoop();
  }

  // AI greets
  sub = 'thinking'; updateUI();
  const s = get();
  const body = { messages: [{ role: 'user', content: '你好，我们开始聊天吧！' }], deepseekKey: s.deepseekKey };
  if (s.geminiKey) body.geminiKey = s.geminiKey;
  try {
    const r = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const d = await r.json();
    if (d.reply) {
      msgs.push({ role: 'assistant', content: d.reply });
      showBubble(d.reply);
      doSpeak(d.reply);
    } else {
      sub = 'idle'; updateUI(); startListen();
    }
  } catch {
    sub = 'idle'; updateUI(); startListen();
  }
}

function hangup() {
  stopListen();
  stopSpeak();
  stopVisionLoop();
  camStop();
  state = 'home';
  camOn = false;
  msgs = [];
  showHomeScreen();
}

function toggleCam() {
  if (camOn) {
    stopVisionLoop();
    camStop();
    camOn = false;
    updateUI();
  } else {
    camStart().then(ok => {
      if (ok) { camOn = true; startVisionLoop(); updateUI(); }
      else showToast('摄像头未授权');
    });
  }
}

// ===== Home screen =====
function showHomeScreen() {
  $('app').innerHTML = `
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--or:#FF8C42;--od:#E06B2A;--bg:#FFF8F0;--card:#fff;--txt:#4A3728;--tl:#8B7355}
html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--txt);-webkit-tap-highlight-color:transparent;user-select:none}
body{display:flex;justify-content:center;align-items:center}
#app{width:100%;max-width:430px;height:100dvh;position:relative;overflow:hidden;background:var(--bg)}

/* HOME */
.home{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px}
.home .gear-btn{position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.5em;cursor:pointer;z-index:2}

#home-fox{width:150px;height:150px}
.fox-avatar{width:150px;height:150px;animation:foxf 3s ease-in-out infinite}
@keyframes foxf{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

.home .tagline{font-size:.9em;color:var(--tl);text-align:center}

.home-actions{display:flex;flex-direction:column;gap:14px;width:100%;max-width:280px}
.call-btn,.video-btn{width:100%;padding:18px;border:none;border-radius:20px;font-size:1.15em;font-weight:700;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:transform .15s,box-shadow .15s}
.call-btn:active,.video-btn:active{transform:scale(.96)}
.call-btn{background:var(--or);color:#fff;box-shadow:0 4px 20px rgba(255,140,66,.35)}
.video-btn{background:#4CAF50;color:#fff;box-shadow:0 4px 20px rgba(76,175,80,.35)}

/* CALL SCREEN */
.call-scr{height:100%;display:flex;flex-direction:column;overflow:hidden;position:relative}
.call-scr .top-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,.3);position:absolute;top:0;left:0;right:0;z-index:10}
.call-scr .cam-btn,.call-scr .close-btn,.call-scr .text-toggle{background:rgba(255,255,255,.25);border:none;color:#fff;padding:8px 16px;border-radius:20px;font-size:.85em;font-family:inherit;cursor:pointer;backdrop-filter:blur(4px)}
.call-scr .call-fox-wrap{flex:1;display:flex;align-items:center;justify-content:center;position:relative;z-index:2}
.call-scr .call-fox-wrap .fox-avatar{width:120px;height:120px}
.call-scr .call-fox-wrap.oncam .fox-avatar{width:72px;height:72px;position:fixed;top:60px;right:16px;z-index:5}

.call-scr .call-status{text-align:center;padding:8px;color:#fff;font-size:.9em;z-index:3;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.call-scr .cam-hint{text-align:center;padding:4px;color:rgba(255,255,255,.8);font-size:.78em;z-index:3;min-height:20px}

.call-scr .hangup-row{padding:16px;display:flex;justify-content:center;gap:16px;z-index:3}
.call-scr .hangup-btn{width:64px;height:64px;border-radius:50%;border:none;background:#FF3B30;color:#fff;font-size:1.8em;cursor:pointer;box-shadow:0 4px 16px rgba(255,59,48,.4)}
.call-scr .hangup-btn:active{transform:scale(.9)}

.call-scr .text-row{display:flex;padding:8px 16px 16px;gap:8px;z-index:3;display:none}
.call-scr .text-row.visible{display:flex}
.call-scr .text-row input{flex:1;padding:12px;border:none;border-radius:24px;font-size:.9em;font-family:inherit;background:rgba(255,255,255,.9);color:var(--txt);outline:none}
.call-scr .text-row button{padding:12px 20px;border:none;border-radius:24px;background:var(--or);color:#fff;font-weight:700;font-family:inherit;cursor:pointer}

/* Camera overlay */
.call-scr .cam-overlay{position:absolute;inset:0;z-index:0}
.call-scr .cam-overlay video{width:100%;height:100%;object-fit:cover}

/* Bubble */
.bubble{position:absolute;top:30%;left:50%;transform:translateX(-50%);max-width:85%;background:rgba(255,255,255,.92);border-radius:16px;padding:14px 18px;box-shadow:0 6px 24px rgba(0,0,0,.15);z-index:20;display:none}
.bubble.visible{display:block;animation:pop .25s ease}
@keyframes pop{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.bubble .arr{position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:8px solid rgba(255,255,255,.92)}
#bubble-text{font-size:1em;line-height:1.55;color:var(--txt)}

/* Setup */
.setup-scr{height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
.setup-card{background:var(--card);border-radius:20px;padding:32px 24px;box-shadow:0 8px 32px rgba(0,0,0,.1);text-align:center;width:100%;max-width:360px}
.setup-card h1{font-size:1.3em;margin-bottom:8px;color:var(--od)}
.setup-card p{font-size:.85em;color:var(--tl);margin-bottom:20px}
.setup-card label{display:block;font-size:.8em;font-weight:600;margin:12px 0 4px;text-align:left}
.setup-card label small{font-weight:400;color:var(--tl)}
.setup-card input{width:100%;padding:12px;border:2px solid #F0E0D0;border-radius:12px;font-size:.9em;font-family:inherit;background:var(--bg);color:var(--txt)}
.setup-card input:focus{outline:none;border-color:var(--or)}
.prim-btn{width:100%;padding:14px;background:var(--or);color:#fff;border:none;border-radius:14px;font-size:1em;font-weight:700;font-family:inherit;cursor:pointer;margin-top:20px}
.prim-btn:active{background:var(--od);transform:scale(.97)}

/* Settings */
.s-scr{position:absolute;inset:0;background:var(--bg);flex-direction:column;z-index:100;overflow-y:auto;display:none}
.s-head{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--card);border-bottom:1px solid #F0E0D0;position:sticky;top:0}
.s-head h2{font-size:1.1em}
.s-back-btn{background:none;border:none;font-size:1.2em;cursor:pointer}
.s-body{padding:16px;display:flex;flex-direction:column;gap:4px;max-width:430px;margin:0 auto;width:100%}
.s-body label{font-size:.8em;font-weight:600;margin-top:10px}
.s-body input{width:100%;padding:10px;border:2px solid #F0E0D0;border-radius:12px;font-size:.9em;font-family:inherit;background:#fff;color:var(--txt)}
.s-body input:focus{outline:none;border-color:var(--or)}
.pin-area{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;padding:32px}
.pin-area input{width:200px;padding:12px;border:2px solid #F0E0D0;border-radius:12px;font-size:1.1em;text-align:center;font-family:inherit;letter-spacing:3px}
.pin-area input:focus{outline:none;border-color:var(--or)}
.pin-area .prim-btn{width:200px}

/* Toast */
.toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%) translateY(20px);background:rgba(0,0,0,.8);color:#fff;padding:10px 24px;border-radius:24px;font-size:.85em;white-space:nowrap;z-index:200;opacity:0;transition:all .3s;pointer-events:none}
.toast.vis{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
<div id="home" class="home">
  <button id="gear-btn" class="gear-btn">⚙️</button>
  <div id="home-fox"></div>
  <div class="tagline">🦊 我是小深，你的AI小伙伴</div>
  <div class="home-actions">
    <button id="call-btn" class="call-btn">📞 给我打电话</button>
    <button id="video-btn" class="video-btn">📹 视频通话</button>
  </div>
</div>
<div id="s-scr" class="s-scr" style="display:none">
  <div id="s-panel" style="display:none" class="s-body">
    <div class="s-head"><button id="s-back" class="s-back-btn">←</button><h2>设置</h2></div>
    <div style="padding:0 16px"><label>DeepSeek API Key</label><input id="s-ds" type="password"><label>Gemini API Key</label><input id="s-gk" type="password"><button id="s-save" class="prim-btn">💾 保存</button></div>
  </div>
  <div id="pin-area" class="pin-area"><h3>🔐 家长密码</h3><input id="pin-inp" type="password" maxlength="6" placeholder="默认:1234"><button id="pin-ok" class="prim-btn">确认</button></div>
</div>
<div id="toast" class="toast"></div>
`;

  // DOM
  initAvatar('home-fox');
  $('gear-btn').addEventListener('click', openSettings);
  $('call-btn').addEventListener('click', () => { warmup(); enterCall(false); });
  $('video-btn').addEventListener('click', () => { warmup(); enterCall(true); });
  $('pin-ok').addEventListener('click', pinOk);
  $('pin-inp').addEventListener('keydown', e => { if (e.key === 'Enter') pinOk(); });
  $('s-back').addEventListener('click', closeSettings);
  $('s-save').addEventListener('click', saveSettings);

  // Load voices
  if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

  sub = 'idle';
}

function showCallScreen() {
  const bg = camOn ? `style="background:#000"` : `style="background:linear-gradient(180deg,#FF8C42 0%,#FFB88C 40%,#FFF8F0 100%)"`;
  const txtVis = sub === 'idle' || sub === 'listening';
  $('app').innerHTML = `
<div id="call-scr" class="call-scr" ${bg}>
  ${camOn ? '<div class="cam-overlay"><video id="cam-video" autoplay playsinline></video><canvas id="cam-canvas" style="display:none"></canvas></div>' : ''}
  <div class="top-bar">
    ${camOn ? '<button id="cam-off" class="cam-btn">📷 关</button>' : '<button id="cam-on" class="cam-btn">📷 开</button>'}
    <button id="hangup" class="close-btn" style="background:rgba(255,0,0,.6);padding:8px 20px;border:none;color:#fff;border-radius:20px;font-size:.85em;font-family:inherit;cursor:pointer">🔴 挂断</button>
  </div>
  <div id="call-fox-wrap" class="call-fox-wrap${camOn?' oncam':''}"></div>
  <div id="call-status" class="call-status">🦊 小深正在听...</div>
  <div id="cam-hint" class="cam-hint"></div>
  <div id="bubble" class="bubble"><div class="arr"></div><span id="bubble-text"></span></div>
  <div id="call-text-row" class="text-row${txtVis?' visible':''}">
    <input id="text-inp" placeholder="或者打字...">
    <button id="text-send">发送</button>
  </div>
  <div class="hangup-row">
    <button id="hangup-btn" class="hangup-btn">📞</button>
  </div>
</div>
<div id="toast" class="toast"></div>
`;

  initAvatar('call-fox-wrap');
  initVoice({ onResult: onSpeechResult, onState: onSpeechState });
  initCam({ onFrame: null });

  // Events
  const hangupBtn = $('hangup-btn') || $('hangup');
  if (hangupBtn) hangupBtn.addEventListener('click', hangup);
  const camToggle = $('cam-on') || $('cam-off');
  if (camToggle) camToggle.addEventListener('click', toggleCam);
  const tgl = document.getElementById('text-toggle');
  if (tgl) tgl.addEventListener('click', () => {
    const r = document.getElementById('call-text-row');
    if (r) r.classList.toggle('visible');
  });
  const ts = $('text-send');
  if (ts) ts.addEventListener('click', () => {
    const v = ($('text-inp')||{}).value?.trim();
    if (v) { if ($('text-inp')) $('text-inp').value = ''; processUserText(v); }
  });
  const ti = $('text-inp');
  if (ti) ti.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { e.target.value = ''; processUserText(v); } }
  });

  updateUI();
}

function updateUI() {
  const status = $('call-status');
  const txtRow = document.getElementById('call-text-row');
  if (status) {
    if (sub === 'listening') status.textContent = '🎤 小深在听...';
    else if (sub === 'thinking') status.textContent = '🤔 小深在想...';
    else if (sub === 'speaking') status.textContent = '🦊 小深在说...';
    else status.textContent = '🦊 准备好了';
  }
}

// ===== Settings =====
function openSettings() {
  $('s-scr').style.display = 'flex';
  $('s-panel').style.display = 'none';
  $('pin-area').style.display = 'flex';
  $('pin-inp').value = '';
}

function closeSettings() {
  $('s-scr').style.display = 'none';
}

function pinOk() {
  if (checkPin($('pin-inp').value)) {
    $('pin-area').style.display = 'none';
    $('s-panel').style.display = 'block';
    const s = get();
    $('s-ds').value = s.deepseekKey;
    $('s-gk').value = s.geminiKey;
  } else { showToast('密码不对'); }
}

function saveSettings() {
  set({ deepseekKey: ($('s-ds')?.value||'').trim(), geminiKey: ($('s-gk')?.value||'').trim() });
  showToast('已保存 ✅');
  closeSettings();
}

// ===== Toast =====
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('vis');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('vis'), 2000);
}

// ===== Boot =====
function boot() {
  if (!ready()) return showSetup();
  showHomeScreen();
}

function showSetup() {
  $('app').innerHTML = `
<style>
*{margin:0;padding:0;box-sizing:border-box}:root{--or:#FF8C42;--od:#E06B2A;--bg:#FFF8F0;--txt:#4A3728}
html,body{width:100%;height:100%;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--txt)}
body{display:flex;justify-content:center;align-items:center}
#app{width:100%;max-width:430px;height:100dvh;position:relative;overflow:hidden;background:var(--bg);display:flex;align-items:center;justify-content:center}
.setup{background:#fff;border-radius:20px;padding:32px 24px;box-shadow:0 8px 32px rgba(0,0,0,.1);text-align:center;width:100%;max-width:360px}
.setup h1{font-size:1.3em;color:var(--od)}
.setup p{font-size:.85em;color:#8B7355;margin:8px 0 20px}
.setup label{display:block;font-size:.8em;font-weight:600;margin:12px 0 4px;text-align:left}
.setup label sm{font-weight:400;color:#8B7355}
.setup input{width:100%;padding:12px;border:2px solid #F0E0D0;border-radius:12px;font-size:.9em;font-family:inherit;background:var(--bg)}
.setup input:focus{outline:none;border-color:var(--or)}
.setup .btn{width:100%;padding:14px;background:var(--or);color:#fff;border:none;border-radius:14px;font-size:1em;font-weight:700;font-family:inherit;cursor:pointer;margin-top:20px}
.setup .btn:active{background:var(--od)}
.toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#fff;padding:10px 24px;border-radius:24px;font-size:.85em;z-index:200;opacity:0;transition:opacity .3s;pointer-events:none}
.toast.show{opacity:1}
</style>
<div class="setup">
  <div id="su-fox"></div>
  <h1>🦊 欢迎来到小深的世界</h1>
  <p>设置一下就能聊天啦～</p>
  <label>DeepSeek API Key <sm>*</sm></label><input id="su-ds" type="password" placeholder="sk-...">
  <label>Gemini API Key <sm>(视频需要)</sm></label><input id="su-gk" type="password" placeholder="AIza...">
  <button id="su-save" class="btn">🔑 保存并开始</button>
</div>
<div id="toast" class="toast"></div>
`;

  import('./avatar.js').then(m => m.initAvatar('su-fox'));
  $('su-save').addEventListener('click', () => {
    const ds = ($('su-ds')?.value||'').trim();
    if (!ds) { showToast('请填 DeepSeek API Key'); return; }
    set({ deepseekKey: ds, geminiKey: ($('su-gk')?.value||'').trim() });
    boot();
  });
}

boot();

// Fox avatar control
// Renders an animated fox SVG that reacts to the AI state

const FOX_SVG = `
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bodyGrad" cx="50%" cy="40%" r="50%">
      <stop offset="0%" style="stop-color:#FF8C42"/>
      <stop offset="100%" style="stop-color:#E06B2A"/>
    </radialGradient>
    <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#FFD6B3"/>
      <stop offset="100%" style="stop-color:#FFE4C4"/>
    </radialGradient>
    <filter id="softShadow">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.15"/>
    </filter>
  </defs>

  <!-- Left Ear -->
  <polygon points="55,70 75,20 95,65" fill="#E06B2A" stroke="#CC5518" stroke-width="2"/>
  <polygon points="65,65 78,35 88,63" fill="#FFB8A0"/>

  <!-- Right Ear -->
  <polygon points="145,70 125,20 105,65" fill="#E06B2A" stroke="#CC5518" stroke-width="2"/>
  <polygon points="135,65 122,35 112,63" fill="#FFB8A0"/>

  <!-- Head -->
  <ellipse cx="100" cy="105" rx="55" ry="50" fill="url(#bodyGrad)" filter="url(#softShadow)"/>

  <!-- Cheeks (white muzzle area) -->
  <ellipse id="fox-cheek" cx="100" cy="120" rx="38" ry="32" fill="url(#cheekGrad)"/>

  <!-- Left Eye -->
  <g id="fox-left-eye">
    <ellipse cx="78" cy="95" rx="14" ry="15" fill="white" stroke="#333" stroke-width="1.5"/>
    <ellipse cx="80" cy="94" rx="8" ry="9" fill="#333"/>
    <ellipse cx="83" cy="90" rx="3" ry="3" fill="white"/>
  </g>

  <!-- Right Eye -->
  <g id="fox-right-eye">
    <ellipse cx="122" cy="95" rx="14" ry="15" fill="white" stroke="#333" stroke-width="1.5"/>
    <ellipse cx="120" cy="94" rx="8" ry="9" fill="#333"/>
    <ellipse cx="123" cy="90" rx="3" ry="3" fill="white"/>
  </g>

  <!-- Nose -->
  <ellipse cx="100" cy="110" rx="6" ry="4.5" fill="#333"/>

  <!-- Mouth (normal - smile) -->
  <path id="fox-mouth" d="M90,120 Q100,132 110,120" fill="none" stroke="#333" stroke-width="2.5" stroke-linecap="round"/>

  <!-- Blush marks -->
  <ellipse cx="65" cy="108" rx="7" ry="4" fill="#FF6B6B" opacity="0.3"/>
  <ellipse cx="135" cy="108" rx="7" ry="4" fill="#FF6B6B" opacity="0.3"/>
</svg>
`;

const MOUTH_OPEN = 'M85,120 Q100,142 115,120';
const MOUTH_CLOSED = 'M90,120 Q100,132 110,120';
const MOUTH_HAPPY = 'M88,118 Q100,136 112,118';

let mouthTimer = null;
let blinkTimer = null;
let isSpeaking = false;

export function initAvatar(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `<div id="fox-avatar" class="fox-avatar">${FOX_SVG}</div>`;

  // Start idle animations
  startBlinking();
  startIdleBounce();
}

export function setExpression(expr) {
  const mouth = document.getElementById('fox-mouth');
  if (!mouth) return;

  switch (expr) {
    case 'speaking':
      if (!isSpeaking) {
        isSpeaking = true;
        startMouthAnim();
      }
      break;
    case 'happy':
      mouth.setAttribute('d', MOUTH_HAPPY);
      break;
    case 'thinking':
      mouth.setAttribute('d', 'M92,120 Q100,130 108,120');
      break;
    default:
      isSpeaking = false;
      stopMouthAnim();
      mouth.setAttribute('d', MOUTH_CLOSED);
      break;
  }
}

function startMouthAnim() {
  stopMouthAnim();
  const mouth = document.getElementById('fox-mouth');
  if (!mouth) return;

  let open = false;
  mouthTimer = setInterval(() => {
    open = !open;
    mouth.setAttribute('d', open ? MOUTH_OPEN : MOUTH_CLOSED);
  }, 200);
}

function stopMouthAnim() {
  if (mouthTimer) {
    clearInterval(mouthTimer);
    mouthTimer = null;
  }
}

function startBlinking() {
  stopBlinking();
  const leftEye = document.getElementById('fox-left-eye');
  const rightEye = document.getElementById('fox-right-eye');
  if (!leftEye || !rightEye) return;

  blinkTimer = setInterval(() => {
    leftEye.style.transform = 'scaleY(0.1)';
    rightEye.style.transform = 'scaleY(0.1)';
    setTimeout(() => {
      leftEye.style.transform = 'scaleY(1)';
      rightEye.style.transform = 'scaleY(1)';
    }, 150);
  }, 3000 + Math.random() * 3000);
}

function stopBlinking() {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
}

function startIdleBounce() {
  const avatar = document.getElementById('fox-avatar');
  if (!avatar) return;

  avatar.style.animation = 'fox-float 3s ease-in-out infinite';
  avatar.style.setProperty('--float-distance', '6px');
}

export function setAvatarVisible(visible) {
  const avatar = document.getElementById('fox-avatar');
  if (avatar) {
    avatar.style.display = visible ? '' : 'none';
    if (visible) {
      startBlinking();
      startIdleBounce();
    } else {
      if (blinkTimer) clearInterval(blinkTimer);
      stopMouthAnim();
    }
  }
}

export function cleanup() {
  stopMouthAnim();
  if (blinkTimer) clearInterval(blinkTimer);
}

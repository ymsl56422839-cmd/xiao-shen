const FOX_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <radialGradient id="b" cx="50%" cy="40%" r="50%"><stop offset="0%" stop-color="#FF8C42"/><stop offset="100%" stop-color="#E06B2A"/></radialGradient>
  <polygon points="35,45 50,12 60,42" fill="#E06B2A"/><polygon points="85,45 70,12 60,42" fill="#E06B2A"/>
  <ellipse cx="60" cy="68" rx="38" ry="34" fill="url(#b)"/>
  <ellipse cx="60" cy="78" rx="26" ry="22" fill="#FFE4C4"/>
  <ellipse cx="48" cy="62" rx="9" ry="10" fill="white" stroke="#333" stroke-width="1"/><ellipse cx="72" cy="62" rx="9" ry="10" fill="white" stroke="#333" stroke-width="1"/>
  <circle cx="50" cy="61" r="5" fill="#333"/><circle cx="70" cy="61" r="5" fill="#333"/>
  <circle cx="52" cy="58" r="2" fill="white"/><circle cx="72" cy="58" r="2" fill="white"/>
  <ellipse cx="60" cy="72" rx="4" ry="3" fill="#333"/>
  <path id="fm" d="M53,78 Q60,88 67,78" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="42" cy="72" rx="5" ry="3" fill="#FF6B6B" opacity=".25"/>
  <ellipse cx="78" cy="72" rx="5" ry="3" fill="#FF6B6B" opacity=".25"/>
</svg>`;

let mouthTimer = null;
let blinkTimer = null;
let speaking = false;

export function initAvatar(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div id="fox-avatar" class="fox-avatar">${FOX_SVG}</div>`;
  startBlink();
}

export function setExpression(expr) {
  const m = document.getElementById('fm');
  if (!m) return;
  if (expr === 'speaking') {
    if (!speaking) { speaking = true; animMouth(); }
  } else {
    speaking = false;
    if (mouthTimer) { clearInterval(mouthTimer); mouthTimer = null; }
    m.setAttribute('d', 'M53,78 Q60,88 67,78');
  }
}

function animMouth() {
  if (mouthTimer) clearInterval(mouthTimer);
  const m = document.getElementById('fm');
  let open = false;
  mouthTimer = setInterval(() => {
    open = !open;
    m?.setAttribute('d', open ? 'M50,78 Q60,96 70,78' : 'M53,78 Q60,88 67,78');
  }, 250);
}

function startBlink() {
  if (blinkTimer) clearInterval(blinkTimer);
  blinkTimer = setInterval(() => {
    const le = document.getElementById('fox-left-eye');
    const re = document.getElementById('fox-right-eye');
    if (le) le.style.transform = 'scaleY(0.1)';
    if (re) re.style.transform = 'scaleY(0.1)';
    setTimeout(() => {
      if (le) le.style.transform = '';
      if (re) re.style.transform = '';
    }, 120);
  }, 3500);
}

export function cleanup() {
  if (mouthTimer) clearInterval(mouthTimer);
  if (blinkTimer) clearInterval(blinkTimer);
}

let videoStream = null;
let videoEl = null;
let canvasEl = null;
let onCapture = null;

export function initCamera({ onFrame }) {
  onCapture = onFrame;
}

export async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    videoEl = document.getElementById('camera-video');
    canvasEl = document.getElementById('camera-canvas');
    if (videoEl) {
      videoEl.srcObject = videoStream;
      await videoEl.play();
    }
    return true;
  } catch { return false; }
}

export function stopCamera() {
  videoStream?.getTracks().forEach(t => t.stop());
  videoStream = null;
  if (videoEl) videoEl.srcObject = null;
}

export function captureFrame() {
  if (!videoEl || !canvasEl || !onCapture) return null;
  const v = videoEl, c = canvasEl;
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  const b64 = c.toDataURL('image/jpeg', 0.8).split(',')[1];
  onCapture(b64, 'image/jpeg');
  return b64;
}

export function isActive() {
  return !!videoStream?.active;
}

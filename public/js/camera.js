let videoStream = null;
let videoElement = null;
let canvasElement = null;
let captureInterval = null;
let onFrameCaptured = null;

export function initCamera({ onFrame, onState }) {
  onFrameCaptured = onFrame;
  canvasElement = document.getElementById('camera-canvas');
  videoElement = document.getElementById('camera-video');
}

export async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment', // rear camera
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    videoElement.srcObject = videoStream;
    await videoElement.play();

    // Start periodic capture
    captureInterval = setInterval(captureFrame, 3000);

    return true;
  } catch (err) {
    console.error('Camera error:', err);
    return false;
  }
}

export function stopCamera() {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  if (videoElement) {
    videoElement.srcObject = null;
  }
}

export function captureFrame() {
  if (!videoElement || !canvasElement || !onFrameCaptured) return null;

  const video = videoElement;
  const canvas = canvasElement;
  const ctx = canvas.getContext('2d');

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const mimeType = 'image/jpeg';
  const quality = 0.6;
  const dataUrl = canvas.toDataURL(mimeType, quality);

  // Extract base64 without prefix
  const base64 = dataUrl.split(',')[1];

  onFrameCaptured(base64, mimeType);
  return base64;
}

export function isActive() {
  return videoStream !== null && videoStream.active;
}

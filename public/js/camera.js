let stream = null;
let onFrame = null;

export function init(cbs) {
  onFrame = cbs.onFrame;
}

export async function start() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    const v = document.getElementById('cam-video');
    if (v) { v.srcObject = stream; await v.play(); }
    return true;
  } catch { return false; }
}

export function stop() {
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  const v = document.getElementById('cam-video');
  if (v) v.srcObject = null;
}

export function snap() {
  const v = document.getElementById('cam-video');
  const c = document.getElementById('cam-canvas');
  if (!v || !c) return null;
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75).split(',')[1];
}

export function active() { return !!stream?.active; }

/**
 * video-in.js — stream the rear camera to a <video>, and emit JPEG frames at VIDEO_FPS
 * as base64 for the Live model to watch. Low fps keeps bandwidth sane; the model only
 * needs periodic frames to notice the shop board / count assets.
 */
export async function startCamera(videoEl, onFrame, fps = 1) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const timer = setInterval(() => {
    if (!videoEl.videoWidth) return;
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
    onFrame(b64);
  }, 1000 / fps);

  return {
    stop() { clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); },
  };
}

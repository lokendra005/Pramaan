/**
 * audio-in.js — capture the mic at 16 kHz mono and emit base64 PCM16 chunks.
 * Uses an AudioWorklet (pcm-worklet.js) so capture runs off the main thread.
 */
export async function startMic(onChunk) {
  // Desktop Chrome honours an explicit 16 kHz context — matches what the Live API wants.
  const ctx = new AudioContext({ sampleRate: 16000 });
  if (ctx.sampleRate !== 16000) console.warn("[audio-in] context is", ctx.sampleRate, "Hz, expected 16000");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const source = ctx.createMediaStreamSource(stream);
  await ctx.audioWorklet.addModule("pcm-worklet.js");
  const node = new AudioWorkletNode(ctx, "pcm-worklet");

  node.port.onmessage = (e) => onChunk(bufToBase64(e.data));
  source.connect(node);
  // Do NOT connect node → destination (would echo the mic to the speakers).

  return {
    stop() { node.disconnect(); source.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); },
  };
}

function bufToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

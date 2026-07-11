/**
 * pcm-worklet.js — AudioWorkletProcessor.
 * Buffers mic audio and posts 16-bit PCM (little-endian) chunks to the main thread.
 * Runs in the AudioWorkletGlobalScope (no DOM/btoa here) — main thread base64-encodes.
 */
class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._target = 1600; // ~100ms at 16kHz
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      while (this._buf.length >= this._target) {
        const frame = this._buf.splice(0, this._target);
        const pcm = new Int16Array(frame.length);
        for (let i = 0; i < frame.length; i++) {
          const s = Math.max(-1, Math.min(1, frame[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
      }
    }
    return true;
  }
}
registerProcessor("pcm-worklet", PCMWorklet);

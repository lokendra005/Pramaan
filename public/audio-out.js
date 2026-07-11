/**
 * audio-out.js — play the model's 24 kHz PCM16 audio, scheduled gaplessly.
 * `stop()` implements barge-in: on interruption we drop everything queued so the model
 * goes quiet the instant the human talks over it.
 */
export class AudioOut {
  constructor(sampleRate = 24000) {
    this.ctx = new AudioContext({ sampleRate });
    this.sampleRate = sampleRate;
    this.cursor = 0;
    this.sources = [];
  }

  /** Queue+play a base64 PCM16 chunk, scheduled gaplessly after the previous one. */
  play(b64) {
    const pcm = base64ToInt16(b64);
    if (!pcm.length) return;
    const buf = this.ctx.createBuffer(1, pcm.length, this.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    // If we've fallen behind (network jitter / gap), restart the queue with a small lead
    // so chunks don't collide at `now` and produce the choppy "i i i" stutter.
    if (this.cursor < now + 0.02) this.cursor = now + 0.12;
    src.start(this.cursor);
    this.cursor += buf.duration;

    this.sources.push(src);
    src.onended = () => { this.sources = this.sources.filter((s) => s !== src); };
  }

  /** Barge-in: stop everything currently queued. */
  stop() {
    for (const s of this.sources) { try { s.stop(); } catch { /* ignore */ } }
    this.sources = [];
    this.cursor = this.ctx.currentTime;
  }

  resume() { if (this.ctx.state === "suspended") this.ctx.resume(); }
}

function base64ToInt16(b64) {
  const bin = atob(b64);
  // Int16Array needs an even byte length; drop a stray trailing byte if present.
  const len = bin.length - (bin.length % 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

class HLSFAudioProcessor extends AudioWorkletProcessor {
  constructor(){
    super();

    this.sampleRate = sampleRate;
    this.phase = 0;
    this.table = new Float32Array(0);
    this.speed = 1;
    this.gain = 1;
    this.gateThreshold = 0.02;
    this.hpPrevX = 0;
    this.hpPrevY = 0;
    this.enabled = false;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'params') {
        if (msg.wavetable) {
          this.table = msg.wavetable;
          if (!(this.table instanceof Float32Array)) {
            this.table = Float32Array.from(this.table);
          }
        }
        if (Number.isFinite(msg.speed)) this.speed = msg.speed;
        if (Number.isFinite(msg.gain)) this.gain = msg.gain;
        if (Number.isFinite(msg.gateThreshold)) this.gateThreshold = msg.gateThreshold;
        this.enabled = msg.enabled === true;
      }
    };
  }

  process(inputs, outputs){
    const output = outputs[0][0];
    const table = this.table;
    const tableLen = table.length;

    if (!this.enabled || tableLen === 0) {
      output.fill(0);
      return true;
    }

    let phase = this.phase;
    const speed = this.speed;
    const gain = this.gain;
    const hpA = 0.995;
    let prevX = this.hpPrevX;
    let prevY = this.hpPrevY;

    let sumSq = 0;
    for (let i = 0; i < output.length; i++) {
      const idx = Math.floor(phase);
      const frac = phase - idx;
      const a = table[idx % tableLen];
      const b = table[(idx + 1) % tableLen];
      let sample = (a + (b - a) * frac) * gain;

      const hp = sample - prevX + hpA * prevY;
      prevX = sample;
      prevY = hp;
      sample = Math.tanh(hp);

      output[i] = sample;
      sumSq += sample * sample;

      phase += speed;
      if (phase >= tableLen) phase -= tableLen * Math.floor(phase / tableLen);
    }

    const rms = Math.sqrt(sumSq / output.length);
    if (rms < this.gateThreshold) {
      output.fill(0);
    }

    this.phase = phase;
    this.hpPrevX = prevX;
    this.hpPrevY = prevY;

    return true;
  }
}

registerProcessor('hlsf-audio-processor', HLSFAudioProcessor);

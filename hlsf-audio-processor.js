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
    this.monitorCounter = 0;
    this.monitorRate = 128;
    this.monitorBuffer = new Float32Array(256);
    this.monitorWrite = 0;

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

  _pushMonitorSample(sample){
    this.monitorBuffer[this.monitorWrite] = sample;
    this.monitorWrite = (this.monitorWrite + 1) % this.monitorBuffer.length;
  }

  _emitMonitorFrame(){
    const slice = new Float32Array(this.monitorBuffer.length);
    let rms = 0;
    for (let i = 0; i < slice.length; i++) {
      const idx = (this.monitorWrite + i) % this.monitorBuffer.length;
      const v = this.monitorBuffer[idx];
      slice[i] = v;
      rms += v * v;
    }
    rms = Math.sqrt(rms / slice.length);
    this.port.postMessage({
      type: 'monitor',
      wave: slice,
      rms,
      gated: rms < this.gateThreshold
    });
  }

  process(inputs, outputs){
    const output = outputs[0][0];
    const table = this.table;
    const tableLen = table.length;

    if (!this.enabled || tableLen === 0) {
      output.fill(0);
      for (let i = 0; i < output.length; i++) {
        this._pushMonitorSample(0);
      }
      this.monitorCounter++;
      if (this.monitorCounter % this.monitorRate === 0) {
        this._emitMonitorFrame();
      }
      return true;
    }

    let phase = this.phase;
    const speed = this.speed;
    const gain = this.gain;
    const hpA = 0.995;
    let prevX = this.hpPrevX;
    let prevY = this.hpPrevY;

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

      phase += speed;
      if (phase >= tableLen) phase -= tableLen * Math.floor(phase / tableLen);
    }

    let sumSq = 0;
    for (let i = 0; i < output.length; i++) {
      sumSq += output[i] * output[i];
    }

    const rms = Math.sqrt(sumSq / output.length);
    if (rms < this.gateThreshold) {
      output.fill(0);
    }

    for (let i = 0; i < output.length; i++) {
      this._pushMonitorSample(output[i]);
    }
    this.monitorCounter++;
    if (this.monitorCounter % this.monitorRate === 0) {
      this._emitMonitorFrame();
    }

    this.phase = phase;
    this.hpPrevX = prevX;
    this.hpPrevY = prevY;

    return true;
  }
}

registerProcessor('hlsf-audio-processor', HLSFAudioProcessor);

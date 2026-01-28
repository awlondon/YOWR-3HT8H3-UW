class HLSFAudioProcessor extends AudioWorkletProcessor {
  constructor(){
    super();

    this.sampleRate = sampleRate;
    this.phase = 0;
    this.table = new Float32Array(0);
    this.speed = 1;
    this.freqHz = 110;
    this.gateThreshold = 0.0025;
    this.userVolume = 0.1;
    this.useHP = false;
    this.hpPrevX = 0;
    this.hpPrevY = 0;
    this.enabled = true;
    this.monitorCounter = 0;
    this.monitorRate = 8;
    this.monitorBuffer = new Float32Array(256);
    this.monitorWrite = 0;
    this.frameCount = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'reset') {
        this.phase = 0;
        this.hpPrevX = 0;
        this.hpPrevY = 0;
        this.monitorWrite = 0;
        this.monitorCounter = 0;
        this.metricsCounter = 0;
        return;
      }
      if (msg.type === 'params') {
        if (msg.wavetable) {
          this.table = msg.wavetable;
          if (!(this.table instanceof Float32Array)) {
            this.table = Float32Array.from(this.table);
          }
          if (this.table.length > 0 && msg.enabled == null) {
            this.enabled = true;
          }
        }
        if (Number.isFinite(msg.freqHz)) this.freqHz = Math.max(1, msg.freqHz);
        if (Number.isFinite(msg.speed)) this.speed = msg.speed;
        if (Number.isFinite(msg.gateThreshold)) this.gateThreshold = Math.max(0, msg.gateThreshold);
        if (Number.isFinite(msg.userVolume)) this.userVolume = Math.max(0, msg.userVolume);
        if (typeof msg.useHP === 'boolean') this.useHP = msg.useHP;
        if (msg.enabled != null) this.enabled = msg.enabled === true;
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
      if ((this.monitorCounter % this.monitorRate) === 0) {
        this._emitMonitorFrame();
        this.port.postMessage({
          type: 'audio-metrics',
          rms: 0,
          audible: false
        });
      }
      return true;
    }

    let phase = this.phase;
    const hpA = 0.995;
    let prevX = this.hpPrevX;
    let prevY = this.hpPrevY;
    const useHP = this.useHP;
    const phaseInc = (this.freqHz * tableLen) / this.sampleRate;

    for (let i = 0; i < output.length; i++) {
      const idx = Math.floor(phase);
      const frac = phase - idx;
      const a = table[idx % tableLen];
      const b = table[(idx + 1) % tableLen];
      let sample = a + (b - a) * frac;

      if (useHP) {
        const hp = sample - prevX + hpA * prevY;
        prevX = sample;
        prevY = hp;
        sample = hp;
      }

      output[i] = sample;

      phase += phaseInc;
      if (phase >= tableLen) phase -= tableLen * Math.floor(phase / tableLen);
    }

    let sumSq = 0;
    for (let i = 0; i < output.length; i++) {
      sumSq += output[i] * output[i];
    }

    const rms = Math.sqrt(sumSq / output.length);
    const threshold = this.gateThreshold ?? 0;
    if (rms < threshold) {
      output.fill(0);
      for (let i = 0; i < output.length; i++) {
        this._pushMonitorSample(0);
      }
      this.monitorCounter++;
      if ((this.monitorCounter % this.monitorRate) === 0) {
        this._emitMonitorFrame();
        this.port.postMessage({
          type: 'audio-metrics',
          rms: 0,
          audible: false
        });
      }
      this.phase = phase;
      this.hpPrevX = prevX;
      this.hpPrevY = prevY;
      return true;
    }

    const baseGain = Math.min(1.0, Math.max(0.0, (this.userVolume ?? 0.2)));
    const limit = 0.85;
    let postSumSq = 0;
    for (let i = 0; i < output.length; i++) {
      let s = output[i] * baseGain;
      if (Math.abs(s) > limit) {
        s = Math.tanh(s / limit) * limit;
      }
      output[i] = s;
      postSumSq += s * s;
    }
    const postRms = Math.sqrt(postSumSq / output.length);

    this.frameCount++;

    for (let i = 0; i < output.length; i++) {
      this._pushMonitorSample(output[i]);
    }
    this.monitorCounter++;
    if ((this.monitorCounter % this.monitorRate) === 0) {
      this._emitMonitorFrame();
      this.port.postMessage({
        type: 'audio-metrics',
        rms: postRms,
        gain: baseGain,
        audible: postRms >= threshold
      });
    }

    this.phase = phase;
    this.hpPrevX = prevX;
    this.hpPrevY = prevY;

    return true;
  }
}

registerProcessor('hlsf-audio-processor', HLSFAudioProcessor);

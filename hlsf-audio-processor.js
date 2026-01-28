class HLSFAudioProcessor extends AudioWorkletProcessor {
  constructor(){
    super();

    this.sampleRate = sampleRate;
    this.phase = 0;

    this.frequencies = [];
    this.amplitudes = [];
    this.enabled = false;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'params') {
        this.frequencies = msg.freqs || [];
        this.amplitudes = msg.amps || [];
        this.enabled = msg.enabled === true;
      }
    };
  }

  process(inputs, outputs){
    const output = outputs[0][0];

    if (!this.enabled || this.frequencies.length === 0) {
      output.fill(0);
      return true;
    }

    for (let i = 0; i < output.length; i++) {
      let sample = 0;

      for (let k = 0; k < this.frequencies.length; k++) {
        const freq = this.frequencies[k];
        const amp = this.amplitudes[k] ?? 0;
        sample += Math.sin(this.phase * freq) * amp;
      }

      this.phase += 2 * Math.PI / this.sampleRate;
      output[i] = sample;
    }

    return true;
  }
}

registerProcessor('hlsf-audio-processor', HLSFAudioProcessor);

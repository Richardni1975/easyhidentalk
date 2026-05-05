/**
 * Pitch Shifter AudioWorkletProcessor
 * Uses time-domain pitch shifting via a circular buffer with cross-fading.
 */
class PitchShifterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.pitchRatio = 1.35;
    this.enabled = true;

    this.port.onmessage = (event) => {
      if (event.data.pitchRatio !== undefined) {
        this.pitchRatio = event.data.pitchRatio;
      }
      if (event.data.enabled !== undefined) {
        this.enabled = event.data.enabled;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length || !input[0] || !input[0].length) {
      return true;
    }

    if (!this.enabled) {
      // Pass through unchanged
      for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
        for (let i = 0; i < input[channel].length; i++) {
          output[channel][i] = input[channel][i];
        }
      }
      return true;
    }

    for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        // Write input to circular buffer
        this.buffer[this.writeIndex] = inputChannel[i];
        this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

        // Read from buffer at shifted rate
        const readPos = this.readIndex;
        const intPos = Math.floor(readPos);
        const frac = readPos - intPos;
        const nextPos = (intPos + 1) % this.bufferSize;

        // Linear interpolation
        const sample = this.buffer[intPos] * (1 - frac) + this.buffer[nextPos] * frac;

        // Simple cross-fade to reduce artifacts
        const wrapPoint = this.bufferSize * 0.75;
        let fade = 1.0;
        if (readPos % this.bufferSize > wrapPoint) {
          fade = 1.0 - (readPos % this.bufferSize - wrapPoint) / (this.bufferSize - wrapPoint);
        }

        outputChannel[i] = sample * fade;
        this.readIndex = (this.readIndex + this.pitchRatio) % this.bufferSize;
      }
    }

    return true;
  }
}

registerProcessor("pitch-shifter-processor", PitchShifterProcessor);

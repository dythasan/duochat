// Generate a simple notification WAV file
const fs = require('fs')
const path = require('path')

const sampleRate = 44100
const duration = 0.3 // seconds
const numSamples = Math.floor(sampleRate * duration)

// Create two-tone ding sound
const samples = new Float32Array(numSamples)
for (let i = 0; i < numSamples; i++) {
  const t = i / sampleRate
  const freq1 = 880  // A5
  const freq2 = 1318 // E6
  
  let sample
  if (t < 0.15) {
    // First tone
    const envelope = Math.exp(-t * 15)
    sample = Math.sin(2 * Math.PI * freq1 * t) * envelope * 0.8
  } else {
    // Second tone
    const t2 = t - 0.15
    const envelope = Math.exp(-t2 * 15)
    sample = Math.sin(2 * Math.PI * freq2 * t2) * envelope * 0.8
  }
  samples[i] = sample
}

// Convert to 16-bit PCM
const buffer = Buffer.alloc(44 + numSamples * 2)

// WAV header
buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + numSamples * 2, 4)
buffer.write('WAVE', 8)
buffer.write('fmt ', 12)
buffer.writeUInt32LE(16, 16)        // chunk size
buffer.writeUInt16LE(1, 20)         // PCM
buffer.writeUInt16LE(1, 22)         // mono
buffer.writeUInt32LE(sampleRate, 24)
buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
buffer.writeUInt16LE(2, 32)         // block align
buffer.writeUInt16LE(16, 34)        // bits per sample
buffer.write('data', 36)
buffer.writeUInt32LE(numSamples * 2, 40)

for (let i = 0; i < numSamples; i++) {
  const val = Math.max(-1, Math.min(1, samples[i]))
  buffer.writeInt16LE(Math.floor(val * 32767), 44 + i * 2)
}

fs.writeFileSync(path.join(__dirname, '..', 'public', 'sounds', 'notify.wav'), buffer)
console.log('Sound file created: public/sounds/notify.wav')

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRate = 22_050;
const outputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src-tauri/resources'
);

function envelope(time, duration) {
  const attack = Math.min(1, time / 0.035);
  const release = Math.min(1, (duration - time) / 0.18);
  return Math.max(0, attack * release) * Math.exp(-time * 1.7);
}

function createWave(filename, duration, oscillator) {
  const sampleCount = Math.floor(sampleRate * duration);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const sample = Math.max(
      -1,
      Math.min(1, oscillator(time, duration) * envelope(time, duration))
    );
    buffer.writeInt16LE(Math.round(sample * 13_500), 44 + index * 2);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, filename), buffer);
}

const sine = (frequency, time) => Math.sin(2 * Math.PI * frequency * time);

createWave('soft-chime.wav', 1, (time) => {
  return (
    sine(523.25, time) * 0.5 +
    sine(659.25, time) * 0.3 +
    sine(783.99, time) * 0.2
  );
});

createWave('gentle-chime.wav', 2, (time) => {
  const secondNote = Math.max(0, time - 0.72);
  const first =
    (sine(392, time) * 0.62 + sine(784, time) * 0.12) *
    Math.exp(-time * 1.25);
  const second =
    (sine(523.25, secondNote) * 0.55 +
      sine(1046.5, secondNote) * 0.1) *
    Math.exp(-secondNote * 1.5) *
    (time >= 0.72 ? 1 : 0);
  return first + second;
});

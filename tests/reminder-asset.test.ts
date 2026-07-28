import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface GifMetadata {
  width: number;
  height: number;
  frameCount: number;
  delays: number[];
  transparentFrames: number;
  loopCount: number | null;
}

function skipSubBlocks(buffer: Buffer, start: number): number {
  let position = start;
  while (position < buffer.length) {
    const length = buffer[position];
    position += 1;
    if (length === 0) {
      return position;
    }
    position += length;
  }
  throw new Error('Malformed GIF sub-block.');
}

function readGifMetadata(buffer: Buffer): GifMetadata {
  expect(buffer.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/);

  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const globalPacked = buffer[10];
  let position =
    13 +
    ((globalPacked & 0x80) !== 0
      ? 3 * 2 ** ((globalPacked & 0x07) + 1)
      : 0);
  let frameCount = 0;
  let transparentFrames = 0;
  let loopCount: number | null = null;
  const delays: number[] = [];

  while (position < buffer.length) {
    const marker = buffer[position];
    if (marker === 0x3b) {
      break;
    }

    if (marker === 0x21) {
      const label = buffer[position + 1];
      if (label === 0xf9) {
        const packed = buffer[position + 3];
        delays.push(buffer.readUInt16LE(position + 4));
        if ((packed & 0x01) !== 0) {
          transparentFrames += 1;
        }
        position += 8;
        continue;
      }

      if (label === 0xff) {
        const appBlockLength = buffer[position + 2];
        const appName = buffer
          .subarray(position + 3, position + 3 + appBlockLength)
          .toString('ascii');
        const dataStart = position + 3 + appBlockLength;
        if (
          appName === 'NETSCAPE2.0' &&
          buffer[dataStart] === 3 &&
          buffer[dataStart + 1] === 1
        ) {
          loopCount = buffer.readUInt16LE(dataStart + 2);
        }
        position = skipSubBlocks(buffer, dataStart);
        continue;
      }

      position = skipSubBlocks(buffer, position + 2);
      continue;
    }

    if (marker === 0x2c) {
      frameCount += 1;
      const imagePacked = buffer[position + 9];
      position +=
        10 +
        ((imagePacked & 0x80) !== 0
          ? 3 * 2 ** ((imagePacked & 0x07) + 1)
          : 0);
      position += 1;
      position = skipSubBlocks(buffer, position);
      continue;
    }

    throw new Error(`Unexpected GIF marker 0x${marker.toString(16)}.`);
  }

  return {
    width,
    height,
    frameCount,
    delays,
    transparentFrames,
    loopCount
  };
}

describe('reminder animation', () => {
  it('has the required dimensions, timing, transparency, and loop', () => {
    const assetPath = path.resolve(
      process.cwd(),
      'src/renderer/assets/standup-reminder.gif'
    );
    const metadata = readGifMetadata(fs.readFileSync(assetPath));

    expect(metadata.width).toBe(256);
    expect(metadata.height).toBe(384);
    expect(metadata.frameCount).toBe(6);
    expect(metadata.delays).toEqual([25, 25, 25, 25, 25, 25]);
    expect(metadata.transparentFrames).toBe(6);
    expect(metadata.loopCount).toBe(0);
  });
});

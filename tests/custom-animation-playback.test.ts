import { describe, expect, it } from 'vitest';
import {
  loadAndDecodeAnimation,
  loadAnimationWithFallback,
  type AnimationImage
} from '../src/renderer/animation-loader.js';

type Outcome = 'load' | 'load-decode-failure' | 'error';

class FakeAnimationImage {
  complete = false;
  naturalWidth = 0;
  assignedSources: string[] = [];
  private currentSource = '';
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(private readonly outcomes: Record<string, Outcome>) {}

  get src(): string {
    return this.currentSource;
  }

  set src(source: string) {
    this.currentSource = source;
    this.complete = false;
    this.naturalWidth = 0;
    this.assignedSources.push(source);
    queueMicrotask(() => {
      const outcome = this.outcomes[source] ?? 'error';
      this.complete = true;
      this.naturalWidth = outcome === 'error' ? 0 : 256;
      this.emit(outcome === 'error' ? 'error' : 'load');
    });
  }

  async decode(): Promise<void> {
    if (this.outcomes[this.currentSource] === 'load-decode-failure') {
      throw new Error('decode failed');
    }
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  asImage(): AnimationImage {
    return this as unknown as AnimationImage;
  }
}

describe('custom animation playback', () => {
  it('acknowledges a custom animation only after load and decode succeed', async () => {
    const image = new FakeAnimationImage({ custom: 'load' });

    await expect(
      loadAndDecodeAnimation(image.asImage(), 'custom', 100)
    ).resolves.toBeUndefined();
    expect(image.assignedSources).toEqual(['custom']);
    expect(image.complete).toBe(true);
    expect(image.naturalWidth).toBe(256);
  });

  it('falls back to the built-in animation when custom decoding fails', async () => {
    const image = new FakeAnimationImage({
      custom: 'load-decode-failure',
      default: 'load'
    });

    await expect(
      loadAnimationWithFallback(image.asImage(), 'custom', 'default', 100)
    ).resolves.toBe('default');
    expect(image.assignedSources).toEqual(['custom', 'default']);
  });

  it('reports failure when the built-in fallback also cannot load', async () => {
    const image = new FakeAnimationImage({
      custom: 'error',
      default: 'error'
    });

    await expect(
      loadAnimationWithFallback(image.asImage(), 'custom', 'default', 100)
    ).rejects.toThrow('could not be loaded');
    expect(image.assignedSources).toEqual(['custom', 'default']);
  });
});

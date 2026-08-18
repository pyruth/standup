import { describe, expect, it } from 'vitest';
import {
  loadAndDecodeAnimation,
  loadAnimationWithFallback,
  type AnimationImage
} from '../src/renderer/animation-loader.js';
import {
  waitForLottieReady,
  type LottieAnimationHandle
} from '../src/renderer/lottie-loader.js';

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

class FakeLottieAnimation implements LottieAnimationHandle {
  private readonly listeners = new Map<
    string,
    Set<(event?: unknown) => void>
  >();

  addEventListener(
    eventName: string,
    callback: (event?: unknown) => void
  ): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(callback);
    this.listeners.set(eventName, listeners);
    return () => listeners.delete(callback);
  }

  emit(eventName: string): void {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener();
    }
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0
    );
  }

  destroy(): void {}

  play(): void {}
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

  it('acknowledges Lottie only after its canvas is ready', async () => {
    const animation = new FakeLottieAnimation();
    let canvasReady = false;
    const checkpoint = waitForLottieReady(
      animation,
      () => canvasReady,
      100
    );

    canvasReady = true;
    animation.emit('DOMLoaded');

    await expect(checkpoint).resolves.toBeUndefined();
    expect(animation.listenerCount()).toBe(0);
  });

  it('rejects Lottie renderer errors before showing the popup', async () => {
    const animation = new FakeLottieAnimation();
    const checkpoint = waitForLottieReady(animation, () => false, 100);

    animation.emit('data_failed');

    await expect(checkpoint).rejects.toThrow('could not be rendered');
    expect(animation.listenerCount()).toBe(0);
  });

  it('rejects a Lottie DOMLoaded event without a usable canvas', async () => {
    const animation = new FakeLottieAnimation();
    const checkpoint = waitForLottieReady(animation, () => false, 100);

    animation.emit('DOMLoaded');

    await expect(checkpoint).rejects.toThrow('usable canvas');
  });
});

export interface LottieAnimationHandle {
  addEventListener(
    eventName: string,
    callback: (event?: unknown) => void
  ): (() => void) | void;
  removeEventListener?(
    eventName: string,
    callback: (event?: unknown) => void
  ): void;
  destroy(): void;
  play(): void;
}

export async function waitForLottieReady(
  animation: LottieAnimationHandle,
  canvasIsReady: () => boolean,
  timeoutMilliseconds: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const removers: Array<() => void> = [];
    const timeout = globalThis.setTimeout(() => {
      finish(new Error('The Lottie animation did not load in time'));
    }, timeoutMilliseconds);

    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      for (const remove of removers) {
        remove();
      }
    };
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const onReady = () => {
      if (!canvasIsReady()) {
        finish(new Error('The Lottie animation did not create a usable canvas'));
        return;
      }
      finish();
    };
    const onError = () => {
      finish(new Error('The Lottie animation could not be rendered'));
    };

    for (const eventName of ['DOMLoaded']) {
      const remove = animation.addEventListener(eventName, onReady);
      removers.push(
        typeof remove === 'function'
          ? remove
          : () => animation.removeEventListener?.(eventName, onReady)
      );
    }
    for (const eventName of ['data_failed', 'error']) {
      const remove = animation.addEventListener(eventName, onError);
      removers.push(
        typeof remove === 'function'
          ? remove
          : () => animation.removeEventListener?.(eventName, onError)
      );
    }
  });
}

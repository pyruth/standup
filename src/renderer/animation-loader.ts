export type AnimationImage = Pick<
  HTMLImageElement,
  | 'complete'
  | 'naturalWidth'
  | 'src'
  | 'decode'
  | 'addEventListener'
  | 'removeEventListener'
>;

function waitForImageLoad(
  image: AnimationImage,
  source: string,
  timeoutMilliseconds: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(new Error('The reminder animation did not load in time'));
    }, timeoutMilliseconds);

    const cleanup = () => {
      globalThis.clearTimeout(timeout);
      image.removeEventListener('load', handleLoad);
      image.removeEventListener('error', handleError);
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
    const handleLoad = () => finish();
    const handleError = () =>
      finish(new Error('The reminder animation could not be loaded'));

    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    image.src = source;
    if (image.complete) {
      if (image.naturalWidth > 0) {
        finish();
      } else {
        handleError();
      }
    }
  });
}

export async function loadAndDecodeAnimation(
  image: AnimationImage,
  source: string,
  timeoutMilliseconds: number
): Promise<void> {
  await waitForImageLoad(image, source, timeoutMilliseconds);
  await image.decode();
  if (!image.complete || image.naturalWidth === 0) {
    throw new Error('The reminder animation did not decode correctly');
  }
}

export async function loadAnimationWithFallback(
  image: AnimationImage,
  requestedSource: string,
  fallbackSource: string,
  timeoutMilliseconds: number
): Promise<string> {
  try {
    await loadAndDecodeAnimation(
      image,
      requestedSource,
      timeoutMilliseconds
    );
    return requestedSource;
  } catch (error) {
    if (requestedSource === fallbackSource) {
      throw error;
    }
    await loadAndDecodeAnimation(image, fallbackSource, timeoutMilliseconds);
    return fallbackSource;
  }
}

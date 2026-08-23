import {
  behaviorAt,
  choosePalette,
  conservedScaleY,
  createBehaviorPlan,
  normalizeCursor,
  stepSpring,
  type CursorSample,
  type MelloBehavior,
  type SpringValue
} from './mello-physics.js';

export interface MelloController {
  destroy(): void;
  setCursor(sample: CursorSample): void;
  start(): void;
}

interface Targets {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  eyeOpenLeft: number;
  eyeOpenRight: number;
  mouth: number;
}

const spring = (value: number): SpringValue => ({ value, velocity: 0 });

function roundedCapsule(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  context.beginPath();
  context.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
  context.fill();
}

function createBlobPath(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  elapsed: number,
  wobble: number
): Path2D {
  const path = new Path2D();
  const driftA = Math.sin(elapsed * 2.1) * 2.2 * wobble;
  const driftB = Math.sin(elapsed * 2.8 + 1.7) * 2.6 * wobble;
  const left = centerX - width * 0.49;
  const right = centerX + width * 0.49;
  const top = centerY - height * 0.48;
  const bottom = centerY + height * 0.48;

  path.moveTo(left, centerY + height * 0.15 + driftA);
  path.bezierCurveTo(
    left + width * 0.01,
    top + height * 0.18,
    centerX - width * 0.24,
    top + driftB,
    centerX + width * 0.06,
    top + driftA
  );
  path.bezierCurveTo(
    centerX + width * 0.22,
    top,
    centerX + width * 0.27,
    top + height * 0.13,
    centerX + width * 0.36,
    top + height * 0.17
  );
  path.bezierCurveTo(
    right + driftB,
    top + height * 0.25,
    right,
    centerY + height * 0.22,
    right - width * 0.07,
    bottom - height * 0.05
  );
  path.bezierCurveTo(
    centerX + width * 0.3,
    bottom + driftA,
    centerX - width * 0.28,
    bottom + driftB,
    left + width * 0.08,
    bottom - height * 0.06
  );
  path.bezierCurveTo(
    left - driftA,
    centerY + height * 0.38,
    left - driftB,
    centerY + height * 0.25,
    left,
    centerY + height * 0.15 + driftA
  );
  path.closePath();
  return path;
}

function createBellyPath(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  elapsed: number,
  wobble: number
): Path2D {
  const path = new Path2D();
  const left = centerX - width * 0.45;
  const right = centerX + width * 0.45;
  const seamY = centerY + height * 0.27;
  const bottomY = centerY + height * 0.49;
  const roll = Math.sin(elapsed * 2.35 + 0.8) * height * 0.012 * wobble;

  path.moveTo(left, seamY + roll);
  path.bezierCurveTo(
    centerX - width * 0.24,
    seamY - height * 0.055,
    centerX + width * 0.18,
    seamY + height * 0.055,
    right,
    seamY - roll
  );
  path.lineTo(centerX + width * 0.43, bottomY);
  path.bezierCurveTo(
    centerX + width * 0.2,
    bottomY + height * 0.04,
    centerX - width * 0.25,
    bottomY + height * 0.035,
    centerX - width * 0.43,
    bottomY - height * 0.01
  );
  path.closePath();
  return path;
}

function drawContactShadow(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  blobWidth: number,
  blobHeight: number,
  scaleX: number,
  scaleY: number,
  lift: number
): void {
  const compression = Math.max(0, Math.min(1, 1 - lift / 32));
  context.save();
  context.globalAlpha = 0.1 + compression * 0.1;
  context.filter = 'blur(7px)';
  context.fillStyle = '#17181c';
  context.beginPath();
  context.ellipse(
    centerX,
    centerY + blobHeight * scaleY * 0.49 + 7,
    blobWidth * scaleX * (0.31 + compression * 0.08),
    5 + compression * 3,
    0,
    0,
    Math.PI * 2
  );
  context.fill();
  context.restore();
}

function behaviorTargets(
  behavior: MelloBehavior,
  elapsed: number,
  cuePhase: number
): Partial<Targets> {
  switch (behavior) {
    case 'blink':
      return { eyeOpenLeft: Math.abs(Math.cos(cuePhase * Math.PI)), eyeOpenRight: 0.12 };
    case 'double-blink': {
      const blink = Math.abs(Math.cos(cuePhase * Math.PI * 2));
      return { eyeOpenLeft: blink, eyeOpenRight: blink };
    }
    case 'curious':
      return { rotation: Math.sin(cuePhase * Math.PI) * 0.1, scaleX: 0.96, scaleY: 1.05 };
    case 'nod':
      return { y: Math.sin(cuePhase * Math.PI * 2) * 5, rotation: Math.sin(cuePhase * Math.PI) * 0.045 };
    case 'puddle':
      return { scaleX: 1.17, scaleY: 0.78, y: 12, eyeOpenLeft: 0.45, eyeOpenRight: 0.3 };
    case 'smirk':
      return { mouth: 1, eyeOpenRight: 0.2, rotation: -0.035 };
    case 'stretch':
      return { scaleX: 0.78, scaleY: 1.28, y: -12, eyeOpenLeft: 1, eyeOpenRight: 0.8 };
    case 'wobble':
      return { rotation: Math.sin(elapsed * 14) * 0.11, scaleX: 1 + Math.sin(elapsed * 12) * 0.035 };
    case 'bounce':
      return { y: -Math.sin(cuePhase * Math.PI) * 24, scaleX: 0.92, scaleY: 1.1 };
    case 'breathe':
      return { scaleX: 1 + Math.sin(elapsed * 2.2) * 0.018 };
  }
}

export function createMelloRenderer(
  canvas: HTMLCanvasElement,
  seed: number,
  reducedMotion: boolean
): MelloController {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Mello could not create a canvas context');
  }

  const palette = choosePalette(seed);
  canvas.parentElement?.style.setProperty(
    '--mello-message-background',
    palette.message
  );
  const plan = createBehaviorPlan(seed);
  const state = {
    x: spring(0),
    y: spring(0),
    scaleX: spring(0.74),
    scaleY: spring(1.2),
    rotation: spring(0.08),
    eyeOpenLeft: spring(0.15),
    eyeOpenRight: spring(0.15),
    mouth: spring(0),
    cursor: { x: 0.5, y: 0.55, inside: false } as CursorSample,
    priorCursor: { x: 0.5, y: 0.55, inside: false } as CursorSample,
    pointerImpulse: 0,
    startedAt: 0,
    previousAt: 0,
    frame: 0,
    destroyed: false
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const render = (timestamp: number) => {
    if (state.destroyed) {
      return;
    }
    if (state.startedAt === 0) {
      state.startedAt = timestamp;
      state.previousAt = timestamp;
    }
    const elapsed = (timestamp - state.startedAt) / 1_000;
    const delta = Math.min((timestamp - state.previousAt) / 1_000, 1 / 30);
    state.previousAt = timestamp;
    const cue = plan.find(({ startsAt, endsAt }) => elapsed >= startsAt && elapsed < endsAt);
    const behavior = behaviorAt(plan, elapsed);
    const cuePhase = cue
      ? (elapsed - cue.startsAt) / (cue.endsAt - cue.startsAt)
      : 0;

    const cursor = normalizeCursor(state.cursor);
    const cursorX = cursor.x - 0.5;
    const cursorY = cursor.y - 0.58;
    const distance = Math.hypot(cursorX, cursorY);
    const nearby = cursor.inside || distance < 0.72;
    const attraction = nearby ? Math.max(0, 1 - distance / 0.8) : 0;
    const behaviorTarget = behaviorTargets(behavior, elapsed, cuePhase);
    const requestedScaleX = behaviorTarget.scaleX ?? 1;
    const entrance = Math.min(1, elapsed / 0.55);
    const targets: Targets = {
      x: (behaviorTarget.x ?? 0) + cursorX * 17 * attraction,
      y: (behaviorTarget.y ?? 0) + cursorY * 9 * attraction,
      scaleX: entrance * requestedScaleX,
      scaleY:
        entrance *
        (behaviorTarget.scaleY ?? conservedScaleY(requestedScaleX)),
      rotation:
        (behaviorTarget.rotation ?? 0) + cursorX * 0.1 * attraction + state.pointerImpulse,
      eyeOpenLeft: behaviorTarget.eyeOpenLeft ?? 1,
      eyeOpenRight: behaviorTarget.eyeOpenRight ?? 0.38,
      mouth: behaviorTarget.mouth ?? 0
    };
    if (reducedMotion) {
      targets.x *= 0.2;
      targets.y *= 0.2;
      targets.rotation *= 0.15;
      targets.scaleX = 1;
      targets.scaleY = 1;
    }

    state.x = stepSpring(state.x, targets.x, delta);
    state.y = stepSpring(state.y, targets.y, delta);
    state.scaleX = stepSpring(state.scaleX, targets.scaleX, delta, 145, 20);
    state.scaleY = stepSpring(state.scaleY, targets.scaleY, delta, 145, 20);
    state.rotation = stepSpring(state.rotation, targets.rotation, delta, 105, 16);
    state.eyeOpenLeft = stepSpring(state.eyeOpenLeft, targets.eyeOpenLeft, delta, 220, 24);
    state.eyeOpenRight = stepSpring(state.eyeOpenRight, targets.eyeOpenRight, delta, 220, 24);
    state.mouth = stepSpring(state.mouth, targets.mouth, delta, 150, 20);
    state.pointerImpulse *= Math.pow(0.001, delta);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.clearRect(0, 0, width, height);
    context.save();
    const centerX = width / 2 + state.x.value;
    const centerY = height * 0.62 + state.y.value;
    const blobWidth = Math.min(width * 0.84, 230);
    const blobHeight = Math.min(height * 0.37, 146);
    drawContactShadow(
      context,
      centerX,
      centerY,
      blobWidth,
      blobHeight,
      state.scaleX.value,
      state.scaleY.value,
      Math.max(0, -state.y.value)
    );
    context.translate(centerX, centerY);
    context.rotate(state.rotation.value);
    context.scale(state.scaleX.value, state.scaleY.value);
    context.translate(-centerX, -centerY);

    const path = createBlobPath(
      context,
      centerX,
      centerY,
      blobWidth,
      blobHeight,
      elapsed,
      reducedMotion ? 0 : 1
    );
    context.fillStyle = palette.body;
    context.fill(path);
    context.save();
    context.clip(path);

    const bodyDepth = context.createLinearGradient(
      centerX,
      centerY - blobHeight * 0.32,
      centerX,
      centerY + blobHeight * 0.5
    );
    bodyDepth.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    bodyDepth.addColorStop(0.58, 'rgba(255, 255, 255, 0)');
    bodyDepth.addColorStop(1, 'rgba(30, 31, 36, 0.16)');
    context.fillStyle = bodyDepth;
    context.fillRect(
      centerX - blobWidth / 2,
      centerY - blobHeight / 2,
      blobWidth,
      blobHeight
    );

    const belly = createBellyPath(
      centerX,
      centerY,
      blobWidth,
      blobHeight,
      elapsed,
      reducedMotion ? 0 : 1
    );
    const bellyDepth = context.createLinearGradient(
      centerX,
      centerY + blobHeight * 0.24,
      centerX,
      centerY + blobHeight * 0.53
    );
    bellyDepth.addColorStop(0, palette.underside);
    bellyDepth.addColorStop(0.68, palette.underside);
    bellyDepth.addColorStop(1, 'rgba(28, 29, 33, 0.46)');
    context.fillStyle = bellyDepth;
    context.fill(belly);

    context.strokeStyle = 'rgba(30, 31, 36, 0.12)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(centerX - blobWidth * 0.39, centerY + blobHeight * 0.28);
    context.bezierCurveTo(
      centerX - blobWidth * 0.19,
      centerY + blobHeight * 0.22,
      centerX + blobWidth * 0.19,
      centerY + blobHeight * 0.34,
      centerX + blobWidth * 0.39,
      centerY + blobHeight * 0.27
    );
    context.stroke();

    context.strokeStyle = 'rgba(255, 255, 255, 0.11)';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(
      centerX,
      centerY + blobHeight * 0.42,
      blobWidth * 0.31,
      0.2,
      Math.PI - 0.2
    );
    context.stroke();
    context.restore();

    const faceX = centerX - blobWidth * 0.02;
    const faceY = centerY + blobHeight * 0.05;
    const eyeTrackX = Math.max(-4, Math.min(4, cursorX * 8));
    const eyeTrackY = Math.max(-3, Math.min(3, cursorY * 6));
    context.fillStyle = palette.face;
    const leftEyeHeight = Math.max(2.2, 19 * state.eyeOpenLeft.value);
    const rightEyeHeight = Math.max(2.2, 19 * state.eyeOpenRight.value);
    roundedCapsule(context, faceX - 29 + eyeTrackX, faceY - 7 + eyeTrackY, 9, leftEyeHeight);
    roundedCapsule(context, faceX + 27 + eyeTrackX, faceY - 8 + eyeTrackY, 9, rightEyeHeight);

    context.strokeStyle = palette.face;
    context.lineWidth = 5;
    context.lineCap = 'round';
    context.beginPath();
    const smirk = state.mouth.value * 5;
    context.moveTo(faceX - 7, faceY + 24);
    context.quadraticCurveTo(faceX + 2, faceY + 27 + smirk, faceX + 13, faceY + 21 - smirk * 0.25);
    context.stroke();
    context.globalAlpha = 0.25;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(faceX + 43, faceY + 21, 8, 0.2, 1.15);
    context.stroke();
    context.restore();

    state.frame = window.requestAnimationFrame(render);
  };

  resize();
  window.addEventListener('resize', resize);
  render(performance.now());

  return {
    destroy() {
      state.destroyed = true;
      window.cancelAnimationFrame(state.frame);
      window.removeEventListener('resize', resize);
    },
    setCursor(sample) {
      const normalized = normalizeCursor(sample);
      const speed = Math.hypot(
        normalized.x - state.priorCursor.x,
        normalized.y - state.priorCursor.y
      );
      if ((normalized.inside || speed < 0.9) && speed > 0.08) {
        state.pointerImpulse +=
          Math.sign(normalized.x - state.priorCursor.x || 1) *
          Math.min(0.09, speed * 0.08);
      }
      state.priorCursor = normalized;
      state.cursor = normalized;
    },
    start() {
      if (!state.frame && !state.destroyed) {
        state.frame = window.requestAnimationFrame(render);
      }
    }
  };
}

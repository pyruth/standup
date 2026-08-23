import {
  behaviorAt,
  choosePalette,
  classifyMelloGesture,
  conservedScaleY,
  createBehaviorPlan,
  elasticScale,
  isPointInsideRotatedEllipse,
  normalizeCursor,
  reactionForClick,
  stepSpring,
  type CursorSample,
  type MelloBehavior,
  type MelloGesture,
  type MelloReaction,
  type SpringValue
} from './mello-physics.js';

export interface MelloPose {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotation: number;
}

export interface MelloController {
  destroy(): void;
  hitTest(x: number, y: number): boolean;
  isDragging(): boolean;
  pointerDown(x: number, y: number, timestamp?: number): boolean;
  pointerMove(x: number, y: number, timestamp?: number): void;
  pointerUp(x: number, y: number, timestamp?: number): MelloGesture | undefined;
  setCursor(sample: CursorSample): void;
  start(): void;
  triggerReaction(reaction?: MelloReaction): void;
}

export interface MelloRenderOptions {
  reducedMotion: boolean;
  motionStyle: 'calm' | 'playful';
  color: string;
  keepSameColor: boolean;
  messageColor?: string;
  animateEntrance?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  position?: string;
  mood?: 'neutral' | 'energetic' | 'sleepy';
  onPose?: (pose: MelloPose) => void;
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

interface ReactionState {
  kind: MelloReaction;
  startedAt: number;
}

const spring = (value: number): SpringValue => ({ value, velocity: 0 });
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

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
  path.bezierCurveTo(left + width * 0.01, top + height * 0.18, centerX - width * 0.24, top + driftB, centerX + width * 0.06, top + driftA);
  path.bezierCurveTo(centerX + width * 0.22, top, centerX + width * 0.27, top + height * 0.13, centerX + width * 0.36, top + height * 0.17);
  path.bezierCurveTo(right + driftB, top + height * 0.25, right, centerY + height * 0.22, right - width * 0.07, bottom - height * 0.05);
  path.bezierCurveTo(right - width * 0.09, bottom + height * 0.015, centerX + width * 0.22, bottom + height * 0.035 + driftA, centerX, bottom + height * 0.018);
  path.bezierCurveTo(centerX - width * 0.22, bottom + height * 0.035 + driftB, left + width * 0.09, bottom + height * 0.01, left + width * 0.08, bottom - height * 0.06);
  path.bezierCurveTo(left - driftA, centerY + height * 0.38, left - driftB, centerY + height * 0.25, left, centerY + height * 0.15 + driftA);
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
  const compression = clamp(1 - lift / 32, 0, 1);
  context.save();
  context.globalAlpha = 0.1 + compression * 0.1;
  context.filter = 'blur(7px)';
  context.fillStyle = '#17181c';
  context.beginPath();
  context.ellipse(centerX, centerY + blobHeight * scaleY * 0.49 + 7, blobWidth * scaleX * (0.31 + compression * 0.08), 5 + compression * 3, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function behaviorTargets(
  behavior: MelloBehavior,
  elapsed: number,
  cuePhase: number
): Partial<Targets> {
  switch (behavior) {
    case 'angry':
      return { scaleX: 1.05, scaleY: 0.94, eyeOpenLeft: 0.58, eyeOpenRight: 0.58, mouth: -1, rotation: Math.sin(elapsed * 24) * 0.018 };
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

function anchorForPosition(width: number, height: number, position?: string): { x: number; y: number } {
  const x = position?.endsWith('-left') ? 0.32 : position?.endsWith('-right') ? 0.68 : 0.5;
  const y = position?.startsWith('top-') ? 0.38 : position?.startsWith('bottom-') ? 0.68 : 0.58;
  return { x: width * x, y: height * y };
}

export function createMelloRenderer(
  canvas: HTMLCanvasElement,
  seed: number,
  options: MelloRenderOptions
): MelloController {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Mello could not create a canvas context');

  const palette = choosePalette(seed, options.keepSameColor ? options.color : undefined);
  canvas.parentElement?.style.setProperty('--mello-message-background', options.messageColor ?? palette.message);
  const plan = createBehaviorPlan(seed);
  const state = {
    x: spring(0), y: spring(0), scaleX: spring(0.74), scaleY: spring(1.2),
    rotation: spring(0.08), eyeOpenLeft: spring(0.15), eyeOpenRight: spring(0.15), mouth: spring(0),
    cursor: { x: 0.5, y: 0.55, inside: false } as CursorSample,
    priorCursor: { x: 0.5, y: 0.55, inside: false } as CursorSample,
    pointerImpulse: 0, startedAt: 0, previousAt: 0, frame: 0, destroyed: false,
    pose: { centerX: 0, centerY: 0, width: 1, height: 1, rotation: 0 } as MelloPose,
    dragging: false, dragStartX: 0, dragStartY: 0, dragStartAt: 0,
    grabOffsetX: 0, grabOffsetY: 0, dragTargetX: 0, dragTargetY: 0,
    lastPointerX: 0, lastPointerY: 0, lastPointerAt: 0,
    pointerVelocityX: 0, pointerVelocityY: 0,
    reaction: undefined as ReactionState | undefined, reactionCount: 0
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const triggerReaction = (reaction?: MelloReaction): void => {
    const kind = reaction ?? reactionForClick(state.reactionCount, seed);
    state.reactionCount += 1;
    state.reaction = { kind, startedAt: performance.now() };
    if (kind === 'punch') {
      state.x.velocity += state.reactionCount % 2 === 0 ? -210 : 210;
      state.rotation.velocity += state.reactionCount % 2 === 0 ? -2.8 : 2.8;
    }
  };

  const hitTest = (x: number, y: number): boolean => isPointInsideRotatedEllipse(
    x, y, state.pose.centerX, state.pose.centerY,
    state.pose.width * 0.52, state.pose.height * 0.55, state.pose.rotation
  );

  const pointerDown = (x: number, y: number, timestamp = performance.now()): boolean => {
    if (!hitTest(x, y)) return false;
    state.dragging = true;
    state.dragStartX = x; state.dragStartY = y; state.dragStartAt = timestamp;
    state.grabOffsetX = x - state.pose.centerX; state.grabOffsetY = y - state.pose.centerY;
    state.dragTargetX = state.x.value; state.dragTargetY = state.y.value;
    state.lastPointerX = x; state.lastPointerY = y; state.lastPointerAt = timestamp;
    state.pointerVelocityX = 0; state.pointerVelocityY = 0; state.reaction = undefined;
    return true;
  };

  const pointerMove = (x: number, y: number, timestamp = performance.now()): void => {
    if (!state.dragging) return;
    const elapsedMs = Math.max(8, timestamp - state.lastPointerAt);
    const instantX = ((x - state.lastPointerX) / elapsedMs) * 1_000;
    const instantY = ((y - state.lastPointerY) / elapsedMs) * 1_000;
    state.pointerVelocityX = state.pointerVelocityX * 0.58 + instantX * 0.42;
    state.pointerVelocityY = state.pointerVelocityY * 0.58 + instantY * 0.42;
    const anchor = anchorForPosition(canvas.clientWidth, canvas.clientHeight, options.position);
    state.dragTargetX = x - state.grabOffsetX - anchor.x;
    state.dragTargetY = y - state.grabOffsetY - anchor.y;
    state.lastPointerX = x; state.lastPointerY = y; state.lastPointerAt = timestamp;
  };

  const pointerUp = (x: number, y: number, timestamp = performance.now()): MelloGesture | undefined => {
    if (!state.dragging) return undefined;
    pointerMove(x, y, timestamp);
    state.dragging = false;
    const travel = Math.hypot(x - state.dragStartX, y - state.dragStartY) / Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight));
    const verticalVelocity = state.pointerVelocityY / Math.max(1, canvas.clientHeight * 2.2);
    const gesture = classifyMelloGesture(travel, verticalVelocity);
    if (gesture === 'click') {
      triggerReaction();
    } else {
      const velocityScale = options.reducedMotion ? 0.16 : 0.48;
      state.x.velocity += state.pointerVelocityX * velocityScale;
      state.y.velocity += state.pointerVelocityY * velocityScale;
      if (gesture === 'bounce-up') state.y.velocity -= options.reducedMotion ? 40 : 220;
      if (gesture === 'bounce-down') state.y.velocity += options.reducedMotion ? 30 : 160;
      state.rotation.velocity += clamp(state.pointerVelocityX / 360, -4.5, 4.5);
    }
    return gesture;
  };

  const drawMascot = (
    centerX: number, centerY: number, blobWidth: number, blobHeight: number,
    scaleX: number, scaleY: number, rotation: number, elapsed: number,
    angry: boolean, opacity = 1, faceScale = 1
  ): void => {
    context.save();
    context.globalAlpha = opacity;
    context.translate(centerX, centerY);
    context.rotate(rotation);
    context.scale(scaleX, scaleY);
    context.translate(-centerX, -centerY);
    const path = createBlobPath(centerX, centerY, blobWidth, blobHeight, elapsed, options.reducedMotion ? 0 : 1);
    context.fillStyle = palette.body;
    context.fill(path);
    context.save();
    context.clip(path);
    const bodyDepth = context.createLinearGradient(centerX, centerY - blobHeight * 0.32, centerX, centerY + blobHeight * 0.5);
    bodyDepth.addColorStop(0, 'rgba(255,255,255,.12)');
    bodyDepth.addColorStop(0.58, 'rgba(255,255,255,0)');
    bodyDepth.addColorStop(1, 'rgba(30,31,36,.18)');
    context.fillStyle = bodyDepth;
    context.fillRect(centerX - blobWidth / 2, centerY - blobHeight / 2, blobWidth, blobHeight);
    const lowerVolume = context.createRadialGradient(centerX, centerY + blobHeight * 0.08, blobWidth * 0.05, centerX, centerY + blobHeight * 0.54, blobWidth * 0.58);
    lowerVolume.addColorStop(0, 'rgba(255,255,255,0)');
    lowerVolume.addColorStop(0.72, 'rgba(255,255,255,0)');
    lowerVolume.addColorStop(1, palette.underside);
    context.globalAlpha *= 0.46;
    context.fillStyle = lowerVolume;
    context.fillRect(centerX - blobWidth / 2, centerY - blobHeight / 2, blobWidth, blobHeight);
    context.restore();

    const faceX = centerX - blobWidth * 0.02;
    const faceY = centerY + blobHeight * 0.05;
    const cursorX = state.cursor.x - 0.5;
    const cursorY = state.cursor.y - 0.58;
    const eyeTrackX = clamp(cursorX * 8, -4, 4) * faceScale;
    const eyeTrackY = clamp(cursorY * 6, -3, 3) * faceScale;
    context.fillStyle = palette.face;
    const leftEyeHeight = Math.max(2.8, 24 * state.eyeOpenLeft.value * faceScale);
    const rightEyeHeight = Math.max(2.8, 24 * state.eyeOpenRight.value * faceScale);
    roundedCapsule(context, faceX - 30 * faceScale + eyeTrackX, faceY - 8 * faceScale + eyeTrackY, 12 * faceScale, leftEyeHeight);
    roundedCapsule(context, faceX + 29 * faceScale + eyeTrackX, faceY - 9 * faceScale + eyeTrackY, 12 * faceScale, rightEyeHeight);
    if (angry) {
      context.strokeStyle = palette.face;
      context.lineWidth = 4 * faceScale;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(faceX - 40 * faceScale, faceY - 28 * faceScale);
      context.lineTo(faceX - 22 * faceScale, faceY - 22 * faceScale);
      context.moveTo(faceX + 20 * faceScale, faceY - 22 * faceScale);
      context.lineTo(faceX + 40 * faceScale, faceY - 28 * faceScale);
      context.stroke();
    }
    context.strokeStyle = palette.face;
    context.lineWidth = 5 * faceScale;
    context.lineCap = 'round';
    context.beginPath();
    const mouth = state.mouth.value;
    context.moveTo(faceX - 12 * faceScale, faceY + 22 * faceScale);
    context.quadraticCurveTo(faceX + 2 * faceScale, faceY + (angry || mouth < -0.3 ? 13 : 32 + mouth * 5) * faceScale, faceX + 17 * faceScale, faceY + 21 * faceScale);
    context.stroke();
    context.restore();
  };

  const render = (timestamp: number) => {
    if (state.destroyed) return;
    if (state.startedAt === 0) { state.startedAt = timestamp; state.previousAt = timestamp; }
    const elapsed = (timestamp - state.startedAt) / 1_000;
    const delta = Math.min((timestamp - state.previousAt) / 1_000, 1 / 30);
    state.previousAt = timestamp;
    const cue = plan.find(({ startsAt, endsAt }) => elapsed >= startsAt && elapsed < endsAt);
    const behavior = behaviorAt(plan, elapsed);
    const cuePhase = cue ? (elapsed - cue.startsAt) / (cue.endsAt - cue.startsAt) : 0;
    const cursor = normalizeCursor(state.cursor);
    const cursorX = cursor.x - 0.5;
    const cursorY = cursor.y - 0.58;
    const distance = Math.hypot(cursorX, cursorY);
    const attraction = cursor.inside || distance < 0.72 ? Math.max(0, 1 - distance / 0.8) : 0;
    const behaviorTarget = behaviorTargets(behavior, elapsed, cuePhase);
    const motionAmount = options.motionStyle === 'calm' ? 0.42 : 1;
    const entrance = options.animateEntrance === false ? 1 : Math.min(1, elapsed / 0.55);
    const reactionAge = state.reaction ? (timestamp - state.reaction.startedAt) / 1_000 : Number.POSITIVE_INFINITY;
    if (reactionAge > (state.reaction?.kind === 'celebrate' ? 2.4 : 1.45)) state.reaction = undefined;
    const reaction = state.reaction?.kind;
    const punchWave = reaction === 'punch' ? Math.sin(clamp(reactionAge / 0.72, 0, 1) * Math.PI) : 0;
    const celebrateWave = reaction === 'celebrate' ? Math.abs(Math.sin(reactionAge * Math.PI * 2.4)) * Math.max(0, 1 - reactionAge / 2.4) : 0;
    const angry = reaction === 'angry' || behavior === 'angry';
    const requestedScaleX = behaviorTarget.scaleX ?? 1;
    let targetX = (behaviorTarget.x ?? 0) * motionAmount + cursorX * 17 * attraction;
    let targetY = (behaviorTarget.y ?? 0) * motionAmount + cursorY * 9 * attraction - celebrateWave * 23;
    if (state.dragging) { targetX = state.dragTargetX; targetY = state.dragTargetY; }
    const lagX = targetX - state.x.value;
    const lagY = targetY - state.y.value;
    const lag = Math.hypot(lagX, lagY);
    const speed = Math.hypot(state.pointerVelocityX, state.pointerVelocityY);
    const elastic = state.dragging ? elasticScale(lag, speed, options.reducedMotion) : { along: 1, across: 1 };
    const dragAngle = state.dragging && lag > 2 ? Math.atan2(lagY, lagX) + Math.PI / 2 : 0;
    const targets: Targets = {
      x: targetX,
      y: targetY,
      scaleX: entrance * (1 + (requestedScaleX - 1) * motionAmount) * (state.dragging ? elastic.across : 1) * (1 + punchWave * 0.34 + celebrateWave * 0.07),
      scaleY: entrance * (1 + ((behaviorTarget.scaleY ?? conservedScaleY(requestedScaleX)) - 1) * motionAmount) * (state.dragging ? elastic.along : 1) * (1 - punchWave * 0.23 + celebrateWave * 0.12),
      rotation: (behaviorTarget.rotation ?? 0) * motionAmount + cursorX * 0.1 * attraction + state.pointerImpulse + dragAngle + punchWave * (state.reactionCount % 2 ? 0.12 : -0.12),
      eyeOpenLeft: angry ? 0.58 : options.mood === 'sleepy' ? 0.48 : behaviorTarget.eyeOpenLeft ?? 1,
      eyeOpenRight: angry ? 0.58 : options.mood === 'sleepy' ? 0.42 : behaviorTarget.eyeOpenRight ?? 0.88,
      mouth: angry ? -1 : reaction === 'celebrate' || options.mood === 'energetic' ? 1 : behaviorTarget.mouth ?? 0
    };
    if (options.reducedMotion) { targets.rotation = 0; targets.scaleX = 1; targets.scaleY = 1; }
    state.x = stepSpring(state.x, targets.x, delta, state.dragging ? 190 : 82, state.dragging ? 20 : 12);
    state.y = stepSpring(state.y, targets.y, delta, state.dragging ? 190 : 82, state.dragging ? 20 : 12);
    state.scaleX = stepSpring(state.scaleX, targets.scaleX, delta, 155, 19);
    state.scaleY = stepSpring(state.scaleY, targets.scaleY, delta, 155, 19);
    state.rotation = stepSpring(state.rotation, targets.rotation, delta, 115, 15);
    state.eyeOpenLeft = stepSpring(state.eyeOpenLeft, targets.eyeOpenLeft, delta, 220, 24);
    state.eyeOpenRight = stepSpring(state.eyeOpenRight, targets.eyeOpenRight, delta, 220, 24);
    state.mouth = stepSpring(state.mouth, targets.mouth, delta, 150, 20);
    state.pointerImpulse *= Math.pow(0.001, delta);

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const anchor = anchorForPosition(width, height, options.position);
    const blobWidth = Math.min(width * 0.54, options.maxWidth ?? 230);
    const blobHeight = Math.min(height * 0.58, options.maxHeight ?? 146);
    const centerX = clamp(anchor.x + state.x.value, blobWidth * 0.22, width - blobWidth * 0.22);
    const centerY = clamp(anchor.y + state.y.value, blobHeight * 0.25, height - blobHeight * 0.25);
    state.pose = { centerX, centerY, width: blobWidth * Math.abs(state.scaleX.value), height: blobHeight * Math.abs(state.scaleY.value), rotation: state.rotation.value };
    options.onPose?.(state.pose);
    context.clearRect(0, 0, width, height);
    drawContactShadow(context, centerX, centerY, blobWidth, blobHeight, state.scaleX.value, state.scaleY.value, Math.max(0, anchor.y - centerY));
    if (reaction === 'split' && reactionAge < 1.15 && !options.reducedMotion) {
      const splitPhase = Math.sin(clamp(reactionAge / 1.15, 0, 1) * Math.PI);
      const fragments = [[-0.72, -0.52], [-0.34, 0.52], [0, -0.72], [0.38, 0.48], [0.72, -0.38]] as const;
      for (const [fragmentX, fragmentY] of fragments) {
        drawMascot(centerX + fragmentX * 92 * splitPhase, centerY + fragmentY * 72 * splitPhase, blobWidth * 0.38, blobHeight * 0.44, 1, 1, state.rotation.value + fragmentX * splitPhase, elapsed, false, 1, 0.5);
      }
    } else {
      drawMascot(centerX, centerY, blobWidth, blobHeight, state.scaleX.value, state.scaleY.value, state.rotation.value, elapsed, angry);
    }
    state.frame = window.requestAnimationFrame(render);
  };

  resize();
  window.addEventListener('resize', resize);
  render(performance.now());

  return {
    destroy() { state.destroyed = true; window.cancelAnimationFrame(state.frame); window.removeEventListener('resize', resize); },
    hitTest,
    isDragging: () => state.dragging,
    pointerDown,
    pointerMove,
    pointerUp,
    setCursor(sample) {
      const normalized = normalizeCursor(sample);
      const speed = Math.hypot(normalized.x - state.priorCursor.x, normalized.y - state.priorCursor.y);
      if ((normalized.inside || speed < 0.9) && speed > 0.08) {
        state.pointerImpulse += Math.sign(normalized.x - state.priorCursor.x || 1) * Math.min(0.09, speed * 0.08);
      }
      state.priorCursor = normalized;
      state.cursor = normalized;
    },
    start() { if (!state.frame && !state.destroyed) state.frame = window.requestAnimationFrame(render); },
    triggerReaction
  };
}

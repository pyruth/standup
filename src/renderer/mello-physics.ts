export interface SpringValue {
  value: number;
  velocity: number;
}

export interface CursorSample {
  x: number;
  y: number;
  inside: boolean;
}

export type MelloBehavior =
  | 'angry'
  | 'breathe'
  | 'blink'
  | 'double-blink'
  | 'curious'
  | 'nod'
  | 'puddle'
  | 'smirk'
  | 'stretch'
  | 'wobble'
  | 'bounce';

export const MELLO_BEHAVIORS: readonly MelloBehavior[] = [
  'angry',
  'breathe',
  'blink',
  'double-blink',
  'curious',
  'nod',
  'puddle',
  'smirk',
  'stretch',
  'wobble',
  'bounce'
] as const;

export interface BehaviorCue {
  behavior: MelloBehavior;
  startsAt: number;
  endsAt: number;
}

export interface MelloPalette {
  name: string;
  body: string;
  underside: string;
  face: string;
  message: string;
}

export type MelloGesture =
  | 'click'
  | 'drag'
  | 'bounce-up'
  | 'bounce-down';

export type MelloReaction = 'punch' | 'split' | 'angry' | 'celebrate';

export interface ElasticScale {
  along: number;
  across: number;
}

export const MELLO_PALETTES: readonly MelloPalette[] = [
  {
    name: 'apricot',
    body: '#FFB27D',
    underside: '#E98A60',
    face: '#303237',
    message: '#FFF3E9'
  },
  {
    name: 'mint',
    body: '#A8E2D9',
    underside: '#78BEB4',
    face: '#27312C',
    message: '#F1F6EE'
  },
  {
    name: 'periwinkle',
    body: '#B7C1FF',
    underside: '#8796E5',
    face: '#2D3040',
    message: '#F2F1FC'
  },
  {
    name: 'grape',
    body: '#BE91EA',
    underside: '#9165BE',
    face: '#353128',
    message: '#FFF8E8'
  },
  {
    name: 'coral',
    body: '#FF9885',
    underside: '#D96E63',
    face: '#342B2B',
    message: '#FFF0EC'
  },
  {
    name: 'blueberry',
    body: '#9CB3E8',
    underside: '#6F88C5',
    face: '#252A43',
    message: '#EEF0FF'
  }
] as const;

export function stepSpring(
  spring: SpringValue,
  target: number,
  deltaSeconds: number,
  stiffness = 125,
  damping = 18
): SpringValue {
  const delta = Math.min(Math.max(deltaSeconds, 0), 1 / 30);
  const acceleration =
    (target - spring.value) * stiffness - spring.velocity * damping;
  const velocity = spring.velocity + acceleration * delta;
  return {
    value: spring.value + velocity * delta,
    velocity
  };
}

export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function choosePalette(seed: number, preferred?: string): MelloPalette {
  const selected = MELLO_PALETTES.find(({ name }) => name === preferred);
  if (selected) {
    return selected;
  }
  const random = createSeededRandom(seed ^ 0xa17c9e31);
  return MELLO_PALETTES[
    Math.floor(random() * MELLO_PALETTES.length)
  ]!;
}

export function createBehaviorPlan(seed: number): BehaviorCue[] {
  const random = createSeededRandom(seed ^ 0x7f4a7c15);
  const behaviors = [...MELLO_BEHAVIORS];
  for (let index = behaviors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [behaviors[index], behaviors[swapIndex]] = [
      behaviors[swapIndex]!,
      behaviors[index]!
    ];
  }

  const cues: BehaviorCue[] = [];
  let startsAt = 0.65;
  for (const behavior of behaviors.slice(0, 5)) {
    const duration = 0.9 + random() * 0.32;
    cues.push({ behavior, startsAt, endsAt: startsAt + duration });
    startsAt += duration;
  }
  return cues;
}

export function behaviorAt(
  plan: readonly BehaviorCue[],
  elapsedSeconds: number
): MelloBehavior {
  return (
    plan.find(
      ({ startsAt, endsAt }) =>
        elapsedSeconds >= startsAt && elapsedSeconds < endsAt
    )?.behavior ?? 'breathe'
  );
}

export function normalizeCursor(sample: CursorSample): CursorSample {
  return {
    x: Math.min(2, Math.max(-1, sample.x)),
    y: Math.min(2, Math.max(-1, sample.y)),
    inside: sample.inside
  };
}

export function conservedScaleY(scaleX: number): number {
  return Math.min(1.35, Math.max(0.72, 1 / scaleX));
}

export function elasticScale(
  lagPixels: number,
  speedPixelsPerSecond: number,
  reducedMotion = false
): ElasticScale {
  if (reducedMotion) {
    return { along: 1, across: 1 };
  }
  const pull = Math.min(1, Math.max(0, lagPixels) / 105);
  const kinetic = Math.min(1, Math.max(0, speedPixelsPerSecond) / 1_300);
  const along = Math.min(1.98, 1 + pull * 0.68 + kinetic * 0.24);
  return {
    along,
    across: Math.max(0.55, 1 / along ** 0.88)
  };
}

export function classifyMelloGesture(
  travelNormalized: number,
  verticalVelocityNormalized: number
): MelloGesture {
  if (travelNormalized < 0.035) {
    return 'click';
  }
  if (verticalVelocityNormalized < -0.34) {
    return 'bounce-up';
  }
  if (verticalVelocityNormalized > 0.34) {
    return 'bounce-down';
  }
  return 'drag';
}

export function reactionForClick(index: number, seed = 0): MelloReaction {
  const reactions: readonly MelloReaction[] = ['punch', 'split', 'angry'];
  const offset = Math.abs(seed) % reactions.length;
  return reactions[(Math.max(0, index) + offset) % reactions.length]!;
}

export function isPointInsideRotatedEllipse(
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  rotationRadians = 0
): boolean {
  if (radiusX <= 0 || radiusY <= 0) {
    return false;
  }
  const cosine = Math.cos(-rotationRadians);
  const sine = Math.sin(-rotationRadians);
  const deltaX = pointX - centerX;
  const deltaY = pointY - centerY;
  const localX = deltaX * cosine - deltaY * sine;
  const localY = deltaX * sine + deltaY * cosine;
  return (localX / radiusX) ** 2 + (localY / radiusY) ** 2 <= 1;
}

export function isPointInsideMello(
  pointX: number,
  pointY: number,
  width: number,
  height: number
): boolean {
  const centerX = width / 2;
  const centerY = height * 0.62;
  const radiusX = Math.min(width * 0.84, 430) * 0.54;
  const radiusY = Math.min(height * 0.52, 230) * 0.57;
  return isPointInsideRotatedEllipse(
    pointX,
    pointY,
    centerX,
    centerY,
    radiusX,
    radiusY
  );
}

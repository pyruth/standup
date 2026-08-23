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

export const MELLO_PALETTES: readonly MelloPalette[] = [
  {
    name: 'apricot',
    body: '#FFB27D',
    underside: '#E98A60',
    face: '#303237',
    message: '#FFF3E9'
  },
  {
    name: 'sage',
    body: '#B8D2B4',
    underside: '#82A78A',
    face: '#27312C',
    message: '#F1F6EE'
  },
  {
    name: 'periwinkle',
    body: '#C0C9F4',
    underside: '#909DD5',
    face: '#2D3040',
    message: '#F2F1FC'
  },
  {
    name: 'cream',
    body: '#FFE2A8',
    underside: '#DDB871',
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
    body: '#8494D8',
    underside: '#596BB4',
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

export function choosePalette(seed: number): MelloPalette {
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

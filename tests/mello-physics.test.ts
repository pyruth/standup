import { describe, expect, it } from 'vitest';
import {
  MELLO_BEHAVIORS,
  MELLO_PALETTES,
  behaviorAt,
  choosePalette,
  conservedScaleY,
  createBehaviorPlan,
  normalizeCursor,
  stepSpring
} from '../src/renderer/mello-physics.js';

describe('Mello mascot physics', () => {
  it('settles a damped spring on its target without diverging', () => {
    let spring = { value: 0, velocity: 0 };
    for (let frame = 0; frame < 240; frame += 1) {
      spring = stepSpring(spring, 1, 1 / 60);
    }
    expect(spring.value).toBeCloseTo(1, 4);
    expect(Math.abs(spring.velocity)).toBeLessThan(0.001);
  });

  it('preserves approximate blob area during automatic squash and stretch', () => {
    for (const scaleX of [0.8, 0.92, 1, 1.08, 1.2]) {
      expect(scaleX * conservedScaleY(scaleX)).toBeCloseTo(1, 5);
    }
  });

  it('creates a deterministic varied behavior sequence for each seed', () => {
    const first = createBehaviorPlan(42);
    const repeated = createBehaviorPlan(42);
    const different = createBehaviorPlan(43);

    expect(first).toEqual(repeated);
    expect(first).not.toEqual(different);
    expect(first).toHaveLength(5);
    expect(new Set(first.map(({ behavior }) => behavior)).size).toBe(5);
    expect(first.at(-1)!.endsAt).toBeLessThan(7);
    expect(behaviorAt(first, first[0]!.startsAt)).toBe(first[0]!.behavior);
  });

  it('uses every designed behavior across varied appearances', () => {
    const observed = new Set(
      Array.from({ length: 50 }, (_, seed) => createBehaviorPlan(seed))
        .flat()
        .map(({ behavior }) => behavior)
    );
    expect(observed).toEqual(new Set(MELLO_BEHAVIORS));
  });

  it('chooses stable palettes while varying them across appearances', () => {
    expect(choosePalette(99)).toEqual(choosePalette(99));
    const names = new Set(
      Array.from({ length: 100 }, (_, seed) => choosePalette(seed).name)
    );
    expect(names.size).toBe(MELLO_PALETTES.length);
  });

  it('bounds global cursor samples before applying interaction physics', () => {
    expect(normalizeCursor({ x: -50, y: 20, inside: false })).toEqual({
      x: -1,
      y: 2,
      inside: false
    });
  });
});

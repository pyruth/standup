import { describe, expect, it } from 'vitest';
import {
  MELLO_BEHAVIORS,
  MELLO_PALETTES,
  behaviorAt,
  choosePalette,
  classifyMelloGesture,
  conservedScaleY,
  createBehaviorPlan,
  elasticScale,
  isPointInsideMello,
  isPointInsideRotatedEllipse,
  normalizeCursor,
  reactionForClick,
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

  it('keeps the selected Mello color when color consistency is enabled', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      expect(choosePalette(seed, 'periwinkle').name).toBe('periwinkle');
      expect(choosePalette(seed, 'mint').name).toBe('mint');
    }
  });

  it('bounds global cursor samples before applying interaction physics', () => {
    expect(normalizeCursor({ x: -50, y: 20, inside: false })).toEqual({
      x: -1,
      y: 2,
      inside: false
    });
  });

  it('starts click motion only when the pointer lands on Mello', () => {
    expect(isPointInsideMello(400, 310, 800, 500)).toBe(true);
    expect(isPointInsideMello(40, 40, 800, 500)).toBe(false);
    expect(isPointInsideMello(760, 460, 800, 500)).toBe(false);
  });

  it('stretches farther with pull and speed while conserving soft volume', () => {
    expect(elasticScale(0, 0)).toEqual({ along: 1, across: 1 });
    const slow = elasticScale(55, 120);
    const fast = elasticScale(140, 1_900);
    expect(slow.along).toBeGreaterThan(1);
    expect(fast.along).toBeGreaterThan(slow.along);
    expect(fast.along).toBeLessThanOrEqual(1.98);
    expect(fast.across).toBeGreaterThanOrEqual(0.55);
    expect(elasticScale(500, 5_000, true)).toEqual({ along: 1, across: 1 });
  });

  it('classifies clicks and vertical drag releases', () => {
    expect(classifyMelloGesture(0.01, 2)).toBe('click');
    expect(classifyMelloGesture(0.2, -0.6)).toBe('bounce-up');
    expect(classifyMelloGesture(0.2, 0.6)).toBe('bounce-down');
    expect(classifyMelloGesture(0.2, 0.1)).toBe('drag');
  });

  it('cycles through every approved click reaction', () => {
    expect(
      new Set(Array.from({ length: 3 }, (_, index) => reactionForClick(index, 7)))
    ).toEqual(new Set(['punch', 'split', 'angry']));
  });

  it('hit-tests rotated, stretched Mello geometry', () => {
    expect(
      isPointInsideRotatedEllipse(50, 30, 50, 50, 48, 16, Math.PI / 4)
    ).toBe(true);
    expect(
      isPointInsideRotatedEllipse(5, 5, 50, 50, 30, 12, Math.PI / 3)
    ).toBe(false);
  });
});

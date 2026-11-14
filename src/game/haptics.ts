import { SeasonCode } from './types';

export const HIGH_OVR_VIBRATION_THRESHOLD = 123;
export const ELITE_OVR_VIBRATION_THRESHOLD = 132;

export const HAPTIC_PATTERNS = {
  tap: 10,
  light: 12,
  suspense: [15, 60, 20, 60, 25] as number[],
  packTear: [28, 25, 55] as number[],
  success: [35, 40, 80] as number[],
  failure: [55, 35, 95] as number[],
  walkout: [35, 30, 60, 30, 125] as number[],
  eliteWalkout: [45, 35, 65, 35, 110, 45, 190] as number[],
};

export function isHighOvrCard(ovr: number): boolean {
  return Number.isFinite(ovr) && ovr >= HIGH_OVR_VIBRATION_THRESHOLD;
}

export function isEliteOvrCard(ovr: number, season?: SeasonCode): boolean {
  if (!Number.isFinite(ovr)) return false;
  if (ovr >= ELITE_OVR_VIBRATION_THRESHOLD) return true;
  if (
    (season === 'LE' || season === 'INFINITY_PRIME' || season === 'ICON_TM') &&
    ovr >= 128
  ) {
    return true;
  }
  return false;
}

/**
 * Selects an escalating vibration pattern for pack openings and high-OVR card reveals
 * using window.navigator.vibrate(pattern).
 */
export function resolvePackRevealVibrationPattern(params: {
  ovr: number;
  season?: SeasonCode;
  isBatch?: boolean;
}): number[] {
  const { ovr, season } = params;
  if (isEliteOvrCard(ovr, season)) {
    return [...HAPTIC_PATTERNS.eliteWalkout];
  }
  if (isHighOvrCard(ovr)) {
    return [...HAPTIC_PATTERNS.walkout];
  }
  return [...HAPTIC_PATTERNS.success];
}

/**
 * Selects a vibration pattern for card enhancement outcomes, boosting intensity
 * for high-grade (+8+) or high-OVR results.
 */
export function resolveUpgradeVibrationPattern(params: {
  succeeded: boolean;
  newGrade: number;
  newOvr?: number;
}): number[] {
  const { succeeded, newGrade, newOvr = 0 } = params;
  if (!succeeded) {
    return [...HAPTIC_PATTERNS.failure];
  }
  if (newGrade >= 8 || newOvr >= ELITE_OVR_VIBRATION_THRESHOLD) {
    return [...HAPTIC_PATTERNS.eliteWalkout];
  }
  if (newOvr >= HIGH_OVR_VIBRATION_THRESHOLD) {
    return [...HAPTIC_PATTERNS.walkout];
  }
  return [...HAPTIC_PATTERNS.success];
}

/**
 * Safely invokes window.navigator.vibrate on supported browsers/mobile devices.
 * Returns true if window.navigator.vibrate was called without error.
 */
export function vibrateDevice(pattern: number | number[]): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator;
  if (!nav || typeof nav.vibrate !== 'function') return false;
  try {
    nav.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}

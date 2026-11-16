import { useEffect, useRef, useState } from 'react';

interface WebKitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
}

interface DeviceOrientationConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export function normalizeHeadingDegrees(raw: number | null | undefined): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return ((raw % 360) + 360) % 360;
}

export function extractCompassHeading(event: DeviceOrientationEvent): number | null {
  const wk = (event as WebKitDeviceOrientationEvent).webkitCompassHeading;
  if (typeof wk === 'number' && Number.isFinite(wk) && wk >= 0) {
    return normalizeHeadingDegrees(wk);
  }
  if (event.absolute === true && typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
    const screenAngle =
      typeof window !== 'undefined' && typeof window.screen?.orientation?.angle === 'number'
        ? window.screen.orientation.angle
        : 0;
    return normalizeHeadingDegrees(360 - event.alpha + screenAngle);
  }
  return null;
}

export async function requestCompassPermissionIfNeeded(): Promise<void> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;
  const ctor = DeviceOrientationEvent as unknown as DeviceOrientationConstructorWithPermission;
  if (typeof ctor.requestPermission === 'function') {
    try {
      await ctor.requestPermission();
    } catch {
      // User declined or browser blocked; GPS course fallback stays active.
    }
  }
}

export function useCompassHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const hasAbsoluteEventRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOrientation = (event: Event, isAbsoluteSource: boolean) => {
      if (isAbsoluteSource) {
        hasAbsoluteEventRef.current = true;
      } else if (hasAbsoluteEventRef.current) {
        return;
      }

      const next = extractCompassHeading(event as DeviceOrientationEvent);
      if (next === null) return;

      const prev = lastRef.current;
      if (prev !== null) {
        const diff = Math.abs(((next - prev + 540) % 360) - 180);
        if (diff < 2) return;
      }

      lastRef.current = next;
      setHeading(next);
    };

    const onAbsolute = (e: Event) => handleOrientation(e, true);
    const onRelative = (e: Event) => handleOrientation(e, false);

    window.addEventListener('deviceorientationabsolute', onAbsolute, true);
    window.addEventListener('deviceorientation', onRelative, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
      window.removeEventListener('deviceorientation', onRelative, true);
    };
  }, []);

  return heading;
}

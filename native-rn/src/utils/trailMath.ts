import { TrackPoint } from '../types/domain';

export const EARTH_RADIUS_M = 6_371_000;
export const ASCENT_DEADBAND_M = 3.0;
export const MAX_ACCEPTABLE_ACCURACY_M = 35;
export const MAX_HIKING_SPEED_MPS = 12.0; // >43 km/h considered GPS spike
export const MIN_STATIONARY_MOVE_M = 1.8;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldAcceptGpsDelta(params: {
  accuracyMeters: number;
  prevLat: number | null;
  prevLng: number | null;
  prevTimestamp: number | null;
  lat: number;
  lng: number;
  timestamp: number;
  speedMps: number;
}): { accept: boolean; addedDistanceMeters: number } {
  if (params.accuracyMeters > MAX_ACCEPTABLE_ACCURACY_M) {
    return { accept: false, addedDistanceMeters: 0 };
  }
  if (params.prevTimestamp !== null && params.timestamp <= params.prevTimestamp) {
    return { accept: false, addedDistanceMeters: 0 };
  }
  if (params.prevLat === null || params.prevLng === null || params.prevTimestamp === null) {
    return { accept: true, addedDistanceMeters: 0 };
  }

  const dtSec = Math.max(0.5, (params.timestamp - params.prevTimestamp) / 1000);
  const distM = haversineMeters(params.prevLat, params.prevLng, params.lat, params.lng);
  if (distM / dtSec > MAX_HIKING_SPEED_MPS) {
    return { accept: false, addedDistanceMeters: 0 };
  }
  if (distM < MIN_STATIONARY_MOVE_M && params.speedMps < 0.45) {
    return { accept: false, addedDistanceMeters: 0 };
  }
  return { accept: true, addedDistanceMeters: distM };
}

export function computeElevationSummary(
  points: ReadonlyArray<{ altitudeMeters: number; speedMps?: number }>
) {
  if (points.length === 0) {
    return { ascent: 0, descent: 0, maxAlt: 0, minAlt: 0, maxSpeedMps: 0 };
  }
  let ascent = 0;
  let descent = 0;
  let maxAlt = points[0].altitudeMeters;
  let minAlt = points[0].altitudeMeters;
  let anchor = points[0].altitudeMeters;
  let maxSpeedMps = points[0].speedMps ?? 0;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.altitudeMeters > maxAlt) maxAlt = p.altitudeMeters;
    if (p.altitudeMeters < minAlt) minAlt = p.altitudeMeters;
    if ((p.speedMps ?? 0) > maxSpeedMps) maxSpeedMps = p.speedMps ?? 0;

    const delta = p.altitudeMeters - anchor;
    if (delta >= ASCENT_DEADBAND_M) {
      ascent += delta;
      anchor = p.altitudeMeters;
    } else if (delta <= -ASCENT_DEADBAND_M) {
      descent += -delta;
      anchor = p.altitudeMeters;
    }
  }
  return { ascent, descent, maxAlt, minAlt, maxSpeedMps };
}

export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildGpxXmlDocument(params: {
  name: string;
  description: string;
  startedAt: number;
  points: ReadonlyArray<{
    latitude: number;
    longitude: number;
    altitudeMeters: number;
    timestamp: number;
  }>;
  waypoints: ReadonlyArray<{
    name: string;
    description: string;
    type: string;
    latitude: number;
    longitude: number;
    altitudeMeters: number;
    timestamp: number;
  }>;
}): string {
  const wptsXml = params.waypoints
    .map(
      (w) => `  <wpt lat="${w.latitude.toFixed(6)}" lon="${w.longitude.toFixed(6)}">
    <ele>${w.altitudeMeters.toFixed(1)}</ele>
    <time>${new Date(w.timestamp || params.startedAt).toISOString()}</time>
    <name>${escapeXml(w.name)}</name>
    <desc>${escapeXml(w.description)}</desc>
    <type>${escapeXml(w.type)}</type>
  </wpt>`
    )
    .join('\n');

  const trkptsXml = params.points
    .map(
      (p) => `      <trkpt lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}">
        <ele>${p.altitudeMeters.toFixed(1)}</ele>
        <time>${new Date(p.timestamp || params.startedAt).toISOString()}</time>
      </trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FOLLOW THE TRAIL / 跟夕走" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(params.name)}</name>
    <desc>${escapeXml(params.description)}</desc>
    <time>${new Date(params.startedAt).toISOString()}</time>
  </metadata>
${wptsXml ? `${wptsXml}\n` : ''}  <trk>
    <name>${escapeXml(params.name)}</name>
    <trkseg>
${trkptsXml}
    </trkseg>
  </trk>
</gpx>
`;
}

export interface ParsedGpxTrack {
  name: string;
  points: Array<{ lat: number; lng: number; ele: number; ts: number }>;
  distanceMeters: number;
  ascentMeters: number;
  descentMeters: number;
  maxAlt: number;
  minAlt: number;
}

export function parseGpxXml(fileName: string, xmlText: string): ParsedGpxTrack | null {
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  const latRegex = /\blat=["']([^"']+)["']/i;
  const lonRegex = /\blon=["']([^"']+)["']/i;
  const eleRegex = /<ele>([^<]+)<\/ele>/i;
  const timeRegex = /<time>([^<]+)<\/time>/i;
  const nameMatch =
    xmlText.match(/<trk>[\s\S]*?<name>([^<]+)<\/name>/i) ||
    xmlText.match(/<metadata>[\s\S]*?<name>([^<]+)<\/name>/i);

  const parsedPts: Array<{ lat: number; lng: number; ele: number; ts: number }> = [];
  const fallbackBase = Date.now();
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = trkptRegex.exec(xmlText)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const lat = parseFloat(latRegex.exec(attrs)?.[1] ?? '');
    const lng = parseFloat(lonRegex.exec(attrs)?.[1] ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const ele = parseFloat(eleRegex.exec(body)?.[1] ?? '0');
    const rawTime = timeRegex.exec(body)?.[1];
    const parsedTs = rawTime ? Date.parse(rawTime) : NaN;
    const ts = Number.isFinite(parsedTs) ? parsedTs : fallbackBase + idx * 10_000;
    parsedPts.push({ lat, lng, ele: Number.isFinite(ele) ? ele : 0, ts });
    idx += 1;
  }

  if (parsedPts.length < 2) return null;

  let distanceMeters = 0;
  for (let i = 1; i < parsedPts.length; i++) {
    distanceMeters += haversineMeters(
      parsedPts[i - 1].lat,
      parsedPts[i - 1].lng,
      parsedPts[i].lat,
      parsedPts[i].lng
    );
  }

  const elev = computeElevationSummary(
    parsedPts.map((p) => ({ altitudeMeters: p.ele, speedMps: 0 }))
  );

  return {
    name: (nameMatch?.[1]?.trim() || fileName.replace(/\.gpx$/i, '')).slice(0, 60),
    points: parsedPts,
    distanceMeters,
    ascentMeters: elev.ascent,
    descentMeters: elev.descent,
    maxAlt: elev.maxAlt,
    minAlt: elev.minAlt,
  };
}

export function parseExifTimestamp(exif: Record<string, unknown>): number | null {
  const raw = exif.DateTimeOriginal ?? exif.DateTimeDigitized ?? exif.DateTime;
  if (typeof raw !== 'string') return null;
  const match = raw.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const ms = Date.parse(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
  return Number.isFinite(ms) ? ms : null;
}

export function normalizeExifCoordinate(value: unknown, ref: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;
  return Math.abs(value) * sign;
}

export function findNearestTrackPointByTimestamp<T extends Pick<TrackPoint, 'timestamp'>>(
  points: ReadonlyArray<T>,
  targetTimestamp: number
): T | null {
  if (points.length === 0) return null;
  let nearest = points[0];
  let bestDelta = Math.abs(points[0].timestamp - targetTimestamp);
  for (let i = 1; i < points.length; i++) {
    const delta = Math.abs(points[i].timestamp - targetTimestamp);
    if (delta < bestDelta) {
      bestDelta = delta;
      nearest = points[i];
    }
  }
  return nearest;
}

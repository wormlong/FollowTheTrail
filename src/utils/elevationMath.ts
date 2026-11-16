import { GeoPoint, RecordedTrack, TrailWaypoint } from '../types/hiking';

export const EARTH_RADIUS_M = 6_371_000;
export const ASCENT_DEADBAND_M = 3.0;
export const MOVING_SPEED_THRESHOLD_MPS = 0.45;
export const MAX_HIKING_SPEED_MPS = 12.0;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface KilometerSplit {
  kmIndex: number;
  distanceMeters: number;
  durationMs: number;
  ascentMeters: number;
  descentMeters: number;
  avgSpeedKmh: number;
}

export interface RestInterval {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  lat: number;
  lng: number;
}

export interface DetailedTrackStats {
  distanceMeters: number;
  movingTimeMs: number;
  restTimeMs: number;
  totalTimeMs: number;
  ascentMeters: number;
  descentMeters: number;
  maxAltitudeMeters: number;
  minAltitudeMeters: number;
  maxSpeedMps: number;
  avgSpeedMps: number;
  splits: KilometerSplit[];
  restIntervals: RestInterval[];
}

export function computeTrackStats(points: GeoPoint[]): DetailedTrackStats {
  if (points.length === 0) {
    return {
      distanceMeters: 0,
      movingTimeMs: 0,
      restTimeMs: 0,
      totalTimeMs: 0,
      ascentMeters: 0,
      descentMeters: 0,
      maxAltitudeMeters: 0,
      minAltitudeMeters: 0,
      maxSpeedMps: 0,
      avgSpeedMps: 0,
      splits: [],
      restIntervals: [],
    };
  }

  let distance = 0;
  let movingTimeMs = 0;
  let restTimeMs = 0;
  let ascent = 0;
  let descent = 0;
  let maxAlt = points[0].ele;
  let minAlt = points[0].ele;
  let anchorAlt = points[0].ele;
  let maxSpeedMps = 0;

  const splits: KilometerSplit[] = [];
  let splitDist = 0;
  let splitDur = 0;
  let splitAscent = 0;
  let splitDescent = 0;
  let splitAnchorAlt = points[0].ele;
  let kmIndex = 1;

  const restIntervals: RestInterval[] = [];
  let activeRestStart: { ts: number; lat: number; lng: number } | null = null;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dtMs = Math.max(0, curr.timestamp - prev.timestamp);
    const dtSec = dtMs / 1000;
    const rawSeg = haversineMeters(prev.lat, prev.lng, curr.lat, curr.lng);
    const speed = dtSec > 0.2 ? rawSeg / dtSec : (curr.speedMps ?? 0);

    // Filter GPS spike jumps
    const validSeg = speed <= MAX_HIKING_SPEED_MPS && rawSeg <= 200 ? rawSeg : 0;
    distance += validSeg;

    if (curr.ele > maxAlt) maxAlt = curr.ele;
    if (curr.ele < minAlt) minAlt = curr.ele;

    const delta = curr.ele - anchorAlt;
    if (delta >= ASCENT_DEADBAND_M) {
      ascent += delta;
      anchorAlt = curr.ele;
    } else if (delta <= -ASCENT_DEADBAND_M) {
      descent += -delta;
      anchorAlt = curr.ele;
    }

    const isMoving = dtSec > 0 && speed >= MOVING_SPEED_THRESHOLD_MPS && validSeg >= 0.8;
    if (isMoving) {
      movingTimeMs += dtMs;
      if (speed <= MAX_HIKING_SPEED_MPS && speed > maxSpeedMps) {
        maxSpeedMps = speed;
      }
      if (activeRestStart && prev.timestamp - activeRestStart.ts >= 45_000) {
        restIntervals.push({
          startedAt: activeRestStart.ts,
          endedAt: prev.timestamp,
          durationMs: prev.timestamp - activeRestStart.ts,
          lat: activeRestStart.lat,
          lng: activeRestStart.lng,
        });
      }
      activeRestStart = null;
    } else if (dtMs > 0) {
      restTimeMs += dtMs;
      if (!activeRestStart) {
        activeRestStart = { ts: prev.timestamp, lat: prev.lat, lng: prev.lng };
      }
    }

    // Per-km split accumulation
    splitDist += validSeg;
    splitDur += dtMs;
    const sDelta = curr.ele - splitAnchorAlt;
    if (sDelta >= ASCENT_DEADBAND_M) {
      splitAscent += sDelta;
      splitAnchorAlt = curr.ele;
    } else if (sDelta <= -ASCENT_DEADBAND_M) {
      splitDescent += -sDelta;
      splitAnchorAlt = curr.ele;
    }

    if (splitDist >= 1000) {
      const hours = splitDur / 3_600_000;
      splits.push({
        kmIndex,
        distanceMeters: splitDist,
        durationMs: splitDur,
        ascentMeters: splitAscent,
        descentMeters: splitDescent,
        avgSpeedKmh: hours > 0 ? (splitDist / 1000) / hours : 0,
      });
      kmIndex += 1;
      splitDist = 0;
      splitDur = 0;
      splitAscent = 0;
      splitDescent = 0;
    }
  }

  if (splitDist > 50) {
    const hours = splitDur / 3_600_000;
    splits.push({
      kmIndex,
      distanceMeters: splitDist,
      durationMs: splitDur,
      ascentMeters: splitAscent,
      descentMeters: splitDescent,
      avgSpeedKmh: hours > 0 ? (splitDist / 1000) / hours : 0,
    });
  }

  const totalTimeMs = Math.max(0, points[points.length - 1].timestamp - points[0].timestamp);
  const avgSpeedMps = movingTimeMs > 0 ? distance / (movingTimeMs / 1000) : 0;

  return {
    distanceMeters: distance,
    movingTimeMs,
    restTimeMs,
    totalTimeMs,
    ascentMeters: ascent,
    descentMeters: descent,
    maxAltitudeMeters: maxAlt,
    minAltitudeMeters: minAlt,
    maxSpeedMps,
    avgSpeedMps,
    splits,
    restIntervals,
  };
}

/**
 * Computes true along-track cumulative distance from start & to end (Section 6.2)
 * instead of straight-line Euclidean distance.
 */
export function computeWaypointAlongTrack(points: GeoPoint[], lat: number, lng: number) {
  if (points.length === 0) {
    return {
      distanceFromStartMeters: 0,
      distanceToEndMeters: 0,
      cumulativeTrackMeters: 0,
      nearestIndex: 0,
    };
  }

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const d = haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    cumulative.push(cumulative[i - 1] + (d <= 200 ? d : 0));
  }
  const total = cumulative[cumulative.length - 1];

  let nearestIdx = 0;
  let bestDist = Infinity;
  points.forEach((pt, idx) => {
    const d = haversineMeters(pt.lat, pt.lng, lat, lng);
    if (d < bestDist) {
      bestDist = d;
      nearestIdx = idx;
    }
  });

  const fromStart = cumulative[nearestIdx];
  return {
    distanceFromStartMeters: fromStart,
    distanceToEndMeters: Math.max(0, total - fromStart),
    cumulativeTrackMeters: fromStart,
    nearestIndex: nearestIdx,
  };
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatSpeedKmh(mps: number): string {
  if (!Number.isFinite(mps) || mps <= 0) return '0.0';
  return (mps * 3.6).toFixed(1);
}

export function exportTrackToGpx(track: RecordedTrack): string {
  const esc = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const wpts = track.waypoints
    .map(
      (w) => `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lng.toFixed(6)}">
    <ele>${w.ele.toFixed(1)}</ele>
    <time>${new Date(w.timestamp || track.startedAt).toISOString()}</time>
    <name>${esc(w.name)}</name>
    <desc>${esc(w.note)}</desc>
    <type>${esc(w.type)}</type>
  </wpt>`
    )
    .join('\n');

  const trkpts = track.points
    .map((p) => {
      const iso = new Date(p.timestamp || track.startedAt).toISOString();
      return `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">
        <ele>${p.ele.toFixed(1)}</ele>
        <time>${iso}</time>
      </trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="FOLLOW THE TRAIL / 跟夕走" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(track.name)}</name>
    <desc>${esc(track.description || '')}</desc>
    <time>${new Date(track.startedAt).toISOString()}</time>
  </metadata>
${wpts ? `${wpts}\n` : ''}  <trk>
    <name>${esc(track.name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

export function exportTrackToGeoJson(track: RecordedTrack): string {
  const fc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          id: track.id,
          name: track.name,
          distanceMeters: track.distanceMeters,
          ascentMeters: track.ascentMeters,
          color: track.overlayStyle.color,
        },
        geometry: {
          type: 'LineString',
          coordinates: track.points.map((p) => [p.lng, p.lat, p.ele]),
        },
      },
      ...track.waypoints.map((w) => ({
        type: 'Feature',
        properties: {
          id: w.id,
          name: w.name,
          type: w.type,
          note: w.note,
          ele: w.ele,
        },
        geometry: {
          type: 'Point',
          coordinates: [w.lng, w.lat, w.ele],
        },
      })),
    ],
  };
  return JSON.stringify(fc, null, 2);
}

export function parseTrackFile(fileName: string, text: string): RecordedTrack | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    return parseGeoJsonTrack(fileName, text);
  }
  if (lower.endsWith('.kml')) {
    return parseKmlTrack(fileName, text);
  }
  return parseGpxTrack(fileName, text);
}

function buildImportedTrack(name: string, points: GeoPoint[], waypoints: TrailWaypoint[] = []): RecordedTrack {
  const stats = computeTrackStats(points);
  const now = Date.now();
  const id = `imp-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const normalizedWaypoints = waypoints.map((w) => {
    const along = computeWaypointAlongTrack(points, w.lat, w.lng);
    return { ...w, ...along };
  });
  return {
    id,
    name,
    description: '从外部轨迹文件导入',
    region: '导入轨迹',
    isTemporaryImport: true,
    startedAt: points[0]?.timestamp || now,
    endedAt: points[points.length - 1]?.timestamp || now,
    distanceMeters: stats.distanceMeters,
    movingTimeMs: stats.movingTimeMs,
    totalTimeMs: stats.totalTimeMs,
    restTimeMs: stats.restTimeMs,
    ascentMeters: stats.ascentMeters,
    descentMeters: stats.descentMeters,
    maxAltitudeMeters: stats.maxAltitudeMeters,
    minAltitudeMeters: stats.minAltitudeMeters,
    maxSpeedMps: stats.maxSpeedMps,
    avgSpeedMps: stats.avgSpeedMps,
    points,
    rawPoints: [...points],
    versions: [
      {
        id: `ver-${now}`,
        summary: '导入原始轨迹',
        createdAt: now,
        points: [...points],
        isOriginalRaw: true,
      },
    ],
    waypoints: normalizedWaypoints,
    photos: [],
    notes: [],
    overlayStyle: {
      visible: true,
      color: '#2D6A4F',
      width: 3.5,
      opacity: 0.9,
      showArrows: true,
    },
    isOfflineSaved: true,
  };
}

function parseGpxTrack(fileName: string, xmlText: string): RecordedTrack | null {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const trkpts = Array.from(doc.querySelectorAll('trkpt'));
    if (trkpts.length < 2) return null;

    const nameEl = doc.querySelector('trk > name') || doc.querySelector('metadata > name');
    const name = nameEl?.textContent?.trim() || fileName.replace(/\.gpx$/i, '');
    const baseTime = Date.now();

    const points: GeoPoint[] = [];
    trkpts.forEach((node, idx) => {
      const lat = parseFloat(node.getAttribute('lat') || '');
      const lng = parseFloat(node.getAttribute('lon') || '');
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      const ele = parseFloat(node.querySelector('ele')?.textContent || '0') || 0;
      const tsRaw = node.querySelector('time')?.textContent;
      const ts = tsRaw ? Date.parse(tsRaw) : baseTime + idx * 10_000;
      points.push({ lat, lng, ele, timestamp: Number.isNaN(ts) ? baseTime + idx * 10_000 : ts });
    });

    const wptNodes = Array.from(doc.querySelectorAll('wpt'));
    const waypoints: TrailWaypoint[] = wptNodes.map((node, idx) => ({
      id: `wpt-${Date.now()}-${idx}`,
      type: 'custom',
      name: node.querySelector('name')?.textContent?.trim() || `路标 ${idx + 1}`,
      note: node.querySelector('desc')?.textContent?.trim() || '',
      tags: [],
      lat: parseFloat(node.getAttribute('lat') || '0'),
      lng: parseFloat(node.getAttribute('lon') || '0'),
      ele: parseFloat(node.querySelector('ele')?.textContent || '0') || 0,
      timestamp: baseTime,
      distanceFromStartMeters: 0,
      distanceToEndMeters: 0,
      cumulativeTrackMeters: 0,
    }));

    return points.length >= 2 ? buildImportedTrack(name, points, waypoints) : null;
  } catch {
    return null;
  }
}

function parseKmlTrack(fileName: string, kmlText: string): RecordedTrack | null {
  try {
    const doc = new DOMParser().parseFromString(kmlText, 'application/xml');
    const coordEl = doc.querySelector('LineString > coordinates') || doc.querySelector('coordinates');
    const raw = coordEl?.textContent?.trim();
    if (!raw) return null;

    const baseTime = Date.now();
    const points: GeoPoint[] = raw
      .split(/\s+/)
      .map((tuple, idx) => {
        const [lngStr, latStr, eleStr] = tuple.split(',');
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        const ele = parseFloat(eleStr || '0') || 0;
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { lat, lng, ele, timestamp: baseTime + idx * 10_000 };
      })
      .filter((p): p is GeoPoint => p !== null);

    const name = doc.querySelector('Document > name')?.textContent?.trim() || fileName.replace(/\.kml$/i, '');
    return points.length >= 2 ? buildImportedTrack(name, points) : null;
  } catch {
    return null;
  }
}

function parseGeoJsonTrack(fileName: string, jsonText: string): RecordedTrack | null {
  try {
    const parsed = JSON.parse(jsonText);
    const features = parsed.type === 'FeatureCollection' ? parsed.features : [parsed];
    const lineFeature = features.find((f: any) => f?.geometry?.type === 'LineString');
    if (!lineFeature) return null;

    const baseTime = Date.now();
    const points: GeoPoint[] = (lineFeature.geometry.coordinates as number[][]).map((coord, idx) => ({
      lng: coord[0],
      lat: coord[1],
      ele: coord[2] ?? 0,
      timestamp: baseTime + idx * 10_000,
    }));

    const name = lineFeature.properties?.name || fileName.replace(/\.geo?json$/i, '');
    return points.length >= 2 ? buildImportedTrack(name, points) : null;
  } catch {
    return null;
  }
}

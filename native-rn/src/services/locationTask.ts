import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { openTrailDatabase } from '../db/schema';
import { TrackPoint } from '../types/domain';
import { shouldAcceptGpsDelta } from '../utils/trailMath';

export const BACKGROUND_LOCATION_TASK = 'FOLLOW_THE_TRAIL_GPS_TASK';

export interface ActiveRecordingContext {
  trackId: string;
  segmentId: string;
  lastLat: number | null;
  lastLng: number | null;
  lastAlt: number | null;
  lastTimestamp: number | null;
  seq: number;
}

let activeContext: ActiveRecordingContext | null = null;

export function setActiveRecordingContext(ctx: ActiveRecordingContext | null) {
  activeContext = ctx;
}

export function getActiveRecordingContext(): ActiveRecordingContext | null {
  return activeContext;
}

async function restoreContextFromSqlite(): Promise<ActiveRecordingContext | null> {
  const db = await openTrailDatabase();
  const track = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM tracks WHERE status = 'recording' ORDER BY started_at DESC LIMIT 1`
  );
  if (!track) return null;

  const seg = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM track_segments WHERE track_id = ? ORDER BY segment_index DESC LIMIT 1`,
    [track.id]
  );
  if (!seg) return null;

  const lastPt = await db.getFirstAsync<{
    seq: number;
    latitude: number;
    longitude: number;
    altitude_meters: number;
    timestamp: number;
  }>(
    `SELECT seq, latitude, longitude, altitude_meters, timestamp
     FROM track_points WHERE track_id = ? ORDER BY seq DESC LIMIT 1`,
    [track.id]
  );

  const restored: ActiveRecordingContext = {
    trackId: track.id,
    segmentId: seg.id,
    lastLat: lastPt?.latitude ?? null,
    lastLng: lastPt?.longitude ?? null,
    lastAlt: lastPt?.altitude_meters ?? null,
    lastTimestamp: lastPt?.timestamp ?? null,
    seq: lastPt?.seq ?? 0,
  };
  activeContext = restored;
  return restored;
}

/**
 * Single authoritative SQLite insert pipeline used by both foreground watcher
 * and Android/iOS background TaskManager task to prevent duplicate/out-of-order seq rows.
 */
export async function persistGpsSampleToSqlite(
  loc: Location.LocationObject
): Promise<{ point: TrackPoint; addedDistanceMeters: number } | null> {
  const ctx = activeContext ?? (await restoreContextFromSqlite());
  if (!ctx) return null;

  const accuracy = loc.coords.accuracy ?? 999;
  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  const ts = loc.timestamp || Date.now();
  const speed = Math.max(0, loc.coords.speed ?? 0);

  const verdict = shouldAcceptGpsDelta({
    accuracyMeters: accuracy,
    prevLat: ctx.lastLat,
    prevLng: ctx.lastLng,
    prevTimestamp: ctx.lastTimestamp,
    lat,
    lng,
    timestamp: ts,
    speedMps: speed,
  });
  if (!verdict.accept) return null;

  const alt =
    typeof loc.coords.altitude === 'number' && Number.isFinite(loc.coords.altitude)
      ? loc.coords.altitude
      : (ctx.lastAlt ?? 0);

  ctx.seq += 1;
  const point: TrackPoint = {
    id: `${ctx.trackId}-${ctx.seq}-${ts}`,
    trackId: ctx.trackId,
    segmentId: ctx.segmentId,
    seq: ctx.seq,
    latitude: lat,
    longitude: lng,
    altitudeMeters: alt,
    accuracyMeters: accuracy,
    speedMps: speed,
    timestamp: ts,
    isRaw: true,
  };

  const db = await openTrailDatabase();
  await db.runAsync(
    `INSERT INTO track_points (id, track_id, segment_id, seq, latitude, longitude, altitude_meters, accuracy_meters, speed_mps, timestamp, is_raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      point.id,
      point.trackId,
      point.segmentId,
      point.seq,
      point.latitude,
      point.longitude,
      point.altitudeMeters,
      point.accuracyMeters,
      point.speedMps,
      point.timestamp,
    ]
  );

  ctx.lastLat = lat;
  ctx.lastLng = lng;
  ctx.lastAlt = alt;
  ctx.lastTimestamp = ts;

  return { point, addedDistanceMeters: verdict.addedDistanceMeters };
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const locations = payload?.locations;
  if (!locations || locations.length === 0) return;

  for (const loc of locations) {
    await persistGpsSampleToSqlite(loc);
  }
});

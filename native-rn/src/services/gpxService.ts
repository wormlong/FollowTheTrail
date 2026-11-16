import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { openTrailDatabase } from '../db/schema';
import { buildGpxXmlDocument, parseGpxXml } from '../utils/trailMath';

function makeUuid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function buildTrackGpxXml(
  trackId: string
): Promise<{ fileName: string; xml: string } | null> {
  const db = await openTrailDatabase();
  const track = await db.getFirstAsync<{
    id: string;
    name: string;
    description: string;
    started_at: number;
  }>(`SELECT id, name, description, started_at FROM tracks WHERE id = ?`, [trackId]);

  if (!track) return null;

  const points = await db.getAllAsync<{
    latitude: number;
    longitude: number;
    altitude_meters: number;
    timestamp: number;
  }>(
    `SELECT latitude, longitude, altitude_meters, timestamp
     FROM track_points WHERE track_id = ? ORDER BY seq ASC`,
    [trackId]
  );

  const waypoints = await db.getAllAsync<{
    name: string;
    description: string;
    type: string;
    latitude: number;
    longitude: number;
    altitude_meters: number;
    timestamp: number;
  }>(
    `SELECT name, description, type, latitude, longitude, altitude_meters, timestamp
     FROM waypoints WHERE track_id = ? ORDER BY timestamp ASC`,
    [trackId]
  );

  const xml = buildGpxXmlDocument({
    name: track.name,
    description: track.description,
    startedAt: track.started_at,
    points: points.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      altitudeMeters: p.altitude_meters,
      timestamp: p.timestamp,
    })),
    waypoints: waypoints.map((w) => ({
      name: w.name,
      description: w.description,
      type: w.type,
      latitude: w.latitude,
      longitude: w.longitude,
      altitudeMeters: w.altitude_meters,
      timestamp: w.timestamp,
    })),
  });

  const safeSlug = track.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_').slice(0, 40) || 'track';
  return { fileName: `${safeSlug}.gpx`, xml };
}

export async function exportAndShareTrackGpx(
  trackId: string
): Promise<{ ok: boolean; uri?: string; error?: string }> {
  const result = await buildTrackGpxXml(trackId);
  if (!result) return { ok: false, error: '未找到可导出的轨迹数据' };

  const exportDir = `${FileSystem.documentDirectory}exports/`;
  await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
  const fileUri = `${exportDir}${result.fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, result.xml, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/gpx+xml',
      dialogTitle: '导出 GPX 徒步轨迹',
    });
  }
  return { ok: true, uri: fileUri };
}

export async function importGpxXmlToDatabase(
  fileName: string,
  xmlText: string
): Promise<{ ok: boolean; trackId?: string; pointCount?: number; error?: string }> {
  const parsed = parseGpxXml(fileName, xmlText);
  if (!parsed) {
    return { ok: false, error: 'GPX 文件缺少有效轨迹点（至少需要 2 个 trkpt）' };
  }

  const startedAt = parsed.points[0].ts;
  const endedAt = parsed.points[parsed.points.length - 1].ts;
  const totalTimeMs = Math.max(0, endedAt - startedAt);
  const avgSpeedMps = totalTimeMs > 1000 ? parsed.distanceMeters / (totalTimeMs / 1000) : 0;

  const trackId = makeUuid('imp');
  const versionId = makeUuid('ver');
  const segmentId = makeUuid('seg');

  const db = await openTrailDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO tracks (
        id, name, description, color, started_at, ended_at, distance_meters,
        moving_time_ms, total_time_ms, rest_time_ms, ascent_meters, descent_meters,
        max_altitude_meters, min_altitude_meters, max_speed_mps, avg_speed_mps,
        status, active_version_id, source
      ) VALUES (?, ?, '从 GPX 文件导入', '#2D6A4F', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, ?, 'completed', ?, 'imported')`,
      [
        trackId,
        parsed.name,
        startedAt,
        endedAt,
        parsed.distanceMeters,
        totalTimeMs,
        totalTimeMs,
        parsed.ascentMeters,
        parsed.descentMeters,
        parsed.maxAlt,
        parsed.minAlt,
        avgSpeedMps,
        versionId,
      ]
    );
    await db.runAsync(
      `INSERT INTO track_versions (id, track_id, parent_version_id, summary, created_at, is_original_raw)
       VALUES (?, ?, NULL, 'GPX 导入轨迹', ?, 1)`,
      [versionId, trackId, Date.now()]
    );
    await db.runAsync(
      `INSERT INTO track_segments (id, track_id, version_id, segment_index, started_at, ended_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [segmentId, trackId, versionId, startedAt, endedAt]
    );

    for (let i = 0; i < parsed.points.length; i++) {
      const p = parsed.points[i];
      await db.runAsync(
        `INSERT INTO track_points (id, track_id, segment_id, seq, latitude, longitude, altitude_meters, accuracy_meters, speed_mps, timestamp, is_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 1)`,
        [`${trackId}-pt-${i + 1}`, trackId, segmentId, i + 1, p.lat, p.lng, p.ele, p.ts]
      );
    }
  });

  return { ok: true, trackId, pointCount: parsed.points.length };
}

export interface ImportedTrackGuide {
  id: string;
  title: string;
  startedAt: number;
  distanceKm: number;
  ascentMeters: number;
  pointCount: number;
  coordinates: Array<[number, number]>;
}

export async function listImportedTracks(): Promise<ImportedTrackGuide[]> {
  const db = await openTrailDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    name: string;
    started_at: number;
    distance_meters: number;
    ascent_meters: number;
  }>(
    `SELECT id, name, started_at, distance_meters, ascent_meters
     FROM tracks
     WHERE source = 'imported' OR id LIKE 'imp-%'
     ORDER BY started_at DESC`
  );

  const results: ImportedTrackGuide[] = [];
  for (const row of rows) {
    const pts = await db.getAllAsync<{ longitude: number; latitude: number }>(
      `SELECT longitude, latitude FROM track_points WHERE track_id = ? ORDER BY seq ASC`,
      [row.id]
    );
    results.push({
      id: row.id,
      title: row.name,
      startedAt: row.started_at,
      distanceKm: row.distance_meters / 1000,
      ascentMeters: Math.round(row.ascent_meters),
      pointCount: pts.length,
      coordinates: pts.map((p) => [p.longitude, p.latitude]),
    });
  }
  return results;
}

export async function deleteImportedTrack(trackId: string): Promise<void> {
  const db = await openTrailDatabase();
  await db.runAsync(`DELETE FROM tracks WHERE id = ?`, [trackId]);
}

export async function pickAndImportGpxFile(): Promise<{
  status: 'imported' | 'cancelled' | 'error';
  trackId?: string;
  pointCount?: number;
  message?: string;
}> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) {
      return { status: 'cancelled' };
    }
    const file = res.assets[0];
    const xml = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const imported = await importGpxXmlToDatabase(file.name, xml);
    if (!imported.ok) {
      return { status: 'error', message: imported.error };
    }
    return {
      status: 'imported',
      trackId: imported.trackId,
      pointCount: imported.pointCount,
    };
  } catch (err: unknown) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'GPX 导入失败',
    };
  }
}

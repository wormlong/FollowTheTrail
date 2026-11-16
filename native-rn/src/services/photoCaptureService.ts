import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { openTrailDatabase } from '../db/schema';
import { Photo, TrackPoint } from '../types/domain';
import {
  findNearestTrackPointByTimestamp,
  normalizeExifCoordinate,
  parseExifTimestamp,
} from '../utils/trailMath';

export interface CapturePhotoResult {
  status: 'saved' | 'cancelled' | 'permission_denied' | 'error';
  photo?: Photo;
  message?: string;
}

function makePhotoId(): string {
  return `pho-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Calls system native camera, persists original + thumbnail in documentDirectory,
 * reads real EXIF timestamp/GPS, associates with nearest valid TrackPoint, and writes
 * into SQLite photos table without interrupting the active TrackRecorder.
 */
export async function captureAndAssociatePhoto(trackId: string | null): Promise<CapturePhotoResult> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      return {
        status: 'permission_denied',
        message: '未授予相机权限，请在系统设置中允许拍照。',
      };
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      exif: true,
      quality: 1,
    });

    if (pickerResult.canceled || !pickerResult.assets?.length) {
      return { status: 'cancelled' };
    }

    const asset = pickerResult.assets[0];
    const now = Date.now();
    const photoId = makePhotoId();
    const folderKey = trackId || 'unassigned';

    const photosDir = `${FileSystem.documentDirectory}trail_photos/${folderKey}/`;
    const thumbsDir = `${FileSystem.documentDirectory}trail_thumbs/${folderKey}/`;
    await FileSystem.makeDirectoryAsync(photosDir, { intermediates: true });
    await FileSystem.makeDirectoryAsync(thumbsDir, { intermediates: true });

    const originalUri = `${photosDir}${photoId}.jpg`;
    await FileSystem.copyAsync({ from: asset.uri, to: originalUri });

    const manip = await ImageManipulator.manipulateAsync(
      originalUri,
      [{ resize: { width: 480 } }],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    const thumbnailUri = `${thumbsDir}${photoId}_thumb.jpg`;
    await FileSystem.copyAsync({ from: manip.uri, to: thumbnailUri });

    const exif = (asset.exif ?? {}) as Record<string, unknown>;
    const capturedAt = parseExifTimestamp(exif) ?? now;
    const exifLat = normalizeExifCoordinate(exif.GPSLatitude, exif.GPSLatitudeRef);
    const exifLng = normalizeExifCoordinate(exif.GPSLongitude, exif.GPSLongitudeRef);
    const exifAlt =
      typeof exif.GPSAltitude === 'number' && Number.isFinite(exif.GPSAltitude)
        ? exif.GPSAltitude
        : null;

    const db = await openTrailDatabase();
    let nearestPoint: TrackPoint | null = null;
    if (trackId) {
      const rows = await db.getAllAsync<{
        id: string;
        track_id: string;
        segment_id: string;
        seq: number;
        latitude: number;
        longitude: number;
        altitude_meters: number;
        accuracy_meters: number;
        speed_mps: number;
        timestamp: number;
        is_raw: number;
      }>(`SELECT * FROM track_points WHERE track_id = ? ORDER BY seq ASC`, [trackId]);

      const pts: TrackPoint[] = rows.map((r) => ({
        id: r.id,
        trackId: r.track_id,
        segmentId: r.segment_id,
        seq: r.seq,
        latitude: r.latitude,
        longitude: r.longitude,
        altitudeMeters: r.altitude_meters,
        accuracyMeters: r.accuracy_meters,
        speedMps: r.speed_mps,
        timestamp: r.timestamp,
        isRaw: Boolean(r.is_raw),
      }));
      nearestPoint = findNearestTrackPointByTimestamp(pts, capturedAt);
    }

    const hasExifGps = exifLat !== null && exifLng !== null;
    const resolvedLat = hasExifGps ? exifLat : (nearestPoint?.latitude ?? null);
    const resolvedLng = hasExifGps ? exifLng : (nearestPoint?.longitude ?? null);
    const resolvedAlt = exifAlt ?? (nearestPoint?.altitudeMeters ?? null);

    const matchConfidence: Photo['matchConfidence'] = hasExifGps
      ? 'gps_time'
      : nearestPoint
        ? 'time_only'
        : 'pending';

    const photo: Photo = {
      id: photoId,
      trackId: trackId || '',
      waypointId: null,
      trackPointId: nearestPoint?.id ?? null,
      originalUri,
      thumbnailUri,
      capturedAt,
      latitude: resolvedLat,
      longitude: resolvedLng,
      altitudeMeters: resolvedAlt,
      exifJson: JSON.stringify(exif),
      matchConfidence,
      confirmedByUser: hasExifGps || Boolean(nearestPoint),
      createdAt: now,
    };

    await db.runAsync(
      `INSERT INTO photos (
        id, track_id, waypoint_id, track_point_id, original_uri, thumbnail_uri,
        captured_at, latitude, longitude, altitude_meters, exif_json,
        match_confidence, confirmed_by_user, created_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        photo.id,
        trackId || null,
        photo.trackPointId,
        photo.originalUri,
        photo.thumbnailUri,
        photo.capturedAt,
        photo.latitude,
        photo.longitude,
        photo.altitudeMeters,
        photo.exifJson,
        photo.matchConfidence,
        photo.confirmedByUser ? 1 : 0,
        photo.createdAt,
      ]
    );

    return { status: 'saved', photo };
  } catch (err: unknown) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : '照片保存失败',
    };
  }
}

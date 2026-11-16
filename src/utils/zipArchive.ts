import JSZip from 'jszip';
import { PhotoMemory, RecordedTrack } from '../types/hiking';
import { computeTrackStats, exportTrackToGpx, parseTrackFile } from './elevationMath';

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Lossless FOLLOW_THE_TRAIL.zip packager (Section 9.2)
 * manifest.json, track.gpx, waypoints.json, notes.json, elevation.json, photos/, thumbnails/
 */
export async function exportFollowTheTrailZip(track: RecordedTrack): Promise<Blob> {
  const zip = new JSZip();

  const manifest = {
    format: 'FOLLOW_THE_TRAIL_ARCHIVE',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    track: {
      id: track.id,
      name: track.name,
      description: track.description,
      region: track.region,
      startedAt: track.startedAt,
      endedAt: track.endedAt,
      overlayStyle: track.overlayStyle,
      coverPhotoId: track.coverPhotoId || null,
    },
    photoRecords: track.photos.map((p) => ({
      id: p.id,
      waypointId: p.waypointId,
      fileName: p.fileName,
      capturedAt: p.capturedAt,
      lat: p.lat,
      lng: p.lng,
      ele: p.ele,
      exifSummary: p.exifSummary,
      matchConfidence: p.matchConfidence,
      matchedDistanceMeters: p.matchedDistanceMeters,
      matchedPointIndex: p.matchedPointIndex,
      confirmedByUser: p.confirmedByUser,
      originalPath: `photos/${p.id}_${p.fileName}`,
      thumbnailPath: `thumbnails/${p.id}.jpg`,
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('track.gpx', exportTrackToGpx(track));
  zip.file('waypoints.json', JSON.stringify(track.waypoints, null, 2));
  zip.file('notes.json', JSON.stringify(track.notes, null, 2));
  zip.file(
    'elevation.json',
    JSON.stringify(
      track.points.map((p, idx) => ({
        seq: idx,
        ele: p.ele,
        lat: p.lat,
        lng: p.lng,
        timestamp: p.timestamp,
      })),
      null,
      2
    )
  );

  const photosFolder = zip.folder('photos');
  const thumbsFolder = zip.folder('thumbnails');

  for (const photo of track.photos) {
    if (photo.originalDataUrl && photosFolder) {
      photosFolder.file(`${photo.id}_${photo.fileName}`, dataUrlToUint8Array(photo.originalDataUrl));
    }
    if (photo.thumbnailDataUrl && thumbsFolder) {
      thumbsFolder.file(`${photo.id}.jpg`, dataUrlToUint8Array(photo.thumbnailDataUrl));
    }
  }

  return zip.generateAsync({ type: 'blob' });
}

export async function importFollowTheTrailZip(file: File): Promise<RecordedTrack | null> {
  try {
    const zip = await JSZip.loadAsync(file);
    const manifestText = await zip.file('manifest.json')?.async('string');
    const gpxText = await zip.file('track.gpx')?.async('string');
    if (!gpxText) return null;

    const baseTrack = parseTrackFile('track.gpx', gpxText);
    if (!baseTrack) return null;

    if (!manifestText) {
      return baseTrack;
    }

    const manifest = JSON.parse(manifestText);
    const waypointsText = await zip.file('waypoints.json')?.async('string');
    const notesText = await zip.file('notes.json')?.async('string');
    const elevationText = await zip.file('elevation.json')?.async('string');

    let points = baseTrack.points;
    if (elevationText) {
      const eleRows = JSON.parse(elevationText) as Array<{
        lat: number;
        lng: number;
        ele: number;
        timestamp: number;
      }>;
      if (eleRows.length >= 2) {
        points = eleRows.map((r) => ({
          lat: r.lat,
          lng: r.lng,
          ele: r.ele,
          timestamp: r.timestamp,
        }));
      }
    }

    const photos: PhotoMemory[] = [];
    for (const pMeta of manifest.photoRecords || []) {
      const origFile = zip.file(pMeta.originalPath);
      const thumbFile = zip.file(pMeta.thumbnailPath);
      const origBlob = origFile ? await origFile.async('blob') : null;
      const thumbBlob = thumbFile ? await thumbFile.async('blob') : null;
      const origUrl = origBlob ? await blobToDataUrl(origBlob) : '';
      const thumbUrl = thumbBlob ? await blobToDataUrl(thumbBlob) : origUrl;

      photos.push({
        id: pMeta.id,
        trackId: manifest.track?.id || baseTrack.id,
        waypointId: pMeta.waypointId ?? null,
        fileName: pMeta.fileName,
        originalDataUrl: origUrl,
        thumbnailDataUrl: thumbUrl,
        capturedAt: pMeta.capturedAt ?? null,
        lat: pMeta.lat ?? null,
        lng: pMeta.lng ?? null,
        ele: pMeta.ele ?? null,
        exifSummary: pMeta.exifSummary || {},
        matchConfidence: pMeta.matchConfidence || 'manual',
        matchedDistanceMeters: pMeta.matchedDistanceMeters ?? null,
        matchedPointIndex: pMeta.matchedPointIndex ?? null,
        confirmedByUser: Boolean(pMeta.confirmedByUser),
      });
    }

    const stats = computeTrackStats(points);
    const metaTrack = manifest.track || {};
    return {
      ...baseTrack,
      id: metaTrack.id || baseTrack.id,
      name: metaTrack.name || baseTrack.name,
      description: metaTrack.description || '',
      region: metaTrack.region || '归档导入',
      isTemporaryImport: false,
      startedAt: metaTrack.startedAt || stats.totalTimeMs ? points[0].timestamp : baseTrack.startedAt,
      endedAt: metaTrack.endedAt || points[points.length - 1].timestamp,
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
      waypoints: waypointsText ? JSON.parse(waypointsText) : baseTrack.waypoints,
      notes: notesText ? JSON.parse(notesText) : [],
      photos,
      overlayStyle: metaTrack.overlayStyle || baseTrack.overlayStyle,
      coverPhotoId: metaTrack.coverPhotoId || null,
    };
  } catch {
    return null;
  }
}

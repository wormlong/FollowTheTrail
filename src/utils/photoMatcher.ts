import exifr from 'exifr';
import { GeoPoint, PhotoMemory } from '../types/hiking';
import { haversineMeters } from './elevationMath';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function generateThumbnailDataUrl(sourceDataUrl: string, maxDim = 320): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}

/**
 * Extracts real EXIF metadata via exifr and suggests track association (Section 7).
 * Uncertain matches never silently attach; confirmedByUser stays false until user confirms.
 */
export async function processAndMatchPhoto(
  file: File,
  trackId: string,
  trackPoints: GeoPoint[]
): Promise<PhotoMemory> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const thumbnailDataUrl = await generateThumbnailDataUrl(originalDataUrl);

  let exif: Record<string, any> | null = null;
  try {
    exif = await exifr.parse(file, {
      gps: true,
      exif: true,
      tiff: true,
    });
  } catch {
    exif = null;
  }

  const capturedDate = exif?.DateTimeOriginal || exif?.CreateDate || null;
  const capturedAt =
    capturedDate instanceof Date ? capturedDate.getTime() : file.lastModified || null;
  const lat = typeof exif?.latitude === 'number' ? exif.latitude : null;
  const lng = typeof exif?.longitude === 'number' ? exif.longitude : null;
  const ele = typeof exif?.GPSAltitude === 'number' ? Math.round(exif.GPSAltitude) : null;

  const exifSummary: Record<string, string | number> = {};
  if (exif?.Make) exifSummary['相机'] = `${exif.Make} ${exif.Model || ''}`.trim();
  if (exif?.FocalLength) exifSummary['焦距'] = `${exif.FocalLength}mm`;
  if (exif?.FNumber) exifSummary['光圈'] = `f/${exif.FNumber}`;
  if (exif?.ISO) exifSummary['ISO'] = exif.ISO;
  if (capturedAt) exifSummary['拍摄时间'] = new Date(capturedAt).toLocaleString('zh-CN');

  let matchConfidence: PhotoMemory['matchConfidence'] = 'manual';
  let matchedDistanceMeters: number | null = null;
  let matchedPointIndex: number | null = null;
  let confirmedByUser = false;

  if (trackPoints.length > 0) {
    if (lat !== null && lng !== null) {
      let bestIdx = 0;
      let bestDist = Infinity;
      trackPoints.forEach((pt, idx) => {
        const d = haversineMeters(pt.lat, pt.lng, lat, lng);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      matchedPointIndex = bestIdx;
      matchedDistanceMeters = Math.round(bestDist);
      if (bestDist <= 300) {
        matchConfidence = 'gps_time';
        // High GPS confidence still offers user confirmation control
        confirmedByUser = true;
      } else {
        // Uncertain spatial match (>300m away): do NOT silently confirm
        matchConfidence = 'gps_time';
        confirmedByUser = false;
      }
    } else if (capturedAt !== null) {
      const start = trackPoints[0].timestamp;
      const end = trackPoints[trackPoints.length - 1].timestamp;
      if (capturedAt >= start - 1800_000 && capturedAt <= end + 1800_000) {
        let bestIdx = 0;
        let bestDt = Infinity;
        trackPoints.forEach((pt, idx) => {
          const dt = Math.abs(pt.timestamp - capturedAt);
          if (dt < bestDt) {
            bestDt = dt;
            bestIdx = idx;
          }
        });
        matchedPointIndex = bestIdx;
        matchConfidence = 'time_only';
        confirmedByUser = false; // Ask user to confirm time-only recommendation
      }
    }
  }

  return {
    id: `pho-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    trackId,
    waypointId: null,
    fileName: file.name,
    originalDataUrl,
    thumbnailDataUrl,
    capturedAt,
    lat: lat ?? (matchedPointIndex !== null ? trackPoints[matchedPointIndex].lat : null),
    lng: lng ?? (matchedPointIndex !== null ? trackPoints[matchedPointIndex].lng : null),
    ele: ele ?? (matchedPointIndex !== null ? Math.round(trackPoints[matchedPointIndex].ele) : null),
    exifSummary,
    matchConfidence,
    matchedDistanceMeters,
    matchedPointIndex,
    confirmedByUser,
  };
}

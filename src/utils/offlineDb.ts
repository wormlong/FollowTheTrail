import { CURATED_ROUTES } from '../data/routes';
import {
  OfflineRegionPack,
  RecordedTrack,
  SafetySettings,
  TrailWaypoint,
} from '../types/hiking';
import { computeTrackStats, computeWaypointAlongTrack } from './elevationMath';

const DB_NAME = 'genxizou_offline_db';
const DB_VERSION = 2;
const STORE_TRACKS = 'tracks';
const STORE_CACHED_ROUTES = 'cached_routes';
const STORE_ACTIVE_DRAFT = 'active_draft';
const STORE_OFFLINE_REGIONS = 'offline_regions';
const STORE_SAFETY = 'safety_profile';

export interface ActiveDraft {
  id: 'current';
  name: string;
  routeId?: string;
  startedAt: number;
  elapsedMs: number;
  movingTimeMs: number;
  restTimeMs: number;
  points: RecordedTrack['points'];
  waypoints: TrailWaypoint[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CACHED_ROUTES)) {
        db.createObjectStore(STORE_CACHED_ROUTES, { keyPath: 'routeId' });
      }
      if (!db.objectStoreNames.contains(STORE_ACTIVE_DRAFT)) {
        db.createObjectStore(STORE_ACTIVE_DRAFT, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_OFFLINE_REGIONS)) {
        db.createObjectStore(STORE_OFFLINE_REGIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SAFETY)) {
        db.createObjectStore(STORE_SAFETY, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createExplicitDemoTrack(): RecordedTrack {
  const baseRoute = CURATED_ROUTES[0];
  const baseStart = Date.now() - 1000 * 60 * 60 * 48;
  const pts = baseRoute.path.map((p, idx) => ({
    ...p,
    timestamp: baseStart + idx * 1000 * 60 * 14,
    accuracy: 5,
    speedMps: idx % 5 === 0 ? 0.2 : 1.15,
  }));
  const stats = computeTrackStats(pts);
  const wps: TrailWaypoint[] = baseRoute.waypoints.map((w, idx) => {
    const along = computeWaypointAlongTrack(pts, w.lat, w.lng);
    return {
      id: w.id,
      type: w.type,
      name: w.name,
      note: w.note,
      tags: ['DEMO', '西山脊线'],
      lat: w.lat,
      lng: w.lng,
      ele: w.ele,
      timestamp: pts[Math.min(idx * 3, pts.length - 1)].timestamp,
      ...along,
    };
  });

  return {
    id: 'demo-xiangshan-dusk',
    name: '香山鬼见愁夕照环线（DEMO 示例轨迹）',
    description: '开发阶段用于演示联动海拔曲线、标注距离计算、照片匹配与 ZIP 归档导出的标准示例轨迹。',
    region: baseRoute.region,
    routeId: baseRoute.id,
    coverPhotoId: null,
    isDemoData: true,
    startedAt: pts[0].timestamp,
    endedAt: pts[pts.length - 1].timestamp,
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
    points: pts,
    rawPoints: [...pts],
    versions: [
      {
        id: 'ver-demo-raw',
        summary: '原始采集轨迹',
        createdAt: pts[0].timestamp,
        points: [...pts],
        isOriginalRaw: true,
      },
    ],
    waypoints: wps,
    photos: [],
    notes: [
      {
        id: 'note-demo-1',
        waypointId: wps[2]?.id ?? null,
        body: '17:26 抵达香炉峰观夕台，西北风较强，日落余晖持续约 22 分钟。',
        createdAt: pts[pts.length - 1].timestamp,
      },
    ],
    overlayStyle: {
      visible: true,
      color: '#B84F24',
      width: 3.5,
      opacity: 0.95,
      showArrows: true,
    },
    isOfflineSaved: true,
  };
}

function normalizeLegacyTrack(raw: any): RecordedTrack {
  const points = raw.points || [];
  const stats = computeTrackStats(points);
  return {
    id: raw.id,
    name: raw.name || '未命名轨迹',
    description: raw.description || '',
    region: raw.region || '北京周边',
    routeId: raw.routeId,
    coverPhotoId: raw.coverPhotoId || null,
    isDemoData: Boolean(raw.isDemoData),
    isTemporaryImport: Boolean(raw.isTemporaryImport),
    startedAt: raw.startedAt || Date.now(),
    endedAt: raw.endedAt || Date.now(),
    distanceMeters: raw.distanceMeters ?? stats.distanceMeters,
    movingTimeMs: raw.movingTimeMs ?? stats.movingTimeMs,
    totalTimeMs: raw.totalTimeMs ?? stats.totalTimeMs,
    restTimeMs: raw.restTimeMs ?? stats.restTimeMs,
    ascentMeters: raw.ascentMeters ?? stats.ascentMeters,
    descentMeters: raw.descentMeters ?? stats.descentMeters,
    maxAltitudeMeters: raw.maxAltitudeMeters ?? stats.maxAltitudeMeters,
    minAltitudeMeters: raw.minAltitudeMeters ?? stats.minAltitudeMeters,
    maxSpeedMps: raw.maxSpeedMps ?? stats.maxSpeedMps,
    avgSpeedMps: raw.avgSpeedMps ?? stats.avgSpeedMps,
    points,
    rawPoints: raw.rawPoints || [...points],
    versions: raw.versions || [
      {
        id: `ver-init-${raw.id}`,
        summary: '原始采集轨迹',
        createdAt: raw.startedAt || Date.now(),
        points: [...points],
        isOriginalRaw: true,
      },
    ],
    waypoints: raw.waypoints || raw.customWaypoints || [],
    photos: raw.photos || [],
    notes: raw.notes || [],
    overlayStyle: raw.overlayStyle || {
      visible: true,
      color: '#B84F24',
      width: 3.5,
      opacity: 0.95,
      showArrows: true,
    },
    isOfflineSaved: true,
  };
}

export async function getAllOfflineTracks(): Promise<RecordedTrack[]> {
  try {
    const db = await openDb();
    const list: any[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRACKS, 'readonly');
      const req = tx.objectStore(STORE_TRACKS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (list.length === 0) {
      const demo = createExplicitDemoTrack();
      await saveOfflineTrack(demo);
      return [demo];
    }
    return list.map(normalizeLegacyTrack).sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [createExplicitDemoTrack()];
  }
}

export async function saveOfflineTrack(track: RecordedTrack): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).put(track);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteOfflineTrack(trackId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite');
    tx.objectStore(STORE_TRACKS).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedRouteIds(): Promise<string[]> {
  try {
    const db = await openDb();
    const rows: Array<{ routeId: string }> = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CACHED_ROUTES, 'readonly');
      const req = tx.objectStore(STORE_CACHED_ROUTES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    return rows.map((r) => r.routeId);
  } catch {
    return [];
  }
}

export async function toggleCachedRoute(routeId: string, cache: boolean): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CACHED_ROUTES, 'readwrite');
    const store = tx.objectStore(STORE_CACHED_ROUTES);
    if (cache) store.put({ routeId, cachedAt: Date.now() });
    else store.delete(routeId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveActiveDraft(draft: ActiveDraft | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ACTIVE_DRAFT, 'readwrite');
      const store = tx.objectStore(STORE_ACTIVE_DRAFT);
      if (draft) store.put(draft);
      else store.delete('current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadActiveDraft(): Promise<ActiveDraft | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ACTIVE_DRAFT, 'readonly');
      const req = tx.objectStore(STORE_ACTIVE_DRAFT).get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function getOfflineRegions(): Promise<OfflineRegionPack[]> {
  try {
    const db = await openDb();
    const rows: OfflineRegionPack[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OFFLINE_REGIONS, 'readonly');
      const req = tx.objectStore(STORE_OFFLINE_REGIONS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (rows.length === 0) {
      const defaults: OfflineRegionPack[] = [
        {
          id: 'reg-xishan',
          name: '北京西山 · 香山至阳台山',
          bounds: { south: 39.97, west: 116.14, north: 40.02, east: 116.21 },
          minZoom: 12,
          maxZoom: 14,
          totalTiles: 24,
          downloadedTiles: 0,
          bytesStored: 0,
          status: 'idle',
          updatedAt: Date.now(),
        },
        {
          id: 'reg-donglingshan',
          name: '门头沟 · 东灵山高山草甸',
          bounds: { south: 40.01, west: 115.41, north: 40.06, east: 115.47 },
          minZoom: 12,
          maxZoom: 14,
          totalTiles: 24,
          downloadedTiles: 0,
          bytesStored: 0,
          status: 'idle',
          updatedAt: Date.now(),
        },
      ];
      return defaults;
    }
    return rows;
  } catch {
    return [];
  }
}

export async function saveOfflineRegion(region: OfflineRegionPack): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_REGIONS, 'readwrite');
    tx.objectStore(STORE_OFFLINE_REGIONS).put(region);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteOfflineRegion(regionId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_OFFLINE_REGIONS, 'readwrite');
    tx.objectStore(STORE_OFFLINE_REGIONS).delete(regionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const DEFAULT_SAFETY_SETTINGS: SafetySettings = {
  emergencyContactName: '',
  emergencyContactPhone: '',
  etaText: '18:30',
  stationaryAlertMinutes: 25,
  offRouteAlertMeters: 120,
  lowBatteryThresholdPct: 20,
  gearChecklist: [
    { id: 'g-1', label: '头灯及备用电池（黄昏下撤必备）', checked: true },
    { id: 'g-2', label: '防风硬壳冲锋衣与保暖中层', checked: true },
    { id: 'g-3', label: '离线地图与轨迹包已下载至本地', checked: false },
    { id: 'g-4', label: '饮水（≥1.5L）与高能量路餐', checked: true },
    { id: 'g-5', label: '急救包、保温毯与充电宝', checked: false },
  ],
};

export async function loadSafetySettings(): Promise<SafetySettings> {
  try {
    const db = await openDb();
    const row: any = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SAFETY, 'readonly');
      const req = tx.objectStore(STORE_SAFETY).get('default');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return row ? { ...DEFAULT_SAFETY_SETTINGS, ...row } : DEFAULT_SAFETY_SETTINGS;
  } catch {
    return DEFAULT_SAFETY_SETTINGS;
  }
}

export async function saveSafetySettings(settings: SafetySettings): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SAFETY, 'readwrite');
    tx.objectStore(STORE_SAFETY).put({ id: 'default', ...settings });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

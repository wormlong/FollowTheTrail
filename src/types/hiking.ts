export type TrailDifficulty = 'easy' | 'moderate' | 'hard';

export type MapStyleMode = 'topo' | 'night' | 'osm';

export type AppTab = 'discover' | 'record' | 'me';

export type WaypointType =
  | 'trailhead'
  | 'finish'
  | 'summit'
  | 'pass'
  | 'camp'
  | 'water'
  | 'rest'
  | 'hazard'
  | 'scenic'
  | 'supply'
  | 'custom';

export const WAYPOINT_TYPE_LABELS: Record<WaypointType, string> = {
  trailhead: '起点',
  finish: '终点',
  summit: '山峰',
  pass: '垭口',
  camp: '营地',
  water: '水源',
  rest: '休息点',
  hazard: '危险点',
  scenic: '风景点',
  supply: '补给点',
  custom: '自定义',
};

export interface GeoPoint {
  lat: number;
  lng: number;
  ele: number;
  timestamp: number;
  accuracy?: number;
  speedMps?: number;
  heading?: number | null;
}

export interface TrailWaypoint {
  id: string;
  type: WaypointType;
  name: string;
  note: string;
  tags: string[];
  lat: number;
  lng: number;
  ele: number;
  timestamp: number;
  distanceFromStartMeters: number;
  distanceToEndMeters: number;
  cumulativeTrackMeters: number;
}

export interface PhotoMemory {
  id: string;
  trackId: string;
  waypointId: string | null;
  fileName: string;
  originalDataUrl: string;
  thumbnailDataUrl: string;
  capturedAt: number | null;
  lat: number | null;
  lng: number | null;
  ele: number | null;
  exifSummary: Record<string, string | number>;
  matchConfidence: 'gps_time' | 'time_only' | 'manual';
  matchedDistanceMeters: number | null;
  matchedPointIndex: number | null;
  confirmedByUser: boolean;
}

export interface TrackNote {
  id: string;
  waypointId: string | null;
  body: string;
  createdAt: number;
}

export interface TrackVersion {
  id: string;
  summary: string;
  createdAt: number;
  points: GeoPoint[];
  isOriginalRaw: boolean;
}

export interface TrackOverlayStyle {
  visible: boolean;
  color: string;
  width: number;
  opacity: number;
  showArrows: boolean;
}

export interface RecordedTrack {
  id: string;
  name: string;
  description: string;
  region: string;
  routeId?: string;
  coverPhotoId?: string | null;
  isDemoData?: boolean;
  isTemporaryImport?: boolean;
  startedAt: number;
  endedAt: number;
  distanceMeters: number;
  movingTimeMs: number;
  totalTimeMs: number;
  restTimeMs: number;
  ascentMeters: number;
  descentMeters: number;
  maxAltitudeMeters: number;
  minAltitudeMeters: number;
  maxSpeedMps: number;
  avgSpeedMps: number;
  points: GeoPoint[];
  rawPoints: GeoPoint[];
  versions: TrackVersion[];
  waypoints: TrailWaypoint[];
  photos: PhotoMemory[];
  notes: TrackNote[];
  overlayStyle: TrackOverlayStyle;
  isOfflineSaved: boolean;
}

export interface HikingRoute {
  id: string;
  title: string;
  region: string;
  distanceKm: number;
  ascentMeters: number;
  descentMeters: number;
  maxAltitudeMeters: number;
  minAltitudeMeters: number;
  durationHours: number;
  difficulty: TrailDifficulty;
  sunsetWindow: string;
  summary: string;
  imageUrl: string;
  path: GeoPoint[];
  waypoints: TrailWaypoint[];
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'completed' | 'interrupted';

export interface MapLayersState {
  baseOutdoor: boolean;
  contours: boolean;
  hillshade: boolean;
  satellite: boolean;
  historicalTracks: boolean;
  activeTrack: boolean;
  importedTracks: boolean;
  waypoints: boolean;
}

export interface OfflineRegionPack {
  id: string;
  name: string;
  bounds: { south: number; west: number; north: number; east: number };
  minZoom: number;
  maxZoom: number;
  totalTiles: number;
  downloadedTiles: number;
  bytesStored: number;
  status: 'idle' | 'downloading' | 'paused' | 'completed' | 'error';
  updatedAt: number;
}

export interface GearItem {
  id: string;
  label: string;
  checked: boolean;
}

export interface SafetySettings {
  emergencyContactName: string;
  emergencyContactPhone: string;
  etaText: string;
  stationaryAlertMinutes: number;
  offRouteAlertMeters: number;
  lowBatteryThresholdPct: number;
  gearChecklist: GearItem[];
}

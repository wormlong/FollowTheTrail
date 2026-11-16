export type UUID = string;

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

export interface Track {
  id: UUID;
  name: string;
  description: string;
  coverPhotoId: UUID | null;
  color: string;
  startedAt: number;
  endedAt: number | null;
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
  status: 'idle' | 'recording' | 'paused' | 'completed' | 'interrupted';
  activeVersionId: UUID;
}

export interface TrackSegment {
  id: UUID;
  trackId: UUID;
  versionId: UUID;
  segmentIndex: number;
  startedAt: number;
  endedAt: number | null;
}

export interface TrackPoint {
  id: UUID;
  trackId: UUID;
  segmentId: UUID;
  seq: number;
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  accuracyMeters: number;
  speedMps: number;
  timestamp: number;
  isRaw: boolean;
}

export interface Waypoint {
  id: UUID;
  trackId: UUID;
  type: WaypointType;
  name: string;
  description: string;
  tags: string[];
  latitude: number;
  longitude: number;
  altitudeMeters: number;
  timestamp: number;
  distanceFromStartMeters: number;
  distanceToEndMeters: number;
  cumulativeTrackMeters: number;
}

export interface Photo {
  id: UUID;
  trackId: UUID;
  waypointId: UUID | null;
  trackPointId: UUID | null;
  originalUri: string;
  thumbnailUri: string;
  capturedAt: number | null;
  latitude: number | null;
  longitude: number | null;
  altitudeMeters: number | null;
  exifJson: string;
  matchConfidence: 'gps_time' | 'time_only' | 'manual' | 'pending';
  confirmedByUser: boolean;
  createdAt: number;
}

export interface Note {
  id: UUID;
  trackId: UUID;
  waypointId: UUID | null;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface ElevationSample {
  id: UUID;
  trackId: UUID;
  distanceMeters: number;
  altitudeMeters: number;
  speedMps: number;
  timestamp: number;
}

export interface TrackVersion {
  id: UUID;
  trackId: UUID;
  parentVersionId: UUID | null;
  summary: string;
  createdAt: number;
  isOriginalRaw: boolean;
}

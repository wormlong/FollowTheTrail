import * as Location from 'expo-location';
import { openTrailDatabase } from '../db/schema';
import { TrackPoint } from '../types/domain';
import { computeElevationSummary } from '../utils/trailMath';
import {
  BACKGROUND_LOCATION_TASK,
  persistGpsSampleToSqlite,
  setActiveRecordingContext,
} from './locationTask';

export type RecorderLifecycle = 'idle' | 'recording' | 'paused' | 'completed';

export interface RecorderTelemetry {
  status: RecorderLifecycle;
  starting: boolean;
  trackId: string | null;
  distanceMeters: number;
  movingTimeMs: number;
  avgSpeedKmh: number;
  currentAltitudeMeters: number | null;
  currentLocation: { latitude: number; longitude: number; accuracy: number | null } | null;
  headingDegrees: number | null;
  points: TrackPoint[];
  errorMessage: string | null;
}

type Listener = (snapshot: RecorderTelemetry) => void;

function makeUuid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

class TrackRecorderService {
  private state: RecorderTelemetry = {
    status: 'idle',
    starting: false,
    trackId: null,
    distanceMeters: 0,
    movingTimeMs: 0,
    avgSpeedKmh: 0,
    currentAltitudeMeters: null,
    currentLocation: null,
    headingDegrees: null,
    points: [],
    errorMessage: null,
  };

  private listeners = new Set<Listener>();
  private isStarting = false;
  private foregroundSub: Location.LocationSubscription | null = null;
  private headingSub: Location.LocationSubscription | null = null;
  private lastHeadingEmitAt: number = 0;
  private movingTimer: ReturnType<typeof setInterval> | null = null;
  private segmentId: string | null = null;
  private versionId: string | null = null;
  private startedAtMs: number = 0;
  private lastMovingTickAt: number | null = null;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): RecorderTelemetry {
    return this.state;
  }

  private emit(patch: Partial<RecorderTelemetry>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private computeAvgSpeedKmh(distanceMeters: number, movingTimeMs: number): number {
    if (movingTimeMs < 1000 || distanceMeters <= 0) return 0;
    return (distanceMeters / (movingTimeMs / 1000)) * 3.6;
  }

  private async getCurrentPositionWithTimeout(
    accuracy: Location.Accuracy,
    timeoutMs: number
  ): Promise<Location.LocationObject | null> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      return await Promise.race([
        Location.getCurrentPositionAsync({ accuracy }).catch(() => null),
        timeoutPromise,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async refreshCurrentPosition(): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null> {
    try {
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        fg = await Location.requestForegroundPermissionsAsync();
      }
      if (fg.status !== 'granted') {
        this.emit({ errorMessage: '未授予位置权限，请在系统设置中开启定位权限。' });
        return null;
      }

      let loc = await this.getCurrentPositionWithTimeout(Location.Accuracy.High, 3500);
      if (!loc) {
        try {
          loc = await Location.getLastKnownPositionAsync();
        } catch {
          loc = null;
        }
      }

      if (!loc) {
        this.emit({ errorMessage: '暂未获取到有效 GPS 信号，请移步开阔地带重试。' });
        return null;
      }

      const nextLocation = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
      };
      const rawHeading = loc.coords.heading;
      const gpsCourse =
        typeof rawHeading === 'number' && Number.isFinite(rawHeading) && rawHeading >= 0
          ? ((rawHeading % 360) + 360) % 360
          : null;

      this.emit({
        currentLocation: nextLocation,
        currentAltitudeMeters:
          typeof loc.coords.altitude === 'number' && Number.isFinite(loc.coords.altitude)
            ? loc.coords.altitude
            : null,
        headingDegrees: this.state.headingDegrees ?? gpsCourse,
        errorMessage: null,
      });
      return nextLocation;
    } catch {
      this.emit({ errorMessage: '定位服务暂时不可用，请确认系统定位开关已开启。' });
      return null;
    }
  }

  async startHeadingWatch(): Promise<void> {
    if (this.headingSub) return;
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') return;

      this.headingSub = await Location.watchHeadingAsync((heading) => {
        const raw =
          heading.trueHeading >= 0
            ? heading.trueHeading
            : heading.magHeading >= 0
              ? heading.magHeading
              : null;
        if (raw === null || !Number.isFinite(raw)) return;
        const normalized = ((raw % 360) + 360) % 360;
        const now = Date.now();
        const prev = this.state.headingDegrees;
        if (prev !== null) {
          const angularDiff = Math.abs(((normalized - prev + 540) % 360) - 180);
          if (angularDiff < 3 || now - this.lastHeadingEmitAt < 80) return;
        }
        this.lastHeadingEmitAt = now;
        this.emit({ headingDegrees: normalized });
      });
    } catch {
      // Compass sensor unavailable on device/simulator; GPS course fallback remains active.
    }
  }

  stopHeadingWatch(): void {
    if (this.headingSub) {
      this.headingSub.remove();
      this.headingSub = null;
    }
  }

  async recoverInterruptedTrack(): Promise<void> {
    try {
      const db = await openTrailDatabase();
      const row = await db.getFirstAsync<{
        id: string;
        status: string;
        started_at: number;
        distance_meters: number;
        moving_time_ms: number;
        active_version_id: string;
      }>(
        `SELECT id, status, started_at, distance_meters, moving_time_ms, active_version_id
         FROM tracks
         WHERE status IN ('recording', 'paused')
         ORDER BY started_at DESC LIMIT 1`
      );
      if (!row) return;

      this.versionId = row.active_version_id;
      this.startedAtMs = row.started_at;

      const pts = await db.getAllAsync<{
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
      }>(`SELECT * FROM track_points WHERE track_id = ? ORDER BY seq ASC`, [row.id]);

      const mapped: TrackPoint[] = pts.map((p) => ({
        id: p.id,
        trackId: p.track_id,
        segmentId: p.segment_id,
        seq: p.seq,
        latitude: p.latitude,
        longitude: p.longitude,
        altitudeMeters: p.altitude_meters,
        accuracyMeters: p.accuracy_meters,
        speedMps: p.speed_mps,
        timestamp: p.timestamp,
        isRaw: Boolean(p.is_raw),
      }));

      if (mapped.length > 0) {
        this.segmentId = mapped[mapped.length - 1].segmentId;
      } else {
        const segRow = await db.getFirstAsync<{ id: string }>(
          `SELECT id FROM track_segments WHERE track_id = ? ORDER BY segment_index DESC LIMIT 1`,
          [row.id]
        );
        this.segmentId = segRow?.id ?? null;
      }

      const last = mapped[mapped.length - 1];
      this.emit({
        status: 'paused',
        trackId: row.id,
        distanceMeters: row.distance_meters,
        movingTimeMs: row.moving_time_ms,
        avgSpeedKmh: this.computeAvgSpeedKmh(row.distance_meters, row.moving_time_ms),
        currentAltitudeMeters: last ? last.altitudeMeters : null,
        currentLocation: last
          ? { latitude: last.latitude, longitude: last.longitude, accuracy: last.accuracyMeters }
          : null,
        points: mapped,
      });
    } catch {
      // Non-fatal: do not block app launch if interrupted track recovery encounters a busy DB
    }
  }

  async startRecording(): Promise<boolean> {
    if (
      this.isStarting ||
      this.state.status === 'recording' ||
      this.state.status === 'paused'
    ) {
      return false;
    }

    this.isStarting = true;
    this.emit({ starting: true, errorMessage: null });

    try {
      let fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        fg = await Location.requestForegroundPermissionsAsync();
      }
      if (fg.status !== 'granted') {
        this.emit({
          starting: false,
          errorMessage: '需要开启位置权限才能开始真实 GPS 轨迹记录。',
        });
        return false;
      }

      let bgGranted = false;
      try {
        const currentBg = await Location.getBackgroundPermissionsAsync();
        if (currentBg.status === 'granted') {
          bgGranted = true;
        } else if (currentBg.status === 'undetermined' && currentBg.canAskAgain) {
          const requestedBg = await Location.requestBackgroundPermissionsAsync();
          bgGranted = requestedBg.status === 'granted';
        }
      } catch {
        bgGranted = false;
      }

      const bgWarning = !bgGranted
        ? '未授予「始终允许后台定位」，锁屏或切后台将暂停记录。'
        : null;

      // Fast non-blocking initial GPS resolution (never freeze the Start button waiting for a cold satellite lock)
      let initialCoords: {
        latitude: number;
        longitude: number;
        altitudeMeters: number | null;
        accuracyMeters: number;
        speedMps: number;
        timestamp: number;
      } | null = null;

      if (this.state.currentLocation) {
        initialCoords = {
          latitude: this.state.currentLocation.latitude,
          longitude: this.state.currentLocation.longitude,
          altitudeMeters: this.state.currentAltitudeMeters,
          accuracyMeters: this.state.currentLocation.accuracy ?? 0,
          speedMps: 0,
          timestamp: Date.now(),
        };
      } else {
        let fastLoc: Location.LocationObject | null = null;
        try {
          fastLoc = await Location.getLastKnownPositionAsync();
        } catch {
          fastLoc = null;
        }
        if (!fastLoc) {
          fastLoc = await this.getCurrentPositionWithTimeout(Location.Accuracy.Balanced, 1200);
        }
        if (fastLoc) {
          const alt =
            typeof fastLoc.coords.altitude === 'number' && Number.isFinite(fastLoc.coords.altitude)
              ? fastLoc.coords.altitude
              : null;
          initialCoords = {
            latitude: fastLoc.coords.latitude,
            longitude: fastLoc.coords.longitude,
            altitudeMeters: alt,
            accuracyMeters: fastLoc.coords.accuracy ?? 0,
            speedMps: Math.max(0, fastLoc.coords.speed ?? 0),
            timestamp: fastLoc.timestamp || Date.now(),
          };
        }
      }

      const now = Date.now();
      const trackId = makeUuid('trk');
      const versionId = makeUuid('ver');
      const segmentId = makeUuid('seg');
      this.versionId = versionId;
      this.segmentId = segmentId;
      this.startedAtMs = now;

      const firstPoint: TrackPoint | null = initialCoords
        ? {
            id: makeUuid('pt'),
            trackId,
            segmentId,
            seq: 1,
            latitude: initialCoords.latitude,
            longitude: initialCoords.longitude,
            altitudeMeters: initialCoords.altitudeMeters ?? 0,
            accuracyMeters: initialCoords.accuracyMeters,
            speedMps: initialCoords.speedMps,
            timestamp: initialCoords.timestamp,
            isRaw: true,
          }
        : null;

      const db = await openTrailDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO tracks (id, name, description, color, started_at, status, active_version_id, source)
           VALUES (?, ?, '', '#B84F24', ?, 'recording', ?, 'recorded')`,
          [trackId, `徒步记录 ${new Date(now).toLocaleDateString('zh-CN')}`, now, versionId]
        );
        await db.runAsync(
          `INSERT INTO track_versions (id, track_id, parent_version_id, summary, created_at, is_original_raw)
           VALUES (?, ?, NULL, '原始 GPS 轨迹', ?, 1)`,
          [versionId, trackId, now]
        );
        await db.runAsync(
          `INSERT INTO track_segments (id, track_id, version_id, segment_index, started_at)
           VALUES (?, ?, ?, 0, ?)`,
          [segmentId, trackId, versionId, now]
        );
        if (firstPoint) {
          await db.runAsync(
            `INSERT INTO track_points (id, track_id, segment_id, seq, latitude, longitude, altitude_meters, accuracy_meters, speed_mps, timestamp, is_raw)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              firstPoint.id,
              trackId,
              segmentId,
              1,
              firstPoint.latitude,
              firstPoint.longitude,
              firstPoint.altitudeMeters,
              firstPoint.accuracyMeters,
              firstPoint.speedMps,
              firstPoint.timestamp,
            ]
          );
        }
      });

      setActiveRecordingContext(
        firstPoint
          ? {
              trackId,
              segmentId,
              lastLat: firstPoint.latitude,
              lastLng: firstPoint.longitude,
              lastAlt: firstPoint.altitudeMeters,
              lastTimestamp: firstPoint.timestamp,
              seq: 1,
            }
          : {
              trackId,
              segmentId,
              lastLat: null,
              lastLng: null,
              lastAlt: null,
              lastTimestamp: null,
              seq: 0,
            }
      );

      this.emit({
        status: 'recording',
        starting: false,
        trackId,
        distanceMeters: 0,
        movingTimeMs: 0,
        avgSpeedKmh: 0,
        ...(initialCoords
          ? {
              currentAltitudeMeters: initialCoords.altitudeMeters,
              currentLocation: {
                latitude: initialCoords.latitude,
                longitude: initialCoords.longitude,
                accuracy: initialCoords.accuracyMeters,
              },
            }
          : {}),
        points: firstPoint ? [firstPoint] : [],
        errorMessage: bgWarning ?? (!firstPoint ? '已开始记录，等待 GPS 卫星定位…' : null),
      });

      await this.startGpsStreams(bgGranted);
      return true;
    } catch {
      this.emit({
        starting: false,
        errorMessage: '启动 GPS 轨迹记录失败，请检查定位与存储权限。',
      });
      return false;
    } finally {
      this.isStarting = false;
      if (this.state.starting) {
        this.emit({ starting: false });
      }
    }
  }

  private async startGpsStreams(backgroundGranted: boolean) {
    this.stopTimersAndWatchers();
    this.lastMovingTickAt = Date.now();

    this.movingTimer = setInterval(() => {
      if (this.state.status !== 'recording') return;
      const now = Date.now();
      const delta = this.lastMovingTickAt ? now - this.lastMovingTickAt : 1000;
      this.lastMovingTickAt = now;
      const nextMovingMs = this.state.movingTimeMs + delta;
      this.emit({
        movingTimeMs: nextMovingMs,
        avgSpeedKmh: this.computeAvgSpeedKmh(this.state.distanceMeters, nextMovingMs),
      });
    }, 1000);

    if (backgroundGranted) {
      try {
        const hasBg = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (!hasBg) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 3,
            foregroundService: {
              notificationTitle: '跟夕走 · 正在记录徒步轨迹',
              notificationBody: '离线 GPS 持续记录中',
              notificationColor: '#1E352B',
            },
            pausesUpdatesAutomatically: false,
          });
        }
      } catch {
        this.emit({
          errorMessage: '后台前台服务未就绪，已切换为前台持续记录模式。',
        });
      }
    }

    this.foregroundSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 2,
      },
      async (loc) => {
        if (this.state.status !== 'recording' || !this.state.trackId) return;
        const alt =
          typeof loc.coords.altitude === 'number' && Number.isFinite(loc.coords.altitude)
            ? loc.coords.altitude
            : null;

        const rawHeading = loc.coords.heading;
        const gpsCourse =
          typeof rawHeading === 'number' && Number.isFinite(rawHeading) && rawHeading >= 0
            ? ((rawHeading % 360) + 360) % 360
            : null;

        this.emit({
          currentLocation: {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? null,
          },
          currentAltitudeMeters: alt,
          ...(this.state.errorMessage === '已开始记录，等待 GPS 卫星定位…'
            ? { errorMessage: null }
            : {}),
          ...(this.state.headingDegrees === null && gpsCourse !== null
            ? { headingDegrees: gpsCourse }
            : {}),
        });

        const persisted = await persistGpsSampleToSqlite(loc);
        if (!persisted) return;

        const nextDist = this.state.distanceMeters + persisted.addedDistanceMeters;
        const nextPoints = [...this.state.points, persisted.point];
        const nextAvgKmh = this.computeAvgSpeedKmh(nextDist, this.state.movingTimeMs);

        this.emit({
          distanceMeters: nextDist,
          avgSpeedKmh: nextAvgKmh,
          points: nextPoints,
        });

        try {
          const db = await openTrailDatabase();
          await db.runAsync(
            `UPDATE tracks SET distance_meters = ?, moving_time_ms = ?, avg_speed_mps = ? WHERE id = ?`,
            [nextDist, this.state.movingTimeMs, nextAvgKmh / 3.6, this.state.trackId]
          );
        } catch {
          // Ignore transient SQLite lock while background point update catches up
        }
      }
    );
  }

  private stopTimersAndWatchers() {
    if (this.movingTimer) {
      clearInterval(this.movingTimer);
      this.movingTimer = null;
    }
    this.lastMovingTickAt = null;
    if (this.foregroundSub) {
      this.foregroundSub.remove();
      this.foregroundSub = null;
    }
  }

  async pauseRecording(): Promise<void> {
    if (this.state.status !== 'recording') return;
    this.stopTimersAndWatchers();
    setActiveRecordingContext(null);
    try {
      const hasBg = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasBg) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Ignore background location teardown errors
    }
    this.emit({ status: 'paused' });
    if (this.state.trackId) {
      try {
        const db = await openTrailDatabase();
        await db.runAsync(`UPDATE tracks SET status = 'paused', moving_time_ms = ? WHERE id = ?`, [
          this.state.movingTimeMs,
          this.state.trackId,
        ]);
      } catch {
        // Ignore transient SQLite lock on pause
      }
    }
  }

  async resumeRecording(): Promise<void> {
    if (this.state.status !== 'paused' || !this.state.trackId) return;

    let bgGranted = false;
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      bgGranted = bg.status === 'granted';
    } catch {
      bgGranted = false;
    }
    const db = await openTrailDatabase();
    if (!this.segmentId) {
      const newSegId = makeUuid('seg');
      const countRow = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM track_segments WHERE track_id = ?`,
        [this.state.trackId]
      );
      let versionId = this.versionId;
      if (!versionId) {
        const trackRow = await db.getFirstAsync<{ active_version_id: string }>(
          `SELECT active_version_id FROM tracks WHERE id = ?`,
          [this.state.trackId]
        );
        versionId = trackRow?.active_version_id ?? makeUuid('ver');
      }
      await db.runAsync(
        `INSERT INTO track_segments (id, track_id, version_id, segment_index, started_at)
         VALUES (?, ?, ?, ?, ?)`,
        [newSegId, this.state.trackId, versionId, countRow?.cnt ?? 0, Date.now()]
      );
      this.segmentId = newSegId;
    }

    const dbPts = await db.getAllAsync<{
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
    }>(`SELECT * FROM track_points WHERE track_id = ? ORDER BY seq ASC`, [this.state.trackId]);

    const mapped: TrackPoint[] = dbPts.map((p) => ({
      id: p.id,
      trackId: p.track_id,
      segmentId: p.segment_id,
      seq: p.seq,
      latitude: p.latitude,
      longitude: p.longitude,
      altitudeMeters: p.altitude_meters,
      accuracyMeters: p.accuracy_meters,
      speedMps: p.speed_mps,
      timestamp: p.timestamp,
      isRaw: Boolean(p.is_raw),
    }));

    const last = mapped[mapped.length - 1];
    setActiveRecordingContext({
      trackId: this.state.trackId,
      segmentId: this.segmentId,
      lastLat: last?.latitude ?? null,
      lastLng: last?.longitude ?? null,
      lastAlt: last?.altitudeMeters ?? null,
      lastTimestamp: last?.timestamp ?? null,
      seq: last?.seq ?? 0,
    });

    this.emit({ status: 'recording', points: mapped });
    await db.runAsync(`UPDATE tracks SET status = 'recording' WHERE id = ?`, [this.state.trackId]);
    await this.startGpsStreams(bgGranted);
  }

  async stopAndSaveRecording(): Promise<string | null> {
    this.stopTimersAndWatchers();
    setActiveRecordingContext(null);
    try {
      const hasBg = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasBg) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Ignore background stop errors
    }

    const finishedTrackId = this.state.trackId;
    if (!finishedTrackId) {
      this.emit({ status: 'idle' });
      return null;
    }

    const db = await openTrailDatabase();
    const dbPts = await db.getAllAsync<{
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
    }>(`SELECT * FROM track_points WHERE track_id = ? ORDER BY seq ASC`, [finishedTrackId]);

    const finalPoints: TrackPoint[] =
      dbPts.length > 0
        ? dbPts.map((p) => ({
            id: p.id,
            trackId: p.track_id,
            segmentId: p.segment_id,
            seq: p.seq,
            latitude: p.latitude,
            longitude: p.longitude,
            altitudeMeters: p.altitude_meters,
            accuracyMeters: p.accuracy_meters,
            speedMps: p.speed_mps,
            timestamp: p.timestamp,
            isRaw: Boolean(p.is_raw),
          }))
        : this.state.points;

    const now = Date.now();
    const avgMps = this.computeAvgSpeedKmh(this.state.distanceMeters, this.state.movingTimeMs) / 3.6;
    const summary = computeElevationSummary(finalPoints);
    const totalTimeMs =
      this.startedAtMs > 0
        ? Math.max(this.state.movingTimeMs, now - this.startedAtMs)
        : this.state.movingTimeMs;
    const restTimeMs = Math.max(0, totalTimeMs - this.state.movingTimeMs);

    await db.runAsync(
      `UPDATE tracks
       SET status = 'completed', ended_at = ?, distance_meters = ?, moving_time_ms = ?,
           total_time_ms = ?, rest_time_ms = ?, ascent_meters = ?, descent_meters = ?,
           max_altitude_meters = ?, min_altitude_meters = ?, max_speed_mps = ?, avg_speed_mps = ?
       WHERE id = ?`,
      [
        now,
        this.state.distanceMeters,
        this.state.movingTimeMs,
        totalTimeMs,
        restTimeMs,
        summary.ascent,
        summary.descent,
        summary.maxAlt,
        summary.minAlt,
        summary.maxSpeedMps,
        avgMps,
        finishedTrackId,
      ]
    );

    this.resetForNextHike();
    return finishedTrackId;
  }

  resetForNextHike() {
    this.segmentId = null;
    this.versionId = null;
    this.startedAtMs = 0;
    this.emit({
      status: 'idle',
      starting: false,
      trackId: null,
      distanceMeters: 0,
      movingTimeMs: 0,
      avgSpeedKmh: 0,
      points: [],
      errorMessage: null,
    });
  }
}

export const trackRecorder = new TrackRecorderService();

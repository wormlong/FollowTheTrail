import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Pause, Play, X } from 'lucide-react';
import {
  GeoPoint,
  MapLayersState,
  PhotoMemory,
  RecordedTrack,
  RecordingStatus,
} from '../types/hiking';
import {
  MAX_HIKING_SPEED_MPS,
  computeTrackStats,
  formatDuration,
  haversineMeters,
} from '../utils/elevationMath';
import { loadActiveDraft, saveActiveDraft } from '../utils/offlineDb';
import { processAndMatchPhoto } from '../utils/photoMatcher';
import { normalizeHeadingDegrees } from '../utils/compassHeading';
import { MapLibreOutdoorMap } from './MapLibreOutdoorMap';

interface MinimalRecordViewProps {
  referenceRoute?: { id: string; title: string; points: GeoPoint[] } | null;
  onClearReferenceRoute?: () => void;
  onTrackCompleted: (track: RecordedTrack) => void;
  onViewCompletedTrack: (trackId: string) => void;
  onGpsUpdate?: (gps: GeoPoint | null) => void;
}

const MINIMAL_LAYERS: MapLayersState = {
  baseOutdoor: true,
  contours: false,
  hillshade: false,
  satellite: false,
  historicalTracks: false,
  activeTrack: true,
  importedTracks: false,
  waypoints: false,
};

const HOLD_MS = 1500;

export const MinimalRecordView: React.FC<MinimalRecordViewProps> = ({
  referenceRoute = null,
  onClearReferenceRoute,
  onTrackCompleted,
  onViewCompletedTrack,
  onGpsUpdate,
}) => {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [photos, setPhotos] = useState<PhotoMemory[]>([]);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [movingMs, setMovingMs] = useState<number>(0);
  const [liveGps, setLiveGps] = useState<GeoPoint | null>(null);
  const [altitudeValid, setAltitudeValid] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [completedTrackId, setCompletedTrackId] = useState<string | null>(null);

  // 1.5s long-press finish state
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const holdTimerRef = useRef<number | null>(null);
  const holdStartRef = useRef<number>(0);
  const holdTriggeredRef = useRef<boolean>(false);

  const watchIdRef = useRef<number | null>(null);
  const lastAcceptedRef = useRef<GeoPoint | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadActiveDraft().then((draft) => {
      if (draft && draft.points.length > 0) {
        setPoints(draft.points);
        setStartedAt(draft.startedAt);
        setMovingMs(draft.movingTimeMs || 0);
        const last = draft.points[draft.points.length - 1];
        setLiveGps(last);
        lastAcceptedRef.current = last;
        setStatus('paused');
        setNotice(`已恢复上次中断记录（${draft.points.length} 点）`);
      }
    });
  }, []);

  useEffect(() => {
    onGpsUpdate?.(liveGps);
  }, [liveGps, onGpsUpdate]);

  // Real moving time clock (ONLY accumulates while status === 'recording')
  useEffect(() => {
    if (status !== 'recording') return;
    const id = window.setInterval(() => {
      setMovingMs((prev) => prev + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // Auto-save active draft
  useEffect(() => {
    if (status === 'idle' || status === 'completed' || points.length === 0) return;
    saveActiveDraft({
      id: 'current',
      name: '徒步记录',
      startedAt: startedAt || Date.now(),
      elapsedMs: movingMs,
      movingTimeMs: movingMs,
      restTimeMs: 0,
      points,
      waypoints: [],
    });
  }, [points, status, startedAt, movingMs]);

  // Unified stats from real points + movingMs
  const stats = useMemo(() => computeTrackStats(points), [points]);
  const avgSpeedKmh = useMemo(() => {
    if (movingMs < 1000 || stats.distanceMeters <= 0) return 0;
    return (stats.distanceMeters / (movingMs / 1000)) * 3.6;
  }, [stats.distanceMeters, movingMs]);

  // Real Geolocation watch (never fabricates coordinates or altitude)
  useEffect(() => {
    if (status !== 'recording') {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setNotice('当前环境不支持真实 Geolocation 定位，请在移动设备使用原生客户端。');
      setStatus('paused');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const hasRealAlt =
          pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude);
        setAltitudeValid(hasRealAlt);

        const nextGps: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ele: hasRealAlt ? Math.round(pos.coords.altitude! * 10) / 10 : 0,
          timestamp: pos.timestamp || Date.now(),
          accuracy: pos.coords.accuracy,
          speedMps: pos.coords.speed ?? 0,
          heading: normalizeHeadingDegrees(pos.coords.heading),
        };
        setLiveGps(nextGps);

        if (pos.coords.accuracy > 35) {
          setNotice(`GPS 精度 ±${Math.round(pos.coords.accuracy)} m，已过滤低精度点`);
          return;
        }

        const prev = lastAcceptedRef.current;
        if (prev) {
          const dtSec = Math.max(0.5, (nextGps.timestamp - prev.timestamp) / 1000);
          const distM = haversineMeters(prev.lat, prev.lng, nextGps.lat, nextGps.lng);
          if (distM / dtSec > MAX_HIKING_SPEED_MPS) return;
          if (distM < 1.8 && (pos.coords.speed ?? 0) < 0.45) return;
        }

        lastAcceptedRef.current = nextGps;
        setPoints((prevPts) => [...prevPts, nextGps]);
        setNotice(null);
      },
      (err) => {
        setNotice(`定位权限或信号受限：${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [status]);

  // Long-press cancellation on page hide/blur
  const cancelHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
    holdTriggeredRef.current = false;
  };

  useEffect(() => {
    const onHide = () => cancelHold();
    window.addEventListener('blur', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('blur', onHide);
      document.removeEventListener('visibilitychange', onHide);
      cancelHold();
    };
  }, []);

  const handleHoldStart = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelHold();
    setIsHolding(true);
    holdStartRef.current = Date.now();
    holdTimerRef.current = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - holdStartRef.current) / HOLD_MS);
      setHoldProgress(ratio);
      if (ratio >= 1 && !holdTriggeredRef.current) {
        holdTriggeredRef.current = true;
        if (holdTimerRef.current !== null) {
          window.clearInterval(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        setIsHolding(false);
        setHoldProgress(0);
        handleConfirmFinish();
      }
    }, 30);
  };

  const handleRequestLocate = (): Promise<GeoPoint | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        setNotice('当前浏览器不支持真实 Geolocation 定位，请使用移动端原生客户端。');
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const hasRealAlt = pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude);
          setAltitudeValid(hasRealAlt);
          const pt: GeoPoint = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ele: hasRealAlt ? Math.round(pos.coords.altitude! * 10) / 10 : 0,
            timestamp: pos.timestamp || Date.now(),
            accuracy: pos.coords.accuracy,
            speedMps: pos.coords.speed ?? 0,
            heading: normalizeHeadingDegrees(pos.coords.heading),
          };
          setLiveGps(pt);
          setNotice(null);
          resolve(pt);
        },
        (err) => {
          setNotice(`无法获取当前定位（${err.message}），请检查位置权限。`);
          resolve(null);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
    });
  };

  const handleStart = () => {
    if (!('geolocation' in navigator)) {
      setNotice('当前浏览器无真实 GPS 硬件权限。');
      return;
    }
    setNotice(null);
    setCompletedTrackId(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const hasRealAlt = pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude);
        setAltitudeValid(hasRealAlt);
        const first: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ele: hasRealAlt ? Math.round(pos.coords.altitude! * 10) / 10 : 0,
          timestamp: pos.timestamp || Date.now(),
          accuracy: pos.coords.accuracy,
          speedMps: pos.coords.speed ?? 0,
          heading: normalizeHeadingDegrees(pos.coords.heading),
        };
        setStartedAt(Date.now());
        setMovingMs(0);
        setPoints([first]);
        setPhotos([]);
        setLiveGps(first);
        lastAcceptedRef.current = first;
        setStatus('recording');
      },
      (err) => {
        setNotice(`无法获取定位权限（${err.message}），未开始记录。`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirmFinish = async () => {
    const now = Date.now();
    const id = `trk-${now}`;
    const finalTrack: RecordedTrack = {
      id,
      name: `徒步记录 ${new Date(startedAt || now).toLocaleDateString('zh-CN')}`,
      description: '',
      region: '现场采集',
      startedAt: startedAt || now,
      endedAt: now,
      distanceMeters: stats.distanceMeters,
      movingTimeMs: movingMs,
      totalTimeMs: now - (startedAt || now),
      restTimeMs: Math.max(0, now - (startedAt || now) - movingMs),
      ascentMeters: stats.ascentMeters,
      descentMeters: stats.descentMeters,
      maxAltitudeMeters: stats.maxAltitudeMeters,
      minAltitudeMeters: stats.minAltitudeMeters,
      maxSpeedMps: stats.maxSpeedMps,
      avgSpeedMps: avgSpeedKmh / 3.6,
      points,
      rawPoints: [...points],
      versions: [
        {
          id: `ver-${now}`,
          summary: '原始 GPS 轨迹',
          createdAt: now,
          points: [...points],
          isOriginalRaw: true,
        },
      ],
      waypoints: [],
      photos,
      notes: [],
      overlayStyle: {
        visible: true,
        color: '#B84F24',
        width: 3.5,
        opacity: 0.95,
        showArrows: true,
      },
      isOfflineSaved: true,
    };

    await saveActiveDraft(null);
    onTrackCompleted(finalTrack);
    setCompletedTrackId(id);
    setStatus('completed');
    setNotice('轨迹与统计已保存');
  };

  const handlePhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const processed = await processAndMatchPhoto(file, completedTrackId || 'active', points);
    setPhotos((prev) => [...prev, processed]);
    setNotice(
      processed.matchedPointIndex !== null
        ? '照片已保存并关联至最近轨迹点'
        : '照片已保存（待关联轨迹点）'
    );
    e.target.value = '';
  };

  const ringRadius = 15;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - holdProgress);

  return (
    <div className="relative h-[calc(100vh-8rem)] min-h-[520px] rounded-xl overflow-hidden border border-[#DFD9CE] dark:border-[#2B3530] bg-[#EFECE4]">
      {/* Full-Screen MapLibre Map */}
      <MapLibreOutdoorMap
        layers={MINIMAL_LAYERS}
        tracks={[]}
        activeRecordingPoints={points}
        referencePoints={referenceRoute?.points ?? []}
        currentGps={liveGps}
        onRequestLocate={handleRequestLocate}
      />

      {(notice || referenceRoute) && (
        <div className="absolute top-3 left-3 right-20 z-10 max-w-md rounded-lg bg-[#F5F3EE]/95 dark:bg-[#141917]/95 border border-[#DFD9CE] dark:border-[#2B3530] px-3 py-2 text-xs text-[#1A211E] dark:text-[#ECEAE4] flex items-center justify-between gap-2">
          <span className="truncate">
            {notice || `参考轨迹：${referenceRoute?.title}`}
          </span>
          {!notice && referenceRoute && onClearReferenceRoute && (
            <button
              type="button"
              onClick={onClearReferenceRoute}
              aria-label="关闭参考轨迹"
              className="text-[#6B736E] hover:text-[#1A211E] dark:hover:text-[#ECEAE4] cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Bottom Floating 4-Metric Card + State Controls */}
      <div className="absolute left-3 right-3 bottom-3 z-10 max-w-lg mx-auto space-y-2.5">
        <div className="rounded-xl bg-[#F5F3EE]/95 dark:bg-[#141917]/92 backdrop-blur-sm border border-[#DFD9CE] dark:border-[#2B3530] px-3 py-3 grid grid-cols-4 text-center">
          <div>
            <div className="text-[11px] text-[#5C655F] dark:text-[#9BA39E]">里程</div>
            <div className="text-sm sm:text-base font-semibold font-mono-tabular mt-0.5">
              {(stats.distanceMeters / 1000).toFixed(2)} km
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5C655F] dark:text-[#9BA39E]">用时</div>
            <div className="text-sm sm:text-base font-semibold font-mono-tabular mt-0.5">
              {formatDuration(movingMs)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5C655F] dark:text-[#9BA39E]">均速</div>
            <div className="text-sm sm:text-base font-semibold font-mono-tabular mt-0.5">
              {avgSpeedKmh.toFixed(1)} km/h
            </div>
          </div>
          <div>
            <div className="text-[11px] text-[#5C655F] dark:text-[#9BA39E]">海拔</div>
            <div className="text-sm sm:text-base font-semibold font-mono-tabular mt-0.5">
              {altitudeValid && liveGps ? `${Math.round(liveGps.ele)} m` : '--'}
            </div>
          </div>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoPicked}
          className="hidden"
        />

        {status === 'idle' && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleStart}
              className="flex-1 min-h-[48px] rounded-xl bg-[#1E352B] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>开始</span>
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[48px] px-4 rounded-xl bg-white/95 dark:bg-[#1C2320] border border-[#DFD9CE] dark:border-[#2B3530] text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>拍照</span>
            </button>
          </div>
        )}

        {(status === 'recording' || status === 'paused') && (
          <div className="flex items-center gap-2">
            {status === 'recording' ? (
              <button
                type="button"
                onClick={() => setStatus('paused')}
                className="flex-1 min-h-[48px] rounded-xl bg-white/95 dark:bg-[#1C2320] border border-[#DFD9CE] dark:border-[#2B3530] text-sm font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                <span>暂停</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStatus('recording')}
                className="flex-1 min-h-[48px] rounded-xl bg-[#1E352B] text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>继续</span>
              </button>
            )}

            {/* 1.5s Long-Press Finish with Circular Progress */}
            <button
              type="button"
              onPointerDown={handleHoldStart}
              onPointerUp={() => !holdTriggeredRef.current && cancelHold()}
              onPointerLeave={() => !holdTriggeredRef.current && cancelHold()}
              onPointerCancel={cancelHold}
              className="flex-1 min-h-[48px] rounded-xl bg-white/95 dark:bg-[#1C2320] border border-[#B84F24] text-[#B84F24] text-sm font-medium inline-flex items-center justify-center gap-2 select-none touch-none cursor-pointer"
            >
              <svg width={36} height={36} className="shrink-0">
                <circle
                  cx={18}
                  cy={18}
                  r={ringRadius}
                  fill="none"
                  stroke="rgba(184, 79, 36, 0.2)"
                  strokeWidth={2.8}
                />
                <circle
                  cx={18}
                  cy={18}
                  r={ringRadius}
                  fill="none"
                  stroke="#B84F24"
                  strokeWidth={2.8}
                  strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                  strokeDashoffset={ringOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                />
                <rect x={13.5} y={13.5} width={9} height={9} rx={1.5} fill="#B84F24" />
              </svg>
              <span className="whitespace-nowrap">
                {isHolding
                  ? `按住 ${Math.max(0, (HOLD_MS * (1 - holdProgress)) / 1000).toFixed(1)}s`
                  : '长按结束'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[48px] px-3.5 rounded-xl bg-white/95 dark:bg-[#1C2320] border border-[#DFD9CE] dark:border-[#2B3530] text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>拍照</span>
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="flex items-center gap-2.5">
            {completedTrackId && (
              <button
                type="button"
                onClick={() => onViewCompletedTrack(completedTrackId)}
                className="flex-1 min-h-[48px] rounded-xl bg-[#1E352B] text-white text-sm font-medium cursor-pointer"
              >
                查看本次轨迹
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setPoints([]);
                setMovingMs(0);
                setCompletedTrackId(null);
                setNotice(null);
              }}
              className="min-h-[48px] px-4 rounded-xl bg-white/95 dark:bg-[#1C2320] border border-[#DFD9CE] dark:border-[#2B3530] text-sm font-medium cursor-pointer"
            >
              新记录
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Flag,
  Info,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Square,
  WifiOff,
} from 'lucide-react';
import {
  GeoPoint,
  MapLayersState,
  RecordedTrack,
  RecordingStatus,
  TrailWaypoint,
  WAYPOINT_TYPE_LABELS,
  WaypointType,
} from '../types/hiking';
import {
  MAX_HIKING_SPEED_MPS,
  computeTrackStats,
  computeWaypointAlongTrack,
  formatDuration,
  formatSpeedKmh,
  haversineMeters,
} from '../utils/elevationMath';
import { loadActiveDraft, saveActiveDraft } from '../utils/offlineDb';
import { LinkedElevationChart } from './LinkedElevationChart';
import { MapLibreOutdoorMap } from './MapLibreOutdoorMap';

interface RecordWorkspaceViewProps {
  onTrackSaved: (track: RecordedTrack) => void;
  onPointsChanged?: (points: GeoPoint[], liveGps: GeoPoint | null) => void;
}

const DEFAULT_LAYERS: MapLayersState = {
  baseOutdoor: true,
  contours: true,
  hillshade: true,
  satellite: false,
  historicalTracks: false,
  activeTrack: true,
  importedTracks: false,
  waypoints: true,
};

export const RecordWorkspaceView: React.FC<RecordWorkspaceViewProps> = ({
  onTrackSaved,
  onPointsChanged,
}) => {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [waypoints, setWaypoints] = useState<TrailWaypoint[]>([]);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [livePos, setLivePos] = useState<GeoPoint | null>(null);
  const [currentSpeedMps, setCurrentSpeedMps] = useState<number>(0);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [lowPowerMode, setLowPowerMode] = useState<boolean>(false);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  // Waypoint annotation modal state
  const [showWptForm, setShowWptForm] = useState(false);
  const [wptType, setWptType] = useState<WaypointType>('scenic');
  const [wptName, setWptName] = useState('');
  const [wptNote, setWptNote] = useState('');

  const watchIdRef = useRef<number | null>(null);
  const lastAcceptedRef = useRef<GeoPoint | null>(null);

  // Restore interrupted offline recording draft on startup
  useEffect(() => {
    loadActiveDraft().then((draft) => {
      if (draft && draft.points.length > 0) {
        setPoints(draft.points);
        setWaypoints(draft.waypoints || []);
        setStartedAt(draft.startedAt);
        setElapsedMs(draft.elapsedMs);
        const last = draft.points[draft.points.length - 1];
        setLivePos(last);
        lastAcceptedRef.current = last;
        setStatus('interrupted');
        setGpsNotice(`检测到上次异常中断的离线记录（已保存 ${draft.points.length} 个 GPS 点），可继续或结束保存`);
      }
    });
  }, []);

  useEffect(() => {
    onPointsChanged?.(points, livePos);
  }, [points, livePos, onPointsChanged]);

  const stats = useMemo(() => computeTrackStats(points), [points]);

  // Total clock timer during recording
  useEffect(() => {
    if (status !== 'recording') return;
    const id = window.setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // Auto-save every accepted GPS point to IndexedDB
  useEffect(() => {
    if (status === 'idle' || points.length === 0) return;
    saveActiveDraft({
      id: 'current',
      name: '离线徒步记录',
      startedAt: startedAt || Date.now(),
      elapsedMs,
      movingTimeMs: stats.movingTimeMs,
      restTimeMs: stats.restTimeMs,
      points,
      waypoints,
    });
  }, [points, waypoints, status, startedAt, elapsedMs, stats.movingTimeMs, stats.restTimeMs]);

  // Real Geolocation API ONLY — no fake GPS
  useEffect(() => {
    if (status !== 'recording') {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsNotice('当前浏览器环境不支持原生 Geolocation API，无法采集真实 GPS 定位');
      setStatus('paused');
      return;
    }

    setGpsNotice('正在使用设备真实 GPS 传感器采集定位（高精度模式）...');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        const ts = pos.timestamp || Date.now();
        const nextLat = pos.coords.latitude;
        const nextLng = pos.coords.longitude;
        const nextEle = pos.coords.altitude !== null ? Math.round(pos.coords.altitude * 10) / 10 : 0;
        const reportedSpeed = pos.coords.speed !== null && pos.coords.speed >= 0 ? pos.coords.speed : 0;

        // Filter poor GPS accuracy (> 35m)
        if (acc > 35) {
          setGpsNotice(`当前 GPS 精度偏低（±${Math.round(acc)} m），已过滤漂移点`);
          setLivePos({ lat: nextLat, lng: nextLng, ele: nextEle, timestamp: ts, accuracy: acc });
          return;
        }

        const prev = lastAcceptedRef.current;
        if (prev) {
          const dtSec = Math.max(0.5, (ts - prev.timestamp) / 1000);
          const distM = haversineMeters(prev.lat, prev.lng, nextLat, nextLng);
          const impliedSpeed = distM / dtSec;

          // Filter GPS jump spike
          if (impliedSpeed > MAX_HIKING_SPEED_MPS) {
            setGpsNotice(`检测到异常高速漂移（${(impliedSpeed * 3.6).toFixed(1)} km/h），已自动剔除`);
            return;
          }

          // Stationary jitter suppression
          if (distM < 1.8 && reportedSpeed < 0.45) {
            setCurrentSpeedMps(0);
            setLivePos({ lat: nextLat, lng: nextLng, ele: nextEle, timestamp: ts, accuracy: acc });
            return;
          }
          setCurrentSpeedMps(reportedSpeed > 0 ? reportedSpeed : impliedSpeed);
        }

        const accepted: GeoPoint = {
          lat: nextLat,
          lng: nextLng,
          ele: nextEle,
          timestamp: ts,
          accuracy: acc,
          speedMps: reportedSpeed,
        };
        lastAcceptedRef.current = accepted;
        setLivePos(accepted);
        setPoints((prevPts) => [...prevPts, accepted]);
        setGpsNotice(null);
      },
      (err) => {
        setGpsNotice(`GPS 定位异常：${err.message}。请在支持定位权限的移动设备或浏览器中授予位置访问。`);
      },
      {
        enableHighAccuracy: !lowPowerMode,
        maximumAge: lowPowerMode ? 8000 : 1500,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [status, lowPowerMode]);

  const handleStart = () => {
    if (status === 'idle') {
      setStartedAt(Date.now());
      setElapsedMs(0);
      setPoints([]);
      setWaypoints([]);
      lastAcceptedRef.current = null;
    }
    setStatus('recording');
  };

  const handleAddWaypointSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const base = livePos || points[points.length - 1];
    if (!base) {
      setGpsNotice('尚未获得真实 GPS 坐标，请先等待定位成功后添加标注');
      setShowWptForm(false);
      return;
    }
    const along = computeWaypointAlongTrack(points, base.lat, base.lng);
    const wp: TrailWaypoint = {
      id: `wpt-${Date.now()}`,
      type: wptType,
      name: wptName.trim() || `${WAYPOINT_TYPE_LABELS[wptType]} #${waypoints.length + 1}`,
      note: wptNote.trim(),
      tags: [WAYPOINT_TYPE_LABELS[wptType]],
      lat: base.lat,
      lng: base.lng,
      ele: base.ele,
      timestamp: Date.now(),
      ...along,
    };
    setWaypoints((prev) => [...prev, wp]);
    setWptName('');
    setWptNote('');
    setShowWptForm(false);
  };

  const handleFinishAndSave = async () => {
    if (points.length < 2) {
      setGpsNotice('有效真实 GPS 坐标不足 2 个，无法生成完整轨迹');
      return;
    }
    const now = Date.now();
    const finalStats = computeTrackStats(points);
    const dateLabel = new Date(startedAt || now).toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    });
    const newTrack: RecordedTrack = {
      id: `trk-${now}`,
      name: `徒步记录 ${dateLabel}`,
      description: '真实设备 GPS 离线采集轨迹',
      region: '现场采集',
      startedAt: startedAt || points[0].timestamp,
      endedAt: now,
      distanceMeters: finalStats.distanceMeters,
      movingTimeMs: finalStats.movingTimeMs,
      totalTimeMs: elapsedMs || finalStats.totalTimeMs,
      restTimeMs: finalStats.restTimeMs,
      ascentMeters: finalStats.ascentMeters,
      descentMeters: finalStats.descentMeters,
      maxAltitudeMeters: finalStats.maxAltitudeMeters,
      minAltitudeMeters: finalStats.minAltitudeMeters,
      maxSpeedMps: finalStats.maxSpeedMps,
      avgSpeedMps: finalStats.avgSpeedMps,
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
      waypoints,
      photos: [],
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
    onTrackSaved(newTrack);
    setStatus('completed');
    setPoints([]);
    setWaypoints([]);
    setElapsedMs(0);
    lastAcceptedRef.current = null;
  };

  const handleDiscardDraft = async () => {
    await saveActiveDraft(null);
    setStatus('idle');
    setPoints([]);
    setWaypoints([]);
    setElapsedMs(0);
    lastAcceptedRef.current = null;
    setGpsNotice(null);
  };

  const statusLabel: Record<RecordingStatus, string> = {
    idle: '未开始',
    recording: '记录中（真实 GPS）',
    paused: '暂停中',
    completed: '已结束并保存',
    interrupted: '异常中断待恢复',
  };

  return (
    <div className="space-y-4 pb-24 md:pb-10">
      {/* Top Status & Low-Battery / Calculation Rules Strip */}
      <div className="rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-[#1A211E] dark:text-[#ECEAE4] inline-flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[#B84F24]" />
            {statusLabel[status]}
          </span>
          <span className="text-[#6B736E] dark:text-[#9BA39E] inline-flex items-center gap-1">
            <WifiOff className="w-3.5 h-3.5" />
            本地实时持久化（{points.length} 点）
          </span>
          {livePos?.accuracy !== undefined && (
            <span className="font-mono-tabular text-[#5C655F] dark:text-[#9BA39E]">
              GPS 精度 ±{Math.round(livePos.accuracy)} m
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLowPowerMode((v) => !v)}
            className={`min-h-[36px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
              lowPowerMode
                ? 'border-[#1E352B] bg-[#1E352B]/10 text-[#1E352B] dark:text-[#9CC0AD]'
                : 'border-[#DFD9CE] dark:border-[#2C3530] text-[#5C655F]'
            }`}
          >
            <BatteryCharging className="w-3.5 h-3.5" />
            <span>{lowPowerMode ? '低电量省电采样开' : '标准高精度采样'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRulesModal((v) => !v)}
            className="min-h-[36px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs text-[#5C655F] dark:text-[#9BA39E] inline-flex items-center gap-1 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>算法规则</span>
          </button>
        </div>
      </div>

      {showRulesModal && (
        <div className="rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-4 text-xs text-[#4C544F] dark:text-[#B4BCB7] space-y-1.5 leading-relaxed">
          <div className="font-semibold text-[#1A211E] dark:text-[#ECEAE4]">
            真实 GPS 采集与统计规则（Section 5.4）
          </div>
          <p>1. 仅采纳设备真实定位，不提供模拟 GPS 伪造轨迹；精度差于 35 m 或瞬时速度超过 12 m/s 的漂移点自动剔除。</p>
          <p>2. 相邻位移 &lt; 1.8 m 且速度 &lt; 0.45 m/s 判定为静止，防止原地抖动虚增里程，并自动统计休息时间。</p>
          <p>3. 海拔累计爬升与下降采用 3.0 m 垂直死区滤波，过滤气压/GPS 垂直抖动误差。</p>
        </div>
      )}

      {gpsNotice && (
        <div className="rounded-xl border border-[#B84F24]/30 bg-white dark:bg-[#1A211E] px-4 py-2.5 text-xs text-[#B84F24] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{gpsNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Map Canvas */}
        <div className="lg:col-span-7 h-[320px] sm:h-[440px] lg:h-[580px] rounded-2xl overflow-hidden border border-[#DFD9CE] dark:border-[#2C3530]">
          <MapLibreOutdoorMap
            layers={DEFAULT_LAYERS}
            tracks={[]}
            activeRecordingPoints={points}
            waypoints={waypoints}
            currentGps={livePos}
          />
        </div>

        {/* 12-Metric Telemetry & Controls */}
        <div className="lg:col-span-5 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 pb-4 border-b border-[#EAE5DC] dark:border-[#2A332E]">
              <MetricCell label="累计距离" value={`${(stats.distanceMeters / 1000).toFixed(2)} km`} highlight />
              <MetricCell label="运动时间" value={formatDuration(stats.movingTimeMs)} />
              <MetricCell label="总耗时" value={formatDuration(elapsedMs)} />
              <MetricCell label="休息时间" value={formatDuration(stats.restTimeMs)} />
              <MetricCell label="当前速度" value={`${formatSpeedKmh(currentSpeedMps)} km/h`} />
              <MetricCell label="平均速度" value={`${formatSpeedKmh(stats.avgSpeedMps)} km/h`} />
              <MetricCell label="最快速度" value={`${formatSpeedKmh(stats.maxSpeedMps)} km/h`} />
              <MetricCell label="累计爬升" value={`+${Math.round(stats.ascentMeters)} m`} highlight />
              <MetricCell label="累计下降" value={`-${Math.round(stats.descentMeters)} m`} />
              <MetricCell label="当前海拔" value={`${Math.round(livePos?.ele ?? 0)} m`} />
              <MetricCell label="最高海拔" value={`${Math.round(stats.maxAltitudeMeters)} m`} />
              <MetricCell label="最低海拔" value={`${Math.round(stats.minAltitudeMeters)} m`} />
            </div>

            <LinkedElevationChart points={points} height={124} showSpeedCurve={false} />
          </div>

          {/* Primary Controls */}
          <div className="space-y-2.5">
            {(status === 'idle' || status === 'completed') && (
              <button
                type="button"
                onClick={handleStart}
                className="w-full min-h-[48px] rounded-xl bg-[#B84F24] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#A3441D] cursor-pointer"
              >
                <Play className="w-4 h-4" />
                <span>开始真实 GPS 记录</span>
              </button>
            )}

            {status === 'recording' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStatus('paused')}
                    className="min-h-[48px] rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    <span>暂停</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWptForm(true)}
                    className="min-h-[48px] rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Flag className="w-4 h-4 text-[#B84F24]" />
                    <span>添加标注</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleFinishAndSave}
                  className="w-full min-h-[48px] rounded-xl bg-[#1E352B] text-white text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Square className="w-4 h-4" />
                  <span>结束并保存轨迹</span>
                </button>
              </div>
            )}

            {(status === 'paused' || status === 'interrupted') && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStatus('recording')}
                    className="min-h-[48px] rounded-xl bg-[#B84F24] text-white text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>{status === 'interrupted' ? '恢复记录' : '继续记录'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleFinishAndSave}
                    className="min-h-[48px] rounded-xl bg-[#1E352B] text-white text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    <span>保存当前轨迹</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="w-full min-h-[40px] rounded-xl text-xs text-[#6B736E] inline-flex items-center justify-center gap-1 hover:text-[#B84F24] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>清除草稿</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Waypoint Modal */}
      {showWptForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowWptForm(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleAddWaypointSubmit}
            className="w-full max-w-md rounded-2xl bg-[#F5F3EE] dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] p-5 space-y-4"
          >
            <h3 className="text-base font-semibold">添加轨迹标注点</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(WAYPOINT_TYPE_LABELS) as WaypointType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWptType(t)}
                  className={`min-h-[34px] rounded-lg border text-xs cursor-pointer ${
                    wptType === t
                      ? 'border-[#B84F24] bg-[#B84F24]/10 text-[#B84F24] font-medium'
                      : 'border-[#DFD9CE] dark:border-[#2C3530]'
                  }`}
                >
                  {WAYPOINT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={wptName}
              onChange={(e) => setWptName(e.target.value)}
              placeholder="标注点名称（如：三岔垭口水源）"
              className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530] text-sm"
            />
            <textarea
              value={wptNote}
              onChange={(e) => setWptNote(e.target.value)}
              placeholder="记录地形、水量、路况或此刻感受..."
              rows={3}
              className="w-full p-3 rounded-xl bg-white dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530] text-sm"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowWptForm(false)}
                className="flex-1 min-h-[42px] rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-sm cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[42px] rounded-xl bg-[#B84F24] text-white text-sm font-medium cursor-pointer"
              >
                保存标注
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const MetricCell: React.FC<{ label: string; value: string; highlight?: boolean }> = ({
  label,
  value,
  highlight,
}) => (
  <div>
    <div className="text-[11px] text-[#6B736E] dark:text-[#9BA39E]">{label}</div>
    <div
      className={`text-sm sm:text-base font-semibold font-mono-tabular mt-0.5 ${
        highlight ? 'text-[#B84F24]' : 'text-[#1A211E] dark:text-[#ECEAE4]'
      }`}
    >
      {value}
    </div>
  </div>
);

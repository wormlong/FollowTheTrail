import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckSquare,
  Clock,
  Copy,
  ShieldAlert,
  Square,
} from 'lucide-react';
import {
  GeoPoint,
  MapLayersState,
  RecordedTrack,
  SafetySettings,
} from '../types/hiking';
import {
  DEFAULT_SAFETY_SETTINGS,
  loadSafetySettings,
  saveSafetySettings,
} from '../utils/offlineDb';
import { MapLibreOutdoorMap } from './MapLibreOutdoorMap';

interface MeArchiveSafetyViewProps {
  tracks: RecordedTrack[];
  currentGps: GeoPoint | null;
}

const FOOTPRINT_LAYERS: MapLayersState = {
  baseOutdoor: true,
  contours: true,
  hillshade: false,
  satellite: false,
  historicalTracks: true,
  activeTrack: false,
  importedTracks: true,
  waypoints: false,
};

export const MeArchiveSafetyView: React.FC<MeArchiveSafetyViewProps> = ({
  tracks,
  currentGps,
}) => {
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [safety, setSafety] = useState<SafetySettings>(DEFAULT_SAFETY_SETTINGS);
  const [copiedSos, setCopiedSos] = useState(false);
  const [checkInMinutes, setCheckInMinutes] = useState<number>(0);

  useEffect(() => {
    loadSafetySettings().then(setSafety);
  }, []);

  const updateSafety = (patch: Partial<SafetySettings>) => {
    const next = { ...safety, ...patch };
    setSafety(next);
    saveSafetySettings(next);
  };

  const regions = useMemo(
    () => Array.from(new Set(tracks.map((t) => t.region || '未分组'))),
    [tracks]
  );
  const years = useMemo(
    () => Array.from(new Set(tracks.map((t) => String(new Date(t.startedAt).getFullYear())))),
    [tracks]
  );

  const filteredTracks = useMemo(
    () =>
      tracks.filter((t) => {
        const yr = String(new Date(t.startedAt).getFullYear());
        const matchReg = regionFilter === 'all' || (t.region || '未分组') === regionFilter;
        const matchYr = yearFilter === 'all' || yr === yearFilter;
        return matchReg && matchYr;
      }),
    [tracks, regionFilter, yearFilter]
  );

  const archiveSummary = useMemo(() => {
    const totalDistanceKm = filteredTracks.reduce((acc, t) => acc + t.distanceMeters / 1000, 0);
    const totalAscentM = filteredTracks.reduce((acc, t) => acc + t.ascentMeters, 0);
    const maxEle =
      filteredTracks.length > 0
        ? Math.max(...filteredTracks.map((t) => t.maxAltitudeMeters))
        : 0;
    const uniqueDays = new Set(
      filteredTracks.map((t) => new Date(t.startedAt).toISOString().slice(0, 10))
    ).size;
    const allPhotos = filteredTracks.flatMap((t) => t.photos);
    return {
      count: filteredTracks.length,
      days: uniqueDays,
      totalDistanceKm,
      totalAscentM,
      maxEle,
      allPhotos,
    };
  }, [filteredTracks]);

  const handleCopyEmergencyLocation = async () => {
    const pos = currentGps || tracks[0]?.points[0];
    const msg = pos
      ? `【跟夕走安全位置报备】当前坐标 ${pos.lat.toFixed(5)}°N, ${pos.lng.toFixed(5)}°E，海拔 ${Math.round(pos.ele)} m，预计抵达 ${safety.etaText}`
      : '暂无 GPS 定位坐标';
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedSos(true);
      window.setTimeout(() => setCopiedSos(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      {/* Personal Outdoor Archive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">我的户外档案与安全中心</h1>
          <p className="text-xs sm:text-sm text-[#6B736E] dark:text-[#9BA39E] mt-0.5">
            长期保存个人徒步足迹、照片记忆、出发前装备核查与安全报备参数
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="按年份筛选"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] text-xs"
          >
            <option value="all">全部年份</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y} 年
              </option>
            ))}
          </select>

          <select
            aria-label="按地区筛选"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] text-xs"
          >
            <option value="all">全部地区</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cumulative Archive Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5">
        <div>
          <div className="text-xs text-[#6B736E]">总徒步距离</div>
          <div className="text-xl font-semibold font-mono-tabular mt-0.5">
            {archiveSummary.totalDistanceKm.toFixed(1)} km
          </div>
        </div>
        <div>
          <div className="text-xs text-[#6B736E]">总累计爬升</div>
          <div className="text-xl font-semibold font-mono-tabular mt-0.5 text-[#B84F24]">
            +{Math.round(archiveSummary.totalAscentM)} m
          </div>
        </div>
        <div>
          <div className="text-xs text-[#6B736E]">徒步次数</div>
          <div className="text-xl font-semibold font-mono-tabular mt-0.5">{archiveSummary.count} 次</div>
        </div>
        <div>
          <div className="text-xs text-[#6B736E]">徒步天数</div>
          <div className="text-xl font-semibold font-mono-tabular mt-0.5">{archiveSummary.days} 天</div>
        </div>
        <div>
          <div className="text-xs text-[#6B736E]">最高海拔</div>
          <div className="text-xl font-semibold font-mono-tabular mt-0.5">
            {Math.round(archiveSummary.maxEle)} m
          </div>
        </div>
      </div>

      {/* All Historical Footprints Map + Photo Wall */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EAE5DC] dark:border-[#2A332E] text-xs font-semibold">
            历史徒步足迹总览地图
          </div>
          <div className="h-72">
            <MapLibreOutdoorMap
              layers={FOOTPRINT_LAYERS}
              tracks={filteredTracks.map((t) => ({
                id: t.id,
                name: t.name,
                points: t.points,
                color: t.overlayStyle.color,
                width: 3,
                opacity: 0.9,
                visible: true,
                showArrows: false,
                isHistorical: true,
              }))}
              currentGps={currentGps}
            />
          </div>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5 space-y-3">
          <div className="text-xs font-semibold">徒步记忆照片墙（{archiveSummary.allPhotos.length}）</div>
          {archiveSummary.allPhotos.length === 0 ? (
            <p className="text-xs text-[#6B736E] py-8 text-center">
              在「轨迹」详情页上传照片并确认关联后，将汇聚展示于此。
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {archiveSummary.allPhotos.slice(0, 9).map((ph) => (
                <img
                  key={ph.id}
                  src={ph.thumbnailDataUrl}
                  alt={ph.fileName}
                  className="aspect-square rounded-lg object-cover bg-[#EFECE4]"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Outdoor Safety & Pre-hike Gear Checklist (Section 12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-7 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold inline-flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#B84F24]" />
              <span>户外安全设置与紧急坐标卡</span>
            </h2>
            <button
              type="button"
              onClick={handleCopyEmergencyLocation}
              className="min-h-[36px] px-3 rounded-xl bg-[#1E352B] text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedSos ? '已复制位置报文' : '复制当前位置与海拔'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-[#6B736E]">SOS 紧急联系人</span>
              <input
                type="text"
                value={safety.emergencyContactName}
                onChange={(e) => updateSafety({ emergencyContactName: e.target.value })}
                placeholder="姓名"
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#6B736E]">紧急联系电话</span>
              <input
                type="tel"
                value={safety.emergencyContactPhone}
                onChange={(e) => updateSafety({ emergencyContactPhone: e.target.value })}
                placeholder="手机号码"
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#6B736E]">预计到达安全点时间（ETA）</span>
              <input
                type="time"
                value={safety.etaText}
                onChange={(e) => updateSafety({ etaText: e.target.value })}
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[#6B736E]">偏离路线提醒阈值（米）</span>
              <input
                type="number"
                min={30}
                max={1000}
                value={safety.offRouteAlertMeters}
                onChange={(e) =>
                  updateSafety({ offRouteAlertMeters: parseInt(e.target.value || '120', 10) })
                }
                className="w-full min-h-[40px] px-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#EAE5DC] dark:border-[#2A332E] text-xs">
            <span className="inline-flex items-center gap-1.5 text-[#5C655F] dark:text-[#9BA39E]">
              <Clock className="w-3.5 h-3.5" />
              {checkInMinutes > 0 ? `已开启 ${checkInMinutes} 分钟定时报平安提醒` : '定时安全报平安'}
            </span>
            <div className="flex gap-1.5">
              {[0, 60, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCheckInMinutes(m)}
                  className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                    checkInMinutes === m
                      ? 'border-[#B84F24] text-[#B84F24]'
                      : 'border-[#DFD9CE] dark:border-[#2C3530]'
                  }`}
                >
                  {m === 0 ? '关闭' : `${m} 分钟`}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] text-[11px] text-[#5C655F] dark:text-[#9BA39E] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-[#B84F24] shrink-0 mt-0.5" />
            <span>
              安全声明：跟夕走仅提供离线坐标展示与本地安全提醒辅助，不作为专业救援系统，不能替代卫星通信设备或专业户外救援服务。
            </span>
          </div>
        </section>

        {/* Pre-hike Gear Checklist */}
        <section className="lg:col-span-5 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5 space-y-3">
          <h2 className="text-base font-semibold">出发前装备检查清单</h2>
          <div className="divide-y divide-[#F0ECE3] dark:divide-[#242D28]">
            {safety.gearChecklist.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  updateSafety({
                    gearChecklist: safety.gearChecklist.map((g) =>
                      g.id === item.id ? { ...g, checked: !g.checked } : g
                    ),
                  })
                }
                className="w-full py-2.5 flex items-center gap-2.5 text-left text-xs cursor-pointer"
              >
                {item.checked ? (
                  <CheckSquare className="w-4 h-4 text-[#1E352B] dark:text-[#9CC0AD] shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-[#8B938E] shrink-0" />
                )}
                <span className={item.checked ? 'line-through text-[#8B938E]' : ''}>
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

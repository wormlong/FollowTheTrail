import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Download,
  Edit3,
  FileArchive,
  Flag,
  Image as ImageIcon,
  Redo2,
  Scissors,
  Share2,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  GeoPoint,
  MapLayersState,
  PhotoMemory,
  RecordedTrack,
  TrailWaypoint,
  WAYPOINT_TYPE_LABELS,
  WaypointType,
} from '../types/hiking';
import {
  computeTrackStats,
  computeWaypointAlongTrack,
  exportTrackToGeoJson,
  exportTrackToGpx,
  formatDuration,
  formatSpeedKmh,
} from '../utils/elevationMath';
import { processAndMatchPhoto } from '../utils/photoMatcher';
import { exportFollowTheTrailZip } from '../utils/zipArchive';
import { LinkedElevationChart } from './LinkedElevationChart';
import { MapLibreOutdoorMap } from './MapLibreOutdoorMap';
import { SharePosterModal } from './SharePosterModal';

interface TracksWorkspaceViewProps {
  tracks: RecordedTrack[];
  onSaveTrack: (track: RecordedTrack) => void;
  onImportTrack: (track: RecordedTrack) => void;
  onDeleteTrack: (trackId: string) => void;
}

const DETAIL_LAYERS: MapLayersState = {
  baseOutdoor: true,
  contours: true,
  hillshade: true,
  satellite: false,
  historicalTracks: true,
  activeTrack: false,
  importedTracks: true,
  waypoints: true,
};

export const TracksWorkspaceView: React.FC<TracksWorkspaceViewProps> = ({
  tracks,
  onSaveTrack,
  onImportTrack,
  onDeleteTrack,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(tracks[0]?.id ?? null);
  const [detailTab, setDetailTab] = useState<'overview' | 'waypoints' | 'photos' | 'edit'>('overview');
  const [hoverPoint, setHoverPoint] = useState<GeoPoint | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [posterTrack, setPosterTrack] = useState<RecordedTrack | null>(null);
  const [undoStack, setUndoStack] = useState<GeoPoint[][]>([]);
  const [redoStack, setRedoStack] = useState<GeoPoint[][]>([]);

  // Waypoint quick creator
  const [newWptName, setNewWptName] = useState('');
  const [newWptType, setNewWptType] = useState<WaypointType>('scenic');
  const [newWptNote, setNewWptNote] = useState('');

  const photoInputRef = useRef<HTMLInputElement>(null);

  const selectedTrack = tracks.find((t) => t.id === selectedId) || tracks[0] || null;
  const stats = useMemo(
    () => (selectedTrack ? computeTrackStats(selectedTrack.points) : null),
    [selectedTrack]
  );

  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTrack || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    const processed: PhotoMemory[] = [];
    for (const f of files) {
      const p = await processAndMatchPhoto(f, selectedTrack.id, selectedTrack.points);
      processed.push(p);
    }
    const updated: RecordedTrack = {
      ...selectedTrack,
      photos: [...selectedTrack.photos, ...processed],
    };
    onSaveTrack(updated);
    setNotice(
      `已导入 ${processed.length} 张本地照片，请确认或调整时间/GPS 关联位置`
    );
    e.target.value = '';
  };

  const handleConfirmPhoto = (photoId: string, waypointId: string | null) => {
    if (!selectedTrack) return;
    const updated: RecordedTrack = {
      ...selectedTrack,
      photos: selectedTrack.photos.map((p) =>
        p.id === photoId ? { ...p, confirmedByUser: true, waypointId } : p
      ),
    };
    onSaveTrack(updated);
  };

  const handleRemovePhoto = (photoId: string) => {
    if (!selectedTrack) return;
    onSaveTrack({
      ...selectedTrack,
      photos: selectedTrack.photos.filter((p) => p.id !== photoId),
    });
  };

  const applyPointsEdit = (nextPoints: GeoPoint[], summary: string) => {
    if (!selectedTrack || nextPoints.length < 2) return;
    setUndoStack((prev) => [...prev, selectedTrack.points]);
    setRedoStack([]);
    const s = computeTrackStats(nextPoints);
    const version = {
      id: `ver-${Date.now()}`,
      summary,
      createdAt: Date.now(),
      points: nextPoints,
      isOriginalRaw: false,
    };
    onSaveTrack({
      ...selectedTrack,
      points: nextPoints,
      distanceMeters: s.distanceMeters,
      movingTimeMs: s.movingTimeMs,
      totalTimeMs: s.totalTimeMs,
      restTimeMs: s.restTimeMs,
      ascentMeters: s.ascentMeters,
      descentMeters: s.descentMeters,
      maxAltitudeMeters: s.maxAltitudeMeters,
      minAltitudeMeters: s.minAltitudeMeters,
      maxSpeedMps: s.maxSpeedMps,
      avgSpeedMps: s.avgSpeedMps,
      versions: [version, ...selectedTrack.versions],
    });
    setNotice(`已更新轨迹版本：${summary}（原始 GPS 数据保持完整不可变）`);
  };

  const handleUndoEdit = () => {
    if (!selectedTrack || undoStack.length === 0) return;
    const prevPoints = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, selectedTrack.points]);
    const st = computeTrackStats(prevPoints);
    onSaveTrack({
      ...selectedTrack,
      points: prevPoints,
      distanceMeters: st.distanceMeters,
      ascentMeters: st.ascentMeters,
      descentMeters: st.descentMeters,
    });
  };

  const handleRedoEdit = () => {
    if (!selectedTrack || redoStack.length === 0) return;
    const nextPoints = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, selectedTrack.points]);
    const st = computeTrackStats(nextPoints);
    onSaveTrack({
      ...selectedTrack,
      points: nextPoints,
      distanceMeters: st.distanceMeters,
      ascentMeters: st.ascentMeters,
      descentMeters: st.descentMeters,
    });
  };

  const handleAddWaypoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrack || selectedTrack.points.length === 0) return;
    const anchor = hoverPoint || selectedTrack.points[Math.floor(selectedTrack.points.length / 2)];
    const along = computeWaypointAlongTrack(selectedTrack.points, anchor.lat, anchor.lng);
    const wp: TrailWaypoint = {
      id: `wpt-${Date.now()}`,
      type: newWptType,
      name: newWptName.trim() || `${WAYPOINT_TYPE_LABELS[newWptType]}标注`,
      note: newWptNote.trim(),
      tags: [WAYPOINT_TYPE_LABELS[newWptType]],
      lat: anchor.lat,
      lng: anchor.lng,
      ele: anchor.ele,
      timestamp: anchor.timestamp || Date.now(),
      ...along,
    };
    onSaveTrack({ ...selectedTrack, waypoints: [...selectedTrack.waypoints, wp] });
    setNewWptName('');
    setNewWptNote('');
  };

  const handleDeleteWaypoint = (wptId: string) => {
    if (!selectedTrack) return;
    onSaveTrack({
      ...selectedTrack,
      waypoints: selectedTrack.waypoints.filter((w) => w.id !== wptId),
    });
  };

  const handleDownloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportZip = async () => {
    if (!selectedTrack) return;
    const blob = await exportFollowTheTrailZip(selectedTrack);
    handleDownloadBlob(blob, `${selectedTrack.name.replace(/\s+/g, '_')}_FOLLOW_THE_TRAIL.zip`);
    setNotice('已导出完整 FOLLOW_THE_TRAIL.zip 数据包（含轨迹、标注、笔记与本地照片）');
  };

  return (
    <div className="space-y-5 pb-24 md:pb-12">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold">我的历史轨迹</h1>
        <p className="text-xs sm:text-sm text-[#6B736E] dark:text-[#9BA39E] mt-0.5">
          仅展示自己记录的徒步轨迹，支持导出 GPX / GeoJSON / ZIP、联动海拔分析与照片关联
        </p>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] px-4 py-2.5 text-xs text-[#1E352B] dark:text-[#9CC0AD]">
          {notice}
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-8 text-center text-xs text-[#6B736E] dark:text-[#9BA39E]">
          暂无已保存的历史轨迹，请在「记录」页完成徒步记录后查看；导入的外部轨迹请前往「发现」查看。
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Track List */}
        <div className="lg:col-span-4 space-y-3">
          {tracks.map((track) => {
            const active = selectedTrack?.id === track.id;
            return (
              <button
                key={track.id}
                type="button"
                onClick={() => {
                  setSelectedId(track.id);
                  setHoverPoint(null);
                  setUndoStack([]);
                  setRedoStack([]);
                }}
                className={`w-full text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
                  active
                    ? 'border-[#B84F24] bg-white dark:bg-[#1A211E]'
                    : 'border-[#DFD9CE] dark:border-[#2C3530] bg-white/80 dark:bg-[#1A211E]/70 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-[#6B736E] dark:text-[#9BA39E]">
                  <span className="font-mono-tabular">
                    {new Date(track.startedAt).toLocaleDateString('zh-CN')}
                  </span>
                  <span>
                    {track.isDemoData ? 'DEMO 数据' : track.isTemporaryImport ? '导入轨迹' : '本地记录'}
                  </span>
                </div>
                <div className="text-base font-semibold mt-1 text-[#1A211E] dark:text-[#ECEAE4]">
                  {track.name}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs font-mono-tabular text-[#4C544F] dark:text-[#B4BCB7]">
                  <span>{(track.distanceMeters / 1000).toFixed(2)} km</span>
                  <span>·</span>
                  <span>+{Math.round(track.ascentMeters)} m</span>
                  <span>·</span>
                  <span>{track.waypoints.length} 标注</span>
                  <span>·</span>
                  <span>{track.photos.length} 照片</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Track Detail & Analysis */}
        {selectedTrack && stats && (
          <div className="lg:col-span-8 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] overflow-hidden">
            {/* Linked Map */}
            <div className="h-64 sm:h-72 border-b border-[#DFD9CE] dark:border-[#2C3530]">
              <MapLibreOutdoorMap
                layers={DETAIL_LAYERS}
                tracks={[
                  {
                    id: selectedTrack.id,
                    name: selectedTrack.name,
                    points: selectedTrack.points,
                    color: selectedTrack.overlayStyle.color,
                    width: selectedTrack.overlayStyle.width,
                    opacity: 0.95,
                    visible: true,
                    showArrows: true,
                  },
                ]}
                waypoints={selectedTrack.waypoints}
                cursorPoint={hoverPoint}
                onSelectWaypoint={(wp) => {
                  setHoverPoint({ lat: wp.lat, lng: wp.lng, ele: wp.ele, timestamp: wp.timestamp });
                  setDetailTab('waypoints');
                }}
              />
            </div>

            {/* Header & Export Toolbar */}
            <div className="p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[#6B736E] dark:text-[#9BA39E]">
                    {selectedTrack.region} · {selectedTrack.isDemoData ? 'DEMO 示例轨迹' : '真实轨迹档案'} · 版本 {selectedTrack.versions.length}
                  </div>
                  <h2 className="text-lg sm:text-xl font-semibold mt-0.5">{selectedTrack.name}</h2>
                  {selectedTrack.description && (
                    <p className="text-xs sm:text-sm text-[#5C655F] dark:text-[#9BA39E] mt-1">
                      {selectedTrack.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadBlob(
                        new Blob([exportTrackToGpx(selectedTrack)], { type: 'application/gpx+xml' }),
                        `${selectedTrack.name}.gpx`
                      )
                    }
                    className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    GPX
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadBlob(
                        new Blob([exportTrackToGeoJson(selectedTrack)], { type: 'application/geo+json' }),
                        `${selectedTrack.name}.geojson`
                      )
                    }
                    className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    GeoJSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportZip}
                    className="min-h-[38px] px-3 rounded-xl bg-[#1E352B] text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <FileArchive className="w-3.5 h-3.5" />
                    导出 ZIP
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosterTrack(selectedTrack)}
                    className="min-h-[38px] px-3 rounded-xl bg-[#B84F24] text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    海报
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteTrack(selectedTrack.id)}
                    aria-label="删除轨迹"
                    className="min-h-[38px] min-w-[38px] rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-[#6B736E] hover:text-[#B84F24] inline-flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Linked Elevation & Speed Profile */}
              <div className="p-4 rounded-2xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#EAE5DC] dark:border-[#242D28]">
                <LinkedElevationChart
                  points={selectedTrack.points}
                  onHoverPoint={(pt) => setHoverPoint(pt)}
                />
              </div>

              {/* Detail Sub-tabs */}
              <div className="inline-flex items-center p-1 rounded-xl bg-[#EAE6DD] dark:bg-[#242D28] overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'overview', label: '数据与分段' },
                    { id: 'waypoints', label: `标注 (${selectedTrack.waypoints.length})` },
                    { id: 'photos', label: `照片关联 (${selectedTrack.photos.length})` },
                    { id: 'edit', label: '编辑与版本' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                      detailTab === t.id
                        ? 'bg-white dark:bg-[#141917] text-[#1A211E] dark:text-[#ECEAE4]'
                        : 'text-[#5C655F] dark:text-[#9BA39E]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Overview & Per-km Splits */}
              {detailTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-[#EAE5DC] dark:border-[#2A332E]">
                    <div>
                      <div className="text-xs text-[#6B736E]">总距离</div>
                      <div className="text-base font-semibold font-mono-tabular">
                        {(stats.distanceMeters / 1000).toFixed(2)} km
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6B736E]">运动 / 休息时间</div>
                      <div className="text-base font-semibold font-mono-tabular">
                        {formatDuration(stats.movingTimeMs)} / {formatDuration(stats.restTimeMs)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6B736E]">累计爬升 / 下降</div>
                      <div className="text-base font-semibold font-mono-tabular">
                        +{Math.round(stats.ascentMeters)} / -{Math.round(stats.descentMeters)} m
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6B736E]">均速 / 最快速度</div>
                      <div className="text-base font-semibold font-mono-tabular">
                        {formatSpeedKmh(stats.avgSpeedMps)} / {formatSpeedKmh(stats.maxSpeedMps)} km/h
                      </div>
                    </div>
                  </div>

                  {stats.splits.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-semibold text-[#5C655F] dark:text-[#9BA39E]">
                        每公里分段统计
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono-tabular">
                          <thead>
                            <tr className="text-left text-[#6B736E] border-b border-[#EAE5DC] dark:border-[#2A332E]">
                              <th className="py-2 pr-3">分段</th>
                              <th className="py-2 pr-3">距离</th>
                              <th className="py-2 pr-3">用时</th>
                              <th className="py-2 pr-3">爬升</th>
                              <th className="py-2">均速</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0ECE3] dark:divide-[#242D28]">
                            {stats.splits.map((sp) => (
                              <tr key={sp.kmIndex}>
                                <td className="py-2 pr-3">KM {sp.kmIndex}</td>
                                <td className="py-2 pr-3">{(sp.distanceMeters / 1000).toFixed(2)} km</td>
                                <td className="py-2 pr-3">{formatDuration(sp.durationMs)}</td>
                                <td className="py-2 pr-3">+{Math.round(sp.ascentMeters)} m</td>
                                <td className="py-2">{sp.avgSpeedKmh.toFixed(1)} km/h</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Waypoints Timeline & Creator */}
              {detailTab === 'waypoints' && (
                <div className="space-y-4">
                  <form
                    onSubmit={handleAddWaypoint}
                    className="p-3.5 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#EAE5DC] dark:border-[#242D28] space-y-2.5"
                  >
                    <div className="text-xs font-medium inline-flex items-center gap-1.5">
                      <Flag className="w-3.5 h-3.5 text-[#B84F24]" />
                      <span>在当前悬停曲线位置（或中点）新增标注</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={newWptType}
                        onChange={(e) => setNewWptType(e.target.value as WaypointType)}
                        className="min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] text-xs"
                      >
                        {(Object.keys(WAYPOINT_TYPE_LABELS) as WaypointType[]).map((t) => (
                          <option key={t} value={t}>
                            {WAYPOINT_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newWptName}
                        onChange={(e) => setNewWptName(e.target.value)}
                        placeholder="标注名称"
                        className="flex-1 min-w-[140px] min-h-[38px] px-2.5 rounded-lg bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] text-xs"
                      />
                      <button
                        type="submit"
                        className="min-h-[38px] px-3.5 rounded-lg bg-[#1E352B] text-white text-xs font-medium cursor-pointer"
                      >
                        添加标注
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newWptNote}
                      onChange={(e) => setNewWptNote(e.target.value)}
                      placeholder="标注文字说明（选填）"
                      className="w-full min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] text-xs"
                    />
                  </form>

                  <div className="divide-y divide-[#EAE5DC] dark:divide-[#242D28]">
                    {selectedTrack.waypoints.map((wp) => (
                      <div key={wp.id} className="py-3 flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">
                            {wp.name} · <span className="text-xs text-[#B84F24]">{WAYPOINT_TYPE_LABELS[wp.type]}</span>
                          </div>
                          {wp.note && (
                            <div className="text-xs text-[#5C655F] dark:text-[#9BA39E]">{wp.note}</div>
                          )}
                          <div className="text-[11px] font-mono-tabular text-[#6B736E]">
                            海拔 {Math.round(wp.ele)} m · 距起点 {(wp.distanceFromStartMeters / 1000).toFixed(2)} km · 距终点 {(wp.distanceToEndMeters / 1000).toFixed(2)} km
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteWaypoint(wp.id)}
                          aria-label="删除标注点"
                          className="p-2 text-[#6B736E] hover:text-[#B84F24] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Photo EXIF Auto-Matcher */}
              {detailTab === 'photos' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#EAE5DC] dark:border-[#242D28] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold inline-flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-[#B84F24]" />
                        <span>本地照片导入与 EXIF 轨迹自动关联</span>
                      </div>
                      <p className="text-[11px] text-[#6B736E] dark:text-[#9BA39E]">
                        自动解析拍摄时间与 GPS EXIF，本地生成缩略图并保留原图；无 GPS 或不确定匹配均需手动确认。
                      </p>
                    </div>
                    <div>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleUploadPhotos}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="min-h-[40px] px-3.5 rounded-xl bg-[#B84F24] text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>批量选择照片</span>
                      </button>
                    </div>
                  </div>

                  {selectedTrack.photos.length === 0 ? (
                    <div className="text-xs text-[#6B736E] py-6 text-center">
                      暂无关联照片，点击上方按钮从设备导入照片体验 EXIF 自动匹配。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedTrack.photos.map((photo) => (
                        <div
                          key={photo.id}
                          className="p-3 rounded-xl border border-[#EAE5DC] dark:border-[#2A332E] flex gap-3"
                        >
                          <img
                            src={photo.thumbnailDataUrl}
                            alt={photo.fileName}
                            className="w-20 h-20 rounded-lg object-cover shrink-0 bg-[#EFECE4]"
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="text-xs font-medium truncate">{photo.fileName}</div>
                            <div className="text-[11px] text-[#6B736E] font-mono-tabular">
                              {photo.matchConfidence === 'gps_time'
                                ? `EXIF GPS 距离轨迹 ${photo.matchedDistanceMeters ?? '--'} m`
                                : photo.matchConfidence === 'time_only'
                                  ? '无 GPS，按拍摄时间推荐位置'
                                  : '无时间/GPS EXIF，需手动关联'}
                            </div>
                            <div className="flex items-center gap-1.5 pt-1">
                              {!photo.confirmedByUser ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleConfirmPhoto(
                                      photo.id,
                                      selectedTrack.waypoints[0]?.id ?? null
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-[#1E352B] text-white text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  确认关联
                                </button>
                              ) : (
                                <span className="text-[11px] text-[#1E352B] dark:text-[#9CC0AD]">
                                  已确认本地保存
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(photo.id)}
                                className="text-[11px] text-[#6B736E] hover:text-[#B84F24] ml-auto cursor-pointer"
                              >
                                移除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Non-Destructive Track Editor & Version History */}
              {detailTab === 'edit' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs">
                      <span className="text-[#6B736E]">轨迹名称</span>
                      <input
                        type="text"
                        value={selectedTrack.name}
                        onChange={(e) => onSaveTrack({ ...selectedTrack, name: e.target.value })}
                        className="w-full min-h-[40px] px-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530]"
                      />
                    </label>
                    <label className="space-y-1 text-xs">
                      <span className="text-[#6B736E]">轨迹线条颜色</span>
                      <div className="flex items-center gap-2 min-h-[40px]">
                        <input
                          type="color"
                          value={selectedTrack.overlayStyle.color}
                          onChange={(e) =>
                            onSaveTrack({
                              ...selectedTrack,
                              overlayStyle: { ...selectedTrack.overlayStyle, color: e.target.value },
                            })
                          }
                          className="w-10 h-9 rounded border border-[#DFD9CE] cursor-pointer"
                        />
                        <span className="font-mono-tabular text-xs">{selectedTrack.overlayStyle.color}</span>
                      </div>
                    </label>
                  </div>

                  <label className="block space-y-1 text-xs">
                    <span className="text-[#6B736E]">文字总结与地理随笔</span>
                    <textarea
                      rows={2}
                      value={selectedTrack.description}
                      onChange={(e) => onSaveTrack({ ...selectedTrack, description: e.target.value })}
                      className="w-full p-3 rounded-xl bg-[#FAF8F4] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530]"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={selectedTrack.points.length <= 3}
                      onClick={() =>
                        applyPointsEdit(selectedTrack.points.slice(1), '裁剪起点 1 个冗余点')
                      }
                      className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      裁剪起点
                    </button>
                    <button
                      type="button"
                      disabled={selectedTrack.points.length <= 3}
                      onClick={() =>
                        applyPointsEdit(selectedTrack.points.slice(0, -1), '裁剪终点 1 个冗余点')
                      }
                      className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      裁剪终点
                    </button>
                    <button
                      type="button"
                      disabled={undoStack.length === 0}
                      onClick={handleUndoEdit}
                      className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      撤销
                    </button>
                    <button
                      type="button"
                      disabled={redoStack.length === 0}
                      onClick={handleRedoEdit}
                      className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Redo2 className="w-3.5 h-3.5" />
                      重做
                    </button>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[#EAE5DC] dark:border-[#2A332E]">
                    <div className="text-xs font-medium text-[#5C655F] inline-flex items-center gap-1">
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>版本历史（原始 GPS 数据独立保留，可随时恢复）</span>
                    </div>
                    <div className="space-y-1">
                      {selectedTrack.versions.map((ver) => (
                        <div
                          key={ver.id}
                          className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-[#FAF8F4] dark:bg-[#141917]"
                        >
                          <span>
                            {ver.summary} {ver.isOriginalRaw ? '（原始不可变）' : ''}
                          </span>
                          <span className="font-mono-tabular text-[#6B736E]">
                            {ver.points.length} 点
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      <SharePosterModal track={posterTrack} onClose={() => setPosterTrack(null)} />
    </div>
  );
};

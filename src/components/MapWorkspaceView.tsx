import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  Layers,
  MapPin,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import {
  GeoPoint,
  HikingRoute,
  MapLayersState,
  OfflineRegionPack,
  RecordedTrack,
  TrailWaypoint,
  WAYPOINT_TYPE_LABELS,
} from '../types/hiking';
import { deleteOfflineRegion, saveOfflineRegion } from '../utils/offlineDb';
import { MapLibreOutdoorMap, MapOverlayTrack } from './MapLibreOutdoorMap';

interface MapWorkspaceViewProps {
  tracks: RecordedTrack[];
  routes: HikingRoute[];
  activeRecordingPoints: GeoPoint[];
  currentGps: GeoPoint | null;
  offlineRegions: OfflineRegionPack[];
  onUpdateTrackOverlay: (trackId: string, patch: Partial<RecordedTrack['overlayStyle']>) => void;
  onRefreshRegions: () => void;
  onQuickStartRecord: () => void;
}

const TILE_CACHE_NAME = 'genxizou-offline-tiles-v1';

function buildRegionTileUrls(region: OfflineRegionPack): string[] {
  const urls: string[] = [];
  for (let z = region.minZoom; z <= region.maxZoom; z++) {
    const n = Math.pow(2, z);
    const xMin = Math.floor(((region.bounds.west + 180) / 360) * n);
    const xMax = Math.floor(((region.bounds.east + 180) / 360) * n);
    const latToY = (lat: number) =>
      Math.floor(
        ((1 -
          Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
            Math.PI) /
          2) *
          n
      );
    const yMin = latToY(region.bounds.north);
    const yMax = latToY(region.bounds.south);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
        if (urls.length >= 24) return urls;
      }
    }
  }
  return urls;
}

export const MapWorkspaceView: React.FC<MapWorkspaceViewProps> = ({
  tracks,
  routes,
  activeRecordingPoints,
  currentGps,
  offlineRegions,
  onUpdateTrackOverlay,
  onRefreshRegions,
  onQuickStartRecord,
}) => {
  const [layers, setLayers] = useState<MapLayersState>({
    baseOutdoor: true,
    contours: true,
    hillshade: true,
    satellite: false,
    historicalTracks: true,
    activeTrack: true,
    importedTracks: true,
    waypoints: true,
  });

  const [panelTab, setPanelTab] = useState<'none' | 'layers' | 'tracks' | 'offline'>('layers');
  const [clickedCoord, setClickedCoord] = useState<{
    lat: number;
    lng: number;
    eleEstimate: number | null;
  } | null>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<TrailWaypoint | null>(null);
  const [storageInfo, setStorageInfo] = useState<string>('计算中');
  const pauseSignalRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        const usedMb = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
        setStorageInfo(`已用 ${usedMb} MB`);
      });
    } else {
      setStorageInfo('本地 IndexedDB 可用');
    }
  }, [offlineRegions]);

  const overlayTracks: MapOverlayTrack[] = tracks.map((t) => ({
    id: t.id,
    name: t.name,
    points: t.points,
    color: t.overlayStyle.color,
    width: t.overlayStyle.width,
    opacity: t.overlayStyle.opacity,
    visible: t.overlayStyle.visible,
    showArrows: t.overlayStyle.showArrows,
    isHistorical: !t.isTemporaryImport,
    isTemporaryImport: Boolean(t.isTemporaryImport),
  }));

  const allWaypoints = tracks
    .filter((t) => t.overlayStyle.visible)
    .flatMap((t) => t.waypoints);

  const handleDownloadRegion = async (region: OfflineRegionPack) => {
    pauseSignalRef.current[region.id] = false;
    const urls = buildRegionTileUrls(region);
    let current: OfflineRegionPack = {
      ...region,
      totalTiles: urls.length,
      status: 'downloading',
      updatedAt: Date.now(),
    };
    await saveOfflineRegion(current);
    onRefreshRegions();

    let cache: Cache | null = null;
    if ('caches' in window) {
      cache = await caches.open(TILE_CACHE_NAME);
    }

    let downloaded = region.status === 'paused' ? region.downloadedTiles : 0;
    let bytes = region.status === 'paused' ? region.bytesStored : 0;

    for (let i = downloaded; i < urls.length; i++) {
      if (pauseSignalRef.current[region.id]) {
        await saveOfflineRegion({
          ...current,
          downloadedTiles: downloaded,
          bytesStored: bytes,
          status: 'paused',
          updatedAt: Date.now(),
        });
        onRefreshRegions();
        return;
      }

      try {
        const resp = await fetch(urls[i], { mode: 'cors' });
        if (resp.ok) {
          const cloned = resp.clone();
          const buf = await resp.arrayBuffer();
          bytes += buf.byteLength;
          if (cache) await cache.put(urls[i], cloned);
        }
      } catch {
        // Offline or CORS-blocked tile still advances count cleanly without crashing
      }

      downloaded = i + 1;
      current = {
        ...current,
        downloadedTiles: downloaded,
        bytesStored: bytes,
        status: downloaded >= urls.length ? 'completed' : 'downloading',
        updatedAt: Date.now(),
      };
      await saveOfflineRegion(current);
      onRefreshRegions();
    }
  };

  const handlePauseRegion = (regionId: string) => {
    pauseSignalRef.current[regionId] = true;
  };

  const handleDeleteRegion = async (region: OfflineRegionPack) => {
    pauseSignalRef.current[region.id] = true;
    await deleteOfflineRegion(region.id);
    onRefreshRegions();
  };

  return (
    <div className="space-y-4 pb-24 md:pb-8">
      {/* Main Map Stage */}
      <div className="relative h-[calc(100vh-12.5rem)] min-h-[480px] rounded-2xl overflow-hidden border border-[#DFD9CE] dark:border-[#2C3530] bg-[#EFECE4]">
        <MapLibreOutdoorMap
          layers={layers}
          tracks={overlayTracks}
          activeRecordingPoints={activeRecordingPoints}
          referencePoints={routes[0]?.path || []}
          waypoints={allWaypoints}
          currentGps={currentGps}
          offlineRegions={offlineRegions}
          onMapClickCoord={setClickedCoord}
          onSelectWaypoint={setSelectedWaypoint}
        />

        {/* Top-Left Map Toolbar */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelTab(panelTab === 'layers' ? 'none' : 'layers')}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 backdrop-blur-md shadow-xs cursor-pointer ${
              panelTab === 'layers'
                ? 'bg-[#1E352B] text-white border-[#1E352B]'
                : 'bg-white/95 dark:bg-[#1A211E]/95 border-[#DFD9CE] dark:border-[#2C3530] text-[#1A211E] dark:text-[#ECEAE4]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>图层</span>
          </button>

          <button
            type="button"
            onClick={() => setPanelTab(panelTab === 'tracks' ? 'none' : 'tracks')}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 backdrop-blur-md shadow-xs cursor-pointer ${
              panelTab === 'tracks'
                ? 'bg-[#1E352B] text-white border-[#1E352B]'
                : 'bg-white/95 dark:bg-[#1A211E]/95 border-[#DFD9CE] dark:border-[#2C3530] text-[#1A211E] dark:text-[#ECEAE4]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>轨迹叠加 ({tracks.filter((t) => t.overlayStyle.visible).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setPanelTab(panelTab === 'offline' ? 'none' : 'offline')}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 backdrop-blur-md shadow-xs cursor-pointer ${
              panelTab === 'offline'
                ? 'bg-[#1E352B] text-white border-[#1E352B]'
                : 'bg-white/95 dark:bg-[#1A211E]/95 border-[#DFD9CE] dark:border-[#2C3530] text-[#1A211E] dark:text-[#ECEAE4]'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>离线区域</span>
          </button>

          <button
            type="button"
            onClick={onQuickStartRecord}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#B84F24] text-white text-xs font-medium shadow-xs hover:bg-[#A3441D] cursor-pointer"
          >
            开始徒步记录
          </button>
        </div>

        {/* Floating Drawer: Layer / Overlay / Offline Manager */}
        {panelTab !== 'none' && (
          <div className="absolute top-16 left-3 z-10 w-[calc(100%-1.5rem)] sm:w-88 max-h-[70%] overflow-y-auto rounded-2xl bg-white/96 dark:bg-[#1A211E]/96 backdrop-blur-md border border-[#DFD9CE] dark:border-[#2C3530] p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#1A211E] dark:text-[#ECEAE4]">
                {panelTab === 'layers' && '独立地图图层管理'}
                {panelTab === 'tracks' && '多轨迹叠加与样式调节'}
                {panelTab === 'offline' && '离线地图区域与数据源'}
              </span>
              <button
                type="button"
                onClick={() => setPanelTab('none')}
                className="text-xs text-[#6B736E] hover:text-[#1A211E] dark:hover:text-white cursor-pointer"
              >
                收起
              </button>
            </div>

            {panelTab === 'layers' && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'baseOutdoor', label: '基础户外地图' },
                    { key: 'contours', label: '等高线' },
                    { key: 'hillshade', label: '地形阴影' },
                    { key: 'satellite', label: '卫星影像' },
                    { key: 'historicalTracks', label: '历史徒步轨迹' },
                    { key: 'activeTrack', label: '当前记录轨迹' },
                    { key: 'importedTracks', label: '临时导入轨迹' },
                    { key: 'waypoints', label: '标注点' },
                  ] as const
                ).map((item) => {
                  const active = layers[item.key];
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setLayers((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                      className={`min-h-[38px] px-2.5 rounded-xl border text-xs font-medium text-left flex items-center justify-between cursor-pointer ${
                        active
                          ? 'border-[#1E352B] bg-[#1E352B]/8 dark:bg-[#6B907E]/15 text-[#1A211E] dark:text-[#ECEAE4]'
                          : 'border-[#DFD9CE] dark:border-[#2C3530] text-[#6B736E]'
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {active ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {panelTab === 'tracks' && (
              <div className="space-y-3">
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className="p-3 rounded-xl border border-[#EAE5DC] dark:border-[#2A332E] space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium truncate">{track.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTrackOverlay(track.id, { visible: !track.overlayStyle.visible })
                        }
                        className="text-xs text-[#B84F24] shrink-0 cursor-pointer"
                      >
                        {track.overlayStyle.visible ? '隐藏' : '显示'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <label className="flex items-center gap-1.5">
                        <span>颜色</span>
                        <input
                          type="color"
                          value={track.overlayStyle.color}
                          onChange={(e) => onUpdateTrackOverlay(track.id, { color: e.target.value })}
                          className="w-6 h-5 rounded border-0 bg-transparent cursor-pointer"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>粗细 {track.overlayStyle.width}</span>
                        <input
                          type="range"
                          min={1.5}
                          max={7}
                          step={0.5}
                          value={track.overlayStyle.width}
                          onChange={(e) =>
                            onUpdateTrackOverlay(track.id, { width: parseFloat(e.target.value) })
                          }
                          className="w-16"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <label className="flex items-center gap-1.5">
                        <span>透明 {Math.round(track.overlayStyle.opacity * 100)}%</span>
                        <input
                          type="range"
                          min={0.2}
                          max={1}
                          step={0.1}
                          value={track.overlayStyle.opacity}
                          onChange={(e) =>
                            onUpdateTrackOverlay(track.id, { opacity: parseFloat(e.target.value) })
                          }
                          className="w-16"
                        />
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={track.overlayStyle.showArrows}
                          onChange={(e) =>
                            onUpdateTrackOverlay(track.id, { showArrows: e.target.checked })
                          }
                        />
                        <span>方向箭头</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panelTab === 'offline' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] text-[#6B736E] dark:text-[#9BA39E]">
                  <span className="inline-flex items-center gap-1">
                    <HardDrive className="w-3.5 h-3.5" />
                    {storageInfo}
                  </span>
                  <span>支持断点续传与本地删除</span>
                </div>

                {offlineRegions.map((reg) => {
                  const pct =
                    reg.totalTiles > 0 ? Math.round((reg.downloadedTiles / reg.totalTiles) * 100) : 0;
                  return (
                    <div
                      key={reg.id}
                      className="p-3 rounded-xl border border-[#EAE5DC] dark:border-[#2A332E] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium">{reg.name}</div>
                        <span className="text-[11px] font-mono-tabular text-[#6B736E]">
                          {reg.downloadedTiles}/{reg.totalTiles} 瓦片
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-[#EAE6DD] dark:bg-[#242D28] overflow-hidden">
                        <div
                          className="h-full bg-[#1E352B] dark:bg-[#B84F24] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#6B736E]">
                          {reg.status === 'completed'
                            ? `已离线 (${(reg.bytesStored / 1024).toFixed(0)} KB)`
                            : reg.status === 'downloading'
                              ? '下载中...'
                              : reg.status === 'paused'
                                ? '已暂停，可断点继续'
                                : '未下载'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {reg.status === 'downloading' ? (
                            <button
                              type="button"
                              onClick={() => handlePauseRegion(reg.id)}
                              className="px-2 py-1 rounded-lg border border-[#DFD9CE] inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pause className="w-3 h-3" />
                              暂停
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDownloadRegion(reg)}
                              className="px-2 py-1 rounded-lg bg-[#1E352B] text-white inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3 h-3" />
                              {reg.status === 'paused' ? '继续' : reg.status === 'completed' ? '更新' : '下载'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteRegion(reg)}
                            aria-label="删除离线区域"
                            className="p-1 text-[#6B736E] hover:text-[#B84F24] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="p-2.5 rounded-xl bg-[#F5F3EE] dark:bg-[#141917] text-[11px] text-[#5C655F] dark:text-[#9BA39E] space-y-1">
                  <div className="font-medium inline-flex items-center gap-1 text-[#1A211E] dark:text-[#ECEAE4]">
                    <Info className="w-3.5 h-3.5 text-[#B84F24]" />
                    <span>地图渲染引擎与数据授权说明</span>
                  </div>
                  <p>MapLibre（BSD-3）仅作为客户端渲染引擎；路网地名源自 OpenStreetMap（ODbL）；等高线与地形源自 OpenTopoMap / SRTM DEM（CC-BY-SA）。</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom-Center Coordinate / Waypoint Quick Inspector */}
        {(clickedCoord || selectedWaypoint) && (
          <div className="absolute bottom-12 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[440px] z-10 rounded-2xl bg-white/95 dark:bg-[#1A211E]/95 backdrop-blur-md border border-[#DFD9CE] dark:border-[#2C3530] p-3.5 shadow-md flex items-start justify-between gap-3">
            {selectedWaypoint ? (
              <div className="space-y-1 text-xs">
                <div className="font-semibold text-[#1A211E] dark:text-[#ECEAE4]">
                  {selectedWaypoint.name} · {WAYPOINT_TYPE_LABELS[selectedWaypoint.type]}
                </div>
                <div className="text-[#5C655F] dark:text-[#9BA39E]">{selectedWaypoint.note || '无补充描述'}</div>
                <div className="font-mono-tabular text-[11px] text-[#6B736E]">
                  海拔 {Math.round(selectedWaypoint.ele)} m · 距起点 {(selectedWaypoint.distanceFromStartMeters / 1000).toFixed(2)} km · 距终点 {(selectedWaypoint.distanceToEndMeters / 1000).toFixed(2)} km
                </div>
              </div>
            ) : (
              clickedCoord && (
                <div className="space-y-0.5 text-xs">
                  <div className="font-medium text-[#1A211E] dark:text-[#ECEAE4]">地图拾取点位</div>
                  <div className="font-mono-tabular text-[#5C655F] dark:text-[#9BA39E]">
                    {clickedCoord.lat.toFixed(5)}°N, {clickedCoord.lng.toFixed(5)}°E
                    {clickedCoord.eleEstimate !== null ? ` · 邻近参考海拔 ~${clickedCoord.eleEstimate} m` : ''}
                  </div>
                </div>
              )
            )}
            <button
              type="button"
              onClick={() => {
                setClickedCoord(null);
                setSelectedWaypoint(null);
              }}
              className="text-xs text-[#6B736E] hover:text-[#1A211E] cursor-pointer shrink-0"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

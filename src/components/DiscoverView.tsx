import React, { useState } from 'react';
import { Code2, Compass, Copy, ExternalLink, MapPin, Navigation } from 'lucide-react';
import { DIFFICULTY_LABEL } from '../data/routes';
import { ANDROID_SOURCE_FILES } from '../data/androidSourceCatalog';
import { HikingRoute } from '../types/hiking';

interface DiscoverViewProps {
  routes: HikingRoute[];
  cachedRouteIds: Set<string>;
  onToggleCache: (routeId: string) => void;
  onSelectRoute: (route: HikingRoute) => void;
  onLoadToMap: (route: HikingRoute) => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  routes,
  cachedRouteIds,
  onToggleCache,
  onSelectRoute,
  onLoadToMap,
}) => {
  const [subView, setSubView] = useState<'routes' | 'architecture'>('routes');
  const [navTargetRoute, setNavTargetRoute] = useState<HikingRoute>(routes[0]);
  const [copiedCoord, setCopiedCoord] = useState(false);
  const [selectedFile, setSelectedFile] = useState(ANDROID_SOURCE_FILES[0]);

  const trailhead = navTargetRoute.waypoints[0] || navTargetRoute.path[0];

  const handleCopyCoord = async () => {
    try {
      await navigator.clipboard.writeText(`${trailhead.lat.toFixed(6)}, ${trailhead.lng.toFixed(6)}`);
      setCopiedCoord(true);
      window.setTimeout(() => setCopiedCoord(false), 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="space-y-6 pb-24 md:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">发现路线与导航协同</h1>
          <p className="text-xs sm:text-sm text-[#6B736E] dark:text-[#9BA39E] mt-0.5">
            公开徒步路线浏览、外部道路导航衔接，以及 React Native / Android 原生工程架构文档
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#EAE6DD] dark:bg-[#242D28] self-start">
          <button
            type="button"
            onClick={() => setSubView('routes')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium cursor-pointer ${
              subView === 'routes'
                ? 'bg-white dark:bg-[#141917] text-[#1A211E] dark:text-[#ECEAE4]'
                : 'text-[#5C655F] dark:text-[#9BA39E]'
            }`}
          >
            路线与外部导航
          </button>
          <button
            type="button"
            onClick={() => setSubView('architecture')}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1 cursor-pointer ${
              subView === 'architecture'
                ? 'bg-white dark:bg-[#141917] text-[#1A211E] dark:text-[#ECEAE4]'
                : 'text-[#5C655F] dark:text-[#9BA39E]'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            原生架构与源码
          </button>
        </div>
      </div>

      {subView === 'routes' ? (
        <div className="space-y-6">
          {/* Curated Routes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {routes.map((route) => {
              const isCached = cachedRouteIds.has(route.id);
              return (
                <article
                  key={route.id}
                  className="rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] overflow-hidden flex flex-col"
                >
                  <div
                    onClick={() => onSelectRoute(route)}
                    className="relative aspect-[16/10] bg-[#242E29] cursor-pointer"
                  >
                    <img
                      src={route.imageUrl}
                      alt={route.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white text-xs">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {route.region}
                      </span>
                      <span className="font-mono-tabular">夕照 {route.sunsetWindow}</span>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => onSelectRoute(route)}
                          className="text-left text-lg font-semibold hover:text-[#B84F24] cursor-pointer"
                        >
                          {route.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleCache(route.id)}
                          className="text-xs text-[#5C655F] dark:text-[#9BA39E] hover:text-[#1E352B] shrink-0 cursor-pointer"
                        >
                          {isCached ? '已离线缓存' : '缓存离线'}
                        </button>
                      </div>
                      <div className="text-xs text-[#6B736E] dark:text-[#9BA39E] mt-1">
                        {DIFFICULTY_LABEL[route.difficulty]} · {route.distanceKm} km · +{route.ascentMeters} m · 最高 {route.maxAltitudeMeters} m
                      </div>
                      <p className="text-sm text-[#4C544F] dark:text-[#B4BCB7] mt-2 line-clamp-2">
                        {route.summary}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-[#EAE5DC] dark:border-[#2A332E]">
                      <button
                        type="button"
                        onClick={() => onLoadToMap(route)}
                        className="flex-1 min-h-[40px] rounded-xl bg-[#1E352B] text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>离线轨迹叠加地图</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNavTargetRoute(route)}
                        className="min-h-[40px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs font-medium cursor-pointer"
                      >
                        前往登山口
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* External Road Navigation Handoff (Section 10) */}
          <section className="rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold inline-flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 text-[#B84F24]" />
                  <span>外部道路导航衔接：{navTargetRoute.title} 起点</span>
                </h2>
                <p className="text-xs text-[#6B736E] dark:text-[#9BA39E] mt-0.5">
                  外部地图仅用于驾车/公交抵达山脚登山口；进入山野无公路路段后，请切换回「跟夕走」沿离线 GPX 轨迹徒步导航。
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyCoord}
                className="min-h-[38px] px-3 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs font-mono-tabular inline-flex items-center gap-1.5 self-start cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>
                  {copiedCoord
                    ? '已复制坐标'
                    : `${trailhead.lat.toFixed(5)}, ${trailhead.lng.toFixed(5)}`}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                {
                  name: '高德地图（道路）',
                  url: `https://uri.amap.com/marker?position=${trailhead.lng},${trailhead.lat}&name=${encodeURIComponent(navTargetRoute.title)}`,
                },
                {
                  name: '百度地图（道路）',
                  url: `https://api.map.baidu.com/marker?location=${trailhead.lat},${trailhead.lng}&title=${encodeURIComponent(navTargetRoute.title)}&output=html`,
                },
                {
                  name: '腾讯地图（道路）',
                  url: `https://apis.map.qq.com/uri/v1/marker?marker=coord:${trailhead.lat},${trailhead.lng};title:${encodeURIComponent(navTargetRoute.title)}`,
                },
                {
                  name: 'Apple 地图',
                  url: `https://maps.apple.com/?ll=${trailhead.lat},${trailhead.lng}&q=${encodeURIComponent(navTargetRoute.title)}`,
                },
                {
                  name: 'Google Maps',
                  url: `https://www.google.com/maps/search/?api=1&query=${trailhead.lat},${trailhead.lng}`,
                },
              ].map((ext) => (
                <a
                  key={ext.name}
                  href={ext.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-3.5 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#F5F3EE] dark:hover:bg-[#232C28]"
                >
                  <span>{ext.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#6B736E]" />
                </a>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] p-5 text-xs space-y-2 leading-relaxed">
            <div className="text-sm font-semibold">原生工程目录：native-rn/（React Native Expo）与 android/（Kotlin Compose）</div>
            <p className="text-[#5C655F] dark:text-[#9BA39E]">
              代码库同步维护了 <span className="font-mono-tabular">native-rn/</span>（Expo Development Build + MapLibre Native + SQLite WAL + Background Location Task）与 <span className="font-mono-tabular">android/</span>（原生 Kotlin Jetpack Compose），下方可查阅核心模块源码。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-4 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] max-h-[460px] overflow-y-auto divide-y divide-[#F0ECE3] dark:divide-[#242D28]">
              {ANDROID_SOURCE_FILES.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-4 py-3 text-xs cursor-pointer ${
                    selectedFile.path === file.path
                      ? 'bg-[#F5F3EE] dark:bg-[#232C28] font-semibold'
                      : ''
                  }`}
                >
                  <div className="font-mono-tabular truncate">{file.path.split('/').pop()}</div>
                  <div className="text-[11px] text-[#6B736E] truncate mt-0.5">{file.summary}</div>
                </button>
              ))}
            </div>
            <div className="lg:col-span-8 rounded-2xl border border-[#DFD9CE] dark:border-[#2C3530] bg-[#181E1B] text-[#E6E3DC] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 text-xs font-mono-tabular text-[#D3CFC6]">
                {selectedFile.path}
              </div>
              <pre className="p-4 text-xs font-mono-tabular overflow-x-auto max-h-[460px]">
                <code>{selectedFile.content}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

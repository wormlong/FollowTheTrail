import React from 'react';
import { Check, Download, Navigation, X } from 'lucide-react';
import { DIFFICULTY_LABEL } from '../data/routes';
import { HikingRoute } from '../types/hiking';
import { LinkedElevationChart } from './LinkedElevationChart';
import { TopoMapCanvas } from './TopoMapCanvas';

interface RouteDetailModalProps {
  route: HikingRoute | null;
  isCached: boolean;
  onToggleCache: (routeId: string) => void;
  onClose: () => void;
  onStartHike: (route: HikingRoute) => void;
}

export const RouteDetailModal: React.FC<RouteDetailModalProps> = ({
  route,
  isCached,
  onToggleCache,
  onClose,
  onStartHike,
}) => {
  if (!route) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#F5F3EE] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530] shadow-xl"
      >
        <div className="sm:hidden w-10 h-1.5 bg-[#CFC9BC] dark:bg-[#3A453F] rounded-full mx-auto my-3" />

        <div className="px-5 sm:px-6 pt-2 sm:pt-5 pb-4 flex items-start justify-between gap-4 border-b border-[#DFD9CE] dark:border-[#2A332E]">
          <div>
            <div className="text-xs text-[#6B736E] dark:text-[#9BA39E]">
              {route.region} · {DIFFICULTY_LABEL[route.difficulty]} · 夕照窗口 {route.sunsetWindow}
            </div>
            <h2 className="text-xl font-semibold text-[#1A211E] dark:text-[#ECEAE4] mt-1">
              {route.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭路线详情"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-[#5C655F] hover:bg-[#EAE6DD] dark:hover:bg-[#222B26] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* Topo Map Preview */}
          <div className="h-56 sm:h-64 rounded-2xl overflow-hidden border border-[#DFD9CE] dark:border-[#2C3530]">
            <TopoMapCanvas
              referencePath={route.path}
              waypoints={route.waypoints}
            />
          </div>

          {/* 4 Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530]">
            <div>
              <div className="text-xs text-[#6B736E] dark:text-[#8F9893]">里程</div>
              <div className="text-base font-semibold font-mono-tabular mt-0.5">{route.distanceKm.toFixed(1)} km</div>
            </div>
            <div>
              <div className="text-xs text-[#6B736E] dark:text-[#8F9893]">累计爬升</div>
              <div className="text-base font-semibold font-mono-tabular mt-0.5">+{route.ascentMeters} m</div>
            </div>
            <div>
              <div className="text-xs text-[#6B736E] dark:text-[#8F9893]">海拔范围</div>
              <div className="text-base font-semibold font-mono-tabular mt-0.5">
                {route.minAltitudeMeters}–{route.maxAltitudeMeters} m
              </div>
            </div>
            <div>
              <div className="text-xs text-[#6B736E] dark:text-[#8F9893]">预计耗时</div>
              <div className="text-base font-semibold font-mono-tabular mt-0.5">{route.durationHours} h</div>
            </div>
          </div>

          {/* Elevation Profile */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530] space-y-2">
            <div className="text-xs font-medium text-[#5C655F] dark:text-[#9BA39E]">路线海拔剖面</div>
            <LinkedElevationChart points={route.path} showSpeedCurve={false} height={116} />
          </div>

          {/* Waypoints */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-[#1A211E] dark:text-[#ECEAE4]">沿途关键路标</h3>
            <div className="divide-y divide-[#EAE5DC] dark:divide-[#2A332E] rounded-2xl bg-white dark:bg-[#1A211E] border border-[#DFD9CE] dark:border-[#2C3530]">
              {route.waypoints.map((wp) => (
                <div key={wp.id} className="p-3.5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[#1A211E] dark:text-[#ECEAE4]">{wp.name}</div>
                    <div className="text-xs text-[#6B736E] dark:text-[#9BA39E] mt-0.5">{wp.note}</div>
                  </div>
                  <div className="text-xs font-mono-tabular text-[#5C655F] dark:text-[#9BA39E] shrink-0">
                    {wp.ele} m
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onToggleCache(route.id)}
              className="min-h-[48px] px-4 rounded-xl border border-[#DFD9CE] dark:border-[#2C3530] bg-white dark:bg-[#1A211E] text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isCached ? <Check className="w-4 h-4 text-[#1E352B] dark:text-[#7FA892]" /> : <Download className="w-4 h-4" />}
              <span>{isCached ? '已存离线包' : '缓存离线'}</span>
            </button>
            <button
              type="button"
              onClick={() => onStartHike(route)}
              className="flex-1 min-h-[48px] px-5 rounded-xl bg-[#B84F24] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#A3441D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Navigation className="w-4 h-4" />
              <span>加载到地图并开始记录</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

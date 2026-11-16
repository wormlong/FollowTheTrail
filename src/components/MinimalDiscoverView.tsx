import React from 'react';
import { MapPin } from 'lucide-react';
import { DIFFICULTY_LABEL } from '../data/routes';
import { HikingRoute } from '../types/hiking';

interface MinimalDiscoverViewProps {
  routes: HikingRoute[];
  onSelectRoute: (route: HikingRoute) => void;
  onOpenOnMap: (route: HikingRoute) => void;
}

export const MinimalDiscoverView: React.FC<MinimalDiscoverViewProps> = ({
  routes,
  onSelectRoute,
  onOpenOnMap,
}) => {
  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24 md:pb-10">
      <div>
        <h1 className="text-xl font-semibold text-[#1A211E] dark:text-[#ECEAE4]">发现路线</h1>
        <p className="text-xs text-[#5C655F] dark:text-[#9BA39E] mt-0.5">
          轻装徒步路线参考，点击载入地图
        </p>
      </div>

      <div className="divide-y divide-[#E4DFD5] dark:divide-[#27312C] rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E]">
        {routes.map((route) => (
          <div
            key={route.id}
            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <button
              type="button"
              onClick={() => onSelectRoute(route)}
              className="text-left space-y-1 cursor-pointer"
            >
              <div className="text-base font-semibold text-[#1A211E] dark:text-[#ECEAE4] hover:text-[#1E352B]">
                {route.title}
              </div>
              <div className="text-xs text-[#5C655F] dark:text-[#9BA39E] font-mono-tabular">
                {route.region} · {DIFFICULTY_LABEL[route.difficulty]} · {route.distanceKm.toFixed(1)} km · +{route.ascentMeters} m
              </div>
            </button>

            <button
              type="button"
              onClick={() => onOpenOnMap(route)}
              className="min-h-[40px] px-3.5 rounded-lg border border-[#DFD9CE] dark:border-[#2B3530] text-xs font-medium inline-flex items-center gap-1.5 self-start sm:self-auto hover:bg-[#F5F3EE] dark:hover:bg-[#232C28] whitespace-nowrap cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[#1E352B] dark:text-[#9CC0AD]" />
              <span>在地图查看</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

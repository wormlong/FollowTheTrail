import React, { useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { ANDROID_SOURCE_FILES } from '../data/androidSourceCatalog';
import { GeoPoint, RecordedTrack } from '../types/hiking';
import { MeArchiveSafetyView } from './MeArchiveSafetyView';
import { TracksWorkspaceView } from './TracksWorkspaceView';

interface MinimalMeViewProps {
  tracks: RecordedTrack[];
  currentGps: GeoPoint | null;
  initialSection?: 'menu' | 'tracks' | 'archive' | 'native';
  onSaveTrack: (track: RecordedTrack) => void;
  onImportTrack: (track: RecordedTrack) => void;
  onDeleteTrack: (trackId: string) => void;
}

export const MinimalMeView: React.FC<MinimalMeViewProps> = ({
  tracks,
  currentGps,
  initialSection = 'menu',
  onSaveTrack,
  onImportTrack,
  onDeleteTrack,
}) => {
  const [section, setSection] = useState<'menu' | 'tracks' | 'archive' | 'native'>(initialSection);
  const [selectedFile, setSelectedFile] = useState(ANDROID_SOURCE_FILES[0]);

  if (section === 'tracks') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSection('menu')}
          className="min-h-[40px] inline-flex items-center gap-1.5 text-sm font-medium text-[#1E352B] dark:text-[#9CC0AD] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回我的</span>
        </button>
        <TracksWorkspaceView
          tracks={tracks}
          onSaveTrack={onSaveTrack}
          onImportTrack={onImportTrack}
          onDeleteTrack={onDeleteTrack}
        />
      </div>
    );
  }

  if (section === 'archive') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSection('menu')}
          className="min-h-[40px] inline-flex items-center gap-1.5 text-sm font-medium text-[#1E352B] dark:text-[#9CC0AD] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回我的</span>
        </button>
        <MeArchiveSafetyView tracks={tracks} currentGps={currentGps} />
      </div>
    );
  }

  if (section === 'native') {
    return (
      <div className="space-y-4 pb-24">
        <button
          type="button"
          onClick={() => setSection('menu')}
          className="min-h-[40px] inline-flex items-center gap-1.5 text-sm font-medium text-[#1E352B] dark:text-[#9CC0AD] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回我的</span>
        </button>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-4 rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E] max-h-[460px] overflow-y-auto divide-y divide-[#F0ECE3] dark:divide-[#242D28]">
            {ANDROID_SOURCE_FILES.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-4 py-3 text-xs cursor-pointer ${
                  selectedFile.path === file.path ? 'bg-[#F5F3EE] dark:bg-[#232C28] font-semibold' : ''
                }`}
              >
                <div className="font-mono-tabular truncate">{file.path}</div>
                <div className="text-[11px] text-[#6B736E] truncate mt-0.5">{file.summary}</div>
              </button>
            ))}
          </div>
          <div className="lg:col-span-8 rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-[#181E1B] text-[#E6E3DC] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 text-xs font-mono-tabular text-[#D3CFC6]">
              {selectedFile.path}
            </div>
            <pre className="p-4 text-xs font-mono-tabular overflow-x-auto max-h-[460px]">
              <code>{selectedFile.content}</code>
            </pre>
          </div>
        </div>
      </div>
    );
  }

  const totalKm = tracks.reduce((sum, t) => sum + t.distanceMeters / 1000, 0);

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24 md:pb-10">
      <div>
        <h1 className="text-xl font-semibold text-[#1A211E] dark:text-[#ECEAE4]">我的</h1>
        <p className="text-xs text-[#5C655F] dark:text-[#9BA39E] mt-0.5">
          累计记录 {tracks.length} 条轨迹 · {totalKm.toFixed(1)} km
        </p>
      </div>

      <div className="divide-y divide-[#E4DFD5] dark:divide-[#27312C] rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E]">
        {[
          { id: 'tracks', title: '历史轨迹与照片关联', sub: '查看详情、海拔联动、导入导出 GPX / ZIP' },
          { id: 'archive', title: '户外档案与安全设置', sub: '累计统计、照片墙、SOS 联系人与装备清单' },
          { id: 'native', title: '原生工程源码（native-rn / android）', sub: 'React Native + MapLibre Native + SQLite 实现' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id as 'tracks' | 'archive' | 'native')}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-[#FAF8F4] dark:hover:bg-[#232C28] cursor-pointer"
          >
            <div>
              <div className="text-sm font-semibold text-[#1A211E] dark:text-[#ECEAE4]">
                {item.title}
              </div>
              <div className="text-xs text-[#5C655F] dark:text-[#9BA39E] mt-0.5">{item.sub}</div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#78807B] shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

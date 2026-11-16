import React, { useRef, useState } from 'react';
import { MapPin, Trash2, Upload } from 'lucide-react';
import { RecordedTrack } from '../types/hiking';
import { parseTrackFile } from '../utils/elevationMath';
import { importFollowTheTrailZip } from '../utils/zipArchive';

interface MinimalDiscoverViewProps {
  importedTracks: RecordedTrack[];
  onImportTrack: (track: RecordedTrack) => void;
  onDeleteTrack: (trackId: string) => void;
  onOpenOnMap: (track: RecordedTrack) => void;
}

export const MinimalDiscoverView: React.FC<MinimalDiscoverViewProps> = ({
  importedTracks,
  onImportTrack,
  onDeleteTrack,
  onOpenOnMap,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const importedZip = await importFollowTheTrailZip(file);
        if (importedZip) {
          const asImported: RecordedTrack = {
            ...importedZip,
            isTemporaryImport: true,
            region: '导入轨迹',
          };
          onImportTrack(asImported);
          setNotice(`已导入轨迹「${asImported.name}」（${asImported.points.length} 个点）`);
        } else {
          setNotice('ZIP 轨迹解析失败，请确认压缩包内含有效 track.gpx');
        }
        e.target.value = '';
        return;
      }

      const text = await file.text();
      const parsed = parseTrackFile(file.name, text);
      if (parsed) {
        const asImported: RecordedTrack = {
          ...parsed,
          isTemporaryImport: true,
        };
        onImportTrack(asImported);
        setNotice(`已导入轨迹「${asImported.name}」（${asImported.points.length} 个点）`);
      } else {
        setNotice('轨迹文件解析失败，支持 GPX / KML / GeoJSON / ZIP');
      }
    } catch {
      setNotice('读取文件失败，请重试');
    }
    e.target.value = '';
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-24 md:pb-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1A211E] dark:text-[#ECEAE4]">
            我导入的轨迹
          </h1>
          <p className="text-xs text-[#5C655F] dark:text-[#9BA39E] mt-0.5">
            导入外部 GPX / KML / GeoJSON 轨迹，点击载入记录地图参考
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gpx,.kml,.geojson,.json,.zip"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E] text-xs font-semibold text-[#1E352B] dark:text-[#9CC0AD] inline-flex items-center gap-1.5 hover:bg-[#FAF8F4] dark:hover:bg-[#232C28] whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入轨迹</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E] px-3.5 py-2 text-xs text-[#1E352B] dark:text-[#9CC0AD]">
          {notice}
        </div>
      )}

      {importedTracks.length === 0 ? (
        <div className="rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E] p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-[#1A211E] dark:text-[#ECEAE4]">
            暂无导入的轨迹
          </div>
          <p className="text-xs text-[#5C655F] dark:text-[#9BA39E]">
            点击「导入轨迹」选择本地 GPX / KML / GeoJSON 文件，即可在地图中作为参考路线叠加坡度与走势。
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl bg-[#1E352B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>选择轨迹文件导入</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-[#E4DFD5] dark:divide-[#27312C] rounded-xl border border-[#DFD9CE] dark:border-[#2B3530] bg-white dark:bg-[#1A211E]">
          {importedTracks.map((track) => (
            <div
              key={track.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <button
                type="button"
                onClick={() => onOpenOnMap(track)}
                className="text-left space-y-1 cursor-pointer flex-1 min-w-0"
              >
                <div className="text-base font-semibold text-[#1A211E] dark:text-[#ECEAE4] hover:text-[#1E352B] truncate">
                  {track.name}
                </div>
                <div className="text-xs text-[#5C655F] dark:text-[#9BA39E] font-mono-tabular">
                  {(track.distanceMeters / 1000).toFixed(2)} km · +{Math.round(track.ascentMeters)} m ·{' '}
                  {track.points.length} 点 · {new Date(track.startedAt).toLocaleDateString('zh-CN')}
                </div>
              </button>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => onOpenOnMap(track)}
                  className="min-h-[40px] px-3.5 rounded-lg border border-[#DFD9CE] dark:border-[#2B3530] text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#F5F3EE] dark:hover:bg-[#232C28] whitespace-nowrap cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#1E352B] dark:text-[#9CC0AD]" />
                  <span>在地图查看</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTrack(track.id)}
                  aria-label={`删除 ${track.name}`}
                  className="min-h-[40px] min-w-[40px] rounded-lg border border-[#DFD9CE] dark:border-[#2B3530] text-[#6B736E] hover:text-[#B84F24] inline-flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

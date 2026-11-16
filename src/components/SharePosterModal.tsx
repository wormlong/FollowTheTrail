import React, { useEffect, useRef, useState } from 'react';
import { Download, EyeOff, X } from 'lucide-react';
import { RecordedTrack } from '../types/hiking';
import { formatDuration } from '../utils/elevationMath';

interface SharePosterModalProps {
  track: RecordedTrack | null;
  onClose: () => void;
}

type PosterStyle = 'map' | 'story' | 'stats';

export const SharePosterModal: React.FC<SharePosterModalProps> = ({ track, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [style, setStyle] = useState<PosterStyle>('map');
  const [hideExactCoords, setHideExactCoords] = useState(true);
  const [hidePhotos, setHidePhotos] = useState(false);
  const [hidePersonalNote, setHidePersonalNote] = useState(false);

  useEffect(() => {
    if (!track || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 900;
    const H = 1280;
    canvas.width = W;
    canvas.height = H;

    // Restrained paper canvas
    const isDark = style === 'stats';
    ctx.fillStyle = isDark ? '#141917' : '#F5F3EE';
    ctx.fillRect(0, 0, W, H);

    // Subtle border frame
    ctx.strokeStyle = isDark ? '#2A332E' : '#DFD9CE';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, H - 72);

    // Header brand
    ctx.fillStyle = isDark ? '#9BA39E' : '#5C655F';
    ctx.font = '500 22px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
    ctx.fillText('跟夕走 · FOLLOW THE TRAIL', 72, 92);

    const dateStr = new Date(track.startedAt).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, W - 72, 92);
    ctx.textAlign = 'left';

    // Track Title
    ctx.fillStyle = isDark ? '#ECEAE4' : '#1A211E';
    ctx.font = '600 42px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
    ctx.fillText(track.name.slice(0, 22), 72, 162);

    ctx.fillStyle = isDark ? '#9BA39E' : '#5C655F';
    ctx.font = '400 22px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
    const startLabel = hideExactCoords
      ? `${track.region || '户外山区'} · 坐标已脱敏`
      : `起点 ${track.points[0]?.lat.toFixed(4)}°N, ${track.points[0]?.lng.toFixed(4)}°E`;
    ctx.fillText(startLabel, 72, 204);

    // Map / Route Trace Box
    const boxX = 72;
    const boxY = 240;
    const boxW = W - 144;
    const boxH = style === 'story' ? 430 : 540;

    ctx.fillStyle = isDark ? '#1A211E' : '#EFECE4';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = isDark ? '#2C3530' : '#DFD9CE';
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Contour rings inside poster
    ctx.strokeStyle = isDark ? 'rgba(130,152,138,0.16)' : 'rgba(138,126,102,0.22)';
    ctx.lineWidth = 1.5;
    for (let r = 1; r <= 6; r++) {
      ctx.beginPath();
      ctx.ellipse(boxX + boxW * 0.52, boxY + boxH * 0.48, r * 62, r * 42, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw route trace
    if (track.points.length >= 2) {
      const minLat = Math.min(...track.points.map((p) => p.lat));
      const maxLat = Math.max(...track.points.map((p) => p.lat), minLat + 0.001);
      const minLng = Math.min(...track.points.map((p) => p.lng));
      const maxLng = Math.max(...track.points.map((p) => p.lng), minLng + 0.001);

      ctx.strokeStyle = track.overlayStyle.color || '#B84F24';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      track.points.forEach((pt, idx) => {
        const px = boxX + 70 + ((pt.lng - minLng) / (maxLng - minLng)) * (boxW - 140);
        const py = boxY + boxH - 70 - ((pt.lat - minLat) / (maxLat - minLat)) * (boxH - 140);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Photo thumbnail preview if story style and allowed
    const firstPhoto = !hidePhotos ? track.photos[0] : null;
    if (style === 'story' && firstPhoto?.thumbnailDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, boxX, boxY + boxH + 28, 220, 165);
      };
      img.src = firstPhoto.thumbnailDataUrl;
    }

    // Telemetry grid
    const statsY = style === 'story' ? 890 : 850;
    const metrics = [
      { label: '徒步距离', value: `${(track.distanceMeters / 1000).toFixed(2)} km` },
      { label: '运动用时', value: formatDuration(track.movingTimeMs) },
      { label: '累计爬升', value: `+${Math.round(track.ascentMeters)} m` },
      { label: '最高海拔', value: `${Math.round(track.maxAltitudeMeters)} m` },
    ];

    metrics.forEach((m, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const mx = 72 + col * 390;
      const my = statsY + row * 116;

      ctx.fillStyle = isDark ? '#9BA39E' : '#6B736E';
      ctx.font = '400 22px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
      ctx.fillText(m.label, mx, my);

      ctx.fillStyle = isDark ? '#ECEAE4' : '#1A211E';
      ctx.font = '600 44px "JetBrains Mono", monospace';
      ctx.fillText(m.value, mx, my + 52);
    });

    // Note footer
    if (!hidePersonalNote && (track.notes[0]?.body || track.description)) {
      ctx.fillStyle = isDark ? '#B4BCB7' : '#4C544F';
      ctx.font = '400 22px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
      const noteText = (track.notes[0]?.body || track.description).slice(0, 48);
      ctx.fillText(`“${noteText}”`, 72, H - 108);
    }

    ctx.fillStyle = isDark ? '#6E7772' : '#8A8377';
    ctx.font = '400 18px "Plus Jakarta Sans", "Noto Sans SC", sans-serif';
    ctx.fillText('地图记录我们走过的路，照片和文字保存我们经历过的生活。', 72, H - 64);
  }, [track, style, hideExactCoords, hidePhotos, hidePersonalNote]);

  if (!track) return null;

  const handleSavePng = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.name.replace(/\s+/g, '_')}_${style}.png`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#F5F3EE] dark:bg-[#141917] border border-[#DFD9CE] dark:border-[#2C3530] p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">生成徒步记忆海报</h3>
            <p className="text-xs text-[#6B736E] dark:text-[#9BA39E]">
              支持三种克制户外版式与坐标隐私脱敏导出
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭海报弹窗"
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-[#EAE6DD] dark:hover:bg-[#232C28] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          <div className="md:col-span-7 flex justify-center bg-[#EAE6DD] dark:bg-[#1B221F] rounded-2xl p-4">
            <canvas ref={canvasRef} className="w-full max-w-[340px] h-auto rounded-lg shadow-sm" />
          </div>

          <div className="md:col-span-5 space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#5C655F] dark:text-[#9BA39E]">选择海报版式</div>
              <div className="grid grid-cols-1 gap-2">
                {(
                  [
                    { id: 'map', label: '地图路线版' },
                    { id: 'story', label: '摄影故事版' },
                    { id: 'stats', label: '数据统计版（深色）' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStyle(item.id)}
                    className={`min-h-[42px] px-3.5 rounded-xl border text-left text-sm font-medium cursor-pointer ${
                      style === item.id
                        ? 'border-[#B84F24] bg-white dark:bg-[#1A211E] text-[#1A211E] dark:text-[#ECEAE4]'
                        : 'border-[#DFD9CE] dark:border-[#2C3530] text-[#5C655F] dark:text-[#9BA39E]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-[#DFD9CE] dark:border-[#2C3530]">
              <div className="text-xs font-medium text-[#5C655F] dark:text-[#9BA39E] inline-flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5" />
                <span>分享隐私选项</span>
              </div>
              <label className="flex items-center justify-between text-xs cursor-pointer py-1">
                <span>隐藏精确起终点坐标</span>
                <input
                  type="checkbox"
                  checked={hideExactCoords}
                  onChange={(e) => setHideExactCoords(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-xs cursor-pointer py-1">
                <span>隐藏个人照片</span>
                <input
                  type="checkbox"
                  checked={hidePhotos}
                  onChange={(e) => setHidePhotos(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-xs cursor-pointer py-1">
                <span>隐藏文字笔记</span>
                <input
                  type="checkbox"
                  checked={hidePersonalNote}
                  onChange={(e) => setHidePersonalNote(e.target.checked)}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleSavePng}
              className="w-full min-h-[48px] rounded-xl bg-[#B84F24] text-white text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-[#A3441D] cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>保存高清 PNG 海报</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useEffect, useState } from 'react';
import { Compass, Moon, Navigation, Sun, User } from 'lucide-react';
import { MinimalDiscoverView } from './components/MinimalDiscoverView';
import { MinimalMeView } from './components/MinimalMeView';
import { MinimalRecordView } from './components/MinimalRecordView';
import { AppTab, GeoPoint, RecordedTrack } from './types/hiking';
import {
  deleteOfflineTrack,
  getAllOfflineTracks,
  saveOfflineTrack,
} from './utils/offlineDb';

export function App() {
  // Default entry is Record (Full-Screen Map + Start Hiking)
  const [activeTab, setActiveTab] = useState<AppTab>('record');
  const [meSection, setMeSection] = useState<'menu' | 'tracks' | 'archive' | 'native'>('menu');
  const [referenceTrack, setReferenceTrack] = useState<RecordedTrack | null>(null);
  const [tracks, setTracks] = useState<RecordedTrack[]>([]);
  const [currentGps, setCurrentGps] = useState<GeoPoint | null>(null);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    getAllOfflineTracks().then(setTracks);
  }, []);

  const handleSaveTrack = async (updated: RecordedTrack) => {
    await saveOfflineTrack(updated);
    setTracks((prev) => {
      const exists = prev.some((t) => t.id === updated.id);
      return exists ? prev.map((t) => (t.id === updated.id ? updated : t)) : [updated, ...prev];
    });
  };

  const handleDeleteTrack = async (trackId: string) => {
    await deleteOfflineTrack(trackId);
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    if (referenceTrack?.id === trackId) {
      setReferenceTrack(null);
    }
  };

  const importedTracks = tracks.filter((t) => Boolean(t.isTemporaryImport));
  const recordedTracks = tracks.filter((t) => !t.isTemporaryImport);

  return (
    <div className="min-h-screen bg-[#F5F3EE] dark:bg-[#121715] text-[#1A211E] dark:text-[#ECEAE4]">
      {/* Minimal 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 h-13 bg-[#F5F3EE]/92 dark:bg-[#121715]/92 backdrop-blur-sm border-b border-[#DFD9CE] dark:border-[#242D28]">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('record')}
            className="text-base font-semibold tracking-tight whitespace-nowrap shrink-0 cursor-pointer"
          >
            跟夕走
          </button>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`py-1 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'discover'
                  ? 'border-[#1E352B] text-[#1A211E] dark:text-[#ECEAE4]'
                  : 'border-transparent text-[#5C655F] dark:text-[#9BA39E]'
              }`}
            >
              发现
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('record')}
              className={`py-1 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'record'
                  ? 'border-[#1E352B] text-[#1A211E] dark:text-[#ECEAE4]'
                  : 'border-transparent text-[#5C655F] dark:text-[#9BA39E]'
              }`}
            >
              记录
            </button>
            <button
              type="button"
              onClick={() => {
                setMeSection('menu');
                setActiveTab('me');
              }}
              className={`py-1 border-b-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'me'
                  ? 'border-[#1E352B] text-[#1A211E] dark:text-[#ECEAE4]'
                  : 'border-transparent text-[#5C655F] dark:text-[#9BA39E]'
              }`}
            >
              我的
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? '切换浅色模式' : '切换夜间模式'}
              className="min-w-[40px] min-h-[40px] rounded-lg border border-[#DFD9CE] dark:border-[#2B3530] flex items-center justify-center text-[#5C655F] dark:text-[#9BA39E] cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-20 md:pb-6">
        {activeTab === 'discover' && (
          <MinimalDiscoverView
            importedTracks={importedTracks}
            onImportTrack={handleSaveTrack}
            onDeleteTrack={handleDeleteTrack}
            onOpenOnMap={(track) => {
              setReferenceTrack(track);
              setActiveTab('record');
            }}
          />
        )}

        {activeTab === 'record' && (
          <MinimalRecordView
            referenceRoute={
              referenceTrack
                ? { id: referenceTrack.id, title: referenceTrack.name, points: referenceTrack.points }
                : null
            }
            onClearReferenceRoute={() => setReferenceTrack(null)}
            onTrackCompleted={handleSaveTrack}
            onViewCompletedTrack={() => {
              setMeSection('tracks');
              setActiveTab('me');
            }}
            onGpsUpdate={setCurrentGps}
          />
        )}

        {activeTab === 'me' && (
          <MinimalMeView
            tracks={recordedTracks}
            currentGps={currentGps}
            initialSection={meSection}
            onSaveTrack={handleSaveTrack}
            onImportTrack={handleSaveTrack}
            onDeleteTrack={handleDeleteTrack}
          />
        )}
      </main>

      {/* Minimalist 3-Tab Bottom Navigation with Compact Flush Record Tab */}
      <nav
        aria-label="底部导航"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-[#F5F3EE]/96 dark:bg-[#141917]/96 border-t border-[#DFD9CE] dark:border-[#2B3530] grid grid-cols-3 items-center"
      >
        <button
          type="button"
          onClick={() => setActiveTab('discover')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'discover'
              ? 'text-[#1E352B] dark:text-[#9CC0AD]'
              : 'text-[#5C655F] dark:text-[#9BA39E]'
          }`}
        >
          <Compass className="w-[18px] h-[18px]" />
          <span className="text-[11px] font-medium">发现</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('record')}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
        >
          <span
            className={`w-7 h-7 rounded-full bg-[#1E352B] text-white flex items-center justify-center border ${
              activeTab === 'record' ? 'border-[#B84F24]' : 'border-transparent'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
          </span>
          <span
            className={`text-[11px] font-medium ${
              activeTab === 'record'
                ? 'text-[#1E352B] dark:text-[#9CC0AD]'
                : 'text-[#5C655F] dark:text-[#9BA39E]'
            }`}
          >
            记录
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMeSection('menu');
            setActiveTab('me');
          }}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeTab === 'me'
              ? 'text-[#1E352B] dark:text-[#9CC0AD]'
              : 'text-[#5C655F] dark:text-[#9BA39E]'
          }`}
        >
          <User className="w-[18px] h-[18px]" />
          <span className="text-[11px] font-medium">我的</span>
        </button>
      </nav>
    </div>
  );
}

export default App;

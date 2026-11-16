import rnPackageJson from '../../native-rn/package.json?raw';
import rnAppJson from '../../native-rn/app.json?raw';
import rnDomainTs from '../../native-rn/src/types/domain.ts?raw';
import rnSchemaTs from '../../native-rn/src/db/schema.ts?raw';
import rnLocationTaskTs from '../../native-rn/src/services/locationTask.ts?raw';
import rnTrackRecorderTs from '../../native-rn/src/services/trackRecorder.ts?raw';
import rnPhotoCaptureTs from '../../native-rn/src/services/photoCaptureService.ts?raw';
import rnLongPressBtnTsx from '../../native-rn/src/components/LongPressFinishButton.tsx?raw';
import rnRecordScreenTsx from '../../native-rn/src/screens/RecordScreen.tsx?raw';
import rnRootNavTsx from '../../native-rn/src/navigation/RootNavigator.tsx?raw';
import rnMapScreenTsx from '../../native-rn/src/screens/MapScreen.tsx?raw';
import rnArchDoc from '../../native-rn/docs/ARCHITECTURE_AND_FORMULAS.md?raw';
import settingsGradle from '../../android/settings.gradle.kts?raw';
import rootBuildGradle from '../../android/build.gradle.kts?raw';
import libsVersionsToml from '../../android/gradle/libs.versions.toml?raw';
import appBuildGradle from '../../android/app/build.gradle.kts?raw';
import androidManifest from '../../android/app/src/main/AndroidManifest.xml?raw';
import genXiZouApp from '../../android/app/src/main/java/com/genxizou/hiking/GenXiZouApp.kt?raw';
import mainActivity from '../../android/app/src/main/java/com/genxizou/hiking/MainActivity.kt?raw';
import themeKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/theme/Theme.kt?raw';
import hikingModelsKt from '../../android/app/src/main/java/com/genxizou/hiking/data/model/HikingModels.kt?raw';
import trackEntitiesKt from '../../android/app/src/main/java/com/genxizou/hiking/data/local/TrackEntities.kt?raw';
import trackDaoKt from '../../android/app/src/main/java/com/genxizou/hiking/data/local/TrackDao.kt?raw';
import trackDatabaseKt from '../../android/app/src/main/java/com/genxizou/hiking/data/local/TrackDatabase.kt?raw';
import hikingRepositoryKt from '../../android/app/src/main/java/com/genxizou/hiking/data/repository/HikingRepository.kt?raw';
import elevationCalculatorKt from '../../android/app/src/main/java/com/genxizou/hiking/domain/ElevationMetricsCalculator.kt?raw';
import locationServiceKt from '../../android/app/src/main/java/com/genxizou/hiking/location/LocationTrackingService.kt?raw';
import homeViewModelKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/home/HomeViewModel.kt?raw';
import homeScreenKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/home/HomeScreen.kt?raw';
import mapRecordViewModelKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/map/MapRecordViewModel.kt?raw';
import mapRecordScreenKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/map/MapRecordScreen.kt?raw';
import offlineTracksScreenKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/tracks/OfflineTracksScreen.kt?raw';
import appNavHostKt from '../../android/app/src/main/java/com/genxizou/hiking/ui/navigation/AppNavHost.kt?raw';

export interface AndroidSourceFile {
  path: string;
  layer: string;
  summary: string;
  content: string;
}

export const ANDROID_SOURCE_FILES: AndroidSourceFile[] = [
  {
    path: 'native-rn/src/screens/RecordScreen.tsx',
    layer: 'RN · 极简记录页',
    summary: 'MapLibre 全屏地图 + 四项统计悬浮卡 + 状态控制按钮 + 拍照入口',
    content: rnRecordScreenTsx,
  },
  {
    path: 'native-rn/src/components/LongPressFinishButton.tsx',
    layer: 'RN · 长按结束',
    summary: '1.5 秒 SVG 环形进度长按确认结束，松手或退后台立即取消',
    content: rnLongPressBtnTsx,
  },
  {
    path: 'native-rn/src/services/trackRecorder.ts',
    layer: 'RN · Recorder',
    summary: '统一距离/运动时间/平均速度/海拔状态机与 SQLite 事务落盘',
    content: rnTrackRecorderTs,
  },
  {
    path: 'native-rn/src/services/photoCaptureService.ts',
    layer: 'RN · 系统相机',
    summary: '调用原生相机、本地持久化原图与缩略图、EXIF 读取并关联最近 TrackPoint',
    content: rnPhotoCaptureTs,
  },
  {
    path: 'native-rn/src/navigation/RootNavigator.tsx',
    layer: 'RN · 三栏导航',
    summary: '发现 / 记录（中央突出按钮）/ 我的 三栏底部导航',
    content: rnRootNavTsx,
  },
  {
    path: 'native-rn/docs/ARCHITECTURE_AND_FORMULAS.md',
    layer: 'RN · 架构与公式',
    summary: '距离/速度/运动时间/爬升算法规则及 MapLibre 与图源授权说明',
    content: rnArchDoc,
  },
  {
    path: 'native-rn/src/types/domain.ts',
    layer: 'RN · Domain UUID',
    summary: 'Track / TrackSegment / TrackPoint / Waypoint / Photo / Note / TrackVersion 实体',
    content: rnDomainTs,
  },
  {
    path: 'native-rn/src/db/schema.ts',
    layer: 'RN · SQLite WAL',
    summary: 'expo-sqlite 本地关系型持久化表结构（已扩展 photos.track_point_id 与 created_at）',
    content: rnSchemaTs,
  },
  {
    path: 'native-rn/src/services/locationTask.ts',
    layer: 'RN · 后台定位',
    summary: 'Expo TaskManager 后台真实 GPS 采集与精度/跳点/静止漂移滤波',
    content: rnLocationTaskTs,
  },
  {
    path: 'native-rn/src/screens/MapScreen.tsx',
    layer: 'RN · MapLibre',
    summary: 'MapLibre Native 渲染与显式图源（OSM / OpenTopoMap / 卫星）',
    content: rnMapScreenTsx,
  },
  {
    path: 'native-rn/package.json',
    layer: 'RN · Expo Config',
    summary: 'Expo Development Build 兼容依赖清单',
    content: rnPackageJson,
  },
  {
    path: 'native-rn/app.json',
    layer: 'RN · Expo Config',
    summary: 'Android/iOS 后台定位与系统相机权限声明',
    content: rnAppJson,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/home/HomeScreen.kt',
    layer: 'UI · Jetpack Compose',
    summary: '首页徒步路线列表、搜索栏、难度筛选及离线包缓存开关',
    content: homeScreenKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/map/MapRecordScreen.kt',
    layer: 'UI · Jetpack Compose',
    summary: '等高线地形画布、GPS 轨迹渲染与海拔/距离/爬升实时控制面板',
    content: mapRecordScreenKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/tracks/OfflineTracksScreen.kt',
    layer: 'UI · Jetpack Compose',
    summary: '本地 Room 离线轨迹库管理与 GPX 1.1 导出界面',
    content: offlineTracksScreenKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/navigation/AppNavHost.kt',
    layer: 'UI · Navigation',
    summary: 'Jetpack Compose BottomBar 与单 Activity 导航路由',
    content: appNavHostKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/theme/Theme.kt',
    layer: 'UI · Theme',
    summary: '极简克制户外配色系统（灰石浅色与夜间林间深色）',
    content: themeKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/location/LocationTrackingService.kt',
    layer: 'Service · GPS 定位',
    summary: 'Android 前台定位服务，逐点持久化写入 Room 数据库确保断网不丢轨迹',
    content: locationServiceKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/domain/ElevationMetricsCalculator.kt',
    layer: 'Domain · 核心算法',
    summary: 'Haversine 距离计算、3 米死区海拔平滑累计爬升算法及 GPX 序列化',
    content: elevationCalculatorKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/data/local/TrackEntities.kt',
    layer: 'Data · Room 离线库',
    summary: 'Room 本地持久化表结构：轨迹表、坐标采样点表与离线路线缓存表',
    content: trackEntitiesKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/data/local/TrackDao.kt',
    layer: 'Data · Room 离线库',
    summary: 'Room DAO 异步流式查询与离线轨迹点写入接口',
    content: trackDaoKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/data/local/TrackDatabase.kt',
    layer: 'Data · Room 离线库',
    summary: 'SQLite Room 数据库单例配置',
    content: trackDatabaseKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/data/repository/HikingRepository.kt',
    layer: 'Data · Repository',
    summary: '统一管理预设徒步路线与离线录制轨迹数据流',
    content: hikingRepositoryKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/data/model/HikingModels.kt',
    layer: 'Data · Model',
    summary: '路线、坐标点、路标及实时遥测状态模型',
    content: hikingModelsKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/home/HomeViewModel.kt',
    layer: 'ViewModel',
    summary: '首页路线搜索、难度过滤与离线状态管理',
    content: homeViewModelKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/ui/map/MapRecordViewModel.kt',
    layer: 'ViewModel',
    summary: '连接 Foreground Service 遥测流与实时轨迹点观测',
    content: mapRecordViewModelKt,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/MainActivity.kt',
    layer: 'App · Entry',
    summary: 'Edge-to-Edge Compose 宿主与定位/通知运行时权限申请',
    content: mainActivity,
  },
  {
    path: 'android/app/src/main/java/com/genxizou/hiking/GenXiZouApp.kt',
    layer: 'App · Entry',
    summary: 'Application 初始化 Room 数据库及后台定位通知渠道',
    content: genXiZouApp,
  },
  {
    path: 'android/app/src/main/AndroidManifest.xml',
    layer: 'Manifest & Gradle',
    summary: '声明精确 GPS 定位、后台定位与前台定位服务类型权限',
    content: androidManifest,
  },
  {
    path: 'android/app/build.gradle.kts',
    layer: 'Manifest & Gradle',
    summary: '模块依赖配置（Compose BOM、Room KSP、Play Services Location、MapLibre）',
    content: appBuildGradle,
  },
  {
    path: 'android/gradle/libs.versions.toml',
    layer: 'Manifest & Gradle',
    summary: 'Gradle Version Catalog 统一版本管理',
    content: libsVersionsToml,
  },
  {
    path: 'android/build.gradle.kts',
    layer: 'Manifest & Gradle',
    summary: '工程根级 Gradle 插件配置',
    content: rootBuildGradle,
  },
  {
    path: 'android/settings.gradle.kts',
    layer: 'Manifest & Gradle',
    summary: 'Gradle 仓库与 :app 模块声明',
    content: settingsGradle,
  },
];

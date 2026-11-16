package com.genxizou.hiking.data.repository

import com.genxizou.hiking.data.local.OfflineRouteEntity
import com.genxizou.hiking.data.local.RecordedTrackEntity
import com.genxizou.hiking.data.local.TrackDao
import com.genxizou.hiking.data.local.TrackPointEntity
import com.genxizou.hiking.data.model.GeoPoint
import com.genxizou.hiking.data.model.HikingRoute
import com.genxizou.hiking.data.model.TrailDifficulty
import com.genxizou.hiking.data.model.TrailWaypoint
import com.genxizou.hiking.domain.ElevationMetricsCalculator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf

class HikingRepository(private val trackDao: TrackDao) {

    private val curatedRoutes = listOf(
        HikingRoute(
            id = "xiangshan-dusk-ridge",
            title = "香山鬼见愁夕照环线",
            region = "北京 · 西山",
            distanceKm = 9.6,
            ascentMeters = 580,
            maxAltitudeMeters = 575,
            durationHours = 3.5,
            difficulty = TrailDifficulty.MODERATE,
            sunsetWindow = "17:15 – 17:48",
            summary = "沿西山防火道切入红叶山脊，黄昏时段面向西侧山谷视野开阔，适合轻装日落徒步。",
            path = listOf(
                GeoPoint(39.9912, 116.1886, 128.0),
                GeoPoint(39.9935, 116.1832, 246.0),
                GeoPoint(39.9958, 116.1779, 392.0),
                GeoPoint(39.9964, 116.1714, 575.0),
                GeoPoint(39.9928, 116.1746, 418.0),
                GeoPoint(39.9904, 116.1825, 210.0),
                GeoPoint(39.9912, 116.1886, 128.0)
            ),
            waypoints = listOf(
                TrailWaypoint("北门防火道入口", 39.9912, 116.1886, 128.0, "石阶起点，有补给"),
                TrailWaypoint("三岔垭口", 39.9958, 116.1779, 392.0, "可向西眺望主峰脊线"),
                TrailWaypoint("香炉峰观夕台", 39.9964, 116.1714, 575.0, "制高点，风较大需备防风衣")
            )
        ),
        HikingRoute(
            id = "lingshan-meadow-pass",
            title = "东灵山高山草甸垭口",
            region = "北京 · 门头沟",
            distanceKm = 14.8,
            ascentMeters = 920,
            maxAltitudeMeters = 2303,
            durationHours = 5.5,
            difficulty = TrailDifficulty.HARD,
            sunsetWindow = "17:05 – 17:42",
            summary = "华北屋脊高山草甸路线，无遮挡脊线视野，需下载离线轨迹与备用保暖层。",
            path = listOf(
                GeoPoint(40.0241, 115.4480, 1460.0),
                GeoPoint(40.0298, 115.4422, 1745.0),
                GeoPoint(40.0365, 115.4375, 2060.0),
                GeoPoint(40.0432, 115.4320, 2303.0),
                GeoPoint(40.0384, 115.4256, 2015.0),
                GeoPoint(40.0290, 115.4388, 1620.0)
            ),
            waypoints = listOf(
                TrailWaypoint("桦树林营地", 40.0298, 115.4422, 1745.0, "林线边缘避风"),
                TrailWaypoint("主峰石碑", 40.0432, 115.4320, 2303.0, "海拔 2303m，注意失温防护")
            )
        ),
        HikingRoute(
            id = "jiankou-cloud-crest",
            title = "箭扣西段野脊穿行",
            region = "北京 · 怀柔",
            distanceKm = 11.2,
            ascentMeters = 740,
            maxAltitudeMeters = 1042,
            durationHours = 4.8,
            difficulty = TrailDifficulty.HARD,
            sunsetWindow = "17:10 – 17:45",
            summary = "风化岩脊与古敌楼串联，落差集中且信号弱，建议全程开启离线 GPS 轨迹记录。",
            path = listOf(
                GeoPoint(40.4488, 116.4910, 420.0),
                GeoPoint(40.4535, 116.4860, 680.0),
                GeoPoint(40.4572, 116.4804, 965.0),
                GeoPoint(40.4601, 116.4752, 1042.0),
                GeoPoint(40.4562, 116.4701, 790.0)
            ),
            waypoints = listOf(
                TrailWaypoint("西栅子村登山口", 40.4488, 116.4910, 420.0, "村口停车"),
                TrailWaypoint("鹰飞倒仰观景点", 40.4601, 116.4752, 1042.0, "陡坡路段注意防滑")
            )
        ),
        HikingRoute(
            id = "baihe-canyon-walk",
            title = "白河峡谷轻装溯溪道",
            region = "北京 · 密云",
            distanceKm = 8.2,
            ascentMeters = 215,
            maxAltitudeMeters = 412,
            durationHours = 2.6,
            difficulty = TrailDifficulty.EASY,
            sunsetWindow = "17:20 – 17:50",
            summary = "沿花岗岩河谷缓坡行进，爬升平缓、树荫充足，适合周末半日轻装出行。",
            path = listOf(
                GeoPoint(40.6120, 116.6520, 240.0),
                GeoPoint(40.6168, 116.6582, 275.0),
                GeoPoint(40.6215, 116.6634, 338.0),
                GeoPoint(40.6272, 116.6690, 412.0),
                GeoPoint(40.6224, 116.6645, 342.0)
            ),
            waypoints = listOf(
                TrailWaypoint("峡谷石滩", 40.6168, 116.6582, 275.0, "平缓休息区"),
                TrailWaypoint("观澜崖", 40.6272, 116.6690, 412.0, "折返点")
            )
        )
    )

    fun observeRoutes(): Flow<List<HikingRoute>> {
        return combine(
            flowOf(curatedRoutes),
            trackDao.observeOfflineRouteIds()
        ) { routes, cachedIds ->
            val cachedSet = cachedIds.toSet()
            routes.map { it.copy(isOfflineCached = it.id in cachedSet) }
        }
    }

    suspend fun toggleOfflineRouteCache(route: HikingRoute) {
        if (route.isOfflineCached) {
            trackDao.removeOfflineRoute(route.id)
        } else {
            trackDao.saveOfflineRoute(
                OfflineRouteEntity(
                    routeId = route.id,
                    downloadedAtMillis = System.currentTimeMillis(),
                    payloadJson = "${route.id}:${route.path.size}"
                )
            )
        }
    }

    fun observeRecordedTracks(): Flow<List<RecordedTrackEntity>> = trackDao.observeAllTracks()

    fun observeTrackPoints(trackId: Long): Flow<List<TrackPointEntity>> =
        trackDao.observePointsForTrack(trackId)

    suspend fun startNewTrack(name: String, routeId: String?): Long {
        return trackDao.insertTrack(
            RecordedTrackEntity(
                name = name,
                routeId = routeId,
                startedAtMillis = System.currentTimeMillis(),
                isCompleted = false,
                isOfflineSynced = true
            )
        )
    }

    suspend fun appendTrackPoint(trackId: Long, point: GeoPoint) {
        trackDao.insertPoint(
            TrackPointEntity(
                trackId = trackId,
                latitude = point.latitude,
                longitude = point.longitude,
                altitudeMeters = point.altitudeMeters,
                accuracyMeters = point.accuracyMeters,
                timestampMillis = point.timestampMillis
            )
        )
        val allPoints = trackDao.getPointsForTrackOnce(trackId).map {
            GeoPoint(it.latitude, it.longitude, it.altitudeMeters, it.timestampMillis, it.accuracyMeters)
        }
        val stats = ElevationMetricsCalculator.computeStats(allPoints)
        val existing = trackDao.getTrackById(trackId) ?: return
        trackDao.updateTrack(
            existing.copy(
                distanceMeters = stats.distanceMeters,
                ascentMeters = stats.ascentMeters,
                descentMeters = stats.descentMeters,
                maxAltitudeMeters = stats.maxAltitudeMeters,
                minAltitudeMeters = stats.minAltitudeMeters
            )
        )
    }

    suspend fun completeTrack(trackId: Long) {
        val existing = trackDao.getTrackById(trackId) ?: return
        trackDao.updateTrack(
            existing.copy(
                endedAtMillis = System.currentTimeMillis(),
                isCompleted = true
            )
        )
    }

    suspend fun deleteTrack(trackId: Long) = trackDao.deleteTrack(trackId)

    suspend fun exportTrackGpx(trackId: Long): String? {
        val track = trackDao.getTrackById(trackId) ?: return null
        val points = trackDao.getPointsForTrackOnce(trackId).map {
            GeoPoint(it.latitude, it.longitude, it.altitudeMeters, it.timestampMillis, it.accuracyMeters)
        }
        return ElevationMetricsCalculator.exportToGpx(track.name, points)
    }
}

package com.genxizou.hiking.data.model

enum class TrailDifficulty(val label: String) {
    EASY("入门"),
    MODERATE("进阶"),
    HARD("挑战")
}

data class GeoPoint(
    val latitude: Double,
    val longitude: Double,
    val altitudeMeters: Double,
    val timestampMillis: Long = 0L,
    val accuracyMeters: Float = 0f
)

data class TrailWaypoint(
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val altitudeMeters: Double,
    val note: String
)

data class HikingRoute(
    val id: String,
    val title: String,
    val region: String,
    val distanceKm: Double,
    val ascentMeters: Int,
    val maxAltitudeMeters: Int,
    val durationHours: Double,
    val difficulty: TrailDifficulty,
    val sunsetWindow: String,
    val summary: String,
    val path: List<GeoPoint>,
    val waypoints: List<TrailWaypoint>,
    val isOfflineCached: Boolean = false
)

enum class RecordingStatus {
    IDLE,
    RECORDING,
    PAUSED
}

data class LiveTelemetry(
    val status: RecordingStatus = RecordingStatus.IDLE,
    val currentAltitudeMeters: Double = 0.0,
    val distanceMeters: Double = 0.0,
    val cumulativeAscentMeters: Double = 0.0,
    val cumulativeDescentMeters: Double = 0.0,
    val elapsedMillis: Long = 0L,
    val currentLatitude: Double? = null,
    val currentLongitude: Double? = null,
    val accuracyMeters: Float? = null,
    val pointsCount: Int = 0,
    val activeTrackId: Long? = null
)

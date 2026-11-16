package com.genxizou.hiking.data.local

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "recorded_tracks")
data class RecordedTrackEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val name: String,
    val routeId: String? = null,
    val startedAtMillis: Long,
    val endedAtMillis: Long? = null,
    val distanceMeters: Double = 0.0,
    val ascentMeters: Double = 0.0,
    val descentMeters: Double = 0.0,
    val maxAltitudeMeters: Double = 0.0,
    val minAltitudeMeters: Double = 0.0,
    val isCompleted: Boolean = false,
    val isOfflineSynced: Boolean = true
)

@Entity(
    tableName = "track_points",
    foreignKeys = [
        ForeignKey(
            entity = RecordedTrackEntity::class,
            parentColumns = ["id"],
            childColumns = ["trackId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("trackId")]
)
data class TrackPointEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0L,
    val trackId: Long,
    val latitude: Double,
    val longitude: Double,
    val altitudeMeters: Double,
    val accuracyMeters: Float,
    val timestampMillis: Long
)

@Entity(tableName = "offline_routes")
data class OfflineRouteEntity(
    @PrimaryKey
    val routeId: String,
    val downloadedAtMillis: Long,
    val payloadJson: String
)

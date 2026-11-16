package com.genxizou.hiking.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TrackDao {
    @Insert
    suspend fun insertTrack(track: RecordedTrackEntity): Long

    @Update
    suspend fun updateTrack(track: RecordedTrackEntity)

    @Insert
    suspend fun insertPoint(point: TrackPointEntity): Long

    @Query("SELECT * FROM recorded_tracks ORDER BY startedAtMillis DESC")
    fun observeAllTracks(): Flow<List<RecordedTrackEntity>>

    @Query("SELECT * FROM recorded_tracks WHERE id = :trackId")
    suspend fun getTrackById(trackId: Long): RecordedTrackEntity?

    @Query("SELECT * FROM recorded_tracks WHERE isCompleted = 0 ORDER BY startedAtMillis DESC LIMIT 1")
    suspend fun getActiveUnfinishedTrack(): RecordedTrackEntity?

    @Query("SELECT * FROM track_points WHERE trackId = :trackId ORDER BY timestampMillis ASC")
    fun observePointsForTrack(trackId: Long): Flow<List<TrackPointEntity>>

    @Query("SELECT * FROM track_points WHERE trackId = :trackId ORDER BY timestampMillis ASC")
    suspend fun getPointsForTrackOnce(trackId: Long): List<TrackPointEntity>

    @Query("DELETE FROM recorded_tracks WHERE id = :trackId")
    suspend fun deleteTrack(trackId: Long)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveOfflineRoute(route: OfflineRouteEntity)

    @Query("SELECT routeId FROM offline_routes")
    fun observeOfflineRouteIds(): Flow<List<String>>

    @Query("DELETE FROM offline_routes WHERE routeId = :routeId")
    suspend fun removeOfflineRoute(routeId: String)
}

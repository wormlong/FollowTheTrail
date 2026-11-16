package com.genxizou.hiking.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        RecordedTrackEntity::class,
        TrackPointEntity::class,
        OfflineRouteEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class TrackDatabase : RoomDatabase() {
    abstract fun trackDao(): TrackDao

    companion object {
        @Volatile
        private var INSTANCE: TrackDatabase? = null

        fun getInstance(context: Context): TrackDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    TrackDatabase::class.java,
                    "genxizou_offline_tracks.db"
                ).build().also { INSTANCE = it }
            }
        }
    }
}

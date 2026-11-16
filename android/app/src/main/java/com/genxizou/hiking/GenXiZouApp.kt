package com.genxizou.hiking

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.genxizou.hiking.data.local.TrackDatabase
import com.genxizou.hiking.data.repository.HikingRepository

class GenXiZouApp : Application() {

    val database: TrackDatabase by lazy { TrackDatabase.getInstance(this) }
    val repository: HikingRepository by lazy { HikingRepository(database.trackDao()) }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                TRACKING_CHANNEL_ID,
                getString(R.string.tracking_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "保持后台离线 GPS 定位与海拔记录"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val TRACKING_CHANNEL_ID = "genxizou_gps_tracking"
    }
}

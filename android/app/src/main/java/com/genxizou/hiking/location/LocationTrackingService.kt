package com.genxizou.hiking.location

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.genxizou.hiking.GenXiZouApp
import com.genxizou.hiking.MainActivity
import com.genxizou.hiking.R
import com.genxizou.hiking.data.model.GeoPoint
import com.genxizou.hiking.data.model.LiveTelemetry
import com.genxizou.hiking.data.model.RecordingStatus
import com.genxizou.hiking.domain.ElevationMetricsCalculator
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class LocationTrackingService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var fusedClient: FusedLocationProviderClient
    private var timerJob: Job? = null
    private var activeTrackId: Long? = null
    private val recordedPoints = mutableListOf<GeoPoint>()
    private var startedAtMillis: Long = 0L

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val location = result.lastLocation ?: return
            if (location.accuracy > 45f) return

            val point = GeoPoint(
                latitude = location.latitude,
                longitude = location.longitude,
                altitudeMeters = if (location.hasAltitude()) location.altitude else 0.0,
                timestampMillis = System.currentTimeMillis(),
                accuracyMeters = location.accuracy
            )

            recordedPoints.add(point)
            val stats = ElevationMetricsCalculator.computeStats(recordedPoints)

            _telemetry.update {
                it.copy(
                    currentAltitudeMeters = point.altitudeMeters,
                    distanceMeters = stats.distanceMeters,
                    cumulativeAscentMeters = stats.ascentMeters,
                    cumulativeDescentMeters = stats.descentMeters,
                    currentLatitude = point.latitude,
                    currentLongitude = point.longitude,
                    accuracyMeters = point.accuracyMeters,
                    pointsCount = recordedPoints.size
                )
            }

            // Crash-safe offline write to Room database on every GPS sample
            activeTrackId?.let { id ->
                serviceScope.launch {
                    (application as GenXiZouApp).repository.appendTrackPoint(id, point)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val trackName = intent.getStringExtra(EXTRA_TRACK_NAME) ?: "离线徒步记录"
                val routeId = intent.getStringExtra(EXTRA_ROUTE_ID)
                startForeground(NOTIFICATION_ID, buildNotification())
                beginRecording(trackName, routeId)
            }
            ACTION_PAUSE -> pauseRecording()
            ACTION_RESUME -> resumeRecording()
            ACTION_STOP -> stopAndSaveRecording()
        }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun beginRecording(trackName: String, routeId: String?) {
        recordedPoints.clear()
        startedAtMillis = System.currentTimeMillis()
        serviceScope.launch {
            val repo = (application as GenXiZouApp).repository
            val newId = repo.startNewTrack(trackName, routeId)
            activeTrackId = newId
            _telemetry.value = LiveTelemetry(
                status = RecordingStatus.RECORDING,
                activeTrackId = newId
            )
            requestLocationUpdates()
            startElapsedTimer()
        }
    }

    @SuppressLint("MissingPermission")
    private fun requestLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3_000L)
            .setMinUpdateDistanceMeters(4f)
            .setWaitForAccurateLocation(true)
            .build()
        fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    private fun pauseRecording() {
        fusedClient.removeLocationUpdates(locationCallback)
        timerJob?.cancel()
        _telemetry.update { it.copy(status = RecordingStatus.PAUSED) }
    }

    private fun resumeRecording() {
        _telemetry.update { it.copy(status = RecordingStatus.RECORDING) }
        requestLocationUpdates()
        startElapsedTimer()
    }

    private fun stopAndSaveRecording() {
        fusedClient.removeLocationUpdates(locationCallback)
        timerJob?.cancel()
        val trackId = activeTrackId
        serviceScope.launch {
            if (trackId != null) {
                (application as GenXiZouApp).repository.completeTrack(trackId)
            }
            activeTrackId = null
            _telemetry.value = LiveTelemetry(status = RecordingStatus.IDLE)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun startElapsedTimer() {
        timerJob?.cancel()
        timerJob = serviceScope.launch {
            while (true) {
                delay(1_000L)
                _telemetry.update {
                    if (it.status == RecordingStatus.RECORDING) {
                        it.copy(elapsedMillis = it.elapsedMillis + 1_000L)
                    } else it
                }
            }
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, GenXiZouApp.TRACKING_CHANNEL_ID)
            .setContentTitle(getString(R.string.tracking_notification_title))
            .setContentText(getString(R.string.tracking_notification_text))
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "com.genxizou.hiking.action.START"
        const val ACTION_PAUSE = "com.genxizou.hiking.action.PAUSE"
        const val ACTION_RESUME = "com.genxizou.hiking.action.RESUME"
        const val ACTION_STOP = "com.genxizou.hiking.action.STOP"
        const val EXTRA_TRACK_NAME = "extra_track_name"
        const val EXTRA_ROUTE_ID = "extra_route_id"
        private const val NOTIFICATION_ID = 1001

        private val _telemetry = MutableStateFlow(LiveTelemetry())
        val telemetry: StateFlow<LiveTelemetry> = _telemetry.asStateFlow()
    }
}

package com.genxizou.hiking.ui.map

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.genxizou.hiking.data.local.TrackPointEntity
import com.genxizou.hiking.data.model.HikingRoute
import com.genxizou.hiking.data.model.LiveTelemetry
import com.genxizou.hiking.data.repository.HikingRepository
import com.genxizou.hiking.location.LocationTrackingService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

class MapRecordViewModel(private val repository: HikingRepository) : ViewModel() {

    val telemetry: StateFlow<LiveTelemetry> = LocationTrackingService.telemetry

    private val _selectedRoute = MutableStateFlow<HikingRoute?>(null)
    val selectedRoute: StateFlow<HikingRoute?> = _selectedRoute

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    val activeTrackPoints: StateFlow<List<TrackPointEntity>> = telemetry
        .flatMapLatest { state ->
            val id = state.activeTrackId
            if (id != null) repository.observeTrackPoints(id) else flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    fun attachRoute(route: HikingRoute) {
        _selectedRoute.value = route
    }

    fun startRecording(context: Context) {
        val route = _selectedRoute.value
        val intent = Intent(context, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_START
            putExtra(LocationTrackingService.EXTRA_TRACK_NAME, route?.title ?: "自由徒步记录")
            putExtra(LocationTrackingService.EXTRA_ROUTE_ID, route?.id)
        }
        ContextCompat.startForegroundService(context, intent)
    }

    fun pauseRecording(context: Context) {
        val intent = Intent(context, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_PAUSE
        }
        context.startService(intent)
    }

    fun resumeRecording(context: Context) {
        val intent = Intent(context, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_RESUME
        }
        context.startService(intent)
    }

    fun stopRecording(context: Context) {
        val intent = Intent(context, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_STOP
        }
        context.startService(intent)
    }

    class Factory(private val repository: HikingRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return MapRecordViewModel(repository) as T
        }
    }
}

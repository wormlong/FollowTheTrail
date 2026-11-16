package com.genxizou.hiking.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.genxizou.hiking.data.model.HikingRoute
import com.genxizou.hiking.data.model.TrailDifficulty
import com.genxizou.hiking.data.repository.HikingRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HomeUiState(
    val routes: List<HikingRoute> = emptyList(),
    val selectedDifficulty: TrailDifficulty? = null,
    val searchQuery: String = ""
)

class HomeViewModel(private val repository: HikingRepository) : ViewModel() {

    private val selectedDifficulty = MutableStateFlow<TrailDifficulty?>(null)
    private val searchQuery = MutableStateFlow("")

    val uiState: StateFlow<HomeUiState> = combine(
        repository.observeRoutes(),
        selectedDifficulty,
        searchQuery
    ) { routes, difficulty, query ->
        val filtered = routes.filter { route ->
            val matchesDifficulty = difficulty == null || route.difficulty == difficulty
            val matchesQuery = query.isBlank() ||
                route.title.contains(query, ignoreCase = true) ||
                route.region.contains(query, ignoreCase = true)
            matchesDifficulty && matchesQuery
        }
        HomeUiState(
            routes = filtered,
            selectedDifficulty = difficulty,
            searchQuery = query
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState()
    )

    fun selectDifficulty(difficulty: TrailDifficulty?) {
        selectedDifficulty.value = difficulty
    }

    fun updateSearchQuery(query: String) {
        searchQuery.value = query
    }

    fun toggleOfflineCache(route: HikingRoute) {
        viewModelScope.launch {
            repository.toggleOfflineRouteCache(route)
        }
    }

    class Factory(private val repository: HikingRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return HomeViewModel(repository) as T
        }
    }
}

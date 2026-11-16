package com.genxizou.hiking.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material.icons.outlined.FolderCopy
import androidx.compose.material.icons.outlined.Terrain
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.genxizou.hiking.data.repository.HikingRepository
import com.genxizou.hiking.ui.home.HomeScreen
import com.genxizou.hiking.ui.home.HomeViewModel
import com.genxizou.hiking.ui.map.MapRecordScreen
import com.genxizou.hiking.ui.map.MapRecordViewModel
import com.genxizou.hiking.ui.tracks.OfflineTracksScreen
import kotlinx.coroutines.launch

sealed class Dest(val route: String, val label: String) {
    data object Home : Dest("home", "路线")
    data object MapRecord : Dest("map_record", "记录")
    data object OfflineTracks : Dest("offline_tracks", "轨迹")
}

@Composable
fun AppNavHost(repository: HikingRepository) {
    val navController = rememberNavController()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    val homeViewModel: HomeViewModel = viewModel(factory = HomeViewModel.Factory(repository))
    val mapViewModel: MapRecordViewModel = viewModel(factory = MapRecordViewModel.Factory(repository))

    val destinations = listOf(Dest.Home, Dest.MapRecord, Dest.OfflineTracks)
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar {
                destinations.forEach { dest ->
                    val icon = when (dest) {
                        Dest.Home -> Icons.Outlined.Terrain
                        Dest.MapRecord -> Icons.Outlined.Explore
                        Dest.OfflineTracks -> Icons.Outlined.FolderCopy
                    }
                    NavigationBarItem(
                        selected = currentRoute == dest.route,
                        onClick = {
                            navController.navigate(dest.route) {
                                popUpTo(Dest.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(icon, contentDescription = dest.label) },
                        label = { Text(dest.label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Dest.Home.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Dest.Home.route) {
                HomeScreen(
                    viewModel = homeViewModel,
                    onStartRoute = { route ->
                        mapViewModel.attachRoute(route)
                        navController.navigate(Dest.MapRecord.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
            composable(Dest.MapRecord.route) {
                MapRecordScreen(viewModel = mapViewModel)
            }
            composable(Dest.OfflineTracks.route) {
                OfflineTracksScreen(
                    repository = repository,
                    onExportedGpx = { gpx ->
                        scope.launch {
                            snackbarHostState.showSnackbar("已生成 GPX 轨迹 (${gpx.length} 字符)")
                        }
                    }
                )
            }
        }
    }
}

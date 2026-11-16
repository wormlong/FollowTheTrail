package com.genxizou.hiking.ui.tracks

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.genxizou.hiking.data.local.RecordedTrackEntity
import com.genxizou.hiking.data.repository.HikingRepository
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun OfflineTracksScreen(
    repository: HikingRepository,
    onExportedGpx: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val tracks by repository.observeRecordedTracks().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "离线轨迹库",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "所有记录均保存于本地 Room 数据库，无网络亦可随时导出 GPX",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        if (tracks.isEmpty()) {
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Text(
                        text = "暂无离线轨迹，前往「记录」页面开始第一次徒步。",
                        modifier = Modifier.padding(20.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            items(tracks, key = { it.id }) { track ->
                OfflineTrackRow(
                    track = track,
                    onExport = {
                        scope.launch {
                            repository.exportTrackGpx(track.id)?.let(onExportedGpx)
                        }
                    },
                    onDelete = {
                        scope.launch { repository.deleteTrack(track.id) }
                    }
                )
            }
        }
    }
}

@Composable
private fun OfflineTrackRow(
    track: RecordedTrackEntity,
    onExport: () -> Unit,
    onDelete: () -> Unit
) {
    val dateLabel = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CHINA)
        .format(Date(track.startedAtMillis))

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = dateLabel,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = track.name,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = String.format(Locale.US, "距离 %.2f km", track.distanceMeters / 1000.0),
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = String.format(Locale.US, "爬升 +%.0f m", track.ascentMeters),
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = String.format(Locale.US, "最高 %.0f m", track.maxAltitudeMeters),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onExport, modifier = Modifier.weight(1f)) {
                    Text("导出 GPX")
                }
                OutlinedButton(onClick = onDelete, modifier = Modifier.weight(1f)) {
                    Text("删除")
                }
            }
        }
    }
}

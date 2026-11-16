package com.genxizou.hiking.ui.map

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.genxizou.hiking.data.model.RecordingStatus
import java.util.Locale

@Composable
fun MapRecordScreen(
    viewModel: MapRecordViewModel,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val telemetry by viewModel.telemetry.collectAsState()
    val selectedRoute by viewModel.selectedRoute.collectAsState()
    val points by viewModel.activeTrackPoints.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Offline Topographic Map & GPS Track Canvas (paired with MapLibre / MBTiles in production)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                val primaryColor = MaterialTheme.colorScheme.primary
                val secondaryColor = MaterialTheme.colorScheme.secondary
                val contourColor = MaterialTheme.colorScheme.outline

                Canvas(modifier = Modifier.fillMaxSize()) {
                    val w = size.width
                    val h = size.height
                    // Subtle topographic contour rings
                    for (step in 1..6) {
                        drawCircle(
                            color = contourColor,
                            radius = (w.coerceAtMost(h) * 0.14f) * step,
                            center = Offset(w * 0.52f, h * 0.46f),
                            style = Stroke(width = 1.5f)
                        )
                    }

                    // Reference route polyline
                    val refPoints = selectedRoute?.path.orEmpty()
                    if (refPoints.size >= 2) {
                        val minLat = refPoints.minOf { it.latitude }
                        val maxLat = refPoints.maxOf { it.latitude }.coerceAtLeast(minLat + 0.001)
                        val minLon = refPoints.minOf { it.longitude }
                        val maxLon = refPoints.maxOf { it.longitude }.coerceAtLeast(minLon + 0.001)
                        val routePath = Path()
                        refPoints.forEachIndexed { idx, pt ->
                            val x = ((pt.longitude - minLon) / (maxLon - minLon)).toFloat() * w * 0.72f + w * 0.14f
                            val y = (1f - ((pt.latitude - minLat) / (maxLat - minLat)).toFloat()) * h * 0.72f + h * 0.14f
                            if (idx == 0) routePath.moveTo(x, y) else routePath.lineTo(x, y)
                        }
                        drawPath(
                            path = routePath,
                            color = secondaryColor.copy(alpha = 0.55f),
                            style = Stroke(width = 6f, cap = StrokeCap.Round)
                        )
                    }

                    // Live recorded GPS breadcrumb polyline
                    if (points.size >= 2) {
                        val minLat = points.minOf { it.latitude }
                        val maxLat = points.maxOf { it.latitude }.coerceAtLeast(minLat + 0.0005)
                        val minLon = points.minOf { it.longitude }
                        val maxLon = points.maxOf { it.longitude }.coerceAtLeast(minLon + 0.0005)
                        val trackPath = Path()
                        points.forEachIndexed { idx, pt ->
                            val x = ((pt.longitude - minLon) / (maxLon - minLon)).toFloat() * w * 0.72f + w * 0.14f
                            val y = (1f - ((pt.latitude - minLat) / (maxLat - minLat)).toFloat()) * h * 0.72f + h * 0.14f
                            if (idx == 0) trackPath.moveTo(x, y) else trackPath.lineTo(x, y)
                        }
                        drawPath(
                            path = trackPath,
                            color = primaryColor,
                            style = Stroke(width = 8f, cap = StrokeCap.Round)
                        )
                    }
                }

                Column(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(14.dp)
                ) {
                    Text(
                        text = selectedRoute?.title ?: "离线地形图 · 等待 GPS 定位",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "已记录 ${telemetry.pointsCount} 个离线坐标点",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        // Live Altitude, Distance, Cumulative Ascent Telemetry Panel
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    TelemetryBlock("距离", String.format(Locale.US, "%.2f km", telemetry.distanceMeters / 1000.0))
                    TelemetryBlock("当前海拔", String.format(Locale.US, "%.0f m", telemetry.currentAltitudeMeters))
                    TelemetryBlock("累计爬升", String.format(Locale.US, "+%.0f m", telemetry.cumulativeAscentMeters))
                    TelemetryBlock("用时", formatElapsed(telemetry.elapsedMillis))
                }

                Row(modifier = Modifier.fillMaxWidth()) {
                    when (telemetry.status) {
                        RecordingStatus.IDLE -> {
                            Button(
                                onClick = { viewModel.startRecording(context) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("开始离线轨迹记录")
                            }
                        }
                        RecordingStatus.RECORDING -> {
                            OutlinedButton(
                                onClick = { viewModel.pauseRecording(context) },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("暂停")
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Button(
                                onClick = { viewModel.stopRecording(context) },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.secondary
                                )
                            ) {
                                Text("结束并保存")
                            }
                        }
                        RecordingStatus.PAUSED -> {
                            Button(
                                onClick = { viewModel.resumeRecording(context) },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("继续记录")
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            OutlinedButton(
                                onClick = { viewModel.stopRecording(context) },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text("保存轨迹")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TelemetryBlock(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

private fun formatElapsed(millis: Long): String {
    val totalSeconds = millis / 1000L
    val hours = totalSeconds / 3600L
    val minutes = (totalSeconds % 3600L) / 60L
    val seconds = totalSeconds % 60L
    return String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
}

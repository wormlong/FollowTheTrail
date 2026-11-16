package com.genxizou.hiking.domain

import com.genxizou.hiking.data.model.GeoPoint
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class TrackSummaryStats(
    val distanceMeters: Double,
    val ascentMeters: Double,
    val descentMeters: Double,
    val maxAltitudeMeters: Double,
    val minAltitudeMeters: Double
)

object ElevationMetricsCalculator {

    private const val EARTH_RADIUS_METERS = 6_371_000.0
    private const val ASCENT_DEADBAND_METERS = 3.0

    fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return EARTH_RADIUS_METERS * c
    }

    /**
     * Computes distance and deadband-smoothed cumulative ascent/descent
     * to prevent GPS altitude jitter from inflating climb totals.
     */
    fun computeStats(points: List<GeoPoint>): TrackSummaryStats {
        if (points.isEmpty()) {
            return TrackSummaryStats(0.0, 0.0, 0.0, 0.0, 0.0)
        }
        var distance = 0.0
        var ascent = 0.0
        var descent = 0.0
        var maxAlt = points.first().altitudeMeters
        var minAlt = points.first().altitudeMeters
        var anchorAlt = points.first().altitudeMeters

        for (i in 1 until points.size) {
            val prev = points[i - 1]
            val curr = points[i]
            val segDist = haversineMeters(
                prev.latitude, prev.longitude,
                curr.latitude, curr.longitude
            )
            // Filter implausible single-sample GPS spikes (> 120m per second)
            if (segDist <= 120.0) {
                distance += segDist
            }

            if (curr.altitudeMeters > maxAlt) maxAlt = curr.altitudeMeters
            if (curr.altitudeMeters < minAlt) minAlt = curr.altitudeMeters

            val delta = curr.altitudeMeters - anchorAlt
            if (delta >= ASCENT_DEADBAND_METERS) {
                ascent += delta
                anchorAlt = curr.altitudeMeters
            } else if (delta <= -ASCENT_DEADBAND_METERS) {
                descent += -delta
                anchorAlt = curr.altitudeMeters
            }
        }

        return TrackSummaryStats(
            distanceMeters = distance,
            ascentMeters = ascent,
            descentMeters = descent,
            maxAltitudeMeters = maxAlt,
            minAltitudeMeters = minAlt
        )
    }

    fun exportToGpx(trackName: String, points: List<GeoPoint>): String {
        val formatter = DateTimeFormatter.ISO_INSTANT.withZone(ZoneOffset.UTC)
        val sb = StringBuilder()
        sb.appendLine("""<?xml version="1.0" encoding="UTF-8"?>""")
        sb.appendLine("""<gpx version="1.1" creator="GenXiZou Android" xmlns="http://www.topografix.com/GPX/1/1">""")
        sb.appendLine("  <trk>")
        sb.appendLine("    <name>${escapeXml(trackName)}</name>")
        sb.appendLine("    <trkseg>")
        for (pt in points) {
            val iso = formatter.format(Instant.ofEpochMilli(pt.timestampMillis))
            sb.appendLine("""      <trkpt lat="${pt.latitude}" lon="${pt.longitude}">""")
            sb.appendLine("        <ele>${"%.1f".format(pt.altitudeMeters)}</ele>")
            sb.appendLine("        <time>$iso</time>")
            sb.appendLine("      </trkpt>")
        }
        sb.appendLine("    </trkseg>")
        sb.appendLine("  </trk>")
        sb.appendLine("</gpx>")
        return sb.toString()
    }

    private fun escapeXml(input: String): String = input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
}

package com.genxizou.hiking.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Restrained Outdoor Color System (60-30-10)
val LimestoneCanvas = Color(0xFFF5F3EE)
val PaperSurface = Color(0xFFFFFFFF)
val WarmSandSurface = Color(0xFFEAE6DD)
val HairlineStone = Color(0xFFDFD9CE)

val PineInk = Color(0xFF1A211E)
val MutedMossText = Color(0xFF5C655F)
val DuskTerracotta = Color(0xFFB84F24)
val ForestPine = Color(0xFF1E352B)

val NightForestCanvas = Color(0xFF121715)
val NightCardSurface = Color(0xFF1A211E)
val NightTextPrimary = Color(0xFFECEAE4)
val NightTextSecondary = Color(0xFF9BA39E)

private val LightColorScheme = lightColorScheme(
    primary = DuskTerracotta,
    onPrimary = Color.White,
    secondary = ForestPine,
    onSecondary = Color.White,
    background = LimestoneCanvas,
    onBackground = PineInk,
    surface = PaperSurface,
    onSurface = PineInk,
    surfaceVariant = WarmSandSurface,
    onSurfaceVariant = MutedMossText,
    outline = HairlineStone
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFFD66A3D),
    onPrimary = Color(0xFF121715),
    secondary = Color(0xFF6B907E),
    onSecondary = Color(0xFF121715),
    background = NightForestCanvas,
    onBackground = NightTextPrimary,
    surface = NightCardSurface,
    onSurface = NightTextPrimary,
    surfaceVariant = Color(0xFF232C28),
    onSurfaceVariant = NightTextSecondary,
    outline = Color(0xFF2B3530)
)

val GenXiZouTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = (-0.3).sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 25.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontFeatureSettings = "tnum"
    )
)

@Composable
fun GenXiZouTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = GenXiZouTypography,
        content = content
    )
}

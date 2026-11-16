# Room & Coroutines
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# MapLibre Android SDK
-keep class org.maplibre.android.** { *; }
-dontwarn org.maplibre.android.**

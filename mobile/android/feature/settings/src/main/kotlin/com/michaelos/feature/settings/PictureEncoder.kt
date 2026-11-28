package com.michaelos.feature.settings

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.core.graphics.scale
import java.io.ByteArrayOutputStream

/** Library photos may be HEIC or large; the server takes PNG, JPEG or WebP up to 2 MB. */
internal object PictureEncoder {
    private val QUALITIES = listOf(85, 70, 50)

    fun jpeg(
        resolver: ContentResolver,
        photo: Uri,
    ): ByteArray? =
        // A photo that cannot be read or decoded is refused on screen; the reason is not the user's to act on.
        runCatching {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(photo)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            val longest = maxOf(bounds.outWidth, bounds.outHeight)
            if (longest <= 0) return@runCatching null
            var sample = 1
            while (longest / (sample * 2) >= PictureRules.LONGEST_SIDE) sample *= 2
            val decoded =
                resolver.openInputStream(photo)?.use {
                    BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
                } ?: return@runCatching null
            val scale = minOf(1f, PictureRules.LONGEST_SIDE.toFloat() / maxOf(decoded.width, decoded.height))
            val resized =
                decoded.scale((decoded.width * scale).toInt().coerceAtLeast(1), (decoded.height * scale).toInt().coerceAtLeast(1))
            QUALITIES.firstNotNullOfOrNull { quality ->
                ByteArrayOutputStream().use { out ->
                    resized.compress(Bitmap.CompressFormat.JPEG, quality, out)
                    out.toByteArray().takeIf { it.size <= PictureRules.MAX_BYTES }
                }
            }
        }.getOrNull()
}

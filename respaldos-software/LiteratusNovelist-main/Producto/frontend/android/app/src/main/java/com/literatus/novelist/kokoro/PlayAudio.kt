package com.literatus.novelist.kokoro

import android.media.AudioFormat
import android.media.AudioFormat.CHANNEL_OUT_MONO
import android.media.AudioManager
import android.media.AudioTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.nio.ByteBuffer
import java.nio.ByteOrder

fun playAudio(audioData: FloatArray, scope: CoroutineScope, onComplete: () -> Unit) {
    scope.launch(Dispatchers.IO) {
        val sampleRate = 22050
        val channelConfig = android.media.AudioFormat.CHANNEL_OUT_MONO
        val audioFormat = android.media.AudioFormat.ENCODING_PCM_16BIT

        val byteBuffer = ByteBuffer.allocate(audioData.size * 2)
        byteBuffer.order(ByteOrder.LITTLE_ENDIAN)
        val shortBuffer = byteBuffer.asShortBuffer()

        // Clip de los valores para evitar crujidos y conversión a 16-bit PCM
        for (sample in audioData) {
            val clipped = sample.coerceIn(-1.0f, 1.0f)
            val pcmValue = (clipped * Short.MAX_VALUE).toInt().toShort()
            shortBuffer.put(pcmValue)
        }

        val audioTrack = android.media.AudioTrack.Builder()
            .setAudioAttributes(
                android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                android.media.AudioFormat.Builder()
                    .setEncoding(audioFormat)
                    .setSampleRate(sampleRate)
                    .setChannelMask(channelConfig)
                    .build()
            )
            .setBufferSizeInBytes(byteBuffer.capacity())
            .setTransferMode(android.media.AudioTrack.MODE_STATIC)
            .build()

        audioTrack.write(byteBuffer.array(), 0, byteBuffer.capacity())
        audioTrack.play()

        // Esperar a que el audio termine de reproducirse (Dispatchers.IO lo permite)
        val durationMs = (audioData.size.toFloat() / sampleRate * 1000).toLong()
        Thread.sleep(durationMs + 100) // 100ms de margen

        audioTrack.release()

        withContext(Dispatchers.Main) {
            onComplete()
        }
    }
}

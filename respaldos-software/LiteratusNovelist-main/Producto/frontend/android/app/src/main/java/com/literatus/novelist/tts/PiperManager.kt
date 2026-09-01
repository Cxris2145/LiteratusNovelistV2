package com.literatus.novelist.tts

import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import android.content.res.AssetManager

class PiperManager(private val context: Context) {
    private var tts: OfflineTts? = null
    private var isInitialized = false
    private var currentModelPath = ""

    fun init(modelName: String = "es_AR-daniela-high") {
        val modelPath = "piper/$modelName.onnx"
        if (isInitialized && currentModelPath == modelPath) return
        
        try {
            if (tts != null) {
                tts?.release()
                tts = null
            }

            val espeakDataPath = copyEspeakData(context)
            val vitsConfig = OfflineTtsVitsModelConfig(
                model = modelPath,
                tokens = "piper/tokens.txt",
                dataDir = espeakDataPath,
                noiseScale = 0.667f,     // Variabilidad del habla (default 0.667)
                noiseScaleW = 0.8f,      // Variabilidad fonética (default 0.8)
                lengthScale = 1.15f      // Hacer que hable 15% más lento para mejorar mucho la dicción
            )
            
            val modelConfig = OfflineTtsModelConfig(
                vits = vitsConfig,
                numThreads = 2,
                debug = false
            )
            
            val config = OfflineTtsConfig(
                model = modelConfig,
                maxNumSentences = 1
            )

            tts = OfflineTts(assetManager = context.assets, config = config)
            isInitialized = true
            currentModelPath = modelPath
            Log.d("PiperManager", "Piper TTS cargó el modelo: $modelName")
        } catch (e: Exception) {
            Log.e("PiperManager", "Error inicializando Piper TTS con $modelName", e)
        }
    }

    suspend fun generateAndPlay(text: String, onComplete: () -> Unit) = withContext(Dispatchers.IO) {
        val engine = tts ?: run {
            Log.e("PiperManager", "TTS no inicializado")
            withContext(Dispatchers.Main) { onComplete() }
            return@withContext
        }

        try {
            val startTime = System.currentTimeMillis()
            Log.d("PiperManager", "Iniciando generación de audio con Piper...")
            
            val audio = engine.generate(text)
            if (audio == null) {
                withContext(Dispatchers.Main) { onComplete() }
                return@withContext
            }

            val genTime = System.currentTimeMillis() - startTime
            Log.d("PiperManager", "Generación completada en \$genTime ms")

            val samples = audio.samples
            val sampleRate = audio.sampleRate

            // Convertir Float a 16-bit PCM (Short) para máxima compatibilidad en Android
            val shortSamples = ShortArray(samples.size)
            for (i in samples.indices) {
                var s = samples[i]
                if (s > 1.0f) s = 1.0f
                if (s < -1.0f) s = -1.0f
                shortSamples[i] = (s * 32767).toInt().toShort()
            }

            val audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    android.media.AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(shortSamples.size * 2) // Short = 2 bytes
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()

            Log.d("PiperManager", "Iniciando reproducción...")
            audioTrack.write(shortSamples, 0, shortSamples.size, AudioTrack.WRITE_BLOCKING)
            audioTrack.play()

            // Esperar el tiempo exacto que dura el audio
            val durationMs = (samples.size.toFloat() / sampleRate * 1000).toLong()
            Thread.sleep(durationMs + 100)

            audioTrack.release()
            
            withContext(Dispatchers.Main) {
                onComplete()
            }
        } catch (e: Exception) {
            Log.e("PiperManager", "Error al generar o reproducir audio en Piper", e)
            withContext(Dispatchers.Main) {
                onComplete()
            }
        }
    }

    fun stop() {
        // En un futuro se puede abortar la reproducción actual.
        // Por ahora, Piper procesa rápido en modo VITS offline.
    }

    private fun copyEspeakData(context: Context): String {
        val dataDir = File(context.filesDir, "espeak-ng-data")
        if (!dataDir.exists() || (dataDir.listFiles()?.isEmpty() == true)) {
            Log.d("PiperManager", "Copiando espeak-ng-data desde assets a internal storage...")
            copyAssetFolder(context.assets, "piper/espeak-ng-data", dataDir.absolutePath)
        }
        return dataDir.absolutePath
    }

    private fun copyAssetFolder(assetManager: AssetManager, srcFolder: String, destPath: String) {
        val files = assetManager.list(srcFolder) ?: return
        val destFolder = File(destPath)
        if (!destFolder.exists()) destFolder.mkdirs()

        for (file in files) {
            val srcFile = "$srcFolder/$file"
            val destFile = File(destFolder, file)
            val subFiles = assetManager.list(srcFile)
            if (subFiles != null && subFiles.isNotEmpty()) {
                copyAssetFolder(assetManager, srcFile, destFile.absolutePath)
            } else {
                assetManager.open(srcFile).use { input ->
                    FileOutputStream(destFile).use { output ->
                        input.copyTo(output)
                    }
                }
            }
        }
    }
}

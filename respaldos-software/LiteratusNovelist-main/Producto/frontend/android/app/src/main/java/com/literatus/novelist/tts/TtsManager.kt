package com.literatus.novelist.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import android.speech.tts.Voice
import com.literatus.novelist.utils.PrefsHelper
import com.literatus.novelist.kokoro.OnnxRuntimeManager
import com.literatus.novelist.kokoro.PhonemeConverter
import com.literatus.novelist.kokoro.createAudio
import com.literatus.novelist.kokoro.playAudio
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

data class TtsVoice(val name: String, val displayName: String, val language: String, val engineType: String)

private const val TAG = "TtsManager"

enum class ModelStatus {
    NotLoaded, Downloading, Ready, Error
}

class TtsManager {
    private var tts: TextToSpeech? = null
    private val isInitialized = AtomicBoolean(false)
    private val isSpeaking = AtomicBoolean(false)
    
    private val speechQueue = ArrayDeque<String>()
    private val queueLock = Any()
    
    var onStatusChanged: ((ModelStatus) -> Unit)? = null
    var onSpeakingChanged: ((Boolean) -> Unit)? = null
    var onVoicesLoaded: ((List<TtsVoice>) -> Unit)? = null

    private var availableVoices = mutableListOf<TtsVoice>()
    private var currentVoiceName: String? = null
    
    // Kokoro Variables
    private lateinit var phonemeConverter: PhonemeConverter
    private val scope = MainScope()
    private lateinit var appContext: Context
    
    // Piper VITS
    private var piperManager: PiperManager? = null

    fun initialize(context: Context) {
        appContext = context.applicationContext
        onStatusChanged?.invoke(ModelStatus.Downloading)
        
        // Inicializar Piper
        piperManager = PiperManager(context.applicationContext)
        piperManager?.init()
        
        // Inicializar Kokoro ONNX
        scope.launch(Dispatchers.IO) {
            try {
                OnnxRuntimeManager.initialize(appContext!!, "kokoro-v1.0.int8.onnx")
                phonemeConverter = PhonemeConverter(appContext!!)
                Log.d(TAG, "Kokoro ONNX Initialized Successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Error initializing Kokoro: ", e)
            }
        }

        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                loadVoices()
                configureVoice(PrefsHelper.getSelectedVoice(context))
                isInitialized.set(true)
                onStatusChanged?.invoke(ModelStatus.Ready)
            } else {
                onStatusChanged?.invoke(ModelStatus.Error)
            }
        }
    }

    private fun loadVoices() {
        val engine = tts ?: return
        try {
            availableVoices.clear()
            
            // Añadir voces de Piper (VITS Ultraligera)
            availableVoices.add(TtsVoice("piper_es_AR-daniela-high", "Femenina Daniela - AR (Piper HD)", "Español", "Piper VITS (Local)"))
            availableVoices.add(TtsVoice("piper_es_MX-claude-high", "Femenina Claude - MX (Piper HD)", "Español", "Piper VITS (Local)"))
            availableVoices.add(TtsVoice("piper_es_ES-sharvard-medium", "Femenina Sharvard - ES (Piper)", "Español", "Piper VITS (Local)"))
            availableVoices.add(TtsVoice("piper_es_ES-davefx-medium", "Masculina Dave - ES (Piper)", "Español", "Piper VITS (Local)"))
            
            // Añadir voces de Kokoro (Offline)
            // Solo añadimos las voces de las que realmente tenemos los archivos .npy copiados
            val kokoroVoices = listOf("af_sarah", "af_bella", "am_adam", "bf_emma", "ef_dora") 
            
            kokoroVoices.forEach { name ->
                val display = name.replace("af_", "Femenina US (Kokoro) ")
                                 .replace("am_", "Masculina US (Kokoro) ")
                                 .replace("bf_", "Femenina UK (Kokoro) ")
                                 .replace("ef_", "Femenina ES (Kokoro) ")
                availableVoices.add(TtsVoice(name, display.replaceFirstChar { it.uppercase() }, "Inglés/Español", "Kokoro ONNX (Local)"))
            }
            
            val voices = tts?.voices ?: return
            val androidVoices = voices.filter { it.locale.language.startsWith("es") }
                .map { voice ->
                    val isNetwork = voice.features?.contains("networkTts") == true
                    val engineName = if (isNetwork) "☁️ Android (Nube HD)" else "📱 Android (Local Estándar)"
                    TtsVoice(voice.name, formatVoiceName(voice), voice.locale.displayName, engineName)
                }
                
            // Ordenar por calidad: primero HD, luego Locales
            availableVoices.addAll(androidVoices.sortedByDescending { it.engineType.contains("HD") })
            
            onVoicesLoaded?.invoke(availableVoices)
        } catch (e: Exception) {
            Log.e(TAG, "Error cargando voces", e)
        }
    }

    private fun formatVoiceName(voice: Voice): String {
        val name = voice.name.lowercase(java.util.Locale.ROOT)
        
        val region = when {
            name.contains("es-es") -> "España"
            name.contains("es-mx") -> "México"
            name.contains("es-us") -> "US Latina"
            else -> "Español"
        }
        
        val quality = if (voice.features?.contains("networkTts") == true) "⭐️ HD Realista" else "Básica"
        
        // Extraer un identificador corto (como 'SFG' o 'EED') para diferenciarlas
        val idParts = name.split("-")
        val uniqueId = if (idParts.size >= 4) idParts[3].uppercase(java.util.Locale.ROOT) else ""
        
        return "Voz \$region \$uniqueId (\$quality)".trim()
    }

    fun configureVoice(preferredVoiceName: String? = null) {
        currentVoiceName = preferredVoiceName
        val engine = tts ?: return
        var voiceSet = false
        if (preferredVoiceName != null && preferredVoiceName.isNotEmpty() && !preferredVoiceName.contains("_")) {
            val selectedVoice = engine.voices?.find { it.name == preferredVoiceName }
            if (selectedVoice != null) {
                engine.voice = selectedVoice
                voiceSet = true
            }
        }

        if (!voiceSet) {
            val localeEs = Locale("es", "MX")
            if (engine.setLanguage(localeEs) == TextToSpeech.LANG_MISSING_DATA) {
                engine.setLanguage(Locale.US)
            }
        }

        engine.setSpeechRate(0.95f)
        engine.setPitch(1.05f)

        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                isSpeaking.set(true)
                onSpeakingChanged?.invoke(true)
            }
            override fun onDone(utteranceId: String?) {
                val next = synchronized(queueLock) { speechQueue.removeFirstOrNull() }
                if (next != null) speakInternal(next) else {
                    isSpeaking.set(false)
                    onSpeakingChanged?.invoke(false)
                }
            }
            override fun onError(utteranceId: String?) {
                isSpeaking.set(false)
                onSpeakingChanged?.invoke(false)
            }
        })
    }

    fun speak(text: String) {
        val cleaned = cleanTextForSpeech(text)
        if (cleaned.isEmpty() || !isInitialized.get()) return
        
        // Split text into chunks to avoid Android's 4000 char limit and improve response time
        val chunks = splitTextIntoChunks(cleaned)
        
        val shouldSpeak = synchronized(queueLock) {
            val wasSpeaking = isSpeaking.get()
            speechQueue.addAll(chunks)
            if (!wasSpeaking && speechQueue.isNotEmpty()) {
                isSpeaking.set(true)
                true
            } else {
                false
            }
        }
        
        if (shouldSpeak) {
            val firstChunk = synchronized(queueLock) { speechQueue.removeFirstOrNull() }
            if (firstChunk != null) {
                speakInternal(firstChunk)
            } else {
                isSpeaking.set(false)
            }
        }
    }

    private fun splitTextIntoChunks(text: String): List<String> {
        val maxChunkLength = 400
        val regex = Regex("(?<=[.?!;:])\\s+")
        val sentences = text.split(regex)
        
        val chunks = mutableListOf<String>()
        var currentChunk = ""
        
        for (sentence in sentences) {
            val trimmed = sentence.trim()
            if (trimmed.isEmpty()) continue
            
            if (currentChunk.length + trimmed.length > maxChunkLength && currentChunk.isNotEmpty()) {
                chunks.add(currentChunk)
                currentChunk = trimmed
            } else {
                currentChunk = if (currentChunk.isEmpty()) trimmed else "$currentChunk $trimmed"
            }
        }
        if (currentChunk.isNotEmpty()) {
            chunks.add(currentChunk)
        }
        return chunks
    }

    private fun speakInternal(text: String) {
        isSpeaking.set(true)
        onSpeakingChanged?.invoke(true)
        
        if (currentVoiceName?.startsWith("piper_") == true) {
            val modelName = currentVoiceName!!.removePrefix("piper_")
            scope.launch(Dispatchers.IO) {
                piperManager?.init(modelName)
                piperManager?.generateAndPlay(text) {
                    val next = synchronized(queueLock) { speechQueue.removeFirstOrNull() }
                    if (next != null) speakInternal(next) else {
                        isSpeaking.set(false)
                        onSpeakingChanged?.invoke(false)
                    }
                }
            }
        } else if (currentVoiceName != null && currentVoiceName!!.contains("_")) {
            scope.launch(Dispatchers.IO) {
                try {
                    val session = OnnxRuntimeManager.getSession()
                    val lang = if (currentVoiceName!!.startsWith("e")) "es" else "en-us"
                    val phonemes = phonemeConverter.phonemize(text, lang = lang)
                    Log.d(TAG, "Kokoro Phonemes: \$phonemes")
                    val (audioData, _) = createAudio(voice = currentVoiceName!!, phonemes = phonemes, speed = 1.0f, context = appContext, session = session)
                    
                    playAudio(audioData, scope, onComplete = {
                        val next = synchronized(queueLock) { speechQueue.removeFirstOrNull() }
                        if (next != null) speakInternal(next) else {
                            isSpeaking.set(false)
                            onSpeakingChanged?.invoke(false)
                        }
                    })
                } catch (e: Exception) {
                    Log.e(TAG, "Kokoro Exception: ", e)
                    // Si falla una oración, intentar continuar con la siguiente
                    val next = synchronized(queueLock) { speechQueue.removeFirstOrNull() }
                    if (next != null) speakInternal(next) else {
                        isSpeaking.set(false)
                        onSpeakingChanged?.invoke(false)
                    }
                }
            }
        } else {
            // Android TTS nativo
            val isEnglish = text.contains(Regex("\\b(the|is|you|to|and|it|we|in|of|that)\\b", RegexOption.IGNORE_CASE))
            if (isEnglish) {
                tts?.language = java.util.Locale.US
            } else {
                tts?.language = java.util.Locale("es", "MX")
            }
            tts?.speak(text, TextToSpeech.QUEUE_ADD, null, java.util.UUID.randomUUID().toString())
        }
    }

    private fun cleanTextForSpeech(text: String): String {
        return text.replace(Regex("\\*\\*(.+?)\\*\\*"), "$1")
            .replace(Regex("\\*(.+?)\\*"), "$1")
            .replace(Regex("`(.+?)`"), "$1")
            .replace(Regex("[🤖👤🎮⚡🧠🔊💡]"), "")
            .replace("  ", " ").trim()
    }

    fun stop() {
        synchronized(queueLock) { speechQueue.clear() }
        isSpeaking.set(false)
        onSpeakingChanged?.invoke(false)
        tts?.stop()
    }

    fun isReady(): Boolean = isInitialized.get()

    fun release() {
        stop()
        tts?.shutdown()
        tts = null
        isInitialized.set(false)
        scope.cancel()
    }
}

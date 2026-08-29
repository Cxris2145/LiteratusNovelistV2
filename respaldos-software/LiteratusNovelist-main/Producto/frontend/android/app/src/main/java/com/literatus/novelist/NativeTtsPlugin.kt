package com.literatus.novelist

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.literatus.novelist.tts.TtsManager

@CapacitorPlugin(name = "NativeTts")
class NativeTtsPlugin : Plugin() {

    private lateinit var ttsManager: TtsManager

    override fun load() {
        super.load()
        ttsManager = TtsManager()
        
        // Ejecutar inicialización en el hilo principal si es necesario o en background
        ttsManager.initialize(context)

        ttsManager.onStatusChanged = { status ->
            val ret = JSObject()
            ret.put("status", status.name)
            notifyListeners("statusChanged", ret)
        }

        ttsManager.onSpeakingChanged = { isSpeaking ->
            val ret = JSObject()
            ret.put("isSpeaking", isSpeaking)
            notifyListeners("speakingChanged", ret)
        }

        ttsManager.onVoicesLoaded = { voices ->
            val ret = JSObject()
            // Podríamos enviar la lista de voces, por simplicidad solo notificamos que están listas
            ret.put("count", voices.size)
            notifyListeners("voicesLoaded", ret)
        }
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text") ?: ""
        ttsManager.speak(text)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        ttsManager.stop()
        call.resolve()
    }

    @PluginMethod
    fun setVoice(call: PluginCall) {
        val voiceId = call.getString("voiceId")
        ttsManager.configureVoice(voiceId)
        call.resolve()
    }
}

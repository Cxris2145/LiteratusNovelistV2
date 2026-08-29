package com.literatus.novelist.utils

import android.content.Context

/**
 * Helper simple para SharedPreferences.
 * Guarda la API Key de DeepSeek de forma segura en el dispositivo.
 */
object PrefsHelper {

    private const val PREFS_NAME = "uvi_prefs"
    private const val KEY_API_KEY = "deepseek_api_key"

    fun saveApiKey(context: Context, key: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_API_KEY, key.trim())
            .apply()
    }

    fun getApiKey(context: Context): String {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_API_KEY, "") ?: ""
    }

    fun hasApiKey(context: Context): Boolean = getApiKey(context).isNotEmpty()

    private const val KEY_IMMERSIVE_MODE = "immersive_mode"

    fun saveImmersiveMode(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_IMMERSIVE_MODE, enabled)
            .apply()
    }

    fun getImmersiveMode(context: Context): Boolean {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_IMMERSIVE_MODE, false) // false por defecto
    }

    private const val KEY_SELECTED_VOICE = "selected_voice"

    fun saveSelectedVoice(context: Context, voiceName: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SELECTED_VOICE, voiceName)
            .apply()
    }

    fun getSelectedVoice(context: Context): String? {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SELECTED_VOICE, null)
    }
}

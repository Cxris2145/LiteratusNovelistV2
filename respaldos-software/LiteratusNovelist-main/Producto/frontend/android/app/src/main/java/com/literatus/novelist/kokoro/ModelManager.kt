package com.literatus.novelist.kokoro

import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.OrtSession.SessionOptions
import android.content.Context
import android.util.Log

object OnnxRuntimeManager {
    private var environment: OrtEnvironment? = null
    private var session: OrtSession? = null

    @Synchronized
    fun initialize(context: Context, modelPathInAssets: String) {
        if (environment == null) {
            environment = OrtEnvironment.getEnvironment()
            session = createSession(context, modelPathInAssets)
            Log.d("OnnxManager", "ONNX Runtime Initialized con modelo \$modelPathInAssets")
        }
    }

    private fun createSession(context: Context, modelPath: String): OrtSession {
        val options = SessionOptions().apply {
            addConfigEntry("nnapi.flags", "USE_FP16")
            addConfigEntry("nnapi.use_gpu", "true")
            addConfigEntry("nnapi.gpu_precision_loss_allowed", "true")
        }

        return context.assets.open(modelPath).use { stream ->
            environment!!.createSession(stream.readBytes(), options)
        }
    }

    fun getSession() = requireNotNull(session) { "ONNX Session not initialized" }
}

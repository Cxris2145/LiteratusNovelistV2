package com.literatus.novelist.kokoro

import android.content.Context
import org.jetbrains.bio.npy.NpyArray
import org.jetbrains.bio.npy.NpyFile
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class StyleLoader(private val context: Context) {
    
    val names = listOf(
        "af",
        "af_bella",
        "af_nicole",
        "af_sarah",
        "af_sky",
        "am_adam",
        "am_michael",
        "bf_emma",
        "bf_isabella",
        "bm_george",
        "bm_lewis"
    )

    
    fun getStyleArray(name: String, index: Int = 0): Array<FloatArray> {
        // En UVI, leemos directamente desde la carpeta assets en lugar de res/raw
        val actualName = if (name.endsWith(".npy")) name else "$name.npy"
        
        val inputStream: InputStream = try {
            context.assets.open(actualName)
        } catch (e: Exception) {
            throw IllegalArgumentException("Style '$name' not found in /assets. Error: ${e.message}")
        }

        val tempFile = File.createTempFile("temp_style", ".npy", context.cacheDir)
        tempFile.deleteOnExit() 
        FileOutputStream(tempFile).use { outputStream ->
            inputStream.copyTo(outputStream)
        }

        
        val npyArray: NpyArray = NpyFile.read(tempFile.toPath())

        
        val shape0 = npyArray.shape[0]
        if (npyArray.shape.size != 3 || (shape0 != 511 && shape0 != 510) || npyArray.shape[1] != 1 || npyArray.shape[2] != 256) {
            throw IllegalArgumentException("The loaded .npy file must have the shape (511 or 510, 1, 256). Shape is: \${npyArray.shape.contentToString()}")
        }

        
        if (index < 0 || index >= shape0) {
            throw IllegalArgumentException("Index must be between 0 and \${shape0 - 1}")
        }

        
        val styleArray = Array(1) { FloatArray(256) }
        val floatArray = npyArray.asFloatArray() 

        for (i in 0 until 256) {
            styleArray[0][i] = floatArray[index * 256 + i] 
        }

        return styleArray
    }
}

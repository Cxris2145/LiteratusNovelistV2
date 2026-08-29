package com.literatus.novelist.kokoro

import android.content.Context
import java.io.IOException

class PhonemeConverter(context: Context) {
    private val phonemeMap = mutableMapOf<String, String>()

    init {
        loadDictionary(context)
    }

    private fun loadDictionary(context: Context) {
        // No usaremos el archivo raw cmudict_ipa por ahora.
        // IPA-Transcribers fallbackTranscribe hará el trabajo.
        println("Using IPA-Transcribers fallback for phonemization")
    }

    private fun convertToPhonemes(word: String): String {

        if (word.matches(Regex("[^a-zA-Z']+"))) {
            return word
        }


        val cleanWord = word.replace(Regex("[^a-zA-Z']"), "").uppercase()
        val arpabetWithoutStress = cleanWord.replace(Regex("[0-9]"), "ˈ")
        val phonemes = phonemeMap[arpabetWithoutStress] ?: return fallbackTranscribe(word)



        return phonemes.split(",").first().trim()
    }

    private fun fallbackTranscribe(word: String): String {
        return basicSpanishPhonemizer(word)
    }

    private fun basicSpanishPhonemizer(word: String): String {
        // En caso de que Language.SPANISH no exista, hacer una conversión fonética rudimentaria al español
        // Esto evitará que la voz suene "robótica" por intentar pronunciar diptongos americanos.
        var w = word.lowercase()
        w = w.replace("h", "") // la h es muda
        w = w.replace("v", "b") // v suena como b
        w = w.replace("c", "k") // c -> k (simplificación)
        w = w.replace("qu", "k")
        w = w.replace("z", "s")
        w = w.replace("y", "j")
        w = w.replace("ll", "j")
        w = w.replace("j", "x") // la j en IPA a menudo es x
        return w
    }

    fun phonemize(text: String, lang: String = "en-us", norm: Boolean = true): String {

        val normalizedText = if (norm) normalizeText(text) else text
        println("normalText: $normalizedText")


        val wordsAndPunctuation =
            normalizedText.split(Regex("(?<=\\W)|(?=\\W)")).filter { it.isNotBlank() }


        val phonemes = StringBuilder()
        for ((index, word) in wordsAndPunctuation.withIndex()) {
            println("word: $word")
            val ipaPhonemes = if (word.matches(Regex("[^a-zA-Z']+"))) {
                word
            } else {
                val temp =
                    convertToPhonemes(word).replace(" ", "").replace("ˌ", "")
                adjustStressMarkers(temp)
            }


            if (index > 0 && !word.matches(Regex("[^a-zA-Z']+"))) {
                phonemes.append(" ")
            }
            phonemes.append(ipaPhonemes)
        }


        return postProcessPhonemes(phonemes.toString(), lang)
    }

    fun adjustStressMarkers(input: String): String {

        val vowels = setOf(
            'a',
            'e',
            'i',
            'o',
            'u',
            'ɑ',
            'ɐ',
            'ɒ',
            'æ',
            'ɔ',
            'ə',
            'ɘ',
            'ɚ',
            'ɛ',
            'ɜ',
            'ɝ',
            'ɞ',
            'ɪ',
            'ɨ',
            'ø',
            'ɵ',
            'œ',
            'ɶ',
            'ʉ',
            'ʊ',
            'ʌ',
            'A',
            'E',
            'I',
            'O',
            'U',
            'ː',
            'ˑ'
        )

        val builder = StringBuilder(input)
        var i = 0

        while (i < builder.length) {
            if (builder[i] == 'ˈ' || builder[i] == 'ˌ') {

                val stressIndex = i
                val stressChar = builder[i]

                for (j in stressIndex + 1 until builder.length) {
                    if (builder[j] in vowels) {

                        builder.deleteCharAt(stressIndex)
                        builder.insert(j - 1, stressChar)
                        i = j
                        break
                    }
                }
            }
            i++
        }

        return builder.toString()
    }


    private fun normalizeText(text: String): String {
        var normalizedText = text
            .lines()
            .joinToString("\n") { it.trim() }
            .replace("[‘’]".toRegex(), "'")
            .replace("[“”«»]".toRegex(), "\"")
            .replace("[、。！，：；？]".toRegex()) { match ->
                when (match.value) {
                    "、" -> ","
                    "。" -> "."
                    "！" -> "!"
                    "，" -> ","
                    "：" -> ":"
                    "；" -> ";"
                    "？" -> "?"
                    else -> match.value
                } + " "
            }


        normalizedText = normalizedText
            .replace(Regex("\\bD[Rr]\\.(?= [A-Z])"), "Doctor")
            .replace(Regex("\\b(?:Mr\\.|MR\\.(?= [A-Z]))"), "Mister")
            .replace(Regex("\\b(?:Ms\\.|MS\\.(?= [A-Z]))"), "Miss")
            .replace(Regex("\\b(?:Mrs\\.|MRS\\.(?= [A-Z]))"), "Mrs")
            .replace(Regex("\\betc\\.(?! [A-Z])"), "etc")


        normalizedText = normalizedText.replace(Regex("(?<=\\d),(?=\\d)"), "")
        normalizedText = normalizedText.replace(Regex("(?<=\\d)-(?=\\d)"), " to ")

        return normalizedText.trim()
    }

    private fun postProcessPhonemes(phonemes: String, lang: String): String {
        var result = phonemes
        
        // Solo aplicar reglas inglesas si lang es en-us
        if (lang == "en-us") {
            result = result.replace("r", "ɹ")
                .replace("x", "k")
                .replace("ʲ", "j")
                .replace("ɬ", "l")
                .replace("kəkˈoːɹoʊ", "kˈoʊkəɹoʊ")
                .replace("kəkˈɔːɹəʊ", "kˈəʊkəɹəʊ")
                .replace("ti", "di")
        }

        result = result.filter { it in VOCAB.keys || it.toString().matches(Regex("[^a-zA-Z']+")) }

        return result.trim()
    }

    companion object {

        private val VOCAB: Map<Char, Int> = run {
            val pad = '$'
            val punctuation = ";:,.!?¡¿—…\"«»“” "
            val letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
            val lettersIpa =
                "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"

            val symbols =
                listOf(pad) + punctuation.toList() + letters.toList() + lettersIpa.toList()

            symbols.withIndex().associate { (index, char) -> char to index }
        }
    }
}

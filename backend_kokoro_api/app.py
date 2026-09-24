from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from kokoro import KPipeline
import soundfile as sf
import io
from fastapi.middleware.cors import CORSMiddleware

pipeline_es = KPipeline(lang_code='e')
pipeline_en = KPipeline(lang_code='a')

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class TTSRequest(BaseModel):
    input: str
    voice: str = "ef_dora"
    speed: float = 1.0

@app.post("/v1/audio/speech")
def generate_audio(req: TTSRequest):
    try:
        pipeline = pipeline_en if req.voice.startswith('a') or req.voice.startswith('b') else pipeline_es
        generator = pipeline(req.input, voice=req.voice, speed=req.speed, split_pattern=r'\n+')
        audio_data = []
        for i, (gs, ps, audio) in enumerate(generator):
            if audio is not None:
                audio_data.extend(audio.tolist())
        if not audio_data: return Response(content=b"", status_code=500)
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, 24000, format='wav')
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except Exception as e:
        return Response(content=str(e), status_code=500)

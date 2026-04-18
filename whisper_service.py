from fastapi import FastAPI, HTTPException
from faster_whisper import WhisperModel
from pydantic import BaseModel
import uvicorn

app = FastAPI()
model = WhisperModel("small", device="cpu", compute_type="int8")


class TranscribeRequest(BaseModel):
    audio_path: str
    language: str = "ru"


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    try:
        print(f"[whisper] audio_path: {req.audio_path}")
        print(f"[whisper] language: {req.language}")
        segments, info = model.transcribe(
            req.audio_path,
            word_timestamps=True,
            language=req.language if req.language else None,
            beam_size=5,
        )
        words = []
        for segment in segments:
            if segment.words:
                for word in segment.words:
                    words.append(
                        {
                            "word": word.word,
                            "start": round(word.start, 3),
                            "end": round(word.end, 3),
                        }
                    )
        print(f"[whisper] detected language: {info.language}, words count: {len(words)}")
        if words:
            print(f"[whisper] first 3 words: {words[:3]}")
            print(f"[whisper] last 3 words: {words[-3:]}")
        return {"words": words}
    except Exception as e:
        print(f"[whisper] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)

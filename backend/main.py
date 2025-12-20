import os
import traceback

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import google.generativeai as genai
from deepgram import DeepgramClient
import deepgram.errors as dg_errors

# =========================
# ENV SETUP
# =========================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")

# Gemini 2.5 Flash
MODEL_NAME = "gemini-2.5-flash"

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")
if not DEEPGRAM_API_KEY:
    raise RuntimeError("DEEPGRAM_API_KEY not set")

genai.configure(api_key=GEMINI_API_KEY)

dg_client = DeepgramClient(api_key=DEEPGRAM_API_KEY)

# =========================
# FASTAPI
# =========================
app = FastAPI(title="Healthcare Translator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TranslateResponse(BaseModel):
    translation: str
    notes: str | None = None

# =========================
# HELPERS
# =========================
def extract_transcript(dg_response) -> str:
    try:
        return (
            dg_response.results.channels[0]
            .alternatives[0]
            .transcript
        )
    except Exception:
        return ""

# =========================
# API ENDPOINT
# =========================
@app.post("/api/transcribe_and_translate", response_model=TranslateResponse)
async def transcribe_and_translate(
    file: UploadFile = File(...),
    src_lang: str = Form("en"),
    tgt_lang: str = Form("hi"),
):
    audio_bytes = await file.read()
    if not audio_bytes:
        return {"translation": "", "notes": "Empty audio chunk"}

    print(f"→ Audio received: {len(audio_bytes)} bytes ({file.content_type})")

    # ---- Deepgram STT ----
    try:
        dg_response = dg_client.listen.v1.media.transcribe_file(
            request=audio_bytes,
            model="nova-3",
            language=src_lang,
        )
        transcript = extract_transcript(dg_response)
        print("Deepgram transcript:", transcript)

    except dg_errors.bad_request_error.BadRequestError:
        return {
            "translation": "",
            "notes": "Deepgram error: corrupt or unsupported audio chunk",
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "translation": "",
            "notes": f"Deepgram error: {str(e)}",
        }

    if not transcript:
        return {"translation": "", "notes": "No speech detected"}

    # ---- Gemini Translation (TEXT ONLY) ----
    prompt = f"""
You are a professional medical translator.

Translate the following text from {src_lang} to {tgt_lang}.

STRICT RULES:
- Preserve all medical terms exactly (drug names, diagnoses, anatomy)
- Do NOT add explanations unless necessary
- Output ONLY the translated sentence
- No markdown, no bullet points, no quotes

Text:
{transcript}
"""

    try:
        model = genai.GenerativeModel(MODEL_NAME)
        response = model.generate_content(prompt)

        translation_text = response.text.strip()

        return {
            "translation": translation_text,
            "notes": "",
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "translation": transcript,
            "notes": f"Gemini error: {str(e)}",
        }

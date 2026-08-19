import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel


# ============================================================
# CONFIGURATION
# ============================================================

HOST = "0.0.0.0"
PORT = 8005

# SMALLER MODEL = MUCH FASTER LIVE TRANSCRIPTION.
# Final complete transcription is still done by Gemini.
MODEL_SIZE = "base"

DEVICE = "cpu"
COMPUTE_TYPE = "int8"

# Process live audio roughly every 2 chunks.
# The React client sends one chunk every 2 seconds.
LIVE_PROCESS_EVERY_CHUNKS = 2

# Whisper only sees the most recent few seconds instead of
# retranscribing the complete consultation every time.
LIVE_WINDOW_SECONDS = 6


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(title="Doctors Vedika Speech Service")


# ============================================================
# LOAD WHISPER MODEL ONCE
# ============================================================

print("Loading Faster-Whisper model...")
print(f"Model: {MODEL_SIZE}")
print(f"Device: {DEVICE}")
print(f"Compute type: {COMPUTE_TYPE}")

model = WhisperModel(
    MODEL_SIZE,
    device=DEVICE,
    compute_type=COMPUTE_TYPE,
)

print("Faster-Whisper model loaded successfully.")


# Faster-Whisper inference is CPU-heavy. Keep one inference at
# a time and move it to a worker thread so WebSocket messages
# are not blocked while Whisper is running.
model_lock = asyncio.Lock()


# ============================================================
# HELPERS
# ============================================================

def normalize_language(language):
    """Convert frontend language names to Whisper language codes."""

    value = (language or "").strip().lower()

    mapping = {
        "telugu": "te",
        "te": "te",
        "te-in": "te",
        "hindi": "hi",
        "hi": "hi",
        "hi-in": "hi",
        "english": "en",
        "en": "en",
        "en-in": "en",
    }

    return mapping.get(value)


def extract_recent_audio(source_path, output_path):
    """
    Extract only the most recent LIVE_WINDOW_SECONDS from the
    growing WebM recording and convert it to 16 kHz mono WAV.

    FFmpeg is already available in this project.
    """

    command = [
        "ffmpeg",
        "-y",
        "-sseof",
        f"-{LIVE_WINDOW_SECONDS}",
        "-i",
        str(source_path),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        str(output_path),
    ]

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0:
            return
    except Exception:
        return


def transcribe_file_sync(audio_path, language_code):
    """
    Synchronous Whisper inference. This function is executed
    inside asyncio.to_thread().
    """

    segments, info = model.transcribe(
        str(audio_path),
        language=language_code,
        beam_size=1,
        best_of=1,
        temperature=0,
        vad_filter=True,
        condition_on_previous_text=False,
        without_timestamps=False,
    )

    result = []

    for segment in segments:
        text = segment.text.strip()

        if text:
            result.append({
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "text": text,
            })

    detected_language = (
        info.language
        if getattr(info, "language", None)
        else ""
    )

    return result, detected_language


async def transcribe_recent_audio(
    source_path,
    language_code,
    temp_dir,
):
    """
    Whisper sees only the recent window, not the entire
    consultation. This is the main speed improvement.
    """

    recent_wav = Path(temp_dir) / "live_recent.wav"

    await asyncio.to_thread(
        extract_recent_audio,
        source_path,
        recent_wav,
    )

    if not recent_wav.exists() or recent_wav.stat().st_size < 1000:
        return [], ""

    async with model_lock:
        segments, detected_language = await asyncio.to_thread(
            transcribe_file_sync,
            recent_wav,
            language_code,
        )

    return segments, detected_language


def get_new_text(full_text, previous_text):
    """
    The live window overlaps previous results. Remove the
    largest word overlap and return only newly spoken words.
    """

    current_words = " ".join((full_text or "").split()).split()
    previous_words = " ".join((previous_text or "").split()).split()

    if not current_words:
        return ""

    if not previous_words:
        return " ".join(current_words)

    if current_words == previous_words:
        return ""

    # Find the largest suffix of the previous window that is
    # also a prefix of the current window.
    max_overlap = min(
        len(previous_words),
        len(current_words),
    )

    for overlap in range(max_overlap, 0, -1):
        old_tail = [
            word.lower()
            for word in previous_words[-overlap:]
        ]

        new_head = [
            word.lower()
            for word in current_words[:overlap]
        ]

        if old_tail == new_head:
            new_words = current_words[overlap:]
            return " ".join(new_words).strip()

    # If Whisper changed the wording between windows, avoid
    # displaying a completely identical result.
    current_lower = " ".join(current_words).lower()
    previous_lower = " ".join(previous_words).lower()

    if current_lower == previous_lower:
        return ""

    return " ".join(current_words).strip()


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
async def root():
    return {
        "success": True,
        "service": "Doctors Vedika Speech Service",
        "status": "running",
        "model": MODEL_SIZE,
        "websocket": "/ws/live",
    }


# ============================================================
# WEBSOCKET
# ============================================================

@app.websocket("/ws/live")
async def live_transcription(websocket: WebSocket):

    await websocket.accept()

    print("WebSocket client connected.")

    doctor_id = websocket.query_params.get(
        "doctor_id",
        "default-doctor",
    )

    patient_id = websocket.query_params.get(
        "patient_id",
        "default-patient",
    )

    language = websocket.query_params.get(
        "language",
        "auto",
    )

    language_code = normalize_language(language)

    print(
        f"Doctor: {doctor_id} | "
        f"Patient: {patient_id} | "
        f"Language: {language} | "
        f"Whisper language: {language_code or 'auto'}"
    )

    temp_dir = tempfile.mkdtemp(
        prefix="doctors_vedika_"
    )

    audio_path = Path(temp_dir) / "consultation.webm"

    chunk_count = 0
    last_processed_chunk = 0
    previous_live_text = ""
    latest_language = language_code or ""

    try:

        await websocket.send_json({
            "type": "connected",
            "message": "Speech processing server connected.",
        })

        while True:

            message = await websocket.receive()

            # ------------------------------------------------
            # TEXT MESSAGE
            # ------------------------------------------------

            if message.get("text") is not None:

                text = message["text"]

                try:
                    data = json.loads(text)
                except json.JSONDecodeError:
                    data = {
                        "type": "text",
                        "text": text,
                    }

                message_type = data.get("type")

                if message_type == "ping":
                    await websocket.send_json({
                        "type": "pong",
                    })
                    continue

                if message_type == "stop":

                    print("Stopping live transcription.")

                    await websocket.send_json({
                        "type": "stopped",
                        "message": "Speech processing stopped.",
                    })

                    break

                continue

            # ------------------------------------------------
            # AUDIO MESSAGE
            # ------------------------------------------------

            if message.get("bytes") is not None:

                audio_bytes = message["bytes"]

                if not audio_bytes:
                    continue

                chunk_count += 1

                print(
                    f"Received audio chunk #{chunk_count}: "
                    f"{len(audio_bytes)} bytes"
                )

                with open(audio_path, "ab") as audio_file:
                    audio_file.write(audio_bytes)

                # Don't start Whisper for every tiny chunk.
                # This prevents the CPU from constantly falling
                # behind the microphone.
                if (
                    chunk_count - last_processed_chunk
                    < LIVE_PROCESS_EVERY_CHUNKS
                ):
                    continue

                last_processed_chunk = chunk_count

                try:

                    segments, detected_language = (
                        await transcribe_recent_audio(
                            audio_path,
                            language_code,
                            temp_dir,
                        )
                    )

                    if detected_language:
                        latest_language = detected_language

                    if not segments:
                        continue

                    # Combine the recent window into one readable
                    # piece of text.
                    current_text = " ".join(
                        segment["text"]
                        for segment in segments
                    ).strip()

                    new_text = get_new_text(
                        current_text,
                        previous_live_text,
                    )

                    # Keep the complete current window for the
                    # next overlap comparison.
                    previous_live_text = current_text

                    if not new_text:
                        continue

                    latest_segment = segments[-1]

                    await websocket.send_json({
                        "type": "transcript",
                        "speaker": "Unknown",
                        "timestamp": round(
                            latest_segment["end"],
                            2,
                        ),
                        "text": new_text,
                        "language": latest_language,
                    })

                except Exception as transcription_error:

                    print(
                        "Live transcription error:",
                        transcription_error,
                    )

                    # Keep WebSocket alive.
                    continue

    except WebSocketDisconnect:

        print("WebSocket client disconnected.")

    except Exception as error:

        print(
            "WebSocket server error:",
            error,
        )

        try:
            await websocket.send_json({
                "type": "error",
                "message": str(error),
            })
        except Exception:
            pass

    finally:

        try:
            if audio_path.exists():
                audio_path.unlink()

            shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )

        except Exception:
            pass

        print("Speech session finished.")


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    print("")
    print("==============================================")
    print(" Doctors Vedika Speech Service")
    print("==============================================")
    print(f" Server: http://localhost:{PORT}")
    print(f" WebSocket: ws://localhost:{PORT}/ws/live")
    print(f" Live model: {MODEL_SIZE}")
    print("==============================================")
    print("")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
    )
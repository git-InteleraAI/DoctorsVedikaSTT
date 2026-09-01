import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect


# ============================================================
# CONFIGURATION
# ============================================================

HOST = os.getenv("SPEECH_HOST", "0.0.0.0")
PORT = int(os.getenv("SPEECH_PORT", "8005"))


# ============================================================
# SARVAM CONFIGURATION
# ============================================================

SARVAM_API_KEY = os.getenv(
    "SARVAM_API_KEY",
    "",
).strip()

# Sarvam example currently being used in your integration:
# saaras:v3 + mode=transcribe
SARVAM_STT_MODEL = os.getenv(
    "SARVAM_STT_MODEL",
    "saaras:v3",
).strip()

SARVAM_STT_MODE = os.getenv(
    "SARVAM_STT_MODE",
    "transcribe",
).strip()

SARVAM_STT_URL = os.getenv(
    "SARVAM_STT_URL",
    "https://api.sarvam.ai/speech-to-text",
).strip()


# ============================================================
# LANGUAGE
# ============================================================

# unknown = Sarvam determines the language.
#
# Do NOT force Telugu/Hindi/English because a consultation can
# contain mixed Telugu + Hindi + English.
SARVAM_LANGUAGE_CODE = os.getenv(
    "SARVAM_LANGUAGE_CODE",
    "unknown",
).strip()


# ============================================================
# AUDIO PROCESSING
# ============================================================

# Your frontend currently sends approximately one MediaRecorder
# chunk every 2 seconds.
AUDIO_CHUNK_SECONDS = 2


# Process approximately every 1 chunks.
#
# 1 chunks × ~2 seconds = ~2 seconds.
#
# This provides a reasonable balance between:
# - live responsiveness
# - Sarvam API calls
# - production concurrency
PROCESS_EVERY_CHUNKS = int(
    os.getenv(
        "PROCESS_EVERY_CHUNKS",
        "1",
    )
)


# Every Sarvam request receives a slightly larger overlapping
# window. This reduces word loss at chunk boundaries.
AUDIO_WINDOW_SECONDS = int(
    os.getenv(
        "AUDIO_WINDOW_SECONDS",
        "8",
    )
)


# ============================================================
# HTTP TIMEOUTS
# ============================================================

SARVAM_CONNECT_TIMEOUT = float(
    os.getenv(
        "SARVAM_CONNECT_TIMEOUT",
        "5",
    )
)

SARVAM_WRITE_TIMEOUT = float(
    os.getenv(
        "SARVAM_WRITE_TIMEOUT",
        "15",
    )
)

SARVAM_READ_TIMEOUT = float(
    os.getenv(
        "SARVAM_READ_TIMEOUT",
        "30",
    )
)

SARVAM_POOL_TIMEOUT = float(
    os.getenv(
        "SARVAM_POOL_TIMEOUT",
        "5",
    )
)


# ============================================================
# PRODUCTION CONCURRENCY
# ============================================================

# This is NOT a per-consultation lock.
#
# Different doctors can have independent consultations.
#
# The semaphore simply prevents an unlimited number of outgoing
# Sarvam requests from being created simultaneously.
MAX_CONCURRENT_SARVAM_REQUESTS = int(
    os.getenv(
        "MAX_CONCURRENT_SARVAM_REQUESTS",
        "20",
    )
)

sarvam_semaphore = asyncio.Semaphore(
    MAX_CONCURRENT_SARVAM_REQUESTS
)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Doctors Vedika Speech Service",
    version="3.0.0",
)


# ============================================================
# SHARED HTTP CLIENT
# ============================================================

http_client: Optional[httpx.AsyncClient] = None


@app.on_event("startup")
async def startup_event():
    global http_client

    timeout = httpx.Timeout(
        connect=SARVAM_CONNECT_TIMEOUT,
        read=SARVAM_READ_TIMEOUT,
        write=SARVAM_WRITE_TIMEOUT,
        pool=SARVAM_POOL_TIMEOUT,
    )

    http_client = httpx.AsyncClient(
        timeout=timeout,
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=50,
        ),
    )

    print("")
    print("==============================================")
    print(" Doctors Vedika Speech Service")
    print("==============================================")
    print(f"STT Provider: Sarvam AI")
    print(f"STT Model: {SARVAM_STT_MODEL}")
    print(f"STT Mode: {SARVAM_STT_MODE}")
    print(f"STT URL: {SARVAM_STT_URL}")
    print(
        f"API Key configured: "
        f"{bool(SARVAM_API_KEY)}"
    )
    print(
        f"Max concurrent Sarvam requests: "
        f"{MAX_CONCURRENT_SARVAM_REQUESTS}"
    )
    print("==============================================")
    print("")


@app.on_event("shutdown")
async def shutdown_event():
    global http_client

    if http_client is not None:
        await http_client.aclose()
        http_client = None


# ============================================================
# LANGUAGE HELPERS
# ============================================================

def normalize_language(language):
    """
    Convert frontend language values to Sarvam language codes.

    Auto / unknown:
        unknown

    Telugu:
        te-IN

    Hindi:
        hi-IN

    English:
        en-IN

    For your consultation flow we normally keep this as
    "unknown" so Sarvam can detect the language.
    """

    value = str(language or "").strip().lower()

    if not value:
        return "unknown"

    if value in {
        "auto",
        "automatic",
        "unknown",
        "detect",
        "detected",
        "all",
        "all-languages",
    }:
        return "unknown"

    mapping = {
        "telugu": "te-IN",
        "te": "te-IN",
        "te-in": "te-IN",

        "hindi": "hi-IN",
        "hi": "hi-IN",
        "hi-in": "hi-IN",

        "english": "en-IN",
        "en": "en-IN",
        "en-in": "en-IN",
    }

    return mapping.get(
        value,
        "unknown",
    )


# ============================================================
# TEXT HELPERS
# ============================================================

def clean_text(text):
    """
    Normalize whitespace without changing the actual language.

    Important:
    We DO NOT translate Telugu/Hindi into English.
    """

    if text is None:
        return ""

    return " ".join(
        str(text).strip().split()
    )


def normalize_for_comparison(text):
    return clean_text(text).lower()


# ============================================================
# TRANSCRIPT DEDUPLICATION
# ============================================================

def get_new_text(
    current_text,
    previous_text,
):
    """
    Extract only the newly appearing portion of a rolling
    Sarvam transcription window.

    Example:

        Previous:
        patient has fever since yesterday

        Current:
        fever since yesterday and headache

        Result:
        and headache

    The function is deliberately conservative.

    If an overlap cannot be confidently established, we do not
    aggressively delete text because losing medical speech is
    worse than temporarily having duplicate text.
    """

    current_text = clean_text(
        current_text
    )

    previous_text = clean_text(
        previous_text
    )

    if not current_text:
        return ""

    if not previous_text:
        return current_text

    if (
        normalize_for_comparison(current_text)
        ==
        normalize_for_comparison(previous_text)
    ):
        return ""

    current_words = current_text.split()
    previous_words = previous_text.split()

    if not current_words:
        return ""

    if not previous_words:
        return current_text

    max_overlap = min(
        len(current_words),
        len(previous_words),
    )

    import difflib

    # --------------------------------------------------------
    # Exact or fuzzy suffix -> prefix overlap
    # --------------------------------------------------------

    for overlap in range(
        max_overlap,
        0,
        -1,
    ):
        previous_tail_str = " ".join(previous_words[-overlap:]).lower()
        current_head_str = " ".join(current_words[:overlap]).lower()

        ratio = difflib.SequenceMatcher(None, previous_tail_str, current_head_str).ratio()

        # If they are at least 80% similar, we consider it a match
        if ratio > 0.8:
            new_words = current_words[
                overlap:
            ]

            return clean_text(
                " ".join(new_words)
            )

    # --------------------------------------------------------
    # Conservative fallback
    # --------------------------------------------------------
    #
    # Do NOT attempt aggressive fuzzy deletion here.
    #
    # Sarvam may change transliteration between requests,
    # especially with Telugu/Hindi mixed speech.
    #
    # Returning the current text is safer than silently
    # deleting medically relevant words.
    # --------------------------------------------------------

    return current_text


# ============================================================
# AUDIO EXTRACTION
# ============================================================

def extract_recent_audio(
    source_path: Path,
    output_path: Path,
    window_seconds: int,
):
    """
    Extract the latest portion of the growing WebM recording
    and convert it into a standard 16 kHz mono WAV.

    The browser continues sending WebM chunks.

    Sarvam receives the normalized WAV.
    """

    ffmpeg_cmd = shutil.which("ffmpeg") or r"C:\Users\harshini\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.exe"

    # Step 1: Convert the entire growing WebM file into a full WAV file.
    # We do this because ffmpeg's -sseof fails on live WebM streams that 
    # lack a duration header, causing it to extract from the beginning instead.
    temp_wav_path = output_path.with_suffix(".full.wav")
    
    cmd_convert = [
        ffmpeg_cmd,
        "-y",
        "-i", str(source_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        "-f", "wav",
        str(temp_wav_path),
    ]

    res_convert = subprocess.run(
        cmd_convert,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )

    if res_convert.returncode != 0:
        raise RuntimeError(
            "FFmpeg failed while converting WebM to WAV: "
            + res_convert.stderr[-2000:]
        )

    # Step 2: Now that we have a proper WAV file with duration, 
    # we can safely use -sseof to extract the exact window from the end.
    cmd_extract = [
        ffmpeg_cmd,
        "-y",
        "-sseof", f"-{window_seconds}",
        "-i", str(temp_wav_path),
        "-c", "copy",
        str(output_path),
    ]

    res_extract = subprocess.run(
        cmd_extract,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )

    # Clean up the intermediate full WAV file
    try:
        temp_wav_path.unlink()
    except Exception:
        pass

    if res_extract.returncode != 0:
        raise RuntimeError(
            "FFmpeg failed while extracting window from WAV: "
            + res_extract.stderr[-2000:]
        )


async def extract_recent_audio_async(
    source_path: Path,
    output_path: Path,
    window_seconds: int,
):
    await asyncio.to_thread(
        extract_recent_audio,
        source_path,
        output_path,
        window_seconds,
    )


# ============================================================
# SARVAM RESPONSE PARSER
# ============================================================

def parse_sarvam_response(data):
    """
    Parse Sarvam STT response safely.

    We intentionally support a few possible response shapes
    because response metadata can vary between API versions.

    No translation is performed.
    """

    if not isinstance(data, dict):
        return {
            "transcript": "",
            "language": "",
        }

    transcript = ""

    # --------------------------------------------------------
    # Normal response
    # --------------------------------------------------------

    if isinstance(
        data.get("transcript"),
        str,
    ):
        transcript = data.get(
            "transcript",
            "",
        )

    # --------------------------------------------------------
    # Some APIs may return transcript-like data nested inside
    # another object.
    # --------------------------------------------------------

    if not transcript:
        result = data.get("result")

        if isinstance(result, dict):
            nested_transcript = result.get(
                "transcript",
                "",
            )

            if isinstance(
                nested_transcript,
                str,
            ):
                transcript = nested_transcript

    # --------------------------------------------------------
    # Language metadata
    # --------------------------------------------------------

    language = (
        data.get("language_code")
        or data.get("language")
        or ""
    )

    if not language:
        result = data.get("result")

        if isinstance(result, dict):
            language = (
                result.get("language_code")
                or result.get("language")
                or ""
            )

    return {
        "transcript": clean_text(
            transcript
        ),
        "language": str(
            language or ""
        ).strip(),
    }


# ============================================================
# SARVAM STT
# ============================================================

async def transcribe_with_sarvam(
    audio_path: Path,
    language_code: str,
):
    """
    Send one short audio window to Sarvam AI.

    IMPORTANT:

    Gemini is NOT involved here.

    This keeps speech recognition completely separate from
    consultation summarization.
    """

    if not SARVAM_API_KEY:
        raise RuntimeError(
            "SARVAM_API_KEY is not configured."
        )

    if http_client is None:
        raise RuntimeError(
            "Sarvam HTTP client is not initialized."
        )

    if not audio_path.exists():
        return {
            "transcript": "",
            "language": "",
        }

    if audio_path.stat().st_size < 1000:
        return {
            "transcript": "",
            "language": "",
        }

    headers = {
        "api-subscription-key": SARVAM_API_KEY,
    }

    language = (
        language_code
        if language_code
        else SARVAM_LANGUAGE_CODE
    )

    # --------------------------------------------------------
    # Sarvam request fields
    # --------------------------------------------------------

    data = {
        "model": SARVAM_STT_MODEL,
        "mode": SARVAM_STT_MODE,
        "language_code": language,
    }

    started_at = time.perf_counter()

    # --------------------------------------------------------
    # Production concurrency protection
    # --------------------------------------------------------

    async with sarvam_semaphore:

        with open(
            audio_path,
            "rb",
        ) as audio_file:

            files = {
                "file": (
                    "consultation.wav",
                    audio_file,
                    "audio/wav",
                )
            }

            response = await http_client.post(
                SARVAM_STT_URL,
                headers=headers,
                data=data,
                files=files,
            )

    elapsed_ms = (
        time.perf_counter()
        - started_at
    ) * 1000

    print(
        "[Speech] Sarvam request completed "
        f"in {elapsed_ms:.0f} ms"
    )

    # --------------------------------------------------------
    # HTTP error
    # --------------------------------------------------------

    if response.status_code >= 400:

        body = response.text[:3000]

        raise RuntimeError(
            "Sarvam STT request failed "
            f"(HTTP {response.status_code}): "
            f"{body}"
        )

    # --------------------------------------------------------
    # JSON response
    # --------------------------------------------------------

    try:
        result = response.json()

    except Exception as error:

        raise RuntimeError(
            "Sarvam returned a non-JSON response."
        ) from error

    parsed = parse_sarvam_response(
        result
    )

    print(
        "[Speech] Sarvam transcript:",
        parsed.get(
            "transcript",
            "",
        ),
    )

    if parsed.get("language"):
        print(
            "[Speech] Sarvam language:",
            parsed["language"],
        )

    return parsed


# ============================================================
# PROCESS ONE AUDIO WINDOW
# ============================================================

async def process_audio_window(
    source_audio_path: Path,
    temp_dir: Path,
    language_code: str,
):
    """
    Extract the latest audio window and send it to Sarvam.
    """

    wav_path = (
        temp_dir
        / f"window-{time.time_ns()}.wav"
    )

    try:

        await extract_recent_audio_async(
            source_audio_path,
            wav_path,
            AUDIO_WINDOW_SECONDS,
        )

        if (
            not wav_path.exists()
            or wav_path.stat().st_size < 1000
        ):
            return {
                "transcript": "",
                "language": "",
            }

        return await transcribe_with_sarvam(
            wav_path,
            language_code,
        )

    finally:

        try:
            if wav_path.exists():
                wav_path.unlink()

        except Exception:
            pass


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
async def root():

    return {
        "success": True,
        "service": "Doctors Vedika Speech Service",
        "status": "running",
        "provider": "sarvam",
        "model": SARVAM_STT_MODEL,
        "mode": SARVAM_STT_MODE,
        "websocket": "/ws/live",
        "api_key_configured": bool(
            SARVAM_API_KEY
        ),
        "max_concurrent_requests":
            MAX_CONCURRENT_SARVAM_REQUESTS,
    }


@app.get("/health")
async def health():

    return {
        "success": True,
        "status": "healthy",
        "provider": "sarvam",
        "model": SARVAM_STT_MODEL,
        "api_key_configured": bool(
            SARVAM_API_KEY
        ),
    }


# ============================================================
# LIVE WEBSOCKET
# ============================================================

@app.websocket("/ws/live")
async def live_transcription(
    websocket: WebSocket,
):

    await websocket.accept()

    print("")
    print("----------------------------------------------")
    print("[Speech] WebSocket client connected.")
    print("----------------------------------------------")

    # ========================================================
    # SESSION INFORMATION
    # ========================================================

    doctor_id = websocket.query_params.get(
        "doctor_id",
        "default-doctor",
    )

    patient_id = websocket.query_params.get(
        "patient_id",
        "default-patient",
    )

    requested_language = (
        websocket.query_params.get(
            "language",
            "auto",
        )
    )

    language_code = normalize_language(
        requested_language
    )

    print(
        f"[Speech] Doctor: {doctor_id}"
    )

    print(
        f"[Speech] Patient: {patient_id}"
    )

    print(
        "[Speech] Requested language:",
        requested_language,
    )

    print(
        "[Speech] Sarvam language:",
        language_code,
    )

    # ========================================================
    # SESSION TEMP DIRECTORY
    # ========================================================

    temp_dir = Path(
        tempfile.mkdtemp(
            prefix="doctors_vedika_speech_"
        )
    )

    audio_path = (
        temp_dir
        / "consultation.webm"
    )

    # ========================================================
    # SESSION STATE
    # ========================================================

    chunk_count = 0

    last_processed_chunk = 0

    previous_live_text = ""

    latest_language = (
        ""
        if language_code == "unknown"
        else language_code
    )

    # ========================================================
    # COMPLETE TRANSCRIPT
    # ========================================================
    #
    # This is extremely important.
    #
    # We keep every successfully emitted live transcript
    # segment for this consultation.
    #
    # The final consultation should NOT depend on the last
    # 8-second window.
    # ========================================================

    accumulated_transcript = []

    # ========================================================
    # PER SESSION PROCESSING LOCK
    # ========================================================

    processing_lock = asyncio.Lock()

    processing_task = None

    stopped = False

    # ========================================================
    # SEND CONNECTED EVENT
    # ========================================================

    try:

        await websocket.send_json({
            "type": "connected",

            "message":
                "Speech processing server connected.",

            "provider":
                "sarvam",

            "model":
                SARVAM_STT_MODEL,

            "mode":
                SARVAM_STT_MODE,

            "language":
                language_code,
        })

        # ====================================================
        # MAIN MESSAGE LOOP
        # ====================================================

        while not stopped:

            message = await websocket.receive()

            # =================================================
            # TEXT MESSAGE
            # =================================================

            if message.get("text") is not None:

                text = message["text"]

                try:
                    data = json.loads(text)

                except json.JSONDecodeError:

                    data = {
                        "type": "text",
                        "text": text,
                    }

                message_type = data.get(
                    "type"
                )

                # -------------------------------------------------
                # PING
                # -------------------------------------------------

                if message_type == "ping":

                    await websocket.send_json({
                        "type": "pong",
                    })

                    continue

                # -------------------------------------------------
                # STOP
                # -------------------------------------------------

                if message_type == "stop":

                    print(
                        "[Speech] Stop requested."
                    )

                    stopped = True

                    # =============================================
                    # FINAL FLUSH
                    # =============================================
                    #
                    # Process the latest window once more.
                    #
                    # The complete transcript is already stored in
                    # accumulated_transcript.
                    #
                    # This final request only attempts to capture
                    # speech that happened immediately before Stop.
                    # =============================================

                    try:

                        if audio_path.exists():

                            async with processing_lock:

                                final_result = (
                                    await process_audio_window(
                                        audio_path,
                                        temp_dir,
                                        language_code,
                                    )
                                )

                            final_text = clean_text(
                                final_result.get(
                                    "transcript",
                                    "",
                                )
                            )

                            if final_result.get(
                                "language"
                            ):

                                latest_language = (
                                    final_result[
                                        "language"
                                    ]
                                )

                            if final_text:

                                new_text = get_new_text(
                                    final_text,
                                    previous_live_text,
                                )

                                if new_text:

                                    accumulated_transcript.append(
                                        {
                                            "text":
                                                new_text,

                                            "language":
                                                latest_language,

                                            "timestamp":
                                                time.time(),

                                            "isFinal":
                                                True,
                                        }
                                    )

                                    await websocket.send_json({
                                        "type":
                                            "transcript",

                                        "speaker":
                                            "Unknown",

                                        "timestamp":
                                            time.time(),

                                        "text":
                                            new_text,

                                        "language":
                                            latest_language,

                                        "isFinal":
                                            True,

                                        "final":
                                            True,

                                        "provider":
                                            "sarvam",
                                    })

                    except Exception as final_error:

                        print(
                            "[Speech] Final audio flush failed:",
                            final_error,
                        )

                    # =============================================
                    # SEND COMPLETE TRANSCRIPT
                    # =============================================

                    complete_transcript = []

                    for item in accumulated_transcript:

                        text_value = clean_text(
                            item.get(
                                "text",
                                "",
                            )
                        )

                        if not text_value:
                            continue

                        complete_transcript.append({
                            "speaker":
                                "Unknown",

                            "timestamp":
                                item.get(
                                    "timestamp"
                                ),

                            "text":
                                text_value,

                            "language":
                                item.get(
                                    "language",
                                    latest_language,
                                ),

                            "isFinal":
                                True,
                        })

                    complete_text = clean_text(
                        " ".join(
                            item["text"]
                            for item
                            in complete_transcript
                        )
                    )

                    print("")
                    print(
                        "=============================================="
                    )
                    print(
                        "[Speech] COMPLETE TRANSCRIPT"
                    )
                    print(
                        "=============================================="
                    )
                    print(
                        complete_text
                    )
                    print(
                        "=============================================="
                    )
                    print("")

                    # =============================================
                    # COMPLETE EVENT
                    # =============================================

                    await websocket.send_json({
                        "type":
                            "transcript_complete",

                        "transcript":
                            complete_transcript,

                        "fullTranscript":
                            complete_text,

                        "language":
                            latest_language,

                        "provider":
                            "sarvam",

                        "isFinal":
                            True,
                    })

                    # =============================================
                    # STOP EVENT
                    # =============================================

                    try:

                        await websocket.send_json({
                            "type":
                                "stopped",

                            "message":
                                "Speech processing stopped.",

                            "language":
                                latest_language,

                            "provider":
                                "sarvam",

                            "transcript":
                                complete_transcript,

                            "fullTranscript":
                                complete_text,
                        })

                    except Exception:
                        pass

                    break

                continue

            # =================================================
            # AUDIO MESSAGE
            # =================================================

            if message.get("bytes") is not None:

                audio_bytes = message[
                    "bytes"
                ]

                if not audio_bytes:
                    continue

                chunk_count += 1

                print(
                    f"[Speech] Audio chunk "
                    f"#{chunk_count}: "
                    f"{len(audio_bytes)} bytes"
                )

                # =============================================
                # SAVE COMPLETE CONSULTATION AUDIO TEMPORARILY
                # =============================================

                with open(
                    audio_path,
                    "ab",
                ) as audio_file:

                    audio_file.write(
                        audio_bytes
                    )

                # =============================================
                # WAIT FOR ENOUGH AUDIO
                # =============================================

                if (
                    chunk_count
                    - last_processed_chunk
                    < PROCESS_EVERY_CHUNKS
                ):
                    continue

                # =============================================
                # DO NOT OVERLAP SAME SESSION REQUESTS
                # =============================================

                if processing_lock.locked():

                    print(
                        "[Speech] Previous Sarvam "
                        "request still running."
                    )

                    continue

                last_processed_chunk = (
                    chunk_count
                )

                # =============================================
                # PROCESS ASYNCHRONOUSLY
                # =============================================

                async def process_current_window():

                    nonlocal previous_live_text
                    nonlocal latest_language

                    try:

                        async with processing_lock:

                            started_at = (
                                time.perf_counter()
                            )

                            result = (
                                await process_audio_window(
                                    audio_path,
                                    temp_dir,
                                    language_code,
                                )
                            )

                            elapsed_ms = (
                                (
                                    time.perf_counter()
                                    - started_at
                                )
                                * 1000
                            )

                        current_text = clean_text(
                            result.get(
                                "transcript",
                                "",
                            )
                        )

                        if not current_text:
                            return

                        detected_language = (
                            result.get(
                                "language",
                                "",
                            )
                        )

                        if detected_language:

                            latest_language = (
                                detected_language
                            )

                        new_text = get_new_text(
                            current_text,
                            previous_live_text,
                        )

                        # Store the current rolling window.
                        previous_live_text = (
                            current_text
                        )

                        if not new_text:
                            return

                        # =========================================
                        # STORE TRANSCRIPT
                        # =========================================

                        transcript_item = {
                            "text":
                                new_text,

                            "language":
                                latest_language,

                            "timestamp":
                                time.time(),

                            "isFinal":
                                True,
                        }

                        accumulated_transcript.append(
                            transcript_item
                        )

                        print(
                            "[Speech] Sarvam completed "
                            f"in {elapsed_ms:.0f} ms"
                        )

                        print(
                            "[Speech] New transcript:",
                            new_text,
                        )

                        # =========================================
                        # SEND LIVE TRANSCRIPT
                        # =========================================

                        await websocket.send_json({
                            "type":
                                "transcript",

                            "speaker":
                                "Unknown",

                            "timestamp":
                                time.time(),

                            "text":
                                new_text,

                            "language":
                                latest_language,

                            "isFinal":
                                True,

                            "final":
                                True,

                            "provider":
                                "sarvam",
                        })

                    except asyncio.CancelledError:

                        raise

                    except Exception as error:

                        print(
                            "[Speech] Sarvam "
                            "transcription error:",
                            error,
                        )

                        # Do not kill the consultation if
                        # one STT request fails.

                        try:

                            await websocket.send_json({
                                "type":
                                    "speech_warning",

                                "message":
                                    "Temporary transcription "
                                    "delay. Continuing "
                                    "consultation.",

                                "provider":
                                    "sarvam",
                            })

                        except Exception:
                            pass

                processing_task = asyncio.create_task(
                    process_current_window()
                )

    except WebSocketDisconnect:

        print(
            "[Speech] WebSocket client disconnected."
        )

    except Exception as error:

        print(
            "[Speech] WebSocket server error:",
            error,
        )

        try:

            await websocket.send_json({
                "type":
                    "error",

                "message":
                    str(error),
            })

        except Exception:
            pass

    finally:

        # ========================================================
        # WAIT FOR CURRENT STT REQUEST
        # ========================================================

        if processing_task:

            try:

                await processing_task

            except asyncio.CancelledError:
                pass

            except Exception as error:

                print(
                    "[Speech] Background task "
                    "cleanup error:",
                    error,
                )

        # ========================================================
        # DELETE TEMPORARY AUDIO
        # ========================================================

        try:

            if audio_path.exists():
                audio_path.unlink()

            shutil.rmtree(
                temp_dir,
                ignore_errors=True,
            )

        except Exception as cleanup_error:

            print(
                "[Speech] Cleanup warning:",
                cleanup_error,
            )

        print(
            "[Speech] Speech session finished."
        )


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    print("")
    print("==============================================")
    print(" Doctors Vedika Speech Service")
    print("==============================================")
    print(
        f"Server: http://{HOST}:{PORT}"
    )
    print(
        f"WebSocket: ws://localhost:{PORT}/ws/live"
    )
    print(
        "STT Provider: Sarvam AI"
    )
    print(
        f"STT Model: {SARVAM_STT_MODEL}"
    )
    print(
        f"STT Mode: {SARVAM_STT_MODE}"
    )
    print(
        f"API Key configured: "
        f"{bool(SARVAM_API_KEY)}"
    )
    print("==============================================")
    print("")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
    )
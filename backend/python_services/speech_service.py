import asyncio
import json
import os
import re
import shutil
import struct
import subprocess
import tempfile
import time
import wave
from contextlib import asynccontextmanager
import sys
from pathlib import Path
from typing import Optional

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

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

def get_sarvam_api_key():
    try:
        load_dotenv(Path(__file__).resolve().parent.parent / '.env', override=True)
    except Exception:
        pass
    return os.getenv("SARVAM_API_KEY", "").strip()

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
        "4",
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
# SHARED HTTP CLIENT & LIFESPAN
# ============================================================

http_client: Optional[httpx.AsyncClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
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
        f"{bool(get_sarvam_api_key())}"
    )
    print(
        f"Max concurrent Sarvam requests: "
        f"{MAX_CONCURRENT_SARVAM_REQUESTS}"
    )
    print("==============================================")
    print("")

    yield

    if http_client is not None:
        await http_client.aclose()
        http_client = None


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Doctors Vedika Speech Service",
    version="3.0.0",
    lifespan=lifespan,
)


# ============================================================
# LANGUAGE HELPERS
# ============================================================

def normalize_language(language):
    """
    Convert frontend language values to Sarvam language codes.
    For consultation flow we use "unknown" to allow Sarvam to detect
    multilingual code-mixed speech (Telugu + English / Telugish).
    """
    value = str(language or "").strip().lower()

    if not value or value in {
        "auto",
        "automatic",
        "unknown",
        "detect",
        "detected",
        "all",
        "all-languages",
        "telugu",
        "te",
        "te-in",
        "telugu+english",
        "telugu-english",
        "telugu (english)",
    }:
        return "unknown"

    mapping = {
        "hindi": "hi-IN",
        "hi": "hi-IN",
        "hi-in": "hi-IN",
        "hindi+english": "hi-IN",
        "english": "en-IN",
        "en": "en-IN",
        "en-in": "en-IN",
    }

    return mapping.get(
        value,
        "unknown",
    )


# ============================================================
# TEXT HELPERS & CODE-MIXED RESTORATION
# ============================================================
UNWANTED_SCRIPT_STATIC = re.compile(r'[\u0B80-\u0BFF\u0980-\u09FF\u0B00-\u0B7F\u0A80-\u0AFF\u0A00-\u0A7F\u0D80-\u0DFF।॥]+')
REPETITIVE_WORDS = re.compile(r'\b(\w+)(?:\s+\1){2,}\b', re.IGNORECASE)

TELUGU_TO_ENGLISH_MAP = {
    # Greetings & Common Expressions
    "గుడ్ మార్నింగ్": "Good morning",
    "గుడ్ ఈవినింగ్": "Good evening",
    "గుడ్ ఆఫ్టర్నూన్": "Good afternoon",
    "హ్యావ్ ఏ సీట్": "have a seat",
    "థాంక్యూ": "Thank you",
    "థాంక్స్": "Thanks",
    "ధ్యాంక్స్": "Thanks",
    "యు ఆర్ వెల్కమ్": "You're welcome",
    "వెల్కమ్": "You're welcome",
    "వెల్‌కమ్": "You're welcome",
    "టేక్ కేర్": "Take care",
    "ఓకే": "Okay",
    "ఒకే": "Okay",
    "హలో": "Hello",
    "ఆమామ్": "అవును",

    # Roles
    "డాక్టర్": "Doctor",
    "డాక్టరు": "Doctor",
    "పేషెంట్": "Patient",

    # Symptoms, Organs & Body Parts
    "అపెండెక్స్": "appendix",
    "స్టమక్ పెయిన్": "stomach pain",
    "స్టమక్": "stomach",
    "అబ్డామెన్": "abdomen",
    "అబ్డామ్": "abdomen",
    "లవర్ అబ్డామెన్": "lower abdomen",
    "లవర్ అబ్డామ్": "lower abdomen",
    "లోయర్ అబ్డామెన్": "lower abdomen",
    "లోయర్ అబ్డామ్": "lower abdomen",
    "అప్పర్ అబ్డామెన్": "upper abdomen",
    "అప్పర్ అబ్డామ్": "upper abdomen",
    "అప్పర్": "upper",
    "వర్టిఫికేషన్": "verification",
    "సెటిఫికేషన్": "certification",
    "త్రోట్ పెయిన్": "throat pain",
    "త్రోట్": "throat",
    "స్వాలో": "Swallow",
    "స్వాలోయింగ్": "swallowing",
    "డిఫికల్టీ": "difficulty",
    "మైల్డ్ ఫీవర్": "mild fever",
    "హై ఫీవర్": "high fever",
    "ఫీవర్": "fever",
    "కోల్డ్": "cold",
    "కాఫ్": "cough",
    "నోస్ బ్లాక్": "Nose block",
    "నేసల్ కాంజెషన్": "nasal congestion",
    "వాటరీ డిశ్చార్జ్": "watery discharge",
    "బ్రీథింగ్ ప్రాబ్లమ్": "breathing problem",
    "బ్రీథింగ్ డిఫికల్టీ": "breathing difficulty",
    "బ్రీథింగ్": "breathing",
    "ఇయర్ పైన్": "ear pain",
    "ఇయర్ పెయిన్": "ear pain",
    "రిడ్యూస్డ్ హియరింగ్": "reduced hearing",
    "హియరింగ్": "hearing",
    "ఫుల్‌నెస్": "fullness",
    "నార్మల్": "normal",
    "వైటల్స్": "vitals",
    "బిపి": "BP",
    "బీపీ": "BP",
    "పల్స్ రేట్": "pulse rate",
    "పల్స్": "pulse",
    "ఎస్పిఓ2": "SpO₂",
    "ఎస్ పి ఓ 2": "SpO₂",
    "టెంపరేచర్": "temperature",
    "స్టేబుల్": "stable",
    "సీరియస్ ప్రాబ్లమ్": "serious problem",
    "సీరియస్": "Serious",
    "ప్రాబ్లం": "problem",
    "ప్రాబ్లమ్": "problem",
    "సింప్టమ్స్": "symptoms",
    "అప్పర్ రెస్పిరేటరీ": "upper respiratory",
    "ఇన్ఫెక్షన్": "infection",
    "ఇన్‌ఫెక్షన్": "infection",
    "ఎగ్జామిన్": "examine",
    "రేడ్‌నెస్": "redness",
    "రెడ్‌నెస్": "redness",
    "ఇన్ఫ్లమేషన్": "inflammation",
    "ఇన్‌ఫ్లమేషన్": "inflammation",
    "చెస్ట్ పెయిన్": "chest pain",
    "హెడేక్": "headache",

    # Medicines & Treatments
    "పారాసిటమాల్": "Paracetamol",
    "పారాసిటమోల్": "Paracetamol",
    "డోలో 650": "Dolo 650",
    "డోలో": "Dolo",
    "అజిత్రోమైసిన్": "Azithromycin",
    "మోంటైర్": "Montair",
    "ప్యాంటోసిడ్": "Pantocid",
    "సెటిరిజిన్": "Cetirizine",
    "అమోక్సిసిలిన్": "Amoxicillin",
    "క్రాసిన్": "Crocin",
    "ఆస్ప్రిన్": "Aspirin",
    "మెడిసిన్స్": "medicines",
    "మెడిసిన్": "medicine",
    "సలైన్ నేసల్ స్ప్రే": "saline nasal spray",
    "నేసల్ స్ప్రే": "nasal spray",
    "సలైన్": "saline",
    "స్ప్రే": "spray",
    "టాబ్లెట్స్": "tablets",
    "టాబ్లెట్": "tablet",
    "ఆఫ్టర్ ఫుడ్": "after food",
    "బిఫోర్ ఫుడ్": "before food",
    "యాంటీబయోటిక్": "Antibiotic",
    "యాంటిబయాటిక్": "Antibiotic",
    "సపోర్టివ్ కేర్": "supportive care",
    "ప్రికాషన్స్": "precautions",
    "సాల్ట్ వాటర్ గార్గ్లింగ్": "salt-water gargling",
    "గార్గ్లింగ్": "gargling",
    "వార్మ్ వాటర్": "warm water",
    "కోల్డ్ డ్రింక్స్": "cold drinks",
    "రెస్ట్": "rest",
    "రివ్యూ": "review",
    "అర్జెంట్ మెడికల్ కేర్": "urgent medical care",
    "అర్జెంట్": "urgent",
    "మెడికల్ కేర్": "medical care",
    "హాస్పిటల్": "hospital",
}

def restore_codemixed_medical_text(text: str) -> str:
    if not text:
        return ""

    result = str(text)

    # 1. Replace using strict unicode word boundaries (avoids sub-word corruption)
    sorted_keys = sorted(TELUGU_TO_ENGLISH_MAP.keys(), key=len, reverse=True)
    for k in sorted_keys:
        v = TELUGU_TO_ENGLISH_MAP[k]
        pattern = r'(?<![\w\u0C00-\u0C7F])' + re.escape(k) + r'(?![\w\u0C00-\u0C7F])'
        result = re.sub(pattern, v, result, flags=re.IGNORECASE)

    # 2. Fix medical units & measurements
    result = re.sub(r'(\d+)\s*(ఎంజి|మిగ్రా)', r'\1 mg', result)
    result = re.sub(r'(\d+/\d+)\s*(ఎమ్ఎమ్హెచ్జి)', r'\1 mmHg', result)

    # 3. Capitalize Doctor, Patient, BP, SpO2, Paracetamol, etc.
    result = re.sub(r'\b(doctor)\b', 'Doctor', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(paracetamol)\b', 'Paracetamol', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(bp)\b', 'BP', result, flags=re.IGNORECASE)
    result = re.sub(r'\b(spo2)\b', 'SpO₂', result, flags=re.IGNORECASE)

    # 4. Clean spacing
    result = " ".join(result.split())
    return result


def clean_text(text):
    """
    Normalize text, keeping English/Telugu/Hindi medical speech clean
    while stripping non-Telugu/English static artifacts and restoring Telugu-scripted English words.
    """
    if text is None:
        return ""

    s = str(text).strip()

    # Strip unexpected static scripts (Bengali, Oriya, Gujarati, Punjabi, Tamil, Devanagari danda)
    s = UNWANTED_SCRIPT_STATIC.sub(' ', s)

    # Remove single word loops repeated 3+ times (e.g. "Okay Okay Okay Okay")
    s = REPETITIVE_WORDS.sub(r'\1', s)

    # Strip known silence phrases
    s = re.sub(r'\b(subtitles\s+by|thank\s+you\s+for\s+watching)\b', '', s, flags=re.IGNORECASE)

    # Restore code-mixed Telugu + English medical terms & words to English script
    s = restore_codemixed_medical_text(s)

    # Normalize remaining spaces
    s = " ".join(s.split())
    s = re.sub(r'^[,\.\s\-!?]+|[,\.\s\-!?]+$', '', s).strip()

    return s


def infer_speaker_label(text, prev_speaker="Doctor"):
    if not text:
        return prev_speaker

    t = text.lower()
    patient_cues = [
        "doctor", "గత", "రోజులుగా", "ఉంది", "పడిపోయాను", "తగిలింది", 
        "పెరుగుతుంది", "లేవు", "వస్తుంది", "తీసుకోవాలి", "అవసరమా", 
        "పడిపోయా", "pain ఉంది", "చేయాలి", "తీసుకున్నా", "లేదు", "వస్తుంది", "ఉంది"
    ]
    doctor_cues = [
        "good evening", "what problem", "when did that", "how long", "okay", 
        "i'll check", "i'll prescribe", "take tablet", "take medicine", 
        "any difficulty", "did you check", "welcome", "అలవాటు", "చెబుతాను", 
        "జాగ్రత్త", "తీసుకోకండి", "చేద్దాం", "prescribe", "paracetamol", "aspirin",
        "vitals", "breathing difficulty", "dizziness", "sweating", "emergency"
    ]

    patient_score = sum(1 for c in patient_cues if c in t)
    doctor_score = sum(1 for c in doctor_cues if c in t)

    if patient_score > doctor_score:
        return "Patient"
    elif doctor_score > patient_score:
        return "Doctor"

    return "Patient" if prev_speaker == "Doctor" else "Doctor"


def normalize_for_comparison(text):
    return clean_text(text).lower()


# Known STT silence hallucination regex patterns
HALLUCINATION_PATTERNS = [
    r'\b(battery|oneplus|iphone|galaxy|nokia|xiaomi|redmi|realme)\s+\d+\s*(pro|max|plus|lite)?\b',
    r'\b(north\s+of\s+(everything|all|whatever))\b',
    r'^(আচ্ছা\s*)+$',                   # Bengali "accha accha"
    r'^(ஆ\s*சரி\s*)+$',                 # Tamil "aa sari"
    r'^(હા\s*)+$',                      # Gujarati "haa"
    r'^(ହଁ\s*)+$',                      # Oriya "han"
    r'^(ସହି\s*ହੈ\s*)+$',                 # Punjabi "sahi hai"
    r'^(okay\s*so\s*)+$',              # English "okay so"
    r'^(subtitles\s*by\s*.*)+$',
    r'^(thank\s*you\s*\.*\s*)+$',
    r'^(amara\s*)+$',                  # Oriya "amara"
    r'^[।॥|\s.,\-!?]+$',                # Danda or punctuation only
]

# Random unrequested scripts when silence is misdetected as rare regional languages
RANDOM_SILENCE_SCRIPTS = re.compile(r'[\u0B00-\u0B7F\u0980-\u09FF\u0B00-\u0B7F\u0A80-\u0AFF\u0A00-\u0A7F\u0D80-\u0DFF।॥]')


def is_audio_silent(wav_path: Path, min_rms: float = 45.0) -> bool:
    """
    Returns True if the 16kHz WAV file contains only silence or background static.
    This prevents sending silent/static audio to STT models which causes hallucinations.
    """
    try:
        if not wav_path.exists() or wav_path.stat().st_size < 1000:
            return True

        with wave.open(str(wav_path), 'rb') as wf:
            nframes = wf.getnframes()
            if nframes == 0:
                return True
            frames = wf.readframes(nframes)
            sample_count = len(frames) // 2
            if sample_count == 0:
                return True

            fmt = f"<{sample_count}h"
            samples = struct.unpack(fmt, frames)

            sum_squares = sum(s * s for s in samples)
            rms = (sum_squares / sample_count) ** 0.5

            print(f"[Speech VAD] Audio window RMS energy: {rms:.1f} (Threshold: {min_rms})")
            return rms < min_rms
    except Exception as e:
        print(f"[Speech VAD] Warning during RMS calculation: {e}")
        return False


def is_hallucinated_transcript(text: str) -> bool:
    """
    Check if a transcript string is a known STT hallucination or random noise decoding.
    """
    if not text:
        return True

    clean = text.strip()

    if len(clean) <= 1:
        return True

    if re.match(r'^[।॥|\s.,\-!?]+$', clean):
        return True

    # Check for single word repeated 3+ times (e.g. "আচ্ছা আচ্ছা আচ্ছা")
    words = clean.split()
    if len(words) >= 3 and len(set(w.lower() for w in words)) == 1:
        print(f"[Speech Filter] Filtered repeated word hallucination: '{clean}'")
        return True

    # Check regex patterns
    for pattern in HALLUCINATION_PATTERNS:
        if re.search(pattern, clean, re.IGNORECASE):
            print(f"[Speech Filter] Filtered pattern hallucination: '{clean}'")
            return True

    # Check for unexpected rare script hallucinations during silent noise
    if RANDOM_SILENCE_SCRIPTS.search(clean):
        print(f"[Speech Filter] Filtered random script hallucination: '{clean}'")
        return True

    return False



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

def make_wav_header(pcm_len: int, sample_rate: int = 16000, num_channels: int = 1, bits_per_sample: int = 16) -> bytes:
    byte_rate = sample_rate * num_channels * (bits_per_sample // 8)
    block_align = num_channels * (bits_per_sample // 8)
    total_data_len = pcm_len
    total_file_len = total_data_len + 36

    return struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        total_file_len,
        b'WAVE',
        b'fmt ',
        16,
        1,
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        total_data_len
    )


def extract_recent_audio(
    source_path: Path,
    output_path: Path,
    window_seconds: int = 6,
):
    """
    Extract the latest portion of the growing WebM recording,
    capping it strictly to window_seconds (max 6 seconds), and convert it into a standard 16 kHz mono WAV.
    """
    ffmpeg_cmd = shutil.which("ffmpeg") or r"C:\Users\harshini\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.exe"

    temp_pcm_path = output_path.with_suffix(".temp.pcm")
    cmd_convert = [
        ffmpeg_cmd,
        "-y",
        "-err_detect", "ignore_err",
        "-fflags", "+genpts+discardcorrupt",
        "-i", str(source_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-f", "s16le",
        str(temp_pcm_path),
    ]

    res_convert = subprocess.run(
        cmd_convert,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )

    if not temp_pcm_path.exists() or temp_pcm_path.stat().st_size == 0:
        raise RuntimeError("FFmpeg failed to convert WebM to PCM: " + (res_convert.stderr[-500:] if res_convert.stderr else "Unknown error"))

    try:
        pcm_bytes = temp_pcm_path.read_bytes()
    finally:
        try:
            if temp_pcm_path.exists():
                temp_pcm_path.unlink()
        except Exception:
            pass

    # 16000 samples/sec * 2 bytes/sample = 32000 bytes/sec
    max_bytes = max(1, int(window_seconds)) * 32000
    if len(pcm_bytes) > max_bytes:
        pcm_bytes = pcm_bytes[-max_bytes:]

    header = make_wav_header(len(pcm_bytes), sample_rate=16000, num_channels=1, bits_per_sample=16)
    output_path.write_bytes(header + pcm_bytes)


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

    api_key = get_sarvam_api_key()
    if not api_key:
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
        "api-subscription-key": api_key,
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
        "prompt": "Medical consultation conversation between doctor and patient in Telugu, Hindi, and English (multilingual code-mixed speech). Transcribe exact spoken words in native scripts (Telugu script, Hindi script, English) including symptoms, chest pain, BP, bike accident, Aspirin, Paracetamol 500mg, dosages, and medical advice.",
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
        if response.status_code == 402 or "insufficient_quota" in body.lower() or "no credits" in body.lower():
            print("[Speech Notice] Sarvam AI API quota exceeded (HTTP 402: No credits available). Please update SARVAM_API_KEY in .env with active credits.")
            return {
                "transcript": "",
                "language": "",
                "quota_exceeded": True
            }

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
            or is_audio_silent(wav_path)
        ):
            print("[Speech] Skipping Sarvam request for silent/static audio window.")
            return {
                "transcript": "",
                "language": "",
            }

        result = await transcribe_with_sarvam(
            wav_path,
            language_code,
        )

        raw_transcript = result.get("transcript", "")
        if is_hallucinated_transcript(raw_transcript):
            result["transcript"] = ""

        return result

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
            get_sarvam_api_key()
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
            get_sarvam_api_key()
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
    current_speaker = "Doctor"
    is_paused = False

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
                # PAUSE & RESUME
                # -------------------------------------------------

                if message_type == "pause":
                    print("[Speech] Pause message received. Pausing session.")
                    is_paused = True
                    continue

                if message_type == "resume":
                    print("[Speech] Resume message received. Resuming session.")
                    is_paused = False
                    previous_live_text = ""
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

                if is_paused:
                    print("[Speech] Ignoring audio chunk because session is paused.")
                    continue

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

                        if not current_text or is_hallucinated_transcript(current_text):
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

                        if not new_text:
                            return

                        previous_live_text = current_text

                        nonlocal current_speaker
                        speaker_label = infer_speaker_label(new_text, current_speaker)
                        current_speaker = speaker_label

                        transcript_item = {
                            "text":
                                new_text,

                            "speaker":
                                speaker_label,

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
                            f"[Speech] New transcript ({speaker_label}):",
                            new_text,
                        )

                        # =========================================
                        # SEND LIVE TRANSCRIPT
                        # =========================================

                        await websocket.send_json({
                            "type":
                                "transcript",

                            "speaker":
                                speaker_label,

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
                                    f"Temporary transcription delay ({error}). Continuing consultation.",

                                "provider":
                                    "sarvam",

                                "error":
                                    str(error),
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
        f"{bool(get_sarvam_api_key())}"
    )
    print("==============================================")
    print("")

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
    )
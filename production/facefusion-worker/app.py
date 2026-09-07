from __future__ import annotations

import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
from typing import Any
import uuid

from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

WORKER_NAME = "helix-facefusion-worker"
WORKER_VERSION = "0.3.0"
BACKEND = "facefusion"
PROFILE = "faceswap"
TOOL = "face.swap"
MODEL_DISPLAY = "HyperSwap B"
MODEL_ID = "hyperswap_1b_256"

FACEFUSION_ROOT = Path(os.environ.get("HELIX_FACEFUSION_ROOT", r"C:\AI\FaceFusion"))
FACEFUSION_ENTRY = FACEFUSION_ROOT / "facefusion.py"
FACEFUSION_PYTHON = Path(os.environ.get("HELIX_FACEFUSION_PYTHON", r"C:\Users\MSP-PC\.conda\envs\facefusion\python.exe"))
FACE_PROBE = Path(__file__).with_name("face_probe.py")
DATA_ROOT = Path(os.environ.get("HELIX_FACEFUSION_DATA_ROOT", str(Path(__file__).with_name("data"))))
INPUT_ROOT = DATA_ROOT / "inputs"
OUTPUT_ROOT = DATA_ROOT / "outputs"
JOB_ROOT = DATA_ROOT / "jobs"
MAX_INPUT_BYTES = int(os.environ.get("HELIX_FACEFUSION_INPUT_MAX_MB", "512")) * 1024 * 1024
API_TOKEN = os.environ.get("HELIX_FACEFUSION_API_TOKEN", "").strip()

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
IMAGE_FORMATS = {"image2", "jpeg_pipe", "png_pipe", "webp_pipe"}
VIDEO_FORMATS = {"mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"}
PIXEL_BOOSTS = {"256x256", "512x512", "768x768", "1024x1024"}
TERMINAL = {"succeeded", "failed", "cancelled"}
JOB_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
UUID4_HEX = re.compile(r"^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$", re.I)
SAFE_JOB_ERRORS = {
    "no_source_face_detected",
    "no_target_face_detected",
    "face_analysis_failed",
    "processing_failed",
    "output_missing",
    "worker_restarted",
}

app = FastAPI(title="Helix FaceFusion Worker", version=WORKER_VERSION)
state_lock = threading.RLock()
active_job_id: str | None = None
processes: dict[str, subprocess.Popen[str]] = {}
cancelled_jobs: set[str] = set()


def ensure_dirs() -> None:
    for path in (INPUT_ROOT, OUTPUT_ROOT, JOB_ROOT):
        path.mkdir(parents=True, exist_ok=True)


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")
    os.replace(temp, path)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def detail(code: str, status: int, **extra: Any) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, **extra})


def require_auth(authorization: str | None) -> None:
    if not API_TOKEN:
        raise detail("api_auth_not_configured", 503)
    if authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})


def probe_media(path: Path, filename: str) -> tuple[str, dict[str, Any]]:
    suffix = Path(filename).suffix.lower()
    try:
        result = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=format_name,duration:stream=codec_type,width,height",
            "-of", "json", str(path)
        ], cwd=str(FACEFUSION_ROOT), capture_output=True, text=True, timeout=15, check=True)
        parsed = json.loads(result.stdout)
    except Exception as exc:
        raise detail("invalid_media", 415) from exc

    stream = next((s for s in parsed.get("streams", []) if s.get("codec_type") == "video"), None)
    if not stream or not isinstance(stream.get("width"), int) or stream["width"] <= 0 or not isinstance(stream.get("height"), int) or stream["height"] <= 0:
        raise detail("invalid_media", 415)
    fmt = parsed.get("format", {}).get("format_name", "")
    if suffix in IMAGE_EXTENSIONS and fmt in IMAGE_FORMATS:
        return "image", {"width": stream["width"], "height": stream["height"]}
    if suffix in VIDEO_EXTENSIONS and fmt in VIDEO_FORMATS:
        duration = float(parsed.get("format", {}).get("duration", "nan"))
        if not math.isfinite(duration) or duration <= 0:
            raise detail("invalid_media", 415)
        return "video", {"width": stream["width"], "height": stream["height"], "durationSeconds": duration}
    raise detail("unsupported_media_type", 415)


def detect_face_count(path: Path) -> int:
    env = os.environ.copy()
    env["HELIX_FACEFUSION_ROOT"] = str(FACEFUSION_ROOT)
    try:
        result = subprocess.run(
            [str(FACEFUSION_PYTHON), str(FACE_PROBE), str(path)],
            cwd=str(FACEFUSION_ROOT), env=env, capture_output=True, text=True,
            timeout=120, check=False
        )
    except Exception as exc:
        raise detail("face_analysis_failed", 503) from exc

    payload = None
    for line in reversed(result.stdout.splitlines()):
        try:
            candidate = json.loads(line)
            if isinstance(candidate, dict):
                payload = candidate
                break
        except json.JSONDecodeError:
            continue
    if result.returncode != 0 or not payload or not isinstance(payload.get("faceCount"), int) or payload["faceCount"] < 0:
        raise detail("face_analysis_failed", 503)
    return int(payload["faceCount"])


def input_meta_path(input_id: str) -> Path:
    return INPUT_ROOT / f"{input_id}.json"


def load_input(input_id: str) -> dict[str, Any]:
    if not UUID4_HEX.fullmatch(input_id):
        raise detail("input_not_found", 404)
    meta_path = input_meta_path(input_id)
    if not meta_path.is_file():
        raise detail("input_not_found", 404)
    meta = read_json(meta_path)
    path = INPUT_ROOT / meta["storedFilename"]
    if not path.is_file():
        raise detail("input_not_found", 404)
    meta["path"] = str(path)
    return meta


def delete_input_files(input_id: str) -> bool:
    meta_path = input_meta_path(input_id)
    if not meta_path.is_file():
        return False
    try:
        meta = read_json(meta_path)
        (INPUT_ROOT / meta.get("storedFilename", "")).unlink(missing_ok=True)
    finally:
        meta_path.unlink(missing_ok=True)
    return True


def validate_settings(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise detail("invalid_settings", 422)
    allowed = {"faceSelectorMode", "referenceFacePosition", "pixelBoost", "weight", "outputImageQuality", "outputVideoQuality"}
    if set(value) - allowed:
        raise detail("invalid_settings", 422)
    result: dict[str, Any] = {}
    if "faceSelectorMode" in value:
        if value["faceSelectorMode"] not in {"one", "reference"}:
            raise detail("invalid_settings", 422)
        result["faceSelectorMode"] = value["faceSelectorMode"]
    if "referenceFacePosition" in value:
        position = value["referenceFacePosition"]
        if isinstance(position, bool) or not isinstance(position, int) or position < 0:
            raise detail("invalid_settings", 422)
        result["referenceFacePosition"] = position
    if "pixelBoost" in value:
        if value["pixelBoost"] not in PIXEL_BOOSTS:
            raise detail("invalid_settings", 422)
        result["pixelBoost"] = value["pixelBoost"]
    if "weight" in value:
        weight = value["weight"]
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or weight < 0 or weight > 1 or abs(weight * 20 - round(weight * 20)) > 1e-9:
            raise detail("invalid_settings", 422)
        result["weight"] = float(weight)
    for key in ("outputImageQuality", "outputVideoQuality"):
        if key in value:
            quality = value[key]
            if isinstance(quality, bool) or not isinstance(quality, int) or not 0 <= quality <= 100:
                raise detail("invalid_settings", 422)
            result[key] = quality
    return result


def job_dir(job_id: str) -> Path:
    if not JOB_ID.fullmatch(job_id):
        raise detail("invalid_job_id", 422)
    return JOB_ROOT / job_id


def job_state_path(job_id: str) -> Path:
    return job_dir(job_id) / "state.json"


def load_job(job_id: str) -> dict[str, Any]:
    path = job_state_path(job_id)
    if not path.is_file():
        raise detail("job_not_found", 404)
    return read_json(path)


def save_job(job_id: str, record: dict[str, Any]) -> None:
    atomic_json(job_state_path(job_id), record)


def job_response(record: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {"status": record["status"]}
    if record["status"] == "succeeded":
        result["artifact"] = record["artifact"]
    elif record["status"] == "failed":
        result["error"] = record["error"]
    return result


def classify_failure(stdout: str, stderr: str) -> str:
    text = f"{stdout}\n{stderr}".lower()
    if "no source face detected" in text:
        return "no_source_face_detected"
    return "processing_failed"


def build_command(source: dict[str, Any], target: dict[str, Any], output: Path, settings: dict[str, Any]) -> list[str]:
    command = [
        str(FACEFUSION_PYTHON), str(FACEFUSION_ENTRY), "headless-run",
        "--source-paths", source["path"],
        "--target-path", target["path"],
        "--output-path", str(output),
        "--processors", "face_swapper",
        "--face-swapper-model", MODEL_ID,
        "--execution-providers", "cuda"
    ]
    if "faceSelectorMode" in settings:
        command += ["--face-selector-mode", str(settings["faceSelectorMode"])]
    if "referenceFacePosition" in settings:
        command += ["--reference-face-position", str(settings["referenceFacePosition"])]
    if "pixelBoost" in settings:
        command += ["--face-swapper-pixel-boost", str(settings["pixelBoost"])]
    if "weight" in settings:
        command += ["--face-swapper-weight", str(settings["weight"])]
    if "outputImageQuality" in settings:
        command += ["--output-image-quality", str(settings["outputImageQuality"])]
    if "outputVideoQuality" in settings:
        command += ["--output-video-quality", str(settings["outputVideoQuality"])]
    return command


def run_job(job_id: str) -> None:
    global active_job_id
    job_path = job_dir(job_id)
    stdout_path = job_path / "stdout.log"
    stderr_path = job_path / "stderr.log"
    try:
        with state_lock:
            if job_id in cancelled_jobs:
                return
            record = load_job(job_id)
            record["status"] = "running"
            record["startedAt"] = time.time()
            save_job(job_id, record)

        source = load_input(record["request"]["sourceInputId"])
        target = load_input(record["request"]["targetInputId"])
        extension = ".mp4" if target["mediaKind"] == "video" else ".png"
        output_dir = OUTPUT_ROOT / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        output = output_dir / f"result{extension}"
        command = build_command(source, target, output, record["request"]["settings"])

        process = subprocess.Popen(command, cwd=str(FACEFUSION_ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with state_lock:
            processes[job_id] = process
        stdout, stderr = process.communicate()
        stdout_path.write_text(stdout, encoding="utf-8", errors="replace")
        stderr_path.write_text(stderr, encoding="utf-8", errors="replace")

        with state_lock:
            if job_id in cancelled_jobs:
                return
            record = load_job(job_id)
            record["finishedAt"] = time.time()
            if process.returncode == 0 and output.is_file():
                record["status"] = "succeeded"
                record["artifact"] = {
                    "filename": output.name,
                    "mediaKind": target["mediaKind"],
                    "sizeBytes": output.stat().st_size,
                }
                record.pop("error", None)
            else:
                code = "output_missing" if process.returncode == 0 else classify_failure(stdout, stderr)
                record["status"] = "failed"
                record["error"] = {"code": code if code in SAFE_JOB_ERRORS else "processing_failed"}
            save_job(job_id, record)
    except Exception:
        with state_lock:
            try:
                record = load_job(job_id)
                if job_id not in cancelled_jobs:
                    record["status"] = "failed"
                    record["finishedAt"] = time.time()
                    record["error"] = {"code": "processing_failed"}
                    save_job(job_id, record)
            except Exception:
                pass
    finally:
        with state_lock:
            processes.pop(job_id, None)
            if active_job_id == job_id:
                active_job_id = None


def recover_interrupted_jobs() -> None:
    for directory in JOB_ROOT.iterdir() if JOB_ROOT.exists() else []:
        state = directory / "state.json"
        if not state.is_file():
            continue
        try:
            record = read_json(state)
            if record.get("status") in {"queued", "running"}:
                record["status"] = "failed"
                record["finishedAt"] = time.time()
                record["error"] = {"code": "worker_restarted"}
                atomic_json(state, record)
        except Exception:
            continue


ensure_dirs()
recover_interrupted_jobs()


@app.get("/v1/health")
def health() -> dict[str, Any]:
    return {"ok": True, "worker": WORKER_NAME, "version": WORKER_VERSION}


@app.get("/v1/readiness")
def readiness() -> dict[str, Any]:
    checks = {
        "facefusionRoot": FACEFUSION_ROOT.is_dir(),
        "facefusionEntry": FACEFUSION_ENTRY.is_file(),
        "facefusionPython": FACEFUSION_PYTHON.is_file(),
        "hyperswapBModel": (FACEFUSION_ROOT / ".assets" / "models" / "hyperswap_1b_256.onnx").is_file(),
        "faceProbe": FACE_PROBE.is_file(),
        "inputRoot": INPUT_ROOT.is_dir(),
        "outputRoot": OUTPUT_ROOT.is_dir(),
        "jobRoot": JOB_ROOT.is_dir(),
    }
    with state_lock:
        active = active_job_id
    auth = bool(API_TOKEN)
    return {
        "ready": auth and all(checks.values()),
        "worker": WORKER_NAME,
        "backend": BACKEND,
        "profile": PROFILE,
        "capabilities": [TOOL],
        "productionModel": {"displayName": MODEL_DISPLAY, "facefusionModel": MODEL_ID},
        "capacity": {"maxActiveJobs": 1, "activeJobId": active},
        "apiAuthConfigured": auth,
        "checks": checks,
    }


@app.post("/v1/inputs")
async def upload_input(
    role: str = Form(...),
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    require_auth(authorization)
    if role not in {"source", "target"}:
        raise detail("invalid_role", 422)
    filename = Path(file.filename or "upload.bin").name
    suffix = Path(filename).suffix.lower()
    input_id = uuid.uuid4().hex
    stored = INPUT_ROOT / f"{input_id}{suffix}"
    bytes_written = 0
    try:
        with stored.open("xb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > MAX_INPUT_BYTES:
                    raise detail("input_too_large", 413)
                output.write(chunk)
        media_kind, media = probe_media(stored, filename)
        if role == "source" and media_kind != "image":
            raise detail("source_must_be_image", 422)
        face_count: int | None = None
        if media_kind == "image":
            face_count = detect_face_count(stored)
            if face_count == 0:
                raise detail("no_source_face_detected" if role == "source" else "no_target_face_detected", 422)
        meta = {
            "id": input_id,
            "role": role,
            "mediaKind": media_kind,
            "sizeBytes": bytes_written,
            "faceCount": face_count,
            "filename": filename,
            "storedFilename": stored.name,
            "media": media,
            "createdAt": time.time(),
        }
        atomic_json(input_meta_path(input_id), meta)
        return {key: meta[key] for key in ("id", "role", "mediaKind", "sizeBytes", "faceCount")}
    except HTTPException:
        stored.unlink(missing_ok=True)
        input_meta_path(input_id).unlink(missing_ok=True)
        raise
    except Exception as exc:
        stored.unlink(missing_ok=True)
        input_meta_path(input_id).unlink(missing_ok=True)
        raise detail("input_upload_failed", 500) from exc
    finally:
        await file.close()


@app.delete("/v1/inputs/{input_id}")
def delete_input(input_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    with state_lock:
        if active_job_id:
            active = load_job(active_job_id)
            request = active.get("request", {})
            if input_id in {request.get("sourceInputId"), request.get("targetInputId")}:
                raise detail("input_in_use", 409)
    if not delete_input_files(input_id):
        raise detail("input_not_found", 404)
    return {"deleted": True}


@app.post("/v1/jobs")
def create_job(payload: dict[str, Any] = Body(...), authorization: str | None = Header(default=None)) -> dict[str, Any]:
    global active_job_id
    require_auth(authorization)
    if set(payload) != {"jobId", "sourceInputId", "targetInputId", "settings"}:
        raise detail("invalid_job_request", 422)
    job_id = payload.get("jobId")
    source_id = payload.get("sourceInputId")
    target_id = payload.get("targetInputId")
    if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
        raise detail("invalid_job_id", 422)
    if not isinstance(source_id, str) or not UUID4_HEX.fullmatch(source_id) or not isinstance(target_id, str) or not UUID4_HEX.fullmatch(target_id):
        raise detail("invalid_input_id", 422)
    settings = validate_settings(payload.get("settings"))
    source = load_input(source_id)
    target = load_input(target_id)
    if source["role"] != "source" or source["mediaKind"] != "image" or target["role"] != "target":
        raise detail("input_role_mismatch", 422)
    normalized = {"jobId": job_id, "sourceInputId": source_id, "targetInputId": target_id, "settings": settings}

    with state_lock:
        state_path = job_state_path(job_id)
        if state_path.is_file():
            existing = read_json(state_path)
            if existing.get("request") != normalized:
                raise detail("job_id_conflict", 409)
            return job_response(existing)
        if active_job_id is not None:
            raise detail("worker_busy", 409, activeJobId=active_job_id)
        active_job_id = job_id
        record = {"status": "queued", "request": normalized, "createdAt": time.time()}
        save_job(job_id, record)
        threading.Thread(target=run_job, args=(job_id,), daemon=True, name=f"facefusion-{job_id}").start()
        return job_response(record)


@app.get("/v1/jobs/{job_id}")
def get_job(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    require_auth(authorization)
    return job_response(load_job(job_id))


@app.post("/v1/jobs/{job_id}/cancel")
def cancel_job(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    global active_job_id
    require_auth(authorization)
    with state_lock:
        record = load_job(job_id)
        if record["status"] in TERMINAL:
            return job_response(record)
        cancelled_jobs.add(job_id)
        process = processes.get(job_id)
        if process and process.poll() is None:
            process.terminate()
        record["status"] = "cancelled"
        record["finishedAt"] = time.time()
        record.pop("artifact", None)
        record.pop("error", None)
        save_job(job_id, record)
        if active_job_id == job_id:
            active_job_id = None
        return job_response(record)


@app.get("/v1/jobs/{job_id}/artifact")
def artifact(job_id: str, authorization: str | None = Header(default=None)):
    require_auth(authorization)
    record = load_job(job_id)
    if record["status"] != "succeeded" or "artifact" not in record:
        raise detail("artifact_not_ready", 409)
    meta = record["artifact"]
    path = OUTPUT_ROOT / job_id / meta["filename"]
    if not path.is_file():
        raise detail("artifact_missing", 404)
    return FileResponse(path, media_type="video/mp4" if meta["mediaKind"] == "video" else "image/png", filename=meta["filename"])

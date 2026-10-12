"""Bounded, lazy client for the existing HuggingFace face embedding service."""
import inspect
import json
import os
import tempfile
import threading
import numpy as np
from gradio_client import Client, handle_file

HF_SPACE_URL = "https://nitishsaini44-baffalol-model.hf.space"

class FaceServiceError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code

def classify_error(error):
    if isinstance(error, FaceServiceError):
        return error
    status = getattr(getattr(error, "response", None), "status_code", None)
    kind = type(error).__name__.lower()
    if status in (401, 403):
        return FaceServiceError("FACE_AUTH", "Face model authentication failed. Check the configured HuggingFace access token.")
    if isinstance(error, TimeoutError) or "timeout" in kind:
        return FaceServiceError("FACE_TIMEOUT", "Face model timed out. Please try again.")
    if status == 429:
        return FaceServiceError("FACE_RATE_LIMIT", "Face model rate limit reached. Please try again later.")
    if "connect" in kind or "network" in kind or status in (502, 503, 504):
        return FaceServiceError("FACE_UNAVAILABLE", "Face model is unavailable. Manual attendance remains available.")
    return FaceServiceError("FACE_MODEL", "Face model could not process the image. Please try again.")

class HFSpaceModel:
    _TMP_DIR = "/dev/shm" if os.path.isdir("/dev/shm") else tempfile.gettempdir()

    def __init__(self):
        self.client = None
        self._lock = threading.Lock()

    def _get_client(self):
        with self._lock:
            if self.client is None:
                token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
                # Support both installed client signatures without logging/persisting the token.
                token_key = "token" if "token" in inspect.signature(Client).parameters else "hf_token"
                options = {token_key: token, "verbose": False}
                if "httpx_kwargs" in inspect.signature(Client).parameters:
                    options["httpx_kwargs"] = {"timeout": 15}
                self.client = Client(HF_SPACE_URL, **options)
            return self.client

    def get_faces(self, image_bytes):
        tmp_path = None
        job = None
        try:
            fd, tmp_path = tempfile.mkstemp(suffix=".jpg", dir=self._TMP_DIR)
            with os.fdopen(fd, "wb") as image_file:
                image_file.write(image_bytes)
            job = self._get_client().submit(image=handle_file(tmp_path), api_name="/process_image")
            result = job.result(timeout=60)
            if isinstance(result, str):
                result = json.loads(result)
            return self._parse_response(result)
        except Exception as error:
            if job is not None:
                try:
                    job.cancel()
                except Exception:
                    pass
            raise classify_error(error) from None
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    def _parse_response(self, result):
        if isinstance(result, dict) and "error" in result:
            raise FaceServiceError("FACE_MODEL", "Face model rejected the image.")
        if not isinstance(result, list):
            raise FaceServiceError("FACE_MODEL", "Face model returned an invalid response.")
        faces = []
        for item in result:
            if not isinstance(item, dict) or "embedding" not in item:
                raise FaceServiceError("FACE_MODEL", "Face model returned invalid face data.")
            embedding = np.asarray(item["embedding"], dtype=np.float32)
            if embedding.shape != (512,) or not np.isfinite(embedding).all() or np.linalg.norm(embedding) == 0:
                raise FaceServiceError("FACE_MODEL", "Face model returned an invalid embedding.")
            faces.append({"embedding": embedding})
        return faces

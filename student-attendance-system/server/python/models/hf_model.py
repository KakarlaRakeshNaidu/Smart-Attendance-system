"""
HuggingFace Space Model Client
Replaces local InsightFace by calling the remote Gradio Space:
  https://huggingface.co/spaces/nitishsaini44/baffaloL_model

API endpoint : /process_image
Response fmt : JSON list of {"bbox": [...], "embedding": [...512 floats...]}

Requires HF_TOKEN env variable to avoid ZeroGPU rate limits.
Get your token at: https://huggingface.co/settings/tokens
"""

import json
import os
import tempfile
import numpy as np

from gradio_client import Client, handle_file


HF_SPACE_ID = "nitishsaini44/baffaloL_model"
HF_SPACE_URL = "https://nitishsaini44-baffalol-model.hf.space"


class HFSpaceModel:
    """
    Wrapper around the remote HuggingFace Gradio Space for face embedding extraction.

    Usage:
        model = HFSpaceModel()
        faces = model.get_faces(image_bytes)
        # faces is a list of dicts: [{"embedding": np.ndarray(512,)}, ...]
    """

    def __init__(self):
        print(f"Connecting to HuggingFace Space: {HF_SPACE_ID}")

        # Read HF token from environment — required to bypass ZeroGPU rate limits.
        # huggingface_hub (used internally by gradio_client) automatically picks up
        # the HUGGING_FACE_HUB_TOKEN / HF_TOKEN env vars, but we also call login()
        # explicitly for older versions of the library.
        hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        if hf_token:
            print("HF_TOKEN found — logging in with authentication.")
            try:
                from huggingface_hub import login
                login(token=hf_token, add_to_git_credential=False)
                print("huggingface_hub login successful.")
            except Exception as e:
                print(f"WARNING: huggingface_hub login failed: {e}")
        else:
            print("WARNING: HF_TOKEN not set. ZeroGPU rate limits will apply.")

        self.client = Client(HF_SPACE_URL)
        print("HuggingFace Space client initialized successfully!")

    # Use /dev/shm (Linux RAM-disk) when available — zero actual disk I/O.
    # Falls back to the system temp dir on Windows / macOS.
    _TMP_DIR = "/dev/shm" if os.path.isdir("/dev/shm") else tempfile.gettempdir()

    def get_faces(self, image_bytes: bytes) -> list:
        """
        Send raw image bytes to the HF Space and get back face data.

        Args:
            image_bytes: Raw image bytes (JPEG/PNG).

        Returns:
            List of face dicts: [{"embedding": np.ndarray(512,)}, ...]
            Returns empty list if no faces detected or on error.
        """
        tmp_path = None
        try:
            # Write to /dev/shm (RAM filesystem) so gradio_client gets a valid
            # file path while avoiding any real disk I/O on Linux servers.
            fd, tmp_path = tempfile.mkstemp(suffix=".jpg", dir=self._TMP_DIR)
            try:
                os.write(fd, image_bytes)
            finally:
                os.close(fd)

            # Call the /process_image endpoint on the HF Space
            result_string = self.client.predict(
                image=handle_file(tmp_path),
                api_name="/process_image"
            )

            if not result_string:
                print("[HFModel] Empty response from HF Space")
                return []

            result = json.loads(result_string)

            # Check if the space returned an error dict
            if isinstance(result, dict) and "error" in result:
                print(f"[HFModel] HF Space returned error: {result['error']}")
                return []

            faces = self._parse_response(result)
            print(f"[HFModel] Received {len(faces)} face(s) from HF Space")
            return faces

        except json.JSONDecodeError as e:
            print(f"[HFModel] JSON parse error: {e}. Raw: {result_string!r}")
            return []
        except Exception as e:
            print(f"[HFModel] Error calling HF Space: {e}")
            return []
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass

    def _parse_response(self, result) -> list:
        """
        Parse the HF Space response into a list of face dicts.

        The Space app.py returns:
          [{"bbox": [x1, y1, x2, y2], "embedding": [512 floats]}, ...]

        Returns:
          [{"embedding": np.ndarray(512,)}, ...]
        """
        faces = []

        if not isinstance(result, list):
            print(f"[HFModel] Unexpected response type: {type(result)}, value: {result}")
            return faces

        for item in result:
            if isinstance(item, dict) and "embedding" in item:
                emb = item["embedding"]
                if emb:  # skip empty embeddings
                    faces.append({
                        "embedding": np.array(emb, dtype=np.float32)
                    })

        return faces

# Test-only Flask runner. Never run against the configured application database.
import os
import numpy as np
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import api_server
if not api_server.db.name.startswith("attendance_regression_"):
    raise RuntimeError("Fixture runner requires an isolated regression database")
api_server.model.get_faces = lambda image: [{"embedding": np.ones(512, dtype=np.float32)}]
api_server.app.run(host="127.0.0.1", port=int(os.environ["FACE_FIXTURE_PORT"]), debug=False)

import base64
import unittest
from unittest.mock import Mock, patch
import numpy as np
from models.hf_model import HFSpaceModel, FaceServiceError, classify_error
import api_server

class FaceServiceTests(unittest.TestCase):
    def test_lazy_startup_does_not_connect_remote_client(self):
        with patch("models.hf_model.Client") as client:
            HFSpaceModel()
            client.assert_not_called()

    def test_valid_embedding_and_no_faces_are_distinct(self):
        model = HFSpaceModel()
        self.assertEqual(model._parse_response([]), [])
        faces = model._parse_response([{"embedding": [1.0] * 512}])
        self.assertEqual(faces[0]["embedding"].shape, (512,))

    def test_invalid_embeddings_and_model_response_fail_cleanly(self):
        model = HFSpaceModel()
        for response in [{"error": "upstream failed"}, None, [{"embedding": []}], [{"embedding": [0.0] * 512}], [{"embedding": [float("nan")] * 512}]]:
            with self.assertRaises(FaceServiceError):
                model._parse_response(response)

    def test_timeout_is_distinguished_and_temporary_file_removed(self):
        model = HFSpaceModel()
        job = Mock()
        job.result.side_effect = TimeoutError()
        model.client = Mock()
        model.client.submit.return_value = job
        with patch("models.hf_model.os.unlink", wraps=__import__("os").unlink) as unlink:
            with self.assertRaises(FaceServiceError) as caught:
                model.get_faces(b"synthetic image")
            self.assertEqual(caught.exception.code, "FACE_TIMEOUT")
            unlink.assert_called_once()
        job.cancel.assert_called_once()

    def test_authentication_and_connectivity_errors_are_distinct(self):
        error = Exception("secret upstream diagnostic")
        error.response = Mock(status_code=403)
        self.assertEqual(classify_error(error).code, "FACE_AUTH")
        self.assertNotIn("secret", str(classify_error(error)))
        self.assertEqual(classify_error(ConnectionError()).code, "FACE_UNAVAILABLE")

    def test_flask_health_and_invalid_body(self):
        client = api_server.app.test_client()
        self.assertEqual(client.get("/api/health").status_code, 200)
        self.assertEqual(client.post("/api/get-embedding", json=[]).status_code, 400)
        self.assertEqual(client.post("/api/get-embedding", json={"image": {}}).status_code, 400)

    def test_flask_model_failure_is_not_reported_as_no_face(self):
        client = api_server.app.test_client()
        for code in ["FACE_AUTH", "FACE_TIMEOUT", "FACE_UNAVAILABLE", "FACE_MODEL"]:
            with patch.object(api_server.model, "get_faces", side_effect=FaceServiceError(code, "Safe test error")):
                response = client.post("/api/get-embedding", json={"image": base64.b64encode(b"synthetic").decode()})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json["code"], code)

    def test_deterministic_multi_face_matching_against_isolated_embeddings(self):
        vector = np.ones(512, dtype=np.float32)
        students = {"FIXTURE": {"name": "Fixture", "embedding": vector}}
        with patch.object(api_server, "get_all_students_with_embeddings", return_value=students), patch.object(api_server.model, "get_faces", return_value=[{"embedding": vector}, {"embedding": vector}]):
            response = api_server.app.test_client().post("/api/recognize-multiple", json={"image": base64.b64encode(b"synthetic").decode()})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json["totalFaces"], 2)
            self.assertEqual(len(response.json["recognizedStudents"]), 1)
            self.assertEqual(response.json["recognizedStudents"][0]["studentId"], "FIXTURE")

if __name__ == "__main__":
    unittest.main()

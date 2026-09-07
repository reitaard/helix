import importlib
import io
import os
from pathlib import Path
import tempfile
import unittest

from fastapi import HTTPException, UploadFile


_TEST_TEMP = tempfile.TemporaryDirectory()
_TEST_ROOT = Path(_TEST_TEMP.name)
os.environ["HELIX_FACEFUSION_DATA_ROOT"] = str(_TEST_ROOT / "data")
os.environ["HELIX_FACEFUSION_ROOT"] = str(_TEST_ROOT / "facefusion")
os.environ["HELIX_FACEFUSION_PYTHON"] = str(_TEST_ROOT / "python.exe")
os.environ["HELIX_FACEFUSION_API_TOKEN"] = "test-token"
_TEST_APP = importlib.import_module("app")


class WorkerContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = _TEST_APP

    def test_settings_contract_accepts_worker_capabilities(self):
        value = self.app.validate_settings({
            "faceSelectorMode": "one",
            "referenceFacePosition": 0,
            "pixelBoost": "512x512",
            "weight": 0.5,
            "outputImageQuality": 90,
            "outputVideoQuality": 90,
        })
        self.assertEqual(value["pixelBoost"], "512x512")
        self.assertEqual(value["weight"], 0.5)

    def test_settings_rejects_untrusted_cli_surface(self):
        with self.assertRaises(Exception):
            self.app.validate_settings({"model": "something-else"})
        with self.assertRaises(Exception):
            self.app.validate_settings({"weight": 0.53})

    def test_failure_classification_is_safe_and_semantic(self):
        self.assertEqual(self.app.classify_failure("", "no source face detected!"), "no_source_face_detected")
        self.assertEqual(self.app.classify_failure("traceback secret path", ""), "processing_failed")
        self.assertEqual(self.app.job_response({"status": "failed"}), {"status": "failed", "error": {"code": "processing_failed"}})

    def test_cancel_waits_for_process_and_keeps_capacity_reserved(self):
        job_id = "job_cancel_capacity"
        original_active = self.app.active_job_id
        original_processes = dict(self.app.processes)
        original_cancelled = set(self.app.cancelled_jobs)

        class FakeProcess:
            def __init__(self):
                self.terminated = False
                self.waited = False
                self.exited = False

            def poll(self):
                return 0 if self.exited else None

            def terminate(self):
                self.terminated = True

            def wait(self, timeout=None):
                self.waited = True
                self.exited = True
                return 0

        try:
            self.app.save_job(job_id, {"status": "running", "request": {}, "createdAt": 0})
            fake = FakeProcess()
            self.app.active_job_id = job_id
            self.app.processes[job_id] = fake
            result = self.app.cancel_job(job_id, authorization="Bearer test-token")
            self.assertEqual(result, {"status": "cancelled"})
            self.assertTrue(fake.terminated)
            self.assertTrue(fake.waited)
            self.assertEqual(self.app.active_job_id, job_id)
        finally:
            self.app.active_job_id = original_active
            self.app.processes.clear()
            self.app.processes.update(original_processes)
            self.app.cancelled_jobs.clear()
            self.app.cancelled_jobs.update(original_cancelled)
            try:
                self.app.job_state_path(job_id).unlink()
                self.app.job_dir(job_id).rmdir()
            except OSError:
                pass

    def test_worker_version_is_0_3_0(self):
        self.assertEqual(self.app.WORKER_VERSION, "0.3.0")


class WorkerInputSemanticTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = _TEST_APP
        self.original_probe = self.app.probe_media
        self.original_detect = self.app.detect_face_count

    async def asyncTearDown(self):
        self.app.probe_media = self.original_probe
        self.app.detect_face_count = self.original_detect

    async def _upload(self, role: str, count: int):
        self.app.probe_media = lambda _path, _filename: ("image", {"width": 512, "height": 512})
        self.app.detect_face_count = lambda _path: count
        upload = UploadFile(filename="face.jpg", file=io.BytesIO(b"image"))
        return await self.app.upload_input(role=role, file=upload, authorization="Bearer test-token")

    async def test_source_zero_face_is_rejected_without_committed_input(self):
        before = set(self.app.INPUT_ROOT.iterdir())
        with self.assertRaises(HTTPException) as caught:
            await self._upload("source", 0)
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(caught.exception.detail, {"code": "no_source_face_detected"})
        self.assertEqual(set(self.app.INPUT_ROOT.iterdir()), before)

    async def test_target_zero_face_is_rejected_without_committed_input(self):
        before = set(self.app.INPUT_ROOT.iterdir())
        with self.assertRaises(HTTPException) as caught:
            await self._upload("target", 0)
        self.assertEqual(caught.exception.status_code, 422)
        self.assertEqual(caught.exception.detail, {"code": "no_target_face_detected"})
        self.assertEqual(set(self.app.INPUT_ROOT.iterdir()), before)

    async def test_image_with_faces_returns_count_and_handle(self):
        result = await self._upload("source", 2)
        self.assertEqual(result["role"], "source")
        self.assertEqual(result["mediaKind"], "image")
        self.assertEqual(result["faceCount"], 2)
        self.assertRegex(result["id"], self.app.UUID4_HEX)
        self.app.delete_input_files(result["id"])


def tearDownModule():
    _TEST_TEMP.cleanup()


if __name__ == "__main__":
    unittest.main()

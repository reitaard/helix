import importlib
import os
from pathlib import Path
import tempfile
import unittest


class WorkerContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        os.environ["HELIX_FACEFUSION_DATA_ROOT"] = str(root / "data")
        os.environ["HELIX_FACEFUSION_ROOT"] = str(root / "facefusion")
        os.environ["HELIX_FACEFUSION_PYTHON"] = str(root / "python.exe")
        os.environ["HELIX_FACEFUSION_API_TOKEN"] = "test-token"
        cls.app = importlib.import_module("app")

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

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

    def test_worker_version_is_0_3_0(self):
        self.assertEqual(self.app.WORKER_VERSION, "0.3.0")


if __name__ == "__main__":
    unittest.main()

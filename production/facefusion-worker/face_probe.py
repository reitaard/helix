"""Face-count probe executed with the pinned FaceFusion Python interpreter.

This intentionally imports FaceFusion from the existing installation without
modifying it. The probe uses FaceFusion's own face creation/detection path and
CPU execution so Telegram input validation cannot bypass Helix's shared-GPU
scheduler.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "invalid_arguments"}))
        return 2

    root = Path(os.environ.get("HELIX_FACEFUSION_ROOT", r"C:\AI\FaceFusion")).resolve()
    image_path = Path(sys.argv[1]).resolve()
    if not root.is_dir() or not image_path.is_file():
        print(json.dumps({"error": "invalid_path"}))
        return 2

    sys.path.insert(0, str(root))
    os.chdir(root)

    try:
        from facefusion import state_manager
        from facefusion.args import apply_args
        from facefusion.face_creator import get_static_faces
        from facefusion.program import create_program
        from facefusion.vision import read_static_image

        # Build state through FaceFusion's own parser so detector/landmarker
        # defaults match the pinned installation/config. CPU is deliberate:
        # validation happens before a durable GPU-resource claim exists.
        dummy_output = str(image_path.with_name(image_path.stem + ".helix-probe.png"))
        program = create_program()
        parsed = vars(program.parse_args([
            "headless-run",
            "--source-paths", str(image_path),
            "--target-path", str(image_path),
            "--output-path", dummy_output,
            "--processors", "face_swapper",
            "--execution-providers", "cpu"
        ]))
        apply_args(parsed, state_manager.init_item)

        frame = read_static_image(str(image_path))
        if frame is None:
            print(json.dumps({"error": "image_decode_failed"}))
            return 3
        faces = get_static_faces([frame])
        print(json.dumps({"faceCount": len(faces)}))
        return 0
    except Exception:
        # Do not emit traceback/path details across the worker boundary.
        print(json.dumps({"error": "face_analysis_failed"}))
        return 4


if __name__ == "__main__":
    raise SystemExit(main())

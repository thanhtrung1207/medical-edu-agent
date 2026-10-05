"""Regression tests for safe deployment-script command construction."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_backend_dry_run_reports_mirror_delete_without_exposing_secrets():
    token = "HF_SECRET_TOKEN_FOR_TEST"
    target = "private-owner/private-space"
    env = os.environ.copy()
    env.update(HF_TOKEN=token, HF_SPACE_ID=target)

    result = subprocess.run(
        [str(REPO_ROOT / "deploy.sh"), "--backend", "--dry-run"],
        cwd=REPO_ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "--delete '*'" in result.stdout
    assert token not in result.stdout + result.stderr
    assert target not in result.stdout + result.stderr

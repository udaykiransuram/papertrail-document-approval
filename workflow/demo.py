"""Fixed public demo identities, separate from password-based accounts."""

from pathlib import Path

# Vercel excludes **/public/** from Python function bundles. Runtime samples
# must live alongside the backend, independently of the CDN's public copies.
DEMO_SAMPLE_DIRECTORY = Path(__file__).with_name("samples")
DEMO_ACCOUNTS = {"submitter": "demo_submitter", "reviewer": "demo_reviewer"}
DEMO_SAMPLES = (
    ("Sample project proposal", "project-proposal.pdf"),
    ("Sample project brief", "project-brief.docx"),
)

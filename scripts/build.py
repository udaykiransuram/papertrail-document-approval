"""Vercel build hook; the platform collects Django static files afterwards."""

import shutil
import subprocess

manager = "pnpm" if shutil.which("pnpm") else "npm"
if manager == "pnpm":
    subprocess.run([manager, "install", "--frozen-lockfile"], check=True)
else:
    subprocess.run(
        ["npx", "--yes", "pnpm@10.32.1", "install", "--frozen-lockfile"], check=True
    )
    manager = None
subprocess.run(
    [manager, "build"] if manager else ["npx", "--yes", "pnpm@10.32.1", "build"],
    check=True,
)

#!/usr/bin/env python3
"""Build pistomp-mobile_*.deb without dpkg-deb (macOS / portable)."""
from __future__ import annotations

import os
import shutil
import tarfile
import tempfile
import time
from pathlib import Path


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    version = os.environ.get("PISTOMP_MOBILE_DEB_VERSION", "").strip()
    if not version:
        for line in (repo / "debian/changelog").read_text().splitlines():
            if line.startswith("pistomp-mobile ("):
                version = line.split("(", 1)[1].split(")", 1)[0]
                break
    if not version:
        raise SystemExit("Could not determine package version")

    arch = os.environ.get("PISTOMP_MOBILE_DEB_ARCH", "arm64")
    pkg = "pistomp-mobile"
    out = Path(os.environ.get("PISTOMP_MOBILE_DEB_OUT", str(repo / "dist-deb" / f"{pkg}_{version}_{arch}.deb")))
    out.parent.mkdir(parents=True, exist_ok=True)

    if not (repo / "dist/index.html").is_file():
        raise SystemExit("Missing dist/index.html — run npm run build")

    stage = Path(tempfile.mkdtemp(prefix="pistomp-mobile-deb-"))
    try:
        (stage / "opt/pistomp-mobile/dist").mkdir(parents=True)
        (stage / "lib/systemd/system").mkdir(parents=True)
        (stage / "etc/nginx/sites-available").mkdir(parents=True)
        (stage / "DEBIAN").mkdir()

        shutil.copytree(repo / "dist", stage / "opt/pistomp-mobile/dist", dirs_exist_ok=True)
        for name in ("pistomp-audio-api.py", "pistomp-wifi-api.py"):
            dst = stage / "opt/pistomp-mobile" / name
            shutil.copy2(repo / "scripts" / name, dst)
            os.chmod(dst, 0o755)
        for svc in (repo / "packaging/systemd").glob("*.service"):
            shutil.copy2(svc, stage / "lib/systemd/system" / svc.name)
        nginx = repo / "packaging/nginx/pistomp-mobile.conf"
        shutil.copy2(nginx, stage / "etc/nginx/sites-available/pistomp-mobile")
        shutil.copy2(nginx, stage / "etc/nginx/pistomp-mobile-8080.conf")

        for script in ("postinst", "prerm", "postrm"):
            text = (repo / "debian" / script).read_text()
            lines = [ln for ln in text.splitlines() if ln.strip() != "#DEBHELPER#"]
            path = stage / "DEBIAN" / script
            path.write_text("\n".join(lines) + "\n")
            os.chmod(path, 0o755)

        size_kb = sum(p.stat().st_size for p in stage.rglob("*") if p.is_file()) // 1024
        (stage / "DEBIAN/control").write_text(
            f"""Package: {pkg}
Version: {version}
Architecture: {arch}
Maintainer: Rosenau Productions <rosenauproductions@gmail.com>
Installed-Size: {size_kb}
Depends: nginx, python3
Section: web
Priority: optional
Homepage: https://github.com/rosenauproductions/Pistomp-Mobile
Description: Mobile web UI for Pi-Stomp (nginx :8080)
 Lightweight phone UI for controlling Pi-Stomp / MOD-UI over the
 device hotspot. Serves the app on port 8080 and proxies MOD API
 paths to localhost:80. Includes small ALSA and WiFi helper APIs.
"""
        )

        control_tar = stage / "control.tar.gz"
        data_tar = stage / "data.tar.gz"
        with tarfile.open(control_tar, "w:gz") as tar:
            for p in sorted((stage / "DEBIAN").iterdir()):
                tar.add(p, arcname=p.name)
        with tarfile.open(data_tar, "w:gz") as tar:
            for top in ("opt", "lib", "etc"):
                root = stage / top
                if not root.exists():
                    continue
                for path in sorted(root.rglob("*")):
                    rel = path.relative_to(stage)
                    tar.add(path, arcname="./" + rel.as_posix(), recursive=False)

        now = int(time.time())
        members = [
            ("debian-binary", b"2.0\n"),
            ("control.tar.gz", control_tar.read_bytes()),
            ("data.tar.gz", data_tar.read_bytes()),
        ]
        chunks = [b"!<arch>\n"]
        for name, data in members:
            hdr = (
                f"{name:<16}{now:<12}{0:<6}{0:<6}{0o100644:<8}{len(data):<10}"
            ).encode("ascii") + b"`\n"
            blob = hdr + data
            if len(data) % 2:
                blob += b"\n"
            chunks.append(blob)
        out.write_bytes(b"".join(chunks))
        print(out)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


if __name__ == "__main__":
    main()

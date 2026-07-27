#!/usr/bin/env bash
# Build pistomp-mobile_*.deb from this tree (prebuilt dist/ required).
#
#   npm run build          # on a computer, commit or copy dist/
#   bash scripts/build-deb.sh
#
# Uses dpkg-deb when available; otherwise portable Python ar writer (macOS OK).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

if [[ ! -f dist/index.html ]]; then
  echo "Missing dist/index.html — run: npm run build" >&2
  exit 1
fi

VERSION="$(dpkg-parsechangelog -l debian/changelog -S Version 2>/dev/null || true)"
if [[ -z "${VERSION}" ]]; then
  VERSION="$(sed -n 's/^pistomp-mobile (\([^)]*\)).*/\1/p' debian/changelog | head -1)"
fi
if [[ -z "${VERSION}" ]]; then
  echo "Could not read version from debian/changelog" >&2
  exit 1
fi

ARCH="arm64"
PKG_NAME="pistomp-mobile"
OUT_DIR="${REPO_ROOT}/dist-deb"
DEB_FILE="${OUT_DIR}/${PKG_NAME}_${VERSION}_${ARCH}.deb"
mkdir -p "${OUT_DIR}"

build_with_dpkg_deb() {
  local stage
  stage="$(mktemp -d "${TMPDIR:-/tmp}/pistomp-mobile-deb.XXXXXX")"
  # shellcheck disable=SC2064
  trap "rm -rf '${stage}'" RETURN

  mkdir -p \
    "${stage}/DEBIAN" \
    "${stage}/opt/pistomp-mobile/dist" \
    "${stage}/lib/systemd/system" \
    "${stage}/etc/nginx/sites-available"

  cp -a dist/. "${stage}/opt/pistomp-mobile/dist/"
  install -m 755 scripts/pistomp-audio-api.py "${stage}/opt/pistomp-mobile/"
  install -m 755 scripts/pistomp-wifi-api.py "${stage}/opt/pistomp-mobile/"
  install -m 644 packaging/systemd/*.service "${stage}/lib/systemd/system/"
  install -m 644 packaging/nginx/pistomp-mobile.conf \
    "${stage}/etc/nginx/sites-available/pistomp-mobile"
  install -m 644 packaging/nginx/pistomp-mobile.conf \
    "${stage}/etc/nginx/pistomp-mobile-8080.conf"

  local size_kb
  size_kb="$(du -sk "${stage}" | awk '{print $1}')"

  cat > "${stage}/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${VERSION}
Architecture: ${ARCH}
Maintainer: Rosenau Productions <rosenauproductions@gmail.com>
Installed-Size: ${size_kb}
Depends: nginx, python3
Section: web
Priority: optional
Homepage: https://github.com/rosenauproductions/Pistomp-Mobile
Description: Mobile web UI for Pi-Stomp (nginx :8080)
 Lightweight phone UI for controlling Pi-Stomp / MOD-UI over the
 device hotspot. Serves the app on port 8080 and proxies MOD API
 paths to localhost:80. Includes small ALSA and WiFi helper APIs.
EOF

  install -m 755 debian/postinst "${stage}/DEBIAN/postinst"
  install -m 755 debian/prerm "${stage}/DEBIAN/prerm"
  install -m 755 debian/postrm "${stage}/DEBIAN/postrm"
  if sed --version >/dev/null 2>&1; then
    sed -i '/^#DEBHELPER#/d' "${stage}/DEBIAN/postinst" "${stage}/DEBIAN/prerm" "${stage}/DEBIAN/postrm"
  else
    sed -i '' '/^#DEBHELPER#/d' "${stage}/DEBIAN/postinst" "${stage}/DEBIAN/prerm" "${stage}/DEBIAN/postrm"
  fi

  dpkg-deb --root-owner-group --build "${stage}" "${DEB_FILE}"
}

if command -v dpkg-deb >/dev/null 2>&1; then
  echo "Building ${DEB_FILE} with dpkg-deb..."
  build_with_dpkg_deb
else
  echo "Building ${DEB_FILE} with portable Python writer..."
  export PISTOMP_MOBILE_DEB_VERSION="${VERSION}"
  export PISTOMP_MOBILE_DEB_ARCH="${ARCH}"
  export PISTOMP_MOBILE_DEB_OUT="${DEB_FILE}"
  python3 "${REPO_ROOT}/scripts/build-deb-portable.py"
fi

echo "Built ${DEB_FILE}"
ls -lh "${DEB_FILE}"

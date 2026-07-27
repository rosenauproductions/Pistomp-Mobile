#!/usr/bin/env bash
# Update Pistomp-Mobile from git on the Pi (pull + install).
#
#   cd ~/Pistomp-Mobile
#   bash scripts/update-pistomp-mobile.sh
#   bash scripts/update-pistomp-mobile.sh --reboot    # headless: reboot after chroot
#   bash scripts/update-pistomp-mobile.sh --tag v1.1.0
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

PULL=1
TAG=""
INSTALL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) PULL=0; shift ;;
    --tag) TAG="${2:?--tag requires a value}"; shift 2 ;;
    --reboot) INSTALL_ARGS+=(--reboot); shift ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/update-pistomp-mobile.sh [options]

  --no-pull     Skip git fetch (install current tree only)
  --tag TAG     git fetch && git checkout TAG (detached) before install
  --reboot      Reboot after overlayroot install

Requires git clone at ~/Pistomp-Mobile with network for git pull (home Wi‑Fi).
EOF
      exit 0
      ;;
    *) INSTALL_ARGS+=("$1"); shift ;;
  esac
done

if [[ ! -d .git ]]; then
  cat <<'EOF'
This folder is not a git repo.

First-time install:
  git clone https://github.com/rosenauproductions/Pistomp-Mobile.git ~/Pistomp-Mobile
  cd ~/Pistomp-Mobile
  bash scripts/install-pistomp-mobile.sh
EOF
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git not found. Install: sudo apt-get update && sudo apt-get install -y git"
  exit 1
fi

if [[ "${PULL}" -eq 1 ]]; then
  echo "Fetching from origin..."
  git fetch origin
  if [[ -n "${TAG}" ]]; then
    echo "Checking out ${TAG}..."
    git checkout "${TAG}"
  else
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [[ "${branch}" == "HEAD" ]]; then
      echo "Detached HEAD — installing as-is. Use --tag or checkout a branch to track updates."
    else
      echo "Pulling ${branch}..."
      git pull --ff-only origin "${branch}"
    fi
  fi
fi

if ((${#INSTALL_ARGS[@]} > 0)); then
  exec bash "${REPO_ROOT}/scripts/install-pistomp-mobile.sh" "${INSTALL_ARGS[@]}"
else
  exec bash "${REPO_ROOT}/scripts/install-pistomp-mobile.sh"
fi

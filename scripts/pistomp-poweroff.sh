#!/bin/bash
# Called by pistomp-wifi-api POST /shutdown — same outcome as Pi-Stomp LCD
# "System shutdown" (modalapi: sudo systemctl --no-wall poweroff).
set -u
LOG=/tmp/pistomp-poweroff.log
exec >>"$LOG" 2>&1
echo "==== $(date -Is) pistomp-poweroff pid=$$ uid=$(id -u) ===="

try() {
  echo "+ $*"
  "$@" && echo "OK: $*" && exit 0
  echo "FAIL($?): $*"
}

# Detached delay so the HTTP response can finish first.
sleep 0.5

# Exact LCD path first
try sudo systemctl --no-wall poweroff
try systemctl --no-wall poweroff
try systemctl --no-wall --force poweroff
try loginctl poweroff
try busctl call org.freedesktop.login1 /org/freedesktop/login1 \
  org.freedesktop.login1.Manager PowerOff b false
try /sbin/shutdown -h now
try /sbin/poweroff -f

echo "All poweroff attempts failed"
exit 1

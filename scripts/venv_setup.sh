#!/bin/bash
# One-time setup: creates the Python venv and installs the SymplPM manager.
# Run once on the production server as a user with write access to /opt.
set -e

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="${VENV_DIR:-$APP_DIR/venv}"

echo "=== SymplPM venv setup ==="
echo "App dir : $APP_DIR"
echo "Venv dir: $VENV_DIR"

# ── Python venv ────────────────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python venv at $VENV_DIR ..."
  python3 -m venv "$VENV_DIR"
else
  echo "Venv already exists at $VENV_DIR — skipping creation."
fi

# ── Log directory (local, no root needed) ─────────────────────────────────────
mkdir -p "$APP_DIR/logs"

# ── Symlink manager into venv bin ──────────────────────────────────────────────
MANAGER_LINK="$VENV_DIR/bin/SymplPM"
# Ensure pip/setuptools are current in the venv (silent)
"$VENV_DIR/bin/pip" install --quiet --upgrade pip setuptools 2>/dev/null || true
if [ ! -L "$MANAGER_LINK" ]; then
  ln -s "$APP_DIR/scripts/sympl_manager.py" "$MANAGER_LINK"
  chmod +x "$APP_DIR/scripts/sympl_manager.py"
  echo "Linked sympl_manager.py → $MANAGER_LINK"
fi

# ── systemd service (optional — skipped if not running as root) ────────────────
SERVICE=/etc/systemd/system/SymplPM.service
if [ "$(id -u)" -eq 0 ] && [ ! -f "$SERVICE" ]; then
  cat > "$SERVICE" <<EOF
[Unit]
Description=SymplPM Product Development Platform
After=network.target

[Service]
Type=forking
PIDFile=/var/run/SymplPM.pid
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=8010
ExecStart=$VENV_DIR/bin/python $APP_DIR/scripts/sympl_manager.py start
ExecStop=$VENV_DIR/bin/python $APP_DIR/scripts/sympl_manager.py stop
ExecReload=$VENV_DIR/bin/python $APP_DIR/scripts/sympl_manager.py restart
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable SymplPM
  echo "systemd service installed and enabled."
else
  echo "Skipping systemd setup (not root or service already exists)."
fi

echo ""
echo "=== Setup complete ==="
echo "Activate the venv:  source $VENV_DIR/bin/activate"
echo "Start the app:      $VENV_DIR/bin/SymplPM start"
echo "Check status:       $VENV_DIR/bin/SymplPM status"
echo "Logs:               $APP_DIR/logs/app.log"

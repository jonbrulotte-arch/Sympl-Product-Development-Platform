#!/bin/bash
# One-time setup: creates the Python venv and installs the sympl manager.
# Run once on the production server as a user with write access to /opt.
set -e

VENV_DIR=/opt/sympl-venv
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Sympl venv setup ==="

# ── Python venv ────────────────────────────────────────────────────────────────
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python venv at $VENV_DIR ..."
  python3 -m venv "$VENV_DIR"
else
  echo "Venv already exists at $VENV_DIR — skipping creation."
fi

# ── Log directory ──────────────────────────────────────────────────────────────
sudo mkdir -p /var/log/sympl
sudo chown "$(whoami)" /var/log/sympl

# ── Symlink manager into venv bin ──────────────────────────────────────────────
MANAGER_LINK="$VENV_DIR/bin/sympl"
if [ ! -L "$MANAGER_LINK" ]; then
  ln -s "$APP_DIR/scripts/sympl_manager.py" "$MANAGER_LINK"
  chmod +x "$APP_DIR/scripts/sympl_manager.py"
  echo "Linked sympl_manager.py → $MANAGER_LINK"
fi

# ── systemd service (optional — skipped if not running as root) ────────────────
SERVICE=/etc/systemd/system/sympl.service
if [ "$(id -u)" -eq 0 ] && [ ! -f "$SERVICE" ]; then
  cat > "$SERVICE" <<EOF
[Unit]
Description=Sympl Product Development Platform
After=network.target

[Service]
Type=forking
PIDFile=/var/run/sympl.pid
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
  systemctl enable sympl
  echo "systemd service installed and enabled."
else
  echo "Skipping systemd setup (not root or service already exists)."
fi

echo ""
echo "=== Setup complete ==="
echo "Activate the venv:  source $VENV_DIR/bin/activate"
echo "Start the app:      sympl start   (or: python scripts/sympl_manager.py start)"
echo "Check status:       sympl status"

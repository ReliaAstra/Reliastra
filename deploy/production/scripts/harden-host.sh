#!/usr/bin/env bash
# harden-host.sh — idempotent VPS hardening for single-node production
# Run once via Tailscale SSH as root or sudo.
# Covers: UFW, sshd Tailscale-only, Tailscale, users, Docker, unattended-upgrades, NTP
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "run as root" >&2; exit 1
fi

TAILSCALE_IPV4="${TAILSCALE_IPV4:-100.64.0.1}"
ADMIN_USER="${ADMIN_USER:-reliastra-admin}"
DEPLOY_USER="${DEPLOY_USER:-reliastra-deploy}"

echo "=== Hardening host ==="

# 1. OS patches (unattended)
apt-get update
apt-get install -y unattended-upgrades ufw curl gpg
echo 'Unattended-Upgrade::Automatic-Reboot "false";' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades || true
timedatectl set-ntp true || true
systemctl enable --now systemd-timesyncd || true

# 2. Users — dedicated, no password, key only
for u in "$ADMIN_USER" "$DEPLOY_USER"; do
  if ! id "$u" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "$u"
  fi
  mkdir -p "/home/$u/.ssh"
  chmod 700 "/home/$u/.ssh"
  chown "$u:$u" "/home/$u/.ssh"
done

# Admin: sudo without password for ops, deploy: only deploy script via sudoers
cat > /etc/sudoers.d/reliastra-admin <<SUDO
$ADMIN_USER ALL=(ALL) NOPASSWD:ALL
SUDO
cat > /etc/sudoers.d/reliastra-deploy <<SUDO
$DEPLOY_USER ALL=(root) NOPASSWD: /opt/reliastra/scripts/deploy.sh *, /opt/reliastra/scripts/rollback.sh *, /opt/reliastra/scripts/healthcheck.sh *, /opt/reliastra/scripts/smoke-test.sh *, /opt/reliastra/scripts/preflight.sh *, /bin/systemctl status *, /usr/bin/docker ps *, /usr/bin/docker logs *
SUDO
chmod 440 /etc/sudoers.d/reliastra-*

# Deploy user restricted shell: only via authorized_keys command=
# Operator must add to /home/reliastra-deploy/.ssh/authorized_keys:
# command="sudo /opt/reliastra/scripts/deploy.sh --commit \$SSH_ORIGINAL_COMMAND",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA...

# 3. SSH — Tailscale only, key only, no root, no password
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s) || true
cat > /etc/ssh/sshd_config.d/99-reliastra.conf <<SSHD
# Reliastra — Tailscale-only SSH
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
AllowTcpForwarding no
PermitTunnel no
# Listen only on Tailscale + loopback (prevents public exposure even if UFW fails)
ListenAddress 127.0.0.1
ListenAddress $TAILSCALE_IPV4
# When Tailscale not yet up, ListenAddress may fail — alternative is to bind 0.0.0.0 and rely on UFW.
# We keep both for defense-in-depth; UFW is the hard boundary.
SSHD
# Remove ListenAddress if Tailscale IP not yet assigned (fallback to UFW only)
if ! ip addr show tailscale0 >/dev/null 2>&1; then
  echo "# Tailscale not yet up — relying on UFW for now" >> /etc/ssh/sshd_config.d/99-reliastra.conf
  sed -i '/ListenAddress.*100\./d' /etc/ssh/sshd_config.d/99-reliastra.conf || true
fi
systemctl restart sshd || systemctl restart ssh

# 4. UFW — deny public SSH, allow 80/443 public, allow SSH only on tailscale0
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
# Allow SSH only on tailscale interface
if ip link show tailscale0 >/dev/null 2>&1; then
  ufw allow in on tailscale0 to any port 22 proto tcp
else
  echo "WARN: tailscale0 not up — adding temporary rule for current SSH (will be tightened after Tailscale joins)"
  # Keep current SSH open until Tailscale is verified, then re-run this script
  ufw allow 22/tcp
fi
ufw --force enable
ufw status verbose

# 5. Docker daemon — no public exposure
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<DOCKER
{
  "live-restore": true,
  "no-new-privileges": true,
  "userland-proxy": false,
  "log-driver": "json-file",
  "log-opts": {"max-size":"10m","max-file":"5"}
}
DOCKER
systemctl restart docker || true

# 6. Tailscale — install if missing
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
echo "Tailscale join: tailscale up --authkey=\$TS_AUTHKEY --advertise-tags=tag:prod"
echo "Then verify: tailscale status --peers && tailscale ip -4"

# 7. File permissions for deploy
mkdir -p /opt/reliastra/{state,releases,logs,backups,scripts}
chown -R root:root /opt/reliastra
chmod 750 /opt/reliastra
chmod 700 /opt/reliastra/state /opt/reliastra/backups
touch /opt/reliastra/state/current.json /opt/reliastra/state/previous.json 2>/dev/null || true
chmod 640 /opt/reliastra/.env.production 2>/dev/null || true

echo "=== Hardening complete ==="
echo "Next: tailscale up, verify UFW, test SSH over Tailscale only, then run deploy"

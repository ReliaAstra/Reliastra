#!/usr/bin/env bash
# harden-host.sh - idempotent VPS hardening for single-node production
# Run as root or sudo, from Tailscale SSH, on a fresh host or to re-assert state.
# Covers: UFW, sshd Tailscale-only, Tailscale, users, Docker, unattended-upgrades, NTP
#
# Usage:
#   harden-host.sh                 apply hardening (idempotent, safe to re-run)
#   harden-host.sh --verify-ssh    report the REAL sshd listener state and exit.
#                                   Changes nothing. This is the check that matters:
#                                   it reads the kernel, not the intended config.
#
# NEVER commit a real tailnet or public address into this file. TAILSCALE_IPV4 is
# discovered from the running tailscale0 interface, never hardcoded, so the script
# carries no environment-specific value.
set -euo pipefail

VERIFY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --verify-ssh) VERIFY_ONLY=1 ;;
    *) echo "unknown arg $arg (usage: $0 [--verify-ssh])" >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "run as root" >&2; exit 1
fi

ADMIN_USER="${ADMIN_USER:-reliastra-admin}"
DEPLOY_USER="${DEPLOY_USER:-reliastra-deploy}"

# The tailnet address of THIS host, discovered rather than assumed. Empty when
# Tailscale is not up yet; every listener change below refuses to run without it.
TAILSCALE_IPV4="${TAILSCALE_IPV4:-$(ip -4 -o addr show tailscale0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1)}"
TAILSCALE_IPV4="${TAILSCALE_IPV4// /}"

# Does systemd own the sshd listener? Ubuntu 25.10+ ships ssh.socket with
# ListenStream=0.0.0.0:22 and hands its own socket to sshd, which makes every
# ListenAddress line in sshd_config inert with respect to the real listener.
# This must be DETECTED, not assumed: on an older or socket-disabled host the
# ListenAddress path is the only thing that works, and picking the wrong branch
# leaves SSH either public or unreachable.
ssh_socket_active() {
  systemctl is-active --quiet ssh.socket 2>/dev/null ||
    systemctl is-enabled --quiet ssh.socket 2>/dev/null
}

# The only trustworthy witness of what is actually listening. `sshd -T` is NOT:
# it reports the intended sshd_config, including ListenAddress values systemd
# never applied, so it will happily claim a tailnet-only listener while the
# kernel still has 0.0.0.0:22 open.
ssh_listener_report() {
  ss -ltn 2>/dev/null | awk '$4 ~ /:22$/ {print $4}'
}

ssh_listener_is_tailnet_only() {
  local addrs escaped
  addrs="$(ssh_listener_report)"
  # Any wildcard bind defeats the control entirely. Checked first.
  if grep -qE '^(0\.0\.0\.0|\[::\]|\*):22$' <<<"$addrs"; then
    return 1
  fi
  # Nothing bound at all is a failure too, never a pass.
  [[ -z "$addrs" || -z "$TAILSCALE_IPV4" ]] && return 1
  # Require the tailnet address to actually be there, so a host that bound only
  # loopback can never be reported as tailnet-only. The address is the whole
  # `ss` column, so anchor at both ends; allow the "%iface" qualifier `ss` may
  # append to the address.
  # (Getting this wrong once made a correct host look broken, which sent the
  # restore path below into a needless rollback - hence the explicit anchor.)
  escaped="${TAILSCALE_IPV4//./\\.}"
  grep -qE "^${escaped}(%[a-z0-9]+)?:22$" <<<"$addrs"
}

# Poll instead of sleeping once. A verification that can fire spuriously must not
# be wired to a destructive rollback: give systemd time to finish the rebind.
wait_for_tailnet_only() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    ssh_listener_is_tailnet_only && return 0
    sleep 1
  done
  return 1
}

report_ssh_listener() {
  echo "--- kernel listener state (authoritative) ---"
  local addrs
  addrs="$(ssh_listener_report)"
  if [[ -z "$addrs" ]]; then
    echo "  (nothing is listening on 22)"
  else
    sed 's/^/  /' <<<"$addrs"
  fi
  if [[ -n "$TAILSCALE_IPV4" ]]; then
    if ssh_listener_is_tailnet_only; then
      echo "  VERDICT: tailnet-only OK (127.0.0.1 + ${TAILSCALE_IPV4})"
      return 0
    fi
    echo "  VERDICT: NOT tailnet-only - sshd is reachable from more than the tailnet" >&2
  else
    echo "  VERDICT: unknown - tailscale0 has no IPv4 address" >&2
  fi
  return 1
}

if [[ "$VERIFY_ONLY" -eq 1 ]]; then
  if ssh_socket_active; then
    echo "sshd socket activation: ACTIVE (systemd owns the listener)"
    systemctl show ssh.socket -p Listen 2>/dev/null | sed 's/^/  /'
  else
    echo "sshd socket activation: inactive (sshd binds its own sockets)"
    echo "  effective sshd_config ListenAddress (intended, not proof):"
    sshd -T 2>/dev/null | grep -i '^listenaddress' | sed 's/^/  /'
  fi
  report_ssh_listener
  exit $?
fi

echo "=== Hardening host ==="

# 1. OS patches (unattended)
apt-get update
apt-get install -y unattended-upgrades ufw curl gpg
echo 'Unattended-Upgrade::Automatic-Reboot "false";' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades || true
timedatectl set-ntp true || true
systemctl enable --now systemd-timesyncd || true

# 2. Users - dedicated, no password, key only
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

# Deploy user: plain key, NO forced command. The CI deploy runs preflight.sh,
# deploy.sh AND smoke-test.sh with varying args over this one key, so a
# `command="..."` forced command in authorized_keys would break the deploy.
# Least privilege is enforced by the sudoers rule above instead.
# Operator must add to /home/reliastra-deploy/.ssh/authorized_keys:
# no-port-forwarding,no-agent-forwarding ssh-ed25519 AAAA... ci-deploy

# 3. SSH - Tailscale only, key only, no root, no password
#
# ── Hard lessons encoded here, all learned on Ubuntu 26.04 ────────────────
#
#  * `systemctl reload ssh` DOES NOT REBIND THE LISTEN SOCKET. Neither does
#    `systemctl restart ssh` when sshd is socket-activated, because systemd
#    owns the socket and only the socket unit can rebind it. The old code ran
#    `systemctl restart sshd || systemctl restart ssh`, which on this OS
#    restarted a service that does not own the listener. Result: the config
#    said tailnet-only, the kernel still had 0.0.0.0:22, and nothing said so.
#    Rebinding requires `systemctl restart ssh.socket` (see below).
#
#  * `sshd -T` IS NOT PROOF. It reports the INTENDED sshd_config, so it
#    printed `listenaddress 100.x` while the real listener was 0.0.0.0. It
#    cannot see systemd's socket. Always confirm with `ss -ltn`, which reads
#    the kernel. `--verify-ssh` in this script exists for exactly that.
#
#  * DETECT socket activation, do not assume it. When it is on, every
#    ListenAddress line in sshd_config is INERT for the real listener and the
#    restriction must be expressed on the socket unit. When it is off,
#    ListenAddress is the only mechanism that works. Guessing wrong either
#    exposes SSH publicly or makes it unreachable.
#
#  * ASSERT the tailnet address before applying. The old fallback stripped the
#    100.x ListenAddress when tailscale0 was down and left
#    `ListenAddress 127.0.0.1`, which binds SSH to loopback ONLY and locks the
#    operator out of the host entirely, while a comment in the file claimed the
#    host was merely "relying on UFW". Binding nothing is not a safe fallback,
#    it is an outage with a reassuring comment attached. Refuse to apply.
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%s) || true

# Authentication posture: written unconditionally, since none of it depends on
# the listener. ListenAddress is added to this same file only in the
# non-socket-activated branch; on a socket-activated host it is written there
# too, but purely as defence in depth (it feeds sshd-socket-generator, and it
# is what a future non-socket-activated host would rely on) - never as the
# control that makes SSH tailnet-only.
write_sshd_dropin() {
  cat > /etc/ssh/sshd_config.d/99-reliastra.conf <<SSHD
# Reliastra - Tailscale-only SSH (managed by deploy/production/scripts/harden-host.sh)
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
AllowTcpForwarding no
PermitTunnel no
# Pre-auth connection flood valve. OpenSSH ships 10:30:100 and this host was
# tightened to 2:30:10, which starts RANDOMLY DROPPING connections once two
# unauthenticated sessions overlap. That is not brute-force protection, it is
# collateral damage: an operator running two commands at once, a CI job opening
# a couple of parallel sessions, or an editor with a few saved hosts all get
# spurious "Connection closed"/timeouts that look like a flaky host and burn
# real time. The pre-auth defences that actually matter here are untouched:
# this listener is tailnet-only, passwords are off, MaxAuthTries is 3 and
# LoginGraceTime is 30. Restore the upstream default.
MaxStartups 10:30:100
SSHD
  if [[ -n "$TAILSCALE_IPV4" ]]; then
    cat >> /etc/ssh/sshd_config.d/99-reliastra.conf <<SSHD
# Intended listener. INERT when ssh.socket is active - the real control is
# /etc/systemd/system/ssh.socket.d/99-reliastra-tailnet.conf in that case.
ListenAddress 127.0.0.1
ListenAddress $TAILSCALE_IPV4
SSHD
  fi
}

if [[ -z "$TAILSCALE_IPV4" ]]; then
  # Refuse rather than bind nothing. Leave the existing listener untouched so
  # the operator keeps whatever access they currently have.
  write_sshd_dropin   # no ListenAddress: authentication hardening only
  if ssh_socket_active; then
    systemctl restart ssh.socket
  else
    systemctl restart ssh 2>/dev/null || systemctl restart sshd
  fi
  echo
  echo "BLOCKER: tailscale0 has no IPv4 address, so a tailnet-only listener" >&2
  echo "  cannot be asserted. The SSH listener was left as it was - NOT" >&2
  echo "  narrowed - because binding nothing would lock you out." >&2
  echo "  Do this from the provider console, then re-run this script:" >&2
  echo "    tailscale up --authkey=\$TS_AUTHKEY --advertise-tags=tag:prod" >&2
  echo "  Public 22 stays blocked by UFW's default deny (see section 4)." >&2
else
  # Stash the current state so a failed apply can be undone completely, not
  # half-way. Both files are restored together; leaving the socket drop-in
  # deleted but the sshd_config rewrite in place is how a host ends up relying
  # on the generator alone - which is the fragility this section exists to
  # remove.
  SSHD_DROPIN=/etc/ssh/sshd_config.d/99-reliastra.conf
  SOCKET_DROPIN=/etc/systemd/system/ssh.socket.d/99-reliastra-tailnet.conf
  [[ -f "$SSHD_DROPIN" ]] && cp -a "$SSHD_DROPIN" "${SSHD_DROPIN}.bak.$(date +%s)"
  [[ -f "$SOCKET_DROPIN" ]] && cp -a "$SOCKET_DROPIN" "${SOCKET_DROPIN}.bak.$(date +%s)"

  restore_previous_ssh_config() {
    local f
    for f in "$SSHD_DROPIN" "$SOCKET_DROPIN"; do
      local newest
      newest="$(ls -1t "${f}".bak.* 2>/dev/null | head -1 || true)"
      if [[ -n "$newest" ]]; then cp -a "$newest" "$f"; else rm -f "$f"; fi
    done
    systemctl daemon-reload
    if ssh_socket_active; then systemctl restart ssh.socket; else systemctl restart ssh; fi
  }

  write_sshd_dropin
  sshd -t || { echo "FATAL: sshd_config is invalid; not restarting sshd" >&2; exit 1; }

  if ssh_socket_active; then
    # Socket activation is ON: systemd owns the listener, so express the
    # restriction on the socket unit. The empty ListenStream= first RESETS the
    # inherited list (0.0.0.0:22 and [::]:22) - without it the assignments
    # would ADD to it and the host would stay public. Drop-ins in
    # /etc/systemd/system/<unit>.d/ sort after the generator's addresses.conf,
    # so this list wins.
    mkdir -p /etc/systemd/system/ssh.socket.d
    cat > "$SOCKET_DROPIN" <<UNIT
# Managed by deploy/production/scripts/harden-host.sh - tailnet-only SSH.
# Socket activation owns the listener (systemd passes its socket to sshd), so a
# ListenAddress in sshd_config cannot restrict it. Restrict it HERE.
# The empty ListenStream= resets the inherited 0.0.0.0:22 / [::]:22 entries.
[Socket]
ListenStream=
ListenStream=127.0.0.1:22
ListenStream=$TAILSCALE_IPV4:22
UNIT
    # daemon-reload re-runs sshd-socket-generator (it re-reads sshd_config, so
    # the two sources of truth agree). A reload is NOT enough to rebind.
    systemctl daemon-reload
    # MUST be a restart of the socket unit. `reload` and `restart ssh` leave
    # the old sockets bound.
    systemctl restart ssh.socket
  else
    # Socket activation is OFF: sshd binds its own sockets, so ListenAddress in
    # sshd_config is the real control. Only reachable on hosts that have not
    # migrated to ssh.socket, or where an operator disabled it deliberately.
    echo "ssh.socket inactive - restricting via sshd_config ListenAddress"
    systemctl restart ssh 2>/dev/null || systemctl restart sshd
  fi

  # Prove it against the kernel, not the config. Poll, because a premature
  # verdict here triggers the rollback below.
  if ! wait_for_tailnet_only; then
    echo "FATAL: sshd did not end up tailnet-only. Restoring the previous config." >&2
    report_ssh_listener || true
    restore_previous_ssh_config
    echo "Restored. Current state:" >&2
    report_ssh_listener || true
    exit 1
  fi
  report_ssh_listener
fi

# 4. UFW - deny public SSH, allow 80/443 public, allow SSH only on tailscale0
#
# RECONCILE, never `ufw reset`. `ufw --force reset` deletes the whole ruleset
# including operator-added rules - it had already destroyed a hand-added
# `ufw deny 25/tcp` on this host. A script that claims to be idempotent must
# converge on the required state without discarding unrelated intent, so every
# call below is an additive `ufw allow` (a no-op when the rule already exists).
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 41641/udp   # Tailscale WireGuard, for peers to reach this node

if [[ -n "$TAILSCALE_IPV4" ]]; then
  # Interface-scoped SSH allow. It is inserted BEFORE any broader rule and
  # UFW appends in order, so it keeps matching first. That ordering is why no
  # explicit `ufw deny 22/tcp` is added anywhere: a broad deny, if it ever
  # sorted ahead of this accept, would sever the only way into the host, and
  # the ordering is not something an operator can see. Public 22 is already
  # denied by `default deny incoming`, and the kernel-level listener is
  # tailnet-only anyway - two independent controls, neither of which depends
  # on rule order.
  ufw allow in on tailscale0 to any port 22 proto tcp comment 'SSH_Tailscale'
  ufw --force enable
  ufw status verbose
else
  # Do NOT enable UFW here. Without the tailnet-scoped allow above, enabling it
  # would drop the operator's own session, and the previous version of this
  # script "solved" that by adding a public `ufw allow 22/tcp` - which opens
  # SSH to the internet in exactly the window where Tailscale is not yet up.
  echo "BLOCKER: tailscale0 is down, so the tailnet SSH allow cannot be added." >&2
  echo "  UFW left UNCHANGED and NOT enabled - enabling it now could cut off" >&2
  echo "  your only route in. Join the tailnet, then re-run this script." >&2
  exit 1
fi

# 5. Docker daemon - no public exposure
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

# 6. Tailscale - install if missing
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

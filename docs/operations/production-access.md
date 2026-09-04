# Production Access — Tailscale-Only

## Trust boundary
Developer workstation is **untrusted** for direct public SSH. All prod admin is `Tailscale → SSH` over `tailscale0` (100.64.0.0/10). Public `22/tcp` is `DENY` via UFW; `sshd` `ListenAddress` is `127.0.0.1` + `100.x` (Tailscale IPv4).

## Join
```bash
# On VPS (once)
sudo tailscale up --authkey=$TS_AUTHKEY --advertise-tags=tag:prod
tailscale status --peers
tailscale ip -4  # → 100.x.y.z
```
ACL (`admin` Tailnet policy):
```json
{
  "acls": [{ "action": "accept", "src": ["autogroup:admin","tag:ci"], "dst": ["tag:prod:22"] }],
  "ssh": [{ "action": "accept", "src": ["autogroup:admin"], "dst": ["tag:prod"], "users": ["reliastra-admin"] }]
}
```

## Users
- `reliastra-admin` — human admin, `NOPASSWD:ALL` via `/etc/sudoers.d/reliastra-admin`, SSH key in `~/.ssh/authorized_keys`, `PasswordAuthentication no`, `PermitRootLogin no`.
- `reliastra-deploy` — CI deploy principal, **restricted**: `authorized_keys` `command="sudo /opt/reliastra/scripts/deploy.sh --commit $SSH_ORIGINAL_COMMAND",no-port-forwarding,no-agent-forwarding,no-pty` + sudoers allow only `deploy.sh, rollback.sh, healthcheck.sh, smoke-test.sh, preflight.sh, docker ps/logs, systemctl status`.

## Verify
```bash
# From admin laptop over Tailscale
ssh reliastra-admin@100.x.y.z  # OK
ssh -p 22 <public-ip>          # → timeout / 22 filtered (UFW)
sudo ufw status verbose        # should show `22/tcp on tailscale0 ALLOW`, `80,443 ALLOW`, `22 DENY` public
sudo sshd -T | grep -E "PasswordAuth|PermitRoot|ListenAddress"
tailscale ping 100.x.y.z
```

## Audit
`journalctl -u sshd`, `/var/log/auth.log`, `tailscale whois`, GH `deploy-production.yml` logs + `/opt/reliastra/state/*.json`.

## Emergency
If Tailscale down, use VPS provider console (Hetzner/DO) serial console → `tailscale status` → `systemctl restart tailscaled`. No public SSH fallback.

# Production Access - Tailscale-Only

> **Host addresses are deliberately not in this repository.** This file is public.
> The Tailscale IPv4 and public IPv4 of the production host are held in the
> operator password manager and in the untracked local file
> `deploy/production/.host.local` (gitignored). Retrieve them with
> `make prod-host` or `cat deploy/production/.host.local` on a provisioned
> workstation. Never commit them; see `docs/operations/production-access.md`
> audit note.

## Trust boundary
Developer workstation is **untrusted** for direct public SSH. All prod admin is `Tailscale → SSH` over `tailscale0` (`100.64.0.0/10`). Public `22/tcp` is `DENY` via UFW; `sshd` `ListenAddress` is `127.0.0.1` + `100.x` (Tailscale IPv4).

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

## Users (actual state 2026-09-27, verified on host)
- `reliastra` - human operator **and** CI deploy principal, `(ALL) NOPASSWD: ALL` (full passwordless sudo). CI uses a dedicated keypair (`reliaastra-ci-deploy`, private half in GH `production` secret `PROD_DEPLOY_SSH_PRIVATE_KEY`, public half in `~/.ssh/authorized_keys`).
- Hardening TODO: split into `reliastra-admin` (human, `NOPASSWD:ALL`) + restricted `reliastra-deploy` (CI only, sudoers allow-list for deploy scripts, `no-port-forwarding,no-agent-forwarding` on its key) as originally designed.

## Verify
```bash
# From admin laptop over Tailscale.
# Host address comes from the untracked local file, never from this repo.
source deploy/production/.host.local 2>/dev/null || echo "see operator password manager"
ssh "reliastra@${TS_HOST:-<tailscale-ip>}"        # over tailnet, expected OK
ssh -p 22 "${PUBLIC_HOST:-<public-ip>}"           # → timeout / 22 filtered (UFW)
sudo ufw status verbose        # should show `22/tcp on tailscale0 ALLOW`, `80,443 ALLOW`, `22 DENY` public
sudo sshd -T | grep -E "PasswordAuth|PermitRoot|ListenAddress"
tailscale ping "${TS_HOST:-<tailscale-ip>}"
```

## Audit
`journalctl -u sshd`, `/var/log/auth.log`, `tailscale whois`, GH `deploy-production.yml` logs + `/opt/reliastra/state/*.json`.

## Emergency
If Tailscale down, use VPS provider console (Hetzner/DO) serial console → `tailscale status` → `systemctl restart tailscaled`. No public SSH fallback.

# Production Access - Tailscale-Only

> **Host addresses are deliberately not in this repository.** This file is public.
> The Tailscale IPv4 and public IPv4 of the production host are held in the
> operator password manager and in the untracked local file
> `deploy/production/.host.local` (gitignored). Retrieve them with
> `make prod-host` or `cat deploy/production/.host.local` on a provisioned
> workstation. Never commit them; see `docs/operations/host-hardening-audit.md`
> audit note.

## Trust boundary

The developer workstation is **untrusted** for direct public SSH. All prod admin
is `Tailscale → SSH` over `tailscale0` (`100.64.0.0/10`).

Public `22/tcp` is held closed by **two independent controls**:

1. **The kernel listener.** `sshd` is not bound to the wildcard address. The
   listening sockets are `127.0.0.1:22` and `<tailscale-ipv4>:22` and nothing
   else, so a public packet has no socket to be delivered to.
2. **UFW.** `default deny incoming`, with a single SSH allow rule scoped to the
   `tailscale0` interface.

Either one alone would be sufficient; neither depends on the ordering of the
other.

### Why this is not a `ListenAddress` (read before "fixing" it)

On Ubuntu 25.10+ `sshd` is **socket-activated**: `ssh.socket` owns the listening
socket and passes it to `sshd`, and the stock unit listens on `0.0.0.0:22` and
`[::]:22`. A `ListenAddress` line in `sshd_config` therefore does **not** move
the real listener on such a host. The restriction is expressed as a drop-in on
the socket unit instead:

```
/etc/systemd/system/ssh.socket.d/99-reliastra-tailnet.conf
  [Socket]
  ListenStream=                # empty assignment RESETS the inherited 0.0.0.0:22
  ListenStream=127.0.0.1:22
  ListenStream=<tailscale-ipv4>:22
```

`harden-host.sh` writes this file, and writes the matching `ListenAddress` into
`/etc/ssh/sshd_config.d/99-reliastra.conf` as defence in depth (Ubuntu ships
`sshd-socket-generator`, which turns `ListenAddress` into an equivalent socket
drop-in, but only when a `daemon-reload` re-runs it — do not rely on that as the
control). It **detects** whether socket activation is in use and branches; it
does not assume either way. See `docs/operations/host-hardening-audit.md` for the
full incident.

### `sshd -T` is not evidence

`sshd -T` reports the *intended* configuration from `sshd_config`. It will
happily print `listenaddress <tailnet-ip>` while the kernel is still listening
on `0.0.0.0:22`, because it cannot see the socket systemd owns. It is useful for
authentication posture (`PasswordAuthentication`, `PermitRootLogin`) and
**useless** for the listener. Use `ss -ltn`, which reads the kernel.

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
- Hardening TODO: split into `reliastra-admin` (human, `NOPASSWD:ALL`) + restricted `reliastra-deploy` (CI only, sudoers allow-list for deploy scripts, `no-port-forwarding,no-agent-forwarding` on its key) as originally designed. Note that
  `sshd_config` also carries `AllowUsers reliastra deploy`, so any new account
  `harden-host.sh` creates (`reliastra-admin`, `reliastra-deploy`) is **not**
  permitted to log in until it is added to that list. Creating the account alone
  does not grant access.

## Verify

Verify from outside the tailnet as well as inside. Inside-the-tailnet checks
alone cannot distinguish "SSH is tailnet-only" from "UFW is blocking me".

```bash
# Host address comes from the untracked local file, never from this repo.
source deploy/production/.host.local 2>/dev/null || echo "see operator password manager"

# --- the control that matters: the real kernel listener -------------------
sudo /opt/reliastra/scripts/harden-host.sh --verify-ssh
# or by hand - note this, NOT `sshd -T`:
sudo ss -ltn | grep ':22 '
# expect exactly two lines: 127.0.0.1:22 and <tailscale-ipv4>:22
# a 0.0.0.0:22 or [::]:22 line means the restriction is NOT in effect

sudo systemctl show ssh.socket -p Listen      # the socket unit's own view
sudo cat /etc/systemd/system/ssh.socket.d/99-reliastra-tailnet.conf

# --- authentication posture: sshd -T is correct for these ------------------
sudo sshd -T | grep -iE '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'

# --- UFW ------------------------------------------------------------------
sudo ufw status verbose      # 22/tcp ALLOW on tailscale0; 80,443 public; default deny incoming

# --- from a machine OUTSIDE the tailnet ------------------------------------
# 22 must be filtered, not merely refused. "refused" means something answered.
nmap -Pn -p 22,80,443,5432,6379,2375,8000 "${PUBLIC_HOST:-<public-ip>}"
ssh -p 22 "${PUBLIC_HOST:-<public-ip>}"       # expect timeout / filtered

tailscale ping "${TS_HOST:-<tailscale-ip>}"
```

### Notes that will save you time

- **Port 25 answers `open` from outside, and no rule on this host can change
  that.** It is answered upstream by the provider, not by this host. See
  `docs/operations/host-hardening-audit.md` before investigating; a provider
  ticket is required.
- **`ufw-user-input` is not a direct child of `INPUT`, and that is correct.**
  Stock UFW hangs it off `ufw-before-input`, so `iptables -S INPUT` will never
  mention it. This is not a broken chain — see the audit doc for the counters
  that prove it is traversed, and for why adding the jump by hand would make
  things worse.
- **All public web traffic is authorised in `FORWARD`, not `INPUT`.** `80/443`
  are published Docker container ports, so they are DNAT'd and traverse the
  `DOCKER`/`DOCKER-FORWARD` chains. The `INPUT` policy is what protects the
  host-bound ports (`5432`, `6379`, `2375`, `8000`). Do not read INPUT counters
  expecting to see web hits.
- **`sshd` runs `MaxStartups 2:30:10`.** Rapid repeated `ssh`/`scp` calls get
  randomly dropped *before* authentication, which looks like a flaky host but is
  the intended brute-force throttle. Reuse one connection
  (`ControlMaster auto`/`ControlPersist`) or space attempts out.

## Re-asserting state

`harden-host.sh` is idempotent and safe to re-run; it is the supported way to
re-apply the SSH listener restriction and the firewall after a rebuild or a
manual change.

```bash
sudo /opt/reliastra/scripts/harden-host.sh          # re-assert everything
sudo /opt/reliastra/scripts/harden-host.sh --verify-ssh   # check only, changes nothing
```

Two properties worth relying on:

- It **verifies against the kernel** after changing the listener and restores the
  previous configuration if the tailnet-only state was not reached, rather than
  leaving an unknown listener in place.
- It **refuses to narrow the listener when `tailscale0` has no IPv4 address**,
  and refuses to enable UFW without the tailnet-scoped SSH allow. Binding
  nothing is an outage, not a safe fallback.

It also **reconciles** UFW instead of resetting it, so operator-added rules
(for example a `ufw deny <port>`) survive a re-run.

## Audit
`journalctl -u sshd`, `/var/log/auth.log`, `tailscale whois`, GH `deploy-production.yml` logs + `/opt/reliastra/state/*.json`.

## Emergency
If Tailscale down, use VPS provider console (Hetzner/DO) serial console → `tailscale status` → `systemctl restart tailscaled`. No public SSH fallback.

Two things to know before you rely on the console:

- The console is the *only* recovery path if the listener is misconfigured, so
  the listener changes are deliberately fail-safe: they validate first and roll
  back on a failed check.
- After any console recovery, re-run `harden-host.sh` and then
  `--verify-ssh`. Do not assume the listener came back the way you left it.
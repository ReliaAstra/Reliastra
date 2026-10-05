# Host Hardening Audit - SSH Listener and Port 25

Recorded 2026-10-04, against the running production host (Ubuntu 26.04 LTS,
kernel 7.0.0-28-generic). Every claim below was checked on the host; nothing
here is inferred from configuration alone. Host addresses are deliberately
omitted - see `docs/operations/production-access.md`.

Two items are recorded because both cost real time to diagnose and neither is
visible from the repository:

| # | Finding | Status |
|---|---|---|
| A | `harden-host.sh` wrote an inert SSH restriction; a rebuilt host would be public on 22 | **Fixed** in `deploy/production/scripts/harden-host.sh` |
| B | Port 25 answers `open` from the internet although nothing on the host listens on it | **Upstream, provider ticket required** |
| C | Suspected missing `ufw-user-input` jump | **Not a defect** - misdiagnosis, see below |

---

## A. The SSH listener restriction was dead config

### What was claimed

`harden-host.sh` wrote a tailnet-only listener into
`/etc/ssh/sshd_config.d/99-reliastra.conf` and then ran:

```bash
systemctl restart sshd || systemctl restart ssh
```

and the access doc asserted that "`sshd` `ListenAddress` is `127.0.0.1` +
`100.x`".

### What was actually true

`sshd` is socket-activated on this OS:

```
$ systemctl is-active ssh.socket      → active, enabled
$ systemctl cat ssh.socket            → ListenStream=0.0.0.0:22, ListenStream=[::]:22
```

systemd owns the listening socket and passes it to `sshd`. A `ListenAddress` in
`sshd_config` cannot move that socket.

### Root cause - three things compounded, and the third is why nobody noticed

1. **Wrong mechanism.** The restriction was written to `sshd_config` instead of
   the socket unit. On a socket-activated host that file does not control the
   listener.
2. **Wrong unit restarted.** The script restarted the *service*.
   `systemctl restart ssh` does not rebind a socket that `ssh.socket` owns, and
   the script never ran `systemctl daemon-reload`, so
   `sshd-socket-generator` (which *would* have translated `ListenAddress` into a
   socket drop-in) never re-ran either. Net effect: nothing was applied.
3. **The obvious check was structurally incapable of noticing.**
   `sshd -T` reads `sshd_config`, not the kernel, so it printed the intended
   tailnet-only values while the host was still listening on `0.0.0.0:22`. It
   cannot see systemd's socket, so using it as proof meant the control was never
   actually verified.

### Reproduced on the live host

With no socket drop-in, no `ListenAddress`, and a boot-equivalent
`daemon-reload` + `restart ssh.socket`:

```
[sshd -T claims]
listenaddress [::]:22
listenaddress 0.0.0.0:22
[KERNEL - ss -ltn | grep ':22 ']
LISTEN 0      4096                0.0.0.0:22         0.0.0.0:*
LISTEN 0      4096                   [::]:22            [::]:*
```

A rebuild produced exactly this. Public SSH was being held closed by UFW's
`default deny incoming` alone — one control instead of two, on a host where
`harden-host.sh` had been reporting success.

### Fix

`harden-host.sh` now:

- **detects** socket activation and branches. Socket-activated hosts get the
  restriction on `/etc/systemd/system/ssh.socket.d/99-reliastra-tailnet.conf`
  (with the empty `ListenStream=` that resets the inherited wildcard entries);
  hosts without it keep using `ListenAddress`. Assuming either way is itself a
  vulnerability.
- **asserts the tailnet address is present before applying.** If `tailscale0`
  has no IPv4, it refuses to narrow the listener and says so, rather than
  binding something useless.
- **rebinds correctly**: `daemon-reload` (so the generator agrees) followed by
  `restart ssh.socket` — never `reload`, never `restart ssh`.
- **verifies against the kernel** with `ss -ltn` after the change, and restores
  the previous configuration if the tailnet-only state was not reached. The
  check polls rather than sampling once, because a premature verdict here would
  trigger a needless rollback.
- exposes `--verify-ssh`, a read-only mode that reports the real listener state
  and changes nothing.

Two related latent bugs in the old script were fixed at the same time:

- **The no-Tailscale fallback was an outage.** It stripped the `100.x`
  `ListenAddress` when `tailscale0` was down and left
  `ListenAddress 127.0.0.1` — loopback-only, i.e. SSH unreachable from
  anywhere — while a comment in the same file claimed the host was "relying on
  UFW". The `sed` also matched a hardcoded `100\.` rather than the configured
  address.
- **UFW was not idempotent despite the file claiming to be.**
  `ufw --force reset` deletes the entire ruleset including operator-added rules;
  it had already destroyed a hand-added `ufw deny 25/tcp` on this host. The
  section now reconciles (`ufw allow ...` is a no-op when the rule exists)
  instead of resetting, and refuses to enable UFW when the tailnet SSH allow
  cannot be added — the old code "solved" that by adding a public
  `ufw allow 22/tcp`, opening SSH to the internet in exactly the window where
  Tailscale was not yet up.

The verifier is unit-tested off-host against recorded `ss` output in
`deploy/production/scripts/test-ssh-listener.sh` (16 cases, wired into
`test-harness.sh`). It sources the functions from `harden-host.sh` rather than
copying them, so the test cannot drift from what the host runs. That test exists
because the first version of the verifier's regex was wrong: it rejected a
correctly-restricted host, and because the verdict is wired to a rollback, that
bug performed a needless restore on a healthy production host. It was caught by
running the script for real, not by reading it.

### Verified after the fix

```
$ harden-host.sh --verify-ssh
sshd socket activation: ACTIVE (systemd owns the listener)
  Listen=<tailscale-ipv4>:22 (Stream)
  Listen=127.0.0.1:22 (Stream)
--- kernel listener state (authoritative) ---
  127.0.0.1:22
  <tailscale-ipv4>:22
  VERDICT: tailnet-only OK (127.0.0.1 + <tailscale-ipv4>)
exit 0
```

---

## B. Port 25 answers `open` upstream — do not re-diagnose this

An external scan reports `25/tcp open`. **Nothing on this host listens on 25,
and no firewall rule on this host can close it.** The connection is answered by
the provider's network before it reaches the host.

Evidence, all collected on the host:

| Check | Result |
|---|---|
| `ss -ltnp \| grep :25` | nothing — no listener in the host netns |
| `docker port` for every running container | no container publishes 25 |
| connect to `127.0.0.1:25` | refused — no local SMTP |
| `iptables -S INPUT` policy | `DROP` |
| `ufw status` | `25/tcp DENY IN Anywhere` (v4 and v6) |
| `tcpdump` during 3 successful external connects | **0 SYNs observed** — the packets never arrive |

That last row is the decisive one. Three connections that a scanner saw succeed,
during which the host recorded not a single SYN. The handshake was completed
somewhere upstream of this host.

**Consequence:** the `ufw deny 25/tcp` rule is correct and harmless defence in
depth, but it is not what is protecting anything, and no amount of host-side
firewall work will change the scan result. Repeated attempts to close 25 with
UFW will appear to fail and will keep failing.

**Action:** raise a ticket with the VPS provider to have port 25 filtered at
their edge, or to explain what is answering on it. Until then, treat 25 as
open-to-the-world and do not rely on it being closed. If SMTP is ever needed,
that is a provider-side change plus an explicit decision, not a host firewall
rule.

---

## C. `ufw-user-input` is reachable — the missing jump is a misdiagnosis

An audit concluded that user-added rules were being written into a chain UFW
never traverses, because `iptables -S INPUT` does not list `ufw-user-input`:

```
$ iptables -S INPUT
-P INPUT DROP
-A INPUT -j ts-input
-A INPUT -j ufw-before-logging-input
-A INPUT -j ufw-before-input
-A INPUT -j ufw-after-input
-A INPUT -j ufw-after-logging-input
-A INPUT -j ufw-reject-input
-A INPUT -j ufw-track-input
```

**That inference is wrong.** `ufw-user-input` is never a direct child of `INPUT`
in any UFW version; stock UFW hangs it off `ufw-before-input`, and it is
traversed on every packet that gets that far.

### The chain is traversed, and the rules in it fire

```
$ iptables -L ufw-before-input -v -n | grep ufw-user-input
 2334K  146M ufw-user-input  all  --  *  *  0.0.0.0/0  0.0.0.0/0

$ iptables -L ufw-user-input -v -n --line-numbers | head -1
Chain ufw-user-input (1 references)
...
7       14   708 DROP  tcp  --  *  *  0.0.0.0/0  0.0.0.0/0  tcp dpt:25
```

2.3M packets reached the chain, and the hand-added `dport 25 DROP` matched 14
times. `iptables -L <chain>` prints `(1 references)` for exactly this reason —
the reference is from `ufw-before-input`.

Corroborating: `/etc/ufw/before.rules` is byte-identical to the UFW-shipped
template (`md5 554ea6948500e76ce5c1610b9c108bbf`), and the shipped template does
not mention `ufw-user-input` at all — the jump is inserted by UFW's own runtime
logic, which is why grepping `INPUT` can never find it.

### Adding the jump by hand would make things worse

The suggested remedy — inserting `-A INPUT -j ufw-user-input` — was **not**
applied, for three reasons:

1. It would give the chain a second reference, traversing every user rule twice
   per packet.
2. It would place the user rules ahead of UFW's loopback, conntrack and
   `INVALID`-drop handling, changing established semantics.
3. It would be silently discarded by the next `ufw reload` or reboot, since it
   lives in neither `before.rules` nor `user.rules` — leaving the operator
   believing a control exists that does not.

### Correct mental model

- To check whether the chain is wired in:
  `sudo iptables -L ufw-user-input -v -n | head -1` → expect `(1 references)`.
- To check whether a specific rule is enforcing:
  `sudo iptables -L ufw-user-input -v -n --line-numbers` → read the packet
  counter.
- To check what is actually reachable from outside, use an external `nmap`.
  Counters only prove a rule is *consulted*, not that a port is closed.

### Two real ordering facts worth knowing

- **`ts-input` is the first jump in `INPUT`, ahead of all UFW chains**, because
  Tailscale inserts it. `ts-input` contains `-i tailscale0 -j ACCEPT`, so
  *all* tailnet traffic is accepted before UFW sees it. The UFW rules scoped to
  `tailscale0` (22/80/443) are therefore redundant — harmless, but not what is
  authorising tailnet SSH. Tailnet ACLs are the control there.
- **Public traffic does fall through to UFW.** `ts-input` only accepts
  `tailscale0`, loopback, `41641/udp`, and RETURNs for `100.115.92.0/23`;
  everything else continues to the UFW chains. So the public `80/443` allows and
  the `25` deny are consulted for internet traffic as expected.

---

## D. Exposure summary (external scan, from outside the tailnet)

```
PORT     STATE    SERVICE
22/tcp   filtered ssh
25/tcp   open     smtp      ← answered upstream, see B
80/tcp   open     http
443/tcp  open     https
2375/tcp filtered docker
5432/tcp filtered postgresql
6379/tcp filtered redis
8000/tcp filtered http-alt
```

`22`, `2375`, `5432`, `6379` and `8000` are filtered. `5432`, `6379` and `8000`
are filtered by UFW's `INPUT` policy `DROP`; note that none of them has a
publishing container, so they are host-bound and correctly governed by `INPUT`.
`80/443` are open because they are published Docker container ports, authorised
in `FORWARD` via `DOCKER-FORWARD` (`172.18.0.4:80`/`:443`, verified with
non-zero counters) rather than in `INPUT`.

`22` is filtered twice over: no public socket exists, and UFW denies it.
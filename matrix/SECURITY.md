# SECURITY — Project Matrix

Security posture and threat model for the single-file HTML tool + its multi-user
collaboration relay. Keep this short; see **ARCHITECTURE.md › Multi-user collaboration**
for the implementation detail behind each control.

---

## What we protect

R&D talent + portfolio data (people, grades, nine-box/DISC placements, project
financials). Sensitive HR content. Single-user data lives only in the browser
(localStorage `eim_v4` + IndexedDB); multi-user data additionally transits a relay.

## Trust model

- **Instructions come from the app UI only.** Everything synced from a peer, imported
  from a backup, or fed to the in-browser LLM is **untrusted data**, never a command.
- **The relay is honest-but-curious.** It stores and forwards the room doc but is not
  trusted with content. See *Metadata* below for what it can still observe.
- **Anyone with the room link is trusted** (current model). There is no per-user
  identity or revoke yet — see the open governance question.

---

## Controls in place (done + tested)

| Threat | Control | Where |
|--------|---------|-------|
| Relay/proxy reads content | **E2E AES-256-GCM** on every synced value (entities, meta, log, awareness); relay sees only ciphertext | `collabEnc`/`collabDec`, `tests/collab-crypto.test.js` |
| Key leaks via URL/logs | Room key rides **only in the link `#fragment`**, never the query string | `collabConnect` |
| Stored XSS via synced/imported fields | `escH()` on all text, `safeColor()` on all user colors, swept across ~560 render sites | `helpers.js`, `tests/helpers.test.js`, ARCHITECTURE › XSS |
| Cross-dataset identity collision | Durable `uid` on every entity; refs uid-anchored | `model.js`, `tests/uid.test.js`, `tests/collab-refs.test.js` |
| Silent data loss on merge | 3-way offline merge; conflicts preserved in append-only change log | `tests/collab-merge.test.js` |
| LLM data exfiltration | In-browser WebLLM/WebGPU; **no backend, no API key, no data leaves the browser** | `ai.js` |

---

## Known gaps / accepted risk

- **No named identity.** The audit-log `actor` is a self-declared panel field — anyone
  in a room can claim any name. Fine for link-based trust; **not** sufficient for named
  access + revoke.
- **Metadata visible to the relay (accepted).** E2E hides content, not structure: the
  relay sees room membership, entity counts, edit timing, and random uids.
- **No per-user revoke.** Access = possession of the link/key. Rotating requires a new
  room.
- **Photos are per-machine** (IndexedDB, not synced) — no exposure via the relay.
- **CSV export** is out of scope for formula-injection hardening (documented, deliberate).

---

## ⚠ Open governance question (blocks direction)

Does data policy accept **confidentiality-via-E2E-link** (no named access/revoke,
metadata visible to relay), OR require **named access + audit + revoke**?

- Named access required ⇒ **Hocuspocus upgrade** is the priority (real accounts,
  server-verified `actor`, per-user revoke; also closes the metadata gap). HIGH effort.
- E2E-link acceptable ⇒ security is essentially feature-complete; the rest is polish.

Resolve this before starting the heavy identity work.

---

## Roadmap (security-relevant)

1. **Answer the governance question above** — highest leverage; formalizes the threat model.
2. **Build-time XSS-regression guard** — the app has no central escaping choke point, so
   add a `build.js` check that flags any `${…}`/`+…+` interpolation of a synced field not
   wrapped in `escH`/`safeColor`. Locks in the manual audit.
3. **Verified identity (Hocuspocus)** — only if named access is required (see above).

## Reporting

This is an internal tool with no public deployment. Report issues to the maintainer
directly rather than filing publicly.

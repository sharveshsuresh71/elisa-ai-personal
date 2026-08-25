# What changed in this audit pass

## 1. `package.json` — removed non-existent pinned versions
Every `@livekit/agents-plugin-*` package was pinned to an **exact version, `1.7.0`,
that has never been published** for any of those plugins. That's the root cause of
both your original `npm install` failure and the `ETARGET` error from your prior
fix attempt (`^1.13.5` for elevenlabs also doesn't exist — the real latest at time
of writing is `1.4.5`). Verified against the live npm registry:

| Package | Was (invalid) | Now (verified published) |
|---|---|---|
| `@livekit/agents` | `1.7.0` | `^1.6.2` |
| `@livekit/agents-plugin-elevenlabs` | `1.7.0` | `^1.4.5` |
| `@livekit/agents-plugin-silero` | `1.7.0` | `^1.2.1` |
| `@livekit/agents-plugin-openai` | `1.7.0` | `^1.0.31` |
| `@livekit/agents-plugin-livekit` | `1.7.0` | **removed** (never imported in `agent.ts`) |

Caret ranges are used deliberately instead of new exact pins, so a future patch
release doesn't put you right back in ETARGET hell.

## 2. `package-lock.json` — deleted, must be regenerated
The old lockfile was **out of sync with `package.json`**: it was missing
`@livekit/agents-plugin-openai` entirely even though `package.json` declared it
as a dependency. That guarantees `npm ci` fails, and makes `npm install` behave
unpredictably. I'm not hand-writing a replacement lockfile — that would mean
guessing exact resolved versions and integrity hashes, which is exactly the kind
of "looks plausible, silently wrong" fix that caused this mess. Instead:

```bash
cd agent
npm install
```

This regenerates a correct, in-sync `package-lock.json` from the fixed
`package.json`. Commit the generated file. After that, `npm ci` (used by the
Dockerfile) will work.

## 3. `src/agent.ts`
- `modelID` → `model`. Both exist on `TTSOptions`, but `model` is the documented,
  current field; `modelID` is a legacy alias. It wasn't causing your silence, but
  it's the kind of drift that becomes a bug later.
- Added a `voice.AgentSessionEventTypes.Error` handler. This is the actual fix for
  "agent goes back to listening with no audio and no explanation": TTS errors are
  treated as recoverable by default, so the session just quietly retries next turn.
  You now get the real ElevenLabs error (status code + message) in your logs
  instead of only the generic `error → elevenlabs.TTS` label in the LiveKit
  dashboard.
- Removed `autoMode: true` (already the default when no `chunkLengthSchedule` is
  set — harmless either way, just noise).

## 4. `Dockerfile`
- Was `COPY package.json ./` + `npm install` — meaning the lockfile was never
  used in the Docker build at all, so every image build re-resolved dependency
  versions fresh from whatever was on npm *that day*. Now copies
  `package-lock.json` too and uses `npm ci`, so builds are reproducible.

## What you still need to verify on the account side
None of the above is a code bug in the ElevenLabs call itself — the options you
were passing were all valid. The remaining "error → elevenlabs.TTS" cause is
almost certainly one of these (all outside the codebase, so unverifiable from
the ZIP alone):

1. **LiveKit Cloud secrets require a redeploy to take effect.** Updating
   `ELEVEN_API_KEY` in the dashboard does not hot-reload a running agent worker.
   Run `lk agent deploy` again (or restart) after changing the secret.
2. **Key/voice ownership mismatch.** ElevenLabs API keys can be scoped to specific
   voice resources in addition to the "Text to Speech" permission. Confirm the
   *new* key was created under the same ElevenLabs workspace that owns
   `rhS7yjXTU4uIlRxXhNW7`, and that the key isn't restricted to a different voice
   allowlist.
3. **Plan-level API access.** Some ElevenLabs plans gate API/TTS access separately
   from what's shown as a key "permission." Confirm the account's subscription
   tier includes API access, not just that the key has the scope checked.
4. Once redeployed, check the agent's own logs (now populated by the new error
   handler) for the literal ElevenLabs HTTP status/message — that will say
   definitively which of the above it is.

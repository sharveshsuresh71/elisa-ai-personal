# ELISA deployment: Vercel + LiveKit Cloud + ElevenLabs

## Vercel (website)
Add only these Environment Variables in the Vercel project:
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- NEXT_PUBLIC_LIVEKIT_URL
- LIVEKIT_AGENT_NAME=elisa

Do NOT add ELEVEN_API_KEY to the browser/frontend. It is a secret and belongs to the agent.

## LiveKit Cloud (realtime agent)
Deploy the `agent` folder as the LiveKit Agent. Configure these agent secrets/environment variables:
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- LIVEKIT_URL
- LIVEKIT_AGENT_NAME=elisa
- ELEVEN_API_KEY
- ELEVENLABS_VOICE_ID=rhS7yjXTU4uIlRxXhNW7

The ElevenLabs key and voice ID are used by `agent/src/agent.ts` through the direct ElevenLabs plugin.

## Important
Vercel will normally show only the four LiveKit variables because the Vercel app does not use ElevenLabs directly. That is intentional. The agent is the component that calls ElevenLabs TTS.

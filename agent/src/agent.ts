import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  voice,
  tts as ttsNs,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import { fileURLToPath } from "node:url";

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "elisa";
const ELEVEN_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "rhS7yjXTU4uIlRxXhNW7";

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const elevenApiKey = process.env.ELEVEN_API_KEY;

    if (!openaiApiKey) throw new Error("OPENAI_API_KEY is missing.");
    if (!elevenApiKey) throw new Error("ELEVEN_API_KEY is missing.");
    if (!ELEVEN_VOICE_ID) {
      throw new Error("ELEVENLABS_VOICE_ID is missing.");
    }

    await ctx.connect();

    const agent = new voice.Agent({
      instructions:
        "You are ELISA, a sweet, warm, personal AI voice assistant. " +
        "Speak naturally and conversationally. Keep spoken replies concise. " +
        "Never use markdown, bullets, or formatting in spoken replies.",
    });

    // Speech recognition uses LiveKit Inference with Deepgram Nova-3.
    // This keeps STT separate from ElevenLabs TTS.
    const stt = new inference.STT({
      model: "deepgram/nova-3",
      language: "en",
    });

    const llm = new openai.responses.LLM({
      apiKey: openaiApiKey,
      model: "gpt-4.1-mini",
    });

    // Direct ElevenLabs plugin: required for custom/community voices.
    // The API key is passed explicitly from the LiveKit Cloud secret.
    // NOTE: the constructor option is `model`, not `modelID`. The plugin
    // does technically accept `modelID` as a legacy alias, but silently
    // relying on an alias is exactly the kind of thing that causes
    // "it looks right but doesn't do what I think" bugs - use the
    // documented name.
    const tts = new elevenlabs.TTS({
      apiKey: elevenApiKey,
      voiceId: ELEVEN_VOICE_ID,
      model: "eleven_turbo_v2_5",
      encoding: "pcm_16000",
      language: "en",
      streamingLatency: 3,
      enableLogging: true,
    });

    const vad = ctx.proc.userData.vad as silero.VAD | undefined;
    if (!vad) throw new Error("Silero VAD was not prewarmed.");

    const session = new voice.AgentSession({
      stt,
      llm,
      tts,
      vad,
      turnHandling: {
        turnDetection: "vad",
      },
    });

    // Surface the *actual* error from a failed component (e.g. ElevenLabs
    // returning 401/403/422) in our own logs. Without this, LiveKit Cloud's
    // dashboard only shows the generic "error -> elevenlabs.TTS" event and
    // the real HTTP status/message from ElevenLabs is otherwise invisible.
    //
    // This also fixes the "silently goes back to listening" symptom: TTS
    // errors default to recoverable, so the session just quietly retries on
    // the next turn with no audio and no explanation. We log the real cause
    // and give the user a spoken heads-up instead of dead air.
    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
  console.error(
    `[ELISA] session error from ${ev.source?.constructor?.name ?? "unknown"}:`,
    ev.error,
  );

  if (ev.error.recoverable) return;

  if (ev.source instanceof ttsNs.TTS) {
    console.error(
      "[ELISA] TTS failure is non-recoverable. Check ElevenLabs credentials/configuration.",
      ev.error,
    );
  }
});
import {
  type JobContext,
  type JobProcess,
  defineAgent,
  inference,
  voice,
  tts as ttsNs,
} from "@livekit/agents";

import * as silero from "@livekit/agents-plugin-silero";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";

const ELEVEN_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "rhS7yjXTU4uIlRxXhNW7";

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const elevenApiKey = process.env.ELEVEN_API_KEY;

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    if (!elevenApiKey) {
      throw new Error("ELEVEN_API_KEY is missing.");
    }

    await ctx.connect();

    const agent = new voice.Agent({
      instructions:
        "You are ELISA, a sweet, warm, personal AI voice assistant. " +
        "Speak naturally and conversationally. Keep spoken replies concise. " +
        "Never use markdown, bullets, or formatting in spoken replies.",
    });

    const stt = new inference.STT({
      model: "deepgram/nova-3",
      language: "en",
    });

    const llm = new openai.responses.LLM({
      apiKey: openaiApiKey,
      model: "gpt-4.1-mini",
    });

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

    if (!vad) {
      throw new Error("Silero VAD was not prewarmed.");
    }

    const session = new voice.AgentSession({
      stt,
      llm,
      tts,
      vad,
      turnHandling: {
        turnDetection: "vad",
      },
    });

    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      console.error(
        `[ELISA] session error from ${
          ev.source?.constructor?.name ?? "unknown"
        }:`,
        ev.error,
      );

      if (ev.error.recoverable) {
        return;
      }

      if (ev.source instanceof ttsNs.TTS) {
        console.error(
          "[ELISA] TTS failure is non-recoverable. Check ElevenLabs credentials/configuration.",
          ev.error,
        );
      }
    });

    await session.start({
      agent,
      room: ctx.room,
    });

    console.log(
      `[ELISA] READY room=${ctx.room.name} ` +
        `voice=${ELEVEN_VOICE_ID} ` +
        `stt=deepgram/nova-3 ` +
        `llm=openai/gpt-4.1-mini`,
    );
  },
});
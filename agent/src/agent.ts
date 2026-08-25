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
import { fileURLToPath } from "node:url";

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "elisa";

// ElevenLabs female voice
const ELEVEN_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "hpp4J3VqNfWAUOO0d1Us";

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

    // STT: Deepgram Nova-3 through LiveKit Inference
    const stt = new inference.STT({
      model: "deepgram/nova-3",
      language: "en",
    });

    // LLM: OpenAI GPT-4.1-mini through LiveKit Inference
    const llm = new inference.LLM({
      model: "openai/gpt-4.1-mini",
    });

    // TTS: ElevenLabs
    const tts = new elevenlabs.TTS({
      apiKey: elevenApiKey,
      voiceId: ELEVEN_VOICE_ID,
      model: "eleven_turbo_v2_5",
      language: "en",
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
          ev.source?.constructor?.name ?? "Unknown"
        }:`,
        ev.error,
      );

      if (ev.error.recoverable) {
        console.warn("[ELISA] Recoverable session error.");
        return;
      }

      if (ev.source instanceof ttsNs.TTS) {
        console.error("[ELISA] TTS component error:", ev.error);
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
        `llm=openai/gpt-4.1-mini ` +
        `tts=elevenlabs/eleven_turbo_v2_5`,
    );
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
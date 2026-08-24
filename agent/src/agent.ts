import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  inference,
  voice,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import * as openai from "@livekit/agents-plugin-openai";
import { fileURLToPath } from "node:url";

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "elisa";
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "rhS7yjXTU4uIlRxXhNW7";

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const elevenApiKey = process.env.ELEVEN_API_KEY;

    if (!openaiApiKey) throw new Error("OPENAI_API_KEY is missing.");
    if (!elevenApiKey) throw new Error("ELEVEN_API_KEY is missing.");
    if (!ELEVEN_VOICE_ID) throw new Error("ELEVENLABS_VOICE_ID is missing.");

    await ctx.connect();

    const agent = new voice.Agent({
      instructions:
        "You are ELISA, a sweet, warm, personal AI voice assistant. " +
        "Speak naturally, warmly and conversationally. Keep spoken replies concise. " +
        "Never use markdown, bullets, or formatting in spoken replies.",
    });

    // Use LiveKit Inference for STT. This avoids the old Node ElevenLabs STT
    // path while keeping ElevenLabs exclusively for Elisa's custom voice.
    const stt = new inference.STT({
      model: "deepgram/nova-3",
      language: "en",
    });

    const llm = new openai.responses.LLM({
      apiKey: openaiApiKey,
      model: "gpt-4.1-mini",
    });

    // Custom/community ElevenLabs voices require the ElevenLabs plugin,
    // not LiveKit Inference. The plugin reads ELEVEN_API_KEY from the
    // environment; keeping the key out of source avoids deployment mistakes.
    const tts = new elevenlabs.TTS({
      voiceId: ELEVEN_VOICE_ID,
      model: "eleven_flash_v2_5",
      language: "en",
      autoMode: true,
      enableLogging: true,
      voiceSettings: {
        stability: 0.38,
        similarity_boost: 0.82,
        style: 0.28,
        use_speaker_boost: true,
        speed: 0.98,
      },
    });

    // Fail fast with a useful deployment error if the voice isn't visible
    // to the supplied ElevenLabs account. This is much easier to diagnose
    // than a generic "elevenlabs.TTS" event.
    const voices = await tts.listVoices();
    const selected = voices.find((v) => v.id === ELEVEN_VOICE_ID);
    if (!selected) {
      throw new Error(
        `ElevenLabs voice ${ELEVEN_VOICE_ID} is not available to the configured ELEVEN_API_KEY. ` +
          "Check that the API key belongs to the ElevenLabs account containing this voice."
      );
    }

    const session = new voice.AgentSession({
      stt,
      llm,
      tts,
      vad: procVad(ctx),
      turnDetection: "vad",
    });

    await session.start({ agent, room: ctx.room });

    console.log(
      `[ELISA] READY room=${ctx.room.name} voice=${ELEVEN_VOICE_ID} ` +
        `stt=deepgram/nova-3 llm=openai/gpt-4.1-mini tts=elevenlabs/eleven_flash_v2_5`
    );

    const greeting = await session.generateReply({
      instructions: "Greet the user warmly in one short sentence. Say you are Elisa and ready to talk.",
    });
    await greeting.waitForPlayout();
  },
});

function procVad(ctx: JobContext): silero.VAD {
  const vad = ctx.proc.userData.vad as silero.VAD | undefined;
  if (!vad) throw new Error("Silero VAD was not prewarmed.");
  return vad;
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);

import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  voice,
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
    const elevenApiKey = process.env.ELEVEN_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!elevenApiKey) throw new Error("ELEVEN_API_KEY is missing.");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY is missing.");

    // Do NOT import/use @livekit/agents inference here. The old agent used
    // inference.STT/inference.LLM and the deployed worker log showed the
    // fatal lk_eot_audio inference-runner startup error.
    await ctx.connect();

    const agent = new voice.Agent({
      instructions: [
        "You are ELISA, a sweet, warm, personal AI voice assistant.",
        "Speak naturally and conversationally with short, clear sentences.",
        "You are speaking out loud, so never use markdown, bullet points, or long written-style answers.",
        "Be friendly, gentle, responsive, and concise.",
      ].join(" "),
    });

    const session = new voice.AgentSession({
      // Elisa's ears: ElevenLabs Scribe v2 Realtime.
      stt: new elevenlabs.STT({
        apiKey: elevenApiKey,
        model: "scribe_v2_realtime",
      }),

      // Elisa's brain: direct OpenAI plugin, not LiveKit Inference.
      llm: new openai.responses.LLM({
        apiKey: openaiApiKey,
        model: "gpt-4.1-mini",
      }),

      // Elisa's voice: your ElevenLabs voice.
      tts: new elevenlabs.TTS({
        apiKey: elevenApiKey,
        voiceId: ELEVEN_VOICE_ID,
        model: "eleven_flash_v2_5",
        language: "en",
        autoMode: true,
        voiceSettings: {
          stability: 0.38,
          similarity_boost: 0.82,
          style: 0.28,
          use_speaker_boost: true,
          speed: 0.98,
        },
      }),

      vad: ctx.proc.userData.vad as silero.VAD,
      turnDetection: "vad",
    });

    await session.start({ agent, room: ctx.room });

    console.log(
      `[ELISA] READY room=${ctx.room.name} voice=${ELEVEN_VOICE_ID} stt=elevenlabs/scribe_v2_realtime llm=openai/gpt-4.1-mini tts=elevenlabs/eleven_flash_v2_5`,
    );

    const greeting = await session.generateReply({
      instructions:
        "Greet the user warmly in one short sentence. Say you are Elisa and ready to talk.",
    });
    await greeting.waitForPlayout();
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);

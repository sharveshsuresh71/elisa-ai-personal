import {
  type JobContext,
  type JobProcess,
  ServerOptions,
  cli,
  defineAgent,
  voice,
  inference,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import * as elevenlabs from "@livekit/agents-plugin-elevenlabs";
import { fileURLToPath } from "node:url";

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || "elisa";
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "rhS7yjXTU4uIlRxXhNW7";

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    if (!process.env.ELEVEN_API_KEY) {
      throw new Error("ELEVEN_API_KEY is missing. Add your ElevenLabs API key to agent/.env / Railway variables.");
    }

    await ctx.connect();

    const agent = new voice.Agent({
      instructions: [
        "You are ELISA, a sweet, warm, personal AI voice assistant.",
        "Speak naturally and conversationally with short, clear sentences.",
        "You are speaking out loud, so never use markdown, bullet points, or long written-style answers.",
        "Be friendly, gentle, and responsive.",
      ].join(" "),
    });

    const session = new voice.AgentSession({
      stt: new inference.STT({ model: "deepgram/nova-3", language: "en" }),
      llm: new inference.LLM({ model: "openai/gpt-4.1-mini" }),
      // Direct ElevenLabs plugin so your custom/community voice ID works.
      tts: new elevenlabs.TTS({
        apiKey: process.env.ELEVEN_API_KEY,
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


    await session.start({
      agent,
      room: ctx.room,
    });

    console.log(`[ELISA] connected to room ${ctx.room.name}; TTS voice ${ELEVEN_VOICE_ID}`);

    // Force a spoken greeting so the user can immediately confirm audio output.
    await session.generateReply({
      instructions: "Greet the user warmly in one short sentence. Say you are listening and ready to help.",
    });
  },
});

cli.runApp(new ServerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: AGENT_NAME,
}));

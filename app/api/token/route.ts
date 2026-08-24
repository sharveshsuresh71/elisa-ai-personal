import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";

export async function GET() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const agentName = process.env.LIVEKIT_AGENT_NAME || "elisa";

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json(
      { error: "Missing LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or NEXT_PUBLIC_LIVEKIT_URL" },
      { status: 500 },
    );
  }

  const identity = `user-${Math.random().toString(36).slice(2, 10)}`;
  const room = `elisa-${Math.random().toString(36).slice(2, 10)}`;

  // Explicitly dispatch ELISA when this new room is created.
  // This is required when the agent is registered with a named agentName.
  const at = new AccessToken(apiKey, apiSecret, { identity });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    roomCreate: true,
  });
  at.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName,
      }),
    ],
  });

  return NextResponse.json({
    token: await at.toJwt(),
    url,
    room,
    identity,
    agentName,
  });
}

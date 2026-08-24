"use client";

import { useCallback, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";

export type VoiceState = "idle" | "connecting" | "connected" | "error";

interface UseVoiceAgentOpts {
  /** Called every animation frame with a 0..1 level while ELISA is speaking (0 when silent). */
  onVoiceLevel?: (level: number) => void;
}

export function useVoiceAgent(opts: UseVoiceAgentOpts = {}) {
  const roomRef = useRef<Room | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);

  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elisaSpeaking, setElisaSpeaking] = useState(false);

  const stopLevelMeter = useCallback(() => {
    if (analyserRafRef.current !== null) {
      cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    opts.onVoiceLevel?.(0);
  }, [opts]);

  const attachLevelMeter = useCallback(
    (track: RemoteAudioTrack) => {
      const mediaStream = new MediaStream([track.mediaStreamTrack]);
      const audioCtx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        opts.onVoiceLevel?.(avg / 255);
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [opts],
  );

  const disconnect = useCallback(() => {
    stopLevelMeter();
    roomRef.current?.disconnect();
    roomRef.current = null;
    setState("idle");
    setElisaSpeaking(false);
  }, [stopLevelMeter]);

  const connect = useCallback(async () => {
    if (roomRef.current) return;
    setState("connecting");
    setError(null);

    try {
      const res = await fetch("/api/token");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch token");

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Must be called from the button gesture so Chrome/Safari allow remote
      // LiveKit audio to play immediately when ELISA publishes her first reply.
      void room.startAudio().catch((err) => {
        console.warn("[ELISA] audio unlock failed; browser may require a second click", err);
      });

      room.on(
        RoomEvent.TrackSubscribed,
        (track, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          // ELISA (the agent) is the only other participant publishing audio.
          if (track.kind === Track.Kind.Audio && !participant.isLocal) {
            const el = track.attach();
            el.autoplay = true;
            el.setAttribute("playsinline", "true");
            el.volume = 1;
            el.setAttribute("aria-hidden", "true");
            document.body.appendChild(el);
            void el.play().catch((err) => {
              console.warn("[ELISA] remote audio play was blocked", err);
              void room.startAudio().catch(() => undefined);
            });
            attachLevelMeter(track as RemoteAudioTrack);
          }
        },
      );

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind === Track.Kind.Audio) stopLevelMeter();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setElisaSpeaking(speakers.some((p) => !p.isLocal));
      });

      room.on(RoomEvent.Disconnected, () => {
        stopLevelMeter();
        roomRef.current = null;
        setState("idle");
        setElisaSpeaking(false);
      });

      await room.connect(data.url, data.token);

      console.log("[ELISA] LiveKit connected", { room: data.room, agent: data.agentName });

      const micTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await room.localParticipant.publishTrack(micTrack);

      setState("connected");
    } catch (err) {
      console.error(err);
      roomRef.current?.disconnect();
      roomRef.current = null;
      setState("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "MIC ACCESS DENIED"
          : "CONNECTION FAILED",
      );
    }
  }, [attachLevelMeter, stopLevelMeter]);

  return { state, error, elisaSpeaking, connect, disconnect };
}

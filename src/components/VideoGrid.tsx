import { useMemo } from "react";
import VideoTile from "./VideoTile";
import type { Participant } from "../types";

interface VideoGridProps {
  localParticipant: Participant;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  speakingPeerId?: string | null;
  focusPeerId?: string | null;
}

export default function VideoGrid({
  localParticipant,
  localStream,
  remoteStreams,
  participants,
  speakingPeerId,
  focusPeerId,
}: VideoGridProps) {
  const allParticipants = useMemo(() => {
    const list = [localParticipant, ...participants.filter((p) => p.peerId !== localParticipant.peerId)];
    return list;
  }, [localParticipant, participants]);

  const count = allParticipants.length;

  // When a focus peer is set, find and render only that participant full-size
  const focusParticipant = useMemo(() => {
    if (!focusPeerId) return null;
    return allParticipants.find((p) => p.peerId === focusPeerId) || null;
  }, [focusPeerId, allParticipants]);

  // Determine grid columns based on participant count (up to 100)
  const gridClass = useMemo(() => {
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    if (count <= 6) return "grid-cols-2 md:grid-cols-3";
    if (count <= 9) return "grid-cols-3";
    if (count <= 16) return "grid-cols-4";
    return "grid-cols-5 md:grid-cols-6";
  }, [count]);

  if (count === 0 && !focusParticipant) {
    return (
      <div className="flex-1 flex items-center justify-center text-dark-400">
        Waiting for participants...
      </div>
    );
  }

  // Focus mode: single participant full-size
  if (focusParticipant) {
    return (
      <div className="flex-1 p-4">
        <VideoTile
          key={focusParticipant.peerId}
          participant={focusParticipant}
          stream={
            focusParticipant.peerId === localParticipant.peerId
              ? localStream
              : remoteStreams.get(focusParticipant.peerId) || null
          }
          isLocal={focusParticipant.peerId === localParticipant.peerId}
          isSpeaking={focusParticipant.peerId === speakingPeerId}
        />
      </div>
    );
  }

  return (
    <div className={`flex-1 grid ${gridClass} gap-3 p-4 auto-rows-fr`}>
      {allParticipants.map((p) => (
        <VideoTile
          key={p.peerId}
          participant={p}
          stream={
            p.peerId === localParticipant.peerId
              ? localStream
              : remoteStreams.get(p.peerId) || null
          }
          isLocal={p.peerId === localParticipant.peerId}
          isSpeaking={p.peerId === speakingPeerId}
        />
      ))}
    </div>
  );
}

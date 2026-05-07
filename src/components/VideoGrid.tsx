import { useMemo } from "react";
import VideoTile from "./VideoTile";
import MomoAvatar from "./MomoAvatar";
import type { Participant } from "../types";

interface VideoGridProps {
  localParticipant: Participant;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  speakingPeerId?: string | null;
  videoPriorityPeerIds?: string[];
  screenSharing?: boolean;
  isHost?: boolean;
  onForceVideo?: (peerId: string) => void;
  onHostToggleMomo?: (peerId: string, isMomo: boolean) => void;
}

export default function VideoGrid({
  localParticipant,
  localStream,
  remoteStreams,
  participants,
  speakingPeerId,
  videoPriorityPeerIds,
  screenSharing,
  isHost,
  onForceVideo,
  onHostToggleMomo,
}: VideoGridProps) {
  const prioritySet = useMemo(
    () => (videoPriorityPeerIds ? new Set(videoPriorityPeerIds) : null),
    [videoPriorityPeerIds]
  );

  const allParticipants = useMemo(() => {
    const list = [localParticipant, ...participants.filter((p) => p.peerId !== localParticipant.peerId)];
    return list;
  }, [localParticipant, participants]);

  const { videoParticipants, avatarParticipants } = useMemo(() => {
    if (!prioritySet) {
      return { videoParticipants: allParticipants, avatarParticipants: [] };
    }
    const video: Participant[] = [];
    const avatar: Participant[] = [];
    for (const p of allParticipants) {
      if (prioritySet.has(p.peerId)) {
        video.push(p);
      } else {
        avatar.push(p);
      }
    }
    return { videoParticipants: video, avatarParticipants: avatar };
  }, [allParticipants, prioritySet]);

  const count = videoParticipants.length;

  const gridClass = useMemo(() => {
    if (count <= 1) return "grid-cols-1";
    if (count <= 2) return "grid-cols-1 md:grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    return "grid-cols-2";
  }, [count]);

  // Smaller padding/gap on mobile for more video area

  // Screen sharing mode: show only compact avatar list
  if (screenSharing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
        {allParticipants.map((p) => (
          <div
            key={p.peerId}
            className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-lg bg-dark-800/80"
          >
            {p.isMomo ? (
              <MomoAvatar size={24} />
            ) : (
              <div className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-dark-300">
                  {p.realName?.charAt(0).toUpperCase() || "?"}
                </span>
              </div>
            )}
            <span className="text-xs text-dark-300 truncate max-w-[60px]">
              {p.isMomo ? "momo" : p.realName}
              {p.peerId === localParticipant.peerId && <span className="text-dark-500"> (你)</span>}
            </span>
            {p.handRaised && <span className="text-yellow-400 text-xs">✋</span>}
          </div>
        ))}
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dark-400">
        等待参与者加入...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Video tiles */}
      {count > 0 && (
        <div className={`grid ${gridClass} gap-2 md:gap-3 p-2 md:p-4 auto-rows-fr h-full min-h-0`}>
          {videoParticipants.map((p) => (
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
      )}

      {/* Avatar-only participants */}
      {avatarParticipants.length > 0 && (
        <div className="overflow-y-auto border-t border-dark-700 px-2 py-1">
          {avatarParticipants.map((p) => (
            <div
              key={p.peerId}
              className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-dark-800 transition-colors"
            >
              {p.isMomo ? (
                <MomoAvatar size={28} />
              ) : (
                <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-dark-300">
                    {p.realName?.charAt(0).toUpperCase() || "?"}
                  </span>
                </div>
              )}

              <span className="text-xs text-dark-300 truncate min-w-0 flex-1">
                {p.isMomo ? "momo" : p.realName}
                {p.peerId === localParticipant.peerId && (
                  <span className="text-dark-500"> (你)</span>
                )}
                {p.isHost && (
                  <span className="text-yellow-500 ml-1 text-[10px]">👑</span>
                )}
              </span>

              <div className="flex items-center gap-1 flex-shrink-0">
                {p.handRaised && <span className="text-yellow-400 text-xs">✋</span>}
                {!p.muted ? (
                  <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}

                {/* Host-only action buttons */}
                {isHost && p.peerId !== localParticipant.peerId && (
                  <>
                    <button
                      onClick={() => onForceVideo?.(p.peerId)}
                      className="text-blue-400 hover:text-blue-300 transition-colors p-0.5"
                      title="强制开启摄像头"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onHostToggleMomo?.(p.peerId, !p.isMomo)}
                      className={`text-xs font-bold transition-colors p-0.5 w-4 h-4 flex items-center justify-center rounded ${
                        p.isMomo
                          ? "text-purple-400 hover:text-purple-300"
                          : "text-dark-500 hover:text-white"
                      }`}
                      title="切换匿名模式"
                    >
                      M
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import type { Participant } from "../types";
import MomoAvatar from "./MomoAvatar";

interface ParticipantListProps {
  participants: Participant[];
  currentPeerId: string;
  onClose: () => void;
}

export default function ParticipantList({
  participants,
  currentPeerId,
  onClose,
}: ParticipantListProps) {
  return (
    <div className="w-72 bg-dark-800 border-l border-dark-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700">
        <h3 className="text-white font-semibold">
          Participants ({participants.length})
        </h3>
        <button
          onClick={onClose}
          className="text-dark-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {participants.map((p) => {
          const isLocal = p.peerId === currentPeerId;
          return (
            <div
              key={p.peerId}
              className="flex items-center gap-3 p-2 rounded-lg bg-dark-700/50"
            >
              {/* Avatar */}
              {p.isMomo ? (
                <MomoAvatar size={36} />
              ) : (
                <div className="w-9 h-9 rounded-full bg-dark-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-dark-300">
                    {p.realName?.charAt(0).toUpperCase() || "?"}
                  </span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {p.isMomo ? "momo" : p.realName}
                  {isLocal && " (你)"}
                </p>
                <div className="flex items-center gap-2 text-xs text-dark-400">
                  {p.handRaised && <span>✋ Hand raised</span>}
                  {p.muted && <span>🔇 Muted</span>}
                </div>
              </div>

              {/* Momo badge */}
              {p.isMomo && (
                <span className="text-[10px] bg-purple-600/60 text-purple-200 px-1.5 py-0.5 rounded">
                  Momo
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

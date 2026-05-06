import { useRef, useEffect } from "react";
import type { Participant } from "../types";
import MomoAvatar from "./MomoAvatar";

interface VideoTileProps {
  participant: Participant;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isSpeaking?: boolean;
}

export default function VideoTile({
  participant,
  stream,
  isLocal = false,
  isSpeaking = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  // Lower remote audio volume to reduce echo feedback
  useEffect(() => {
    if (videoRef.current && !isLocal) {
      videoRef.current.volume = 0.6;
    }
  }, [stream, isLocal]);

  const hasVideo =
    stream?.getVideoTracks()?.some((t) => t.enabled) && !participant.cameraOff;

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-dark-800 border-2 transition-all ${
        isSpeaking ? "border-green-500 shadow-lg shadow-green-500/20" : "border-dark-700"
      }`}
    >
      {hasVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-dark-800">
          {participant.isMomo ? (
            <MomoAvatar size={80} />
          ) : (
            <div className="w-20 h-20 rounded-full bg-dark-600 flex items-center justify-center">
              <span className="text-3xl text-dark-300 font-bold">
                {participant.realName?.charAt(0).toUpperCase() || "?"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
        <div className="flex items-center gap-2">
          {participant.isMomo ? (
            <MomoAvatar size={24} />
          ) : (
            <div className="w-6 h-6 rounded-full bg-dark-500 flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {participant.realName?.charAt(0).toUpperCase() || "?"}
              </span>
            </div>
          )}

          <span className="text-white text-sm font-medium drop-shadow-lg">
            {participant.isMomo ? "momo" : participant.realName}
            {isLocal && " (你)"}
          </span>

          {/* Audio muted indicator */}
          {participant.muted && (
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )}

          {participant.handRaised && (
            <span className="ml-auto text-yellow-400">✋</span>
          )}
        </div>
      </div>

      {/* Momo badge */}
      {participant.isMomo && (
        <div className="absolute top-2 right-2 bg-purple-600/80 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] font-medium text-white">
          Momo
        </div>
      )}
    </div>
  );
}

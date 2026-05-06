import { useRef, useEffect } from "react";
import type { Participant, BgEffect } from "../types";
import MomoAvatar from "./MomoAvatar";
import { useBackgroundRemoval } from "../hooks/useBackgroundRemoval";

interface VideoTileProps {
  participant: Participant;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isSpeaking?: boolean;
  bgEffect?: BgEffect;
  bgImage?: HTMLImageElement | null;
}

export default function VideoTile({
  participant,
  stream,
  isLocal = false,
  isSpeaking = false,
  bgEffect = "off",
  bgImage,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ensureModel, start, stop, updateConfig, ready } = useBackgroundRemoval();
  const startedRef = useRef(false);
  const bgActive = bgEffect !== "off";

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  // Load model when a bg effect is first enabled (lazy init)
  useEffect(() => {
    if (bgActive && !ready) {
      ensureModel();
    }
  }, [bgActive, ready, ensureModel]);

  // Update the rendering mode whenever bgEffect or bgImage changes
  useEffect(() => {
    if (bgActive && ready) {
      if (bgEffect === "image" && bgImage) {
        updateConfig("image", bgImage);
      } else {
        updateConfig(bgEffect);
      }
    }
  }, [bgEffect, bgActive, ready, updateConfig, bgImage]);

  // Start/stop the processing loop
  useEffect(() => {
    if (bgActive && ready && videoRef.current && canvasRef.current && !startedRef.current) {
      startedRef.current = true;
      start(videoRef.current, canvasRef.current);
    }
    if (!bgActive) {
      startedRef.current = false;
      stop();
    }
    return () => {
      startedRef.current = false;
      stop();
    };
  }, [bgActive, ready, start, stop]);

  const hasVideo =
    stream?.getVideoTracks()?.some((t) => t.enabled) && !participant.cameraOff;

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-dark-800 border-2 transition-all ${
        isSpeaking ? "border-green-500 shadow-lg shadow-green-500/20" : "border-dark-700"
      }`}
    >
      {/* Hidden video element (still plays to feed the processing pipeline) */}
      {hasVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${
            bgActive ? "absolute inset-0 opacity-0 pointer-events-none" : ""
          }`}
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

      {/* Background effect canvas overlay */}
      {bgActive && hasVideo && (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
        />
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

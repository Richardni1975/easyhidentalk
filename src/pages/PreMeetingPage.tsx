import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MomoAvatar from "../components/MomoAvatar";

export default function PreMeetingPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [momoEnabled, setMomoEnabled] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const initMedia = useCallback(async () => {
    try {
      setMediaError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setMediaReady(true);
    } catch (err: any) {
      const msg =
        err.name === "NotFoundError"
          ? "No camera or microphone found"
          : err.name === "NotAllowedError"
          ? "Camera/mic access denied. Please allow permissions."
          : `Media error: ${err.message}`;
      setMediaError(msg);
      // Still allow joining without media
      setMediaReady(true);
    }
  }, []);

  useEffect(() => {
    initMedia();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [initMedia]);

  // Toggle audio/video in preview
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = audioEnabled));
  }, [audioEnabled]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoEnabled));
  }, [videoEnabled]);

  const handleJoin = () => {
    const finalName = name.trim() || "Guest";
    navigate(`/meeting/${roomId}`, {
      state: {
        userName: finalName,
        isMomo: momoEnabled,
        audioEnabled,
        videoEnabled,
      },
    });
  };

  return (
    <div className="h-screen w-screen bg-dark-950 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-800">
        <h1 className="text-xl font-semibold text-white">
          会议室名称：<span className="text-blue-400 font-mono">{roomId}</span>
        </h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 gap-6">
        {/* Left Panel - Controls */}
        <div className="w-full max-w-md bg-dark-800 rounded-2xl p-8 border border-dark-700 space-y-6">
          <h2 className="text-2xl font-bold text-white">准备加入？</h2>

          {/* Name Input */}
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入您的姓名"
              maxLength={30}
              className="w-full bg-dark-700 rounded-lg px-4 py-3 text-white placeholder-dark-500 border border-dark-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Media Toggles */}
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 rounded-lg bg-dark-700 border border-dark-600 cursor-pointer hover:bg-dark-650 transition-colors">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-dark-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {audioEnabled ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  )}
                </svg>
                <span className="text-white">麦克风</span>
              </div>
              <div
                className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${
                  audioEnabled ? "bg-green-500" : "bg-dark-500"
                }`}
                onClick={() => setAudioEnabled(!audioEnabled)}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    audioEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg bg-dark-700 border border-dark-600 cursor-pointer hover:bg-dark-650 transition-colors">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-dark-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {videoEnabled ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  )}
                </svg>
                <span className="text-white">摄像头</span>
              </div>
              <div
                className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${
                  videoEnabled ? "bg-green-500" : "bg-dark-500"
                }`}
                onClick={() => setVideoEnabled(!videoEnabled)}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    videoEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </div>
            </label>
          </div>

          {/* Momo Mode Toggle */}
          <div className="p-4 rounded-lg bg-dark-700/50 border border-purple-500/20">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <MomoAvatar size={40} />
                <div>
                  <p className="text-white font-medium">我要匿名参会</p>
                  <p className="text-dark-400 text-xs">
                    匿名身份
                  </p>
                </div>
              </div>
              <div
                className={`w-12 h-7 rounded-full p-1 cursor-pointer transition-colors ${
                  momoEnabled ? "bg-purple-600" : "bg-dark-500"
                }`}
                onClick={() => setMomoEnabled(!momoEnabled)}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    momoEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </label>
          </div>

          {/* Error message */}
          {mediaError && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-400 text-sm">
              {mediaError}
            </div>
          )}

          {/* Join Button */}
          <button
            onClick={handleJoin}
            disabled={!mediaReady}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            加入会议
          </button>
        </div>

        {/* Right Panel - Video Preview */}
        <div className="w-full max-w-lg aspect-video bg-dark-800 rounded-2xl border border-dark-700 overflow-hidden flex items-center justify-center">
          {mediaError || !videoEnabled ? (
            <div className="text-center">
              {momoEnabled ? (
                <MomoAvatar size={120} />
              ) : (
                <div className="w-24 h-24 rounded-full bg-dark-600 flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl text-dark-400 font-bold">
                    {name.charAt(0).toUpperCase() || "?"}
                  </span>
                </div>
              )}
              <p className="text-dark-400 text-sm mt-2">
                {videoEnabled ? "摄像头不可用" : "摄像头已关闭"}
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          )}

          {/* Momo badge overlay */}
          {momoEnabled && (
            <div className="absolute top-3 right-3 bg-purple-600/80 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium text-white flex items-center gap-1">
              <MomoAvatar size={16} />
              Momo 模式
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

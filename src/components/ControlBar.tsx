interface ControlBarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  handRaised: boolean;
  isScreenSharing: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleHandRaise: () => void;
  onToggleScreenShare: () => void;
  onHangUp: () => void;
}

export default function ControlBar({
  isMuted,
  isCameraOff,
  handRaised,
  isScreenSharing,
  onToggleMute,
  onToggleCamera,
  onToggleHandRaise,
  onToggleScreenShare,
  onHangUp,
}: ControlBarProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-800/90 backdrop-blur-md rounded-2xl border border-dark-700 shadow-2xl">
      {/* Mute */}
      <button
        onClick={onToggleMute}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
          isMuted ? "bg-red-600 hover:bg-red-500 text-white" : "bg-dark-700 hover:bg-dark-600 text-dark-300"
        }`}
        title={isMuted ? "取消静音" : "静音"}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {isMuted ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          )}
        </svg>
      </button>

      {/* Camera */}
      <button
        onClick={onToggleCamera}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
          isCameraOff ? "bg-red-600 hover:bg-red-500 text-white" : "bg-dark-700 hover:bg-dark-600 text-dark-300"
        }`}
        title={isCameraOff ? "开启摄像头" : "关闭摄像头"}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          {isCameraOff ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          )}
        </svg>
      </button>

      {/* Screen share */}
      <button
        onClick={onToggleScreenShare}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
          isScreenSharing ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-dark-700 hover:bg-dark-600 text-dark-300"
        }`}
        title={isScreenSharing ? "停止共享" : "共享屏幕"}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Hand raise */}
      <button
        onClick={onToggleHandRaise}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${
          handRaised ? "bg-yellow-600 hover:bg-yellow-500 text-white" : "bg-dark-700 hover:bg-dark-600 text-dark-300"
        }`}
        title={handRaised ? "放下手" : "举手"}
      >
        <span className="text-lg">{handRaised ? "✋" : "🤚"}</span>
      </button>

      {/* Separator */}
      <div className="w-px h-8 bg-dark-600 mx-1" />

      {/* Hang up */}
      <button
        onClick={onHangUp}
        className="w-11 h-11 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white transition-all duration-200"
        title="离开会议"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
        </svg>
      </button>
    </div>
  );
}

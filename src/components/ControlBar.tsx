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
  /** Whether to render buttons vertically (desktop center column) */
  vertical?: boolean;
  /** Only users in the 4 video slots can share screen */
  canScreenShare?: boolean;
  /** Include system audio in screen share */
  includeSystemAudio?: boolean;
  /** Toggle system audio capture */
  onToggleSystemAudio?: () => void;
}

type ButtonStyle = "default" | "danger" | "active" | "warning";

function btnClass(style: ButtonStyle, forceHover?: boolean): string {
  const base =
    "w-11 h-11 rounded-xl flex items-center justify-center " +
    "transition-all duration-150 ease-out " +
    "border shadow-lg shadow-black/30 " +
    "active:translate-y-0.5 active:border-b-[1px] active:shadow-md " +
    (forceHover ? "" : "hover:-translate-y-0.5 hover:shadow-xl");

  switch (style) {
    case "danger":
      return (
        base +
        " bg-gradient-to-b from-red-600 to-red-700 border-red-500/30 border-b-red-900 hover:from-red-500 hover:to-red-600 text-white"
      );
    case "active":
      return (
        base +
        " bg-gradient-to-b from-blue-600 to-blue-700 border-blue-500/30 border-b-blue-900 hover:from-blue-500 hover:to-blue-600 text-white"
      );
    case "warning":
      return (
        base +
        " bg-gradient-to-b from-yellow-600 to-yellow-700 border-yellow-500/30 border-b-yellow-900 hover:from-yellow-500 hover:to-yellow-600 text-white"
      );
    default:
      return (
        base +
        " bg-gradient-to-b from-dark-500 to-dark-700 border-dark-500/30 border-b-dark-800 hover:from-dark-400 hover:to-dark-600 text-dark-200"
      );
  }
}

const iconMicOn = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
);

const iconMicOff = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const iconCameraOn = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const iconCameraOff = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const iconScreen =(
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const iconSpeaker = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const iconHangUp = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

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
  vertical,
  canScreenShare = true,
  includeSystemAudio,
  onToggleSystemAudio,
}: ControlBarProps) {
  const wrapper = vertical
    ? "flex flex-col items-center gap-5 py-4 px-1"
    : "flex items-center justify-center gap-2 px-4 py-3 bg-dark-800/90 backdrop-blur-md rounded-2xl border border-dark-700 shadow-2xl";

  const separator = vertical ? "w-8 h-px bg-dark-600" : "w-px h-8 bg-dark-600";

  return (
    <div className={wrapper}>
      {/* Mute */}
      <button
        onClick={onToggleMute}
        className={btnClass(isMuted ? "danger" : "default")}
        title={isMuted ? "取消静音" : "静音"}
      >
        {isMuted ? iconMicOff : iconMicOn}
      </button>

      {/* Camera */}
      <button
        onClick={onToggleCamera}
        className={btnClass(isCameraOff ? "danger" : "default")}
        title={isCameraOff ? "开启摄像头" : "关闭摄像头"}
      >
        {isCameraOff ? iconCameraOff : iconCameraOn}
      </button>

      {/* Screen share — only available to users in the 4 video slots */}
      {canScreenShare && (
        <button
          onClick={onToggleScreenShare}
          className={btnClass(isScreenSharing ? "active" : "default")}
          title={isScreenSharing ? "停止共享" : "共享屏幕"}
        >
          {iconScreen}
        </button>
      )}

      {/* System audio toggle for screen share */}
      {canScreenShare && !isScreenSharing && (
        <button
          onClick={onToggleSystemAudio}
          className={btnClass(includeSystemAudio ? "active" : "default")}
          title={includeSystemAudio ? "包含系统音频" : "不包含系统音频"}
        >
          {iconSpeaker}
        </button>
      )}

      {/* Hand raise */}
      <button
        onClick={onToggleHandRaise}
        className={btnClass(handRaised ? "warning" : "default")}
        title={handRaised ? "放下手" : "举手"}
      >
        <span className="text-lg">{handRaised ? "✋" : "🤚"}</span>
      </button>

      {/* Separator */}
      <div className={separator} />

      {/* Hang up */}
      <button
        onClick={onHangUp}
        className={btnClass("danger")}
        title="离开会议"
      >
        {iconHangUp}
      </button>
    </div>
  );
}

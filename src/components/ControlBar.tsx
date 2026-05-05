interface ControlBarProps {
  isMuted: boolean;
  isCameraOff: boolean;
  handRaised: boolean;
  isMomo: boolean;
  isScreenSharing: boolean;
  isListener?: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleHandRaise: () => void;
  onToggleMomo: () => void;
  onToggleScreenShare: () => void;
  onHangUp: () => void;
}

export default function ControlBar({
  isMuted,
  isCameraOff,
  handRaised,
  isMomo,
  isScreenSharing,
  isListener,
  onToggleMute,
  onToggleCamera,
  onToggleHandRaise,
  onToggleMomo,
  onToggleScreenShare,
  onHangUp,
}: ControlBarProps) {
  const buttonBase =
    "w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200";

  const buttons = [
    {
      icon: isMuted ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ),
      active: !isMuted,
      onClick: isListener ? undefined : onToggleMute,
      label: isListener ? "旁听模式，无法发言" : (isMuted ? "取消静音" : "静音"),
      danger: isMuted,
      disabled: isListener,
    },
    {
      icon: isCameraOff ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      active: !isCameraOff,
      onClick: isListener ? undefined : onToggleCamera,
      label: isListener ? "旁听模式，无法开启摄像头" : (isCameraOff ? "开启摄像头" : "关闭摄像头"),
      danger: isCameraOff,
      disabled: isListener,
    },
    {
      icon: <span className="text-lg">{handRaised ? "✋" : "🤚"}</span>,
      active: handRaised,
      onClick: onToggleHandRaise,
      label: handRaised ? "放下手" : "举手",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      active: isScreenSharing,
      onClick: onToggleScreenShare,
      label: isScreenSharing ? "停止共享" : "共享屏幕",
    },
    {
      icon: isMomo ? (
        <svg className="w-5 h-5 text-purple-300" viewBox="0 0 100 100" fill="none">
          <ellipse cx="50" cy="55" rx="35" ry="30" fill="currentColor" opacity="0.9" />
          <polygon points="25,35 15,10 35,25" fill="currentColor" opacity="0.9" />
          <polygon points="75,35 85,10 65,25" fill="currentColor" opacity="0.9" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      active: isMomo,
      onClick: onToggleMomo,
      label: isMomo ? "关闭Momo" : "开启Momo",
      momo: true,
    },
  ];

  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-800/90 backdrop-blur-md rounded-2xl border border-dark-700 shadow-2xl">
      {isListener && (
        <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full mr-1">
          👂 旁听模式
        </span>
      )}
      {buttons.map((btn, i) => (
        <div key={i} className="relative group">
          <button
            onClick={btn.disabled ? undefined : btn.onClick}
            className={`${buttonBase} ${
              btn.disabled
                ? "bg-dark-800 text-dark-500 cursor-not-allowed"
                : btn.danger
                ? "bg-red-600 hover:bg-red-500 text-white"
                : btn.momo
                ? btn.active
                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                  : "bg-dark-700 hover:bg-dark-600 text-dark-300"
                : btn.active
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-dark-700 hover:bg-dark-600 text-dark-300"
            }`}
          >
            {btn.icon}
          </button>
          {/* Tooltip */}
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block">
            <div className="bg-dark-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
              {btn.label}
            </div>
          </div>
        </div>
      ))}

      {/* Separator */}
      <div className="w-px h-8 bg-dark-600 mx-1" />

      {/* Hang up */}
      <div className="relative group">
        <button
          onClick={onHangUp}
          className={`${buttonBase} bg-red-600 hover:bg-red-500 text-white`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block">
          <div className="bg-dark-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap shadow-lg">
            离开会议
          </div>
        </div>
      </div>
    </div>
  );
}

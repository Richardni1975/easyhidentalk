import { useState, useRef } from "react";
import type { BgEffect } from "../types";

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
  /** Current virtual‑background effect */
  bgEffect?: BgEffect;
  /** Called when user picks a background effect */
  onBgEffectChange?: (effect: BgEffect, image?: HTMLImageElement) => void;
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

const iconScreen = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const iconBg = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const iconHangUp = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

const COLOR_OPTIONS = [
  "#1a1a2e",
  "#2d1b69",
  "#1b4332",
  "#0c525e",
  "#3d0c11",
  "#1e293b",
];

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
  bgEffect,
  onBgEffectChange,
}: ControlBarProps) {
  const [showBgPanel, setShowBgPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const active = bgEffect && bgEffect !== "off";

  const wrapper = vertical
    ? "flex flex-col items-center gap-3 py-3 px-1"
    : "flex items-center justify-center gap-2 px-4 py-3 bg-dark-800/90 backdrop-blur-md rounded-2xl border border-dark-700 shadow-2xl";

  const separator = vertical ? "w-8 h-px bg-dark-600" : "w-px h-8 bg-dark-600";
  const panelPos = vertical ? "left-full ml-3 top-1/2 -translate-y-1/2" : "bottom-full mb-2 left-1/2 -translate-x-1/2";

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        onBgEffectChange?.("image", img);
        setShowBgPanel(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be picked again
    e.target.value = "";
  };

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

      {/* Screen share */}
      <button
        onClick={onToggleScreenShare}
        className={btnClass(isScreenSharing ? "active" : "default")}
        title={isScreenSharing ? "停止共享" : "共享屏幕"}
      >
        {iconScreen}
      </button>

      {/* Hand raise */}
      <button
        onClick={onToggleHandRaise}
        className={btnClass(handRaised ? "warning" : "default")}
        title={handRaised ? "放下手" : "举手"}
      >
        <span className="text-lg">{handRaised ? "✋" : "🤚"}</span>
      </button>

      {/* Virtual Background — with popover panel */}
      {onBgEffectChange && (
        <div className="relative">
          <button
            onClick={() => setShowBgPanel((p) => !p)}
            className={btnClass(active ? "active" : "default")}
            title="虚拟背景"
          >
            {iconBg}
          </button>

          {showBgPanel && (
            <>
              {/* Backdrop to catch outside clicks */}
              <div className="fixed inset-0 z-40" onClick={() => setShowBgPanel(false)} />
              <div
                className={`absolute ${panelPos} z-50 bg-dark-800 border border-dark-600 rounded-xl p-3 shadow-2xl w-48`}
              >
                <p className="text-white text-xs font-semibold mb-2">虚拟背景</p>

                {/* Off */}
                <button
                  onClick={() => { onBgEffectChange("off"); setShowBgPanel(false); }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition-colors ${
                    bgEffect === "off" ? "bg-blue-600 text-white" : "text-dark-200 hover:bg-dark-600"
                  }`}
                >
                  关闭
                </button>

                {/* Blur */}
                <button
                  onClick={() => { onBgEffectChange("blur"); setShowBgPanel(false); }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition-colors mt-1 ${
                    bgEffect === "blur" ? "bg-blue-600 text-white" : "text-dark-200 hover:bg-dark-600"
                  }`}
                >
                  背景虚化
                </button>

                {/* Remove (solid color) */}
                <p className="text-dark-400 text-xs mt-2 mb-1">纯色背景</p>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { onBgEffectChange("remove", undefined); setShowBgPanel(false); }}
                      title={c}
                      className="w-6 h-6 rounded-full border border-dark-500 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                {/* Image upload */}
                <p className="text-dark-400 text-xs mt-2 mb-1">自定义图片</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-left px-2 py-1.5 text-xs rounded-lg bg-dark-700 text-dark-200 hover:bg-dark-600 transition-colors"
                >
                  上传图片...
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </div>
            </>
          )}
        </div>
      )}

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

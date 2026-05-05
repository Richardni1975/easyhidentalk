import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { generateRoomName, isValidRoomName } from "../utils/roomGenerator";

export default function HomePage() {
  const navigate = useNavigate();
  const [roomInput, setRoomInput] = useState("");
  const [generatedRoom, setGeneratedRoom] = useState("");

  useEffect(() => {
    setGeneratedRoom(generateRoomName());
  }, []);

  const handleStartMeeting = () => {
    const roomId = roomInput.trim() || generatedRoom;
    if (!isValidRoomName(roomId)) return;
    navigate(`/premeeting/${roomId}`);
  };

  const handleRegenerate = () => {
    setGeneratedRoom(generateRoomName());
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-dark-950 px-4">
      {/* Logo / Title */}
      <div className="mb-12 text-center">
        <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Meet
          </span>
        </h1>
        <p className="text-dark-300 text-lg">
          安全、匿名的视频会议
        </p>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-lg bg-dark-800 rounded-2xl p-8 shadow-2xl border border-dark-700">
        <div className="space-y-4">
          {/* Generated Room */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              您的会议室
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-dark-700 rounded-lg px-4 py-3 text-white text-lg font-mono border border-dark-600">
                {roomInput || generatedRoom}
              </div>
              <button
                onClick={handleRegenerate}
                className="p-3 rounded-lg bg-dark-700 hover:bg-dark-600 border border-dark-600 transition-colors"
                title="重新生成会议名称"
              >
                <svg
                  className="w-5 h-5 text-dark-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Custom room input */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              或输入自定义会议名称
            </label>
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStartMeeting()}
              placeholder="例如：项目讨论会"
              className="w-full bg-dark-700 rounded-lg px-4 py-3 text-white placeholder-dark-500 border border-dark-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          {/* Start button */}
          <button
            onClick={handleStartMeeting}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
          >
            开始会议
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg text-center">
        <div className="text-dark-400">
          <svg className="w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-xs">端到端加密</p>
        </div>
        <div className="text-dark-400">
          <svg className="w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-xs">最多100人参与</p>
        </div>
        <div className="text-dark-400">
          <svg className="w-6 h-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <p className="text-xs">匿名模式</p>
        </div>
      </div>
    </div>
  );
}

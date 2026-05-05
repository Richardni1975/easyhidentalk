import { useState } from "react";
import type { Poll } from "../types";
import PollResultsModal from "./PollResultsModal";

interface PollBrowserModalProps {
  polls: Poll[];
  onClose: () => void;
}

const MODE_LABELS: Record<string, string> = {
  real: "实名",
  momo: "momo匿名",
  mixed: "混合",
};

const MODE_COLORS: Record<string, string> = {
  real: "bg-blue-900/40 text-blue-300",
  momo: "bg-purple-900/40 text-purple-300",
  mixed: "bg-amber-900/40 text-amber-300",
};

export default function PollBrowserModal({ polls, onClose }: PollBrowserModalProps) {
  const [viewingPoll, setViewingPoll] = useState<Poll | null>(null);

  const sorted = [...polls].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          className="bg-dark-800 rounded-xl border border-dark-600 w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-700 shrink-0">
            <h2 className="text-white font-semibold text-base">投票记录</h2>
            <button onClick={onClose} className="text-dark-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Poll list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sorted.length === 0 && (
              <p className="text-dark-500 text-sm text-center py-8">暂无投票记录</p>
            )}
            {sorted.map((poll) => {
              const total = poll.options.reduce((s, o) => s + o.votes.length, 0);
              return (
                <div
                  key={poll.pollId}
                  className="flex items-center gap-3 p-3 rounded-lg bg-dark-700/50 border border-dark-600 hover:bg-dark-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{poll.question}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${MODE_COLORS[poll.votingMode] || ""}`}>
                        {MODE_LABELS[poll.votingMode] || poll.votingMode}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        poll.status === "open" ? "bg-green-900/40 text-green-300" : "bg-dark-600 text-dark-400"
                      }`}>
                        {poll.status === "open" ? "投票中" : "已结束"}
                      </span>
                      <span className="text-dark-500 text-[10px]">{total} 票</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingPoll(poll)}
                    className="shrink-0 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                  >
                    查看结果
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-dark-700 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1 text-sm bg-dark-600 hover:bg-dark-500 text-white rounded-lg transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      {viewingPoll && (
        <PollResultsModal poll={viewingPoll} onClose={() => setViewingPoll(null)} />
      )}
    </>
  );
}

import type { Poll, PollVote } from "../types";

interface PollResultsModalProps {
  poll: Poll;
  onClose: () => void;
}

const BAR_COLORS = [
  { bg: "bg-blue-600", light: "bg-blue-500/30" },
  { bg: "bg-emerald-500", light: "bg-emerald-500/30" },
  { bg: "bg-amber-500", light: "bg-amber-500/30" },
  { bg: "bg-purple-500", light: "bg-purple-500/30" },
  { bg: "bg-rose-500", light: "bg-rose-500/30" },
  { bg: "bg-cyan-500", light: "bg-cyan-500/30" },
];

function getModeLabel(mode: string): string {
  switch (mode) {
    case "real":
      return "实名投票";
    case "momo":
      return "momo匿名投票";
    case "mixed":
      return "混合投票";
    default:
      return "";
  }
}

function getModeBadgeColor(mode: string): string {
  switch (mode) {
    case "real":
      return "bg-blue-900/40 text-blue-300";
    case "momo":
      return "bg-purple-900/40 text-purple-300";
    case "mixed":
      return "bg-amber-900/40 text-amber-300";
    default:
      return "bg-dark-600 text-dark-400";
  }
}

export default function PollResultsModal({ poll, onClose }: PollResultsModalProps) {
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);
  const maxCount = Math.max(...poll.options.map((o) => o.votes.length), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-dark-800 rounded-xl border border-dark-600 w-[520px] max-w-[90vw] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-dark-700 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white font-semibold text-lg break-words">{poll.question}</h3>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                    poll.status === "open"
                      ? "bg-green-900 text-green-300"
                      : "bg-dark-600 text-dark-400"
                  }`}
                >
                  {poll.status === "open" ? "投票中" : "已结束"}
                </span>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${getModeBadgeColor(poll.votingMode)}`}>
                  {getModeLabel(poll.votingMode)}
                </span>
                <span className="text-dark-500 text-xs ml-auto">
                  共 {totalVotes} 票
                </span>
              </div>
            </div>
            <button onClick={onClose} className="text-dark-400 hover:text-white shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {totalVotes === 0 && (
            <p className="text-dark-500 text-sm text-center py-8">暂无投票</p>
          )}

          {poll.options.map((option, i) => {
            const count = option.votes.length;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const barWidth = maxCount > 0 ? Math.max((count / maxCount) * 100, count > 0 ? 8 : 0) : 0;
            const color = BAR_COLORS[i % BAR_COLORS.length];

            return (
              <div key={i}>
                {/* Option label + vote count */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-white text-sm font-medium">{option.text}</span>
                  <span className="text-dark-400 text-xs font-mono">
                    {count} / {totalVotes} ({pct}%)
                  </span>
                </div>

                {/* Bar */}
                <div className="w-full bg-dark-700 rounded-lg h-8 overflow-hidden relative">
                  <div
                    className={`${color.bg} h-full rounded-lg transition-all duration-500 ease-out flex items-center`}
                    style={{ width: `${barWidth}%` }}
                  >
                    {barWidth > 20 && (
                      <span className="text-white text-xs font-bold ml-2 whitespace-nowrap">
                        {count} 票
                      </span>
                    )}
                  </div>
                  {barWidth <= 20 && count > 0 && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-400 text-xs font-mono">
                      {count}
                    </span>
                  )}
                </div>

                {/* Voter names */}
                {option.votes.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {option.votes.map((vote, j) => (
                      <span
                        key={j}
                        className="text-[11px] bg-dark-700 px-1.5 py-0.5 rounded"
                      >
                        {poll.votingMode === "momo" ? (
                          <span className="text-purple-400">momo</span>
                        ) : poll.votingMode === "mixed" ? (
                          vote.identity === "momo" ? (
                            <><span className="text-purple-400">momo</span><span className="text-dark-500">(匿名)</span></>
                          ) : (
                            <><span className="text-blue-300">{vote.voterName}</span><span className="text-dark-500">(实名)</span></>
                          )
                        ) : (
                          <span className="text-blue-300">{vote.voterName}</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary row */}
          {totalVotes > 0 && (
            <div className="pt-3 border-t border-dark-700">
              <div className="flex items-center justify-between text-dark-400 text-xs">
                <span>参与人数: {poll.options.reduce((s, o) => {
                  const voters = new Set(o.votes.map((v) => v.peerId));
                  return s + voters.size;
                }, 0)}</span>
                <span>总票数: {totalVotes}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-700 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-dark-600 hover:bg-dark-500 text-white text-sm rounded-lg transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

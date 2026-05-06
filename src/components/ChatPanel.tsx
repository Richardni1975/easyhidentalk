import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ChatMessage, Poll, PollVote } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  currentPeerId: string;
  isMomo: boolean;
  polls: Poll[];
  onCreatePoll: (question: string, options: string[], votingMode: string) => void;
  onVotePoll: (pollId: string, optionIndex: number, identity?: "real" | "momo") => void;
  onClosePoll: (pollId: string) => void;
  onViewResults: (poll: Poll) => void;
  /** Called when STT starts/stops — parent should mute/unmute WebRTC audio to avoid mic conflict */
  onVoiceInputChange?: (active: boolean) => void;
}

// Random bright color for momo voice input obfuscation
function randomMomoColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 80%, 65%)`;
}

// Per-speaker background colors for message bubbles
const SPEAKER_BG_COLORS = [
  "bg-dark-600",
  "bg-emerald-700",
  "bg-purple-700",
  "bg-amber-800",
  "bg-rose-700",
  "bg-cyan-800",
  "bg-indigo-700",
  "bg-teal-700",
  "bg-orange-800",
  "bg-pink-700",
  "bg-lime-800",
  "bg-sky-800",
];

function getSpeakerBgColor(peerId: string, currentPeerId: string): string {
  if (peerId === currentPeerId) return "bg-blue-600";
  let hash = 0;
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) - hash) + peerId.charCodeAt(i);
  }
  return SPEAKER_BG_COLORS[Math.abs(hash) % SPEAKER_BG_COLORS.length];
}

const CHAT_STORAGE_KEY = "video-meeting-chat-export";

export default function ChatPanel({
  messages,
  onSend,
  currentPeerId,
  isMomo,
  polls,
  onCreatePoll,
  onVotePoll,
  onClosePoll,
  onViewResults,
  onVoiceInputChange,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [voiceColoredText, setVoiceColoredText] = useState<
    { text: string; color: string }[]
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);

  // Poll state
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollStep, setPollStep] = useState<"mode" | "form">("mode");
  const [pollVotingMode, setPollVotingMode] = useState<string>("real");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [mixedVoteIdentity, setMixedVoteIdentity] = useState<Record<string, "real" | "momo">>({});

  // Chat / poll view toggle
  const [chatView, setChatView] = useState<"chat" | "poll">("chat");
  const votedPollsRef = useRef<Set<string>>(new Set());

  // Auto-save messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        `${CHAT_STORAGE_KEY}-${currentPeerId}`,
        JSON.stringify(messages)
      );
    } catch {
      // silently ignore
    }
  }, [messages, currentPeerId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, polls]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  /** Shared cleanup helper for STT stop in all code paths */
  const stopStt = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimText("");
    setVoiceColoredText([]);
    onVoiceInputChange?.(false);
  }, [onVoiceInputChange]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert("您的浏览器不支持语音输入，请使用 Chrome");
      return;
    }

    if (listeningRef.current) {
      stopStt();
      return;
    }

    // Notify parent to mute WebRTC audio (prevent mic contention)
    onVoiceInputChange?.(true);

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (finalText) {
        setInput((prev) => prev + finalText);
        setVoiceColoredText([]);
      }

      setInterimText(interim);

      if (isMomo) {
        const results: { text: string; color: string }[] = [];
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (transcript) {
            results.push({ text: transcript, color: randomMomoColor() });
          }
        }
        setVoiceColoredText(results);
      }
    };

    recognition.onerror = () => {
      stopStt();
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          stopStt();
        }
      } else {
        stopStt();
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    recognition.start();
    setIsListening(true);
  }, [isMomo, onVoiceInputChange, stopStt]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
    setVoiceColoredText([]);
  };

  const handleExport = () => {
    try {
      const lines: string[] = [];
      const now = new Date();
      lines.push(`聊天记录 - ${now.toLocaleDateString("zh-CN")}`);
      lines.push("=".repeat(40));
      lines.push("");

      const allItems = [...timeline].sort((a, b) => a.data.timestamp - b.data.timestamp);
      for (const item of allItems) {
        const ts = new Date(item.data.timestamp);
        const time = ts.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
        if (item.type === "message") {
          const msg = item.data;
          const name = msg.isMomo ? "momo" : msg.senderName;
          lines.push(`[${time}] ${name}: ${msg.text || ""}`);
        } else {
          const poll = item.data;
          lines.push(`[${time}] 📊 投票: ${poll.question} (${poll.votingMode === "momo" ? "momo匿名" : poll.votingMode === "mixed" ? "混合" : "实名"})`);
          for (const opt of poll.options) {
            const voterNames = opt.votes.map((v: any) => v.voterName).join(", ");
            lines.push(`   - ${opt.text}: ${opt.votes.length} 票${voterNames ? ` (${voterNames})` : ""}`);
          }
          if (poll.status === "closed") {
            lines.push(`   [已结束]`);
          }
        }
      }

      const text = lines.join("\n");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `聊天记录_${now.toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("导出失败:", err);
    }
  };

  // Merge messages and polls into a chronological timeline
  const timeline = useMemo(() => {
    const items: Array<
      { type: "message"; data: ChatMessage } | { type: "poll"; data: Poll }
    > = [
      ...messages.map((m) => ({ type: "message" as const, data: m })),
      ...polls.map((p) => ({ type: "poll" as const, data: p })),
    ];
    items.sort((a, b) => a.data.timestamp - b.data.timestamp);
    return items;
  }, [messages, polls]);

  // Keyboard voting: 1-9 for options 1-9, 0 for option 10
  useEffect(() => {
    if (chatView !== "poll") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key;
      let optionIndex = -1;
      if (key >= "1" && key <= "9") {
        optionIndex = parseInt(key) - 1;
      } else if (key === "0") {
        optionIndex = 9;
      }
      if (optionIndex === -1) return;

      const sorted = [...polls].sort((a, b) => b.timestamp - a.timestamp);
      const targetPoll = sorted.find(
        (p) =>
          p.status === "open" &&
          !p.options.some((opt) => opt.votes.some((v) => v.peerId === currentPeerId)) &&
          !votedPollsRef.current.has(p.pollId)
      );
      if (!targetPoll || optionIndex >= targetPoll.options.length) return;

      const identity =
        targetPoll.votingMode === "mixed"
          ? mixedVoteIdentity[targetPoll.pollId] || "real"
          : undefined;
      votedPollsRef.current.add(targetPoll.pollId);
      onVotePoll(targetPoll.pollId, optionIndex, identity);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatView, polls, currentPeerId, mixedVoteIdentity, onVotePoll]);

  return (
    <div className="w-full bg-dark-800 border-l border-dark-700 flex flex-col h-full min-h-0">
      {/* Header with tabs */}
      <div className="flex items-center justify-between p-3 border-b border-dark-700">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChatView("chat")}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              chatView === "chat"
                ? "bg-blue-600 text-white"
                : "text-dark-400 hover:text-white"
            }`}
          >
            聊天
          </button>
          <button
            onClick={() => {
              setChatView("poll");
              setShowPollForm(false);
            }}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              chatView === "poll"
                ? "bg-blue-600 text-white"
                : "text-dark-400 hover:text-white"
            }`}
          >
            投票 {polls.length > 0 && `(${polls.length})`}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Create poll button (only in poll view) */}
          {chatView === "poll" && (
            <button
              onClick={() => {
                setShowPollForm(!showPollForm);
                setPollStep("mode");
                setPollVotingMode("real");
              }}
              title="创建投票"
              className={`transition-colors ${
                showPollForm ? "text-blue-400" : "text-dark-400 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
          )}
          {/* Export button */}
          <button
            onClick={handleExport}
            title="导出聊天记录"
            className="text-dark-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Poll creation form — two-step */}
      {showPollForm && pollStep === "mode" && (
        <div className="p-3 border-b border-dark-700 bg-dark-750">
          <p className="text-white text-sm font-medium mb-3">选择投票模式</p>
          <div className="space-y-2">
            {[
              { value: "real", label: "实名投票", desc: "所有人以真实姓名投票" },
              { value: "momo", label: "momo投票", desc: "所有人匿名投票" },
              { value: "mixed", label: "混合投票", desc: "可自愿选择momo或实名" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setPollVotingMode(opt.value);
                  setPollStep("form");
                }}
                className="w-full text-left p-3 rounded-lg border transition-colors bg-dark-700 hover:bg-dark-600 border-dark-500"
              >
                <span className="text-white text-sm font-medium block">{opt.label}</span>
                <span className="text-dark-400 text-xs block mt-0.5">{opt.desc}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowPollForm(false)}
            className="mt-3 text-xs text-dark-400 hover:text-white transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {showPollForm && pollStep === "form" && (
        <div className="p-3 border-b border-dark-700 bg-dark-750">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-blue-400 bg-blue-900/40 px-2 py-0.5 rounded-full">
              {pollVotingMode === "real"
                ? "实名投票"
                : pollVotingMode === "momo"
                ? "momo匿名投票"
                : "混合投票"}
            </span>
            <button
              onClick={() => setPollStep("mode")}
              className="text-xs text-dark-400 hover:text-white"
            >
              更改模式
            </button>
          </div>
          <input
            type="text"
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            placeholder="输入投票问题..."
            className="w-full bg-dark-600 rounded-lg px-3 py-2 text-white text-sm placeholder-dark-500 border border-dark-500 mb-2 focus:outline-none focus:border-blue-500"
          />
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  setPollOptions(next);
                }}
                placeholder={`选项 ${i + 1}`}
                className="flex-1 bg-dark-600 rounded-lg px-3 py-1.5 text-white text-sm placeholder-dark-500 border border-dark-500 focus:outline-none focus:border-blue-500"
              />
              {pollOptions.length > 2 && (
                <button
                  onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                  className="text-dark-400 hover:text-red-400 px-1 text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 6 && (
            <button
              onClick={() => setPollOptions([...pollOptions, ""])}
              className="text-xs text-blue-400 hover:text-blue-300 mt-1"
            >
              + 添加选项
            </button>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                const validOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
                if (pollQuestion.trim() && validOpts.length >= 2) {
                  onCreatePoll(pollQuestion.trim(), validOpts, pollVotingMode);
                  setPollQuestion("");
                  setPollOptions(["", ""]);
                  setPollVotingMode("real");
                  setPollStep("mode");
                  setShowPollForm(false);
                }
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
            >
              创建投票
            </button>
            <button
              onClick={() => {
                setShowPollForm(false);
                setPollStep("mode");
              }}
              className="px-3 py-1 bg-dark-600 hover:bg-dark-500 text-white text-xs rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Timeline: chat messages or polls */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {chatView === "chat" && messages.length === 0 && (
          <p className="text-dark-500 text-sm text-center mt-8">
            暂无消息，来打个招呼吧！
          </p>
        )}
        {chatView === "poll" && polls.length === 0 && (
          <p className="text-dark-500 text-sm text-center mt-8">暂无投票</p>
        )}

        {/* Chat messages view */}
        {chatView === "chat" &&
          messages.map((msg, i) => (
            <div
              key={`msg-${i}`}
              className={`flex ${msg.senderId === currentPeerId ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[95%] rounded-lg px-3 py-2 ${
                  msg.senderId === currentPeerId
                    ? "bg-blue-600 text-white"
                    : getSpeakerBgColor(msg.senderId, currentPeerId) + " text-white"
                }`}
              >
                <p className="text-[11px] font-medium opacity-70 mb-0.5">
                  {msg.isMomo ? "momo" : msg.senderName}
                </p>
                {msg.text && <p className="text-sm break-words">{msg.text}</p>}
              </div>
            </div>
          ))}

        {/* Poll view */}
        {chatView === "poll" && [...polls].sort((a, b) => b.timestamp - a.timestamp).map((poll, i) => {
          const hasVoted = poll.options.some((opt) =>
            opt.votes.some((v) => v.peerId === currentPeerId)
          ) || votedPollsRef.current.has(poll.pollId);
          const totalVotes = poll.options.reduce(
            (sum, opt) => sum + opt.votes.length,
            0
          );
          const modeLabel =
            poll.votingMode === "real"
              ? "实名"
              : poll.votingMode === "momo"
              ? "momo匿名"
              : "混合";
          const modeColor =
            poll.votingMode === "real"
              ? "bg-blue-900/40 text-blue-300"
              : poll.votingMode === "momo"
              ? "bg-purple-900/40 text-purple-300"
              : "bg-amber-900/40 text-amber-300";
          const mixedIdentity = mixedVoteIdentity[poll.pollId] || "real";

          const latestOpen =
            poll.status === "open" &&
            i === 0 &&
            !hasVoted;

          return (
            <div key={poll.pollId} className="bg-dark-700 rounded-lg p-3 border border-dark-600">
              {/* Question + mode badge */}
              <div className="flex items-start gap-2 mb-2">
                <p className="text-white font-medium text-sm break-words flex-1">
                  {poll.question}
                </p>
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${modeColor}`}>
                  {modeLabel}
                </span>
              </div>

              {/* Keyboard hint for latest open poll */}
              {latestOpen && (
                <div className="text-[10px] text-dark-500 mb-2 italic">
                  按键盘数字键 1-{Math.min(poll.options.length, 9)} 快速投票
                  {poll.options.length === 10 && "，0 选第10项"}
                </div>
              )}

              {/* Mixed mode identity selector */}
              {poll.votingMode === "mixed" && poll.status === "open" && !hasVoted && (
                <div className="flex items-center gap-2 mb-2 text-xs">
                  <span className="text-dark-400">投票身份：</span>
                  <button
                    onClick={() =>
                      setMixedVoteIdentity((prev) => ({ ...prev, [poll.pollId]: "real" }))
                    }
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      mixedIdentity === "real"
                        ? "bg-blue-600 text-white"
                        : "bg-dark-600 text-dark-300 hover:text-white"
                    }`}
                  >
                    实名
                  </button>
                  <button
                    onClick={() =>
                      setMixedVoteIdentity((prev) => ({ ...prev, [poll.pollId]: "momo" }))
                    }
                    className={`px-2 py-0.5 rounded-full transition-colors ${
                      mixedIdentity === "momo"
                        ? "bg-purple-600 text-white"
                        : "bg-dark-600 text-dark-300 hover:text-white"
                    }`}
                  >
                    momo
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                {poll.options.map((opt, j) => {
                  const count = opt.votes.length;
                  const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  const isVoted = opt.votes.some((v) => v.peerId === currentPeerId);

                  return (
                    <button
                      key={j}
                      onClick={() => {
                        if (poll.status === "open" && !hasVoted) {
                          const identity =
                            poll.votingMode === "mixed" ? mixedIdentity : undefined;
                          votedPollsRef.current.add(poll.pollId);
                          onVotePoll(poll.pollId, j, identity);
                        }
                      }}
                      disabled={poll.status !== "open" || hasVoted}
                      className={`w-full text-left relative overflow-hidden rounded-lg px-3 py-2 transition-colors ${
                        isVoted
                          ? "bg-blue-600/30 border border-blue-500"
                          : "bg-dark-600 border border-dark-500"
                      } ${
                        poll.status === "open" && !hasVoted
                          ? "hover:bg-dark-500 cursor-pointer"
                          : "cursor-default"
                      }`}
                    >
                      <div
                        className="absolute left-0 top-0 h-full bg-blue-600/20 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative flex justify-between items-center">
                        <span className="text-white text-xs">
                          <span className="text-dark-500 font-mono mr-1">{j + 1}.</span>
                          {opt.text}
                        </span>
                        <span className="text-dark-400 text-xs">{count} 票</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-600">
                <span className="text-dark-500 text-xs">
                  {poll.status === "open" ? "投票中" : "已结束"}
                  {poll.creatorPeerId === currentPeerId && " · 我发起的"}
                </span>
                <div className="flex gap-2">
                  {poll.creatorPeerId === currentPeerId && poll.status === "open" && (
                    <button
                      onClick={() => onClosePoll(poll.pollId)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      结束投票
                    </button>
                  )}
                  <button
                    onClick={() => onViewResults(poll)}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    查看结果
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input - fixed at bottom */}
      <div className="p-3 border-t border-dark-700 space-y-2">
        {/* Real-time interim transcription preview */}
        {isListening && interimText && (
          <div className="text-xs leading-relaxed px-2 py-1 rounded bg-dark-700/50 min-h-[20px] text-dark-300 italic">
            {interimText}
          </div>
        )}

        {/* Momo voice color preview */}
        {isMomo && voiceColoredText.length > 0 && (
          <div className="text-xs leading-relaxed px-2 py-1 rounded bg-dark-700/50 min-h-[20px]">
            {voiceColoredText.map((seg, i) => (
              <span key={i} style={{ color: seg.color }}>{seg.text}</span>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {/* Voice input button (STT) */}
          <button
            onClick={startListening}
            className={`px-2 py-2 rounded-lg transition-colors ${
              isListening
                ? "bg-red-600 text-white animate-pulse"
                : "bg-dark-700 text-dark-300 hover:text-white"
            }`}
            title={isListening ? "停止录音" : "语音输入"}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4 0h8m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={isMomo ? "momo 说点什么..." : "输入消息，或点击麦克风语音输入..."}
            className="flex-1 bg-dark-700 rounded-lg px-3 py-2 text-white text-sm placeholder-dark-500 border border-dark-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-dark-600 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

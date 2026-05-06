import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { MeetingProvider, useMeeting } from "../contexts/MeetingContext";
import { useSocket } from "../hooks/useSocket";
import { useWebRTC } from "../hooks/useWebRTC";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import ChatPanel from "../components/ChatPanel";
import type { Participant, ChatMessage, Poll } from "../types";
import PollResultsModal from "../components/PollResultsModal";
import PollBrowserModal from "../components/PollBrowserModal";

function MeetingRoomInner() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    participants,
    setParticipants,
    addParticipant,
    removeParticipant,
    updateParticipant,
    chatMessages,
    addChatMessage,
    isMomo,
    setIsMomo,
    isMuted,
    setIsMuted,
    isCameraOff,
    setIsCameraOff,
    handRaised,
    setHandRaised,
    peerId,
    userName,
    setUserName,
    setRoomId,
  } = useMeeting();

  const [connected, setConnected] = useState(false);
  const [speakingPeerId, setSpeakingPeerId] = useState<string | null>(null);
  const [screenSharingPeerId, setScreenSharingPeerId] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [viewingPoll, setViewingPoll] = useState<Poll | null>(null);
  const [showPollBrowser, setShowPollBrowser] = useState(false);
  const amHostRef = useRef(false);

  const {
    localStream,
    remoteStreams,
    screenShareStreams,
    localScreenStream,
    startLocalStream,
    createPeerConnection,
    startScreenShare,
    stopScreenShare,
    clearScreenShareStream,
    toggleAudio,
    toggleVideo,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    cleanupAll,
  } = useWebRTC();

  const { emit, on, socketConnected, connectCount } = useSocket(roomId);

  const state = location.state as {
    userName?: string;
    isMomo?: boolean;
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  } | null;

  // Redirect to premeeting if accessed directly without state
  useEffect(() => {
    if (roomId && !state) {
      navigate(`/premeeting/${roomId}`, { replace: true });
      return;
    }
    if (!roomId || !state) return;

    setRoomId(roomId);
    setUserName(state.userName || "Guest");
    setIsMomo(state.isMomo || false);

    startLocalStream()
      .then(() => setConnected(true))
      .catch((err) => {
        console.error("Failed to get media:", err);
        setConnected(true);
      });

    return () => {
      cleanupAll();
    };
  }, [roomId]);

  // Socket event handlers
  useEffect(() => {
    if (!connected || !roomId || !socketConnected) return;

    const stream = localStream || new MediaStream();

    console.log("Joining room:", roomId, peerId);
    emit("join-room", {
      roomId,
      peerId,
      userName: state?.userName || "Guest",
      isMomo: state?.isMomo || false,
    });

    const unsubExisting = on("existing-participants", (existing: any[]) => {
      const participantsList: Participant[] = existing.map((p: any) => ({
        peerId: p.peerId,
        userName: p.userName,
        realName: p.realName,
        isMomo: p.isMomo,
        isHost: p.isHost || false,
        joinedAt: p.joinedAt,
        muted: p.muted,
        cameraOff: p.cameraOff,
        handRaised: p.handRaised,
      }));

      if (existing.length === 0) {
        amHostRef.current = true;
      }
      setParticipants(participantsList);

      participantsList.forEach((p) => {
        createPeerConnection(
          p.peerId,
          stream,
          (peerId, candidate) => {
            emit("ice-candidate", { to: peerId, candidate });
          },
          () => {},
          (peerId, state) => {
            if (state === "disconnected" || state === "failed") {
              removeParticipant(peerId);
            }
          }
        );

        createOffer(p.peerId).then((offer) => {
          if (offer) emit("offer", { to: p.peerId, offer });
        });
      });
    });

    const unsubJoined = on("user-joined", (participant: any) => {
      addParticipant({
        peerId: participant.peerId,
        userName: participant.userName,
        realName: participant.realName,
        isMomo: participant.isMomo,
        isHost: participant.isHost || false,
        joinedAt: participant.joinedAt,
        muted: participant.muted,
        cameraOff: participant.cameraOff,
        handRaised: participant.handRaised,
      });
    });

    const unsubOffer = on("offer", async ({ from, offer }: any) => {
      createPeerConnection(
        from,
        stream,
        (peerId, candidate) => {
          emit("ice-candidate", { to: peerId, candidate });
        },
        () => {},
        (peerId, state) => {
          if (state === "disconnected" || state === "failed") {
            removeParticipant(peerId);
          }
        }
      );

      const answer = await handleOffer(from, offer);
      if (answer) emit("answer", { to: from, answer });
    });

    const unsubAnswer = on("answer", async ({ from, answer }: any) => {
      await handleAnswer(from, answer);
    });

    const unsubIce = on("ice-candidate", async ({ from, candidate }: any) => {
      await addIceCandidate(from, candidate);
    });

    const unsubLeft = on("user-left", ({ peerId: leftPeerId }: any) => {
      removeParticipant(leftPeerId);
      clearScreenShareStream(leftPeerId);
      if (screenSharingPeerId === leftPeerId) {
        setScreenSharingPeerId(null);
      }
    });

    const unsubUpdated = on("user-updated", (data: any) => {
      const updates: Partial<Participant> = {};
      if (data.isMomo !== undefined) updates.isMomo = data.isMomo;
      if (data.userName !== undefined) updates.userName = data.userName;
      if (data.isHost !== undefined) updates.isHost = data.isHost;
      updateParticipant(data.peerId, updates);
    });

    const unsubMuted = on("user-muted", (data: any) => {
      updateParticipant(data.peerId, { muted: data.muted });
    });

    const unsubCamera = on("user-camera", (data: any) => {
      updateParticipant(data.peerId, { cameraOff: data.cameraOff });
    });

    const unsubHand = on("hand-raise", (data: any) => {
      updateParticipant(data.peerId, { handRaised: data.raised });
    });

    const unsubExistingMsgs = on("existing-messages", (msgs: ChatMessage[]) => {
      msgs.forEach((m) => addChatMessage(m));
    });

    const unsubChat = on("chat-message", (msg: ChatMessage) => {
      if (msg.senderId !== peerId) {
        addChatMessage(msg);
      }
    });

    // Screen share events
    const unsubScreenStarted = on("screen-share-started", (data: { peerId: string }) => {
      setScreenSharingPeerId(data.peerId);
    });

    const unsubScreenStopped = on("screen-share-stopped", (data: { peerId: string }) => {
      clearScreenShareStream(data.peerId);
      if (screenSharingPeerId === data.peerId) {
        setScreenSharingPeerId(null);
      }
    });

    // Poll events
    const unsubPollCreated = on("poll-created", (poll: Poll) => {
      setPolls((prev) => [...prev, poll]);
    });

    const unsubPollUpdated = on("poll-updated", (poll: Poll) => {
      setPolls((prev) => prev.map((p) => (p.pollId === poll.pollId ? poll : p)));
      setViewingPoll((prev) => (prev?.pollId === poll.pollId ? poll : prev));
    });

    const unsubPollClosed = on("poll-closed", (poll: Poll) => {
      setPolls((prev) =>
        prev.map((p) => (p.pollId === poll.pollId ? { ...p, status: "closed" as const } : p))
      );
      setViewingPoll((prev) =>
        prev?.pollId === poll.pollId ? { ...prev, status: "closed" as const } : prev
      );
    });

    const unsubExistingPolls = on("existing-polls", (existingPolls: Poll[]) => {
      setPolls(existingPolls);
    });

    return () => {
      unsubExisting();
      unsubJoined();
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubLeft();
      unsubUpdated();
      unsubMuted();
      unsubCamera();
      unsubHand();
      unsubChat();
      unsubExistingMsgs();
      unsubScreenStarted();
      unsubScreenStopped();
      unsubPollCreated();
      unsubPollUpdated();
      unsubPollClosed();
      unsubExistingPolls();
    };
  }, [connected, roomId, localStream, socketConnected, connectCount]);

  const handleToggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    toggleAudio(!newMuted);
    emit("user-mute", { muted: newMuted });
  }, [isMuted, toggleAudio, emit, setIsMuted]);

  const handleToggleCamera = useCallback(() => {
    const newOff = !isCameraOff;
    setIsCameraOff(newOff);
    toggleVideo(!newOff);
    emit("user-camera", { cameraOff: newOff });
  }, [isCameraOff, toggleVideo, emit, setIsCameraOff]);

  const handleToggleHandRaise = useCallback(() => {
    const newRaised = !handRaised;
    setHandRaised(newRaised);
    emit("raise-hand", { raised: newRaised });
  }, [handRaised, emit, setHandRaised]);

  const handleSendChat = useCallback(
    (text: string) => {
      emit("chat-message", { text });
      addChatMessage({
        senderId: peerId,
        senderName: isMomo ? "momo" : userName,
        isMomo,
        text,
        timestamp: Date.now(),
      });
    },
    [emit, peerId, userName, isMomo, addChatMessage]
  );

  const handleHangUp = useCallback(() => {
    cleanupAll();
    navigate("/", { replace: true });
  }, [cleanupAll, navigate]);

  const handleToggleScreenShare = useCallback(async () => {
    if (screenSharingPeerId) {
      stopScreenShare();
      setScreenSharingPeerId(null);
      emit("stop-screen-share");
    } else {
      try {
        await startScreenShare();
        setScreenSharingPeerId(peerId);
        emit("start-screen-share");
      } catch (err) {
        // User cancelled
      }
    }
  }, [screenSharingPeerId, startScreenShare, stopScreenShare, emit, peerId]);

  const handleStopScreenShare = useCallback(() => {
    stopScreenShare();
    setScreenSharingPeerId(null);
    emit("stop-screen-share");
  }, [stopScreenShare, emit]);

  // Host determination
  const hostPeerId = useMemo(() => {
    if (amHostRef.current) return peerId;
    const host = participants.find((p) => p.isHost);
    return host?.peerId || null;
  }, [participants, peerId]);

  const localParticipant: Participant = {
    peerId,
    userName: isMomo ? "momo" : userName,
    realName: userName,
    isMomo,
    isHost: hostPeerId === peerId,
    muted: isMuted,
    cameraOff: isCameraOff,
    handRaised,
  };

  // 4 video slot priority: host > speaker > hand-raisers > join order
  const videoPriorityPeerIds = useMemo(() => {
    const maxSlots = 4;
    const priority = new Set<string>();

    if (hostPeerId) priority.add(hostPeerId);
    if (speakingPeerId && !priority.has(speakingPeerId) && priority.size < maxSlots) {
      priority.add(speakingPeerId);
    }

    const remaining = participants
      .filter((p) => !priority.has(p.peerId))
      .sort((a, b) => {
        if (a.handRaised && !b.handRaised) return -1;
        if (!a.handRaised && b.handRaised) return 1;
        return (a.joinedAt || 0) - (b.joinedAt || 0);
      });

    for (const p of remaining) {
      if (priority.size >= maxSlots) break;
      priority.add(p.peerId);
    }

    if (!priority.has(peerId) && priority.size < maxSlots) {
      priority.add(peerId);
    }

    return Array.from(priority);
  }, [participants, hostPeerId, speakingPeerId, peerId]);

  const remoteParticipants = participants.filter((p) => p.peerId !== peerId);

  // Screen share display stream
  const activeScreenStream = useMemo(() => {
    if (localScreenStream) return localScreenStream;
    if (screenSharingPeerId && screenSharingPeerId !== peerId) {
      return screenShareStreams.get(screenSharingPeerId) || null;
    }
    return null;
  }, [localScreenStream, screenShareStreams, screenSharingPeerId, peerId]);

  // Poll callbacks
  const handleCreatePoll = useCallback(
    (question: string, optionsTexts: string[], votingMode: string) => {
      emit("create-poll", { question, optionsTexts, votingMode });
    },
    [emit]
  );

  const handleVotePoll = useCallback(
    (pollId: string, optionIndex: number, identity?: "real" | "momo") => {
      emit("vote-poll", { pollId, optionIndex, identity });
    },
    [emit]
  );

  const handleClosePoll = useCallback(
    (pollId: string) => {
      emit("close-poll", { pollId });
    },
    [emit]
  );

  const handleViewResults = useCallback((poll: Poll) => {
    setViewingPoll(poll);
  }, []);

  // Handle STT voice input: mute WebRTC audio to prevent mic contention
  const handleVoiceInputChange = useCallback(
    (active: boolean) => {
      if (active) {
        // STT starting — mute WebRTC audio
        toggleAudio(false);
        setIsMuted(true);
        emit("user-mute", { muted: true });
      } else {
        // STT done — restore audio
        toggleAudio(true);
        setIsMuted(false);
        emit("user-mute", { muted: false });
      }
    },
    [toggleAudio, setIsMuted, emit]
  );

  return (
    <div className="h-screen w-screen bg-dark-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-900 border-b border-dark-800">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">{roomId}</span>
          <span className="text-dark-500 text-xs">|</span>
          <span className="text-dark-400 text-xs">
            {remoteParticipants.length + 1} 人在线
          </span>
        </div>
        <div className="flex items-center gap-2">
          {polls.length > 0 && (
            <button
              onClick={() => setShowPollBrowser(true)}
              className="px-2 py-1 rounded text-xs bg-dark-700 text-dark-300 hover:text-white hover:bg-dark-600 transition-colors flex items-center gap-1"
              title="查看投票"
            >
              <span>📊</span>
              <span>投票 ({polls.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main content: video + chat */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Video grid OR screen share */}
        <div className="md:w-[65%] w-full min-h-0 flex flex-col">
          {activeScreenStream ? (
            /* Screen share active — show video + avatar bar */
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 bg-dark-950 flex items-center justify-center relative">
                <video
                  autoPlay
                  playsInline
                  muted={screenSharingPeerId === peerId}
                  className="w-full h-full object-contain"
                  ref={(el) => {
                    if (el && el.srcObject !== activeScreenStream) {
                      el.srcObject = activeScreenStream;
                    }
                  }}
                />
                {/* Stop screen share button (only for sharer) */}
                {screenSharingPeerId === peerId && (
                  <button
                    onClick={handleStopScreenShare}
                    className="absolute top-3 right-3 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    停止共享
                  </button>
                )}
              </div>
              {/* Avatar bar during screen share */}
              <VideoGrid
                localParticipant={localParticipant}
                localStream={localStream}
                remoteStreams={remoteStreams}
                participants={remoteParticipants}
                speakingPeerId={speakingPeerId}
                videoPriorityPeerIds={videoPriorityPeerIds}
                screenSharing={true}
              />
            </div>
          ) : (
            /* Normal video grid */
            <VideoGrid
              localParticipant={localParticipant}
              localStream={localStream}
              remoteStreams={remoteStreams}
              participants={remoteParticipants}
              speakingPeerId={speakingPeerId}
              videoPriorityPeerIds={videoPriorityPeerIds}
            />
          )}
        </div>

        {/* Right: Chat panel */}
        <div className="md:w-[35%] w-full min-h-0 border-t md:border-t-0 md:border-l border-dark-700 flex flex-col">
          <ChatPanel
            messages={chatMessages}
            onSend={handleSendChat}
            currentPeerId={peerId}
            isMomo={isMomo}
            polls={polls}
            onCreatePoll={handleCreatePoll}
            onVotePoll={handleVotePoll}
            onClosePoll={handleClosePoll}
            onViewResults={handleViewResults}
            onVoiceInputChange={handleVoiceInputChange}
          />
        </div>
      </div>

      {/* Poll modals */}
      {showPollBrowser && (
        <PollBrowserModal polls={polls} onClose={() => setShowPollBrowser(false)} />
      )}
      {viewingPoll && (
        <PollResultsModal poll={viewingPoll} onClose={() => setViewingPoll(null)} />
      )}

      {/* Bottom control bar */}
      <div className="flex items-center justify-center py-3 px-4 bg-dark-900/80 backdrop-blur-sm border-t border-dark-800">
        <ControlBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          handRaised={handRaised}
          isScreenSharing={!!screenSharingPeerId}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onToggleHandRaise={handleToggleHandRaise}
          onToggleScreenShare={handleToggleScreenShare}
          onHangUp={handleHangUp}
        />
      </div>
    </div>
  );
}

export default function MeetingRoom() {
  return (
    <MeetingProvider>
      <MeetingRoomInner />
    </MeetingProvider>
  );
}

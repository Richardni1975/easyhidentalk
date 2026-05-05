import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { MeetingProvider, useMeeting } from "../contexts/MeetingContext";
import { useSocket } from "../hooks/useSocket";
import { useWebRTC } from "../hooks/useWebRTC";
import { useAudioEffects } from "../hooks/useAudioEffects";
import VideoGrid from "../components/VideoGrid";
import ControlBar from "../components/ControlBar";
import ChatPanel from "../components/ChatPanel";
import MediaSharePanel from "../components/MediaSharePanel";
import EmojiReactions from "../components/EmojiReactions";
import type { Participant, ChatMessage, SharedContent, Poll } from "../types";
import PollResultsModal from "../components/PollResultsModal";
import PollBrowserModal from "../components/PollBrowserModal";

const EMOJIS = ["😀", "😂", "🎉", "❤️", "👍", "👋", "🔥", "🌟"];

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
    emojiEvents,
    addEmojiEvent,
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
  const momoStreamRef = useRef<MediaStream | null>(null);
  const [screenSharingPeerId, setScreenSharingPeerId] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [viewingPoll, setViewingPoll] = useState<Poll | null>(null);
  const [showPollBrowser, setShowPollBrowser] = useState(false);

  const {
    localStream,
    remoteStreams,
    screenShareStreams,
    localScreenStream,
    startLocalStream,
    createPeerConnection,
    replaceAudioTrack,
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

  const { emit, on } = useSocket(roomId);
  const { createPitchShiftedStream, setPitchEnabled, cleanup: cleanupAudio } = useAudioEffects();

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
        setConnected(true); // Still connect even without media
      });

    return () => {
      cleanupAll();
      cleanupAudio();
    };
  }, [roomId]);

  // Handle momo audio processing when local stream is ready
  useEffect(() => {
    if (!localStream || !isMomo) return;

    createPitchShiftedStream(localStream)
      .then((processedStream) => {
        momoStreamRef.current = processedStream;
        replaceAudioTrack(processedStream);
      })
      .catch((err) => {
        console.error("Failed to create pitch-shifted stream:", err);
      });

    return () => {
      setPitchEnabled(false);
    };
  }, [localStream, isMomo, setPitchEnabled]);

  // Shared content state (must be before socket useEffect which references it)
  const [sharedContent, setSharedContent] = useState<SharedContent | null>(null);

  const handleShareUrl = useCallback(
    (url: string) => {
      const share: SharedContent = {
        type: "url",
        content: url,
        sharedBy: peerId,
        senderName: isMomo ? "momo" : userName,
        timestamp: Date.now(),
      };
      setSharedContent(share);
      emit("share-url", { url, senderName: share.senderName });
    },
    [peerId, isMomo, userName, emit]
  );

  const handleShareText = useCallback(
    (text: string, fileName: string, mimeType?: string) => {
      const shareType = mimeType && !mimeType.startsWith("text/") ? "file" : "text";
      const share: SharedContent = {
        type: shareType,
        content: text,
        fileName,
        mimeType,
        sharedBy: peerId,
        senderName: isMomo ? "momo" : userName,
        timestamp: Date.now(),
      };
      setSharedContent(share);
      emit("share-text", { text, fileName, senderName: share.senderName, mimeType });
    },
    [peerId, isMomo, userName, emit]
  );

  const handleStopShare = useCallback(() => {
    setSharedContent(null);
    emit("stop-share", {});
  }, [emit]);

  // Socket event handlers - set up after connection
  useEffect(() => {
    if (!connected || !roomId || !localStream) return;

    // Join room
    emit("join-room", {
      roomId,
      peerId,
      userName: state?.userName || "Guest",
      isMomo: state?.isMomo || false,
    });

    // Handle existing participants
    const unsubExisting = on("existing-participants", (existing: any[]) => {
      const participantsList: Participant[] = existing.map((p: any) => ({
        peerId: p.peerId,
        userName: p.userName,
        realName: p.realName,
        isMomo: p.isMomo,
        muted: p.muted,
        cameraOff: p.cameraOff,
        handRaised: p.handRaised,
      }));
      setParticipants(participantsList);

      // Create peer connections for each existing participant
      participantsList.forEach((p) => {
        const pc = createPeerConnection(
          p.peerId,
          localStream,
          (peerId, candidate) => {
            emit("ice-candidate", { to: peerId, candidate });
          },
          (peerId, stream) => {
            // onTrack callback
          },
          (peerId, state) => {
            if (state === "disconnected" || state === "failed") {
              removeParticipant(peerId);
            }
          },
          (peerId, stream) => {
            // onScreenTrack — handled by screenShareStreams state inside useWebRTC
          }
        );

        // Create and send offer
        createOffer(p.peerId).then((offer) => {
          if (offer) emit("offer", { to: p.peerId, offer });
        });
      });
    });

    // Handle new user joining
    const unsubJoined = on("user-joined", (participant: any) => {
      const newParticipant: Participant = {
        peerId: participant.peerId,
        userName: participant.userName,
        realName: participant.realName,
        isMomo: participant.isMomo,
        muted: participant.muted,
        cameraOff: participant.cameraOff,
        handRaised: participant.handRaised,
      };
      addParticipant(newParticipant);

      // Create peer connection and send offer
      const pc = createPeerConnection(
        participant.peerId,
        localStream,
        (peerId, candidate) => {
          emit("ice-candidate", { to: peerId, candidate });
        },
        (peerId, stream) => {},
        (peerId, state) => {
          if (state === "disconnected" || state === "failed") {
            removeParticipant(peerId);
          }
        },
        (peerId, stream) => {
          // onScreenTrack — handled by screenShareStreams state inside useWebRTC
        }
      );

      createOffer(participant.peerId).then((offer) => {
        if (offer) emit("offer", { to: participant.peerId, offer });
      });
    });

    // Handle WebRTC offers
    const unsubOffer = on("offer", async ({ from, offer }: any) => {
      // Ensure we have a peer connection for this peer
      createPeerConnection(
        from,
        localStream,
        (peerId, candidate) => {
          emit("ice-candidate", { to: peerId, candidate });
        },
        (peerId, stream) => {},
        (peerId, state) => {
          if (state === "disconnected" || state === "failed") {
            removeParticipant(peerId);
          }
        },
        (peerId, stream) => {
          // onScreenTrack — handled by screenShareStreams state inside useWebRTC
        }
      );

      const answer = await handleOffer(from, offer);
      if (answer) emit("answer", { to: from, answer });
    });

    // Handle WebRTC answers
    const unsubAnswer = on("answer", async ({ from, answer }: any) => {
      await handleAnswer(from, answer);
    });

    // Handle ICE candidates
    const unsubIce = on("ice-candidate", async ({ from, candidate }: any) => {
      await addIceCandidate(from, candidate);
    });

    // Handle user left
    const unsubLeft = on("user-left", ({ peerId: leftPeerId }: any) => {
      removeParticipant(leftPeerId);
      clearScreenShareStream(leftPeerId);
      if (screenSharingPeerId === leftPeerId) {
        setScreenSharingPeerId(null);
      }
    });

    // Handle user updates (momo toggle, etc.)
    const unsubUpdated = on("user-updated", (data: any) => {
      updateParticipant(data.peerId, {
        isMomo: data.isMomo,
        userName: data.userName,
      });
    });

    // Handle mute state changes
    const unsubMuted = on("user-muted", (data: any) => {
      updateParticipant(data.peerId, { muted: data.muted });
    });

    // Handle camera state changes
    const unsubCamera = on("user-camera", (data: any) => {
      updateParticipant(data.peerId, { cameraOff: data.cameraOff });
    });

    // Handle hand raise
    const unsubHand = on("hand-raise", (data: any) => {
      updateParticipant(data.peerId, { handRaised: data.raised });
    });

    // Handle existing chat history (server-persisted)
    const unsubExistingMsgs = on("existing-messages", (msgs: ChatMessage[]) => {
      msgs.forEach((m) => addChatMessage(m));
    });

    // Handle chat messages (skip self — sender added locally for instant feedback)
    const unsubChat = on("chat-message", (msg: ChatMessage) => {
      if (msg.senderId !== peerId) {
        addChatMessage(msg);
      }
    });

    // Handle emoji reactions
    const unsubEmoji = on("emoji", (data: any) => {
      addEmojiEvent({ peerId: data.peerId, emoji: data.emoji });
    });

    // Handle shared content
    const unsubShareUrl = on("share-url", (data: any) => {
      if (data.sharedBy !== peerId) {
        setSharedContent({
          type: "url",
          content: data.url,
          sharedBy: data.sharedBy,
          senderName: data.senderName,
          timestamp: data.timestamp,
        });
      }
    });

    const unsubShareText = on("share-text", (data: any) => {
      if (data.sharedBy !== peerId) {
        const shareType = data.mimeType && !data.mimeType.startsWith("text/") ? "file" : "text";
        setSharedContent({
          type: shareType,
          content: data.text,
          fileName: data.fileName,
          mimeType: data.mimeType,
          sharedBy: data.sharedBy,
          senderName: data.senderName,
          timestamp: data.timestamp,
        });
      }
    });

    const unsubStopShare = on("stop-share", (data: any) => {
      if (data.sharedBy === sharedContent?.sharedBy) {
        setSharedContent(null);
      }
    });

    // Handle screen share events
    const unsubScreenStarted = on("screen-share-started", (data: { peerId: string }) => {
      setScreenSharingPeerId(data.peerId);
    });

    const unsubScreenStopped = on("screen-share-stopped", (data: { peerId: string }) => {
      clearScreenShareStream(data.peerId);
      if (screenSharingPeerId === data.peerId) {
        setScreenSharingPeerId(null);
      }
    });

    // --- Poll event handlers ---
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
      unsubEmoji();
      unsubShareUrl();
      unsubShareText();
      unsubStopShare();
      unsubScreenStarted();
      unsubScreenStopped();
      unsubPollCreated();
      unsubPollUpdated();
      unsubPollClosed();
      unsubExistingPolls();
      unsubExistingMsgs();
    };
  }, [connected, roomId, localStream, sharedContent, screenSharingPeerId]);

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

  const handleToggleMomo = useCallback(async () => {
    const newMomo = !isMomo;
    setIsMomo(newMomo);
    emit("momo-toggle", { isMomo: newMomo });

    if (newMomo) {
      if (!momoStreamRef.current && localStream) {
        // First time enabling momo — create AudioContext + worklet once
        try {
          const processedStream = await createPitchShiftedStream(localStream);
          momoStreamRef.current = processedStream;
          replaceAudioTrack(processedStream);
        } catch (err) {
          console.error("Pitch shift error:", err);
        }
      } else {
        // Already set up — just enable the effect via worklet message
        setPitchEnabled(true);
      }
    } else {
      // Disable pitch shifting via worklet message (no track replacement)
      setPitchEnabled(false);
    }
  }, [
    isMomo,
    localStream,
    createPitchShiftedStream,
    setPitchEnabled,
    replaceAudioTrack,
    emit,
    setIsMomo,
  ]);

  const handleSendChat = useCallback(
    (text: string) => {
      emit("chat-message", { text });
      // Add locally for sender; server broadcasts to others via socket.to
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

  const handleSendEmoji = useCallback(
    (emoji: string) => {
      emit("emoji", { emoji });
      addEmojiEvent({ peerId, emoji });
    },
    [emit, peerId, addEmojiEvent]
  );

  const handleHangUp = useCallback(() => {
    cleanupAll();
    cleanupAudio();
    navigate("/", { replace: true });
  }, [cleanupAll, cleanupAudio, navigate]);

  const handleToggleScreenShare = useCallback(async () => {
    if (screenSharingPeerId) {
      // Stop screen sharing
      stopScreenShare();
      setScreenSharingPeerId(null);
      emit("stop-screen-share");
    } else {
      try {
        await startScreenShare();
        setScreenSharingPeerId(peerId);
        emit("start-screen-share");
      } catch (err) {
        // User cancelled the display picker — no action needed
      }
    }
  }, [screenSharingPeerId, startScreenShare, stopScreenShare, emit, peerId]);

  const handleStopScreenShare = useCallback(() => {
    stopScreenShare();
    setScreenSharingPeerId(null);
    emit("stop-screen-share");
  }, [stopScreenShare, emit]);

  // Build local participant for display
  const localParticipant: Participant = {
    peerId,
    userName: isMomo ? "momo" : userName,
    realName: userName,
    isMomo,
    muted: isMuted,
    cameraOff: isCameraOff,
    handRaised,
  };

  // Filter out local from participants list for display
  const remoteParticipants = participants.filter((p) => p.peerId !== peerId);

  // Determine which screen share stream to display in center panel
  const activeScreenStream = useMemo(() => {
    if (localScreenStream) return localScreenStream;
    if (screenSharingPeerId && screenSharingPeerId !== peerId) {
      return screenShareStreams.get(screenSharingPeerId) || null;
    }
    return null;
  }, [localScreenStream, screenShareStreams, screenSharingPeerId, peerId]);

  const screenSharerName = useMemo(() => {
    if (!screenSharingPeerId) return null;
    if (screenSharingPeerId === peerId) return isMomo ? "momo" : userName;
    const p = participants.find((p) => p.peerId === screenSharingPeerId);
    return p ? (p.isMomo ? "momo" : p.realName) : null;
  }, [screenSharingPeerId, peerId, isMomo, userName, participants]);

  // --- Poll callbacks ---
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

  // Track audio levels for speaking indicator (simplified)
  useEffect(() => {
    if (!localStream) return;
    // Simple speaking detection based on local audio
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    // Use audio level via a simple interval (simplified approach)
    // In a real app we'd use RTCRtpReceiver stats or AudioContext analyzer
    const interval = setInterval(() => {}, 500);
    return () => clearInterval(interval);
  }, [localStream]);

  return (
    <div className="h-screen w-screen bg-dark-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-900 border-b border-dark-800">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">
            {roomId}
          </span>
          <span className="text-dark-500 text-xs">|</span>
          <span className="text-dark-400 text-xs">
            {remoteParticipants.length + 1} 人在线
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Poll browser button */}
          {polls.length > 0 && (
            <button
              onClick={() => setShowPollBrowser(true)}
              className="px-2 py-1 rounded text-xs bg-dark-700 text-dark-300 hover:text-white hover:bg-dark-600 transition-colors flex items-center gap-1"
              title="查看投票结果"
            >
              <span>📊</span>
              <span>投票 ({polls.length})</span>
            </button>
          )}
          {/* Emoji picker */}
          <div className="flex gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendEmoji(emoji)}
                className="w-7 h-7 rounded hover:bg-dark-700 transition-colors text-sm flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Three-column main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: video grid (25%) */}
        <div className="w-1/4 min-w-0 flex flex-col">
          <VideoGrid
            localParticipant={localParticipant}
            localStream={localStream}
            remoteStreams={remoteStreams}
            participants={remoteParticipants}
            speakingPeerId={speakingPeerId}
            focusPeerId={screenSharingPeerId || sharedContent?.sharedBy || null}
          />
        </div>

        {/* Center column: media share panel (50%) */}
        <div className="w-1/2 min-w-0 border-x border-dark-700 flex flex-col">
          <MediaSharePanel
            sharedContent={sharedContent}
            onShareUrl={handleShareUrl}
            onShareText={handleShareText}
            onStopShare={handleStopShare}
            userName={isMomo ? "momo" : userName}
            peerId={peerId}
            screenShareStream={activeScreenStream}
            screenSharerPeerId={screenSharingPeerId}
            screenSharerName={screenSharerName}
            onStopScreenShare={handleStopScreenShare}
          />
        </div>

        {/* Right column: chat panel (25%) */}
        <div className="w-1/4 min-w-0 flex flex-col">
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
          />
        </div>
      </div>

      {/* Emoji reactions overlay */}
      <EmojiReactions events={emojiEvents} />

      {/* Poll browser modal */}
      {showPollBrowser && (
        <PollBrowserModal polls={polls} onClose={() => setShowPollBrowser(false)} />
      )}

      {/* Poll results modal */}
      {viewingPoll && (
        <PollResultsModal poll={viewingPoll} onClose={() => setViewingPoll(null)} />
      )}

      {/* Bottom control bar */}
      <div className="flex items-center justify-center py-3 px-4 bg-dark-900/80 backdrop-blur-sm border-t border-dark-800">
        <ControlBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          handRaised={handRaised}
          isMomo={isMomo}
          isScreenSharing={!!screenSharingPeerId}
          onToggleMute={handleToggleMute}
          onToggleCamera={handleToggleCamera}
          onToggleHandRaise={handleToggleHandRaise}
          onToggleMomo={handleToggleMomo}
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

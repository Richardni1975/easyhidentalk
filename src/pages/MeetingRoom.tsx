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
import ContactList from "../components/ContactList";

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
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const amHostRef = useRef(false); // true if we joined an empty room
  const [promotedPeerIds, setPromotedPeerIds] = useState<string[]>([]);

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

  const { emit, on, socketConnected } = useSocket(roomId);
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
    if (!connected || !roomId || !socketConnected) return;

    const stream = localStream || new MediaStream(); // fallback empty stream

    // Join room
    console.log("Joining room via socket:", socketConnected, roomId, peerId);
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
        isHost: p.isHost || false,
        joinedAt: p.joinedAt,
        muted: p.muted,
        cameraOff: p.cameraOff,
        handRaised: p.handRaised,
      }));

      // If room was empty, we are the host
      if (existing.length === 0) {
        amHostRef.current = true;
      }
      setParticipants(participantsList);

      // Create peer connections for each existing participant
      participantsList.forEach((p) => {
        const pc = createPeerConnection(
          p.peerId,
          stream,
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

    // Sync promoted list
    const unsubExistingPromoted = on("existing-promoted", ({ promotedPeerIds: list }: { promotedPeerIds: string[] }) => {
      setPromotedPeerIds(list);
    });

    const unsubPromotedUpdated = on("promoted-updated", ({ promotedPeerIds: list }: { promotedPeerIds: string[] }) => {
      setPromotedPeerIds(list);
    });

    // Handle new user joining — DO NOT create offer here
    // New joiners initiate offers via existing-participants; glare would otherwise
    // leave both sides with unanswered offers and no working connection.
    const unsubJoined = on("user-joined", (participant: any) => {
      const newParticipant: Participant = {
        peerId: participant.peerId,
        userName: participant.userName,
        realName: participant.realName,
        isMomo: participant.isMomo,
        isHost: participant.isHost || false,
        joinedAt: participant.joinedAt,
        muted: participant.muted,
        cameraOff: participant.cameraOff,
        handRaised: participant.handRaised,
      };
      addParticipant(newParticipant);
    });

    // Handle WebRTC offers
    const unsubOffer = on("offer", async ({ from, offer }: any) => {
      // Ensure we have a peer connection for this peer
      createPeerConnection(
        from,
        stream,
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

    // Handle user updates (momo toggle, host promotion, etc.)
    const unsubUpdated = on("user-updated", (data: any) => {
      const updates: Partial<Participant> = {};
      if (data.isMomo !== undefined) updates.isMomo = data.isMomo;
      if (data.userName !== undefined) updates.userName = data.userName;
      if (data.isHost !== undefined) updates.isHost = data.isHost;
      updateParticipant(data.peerId, updates);
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
      unsubExistingPromoted();
      unsubPromotedUpdated();
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
  }, [connected, roomId, localStream, socketConnected, sharedContent, screenSharingPeerId]);

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

  // Host promotion callback: promote an avatar-only participant
  const handlePromote = useCallback(
    (targetPeerId: string) => {
      emit("promote-participant", { peerId: targetPeerId });
    },
    [emit]
  );

  const handleDemote = useCallback(
    (targetPeerId: string) => {
      emit("demote-participant", { peerId: targetPeerId });
    },
    [emit]
  );

  // Determine host peerId from participant list (or self if we joined first)
  const hostPeerId = useMemo(() => {
    if (amHostRef.current) return peerId;
    const host = participants.find((p) => p.isHost);
    return host?.peerId || null;
  }, [participants, peerId]);

  // Build local participant for display
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

  // Calculate which 4 participants get video: host > promoted > speaker > hand-raisers > join order
  const videoPriorityPeerIds = useMemo(() => {
    const maxSlots = 4;
    const priority = new Set<string>();

    // 1. Host always gets a slot
    if (hostPeerId) priority.add(hostPeerId);

    // 2. Host-promoted participants get slots (pinned by host)
    for (const pid of promotedPeerIds) {
      if (priority.size >= maxSlots) break;
      priority.add(pid);
    }

    // 3. Current speaker gets a slot (if not already in)
    if (speakingPeerId && !priority.has(speakingPeerId)) {
      if (priority.size < maxSlots) priority.add(speakingPeerId);
    }

    // 4. Fill remaining slots by hand-raise first, then join order
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

    // Always include local peer in case they aren't in priority yet
    // (so local video always shows)
    if (!priority.has(peerId) && priority.size < maxSlots) {
      priority.add(peerId);
    }

    return Array.from(priority);
  }, [participants, hostPeerId, speakingPeerId, peerId, promotedPeerIds]);

  // Filter out local from participants list for display
  const remoteParticipants = participants.filter((p) => p.peerId !== peerId);

  // Determine if local user is restricted (listener mode — can't speak/show video)
  const isListener = useMemo(() => {
    if (hostPeerId === peerId) return false; // host always has full access
    return !videoPriorityPeerIds.includes(peerId);
  }, [videoPriorityPeerIds, hostPeerId, peerId]);

  // Force mute and camera off when in listener mode
  useEffect(() => {
    if (isListener) {
      if (!isMuted) {
        setIsMuted(true);
        toggleAudio(false);
        emit("user-mute", { muted: true });
      }
      if (!isCameraOff) {
        setIsCameraOff(true);
        toggleVideo(false);
        emit("user-camera", { cameraOff: true });
      }
    }
  }, [isListener]);

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

  // Track audio levels for speaking indicator
  useEffect(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let animId: number | null = null;
    let speaking = false;

    try {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source = audioCtx.createMediaStreamSource(localStream);
      source.connect(analyser);
    } catch {
      return; // AudioContext not supported
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function detect() {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const isSpeaking = avg > 10; // threshold

      if (isSpeaking !== speaking) {
        speaking = isSpeaking;
        setSpeakingPeerId(isSpeaking ? peerId : null);
      }

      animId = requestAnimationFrame(detect);
    }

    detect();

    return () => {
      if (animId !== null) cancelAnimationFrame(animId);
      source?.disconnect();
      audioCtx?.close();
    };
  }, [localStream, peerId]);

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
          {/* Mobile chat toggle */}
          <button
            onClick={() => setShowMobileChat(!showMobileChat)}
            className="md:hidden px-2 py-1 rounded text-xs bg-dark-700 text-dark-300 hover:text-white transition-colors"
            title={showMobileChat ? "关闭聊天" : "打开聊天"}
          >
            {showMobileChat ? "✕ 视频" : "💬 聊天"}
          </button>
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
          {/* Contacts / Invite button */}
          {hostPeerId === peerId && (
            <button
              onClick={() => setShowContacts(true)}
              className="px-2 py-1 rounded text-xs bg-dark-700 text-dark-300 hover:text-white hover:bg-dark-600 transition-colors flex items-center gap-1"
              title="发送邀请"
            >
              <span>📧</span>
              <span>邀请</span>
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
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left column: video grid (25%, full on mobile) */}
        <div className="md:w-1/4 w-full min-h-0 md:min-w-0 flex-1 md:flex-none flex flex-col">
          <VideoGrid
            localParticipant={localParticipant}
            localStream={localStream}
            remoteStreams={remoteStreams}
            participants={remoteParticipants}
            speakingPeerId={speakingPeerId}
            focusPeerId={screenSharingPeerId || sharedContent?.sharedBy || null}
            videoPriorityPeerIds={videoPriorityPeerIds}
            isHost={hostPeerId === peerId}
            onPromote={handlePromote}
            promotedPeerIds={promotedPeerIds}
          />
        </div>

        {/* Center column: media share panel (50%, hidden on mobile unless active) */}
        <div className={`md:w-1/2 w-full min-w-0 md:min-w-0 border-t md:border-t-0 md:border-x border-dark-700 flex flex-col ${!activeScreenStream && !sharedContent ? "hidden md:flex" : ""}`}>
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

        {/* Right column: chat panel (25%), hidden on mobile, toggle via button */}
        <div className="md:w-1/4 w-full min-w-0 md:min-w-0 border-t md:border-t-0 border-dark-700 flex flex-col hidden md:flex">
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

      {/* Mobile chat overlay */}
      {showMobileChat && (
        <div className="md:hidden fixed inset-0 z-50 bg-dark-950/95 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-dark-700">
            <span className="text-white text-sm font-medium">聊天与投票</span>
            <button
              onClick={() => setShowMobileChat(false)}
              className="text-dark-400 hover:text-white text-sm px-2 py-1"
            >
              关闭
            </button>
          </div>
          <div className="flex-1 min-h-0">
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
      )}

      {/* Emoji reactions overlay */}
      <EmojiReactions events={emojiEvents} />

      {/* Poll browser modal */}
      {showPollBrowser && (
        <PollBrowserModal polls={polls} onClose={() => setShowPollBrowser(false)} />
      )}

      {/* Contacts modal */}
      {showContacts && (
        <ContactList roomId={roomId || ""} onClose={() => setShowContacts(false)} />
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
          isListener={isListener}
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

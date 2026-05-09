import { useRef, useCallback, useState } from "react";
import { ICE_SERVERS } from "../utils/constants";

interface PeerConnection {
  pc: RTCPeerConnection;
  stream?: MediaStream;
}

export function useWebRTC() {
  // Some mobile browsers don't support { exact: true } audio constraints
  async function getAudioStream() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { exact: true },
          noiseSuppression: { exact: true },
          autoGainControl: { exact: true },
        },
      });
    } catch {
      // Fallback: without exact
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    }
  }

  const peerConnections = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Map<string, MediaStream>
  >(new Map());

  // Buffer ICE candidates that arrive before the PC is created
  const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Original camera track (for beauty filter restore)
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  // Screen share state
  const mainStreamIdPerPeerRef = useRef<Map<string, string>>(new Map());
  const screenSenders = useRef<Map<string, RTCRtpSender>>(new Map());
  const screenAudioSenders = useRef<Map<string, RTCRtpSender>>(new Map());
  const screenShareStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [screenShareStreams, setScreenShareStreams] = useState<
    Map<string, MediaStream>
  >(new Map());
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const stopScreenShareRef = useRef<(() => void) | null>(null);
  // Mobile: must release ALL tracks to free mic for STT (video keeps mic alive on some devices)
  const isMobileRef = useRef(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  const savedVideoForSttRef = useRef<MediaStreamTrack | null>(null);
  const hadVideoForSttRef = useRef(false);

  // Track per-peer disconnection timers for graceful recovery
  const disconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  function cleanupPeer(peerId: string) {
    const existing = disconnectTimers.current.get(peerId);
    if (existing) {
      clearTimeout(existing);
      disconnectTimers.current.delete(peerId);
    }
    peerConnections.current.delete(peerId);
    pendingIceCandidates.current.delete(peerId);
    mainStreamIdPerPeerRef.current.delete(peerId);
    screenShareStreamsRef.current.delete(peerId);
    screenSenders.current.delete(peerId);
    screenAudioSenders.current.delete(peerId);
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setScreenShareStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }

  const startLocalStream = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: { exact: true },
        noiseSuppression: { exact: true },
        autoGainControl: { exact: true },
      },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const vt = stream.getVideoTracks()[0];
      if (vt) originalVideoTrackRef.current = vt;
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      // Retry without video if camera fails
      console.warn("Failed to get camera, retrying with audio only:", err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (audioErr) {
        console.error("Failed to get any media:", audioErr);
        throw audioErr;
      }
    }
  }, []);

  const createPeerConnection = useCallback(
    (
      peerId: string,
      stream: MediaStream,
      onIceCandidate: (peerId: string, candidate: RTCIceCandidate) => void,
      onTrack: (peerId: string, stream: MediaStream) => void,
      onConnectionState: (peerId: string, state: RTCPeerConnectionState) => void
    ): RTCPeerConnection => {
      // Close existing connection if any
      const existing = peerConnections.current.get(peerId);
      if (existing) {
        existing.pc.close();
        // Clear pending disconnect timer so stale cleanup doesn't fire
        const timer = disconnectTimers.current.get(peerId);
        if (timer) {
          clearTimeout(timer);
          disconnectTimers.current.delete(peerId);
        }
        peerConnections.current.delete(peerId);
        pendingIceCandidates.current.delete(peerId);
        mainStreamIdPerPeerRef.current.delete(peerId);
        screenShareStreamsRef.current.delete(peerId);
        screenSenders.current.delete(peerId);
        screenAudioSenders.current.delete(peerId);
      }

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });

      // Add local tracks — use ref for latest track state
      // so freshly-joined peers get the beauty-processed video track
      const trackSource = localStreamRef.current || stream;
      trackSource.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Prefer H.264 video codec for better compatibility across devices
      const videoTransceiver = pc.getTransceivers().find((t) => t.kind === "video");
      if (videoTransceiver) {
        const caps = RTCRtpReceiver.getCapabilities("video");
        if (caps) {
          const h264 = caps.codecs.filter((c) =>
            c.mimeType.toLowerCase().includes("h264")
          );
          if (h264.length > 0) videoTransceiver.setCodecPreferences(h264);
        }
      }

      // If screen sharing is active, also add screen tracks for this new peer
      if (localScreenStreamRef.current) {
        const screenTrack = localScreenStreamRef.current.getVideoTracks()[0];
        const screenAudioTrack = localScreenStreamRef.current.getAudioTracks()[0];
        if (screenTrack) {
          const screenStream = new MediaStream([screenTrack]);
          const sender = pc.addTrack(screenTrack, screenStream);
          if (sender) screenSenders.current.set(peerId, sender);
          if (screenAudioTrack) {
            const audioSender = pc.addTrack(screenAudioTrack, screenStream);
            if (audioSender) screenAudioSenders.current.set(peerId, audioSender);
          }
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          onIceCandidate(peerId, event.candidate);
        }
      };

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        const streamId = remoteStream.id;
        const mainId = mainStreamIdPerPeerRef.current.get(peerId);

        if (!mainId) {
          // First stream for this peer — store as main (camera+audio) stream
          mainStreamIdPerPeerRef.current.set(peerId, streamId);
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.set(peerId, remoteStream);
            return next;
          });
          onTrack(peerId, remoteStream);
        } else if (streamId !== mainId) {
          // Different stream ID — this is a screen share track
          screenShareStreamsRef.current.set(peerId, remoteStream);
          setScreenShareStreams(new Map(screenShareStreamsRef.current));
        } else {
          // Same stream ID (renegotiation or additional track) — update existing
          setRemoteStreams((prev) => {
            const next = new Map(prev);
            next.set(peerId, remoteStream);
            return next;
          });
          onTrack(peerId, remoteStream);
        }
      };

      pc.onconnectionstatechange = () => {
        onConnectionState(peerId, pc.connectionState);

        if (pc.connectionState === "disconnected") {
          // Disconnected is often transient (network blip, mobile handoff).
          // Wait 4s before cleaning up — the PC might reconnect on its own.
          const existing = disconnectTimers.current.get(peerId);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            if (pc.connectionState !== "connected") {
              cleanupPeer(peerId);
            }
            disconnectTimers.current.delete(peerId);
          }, 4000);
          disconnectTimers.current.set(peerId, timer);
        } else if (pc.connectionState === "failed") {
          // Failed is permanent — clean up immediately
          const existing = disconnectTimers.current.get(peerId);
          if (existing) clearTimeout(existing);
          cleanupPeer(peerId);
        } else if (pc.connectionState === "connected") {
          // Recovered — cancel pending disconnect
          const existing = disconnectTimers.current.get(peerId);
          if (existing) {
            clearTimeout(existing);
            disconnectTimers.current.delete(peerId);
          }
        }
      };

      peerConnections.current.set(peerId, { pc });

      // Drain any ICE candidates that arrived before the PC was created
      const pending = pendingIceCandidates.current.get(peerId);
      if (pending) {
        pendingIceCandidates.current.delete(peerId);
        for (const candidate of pending) {
          pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        }
      }

      return pc;
    },
    []
  );

  const addScreenTrack = useCallback((screenStream: MediaStream) => {
    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) return;
    const screenAudioTrack = screenStream.getAudioTracks()[0];

    peerConnections.current.forEach(({ pc }, peerId) => {
      if (screenSenders.current.has(peerId)) return;
      try {
        const screenMediaStream = new MediaStream([screenTrack]);
        const sender = pc.addTrack(screenTrack, screenMediaStream);
        if (sender) screenSenders.current.set(peerId, sender);
        if (screenAudioTrack && !screenAudioSenders.current.has(peerId)) {
          const audioSender = pc.addTrack(screenAudioTrack, screenMediaStream);
          if (audioSender) screenAudioSenders.current.set(peerId, audioSender);
        }
      } catch (err) {
        console.warn(`Failed to add screen track to peer ${peerId}:`, err);
      }
    });
  }, []);

  const startScreenShare = useCallback(async (includeAudio?: boolean) => {
    const wantsAudio = includeAudio !== false;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        ...(wantsAudio && {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          systemAudio: "include",
          suppressLocalAudioPlayback: false,
        }),
      });

      localScreenStreamRef.current = screenStream;
      try {
        addScreenTrack(screenStream);
      } catch (trackErr) {
        console.error("addScreenTrack error:", trackErr);
      }
      setLocalScreenStream(screenStream);

      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShareRef.current?.();
      };

      return screenStream;
    } catch (err) {
      console.error("Screen share failed:", err);
      throw err;
    }
  }, [addScreenTrack]);

  const stopScreenShare = useCallback(() => {
    // Stop all screen tracks in peer connections
    peerConnections.current.forEach(({ pc }, peerId) => {
      const sender = screenSenders.current.get(peerId);
      if (sender && sender.track) {
        sender.track.stop();
      }
      const audioSender = screenAudioSenders.current.get(peerId);
      if (audioSender && audioSender.track) {
        audioSender.track.stop();
      }
    });
    screenSenders.current.clear();
    screenAudioSenders.current.clear();

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
  }, []);

  // Set ref so onended handler always calls latest stopScreenShare
  stopScreenShareRef.current = stopScreenShare;

  const clearScreenShareStream = useCallback((peerId: string) => {
    screenShareStreamsRef.current.delete(peerId);
    setScreenShareStreams(new Map(screenShareStreamsRef.current));
  }, []);

  const toggleAudio = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        try {
          const newStream = await getAudioStream();
          const track = newStream.getAudioTracks()[0];
          const s = localStreamRef.current;
          if (s) {
            s.getAudioTracks().forEach((t) => {
              t.stop();
              s.removeTrack(t);
            });
            s.addTrack(track);
          } else {
            localStreamRef.current = newStream;
          }
          track.enabled = true;
          peerConnections.current.forEach(({ pc }) => {
            const sender = pc.getTransceivers().find(t => t.kind === "audio")?.sender;
            if (sender) sender.replaceTrack(track).catch(() => {});
          });
        } catch (err) {
          console.warn("Failed to get new audio track:", err);
        }
      } else {
        peerConnections.current.forEach(({ pc }) => {
          const sender = pc.getTransceivers().find(t => t.kind === "audio")?.sender;
          if (sender) sender.replaceTrack(null).catch(() => {});
        });
      }
    },
    []
  );

  /** Release the WebRTC mic so SpeechRecognition can access it */
  const stopAudioTrackForStt = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    if (isMobileRef.current) {
      // Mobile: stopping only audio is NOT enough — the video track from the
      // same getUserMedia keeps the mic session alive (observed on Huawei).
      // Save camera state and release ALL tracks.
      const videoTrack = stream.getVideoTracks()[0];
      hadVideoForSttRef.current = !!videoTrack;
      savedVideoForSttRef.current = videoTrack || null;

      stream.getTracks().forEach((t) => {
        t.enabled = false;
        t.stop();
      });

      // Null all peer senders so remote peers know we stopped sending
      peerConnections.current.forEach(({ pc }) => {
        pc.getSenders().forEach((sender) => {
          sender.replaceTrack(null).catch(() => {});
        });
      });

      localStreamRef.current = null;
      setLocalStream(null);
    } else {
      // Desktop: stopping just the audio tracks is sufficient
      stream.getAudioTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
      peerConnections.current.forEach(({ pc }) => {
        const sender = pc.getTransceivers().find(t => t.kind === "audio")?.sender;
        if (sender) {
          sender.replaceTrack(null).catch(() => {});
        }
      });
      setLocalStream(new MediaStream(stream.getTracks()));
    }
  }, []);

  /** Recreate media tracks after STT finishes */
  const restartAudioTrackForStt = useCallback(async () => {
    try {
      if (isMobileRef.current) {
        // Mobile: re-acquire everything that was released for STT
        const constraints: MediaStreamConstraints = { audio: true };
        if (hadVideoForSttRef.current) {
          constraints.video = {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          };
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;

        // Re-add tracks to peer connections
        peerConnections.current.forEach(({ pc }) => {
          stream.getTracks().forEach((track) => {
            const sender = pc.getTransceivers().find(t => t.kind === track.kind)?.sender;
            if (sender) {
              sender.replaceTrack(track).catch(() => {});
            } else {
              pc.addTrack(track, stream);
            }
          });
        });

        setLocalStream(stream);
        savedVideoForSttRef.current = null;
        hadVideoForSttRef.current = false;
      } else {
        // Desktop: add audio back to the existing stream (video never stopped)
        const newStream = await getAudioStream();
        const newTrack = newStream.getAudioTracks()[0];
        let stream = localStreamRef.current;
        if (stream) {
          stream.addTrack(newTrack);
        } else {
          stream = new MediaStream([newTrack]);
          localStreamRef.current = stream;
        }
        peerConnections.current.forEach(({ pc }) => {
          const sender = pc.getTransceivers().find(t => t.kind === "audio")?.sender;
          if (sender) {
            sender.replaceTrack(newTrack).catch(() => {});
          }
        });
        setLocalStream(new MediaStream(stream.getTracks()));
      }
    } catch (err) {
      console.warn("Failed to restart media after STT:", err);
    }
  }, []);

  const toggleVideo = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: "user",
            },
          });
          const track = newStream.getVideoTracks()[0];
          const s = localStreamRef.current;
          if (s) {
            s.getVideoTracks().forEach((t) => {
              t.stop();
              s.removeTrack(t);
            });
            s.addTrack(track);
            setLocalStream(new MediaStream(s.getTracks()));
          } else {
            localStreamRef.current = newStream;
            setLocalStream(newStream);
          }
          track.enabled = true;
          setPeerVideoTrack(track);
        } catch (err) {
          console.warn("Failed to get new video track:", err);
        }
      } else {
        setPeerVideoTrack(null);
      }
    },
    []
  );

  /** Replace the video track on all peer connections */
  function setPeerVideoTrack(track: MediaStreamTrack | null) {
    peerConnections.current.forEach(({ pc }) => {
      const sender = pc.getTransceivers().find(t => t.kind === "video")?.sender;
      if (sender) sender.replaceTrack(track).catch(() => {});
    });
  }

  /** Replace the video track in all peer connections (used by beauty filter).
   *  Does NOT update localStream — doing so would create a feedback loop:
   *  replaceVideoTrack → setLocalStream → useBeautyFilter restarts → replaceVideoTrack → …
   *  VideoGrid uses `beautyStream ?? localStream` so display is covered. */
  const replaceVideoTrack = useCallback((track: MediaStreamTrack | null) => {
    setPeerVideoTrack(track);
    // Keep localStreamRef in sync for downstream code that reads it directly
    const s = localStreamRef.current;
    if (s) {
      const old = s.getVideoTracks()[0];
      if (track && old !== track) {
        if (old) s.removeTrack(old);
        s.addTrack(track);
      } else if (!track && old) {
        const orig = originalVideoTrackRef.current;
        if (orig && orig !== old) {
          s.removeTrack(old);
          s.addTrack(orig);
        }
      }
    }
  }, []);

  const createOffer = useCallback(
    async (peerId: string) => {
      const entry = peerConnections.current.get(peerId);
      if (!entry) return null;
      const pc = entry.pc;

      try {
        if (pc.signalingState !== "stable") {
          console.warn(`createOffer skipped: ${peerId} in state ${pc.signalingState}`);
          return null;
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return offer;
      } catch (err) {
        console.warn(`createOffer failed for ${peerId}:`, err);
        return null;
      }
    },
    []
  );

  const handleOffer = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit) => {
      const entry = peerConnections.current.get(peerId);
      if (!entry) return null;
      const pc = entry.pc;

      try {
        // Polite peer: rollback if we have a local offer pending (glare)
        if (pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return answer;
      } catch (err) {
        console.warn(`handleOffer failed for ${peerId}:`, err);
        return null;
      }
    },
    []
  );

  const handleAnswer = useCallback(
    async (peerId: string, answer: RTCSessionDescriptionInit) => {
      const entry = peerConnections.current.get(peerId);
      if (!entry) return;
      const pc = entry.pc;

      try {
        if (pc.signalingState !== "have-local-offer") {
          console.warn(`Ignored answer for ${peerId} (state: ${pc.signalingState})`);
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.warn(`handleAnswer failed for ${peerId}:`, err);
      }
    },
    []
  );

  const addIceCandidate = useCallback(
    async (peerId: string, candidate: RTCIceCandidateInit) => {
      const pc = peerConnections.current.get(peerId)?.pc;
      if (!pc) {
        // PC not yet created — buffer the candidate so it's applied later
        const buf = pendingIceCandidates.current.get(peerId) || [];
        buf.push(candidate);
        pendingIceCandidates.current.set(peerId, buf);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Ignore errors from closed connections or stale candidates
        if (pc.connectionState !== "closed") {
          console.warn("Failed to add ICE candidate:", err);
        }
      }
    },
    []
  );

  const cleanupAll = useCallback(() => {
    peerConnections.current.forEach(({ pc }) => pc.close());
    peerConnections.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
    }
    pendingIceCandidates.current.clear();
    screenSenders.current.clear();
    mainStreamIdPerPeerRef.current.clear();
    screenShareStreamsRef.current.clear();
    setLocalStream(null);
    setRemoteStreams(new Map());
    setScreenShareStreams(new Map());
    setLocalScreenStream(null);
  }, []);

  return {
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
    stopAudioTrackForStt,
    restartAudioTrackForStt,
    replaceVideoTrack,
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    cleanupAll,
  };
}

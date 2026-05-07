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

  const startLocalStream = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: { exact: true },
        noiseSuppression: { exact: true },
        autoGainControl: { exact: true },
      },
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
        peerConnections.current.delete(peerId);
        pendingIceCandidates.current.delete(peerId);
        mainStreamIdPerPeerRef.current.delete(peerId);
        screenShareStreamsRef.current.delete(peerId);
        screenSenders.current.delete(peerId);
        screenAudioSenders.current.delete(peerId);
      }

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 5,
      });

      // Add local tracks (camera + audio)
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // If screen sharing is active, also add screen tracks for this new peer
      if (localScreenStreamRef.current) {
        const screenTrack = localScreenStreamRef.current.getVideoTracks()[0];
        const screenAudioTrack = localScreenStreamRef.current.getAudioTracks()[0];
        if (screenTrack) {
          // Use ONE stream for both video + audio so remote side gets a single
          // stream with both tracks (same streamId -> same screenShareStreams entry)
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
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
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
          screenShareStreamsRef.current.delete(peerId);
          screenSenders.current.delete(peerId);
          mainStreamIdPerPeerRef.current.delete(peerId);
          peerConnections.current.delete(peerId);
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
        // One stream for both video + audio so remote side gets a single stream
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
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15 },
        },
        audio: includeAudio ?? true,
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

      stream.getTracks().forEach((t) => t.stop());

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
          peerConnections.current.forEach(({ pc }) => {
            const sender = pc.getTransceivers().find(t => t.kind === "video")?.sender;
            if (sender) sender.replaceTrack(track).catch(() => {});
          });
        } catch (err) {
          console.warn("Failed to get new video track:", err);
        }
      } else {
        peerConnections.current.forEach(({ pc }) => {
          const sender = pc.getTransceivers().find(t => t.kind === "video")?.sender;
          if (sender) sender.replaceTrack(null).catch(() => {});
        });
      }
    },
    []
  );

  const createOffer = useCallback(
    async (peerId: string) => {
      const pc = peerConnections.current.get(peerId)?.pc;
      if (!pc) return null;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    },
    []
  );

  const handleOffer = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit) => {
      const pc = peerConnections.current.get(peerId)?.pc;
      if (!pc) return null;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    },
    []
  );

  const handleAnswer = useCallback(
    async (peerId: string, answer: RTCSessionDescriptionInit) => {
      const pc = peerConnections.current.get(peerId)?.pc;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
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
        console.error("Failed to add ICE candidate:", err);
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
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    cleanupAll,
  };
}

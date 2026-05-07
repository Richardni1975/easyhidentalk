import { useRef, useCallback, useState } from "react";
import { ICE_SERVERS } from "../utils/constants";

interface PeerConnection {
  pc: RTCPeerConnection;
  stream?: MediaStream;
}

export function useWebRTC() {
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
  const screenShareStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [screenShareStreams, setScreenShareStreams] = useState<
    Map<string, MediaStream>
  >(new Map());
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const stopScreenShareRef = useRef<(() => void) | null>(null);

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
      }

      const pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 5,
      });

      // Add local tracks (camera + audio)
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // If screen sharing is active, also add screen track for this new peer
      if (localScreenStreamRef.current) {
        const screenTrack = localScreenStreamRef.current.getVideoTracks()[0];
        if (screenTrack) {
          const screenStream = new MediaStream([screenTrack]);
          const sender = pc.addTrack(screenTrack, screenStream);
          if (sender) {
            screenSenders.current.set(peerId, sender);
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

    peerConnections.current.forEach(({ pc }, peerId) => {
      if (screenSenders.current.has(peerId)) return;
      try {
        const screenMediaStream = new MediaStream([screenTrack]);
        const sender = pc.addTrack(screenTrack, screenMediaStream);
        if (sender) {
          screenSenders.current.set(peerId, sender);
        }
      } catch (err) {
        console.warn(`Failed to add screen track to peer ${peerId}:`, err);
      }
    });
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15 },
        },
        audio: false,
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
    });
    screenSenders.current.clear();

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
          const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: { exact: true },
              noiseSuppression: { exact: true },
              autoGainControl: { exact: true },
            },
          });
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
            const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
            if (sender) sender.replaceTrack(track).catch(() => {});
          });
        } catch (err) {
          console.warn("Failed to get new audio track:", err);
        }
      } else {
        peerConnections.current.forEach(({ pc }) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) sender.replaceTrack(null).catch(() => {});
        });
      }
    },
    []
  );

  /** Fully stop the audio track so the mic is released (needed for STT on mobile) */
  const stopAudioTrackForStt = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.stop();
      stream.removeTrack(track);
    });
    // Tell all peers we're not sending audio anymore
    peerConnections.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) {
        sender.replaceTrack(null).catch(() => {});
      }
    });
  }, []);

  /** Recreate the audio track after STT finishes */
  const restartAudioTrackForStt = useCallback(async () => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { exact: true },
          noiseSuppression: { exact: true },
          autoGainControl: { exact: true },
        },
      });
      const newTrack = newStream.getAudioTracks()[0];
      const stream = localStreamRef.current;
      if (stream) {
        stream.addTrack(newTrack);
        peerConnections.current.forEach(({ pc }) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) {
            sender.replaceTrack(newTrack).catch(() => {});
          }
        });
        // Update the React state so the UI picks up the new stream
        setLocalStream(new MediaStream(stream.getTracks()));
      }
      return newTrack;
    } catch (err) {
      console.warn("Failed to restart audio after STT:", err);
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
            const sender = pc.getSenders().find((s) => s.track?.kind === "video");
            if (sender) sender.replaceTrack(track).catch(() => {});
          });
        } catch (err) {
          console.warn("Failed to get new video track:", err);
        }
      } else {
        peerConnections.current.forEach(({ pc }) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
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

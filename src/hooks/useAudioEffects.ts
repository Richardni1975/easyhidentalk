import { useRef, useCallback } from "react";
import { PITCH_SHIFT_RATIO } from "../utils/constants";

export function useAudioEffects() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);

  const createPitchShiftedStream = useCallback(
    async (originalStream: MediaStream): Promise<MediaStream> => {
      // If already set up, just return the existing processed stream
      if (processedStreamRef.current) {
        return processedStreamRef.current;
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Load AudioWorklet module
      await audioContext.audioWorklet.addModule("/pitch-shifter-worklet.js");

      // Clone the audio track so AudioContext doesn't consume the original
      // (keeps original available for SpeechRecognition / STT)
      const originalTrack = originalStream.getAudioTracks()[0];
      const clonedTrack = originalTrack?.clone();
      const clonedStream = clonedTrack ? new MediaStream([clonedTrack]) : originalStream;

      const source = audioContext.createMediaStreamSource(clonedStream);
      sourceRef.current = source;

      const workletNode = new AudioWorkletNode(audioContext, "pitch-shifter-processor");
      workletNode.port.postMessage({ pitchRatio: 1.35, enabled: true });
      workletNodeRef.current = workletNode;

      const destination = audioContext.createMediaStreamDestination();
      destRef.current = destination;

      source.connect(workletNode);
      workletNode.connect(destination);

      processedStreamRef.current = destination.stream;
      return destination.stream;
    },
    []
  );

  const setPitchEnabled = useCallback((enabled: boolean) => {
    workletNodeRef.current?.port.postMessage({ enabled });
  }, []);

  const updatePitchRatio = useCallback((ratio: number) => {
    workletNodeRef.current?.port.postMessage({ pitchRatio: ratio });
  }, []);

  const cleanup = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (destRef.current) {
      destRef.current = null;
    }
    processedStreamRef.current = null;
  }, []);

  return { createPitchShiftedStream, setPitchEnabled, updatePitchRatio, cleanup };
}

import { useRef, useCallback, useState, useEffect } from "react";
import { BeautyPipeline, type BeautyParams } from "../utils/beautyPipeline";

export interface UseBeautyFilterOptions {
  /** Callback to replace the video track in all peer connections + localStream */
  replaceVideoTrack: (track: MediaStreamTrack | null) => void;
  /** Width of the processed canvas (smaller = faster) */
  width?: number;
  /** Height of the processed canvas */
  height?: number;
}

export function useBeautyFilter(
  rawStream: MediaStream | null,
  options: UseBeautyFilterOptions
) {
  const { replaceVideoTrack, width = 640, height = 480 } = options;
  const pipelineRef = useRef<BeautyPipeline | null>(null);
  const originalTrackRef = useRef<MediaStreamTrack | null>(null);
  const [isBeautyOn, setIsBeautyOn] = useState(false);
  const [beautyStream, setBeautyStream] = useState<MediaStream | null>(null);

  // Store original video track when rawStream appears
  useEffect(() => {
    if (rawStream) {
      const vt = rawStream.getVideoTracks()[0];
      if (vt) originalTrackRef.current = vt;
    }
  }, [rawStream]);

  // Save stream in ref so toggle callback isn't stale
  const rawStreamRef = useRef(rawStream);
  rawStreamRef.current = rawStream;

  const toggleBeauty = useCallback(() => {
    setIsBeautyOn((prev) => {
      if (prev) {
        // ── Turn OFF ──
        if (pipelineRef.current) {
          pipelineRef.current.stop();
          pipelineRef.current.destroy();
          pipelineRef.current = null;
        }
        setBeautyStream(null);
        // Restore original track
        replaceVideoTrack(null);
      } else {
        // ── Turn ON ──
        const stream = rawStreamRef.current;
        if (!stream) return prev;
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return prev;

        const pipeline = new BeautyPipeline(stream, width, height);
        const out = pipeline.start();
        if (!out) {
          // WebGL2 not available
          pipeline.destroy();
          return prev;
        }

        pipelineRef.current = pipeline;
        setBeautyStream(out);

        // Replace video track in peer connections with beauty track
        const beautyTrack = out.getVideoTracks()[0];
        if (beautyTrack) {
          replaceVideoTrack(beautyTrack);
        }
      }
      return !prev;
    });
  }, [replaceVideoTrack, width, height]);

  const updateBeautyParams = useCallback((p: Partial<BeautyParams>) => {
    pipelineRef.current?.updateParams(p);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
        pipelineRef.current.destroy();
        pipelineRef.current = null;
      }
    };
  }, []);

  return { beautyStream, isBeautyOn, toggleBeauty, updateBeautyParams };
}

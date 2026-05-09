import { useRef, useCallback, useEffect, useState } from "react";
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
  const [beautyStream, setBeautyStream] = useState<MediaStream | null>(null);
  const replaceTrackRef = useRef(replaceVideoTrack);
  replaceTrackRef.current = replaceVideoTrack;

  // Effect 1: Pipeline lifecycle — reacts to rawStream changes (camera on/off)
  useEffect(() => {
    if (!rawStream) return;

    const videoTrack = rawStream.getVideoTracks()[0];
    if (!videoTrack) return;

    let destroyed = false;

    try {
      const pipeline = new BeautyPipeline(rawStream, width, height);
      const out = pipeline.start();
      if (!out) {
        pipeline.destroy();
        return;
      }

      pipelineRef.current = pipeline;
      setBeautyStream(out);
    } catch (e) {
      console.warn("Beauty pipeline failed to start:", e);
      return;
    }

    return () => {
      destroyed = true;
      if (pipelineRef.current) {
        pipelineRef.current.stop();
        pipelineRef.current.destroy();
        pipelineRef.current = null;
      }
      setBeautyStream(null);
    };
  }, [rawStream, width, height]);

  // Effect 2: Track replacement — runs when beautyStream resolves/updates.
  // Separated from Effect 1 so that calling replaceVideoTrack (which may
  // indirectly update localStream) does NOT re-trigger pipeline creation.
  useEffect(() => {
    if (beautyStream) {
      const track = beautyStream.getVideoTracks()[0];
      if (track) {
        replaceTrackRef.current(track);
      }
    }
  }, [beautyStream]);

  const updateBeautyParams = useCallback((p: Partial<BeautyParams>) => {
    pipelineRef.current?.updateParams(p);
  }, []);

  return { beautyStream, updateBeautyParams };
}

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

  // Auto-start pipeline when rawStream appears, auto-stop when it changes
  useEffect(() => {
    if (!rawStream) return;

    const videoTrack = rawStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const pipeline = new BeautyPipeline(rawStream, width, height);
    const out = pipeline.start();
    if (!out) {
      pipeline.destroy();
      return;
    }

    pipelineRef.current = pipeline;
    setBeautyStream(out);

    const beautyTrack = out.getVideoTracks()[0];
    if (beautyTrack) {
      replaceVideoTrack(beautyTrack);
    }

    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.stop();
        pipelineRef.current.destroy();
        pipelineRef.current = null;
      }
      setBeautyStream(null);
    };
  }, [rawStream, replaceVideoTrack, width, height]);

  const updateBeautyParams = useCallback((p: Partial<BeautyParams>) => {
    pipelineRef.current?.updateParams(p);
  }, []);

  return { beautyStream, updateBeautyParams };
}

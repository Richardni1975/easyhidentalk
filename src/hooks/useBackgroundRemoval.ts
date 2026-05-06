import { useRef, useCallback, useState, useEffect } from "react";

export type BgEffect = "off" | "remove" | "blur" | "image";

// Module-level singleton — prevent multiple model loads across components
let sharedSegmenter: any = null;
let sharedLoading: Promise<any> | null = null;

async function loadSegmenter() {
  const { FilesetResolver, SelfieSegmenter } = await import(
    "@mediapipe/tasks-vision"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );
  return SelfieSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/selfie_segmenter/selfie_segmenter_landscape/float32/latest/selfie_segmenter_landscape.tflite",
      delegate: "GPU",
    },
    runningMode: "video",
  });
}

async function getSegmenter() {
  if (sharedSegmenter) return sharedSegmenter;
  if (!sharedLoading) {
    sharedLoading = loadSegmenter().then((seg) => {
      sharedSegmenter = seg;
      return seg;
    });
  }
  return sharedLoading;
}

export function useBackgroundRemoval() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animFrameRef = useRef(0);
  const skipFrameRef = useRef(false);
  const processRef = useRef(false);

  // Refs held so the rAF loop can read latest values
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Virtual‑background config (mutable ref, no re‑render needed inside loop)
  const effectRef = useRef<BgEffect>("remove");
  const bgColorRef = useRef("#1a1a2e");
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const blurStrengthRef = useRef(15);

  const ensureModel = useCallback(async () => {
    if (ready || loading) return;
    setLoading(true);
    setError(null);
    try {
      await getSegmenter();
      setReady(true);
    } catch (err: any) {
      setError(err?.message || "Model load failed");
    } finally {
      setLoading(false);
    }
  }, [ready, loading]);

  /** Call from outside to change the background effect while processing */
  const updateConfig = useCallback(
    (effect: BgEffect, colorOrImage?: string | HTMLImageElement, blurStrength?: number) => {
      effectRef.current = effect;
      if (effect === "color" && typeof colorOrImage === "string") {
        bgColorRef.current = colorOrImage;
      }
      if (effect === "image" && colorOrImage instanceof HTMLImageElement) {
        bgImageRef.current = colorOrImage;
      }
      if (effect === "blur") {
        // Allow override, else keep default
        blurStrengthRef.current = blurStrength ?? 15;
      }
      // If effect is "off", the processing loop will skip rendering
    },
    []
  );

  const processFrame = useCallback(() => {
    if (!processRef.current || !sharedSegmenter) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // When effect is "off" we can still run the loop (so we can turn it back on)
    // but we skip expensive rendering
    const effect = effectRef.current;

    // Skip every other frame for performance
    skipFrameRef.current = !skipFrameRef.current;
    if (skipFrameRef.current) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (vw === 0 || vh === 0) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    try {
      const results = sharedSegmenter.segmentForVideo(video, performance.now());
      const maskData = results.confidenceMask.getAsFloat32Array();
      const maskLen = maskData.length;

      // ── Draw background layer ──
      if (effect === "blur") {
        if (!offscreenRef.current)
          offscreenRef.current = document.createElement("canvas");
        const off = offscreenRef.current;
        if (off.width !== vw || off.height !== vh) {
          off.width = vw;
          off.height = vh;
        }
        const offCtx = off.getContext("2d")!;
        offCtx.filter = `blur(${blurStrengthRef.current}px)`;
        offCtx.drawImage(video, 0, 0, vw, vh);
        offCtx.filter = "none";
        ctx.drawImage(off, 0, 0, vw, vh);
      } else if (effect === "image" && bgImageRef.current) {
        ctx.drawImage(bgImageRef.current, 0, 0, vw, vh);
      } else {
        // "remove" or fallback — solid color background
        ctx.fillStyle = bgColorRef.current;
        ctx.fillRect(0, 0, vw, vh);
      }

      // ── Draw video foreground ──
      ctx.drawImage(video, 0, 0, vw, vh);

      // ── Apply segmentation mask (background → transparent) ──
      const imageData = ctx.getImageData(0, 0, vw, vh);
      const pixels = imageData.data;

      if (maskLen === vw * vh) {
        // 1:1 mask
        for (let i = 0; i < maskLen; i++) {
          if (maskData[i] < 0.5) {
            pixels[i * 4 + 3] = 0;
          }
        }
      } else {
        // Scaled mask (e.g. 256×256 output)
        const maskDim = Math.round(Math.sqrt(maskLen));
        const sx = maskDim / vw;
        const sy = maskDim / vh;
        for (let y = 0; y < vh; y++) {
          const my = Math.min(Math.floor(y * sy), maskDim - 1);
          const rowOff = y * vw * 4;
          for (let x = 0; x < vw; x++) {
            const mx = Math.min(Math.floor(x * sx), maskDim - 1);
            if (maskData[my * maskDim + mx] < 0.5) {
              pixels[rowOff + x * 4 + 3] = 0;
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    } catch {
      // skip errored frames
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, []);

  const start = useCallback(
    (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
      videoRef.current = video;
      canvasRef.current = canvas;
      processRef.current = true;
      skipFrameRef.current = false;
      animFrameRef.current = requestAnimationFrame(processFrame);
    },
    [processFrame]
  );

  const stop = useCallback(() => {
    processRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    return () => {
      processRef.current = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return { ensureModel, start, stop, updateConfig, ready, loading, error };
}

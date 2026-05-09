export interface BeautyParams {
  /** Impression strength 0-1: 0 = no effect, 1 = maximum painterly blur */
  intensity: number;
  /** Color vibrance 0-1: enhances saturation for oil-painting feel */
  vibrance: number;
}

const DEFAULT_PARAMS: BeautyParams = {
  intensity: 0.6,
  vibrance: 0.3,
};

export class BeautyPipeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D | null = null;
  private inputStream: MediaStream | null = null;
  private outputStream: MediaStream | null = null;
  private inputVideo: HTMLVideoElement;
  private animFrameId = 0;
  private running = false;
  private lastFrameTime = 0;
  private params: BeautyParams;
  private width: number;
  private height: number;

  constructor(inputStream: MediaStream, width = 640, height = 480) {
    this.params = { ...DEFAULT_PARAMS };
    this.width = width;
    this.height = height;
    this.inputStream = inputStream;

    // Hidden video element to feed frames (no DOM append needed)
    this.inputVideo = document.createElement("video");
    this.inputVideo.srcObject = inputStream;
    this.inputVideo.playsInline = true;
    this.inputVideo.muted = true;
    this.inputVideo.setAttribute("playsinline", "");

    // Main canvas (will be captured) — no DOM append needed
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    this.canvas = c;

    // Offscreen canvas for the low-res intermediate — no DOM append needed
    this.offscreen = document.createElement("canvas");
  }

  start(): MediaStream | null {
    const ctx = this.canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return null;
    this.ctx = ctx;

    const offCtx = this.offscreen.getContext("2d", { alpha: false });
    if (!offCtx) return null;
    this.offCtx = offCtx;

    this.inputVideo.play().catch(() => {});

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cs = (this.canvas as any).captureStream(20) as MediaStream;
      this.outputStream = cs;
    } catch (e) {
      console.warn("Paint filter: captureStream not supported", e);
      this.destroy();
      return null;
    }

    this.running = true;
    this.tick();
    return this.outputStream;
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    if (this.outputStream) {
      this.outputStream.getTracks().forEach((t) => t.stop());
      this.outputStream = null;
    }
    this.inputVideo.pause();
  }

  updateParams(p: Partial<BeautyParams>): void {
    Object.assign(this.params, p);
  }

  getParams(): BeautyParams {
    return { ...this.params };
  }

  // ── Per-frame render ──────────────────────────────────────────────────
  private tick = (now: number): void => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.tick);

    const elapsed = now - this.lastFrameTime;
    if (elapsed < 50) return; // ~20fps
    this.lastFrameTime = now;

    const v = this.inputVideo;
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return;

    try {
      this.renderFrame(v);
    } catch (e) {
      // skip unrenderable frames
    }
  };

  private renderFrame(video: HTMLVideoElement): void {
    const { intensity, vibrance } = this.params;
    const ctx = this.ctx!;
    const offCtx = this.offCtx!;

    // Use actual video dimensions to preserve aspect ratio
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    // Match canvas to video aspect ratio (resize only when needed)
    if (this.canvas.width !== vw || this.canvas.height !== vh) {
      this.canvas.width = vw;
      this.canvas.height = vh;
    }

    // How much to downscale: at intensity=1 → 1/4 resolution, at intensity=0 → 1/1
    const scale = 1 / (1 + intensity * 3); // 1× to 4× reduction
    const lw = Math.max(1, Math.round(vw * scale));
    const lh = Math.max(1, Math.round(vh * scale));

    // Set offscreen size to low resolution
    if (this.offscreen.width !== lw || this.offscreen.height !== lh) {
      this.offscreen.width = lw;
      this.offscreen.height = lh;
    }

    // Step 1: Smooth downscale → bilinear interpolation blends pixels softly
    offCtx.imageSmoothingEnabled = true;
    offCtx.drawImage(video, 0, 0, lw, lh);

    // Step 2: Scale back up with heavy smoothing → soft painted look
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.offscreen, 0, 0, vw, vh);

    // Step 3: Combined blur + saturation in a single GPU filter pass.
    // Eliminates the expensive getImageData/putImageData round-trip (GPU → CPU → GPU)
    // that was allocating ~3.7 MB of garbage per frame at 720p.
    if (intensity > 0.1 || vibrance > 0) {
      // Resize offscreen to full resolution for use as temporary buffer
      if (this.offscreen.width !== vw || this.offscreen.height !== vh) {
        this.offscreen.width = vw;
        this.offscreen.height = vh;
      }
      offCtx.drawImage(this.canvas, 0, 0); // copy current output

      const filters: string[] = [];
      if (intensity > 0.1) {
        const blurRadius = 0.5 + intensity * 2.5; // ~0.6px → 3px
        filters.push(`blur(${blurRadius}px)`);
      }
      if (vibrance > 0) {
        const sat = 1 + vibrance * 0.6; // default 0.3 → saturate(1.18)
        filters.push(`saturate(${sat})`);
      }
      ctx.filter = filters.join(" ");
      ctx.drawImage(this.offscreen, 0, 0);
      ctx.filter = "none";
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  destroy(): void {
    this.stop();
    this.inputStream = null;
  }
}

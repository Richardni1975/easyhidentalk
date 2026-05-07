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

    // Hidden video element to feed frames
    this.inputVideo = document.createElement("video");
    this.inputVideo.srcObject = inputStream;
    this.inputVideo.playsInline = true;
    this.inputVideo.muted = true;
    this.inputVideo.setAttribute("playsinline", "");
    this.inputVideo.style.display = "none";
    document.body.appendChild(this.inputVideo);

    // Main canvas (will be captured)
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    c.style.display = "none";
    document.body.appendChild(c);
    this.canvas = c;

    // Offscreen canvas for the low-res intermediate
    this.offscreen = document.createElement("canvas");
    this.offscreen.style.display = "none";
    document.body.appendChild(this.offscreen);
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
      const cs = (this.canvas as any).captureStream(30) as MediaStream;
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
    if (elapsed < 33) return; // ~30fps
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

    // How much to downscale: at intensity=1 → 1/8 resolution, at intensity=0 → 1/1
    const scale = 1 / (1 + intensity * 7); // 1× to 8× reduction
    const lw = Math.max(1, Math.round(vw * scale));
    const lh = Math.max(1, Math.round(vh * scale));

    // Set offscreen size to low resolution
    if (this.offscreen.width !== lw || this.offscreen.height !== lh) {
      this.offscreen.width = lw;
      this.offscreen.height = lh;
    }

    // Step 1: Draw at low resolution → creates the "impressionist" color patches
    offCtx.imageSmoothingEnabled = false;
    offCtx.drawImage(video, 0, 0, lw, lh);

    // Step 2: Scale back up with heavy smoothing → soft painted look
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.offscreen, 0, 0, vw, vh);

    // Step 3: Optional vibrance boost (oil painting color feel)
    if (vibrance > 0) {
      const imageData = ctx.getImageData(0, 0, vw, vh);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const avg = (r + g + b) / 3;
        // Push colors away from gray → more saturated
        const f = 1 + vibrance * 0.6;
        d[i]     = Math.min(255, avg + (r - avg) * f);
        d[i + 1] = Math.min(255, avg + (g - avg) * f);
        d[i + 2] = Math.min(255, avg + (b - avg) * f);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  destroy(): void {
    this.stop();
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.offscreen.parentNode) {
      this.offscreen.parentNode.removeChild(this.offscreen);
    }
    if (this.inputVideo.parentNode) {
      this.inputVideo.parentNode.removeChild(this.inputVideo);
    }
    this.inputStream = null;
  }
}

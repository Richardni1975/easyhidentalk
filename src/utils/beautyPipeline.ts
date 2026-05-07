export interface BeautyParams {
  smoothing: number; // 0–1
  whitening: number; // 0–1
}

const DEFAULT_PARAMS: BeautyParams = {
  smoothing: 0.5,
  whitening: 0.5,
};

// ── Vertex shader (full-screen quad) ─────────────────────────────────────
const VERTEX_SRC = `#version 300 es
in vec2 aPos;
in vec2 aUV;
out vec2 vUV;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vUV = aUV;
}
`;

// ── Pass 1: Skin smoothing (bilateral filter approximation) ──────────────
const SMOOTH_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uStrength;
uniform vec2 uTexel;
in vec2 vUV;
out vec4 fragColor;

bool isSkin(vec3 rgb) {
  // YCbCr-like skin detection, scaled from [0,1]
  float cb = 128.0 + (-0.1687*rgb.r - 0.3313*rgb.g + 0.5*rgb.b)*255.0;
  float cr = 128.0 + (0.5*rgb.r - 0.4187*rgb.g - 0.0813*rgb.b)*255.0;
  return cb > 77.0 && cb < 127.0 && cr > 133.0 && cr < 173.0;
}

void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float skin = isSkin(c) ? 1.0 : 0.0;

  // 5x5 bilateral: spatial * range weighting
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 off = vec2(float(x), float(y)) * uTexel;
      vec3 s = texture(uTex, vUV + off).rgb;
      float w = exp(-length(s - c) * 8.0) * exp(-float(x*x + y*y) * 0.2);
      acc += s * w;
      total += w;
    }
  }
  acc /= max(total, 1e-6);

  // Blend original and smoothed based on skin mask + user strength
  vec3 result = mix(c, acc, skin * uStrength);
  fragColor = vec4(result, 1.0);
}
`;

// ── Pass 2: Whitening ────────────────────────────────────────────────────
const WHITEN_FRAG_SRC = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uStrength;
in vec2 vUV;
out vec4 fragColor;

bool isSkin(vec3 rgb) {
  float cb = 128.0 + (-0.1687*rgb.r - 0.3313*rgb.g + 0.5*rgb.b)*255.0;
  float cr = 128.0 + (0.5*rgb.r - 0.4187*rgb.g - 0.0813*rgb.b)*255.0;
  return cb > 77.0 && cb < 127.0 && cr > 133.0 && cr < 173.0;
}

void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float skin = isSkin(c) ? 1.0 : 0.0;

  // Brighten + slight cool shift
  vec3 bright = c * 1.15 + 0.035;
  bright = mix(bright, bright * vec3(1.0, 0.97, 0.98), 0.5);

  vec3 result = mix(c, bright, skin * uStrength);
  // Guard against overflow
  result = clamp(result, 0.0, 1.0);
  fragColor = vec4(result, 1.0);
}
`;

// ── Full-screen quad geometry ───────────────────────────────────────────
const QUAD_VERTICES = new Float32Array([
  -1, -1, 0, 0,
   1, -1, 1, 0,
  -1,  1, 0, 1,
   1,  1, 1, 1,
]);

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    throw new Error("Shader compile failed");
  }
  return s;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(prog));
    throw new Error("Program link failed");
  }
  return prog;
}

function createFbo(gl: WebGL2RenderingContext, w: number, h: number): [WebGLFramebuffer, WebGLTexture] {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return [fbo, tex];
}

export class BeautyPipeline {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private inputStream: MediaStream | null = null;
  private outputStream: MediaStream | null = null;
  private inputVideo: HTMLVideoElement;
  private animFrameId = 0;
  private running = false;
  private lastFrameTime = 0;
  private params: BeautyParams;
  private width: number;
  private height: number;

  // GL resources
  private smoothProg: WebGLProgram | null = null;
  private whitenProg: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private fboTex: WebGLTexture | null = null;
  private inputTex: WebGLTexture | null = null;

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

    // Regular canvas (OffscreenCanvas.captureStream is Chromium-only)
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    c.style.display = "none";
    document.body.appendChild(c);
    this.canvas = c;

    // Initialize WebGL2
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctxOpts: any = { alpha: false, desynchronized: true, antialias: false, depth: false, stencil: false };
      this.gl = this.canvas.getContext("webgl2", ctxOpts) as WebGL2RenderingContext | null;
      if (!this.gl) throw new Error("No WebGL2");
    } catch (e) {
      console.warn("Beauty filter: WebGL2 not available", e);
      this.gl = null;
    }
  }

  start(): MediaStream | null {
    if (!this.gl) return null;
    const gl = this.gl;

    try {
      this.setupGl(gl);
    } catch (e) {
      console.warn("Beauty filter: GL setup failed", e);
      this.destroy();
      return null;
    }

    // Play the input video
    this.inputVideo.play().catch(() => {});

    // Create output stream from canvas
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cs = this.canvas.captureStream(30) as MediaStream;
      this.outputStream = cs;
    } catch (e) {
      console.warn("Beauty filter: captureStream not supported", e);
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
    // Stop the output track
    if (this.outputStream) {
      this.outputStream.getTracks().forEach((t) => t.stop());
      this.outputStream = null;
    }
    // Pause the input video (but don't stop its tracks — we don't own them)
    this.inputVideo.pause();
  }

  updateParams(p: Partial<BeautyParams>): void {
    Object.assign(this.params, p);
  }

  getParams(): BeautyParams {
    return { ...this.params };
  }

  // ── GL setup ──────────────────────────────────────────────────────────
  private setupGl(gl: WebGL2RenderingContext): void {
    // Shaders
    this.smoothProg = createProgram(gl, VERTEX_SRC, SMOOTH_FRAG_SRC);
    this.whitenProg = createProgram(gl, VERTEX_SRC, WHITEN_FRAG_SRC);

    // Full-screen quad VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    // aPos (xy)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    // aUV (uv)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);

    // Single FBO for intermediate pass output
    [this.fbo, this.fboTex] = createFbo(gl, this.width, this.height);

    // Input texture (uploaded each frame)
    this.inputTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  // ── Per-frame render ──────────────────────────────────────────────────
  private tick = (now: number): void => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.tick);

    // Throttle to ~30fps — captureStream(30) drops extras anyway
    const elapsed = now - this.lastFrameTime;
    if (elapsed < 33) return;
    this.lastFrameTime = now;

    const gl = this.gl;
    if (!gl) return;

    const v = this.inputVideo;
    if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return;

    try {
      this.renderFrame(gl, v);
    } catch (e) {
      // skip frames that can't be rendered (e.g. tab hidden, context lost)
    }
  };

  private renderFrame(gl: WebGL2RenderingContext, video: HTMLVideoElement): void {
    const { smoothing, whitening } = this.params;

    // Upload current video frame to inputTex
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindVertexArray(this.vao);

    // ── Pass 1: Smoothing ──
    gl.useProgram(this.smoothProg!);
    gl.uniform1f(gl.getUniformLocation(this.smoothProg!, "uStrength"), smoothing);
    gl.uniform2f(gl.getUniformLocation(this.smoothProg!, "uTexel"), 1 / this.width, 1 / this.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTex);
    gl.uniform1i(gl.getUniformLocation(this.smoothProg!, "uTex"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Pass 2: Whitening ──
    gl.useProgram(this.whitenProg!);
    gl.uniform1f(gl.getUniformLocation(this.whitenProg!, "uStrength"), whitening);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(gl.getUniformLocation(this.whitenProg!, "uTex"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  destroy(): void {
    this.stop();
    const gl = this.gl;
    if (gl) {
      if (this.smoothProg) gl.deleteProgram(this.smoothProg);
      if (this.whitenProg) gl.deleteProgram(this.whitenProg);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
      if (this.fboTex) gl.deleteTexture(this.fboTex);
      if (this.inputTex) gl.deleteTexture(this.inputTex);
      this.gl = null;
    }
    if (this.inputVideo.parentNode) {
      this.inputVideo.parentNode.removeChild(this.inputVideo);
    }
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.inputStream = null;
  }
}

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { SharedContent } from "../types";

interface ExtractedPage {
  pageNumber: number;
  text: string;
}

/** Try to detect if an iframe's content was blocked by X-Frame-Options / CSP */
function isIframeBlocked(iframe: HTMLIFrameElement): boolean {
  try {
    // Same-origin or error page: we can access location
    const loc = iframe.contentWindow?.location;
    // about:blank → still loading or blocked; chrome-error:// → blocked by Chrome
    if (loc && (loc.href === "about:blank" || loc.href.startsWith("chrome-error") || loc.href.startsWith("about:"))) {
      return true;
    }
  } catch {
    // SecurityError → cross-origin and loaded successfully
    return false;
  }
  return false;
}

interface MediaSharePanelProps {
  sharedContent: SharedContent | null;
  onShareUrl: (url: string) => void;
  onShareText: (text: string, fileName: string, mimeType?: string) => void;
  onStopShare: () => void;
  userName: string;
  peerId: string;
  screenShareStream: MediaStream | null;
  screenSharerPeerId: string | null;
  screenSharerName: string | null;
  onStopScreenShare: () => void;
}

const GALLERY_IMAGES = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
  "https://images.unsplash.com/photo-1470071459604-7b8ec44ffd5b?w=800&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80",
  "https://images.unsplash.com/photo-1518173946687-a36f968f7fb6?w=800&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80",
  "https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=800&q=80",
  "https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=800&q=80",
];

type Tab = "gallery" | "url" | "file" | "favorites";

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "ppt": return "application/vnd.ms-powerpoint";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default: return "text/plain";
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBlobUrl(base64: string, mimeType: string): string {
  const byteChars = atob(base64);
  const byteNums = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteNums], { type: mimeType });
  return URL.createObjectURL(blob);
}

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml"]);

const FAVORITES_KEY = "media-share-favorites";

interface ShareHistoryEntry {
  key: string;
  type: "url" | "file";
  label: string;
  value: string;
  mimeType?: string;
  count: number;
  lastUsed: number;
}

function loadFavorites(): ShareHistoryEntry[] {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveFavorites(entries: ShareHistoryEntry[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(entries));
  } catch {
    // silently ignore
  }
}

function recordShare(entry: Omit<ShareHistoryEntry, "count" | "lastUsed">) {
  const favorites = loadFavorites();
  const existing = favorites.find((f) => f.key === entry.key);
  if (existing) {
    existing.count += 1;
    existing.lastUsed = Date.now();
  } else {
    favorites.push({ ...entry, count: 1, lastUsed: Date.now() });
  }
  // Keep only top 50 to avoid unbounded growth
  favorites.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  saveFavorites(favorites.slice(0, 50));
}

export default function MediaSharePanel({
  sharedContent,
  onShareUrl,
  onShareText,
  onStopShare,
  userName,
  peerId,
  screenShareStream,
  screenSharerPeerId,
  screenSharerName,
  onStopScreenShare,
}: MediaSharePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("gallery");
  const [urlInput, setUrlInput] = useState("");
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryVisible, setGalleryVisible] = useState(true);
  const [favorites, setFavorites] = useState<ShareHistoryEntry[]>(() => loadFavorites());
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string>("");
  const [fileSize, setFileSize] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [magnifierActive, setMagnifierActive] = useState(false);
  const [mousePos, setMousePos] = useState({ x: -9999, y: -9999 });
  const [videoReady, setVideoReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const contentRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const contentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const contentIframeScrollRef = useRef({ x: 0, y: 0 });
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]);
  const [showPdfText, setShowPdfText] = useState(false);
  const [flashScreenshot, setFlashScreenshot] = useState(false);

  // Refs to always capture latest state for screenshot (avoids stale closures)
  const sharedContentRef = useRef(sharedContent);
  const screenShareStreamRef = useRef(screenShareStream);
  sharedContentRef.current = sharedContent;
  screenShareStreamRef.current = screenShareStream;

  const handleScreenshot = useCallback(async () => {
    const el = contentAreaRef.current;
    if (!el) return;
    const sc = sharedContentRef.current;
    const ss = screenShareStreamRef.current;

    try {
      const rect = el.getBoundingClientRect();
      const w = rect.width || 400;
      const h = rect.height || 300;
      const scale = 2;

      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#0f0f1a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);

      if (ss) {
        // Screen share — capture video frame
        const video = el.querySelector("video");
        if (video) ctx.drawImage(video, 0, 0, w, h);
      } else if (sc?.type === "text") {
        // Text content — render directly from state
        ctx.fillStyle = "#cdd";
        ctx.font = "14px Consolas, monospace";
        let y = 20;
        const lines = sc.content.split("\n");
        for (const line of lines) {
          if (y > h - 4) break;
          ctx.fillText(line, 16, y);
          y += 20;
        }
      } else if (sc?.type === "url") {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#aaa";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("分享的网页", w / 2, h / 2 - 10);
        ctx.fillStyle = "#69f";
        ctx.font = "13px sans-serif";
        ctx.fillText(sc.content, w / 2, h / 2 + 20);
        ctx.textAlign = "start";
      } else if (sc?.type === "file" && sc.mimeType === "application/pdf") {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ccc";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`📄 ${sc.fileName || "PDF"}`, w / 2, h / 2);
        ctx.textAlign = "start";
      } else if (sc?.type === "file") {
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ddd";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(sc.fileName || "文件", w / 2, h / 2 - 10);
        ctx.fillStyle = "#999";
        ctx.font = "12px sans-serif";
        ctx.fillText("不支持在线预览", w / 2, h / 2 + 20);
        ctx.textAlign = "start";
      } else {
        // Gallery — reload img with CORS and draw
        const img = el.querySelector("img");
        if (img) {
          try {
            const fresh = new Image();
            fresh.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              fresh.onload = () => resolve();
              fresh.onerror = reject;
              fresh.src = img.src;
            });
            ctx.drawImage(fresh, 0, 0, w, h);
          } catch {
            try { ctx.drawImage(img, 0, 0, w, h); } catch {}
          }
        }
      }

      setFlashScreenshot(true);
      setTimeout(() => setFlashScreenshot(false), 600);

      const link = document.createElement("a");
      link.download = `screenshot-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Screenshot failed:", err);
    }
  }, []);

  // Extract text from PDF when shared content is a PDF
  useEffect(() => {
    if (sharedContent?.type === "file" && sharedContent.mimeType === "application/pdf") {
      setShowPdfText(false);
      setExtractedPages([]);
      extractPdfText(sharedContent.content).then((pages) => {
        if (pages.length > 0) setExtractedPages(pages);
      });
    } else {
      setExtractedPages([]);
      setShowPdfText(false);
    }
  }, [sharedContent]);

  async function extractPdfText(base64Content: string): Promise<ExtractedPage[]> {
    try {
      const pdfjs = await import("pdfjs-dist");
      const pdfjsWorker: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker.default || pdfjsWorker;
      const byteChars = atob(base64Content);
      const byteNums = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const pdf = await pdfjs.getDocument({ data: byteNums }).promise;
      const pages: ExtractedPage[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(" ");
        pages.push({ pageNumber: i, text });
      }
      return pages;
    } catch (err) {
      console.error("PDF text extraction failed:", err);
      return [];
    }
  }

  function speakText(text: string) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1;
    utterance.lang = "zh-CN";
    window.speechSynthesis.speak(utterance);
  }

  // Text-to-speech: read aloud selected text
  const handleContentMouseUp = useCallback(() => {
    let selectedText = "";
    // Try main document selection
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      selectedText = sel.toString().trim();
    }
    // Try iframe selection (same-origin only)
    if (!selectedText && contentIframeRef.current) {
      try {
        const doc = contentIframeRef.current.contentDocument || contentIframeRef.current.contentWindow?.document;
        const iframeSel = doc?.getSelection();
        if (iframeSel && iframeSel.toString().trim()) {
          selectedText = iframeSel.toString().trim();
        }
      } catch {
        // cross-origin — ignore
      }
    }
    if (!selectedText) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(selectedText);
    utterance.volume = 1;
    utterance.lang = "zh-CN";
    window.speechSynthesis.speak(utterance);
  }, []);

  // Bind screen share stream to video element
  useEffect(() => {
    setVideoReady(false);
    if (screenVideoRef.current && screenShareStream) {
      screenVideoRef.current.srcObject = screenShareStream;
    } else if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
  }, [screenShareStream]);

  // Window-level mouse tracking for magnifier
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      setMousePos({ x: -9999, y: -9999 });
    };
  }, []);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  // Gallery auto-cycle with crossfade: 4s visible → 1s fade-out → swap → 1s fade-in
  useEffect(() => {
    if (sharedContent) return;
    let cancelled = false;

    const cycle = () => {
      if (cancelled) return;
      // Start fade-out
      setGalleryVisible(false);
      // After fade-out completes, swap image and fade back in
      setTimeout(() => {
        if (cancelled) return;
        setGalleryIndex((prev) => (prev + 1) % GALLERY_IMAGES.length);
        // Small delay so the new src renders before fading in
        setTimeout(() => {
          if (cancelled) return;
          setGalleryVisible(true);
          // Schedule next cycle after fade-in + display time
          setTimeout(cycle, 4000);
        }, 50);
      }, 1000);
    };

    const initialTimer = setTimeout(cycle, 4000);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
    };
  }, [sharedContent]);

  // Compute blob URL for shared PDF files
  const pdfBlobUrl = useMemo(() => {
    if (sharedContent?.type === "file" && sharedContent.mimeType === "application/pdf") {
      const url = base64ToBlobUrl(sharedContent.content, sharedContent.mimeType);
      blobUrlRef.current = url;
      return url;
    }
    return null;
  }, [sharedContent]);

  const tabClass = (tab: Tab) =>
    `px-4 py-2 text-xs font-medium transition-colors ${
      activeTab === tab
        ? "text-white border-b-2 border-blue-500"
        : "text-dark-400 hover:text-white"
    }`;

  const handleUrlShare = () => {
    let url = urlInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    recordShare({ key: url, type: "url", label: url, value: url });
    setFavorites(loadFavorites());
    onShareUrl(url);
    setUrlInput("");
    setActiveTab("gallery");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const mime = getMimeType(file.name);
    const isText = TEXT_EXTENSIONS.has(ext);
    const maxSize = isText ? 500 * 1024 : 5 * 1024 * 1024;

    if (file.size > maxSize) {
      setFileError(isText ? "文件大小不能超过 500KB" : "文件大小不能超过 5MB");
      return;
    }

    setFileName(file.name);
    setFileMimeType(mime);
    setFileSize(file.size);

    if (isText) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setFileContent(evt.target?.result as string);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const buffer = evt.target?.result as ArrayBuffer;
        if (buffer) {
          setFileContent(arrayBufferToBase64(buffer));
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleFileShare = () => {
    if (!fileContent || !fileName) return;

    recordShare({ key: fileName, type: "file", label: fileName, value: fileContent, mimeType: fileMimeType || undefined });
    setFavorites(loadFavorites());
    onShareText(fileContent, fileName, fileMimeType);

    setFileContent(null);
    setFileName(null);
    setFileMimeType("");
    setFileSize(0);
    setActiveTab("gallery");
  };

  const isSharer = sharedContent?.sharedBy === peerId;

  const renderControls = () => {
    if (sharedContent) return null;

    return (
      <div className="border-b border-dark-700">
        {/* Tab bar */}
        <div className="flex">
          <button onClick={() => setActiveTab("gallery")} className={tabClass("gallery")}>
            画廊
          </button>
          <button onClick={() => setActiveTab("url")} className={tabClass("url")}>
            分享网址
          </button>
          <button onClick={() => setActiveTab("file")} className={tabClass("file")}>
            分享文件
          </button>
          <button onClick={() => setActiveTab("favorites")} className={tabClass("favorites")}>
            常用
          </button>
        </div>

        {/* URL input */}
        {activeTab === "url" && (
          <div className="flex gap-2 p-3">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlShare()}
              placeholder="输入网址，例如 example.com/page"
              className="flex-1 bg-dark-800 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-500 border border-dark-600 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleUrlShare}
              disabled={!urlInput.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-dark-600 text-white text-sm rounded-lg transition-colors"
            >
              分享
            </button>
          </div>
        )}

        {/* File input */}
        {activeTab === "file" && (
          <div className="p-3 space-y-2">
            <label className="inline-block px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white text-sm rounded-lg cursor-pointer transition-colors">
              选择文件
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.pdf,.doc,.docx,.ppt,.pptx,.json,.csv,.xml,.yaml,.yml"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
            <p className="text-xs text-dark-500">
              支持: txt, md, pdf, doc, docx, ppt, pptx, json, csv, xml
            </p>
            {fileError && <p className="text-red-400 text-xs">{fileError}</p>}
            {fileContent && fileName && (
              <div className="space-y-2">
                <p className="text-xs text-dark-400">
                  已选择: {fileName} ({(fileSize / 1024).toFixed(1)}KB)
                </p>
                {fileMimeType.startsWith("text/") ? (
                  <pre className="text-xs text-dark-300 whitespace-pre-wrap max-h-32 overflow-y-auto bg-dark-950 rounded-lg p-2">
                    {fileContent.slice(0, 2000)}
                    {fileContent.length > 2000 && "\n..."}
                  </pre>
                ) : fileMimeType === "application/pdf" ? (
                  <p className="text-xs text-dark-400">PDF 文件已就绪，点击下方分享</p>
                ) : (
                  <div className="text-xs text-dark-400 bg-dark-950 rounded-lg p-3">
                    该格式无法预览，分享后其他参与者可下载查看
                  </div>
                )}
                <button
                  onClick={handleFileShare}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                >
                  分享文件
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSharingIndicator = () => {
    if (!sharedContent) return null;

    return (
      <div className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-dark-700">
        <span className="text-sm text-dark-200 truncate">
          {isSharer ? "你正在分享" : `${sharedContent.senderName} 正在分享`}
          {sharedContent.fileName && ` — ${sharedContent.fileName}`}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sharedContent?.type === "file" && sharedContent.mimeType === "application/pdf" && extractedPages.length > 0 && (
            <button
              onClick={() => setShowPdfText((prev) => !prev)}
              className={`px-2 py-1 text-xs rounded-lg transition-colors ${
                showPdfText
                  ? "bg-green-600 text-white"
                  : "bg-dark-700 text-dark-300 hover:text-white"
              }`}
              title={showPdfText ? "关闭朗读面板" : "朗读 PDF"}
            >
              {showPdfText ? "📖" : "🔊"}
            </button>
          )}
          <button
            onClick={() => setMagnifierActive((prev) => !prev)}
            className={`px-2 py-1 text-xs rounded-lg transition-colors ${
              magnifierActive
                ? "bg-blue-600 text-white"
                : "bg-dark-700 text-dark-300 hover:text-white"
            }`}
            title={magnifierActive ? "关闭放大镜" : "开启放大镜"}
          >
            🔍
          </button>
          <button
            onClick={handleScreenshot}
            className="px-2 py-1 text-xs rounded-lg transition-colors bg-dark-700 text-dark-300 hover:text-white"
            title="截图"
          >
            📷
          </button>
          {isSharer && (
            <button
              onClick={onStopShare}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors"
            >
              停止分享
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderScreenShareIndicator = () => {
    if (!screenShareStream) return null;
    const isLocalSharer = screenSharerPeerId === peerId;
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-dark-700">
        <span className="text-sm text-dark-200 truncate flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {isLocalSharer ? "你正在共享屏幕" : `${screenSharerName} 正在共享屏幕`}
        </span>
        {isLocalSharer && (
          <button
            onClick={onStopScreenShare}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition-colors"
          >
            停止共享
          </button>
        )}
      </div>
    );
  };

  const renderContent = () => {
    // Screen share takes priority over all other content
    if (screenShareStream) {
      return (
        <div className="w-full h-full bg-dark-950">
          <video
            ref={screenVideoRef}
            autoPlay
            playsInline
            muted={screenSharerPeerId === peerId}
            className={`w-full h-full object-contain transition-opacity duration-300 ${videoReady ? "opacity-100" : "opacity-0"}`}
            onPlaying={() => setVideoReady(true)}
          />
        </div>
      );
    }

    // Shared URL
    if (sharedContent?.type === "url") {
      if (iframeError) {
        return (
          <div className="flex flex-col items-center justify-center h-full text-dark-400 p-6">
            <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm mb-2">该页面不支持嵌入预览</p>
            <a
              href={sharedContent.content}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm underline"
            >
              在新标签页中打开
            </a>
          </div>
        );
      }
      return (
        <div className="w-full h-full relative">
          <iframe
            src={sharedContent.content}
            sandbox="allow-scripts allow-forms allow-same-origin"
            className="w-full h-full"
            title="shared-url"
            style={{ pointerEvents: magnifierActive ? "none" : "auto" }}
            onLoad={(e) => {
              const iframe = e.target as HTMLIFrameElement;
              setTimeout(() => {
                if (isIframeBlocked(iframe)) {
                  setIframeError(true);
                }
              }, 800);
            }}
            ref={(el) => {
            if (el && el !== contentIframeRef.current) {
              contentIframeRef.current = el;
              try {
                const doc = el.contentDocument || el.contentWindow?.document;
                if (doc) {
                  doc.addEventListener("scroll", () => {
                    contentIframeScrollRef.current = {
                      x: (doc.documentElement?.scrollLeft || doc.body?.scrollLeft || 0) as number,
                      y: (doc.documentElement?.scrollTop || doc.body?.scrollTop || 0) as number,
                    };
                  });
                }
              } catch {
                // cross-origin — silently ignore
              }
            }
          }}
          />
        </div>
      );
    }

    // Shared text file
    if (sharedContent?.type === "text") {
      return (
        <pre className="w-full h-full overflow-y-auto p-4 text-sm text-dark-200 whitespace-pre-wrap font-mono bg-dark-950">
          {sharedContent.content}
        </pre>
      );
    }

    // Shared binary file
    if (sharedContent?.type === "file") {
      // PDF — render in-browser
      if (sharedContent.mimeType === "application/pdf" && pdfBlobUrl) {
        return (
          <iframe
            src={pdfBlobUrl + "#toolbar=0&navpanes=0"}
            className="w-full h-full"
            title="shared-pdf"
            style={{ pointerEvents: magnifierActive ? "none" : "auto" }}
            ref={(el) => {
              if (el && el !== contentIframeRef.current) {
                contentIframeRef.current = el;
                try {
                  const doc = el.contentDocument || el.contentWindow?.document;
                  if (doc) {
                    doc.addEventListener("scroll", () => {
                      contentIframeScrollRef.current = {
                        x: (doc.documentElement?.scrollLeft || doc.body?.scrollLeft || 0) as number,
                        y: (doc.documentElement?.scrollTop || doc.body?.scrollTop || 0) as number,
                      };
                    });
                  }
                } catch {
                  // cross-origin — silently ignore
                }
              }
            }}
          />
        );
      }

      // Other binary files — download prompt
      const ext = sharedContent.fileName
        ? "." + sharedContent.fileName.split(".").pop()?.toLowerCase()
        : "";
      const handleDownload = () => {
        try {
          const byteChars = atob(sharedContent.content);
          const byteNums = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteNums], { type: sharedContent.mimeType || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = sharedContent.fileName || "file";
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error("Download failed:", e);
        }
      };
      return (
        <div className="flex flex-col items-center justify-center h-full text-dark-400 p-6">
          <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-dark-300 mb-1">{sharedContent.fileName}</p>
          <p className="text-xs text-dark-500 mb-4">
            {ext === ".doc" || ext === ".docx" ? "Word 文档" :
             ext === ".ppt" || ext === ".pptx" ? "PPT 演示文稿" :
             "文件"} 不支持在线预览
          </p>
          <button
            onClick={handleDownload}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下载文件
          </button>
        </div>
      );
    }

    // Favorites list
    if (activeTab === "favorites") {
      const topFavorites = favorites.slice(0, 12);
      return (
        <div className="w-full h-full overflow-y-auto p-3 space-y-1.5">
          {topFavorites.map((entry) => (
            <div
              key={entry.key}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors group"
            >
              {/* Icon */}
              {entry.type === "url" ? (
                <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              )}
              {/* Label */}
              <span className="flex-1 text-sm text-dark-200 truncate min-w-0">
                {entry.label}
              </span>
              {/* Count */}
              <span className="text-xs text-dark-500 flex-shrink-0 mr-1">
                {entry.count}次
              </span>
              {/* Re-share button */}
              <button
                onClick={() => {
                  if (entry.type === "url") {
                    onShareUrl(entry.value);
                  } else if (entry.value && entry.mimeType) {
                    onShareText(entry.value, entry.label, entry.mimeType);
                  }
                  setActiveTab("gallery");
                }}
                className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                分享
              </button>
            </div>
          ))}
        </div>
      );
    }

    // Gallery mode
    return (
      <div className="w-full h-full flex items-center justify-center bg-dark-950 overflow-hidden">
        <img
          src={GALLERY_IMAGES[galleryIndex]}
          alt=""
          className={`w-full h-full object-cover transition-opacity duration-1000 ${galleryVisible ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-dark-900">
      {renderControls()}
      {renderSharingIndicator()}
      {renderScreenShareIndicator()}

      {/* Empty state for URL/file/favorites tabs when nothing is shared */}
      {!sharedContent && activeTab === "url" && (
        <div className="flex-1 flex items-center justify-center text-dark-500 text-sm">
          输入网址并点击分享
        </div>
      )}
      {!sharedContent && activeTab === "file" && !fileContent && (
        <div className="flex-1 flex items-center justify-center text-dark-500 text-sm">
          选择文件进行分享
        </div>
      )}
      {!sharedContent && activeTab === "favorites" && favorites.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-dark-500 text-sm">
          暂无常用记录，分享网址或文件后将自动记录
        </div>
      )}

      {/* Content display */}
      {(screenShareStream || sharedContent || activeTab === "gallery" || (activeTab === "file" && fileContent) || (activeTab === "favorites" && favorites.length > 0)) && (
        <div
          ref={contentAreaRef}
          className="flex-1 min-h-0 relative"
          onMouseUp={handleContentMouseUp}
        >
          {renderContent()}
          {/* Transparent overlay to capture mousemove events over iframes when magnifier is active */}
          {magnifierActive && (
            <div
              className="absolute inset-0 z-10"
              style={{ pointerEvents: magnifierActive ? "auto" : "none" }}
            />
          )}

          {/* PDF text panel overlay for reading aloud */}
          {showPdfText && extractedPages.length > 0 && (
            <div className="absolute inset-0 z-20 bg-dark-950/95 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-white font-medium">PDF 文本内容 — 点击段落朗读</h3>
                <button
                  onClick={() => setShowPdfText(false)}
                  className="text-dark-400 hover:text-white text-sm"
                >
                  关闭
                </button>
              </div>
              {extractedPages.map((page) => (
                <div key={page.pageNumber} className="mb-4">
                  <div
                    className="text-xs text-dark-500 mb-1 cursor-pointer hover:text-blue-400"
                    onClick={() => speakText(page.text)}
                    title="单击朗读整页"
                  >
                    第 {page.pageNumber} 页
                  </div>
                  <div
                    className="text-sm text-dark-200 whitespace-pre-wrap leading-relaxed cursor-pointer hover:text-white transition-colors rounded-lg px-3 py-2 hover:bg-dark-800"
                    onClick={() => speakText(page.text)}
                    title="单击朗读整页"
                  >
                    {page.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Magnifier overlay */}
      {magnifierActive && (() => {
        const el = contentAreaRef.current;
        if (!el) return null;
        const cr = el.getBoundingClientRect();
        const relX = mousePos.x - cr.left;
        const relY = mousePos.y - cr.top;
        if (relX < 0 || relX > cr.width || relY < 0 || relY > cr.height) return null;

        const contentW = cr.width;
        const contentH = cr.height;
        // 50cm × 3cm physical area to the RIGHT of the cursor
        // At 96 DPI: ~1886px × 113px
        const tx = (-relX * 3).toFixed(1);          // 3x horizontal, starts from cursor
        const ty = (56.5 - relY * 2).toFixed(1);    // 2x vertical, centered on cursor
        const commonStyle: React.CSSProperties = {
          width: contentW,
          height: contentH,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(3, 2)`,
        };

        let magContent: React.ReactNode = null;
        if (sharedContent?.type === "url" && !iframeError) {
          magContent = (
            <iframe src={sharedContent.content} sandbox="allow-scripts allow-forms allow-same-origin" title="mag-url" style={{ ...commonStyle, border: "none" }} />
          );
        } else if (sharedContent?.type === "text") {
          magContent = (
            <pre style={{ ...commonStyle, margin: 0, padding: 0, fontSize: "0.875rem", color: "#ccc", background: "#0f0f1a", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
              {sharedContent.content}
            </pre>
          );
        } else if (sharedContent?.type === "file" && sharedContent.mimeType === "application/pdf" && pdfBlobUrl) {
          magContent = (
            <iframe
              src={pdfBlobUrl + "#toolbar=0&navpanes=0"}
              title="mag-pdf"
              style={{ ...commonStyle, border: "none" }}
              ref={(el) => {
                if (!el) return;
                try {
                  const scroll = contentIframeScrollRef.current;
                  if (scroll.x || scroll.y) {
                    const doc = el.contentDocument || el.contentWindow?.document;
                    if (doc?.documentElement) {
                      if (doc.documentElement.scrollTop !== scroll.y) {
                        doc.documentElement.scrollTop = scroll.y;
                      }
                      if (doc.documentElement.scrollLeft !== scroll.x) {
                        doc.documentElement.scrollLeft = scroll.x;
                      }
                    }
                  }
                } catch {
                  // cross-origin
                }
              }}
            />
          );
        } else {
          magContent = (
            <img src={GALLERY_IMAGES[galleryIndex]} alt="" style={{ ...commonStyle, objectFit: "cover" }} />
          );
        }

        const MAG_W = Math.min(1886, window.innerWidth - 8), MAG_H = 113, GAP = 16;
        // Place below cursor so magnifier never covers the mouse
        let magLeft = Math.max(4, Math.min(window.innerWidth - MAG_W - 4, mousePos.x + GAP));
        let magTop = Math.max(4, Math.min(window.innerHeight - MAG_H - 4, mousePos.y + GAP));

        return (
          <div
            className="fixed pointer-events-none z-[9999] overflow-hidden rounded-xl border-2 border-white/30 shadow-2xl"
            style={{
              width: MAG_W,
              height: MAG_H,
              left: magLeft,
              top: magTop,
              background: "#0f0f1a",
            }}
          >
            {magContent}
          </div>
        );
      })()}

      {/* Screenshot flash overlay */}
      {flashScreenshot && (
        <div className="absolute inset-0 z-30 bg-white/20 pointer-events-none animate-ping rounded-lg" />
      )}
    </div>
  );
}

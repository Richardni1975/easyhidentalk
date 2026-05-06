import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { SIGNALING_SERVER_URL } from "../utils/constants";

export function useSocket(roomId: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [connectCount, setConnectCount] = useState(0);

  useEffect(() => {
    if (!roomId) return;

    const socket = io(SIGNALING_SERVER_URL || undefined, {
      transports: ["websocket"],
    });
    socketRef.current = socket;

    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

    socket.on("connect", () => {
      console.log("Socket.IO connected:", socket.id);
      setSocketConnected(true);
      setConnectCount((c) => c + 1);

      // Send keep-alive every 5 seconds to prevent Render proxy timeout
      keepaliveTimer = setInterval(() => {
        socket.emit("keepalive");
      }, 5000);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket.IO connection error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket.IO disconnected:", reason);
      setSocketConnected(false);
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("disconnect");
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [roomId]);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback(
    (event: string, handler: (...args: any[]) => void) => {
      socketRef.current?.on(event, handler);
      return () => {
        socketRef.current?.off(event, handler);
      };
    },
    []
  );

  const off = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.off(event, handler);
  }, []);

  return { socket: socketRef, emit, on, off, socketConnected, connectCount };
}

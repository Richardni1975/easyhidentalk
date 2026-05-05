import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { SIGNALING_SERVER_URL } from "../utils/constants";

export function useSocket(roomId: string | undefined) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const socket = io(SIGNALING_SERVER_URL, {
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
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

  return { socket: socketRef, emit, on, off };
}

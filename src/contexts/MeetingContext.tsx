import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { Participant, ChatMessage } from "../types";

interface MeetingContextType {
  roomId: string;
  userName: string;
  participants: Participant[];
  chatMessages: ChatMessage[];
  isMomo: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  handRaised: boolean;
  peerId: string;

  setRoomId: (id: string) => void;
  setUserName: (name: string) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (peerId: string) => void;
  updateParticipant: (peerId: string, updates: Partial<Participant>) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setIsMomo: (isMomo: boolean) => void;
  setIsMuted: (muted: boolean) => void;
  setIsCameraOff: (off: boolean) => void;
  setHandRaised: (raised: boolean) => void;
  getDisplayName: (participant: Participant) => string;
  generatePeerId: () => string;
}

const MeetingContext = createContext<MeetingContextType | null>(null);

export function MeetingProvider({ children }: { children: React.ReactNode }) {
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isMomo, setIsMomo] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const peerIdRef = useRef(`peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const addParticipant = useCallback((participant: Participant) => {
    setParticipants((prev) => {
      if (prev.some((p) => p.peerId === participant.peerId)) return prev;
      return [...prev, participant];
    });
  }, []);

  const removeParticipant = useCallback((peerId: string) => {
    setParticipants((prev) => prev.filter((p) => p.peerId !== peerId));
  }, []);

  const updateParticipant = useCallback(
    (peerId: string, updates: Partial<Participant>) => {
      setParticipants((prev) =>
        prev.map((p) => (p.peerId === peerId ? { ...p, ...updates } : p))
      );
    },
    []
  );

  const addChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages((prev) => {
      // Dedup: same sender + same text within 10s (handles client vs server timestamp mismatch)
      if (prev.some(
        (m) => m.senderId === msg.senderId && m.text === msg.text && Math.abs(m.timestamp - msg.timestamp) < 10000
      )) {
        return prev;
      }
      return [...prev, msg];
    });
  }, []);

  const getDisplayName = useCallback(
    (participant: Participant) => {
      return participant.isMomo ? "momo" : participant.realName;
    },
    []
  );

  const generatePeerId = useCallback(() => {
    return peerIdRef.current;
  }, []);

  return (
    <MeetingContext.Provider
      value={{
        roomId,
        userName,
        participants,
        chatMessages,
        isMomo,
        isMuted,
        isCameraOff,
        handRaised,
        peerId: peerIdRef.current,
        setRoomId,
        setUserName,
        setParticipants,
        addParticipant,
        removeParticipant,
        updateParticipant,
        addChatMessage,
        setIsMomo,
        setIsMuted,
        setIsCameraOff,
        setHandRaised,
        getDisplayName,
        generatePeerId,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}

export function useMeeting() {
  const ctx = useContext(MeetingContext);
  if (!ctx) throw new Error("useMeeting must be used within MeetingProvider");
  return ctx;
}

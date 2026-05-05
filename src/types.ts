export interface Participant {
  peerId: string;
  userName: string;
  realName: string;
  isMomo: boolean;
  isHost: boolean;
  joinedAt?: number;
  muted: boolean;
  cameraOff: boolean;
  handRaised: boolean;
}

export interface ChatMessage {
  senderId: string;
  senderName: string;
  isMomo: boolean;
  text?: string;
  audioData?: string; // base64-encoded audio (voice message)
  duration?: number;  // audio duration in seconds
  timestamp: number;
}

export interface SharedContent {
  type: "url" | "text" | "file";
  content: string;
  fileName?: string;
  mimeType?: string;
  sharedBy: string;
  senderName: string;
  timestamp: number;
}

export interface EmojiEvent {
  peerId: string;
  emoji: string;
}

export interface RoomInfo {
  roomId: string;
  participants: Participant[];
}

export type MediaDeviceState = {
  audio: boolean;
  video: boolean;
};

export interface PollVote {
  peerId: string;
  voterName: string;
  identity: "real" | "momo";
}

export interface PollOption {
  text: string;
  votes: PollVote[];
}

export interface Poll {
  pollId: string;
  question: string;
  options: PollOption[];
  creatorPeerId: string;
  creatorName: string;
  status: "open" | "closed";
  timestamp: number;
  votingMode: "momo" | "real" | "mixed";
}

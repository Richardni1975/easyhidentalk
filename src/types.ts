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
  timestamp: number;
}

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

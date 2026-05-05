export const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_URL || "";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:turn.metered.ca:443",
    username: "ea62c3f96281464885bb2644",
    credential: "qBpXfgr2f8k5zbsG",
  },
  {
    urls: "turn:turn.metered.ca:80",
    username: "ea62c3f96281464885bb2644",
    credential: "qBpXfgr2f8k5zbsG",
  },
  {
    urls: "turn:turn.metered.ca:3478",
    username: "ea62c3f96281464885bb2644",
    credential: "qBpXfgr2f8k5zbsG",
  },
];

export const PITCH_SHIFT_RATIO = 1.35;

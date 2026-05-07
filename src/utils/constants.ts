export const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_URL || "";

export const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // TURN from Metered.ca
  {
    urls: [
      "turn:turn.metered.ca:443",
      "turn:turn.metered.ca:80",
      "turn:turn.metered.ca:3478",
    ],
    username: "ea62c3f96281464885bb2644",
    credential: "qBpXfgr2f8k5zbsG",
  },
  // TURN over TCP (better through firewalls)
  {
    urls: [
      "turn:turn.metered.ca:443?transport=tcp",
      "turn:turn.metered.ca:80?transport=tcp",
      "turn:turn.metered.ca:3478?transport=tcp",
    ],
    username: "ea62c3f96281464885bb2644",
    credential: "qBpXfgr2f8k5zbsG",
  },
];


export const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_URL || "";

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const PITCH_SHIFT_RATIO = 1.35;

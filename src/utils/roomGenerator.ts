const adjectives = [
  "Well", "Bright", "Calm", "Dark", "Bold", "Cool", "Deep", "Fast",
  "Glad", "High", "Kind", "Late", "Mild", "Neat", "Odd", "Pure",
  "Rich", "Safe", "Tall", "Vast", "Warm", "Young", "Brave", "Clean",
];

const nouns = [
  "Walls", "Stars", "Clouds", "Waves", "Hills", "Lakes", "Meadows",
  "Rivers", "Valleys", "Forests", "Gardens", "Harbors", "Islands",
  "Mountains", "Oceans", "Plains", "Prairies", "Ridges", "Streams",
  "Summits", "Trees", "Vines", "Waters", "Fields",
];

const verbs = [
  "Note", "Dance", "Flow", "Glow", "Hover", "Jazz", "Kick", "Leap",
  "Merge", "Nod", "Pulse", "Quilt", "Ring", "Spin", "Sway", "Twirl",
  "Unite", "Vote", "Wave", "Zoom", "Bloom", "Chime", "Drift", "Echo",
];

export function generateRoomName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  return `${adj}${noun}${verb}`;
}

export function isValidRoomName(name: string): boolean {
  return /^[A-Za-z]{3,}[A-Za-z0-9]*$/.test(name) && name.length >= 6;
}

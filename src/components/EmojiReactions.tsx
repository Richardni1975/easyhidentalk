import { useEffect, useState } from "react";
import type { EmojiEvent } from "../types";

interface EmojiReactionsProps {
  events: EmojiEvent[];
}

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
}

export default function EmojiReactions({ events }: EmojiReactionsProps) {
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);

  useEffect(() => {
    if (events.length === 0) return;
    const latest = events[events.length - 1];
    const id = Date.now() + Math.random();
    const x = Math.random() * 60 + 20; // 20% to 80% of screen width

    const newEmoji: FloatingEmoji = { id, emoji: latest.emoji, x };
    setFloatingEmojis((prev) => [...prev, newEmoji]);

    // Remove after animation
    setTimeout(() => {
      setFloatingEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2500);
  }, [events]);

  if (floatingEmojis.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {floatingEmojis.map((emoji) => (
        <div
          key={emoji.id}
          className="absolute bottom-32 text-4xl animate-emoji-float"
          style={{ left: `${emoji.x}%` }}
        >
          {emoji.emoji}
        </div>
      ))}
    </div>
  );
}

interface MomoAvatarProps {
  size?: number;
  className?: string;
}

export default function MomoAvatar({ size = 80, className = "" }: MomoAvatarProps) {
  return (
    <div
      className={`momo-gradient rounded-full flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Cat face silhouette */}
        <ellipse cx="50" cy="55" rx="35" ry="30" fill="white" opacity="0.9" />
        {/* Ears */}
        <polygon points="25,35 15,10 35,25" fill="white" opacity="0.9" />
        <polygon points="75,35 85,10 65,25" fill="white" opacity="0.9" />
        {/* Inner ears */}
        <polygon points="27,33 20,16 34,27" fill="#ffb347" opacity="0.7" />
        <polygon points="73,33 80,16 66,27" fill="#ffb347" opacity="0.7" />
        {/* Eyes */}
        <ellipse cx="38" cy="50" rx="5" ry="6" fill="#333" />
        <ellipse cx="62" cy="50" rx="5" ry="6" fill="#333" />
        {/* Eye shine */}
        <circle cx="36" cy="48" r="2" fill="white" />
        <circle cx="60" cy="48" r="2" fill="white" />
        {/* Nose */}
        <ellipse cx="50" cy="58" rx="3" ry="2" fill="#ff6b8a" />
        {/* Mouth */}
        <path d="M44 62 Q50 68 56 62" stroke="#333" strokeWidth="1.5" fill="none" />
        {/* Whiskers */}
        <line x1="20" y1="55" x2="35" y2="57" stroke="#333" strokeWidth="1" opacity="0.5" />
        <line x1="20" y1="60" x2="35" y2="59" stroke="#333" strokeWidth="1" opacity="0.5" />
        <line x1="80" y1="55" x2="65" y2="57" stroke="#333" strokeWidth="1" opacity="0.5" />
        <line x1="80" y1="60" x2="65" y2="59" stroke="#333" strokeWidth="1" opacity="0.5" />
      </svg>
    </div>
  );
}

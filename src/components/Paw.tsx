// 动漫猫爪（白色爪身 + 粉色肉垫）
export default function PawSvg() {
  return (
    <svg viewBox="0 0 100 100" className="swap-paw-svg">
      {/* 白色爪身 */}
      <path
        d="M50 6 C36 6 26 18 25 33 C24 41 23 48 25 55 L25 74 C25 85 36 93 50 93 C64 93 75 85 75 74 L75 55 C77 48 76 41 75 33 C74 18 64 6 50 6 Z"
        fill="#ffffff"
        stroke="#d46a85"
        strokeWidth="3.5"
      />
      {/* 粉色主肉垫 */}
      <ellipse cx="50" cy="67" rx="19" ry="14.5" fill="#ffb3c1" stroke="#d46a85" strokeWidth="2.5" />
      {/* 粉色爪趾 */}
      <ellipse
        cx="29"
        cy="42"
        rx="8.5"
        ry="11"
        fill="#ffb3c1"
        stroke="#d46a85"
        strokeWidth="2.5"
        transform="rotate(-14 29 42)"
      />
      <ellipse cx="50" cy="36" rx="8.5" ry="12" fill="#ffb3c1" stroke="#d46a85" strokeWidth="2.5" />
      <ellipse
        cx="71"
        cy="42"
        rx="8.5"
        ry="11"
        fill="#ffb3c1"
        stroke="#d46a85"
        strokeWidth="2.5"
        transform="rotate(14 71 42)"
      />
      {/* 爪尖 */}
      <path d="M22 16 L31 27 L13 25 Z" fill="#d46a85" />
      <path d="M50 4 L52.5 18 L47.5 18 Z" fill="#d46a85" />
      <path d="M78 16 L87 25 L69 27 Z" fill="#d46a85" />
    </svg>
  );
}

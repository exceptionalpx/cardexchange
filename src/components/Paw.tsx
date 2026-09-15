// 动漫猫爪（参考图：白色爪身 + 粉色肉垫，4 个小趾垫 + 大掌垫 + 腕垫，朝上摊开视角）
export default function PawSvg() {
  return (
    <svg viewBox="0 0 100 100" className="swap-paw-svg">
      {/* 白色爪身 */}
      <path
        d="M50 5 C36 5 25 15 23 29 C21 41 21 54 23 66 L24 79 C26 89 37 94 50 94 C63 94 74 89 76 79 L77 66 C79 54 79 41 77 29 C75 15 64 5 50 5 Z"
        fill="#ffffff"
        stroke="#d46a85"
        strokeWidth="3.5"
      />
      {/* 4 个小趾垫 */}
      <ellipse
        cx="23"
        cy="32"
        rx="7.5"
        ry="9.5"
        fill="#ffb3c1"
        stroke="#d46a85"
        strokeWidth="2.2"
        transform="rotate(-10 23 32)"
      />
      <ellipse cx="41" cy="26" rx="7.5" ry="10" fill="#ffb3c1" stroke="#d46a85" strokeWidth="2.2" />
      <ellipse cx="59" cy="26" rx="7.5" ry="10" fill="#ffb3c1" stroke="#d46a85" strokeWidth="2.2" />
      <ellipse
        cx="77"
        cy="32"
        rx="7.5"
        ry="9.5"
        fill="#ffb3c1"
        stroke="#d46a85"
        strokeWidth="2.2"
        transform="rotate(10 77 32)"
      />
      {/* 大掌垫（圆润掌形） */}
      <ellipse cx="50" cy="61" rx="19" ry="15.5" fill="#ffb3c1" stroke="#d46a85" strokeWidth="2.5" />
      {/* 腕垫 */}
      <ellipse cx="50" cy="84" rx="10" ry="6" fill="#ffb3c1" stroke="#d46a85" strokeWidth="2.2" />
    </svg>
  );
}

import { useState, type ReactNode } from 'react';
import { getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from '../core/sfx';

export const THEME_KEY = 'cardexchange-theme';

/** 应用主题到 <html data-theme> + localStorage（首页/对局中均可调用，实时生效） */
export function applyTheme(theme: 'cute' | 'classic'): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

/** 读取当前主题（默认经典风） */
export function loadTheme(): 'cute' | 'classic' {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'cute' || v === 'classic' ? v : 'classic';
  } catch {
    return 'classic';
  }
}

interface Props {
  onClose: () => void;
  /** 可选扩展项（如对局中的"托管"开关），渲染在音量组之后 */
  extra?: ReactNode;
}

/**
 * 设置弹窗：页面风格 + 背景音乐/音效音量。
 * 内部自管状态（主题、音量），打开时从 localStorage/sfx 读取并应用主题；
 * 首页与对局中复用同一组件，音量调节实时生效。
 */
export default function SettingsModal({ onClose, extra }: Props) {
  const [theme, setTheme] = useState<'cute' | 'classic'>(loadTheme);
  const [bgmVol, setBgmVol] = useState(() => Math.round(getBgmVolume() * 100));
  const [sfxVol, setSfxVol] = useState(() => Math.round(getSfxVolume() * 100));

  function changeTheme(t: 'cute' | 'classic') {
    setTheme(t);
    applyTheme(t);
  }

  return (
    <div className="modal">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>⚙️ 设置</h2>
          <button className="btn btn-small" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="settings-group">
          <div className="settings-label">🌿 页面风格</div>
          <div className="theme-pick">
            <button
              className={theme === 'classic' ? 'btn btn-primary' : 'btn'}
              onClick={() => changeTheme('classic')}
            >
              🌿 经典风（深绿牌桌）
            </button>
            <button
              className={theme === 'cute' ? 'btn btn-primary' : 'btn'}
              onClick={() => changeTheme('cute')}
            >
              🎀 可爱风（奶油绿）
            </button>
          </div>
        </div>
        <div className="settings-group">
          <div className="settings-label">🎵 背景音乐音量</div>
          <div className="settings-slider">
            <input
              type="range"
              min={0}
              max={100}
              value={bgmVol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBgmVol(v);
                setBgmVolume(v / 100);
              }}
              aria-label="背景音乐音量"
            />
            <span className="settings-val">{bgmVol}%</span>
          </div>
        </div>
        <div className="settings-group">
          <div className="settings-label">🔔 游戏音效音量</div>
          <div className="settings-slider">
            <input
              type="range"
              min={0}
              max={100}
              value={sfxVol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSfxVol(v);
                setSfxVolume(v / 100);
              }}
              aria-label="游戏音效音量"
            />
            <span className="settings-val">{sfxVol}%</span>
          </div>
        </div>
        {extra}
      </div>
    </div>
  );
}

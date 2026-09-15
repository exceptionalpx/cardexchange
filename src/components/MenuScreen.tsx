import { useState } from 'react';
import type { GameConfigUI } from '../App';
import AvatarPicker, { loadAvatar, AVATAR_KEY } from './AvatarPicker';

const STORAGE_KEY = 'cardexchange-config';

function loadSaved(): GameConfigUI | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameConfigUI;
    if (parsed.playerCount >= 2 && parsed.playerCount <= 4) return parsed;
    return null;
  } catch {
    return null;
  }
}

interface Props {
  onStart: (config: GameConfigUI) => void;
  onOnline: () => void;
}

export default function MenuScreen({ onStart, onOnline }: Props) {
  const saved = loadSaved();
  const [playerCount, setPlayerCount] = useState(saved?.playerCount ?? 2);
  const [botCount, setBotCount] = useState(saved?.botCount ?? 1);
  const [avatar, setAvatar] = useState(loadAvatar());
  const [showRules, setShowRules] = useState(false);

  const maxBots = playerCount - 1;
  const validBotCount = Math.min(botCount, maxBots);

  function start() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerCount, botCount: validBotCount }));
    localStorage.setItem(AVATAR_KEY, avatar);
    onStart({ playerCount, botCount: validBotCount, avatars: [avatar] });
  }

  return (
    <div className="menu">
      <h1 className="menu-title">♠ 换牌王 ♥</h1>
      <p className="menu-sub">扑克策略博弈 · 手牌总分最小者获胜</p>

      <div className="menu-section">
        <label>玩家数量（热座轮流操作）</label>
        <div className="btn-group">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              className={n === playerCount ? 'btn btn-primary' : 'btn'}
              onClick={() => {
                setPlayerCount(n);
                setBotCount((b) => Math.min(b, n - 1));
              }}
            >
              {n} 人
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <label>机器人数量（1 名真人玩家 + 机器人）</label>
        <div className="btn-group">
          {Array.from({ length: maxBots + 1 }, (_, i) => i).map((n) => (
            <button
              key={n}
              className={n === validBotCount ? 'btn btn-primary' : 'btn'}
              onClick={() => setBotCount(n)}
            >
              {n} 个
            </button>
          ))}
        </div>
        {playerCount - validBotCount === 1 && (
          <p className="hint">纯人机对战：1 名真人 + {validBotCount} 个机器人</p>
        )}
        {playerCount - validBotCount > 1 && (
          <p className="hint">
            纯热座对战：{playerCount - validBotCount} 名真人轮流操作（共用此屏幕）
          </p>
        )}
      </div>

      <div className="menu-section">
        <label>我的头像</label>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>

      <div className="menu-actions">
        <button className="btn btn-big btn-primary" onClick={start}>
          开始游戏
        </button>
        <button className="btn btn-big" onClick={onOnline}>
          联机对战
        </button>
        <button className="btn btn-big" onClick={() => setShowRules(true)}>
          规则说明
        </button>
      </div>

      {showRules && (
        <div className="modal">
          <div className="modal-card">
            <h2>换牌王规则</h2>
            <ul>
              <li><b>目标</b>：定牌后展开手牌，分数总和<b>最小</b>者获胜（并列同时胜出）。</li>
              <li><b>分数</b>：大小王 0 分；红桃 K -1 分；A~K 为 1~13 分。</li>
              <li><b>功能牌</b>：7/8 看自己一张；9/10 看别人一张；J/Q 暗换一次；K 明换一次（看完再决定换不换）。</li>
              <li><b>摸牌</b>：每回合摸 1 张，可发动功能 / 弃牌 / 替换手牌。弃牌后不补牌，手牌可为 0。</li>
              <li><b>跟弃</b>：有人弃牌时，持同分牌的玩家可抢着跟弃，先操作者成功；失败者罚补 1 张牌。</li>
              <li><b>定牌</b>：自己回合可宣布定牌，其余玩家各操作一轮后终局；此后不能对定牌玩家换牌。</li>
              <li><b>牌堆耗尽</b>：牌堆摸完仍未定牌，直接结算，总分最低者胜。</li>
            </ul>
            <button className="btn btn-primary" onClick={() => setShowRules(false)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

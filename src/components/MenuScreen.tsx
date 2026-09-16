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
  /** 返回主页（联机大厅） */
  onBack?: () => void;
}

export default function MenuScreen({ onStart, onBack }: Props) {
  const saved = loadSaved();
  const [playerCount, setPlayerCount] = useState(saved?.playerCount ?? 2);
  const [botCount, setBotCount] = useState(saved?.botCount ?? 1);
  const [avatar, setAvatar] = useState(loadAvatar());
  const [showRules, setShowRules] = useState(false);
  const [followWindowMs, setFollowWindowMs] = useState(saved?.followWindowMs ?? 3000);
  const [declareBonus, setDeclareBonus] = useState(saved?.declareBonus ?? true);
  const [allowSelfFollow, setAllowSelfFollow] = useState(saved?.allowSelfFollow ?? true);
  const [botMemory, setBotMemory] = useState(saved?.botMemory ?? 0.2);

  const maxBots = playerCount - 1;
  const validBotCount = Math.min(botCount, maxBots);

  function start() {
    const cfg: GameConfigUI = {
      playerCount,
      botCount: validBotCount,
      avatars: [avatar],
      followWindowMs,
      declareBonus,
      allowSelfFollow,
      botMemory,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    localStorage.setItem(AVATAR_KEY, avatar);
    onStart(cfg);
  }

  function startGuided() {
    localStorage.setItem(AVATAR_KEY, avatar);
    onStart({
      playerCount: 2,
      botCount: 1,
      avatars: [avatar],
      guided: true,
      botMemory: 0.4,
      followWindowMs,
      declareBonus,
      allowSelfFollow,
    });
  }

  return (
    <div className="menu">
      <h1 className="menu-title">♠ 换牌王 ♥</h1>
      <p className="menu-sub">本地模式 · 热座轮流操作或与机器人对战</p>

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
          <p className="hint">纯热座对战：{playerCount - validBotCount} 名真人轮流操作（共用此屏幕）</p>
        )}
      </div>

      <div className="menu-section">
        <label>我的头像</label>
        <AvatarPicker value={avatar} onChange={setAvatar} />
      </div>

      <div className="menu-section">
        <label>机器人难度（记忆误差）</label>
        <div className="btn-group">
          {[
            { v: 0.4, t: '新手（易记错）' },
            { v: 0.2, t: '标准' },
            { v: 0, t: '高手（完美记忆）' },
          ].map((o) => (
            <button
              key={o.v}
              className={botMemory === o.v ? 'btn btn-primary' : 'btn'}
              onClick={() => setBotMemory(o.v)}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <label>跟弃窗口时长</label>
        <div className="btn-group">
          {[2000, 3000, 4000].map((ms) => (
            <button
              key={ms}
              className={followWindowMs === ms ? 'btn btn-primary' : 'btn'}
              onClick={() => setFollowWindowMs(ms)}
            >
              {ms / 1000} 秒
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <label>游戏规则开关</label>
        <div className="btn-group">
          <button
            className={declareBonus ? 'btn btn-primary' : 'btn'}
            onClick={() => setDeclareBonus(!declareBonus)}
          >
            定牌奖励 {declareBonus ? '开' : '关'}
          </button>
          <button
            className={allowSelfFollow ? 'btn btn-primary' : 'btn'}
            onClick={() => setAllowSelfFollow(!allowSelfFollow)}
          >
            允许跟弃自己 {allowSelfFollow ? '开' : '关'}
          </button>
        </div>
      </div>

      <div className="menu-actions">
        <button className="btn btn-big btn-primary" onClick={start}>
          开始游戏
        </button>
        <button className="btn btn-big" onClick={startGuided}>
          🎓 引导局（新手教学）
        </button>
        <button className="btn btn-big" onClick={() => setShowRules(true)}>
          规则说明
        </button>
        {onBack && (
          <button className="btn" onClick={onBack}>
            返回主页
          </button>
        )}
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
              <li><b>定牌奖励（可开关）</b>：定牌时牌堆剩余 ≥60% 手牌总分 −2，≥35% −1。</li>
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

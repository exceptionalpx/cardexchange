// 小红书小工具本地大厅（xhs 模式主页）：纯单机入口，不联网。
// 保留：昵称/头像、机器人数量与难度、规则开关、教学引导、设置、规则说明。
// 隐藏：创建/加入房间、开放房间列表、观战、托管（联机概念，master 构建时自动恢复）。
import { useEffect, useState } from 'react';
import AvatarPicker, { AVATAR_KEY } from './AvatarPicker';
import RulesPanel from './RulesPanel';
import SettingsModal from './SettingsModal';
import { storage } from '../core/storage';
import { loadTheme, applyTheme } from './SettingsModal';
import type { GameConfigUI } from '../App';

/** 头像 → 默认昵称（玩家未输入昵称时，选动物头像自动填入；输入过则以玩家为准） */
const AVATAR_NAMES: Record<string, string> = {
  '🐱': '小猫咪',
  '🐶': '小狗狗',
  '🐰': '小兔子',
  '🐻': '小熊',
  '🦊': '小狐狸',
  '🐼': '小熊猫',
  '🐨': '小考拉',
  '🦁': '小狮子',
  '🐸': '小青蛙',
  '🐧': '小企鹅',
  '🦄': '小独角兽',
  '🐯': '小老虎',
};

interface Props {
  /** 开始单机对战（机器人 N 个） */
  onStart: (cfg: GameConfigUI) => void;
  /** 教学引导局 */
  onGuided: () => void;
}

export default function LocalLobby({ onStart, onGuided }: Props) {
  const [name, setName] = useState(() => storage.get('cardexchange-name') ?? '');
  const [nameAuto, setNameAuto] = useState(() => storage.get('cardexchange-name-auto') === '1');
  const [avatar, setAvatar] = useState(() => storage.get(AVATAR_KEY) ?? '');
  const [botCount, setBotCount] = useState(2);
  const [botMemory, setBotMemory] = useState(0.2);
  const [followMs, setFollowMs] = useState(3000);
  const [bonus, setBonus] = useState(true);
  const [selfFollow, setSelfFollow] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 挂载时应用已保存的主题
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);

  function changeAvatar(v: string) {
    setAvatar(v);
    storage.set(AVATAR_KEY, v);
    const animalName = AVATAR_NAMES[v];
    if (animalName && (!name.trim() || nameAuto)) {
      setName(animalName);
      setNameAuto(true);
      storage.set('cardexchange-name', animalName);
      storage.set('cardexchange-name-auto', '1');
    }
  }

  function start() {
    const finalName = name.trim() || AVATAR_NAMES[avatar] || '小玩家';
    storage.set('cardexchange-name', finalName);
    storage.set('cardexchange-name-auto', nameAuto ? '1' : '0');
    onStart({
      playerCount: 1 + botCount,
      botCount,
      avatars: [avatar || '🐱'],
      playerNames: [finalName],
      followWindowMs: followMs,
      declareBonus: bonus,
      allowSelfFollow: selfFollow,
      botMemory,
    });
  }

  return (
    <div className="menu">
      <h1 className="menu-title">换牌王</h1>
      <p className="hint">单机模式 · 与机器人同桌练手</p>

      <div className="menu-section">
        <label>昵称</label>
        <input
          className="text-input"
          value={name}
          maxLength={8}
          placeholder="输入你的昵称"
          onChange={(e) => {
            setName(e.target.value);
            setNameAuto(false);
          }}
        />
        <div className="avatar-lobby">
          <AvatarPicker value={avatar} onChange={changeAvatar} />
        </div>
      </div>

      <div className="menu-section">
        <label>🤖 机器人数量</label>
        <div className="btn-group">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={botCount === n ? 'btn btn-primary' : 'btn'}
              onClick={() => setBotCount(n)}
            >
              {n} 个
            </button>
          ))}
        </div>
      </div>

      <div className="menu-section">
        <label>🧠 机器人难度</label>
        <div className="btn-group">
          {[
            { v: 0.4, t: '新手' },
            { v: 0.2, t: '标准' },
            { v: 0, t: '高手' },
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
        <label>⚙️ 规则</label>
        <div className="btn-group">
          <button className={followMs === 2000 ? 'btn btn-primary' : 'btn'} onClick={() => setFollowMs(2000)}>
            跟弃 2 秒
          </button>
          <button className={followMs === 3000 ? 'btn btn-primary' : 'btn'} onClick={() => setFollowMs(3000)}>
            跟弃 3 秒
          </button>
          <button className={followMs === 4000 ? 'btn btn-primary' : 'btn'} onClick={() => setFollowMs(4000)}>
            跟弃 4 秒
          </button>
        </div>
        <div className="btn-group" style={{ marginTop: 8 }}>
          <button className={bonus ? 'btn btn-primary' : 'btn'} onClick={() => setBonus(!bonus)}>
            定牌奖励 {bonus ? '开' : '关'}
          </button>
          <button className={selfFollow ? 'btn btn-primary' : 'btn'} onClick={() => setSelfFollow(!selfFollow)}>
            跟弃自己 {selfFollow ? '开' : '关'}
          </button>
        </div>
      </div>

      <div className="menu-actions">
        <button className="btn btn-big btn-primary" onClick={start}>
          🃏 开始游戏（{1 + botCount} 人局）
        </button>
        <button className="btn" onClick={onGuided}>
          🎓 引导局（新手教学）
        </button>
      </div>

      <div className="menu-actions">
        <button className="btn" onClick={() => setSettingsOpen(true)}>
          ⚙️ 设置
        </button>
        <button className="btn" onClick={() => setShowRules(true)}>
          📜 规则
        </button>
      </div>

      {showRules && (
        <div className="modal-backdrop" onClick={() => setShowRules(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <RulesPanel inline />
            <button className="btn" onClick={() => setShowRules(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

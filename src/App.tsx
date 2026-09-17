import { useState } from 'react';
import GameScreen from './components/GameScreen';
import OnlineFlow from './components/OnlineFlow';
import WatchScreen from './components/WatchScreen';
import { loadAvatar } from './components/AvatarPicker';

export interface GameConfigUI {
  playerCount: number;
  botCount: number;
  /** 各座位头像（本地模式仅座位 0 可设置） */
  avatars?: string[];
  /** 跟弃窗口时长（毫秒）：联机读房间设置，本地默认 3000 */
  followWindowMs?: number;
  /** 定牌奖励开关：牌堆剩余 >=60% 减 2 分、>=35% 减 1 分 */
  declareBonus?: boolean;
  /** 是否允许跟弃自己（默认 true） */
  allowSelfFollow?: boolean;
  /** 机器人记忆误差：新手 0.4 / 标准 0.2 / 高手 0 */
  botMemory?: number;
  /** 引导局：固定牌序教学（1 真人 + 1 新手机器人） */
  guided?: boolean;
}

export default function App() {
  // 教学局：唯一本地入口（不联网，固定剧本教学）
  const [guidedCfg, setGuidedCfg] = useState<GameConfigUI | null>(null);
  // 观战：点击开放房间中"对局中"的房间进入（独立连接，不占座位）
  const [watchCode, setWatchCode] = useState<string | null>(null);

  if (guidedCfg) {
    return <GameScreen config={guidedCfg} onExit={() => setGuidedCfg(null)} />;
  }
  if (watchCode) {
    return <WatchScreen code={watchCode} onExit={() => setWatchCode(null)} />;
  }
  // 主页 = 联机大厅（创建/加入房间为主入口，教学局为次级入口）
  return (
    <OnlineFlow
      onGuided={() =>
        setGuidedCfg({ playerCount: 2, botCount: 1, guided: true, botMemory: 0.4, avatars: [loadAvatar()] })
      }
      onWatch={setWatchCode}
    />
  );
}

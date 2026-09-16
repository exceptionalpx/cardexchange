import { useState } from 'react';
import MenuScreen from './components/MenuScreen';
import GameScreen from './components/GameScreen';
import OnlineFlow from './components/OnlineFlow';

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

type Screen = 'home' | 'local';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<GameConfigUI | null>(null);

  if (screen === 'local' && config) {
    return <GameScreen config={config} onExit={() => setScreen('home')} />;
  }
  if (screen === 'local') {
    return (
      <MenuScreen
        onStart={(cfg) => {
          setConfig(cfg);
          setScreen('local');
        }}
        onBack={() => setScreen('home')}
      />
    );
  }
  // 主页 = 联机大厅（创建/加入房间为主入口，热座/引导为次级入口）
  return (
    <OnlineFlow
      onLocal={() => setScreen('local')}
      onGuided={() => {
        setConfig({ playerCount: 2, botCount: 1, guided: true, botMemory: 0.4 });
        setScreen('local');
      }}
    />
  );
}

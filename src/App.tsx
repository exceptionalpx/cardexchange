import { useState } from 'react';
import MenuScreen from './components/MenuScreen';
import GameScreen from './components/GameScreen';
import OnlineFlow from './components/OnlineFlow';

export interface GameConfigUI {
  playerCount: number;
  botCount: number;
  /** 各座位头像（本地模式仅座位 0 可设置） */
  avatars?: string[];
}

type Screen = 'menu' | 'local' | 'online';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [config, setConfig] = useState<GameConfigUI | null>(null);

  if (screen === 'local' && config) {
    return <GameScreen config={config} onExit={() => setScreen('menu')} />;
  }
  if (screen === 'online') {
    return <OnlineFlow onExit={() => setScreen('menu')} />;
  }
  return (
    <MenuScreen
      onStart={(cfg) => {
        setConfig(cfg);
        setScreen('local');
      }}
      onOnline={() => setScreen('online')}
    />
  );
}

import { useState } from 'react';
import MenuScreen from './components/MenuScreen';
import GameScreen from './components/GameScreen';

export interface GameConfigUI {
  playerCount: number;
  botCount: number;
}

export default function App() {
  const [config, setConfig] = useState<GameConfigUI | null>(null);

  if (!config) {
    return <MenuScreen onStart={(cfg) => setConfig(cfg)} />;
  }
  return (
    <GameScreen
      config={config}
      onExit={() => setConfig(null)}
    />
  );
}

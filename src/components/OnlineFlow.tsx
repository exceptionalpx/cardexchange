// 联机流程：连接管理 → 大厅 → 牌桌（服务器权威视图驱动）
import { useCallback, useEffect, useRef, useState } from 'react';
import { Net } from '../net/socket';
import type { Action } from '../core/types';
import type { ClientGameView } from '../../server/protocol';
import LobbyScreen, { ONLINE_KEY } from './LobbyScreen';
import GameScreen from './GameScreen';

interface Props {
  onExit: () => void;
}

interface SavedSession {
  code: string;
  playerId: number;
  name: string;
}

export default function OnlineFlow({ onExit }: Props) {
  const netRef = useRef<Net | null>(null);
  const [net, setNet] = useState<Net | null>(null);
  const [inGame, setInGame] = useState(false);
  const [view, setView] = useState<ClientGameView | null>(null);
  const [hostId, setHostId] = useState(-1);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const n = new Net();
    netRef.current = n;
    let cancelled = false;
    const off = n.onMessage((msg) => {
      switch (msg.type) {
        case 'gameStart': {
          setInGame(true);
          break;
        }
        case 'view':
          setView(msg.view);
          setInGame(true);
          break;
        case 'joined':
          setHostId(msg.hostId);
          break;
        case 'roomUpdate':
          setHostId(msg.hostId);
          break;
      }
    });
    n.connect()
      .then(() => {
        // StrictMode 双挂载：只有本实例仍存活时才生效
        if (cancelled) return;
        setNet(n);
        // 自动重连上次会话
        const raw = localStorage.getItem(ONLINE_KEY);
        if (raw) {
          try {
            const saved = JSON.parse(raw) as SavedSession;
            n.send({ type: 'rejoin', code: saved.code, playerId: saved.playerId, name: saved.name });
            n.setResume(() => ({
              type: 'rejoin',
              code: saved.code,
              playerId: saved.playerId,
              name: saved.name,
            }));
          } catch {
            localStorage.removeItem(ONLINE_KEY);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setConnectError('无法连接联机服务器，请先启动 npm run server');
      });
    return () => {
      cancelled = true;
      off();
      n.close();
    };
  }, []);

  const sendAction = useCallback(
    (a: Action) => {
      netRef.current?.send({ type: 'action', action: a });
    },
    [],
  );

  const restart = useCallback(() => {
    netRef.current?.send({ type: 'restart' });
  }, []);

  const leave = useCallback(() => {
    localStorage.removeItem(ONLINE_KEY);
    netRef.current?.setResume(null);
    netRef.current?.close();
    onExit();
  }, [onExit]);

  if (connectError) {
    return (
      <div className="menu">
        <h1 className="menu-title">联机对战</h1>
        <p className="hint hint-error">{connectError}</p>
        <div className="menu-actions">
          <button className="btn btn-big" onClick={onExit}>
            返回主菜单
          </button>
        </div>
      </div>
    );
  }

  if (!net) {
    return (
      <div className="menu">
        <h1 className="menu-title">联机对战</h1>
        <p className="hint">正在连接服务器…</p>
      </div>
    );
  }

  if (inGame && view) {
    return (
      <GameScreen
        online={{
          view,
          myId: view.viewerId,
          send: sendAction,
          onRestart: restart,
          canRestart: view.viewerId === hostId,
          onExit: leave,
        }}
        onExit={leave}
      />
    );
  }

  return <LobbyScreen net={net} onEnterGame={() => setInGame(true)} onLeave={leave} />;
}

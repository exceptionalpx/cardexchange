// 联机流程：连接管理 → 主页大厅 → 房间 → 牌桌（服务器权威视图驱动）
import { useCallback, useEffect, useRef, useState } from 'react';
import { Net } from '../net/socket';
import type { Action } from '../core/types';
import type { ClientGameView } from '../../server/protocol';
import LobbyScreen, { ONLINE_KEY } from './LobbyScreen';
import GameScreen from './GameScreen';
import { loadAvatar } from './AvatarPicker';

interface Props {
  /** 直接开始引导局（固定剧本 + 新手机器人） */
  onGuided: () => void;
}

interface SavedSession {
  code: string;
  playerId: number;
  name: string;
}

interface RoomSeatView {
  id: number;
  name: string;
  isBot: boolean;
  avatar?: string;
  taken: boolean;
  ready: boolean;
}

interface RoomView {
  code: string;
  seats: RoomSeatView[];
  canStart: boolean;
  hostId: number;
  myId: number;
  totalScores: Record<number, number>;
  gamesPlayed: number;
  inGame: boolean;
}
export default function OnlineFlow({ onGuided }: Props) {
  const netRef = useRef<Net | null>(null);
  const [net, setNet] = useState<Net | null>(null);
  const [inGame, setInGame] = useState(false);
  const [view, setView] = useState<ClientGameView | null>(null);
  const [hostId, setHostId] = useState(-1);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [emojiEvent, setEmojiEvent] = useState<{ from: number; label: string; ts: number } | null>(null);
  /** 本地保存的会话：首页显示"回到对局"入口（不自动重进） */
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  /** 退出对局时服务器回执的房间数据（对局进行中） */
  const [pendingRoom, setPendingRoom] = useState<RoomView | null>(null);
  /** 已退出对局：忽略广播的 view 消息（否则会被拉回对局） */
  const exitedRef = useRef(false);

  useEffect(() => {
    const n = new Net();
    netRef.current = n;
    let cancelled = false;
    const off = n.onMessage((msg) => {
      switch (msg.type) {
        case 'gameStart': {
          exitedRef.current = false;
          setInGame(true);
          break;
        }
        case 'view':
          setView(msg.view);
          if (!exitedRef.current) setInGame(true);
          break;
        case 'emoji':
          setEmojiEvent({ from: msg.from, label: msg.emoji, ts: Date.now() });
          break;
        case 'exitGame':
          exitedRef.current = true;
          setInGame(false);
          setPendingRoom({
            code: msg.code,
            seats: msg.seats,
            canStart: msg.canStart,
            hostId: msg.hostId,
            myId: msg.playerId ?? 0,
            totalScores: msg.totalScores ?? {},
            gamesPlayed: msg.gamesPlayed ?? 0,
            inGame: msg.inGame,
          });
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
        // 不自动重进：本地保存的会话用于首页"回到对局"入口（由玩家选择）
        const raw = localStorage.getItem(ONLINE_KEY);
        if (raw) {
          try {
            const saved = JSON.parse(raw) as SavedSession;
            const savedAvatar = loadAvatar();
            setSavedSession(saved);
            n.setResume(() => ({
              type: 'rejoin',
              code: saved.code,
              playerId: saved.playerId,
              name: saved.name,
              avatar: savedAvatar,
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

  const sendEmoji = useCallback((label: string) => {
    netRef.current?.send({ type: 'emoji', emoji: label });
  }, []);

  const restart = useCallback(() => {
    netRef.current?.send({ type: 'restart' });
  }, []);

  /** 对局中退出：座位保留、回合由服务器托管，回到房间等待页 */
  const onExitGame = useCallback(() => {
    netRef.current?.send({ type: 'exitGame' });
  }, []);

  const leave = useCallback(() => {
    localStorage.removeItem(ONLINE_KEY);
    netRef.current?.setResume(null);
    netRef.current?.close();
    // 主页大厅常驻：退出房间/对局后重载页面，回到大厅（会话已清除，不会自动重连房间）
    window.location.reload();
  }, []);

  if (connectError) {
    return (
      <div className="menu">
        <h1 className="menu-title">联机对战</h1>
        <p className="hint hint-error">{connectError}</p>
        <div className="menu-actions">
          <button className="btn btn-big" onClick={onGuided}>
            🎓 引导局（本地教学）
          </button>
        </div>
      </div>
    );
  }

  if (!net) {
    return (
      <div className="menu">
        <h1 className="menu-title">换牌王</h1>
        <p className="hint">正在连接联机服务器…</p>
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
          sendEmoji,
          emojiEvent,
          onRestart: restart,
          canRestart: view.viewerId === hostId,
          onExit: onExitGame,
          onExitGame,
        }}
        onExit={leave}
      />
    );
  }

  return (
    <LobbyScreen
      net={net}
      onEnterGame={() => setInGame(true)}
      onGuided={onGuided}
      saved={savedSession}
      initialRoom={pendingRoom}
    />
  );
}

import { useEffect, useRef, useState } from 'react';
import type { Net } from '../net/socket';
import type { RoomSeatInfo } from '../../server/protocol';

export const ONLINE_KEY = 'cardexchange-online';

interface RoomView {
  code: string;
  seats: RoomSeatInfo[];
  canStart: boolean;
  hostId: number;
  myId: number;
}

interface Props {
  net: Net;
  /** 服务器下发 gameStart（对局开始），切换到牌桌 */
  onEnterGame: () => void;
  /** 离开大厅/房间，返回主菜单 */
  onLeave: () => void;
}

export default function LobbyScreen({ net, onEnterGame, onLeave }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('cardexchange-name') ?? '');
  const [totalPlayers, setTotalPlayers] = useState(4);
  const [botCount, setBotCount] = useState(2);
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const myIdRef = useRef(-1);

  useEffect(() => {
    const off = net.onMessage((msg) => {
      switch (msg.type) {
        case 'joined': {
          myIdRef.current = msg.playerId;
          setRoom({
            code: msg.code,
            seats: msg.seats,
            canStart: msg.canStart,
            hostId: msg.hostId,
            myId: msg.playerId,
          });
          setError(null);
          localStorage.setItem('cardexchange-name', nameRef.current);
          localStorage.setItem(
            ONLINE_KEY,
            JSON.stringify({ code: msg.code, playerId: msg.playerId, name: nameRef.current }),
          );
          net.setResume(() => ({
            type: 'rejoin',
            code: msg.code,
            playerId: msg.playerId,
            name: nameRef.current,
          }));
          break;
        }
        case 'roomUpdate':
          setRoom({
            code: msg.code,
            seats: msg.seats,
            canStart: msg.canStart,
            hostId: msg.hostId,
            myId: myIdRef.current,
          });
          setError(null);
          break;
        case 'gameStart':
          onEnterGame();
          break;
        case 'roomClosed':
          localStorage.removeItem(ONLINE_KEY);
          setRoom(null);
          setError(msg.message);
          break;
        case 'error':
          setError(msg.message);
          break;
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);

  const maxBots = totalPlayers - 1;

  function leave() {
    localStorage.removeItem(ONLINE_KEY);
    net.setResume(null);
    onLeave();
  }

  if (room) {
    return (
      <div className="menu lobby">
        <h1 className="menu-title">房间 {room.code}</h1>
        <p className="menu-sub">把房间码告诉朋友，同一网络下即可加入</p>

        <div className="room-seats">
          {room.seats.map((s) => (
            <div key={s.id} className={`room-seat ${s.id === room.myId ? 'room-seat-me' : ''}`}>
              <span className="room-seat-name">
                座位 {s.id + 1}：{s.name}
              </span>
              {s.id === room.hostId && <span className="badge">房主</span>}
              {s.id === room.myId && <span className="badge">你</span>}
              {!s.taken && <span className="badge badge-wait">等待加入</span>}
              {s.isBot && <span className="badge">机器人</span>}
            </div>
          ))}
        </div>

        <div className="menu-actions">
          {room.myId === room.hostId ? (
            <button
              className="btn btn-big btn-primary"
              disabled={!room.canStart}
              onClick={() => net.send({ type: 'startGame' })}
            >
              {room.canStart ? '开始游戏' : '等待玩家加入…'}
            </button>
          ) : (
            <p className="hint">等待房主开始游戏…</p>
          )}
          <button className="btn btn-big" onClick={leave}>
            离开房间
          </button>
        </div>
        {error && <p className="hint hint-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="menu lobby">
      <h1 className="menu-title">♠ 联机对战 ♥</h1>
      <p className="menu-sub">电脑本机运行服务器，朋友连同一 WiFi/热点即可同局对战</p>

      <div className="menu-section">
        <label>昵称</label>
        <input
          className="text-input"
          value={name}
          maxLength={8}
          placeholder="输入你的昵称"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="lobby-cols">
        <div className="lobby-col">
          <div className="menu-section">
            <label>创建房间 · 人数</label>
            <div className="btn-group">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={n === totalPlayers ? 'btn btn-primary' : 'btn'}
                  onClick={() => {
                    setTotalPlayers(n);
                    setBotCount((b) => Math.min(b, n - 1));
                  }}
                >
                  {n} 人
                </button>
              ))}
            </div>
          </div>
          <div className="menu-section">
            <label>机器人数量</label>
            <div className="btn-group">
              {Array.from({ length: maxBots + 1 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  className={n === botCount ? 'btn btn-primary' : 'btn'}
                  onClick={() => setBotCount(n)}
                >
                  {n} 个
                </button>
              ))}
            </div>
            <p className="hint">还需 {Math.max(0, totalPlayers - botCount - 1)} 位真人加入</p>
          </div>
          <button
            className="btn btn-big btn-primary"
            disabled={!name.trim()}
            onClick={() => net.send({ type: 'createRoom', name, totalPlayers, botCount })}
          >
            创建房间
          </button>
        </div>

        <div className="lobby-col">
          <div className="menu-section">
            <label>加入房间</label>
            <input
              className="text-input"
              value={joinCode}
              maxLength={4}
              placeholder="输入 4 位房间码"
              style={{ textTransform: 'uppercase' }}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            />
          </div>
          <button
            className="btn btn-big"
            disabled={!name.trim() || joinCode.length !== 4}
            onClick={() => net.send({ type: 'joinRoom', code: joinCode, name })}
          >
            加入房间
          </button>
        </div>
      </div>

      <div className="menu-actions">
        <button className="btn" onClick={onLeave}>
          返回主菜单
        </button>
      </div>
      {error && <p className="hint hint-error">{error}</p>}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Net } from '../net/socket';
import type { RoomSeatInfo } from '../../server/protocol';
import AvatarPicker, { loadAvatar, AVATAR_KEY } from './AvatarPicker';

export const ONLINE_KEY = 'cardexchange-online';

/** GET /api/rooms 返回的开放房间摘要 */
interface OpenRoom {
  code: string;
  hostName: string;
  humanFilled: number;
  humanTotal: number;
  inGame: boolean;
}

interface RoomView {
  code: string;
  seats: RoomSeatInfo[];
  canStart: boolean;
  hostId: number;
  myId: number;
  totalScores: Record<number, number>;
  gamesPlayed: number;
}

interface Props {
  net: Net;
  /** 服务器下发 gameStart（对局开始），切换到牌桌 */
  onEnterGame: () => void;
  /** 热座模式（本地配置页） */
  /** 引导局（直接开始教学对局） */
  onGuided: () => void;
}
export default function LobbyScreen({ net, onEnterGame, onGuided }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('cardexchange-name') ?? '');
  const [avatar, setAvatar] = useState(loadAvatar());
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  // 建房房间设置（创建时随 createRoom 下发）
  const [createFollowMs, setCreateFollowMs] = useState(3000);
  const [createBonus, setCreateBonus] = useState(true);
  const [createSelfFollow, setCreateSelfFollow] = useState(true);
  const [createBotMemory, setCreateBotMemory] = useState(0.2);
  const nameRef = useRef(name);
  nameRef.current = name;
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;
  const myIdRef = useRef(-1);

  function changeAvatar(v: string) {
    setAvatar(v);
    localStorage.setItem(AVATAR_KEY, v);
  }

  // ---- 开放房间列表：进入大厅拉取 + 每 5 秒轮询 + 手动刷新 ----
  const loadRooms = useCallback(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((data: { rooms: OpenRoom[] }) => setOpenRooms(data.rooms ?? []))
      .catch(() => setOpenRooms([]));
  }, []);

  useEffect(() => {
    if (room) return; // 已进房间不再轮询
    loadRooms();
    const t = setInterval(loadRooms, 5000);
    return () => clearInterval(t);
  }, [room, loadRooms]);

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
            totalScores: msg.totalScores ?? {},
            gamesPlayed: msg.gamesPlayed ?? 0,
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
            avatar: avatarRef.current,
          }));
          break;
        }
        case 'roomUpdate':
          setRoom((prev) => ({
            code: msg.code,
            seats: msg.seats,
            canStart: msg.canStart,
            hostId: msg.hostId,
            myId: prev?.myId ?? myIdRef.current,
            totalScores: msg.totalScores ?? {},
            gamesPlayed: msg.gamesPlayed ?? 0,
          }));
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

  function leave() {
    localStorage.removeItem(ONLINE_KEY);
    net.setResume(null);
  }

  if (room) {
    const isHost = room.myId === room.hostId;
    const me = room.seats.find((s) => s.id === room.myId);
    const humanCount = room.seats.filter((s) => !s.isBot && s.taken).length;
    const botCount = room.seats.filter((s) => s.isBot).length;
    const total = humanCount + botCount;
    const waiting = room.seats.some((s) => !s.taken);
    return (
      <div className="menu lobby">
        <h1 className="menu-title">房间 {room.code}</h1>
        <p className="menu-sub">把房间码告诉朋友即可加入 · 机器人可由房主添加</p>

        <div className="room-seats">
          {room.seats.map((s) => (
            <div key={s.id} className={`room-seat ${s.id === room.myId ? 'room-seat-me' : ''}`}>
              <span className="room-seat-name">
                {s.avatar && <span className="avatar avatar-sm">{s.avatar}</span>}
                座位 {s.id + 1}：{s.taken ? s.name : '空位'}
              </span>
              {s.id === room.hostId && <span className="badge">房主</span>}
              {s.id === room.myId && <span className="badge">你</span>}
              {!s.taken && <span className="badge badge-wait">等待加入</span>}
              {s.isBot && <span className="badge">机器人</span>}
              {s.taken && !s.isBot && (
                <span className={`badge ${s.ready ? 'badge-ready' : 'badge-wait'}`}>
                  {s.ready ? '已准备' : '未准备'}
                </span>
              )}
            </div>
          ))}
        </div>

        {room.gamesPlayed > 0 && (
          <div className="room-scoreboard">
            已玩 {room.gamesPlayed} 局 · 累计总分（最小者领先）：
            {room.seats
              .filter((s) => s.taken)
              .map((s) => (
                <span key={s.id} className="room-score-item">
                  {s.name} {room.totalScores[s.id] ?? 0}
                </span>
              ))}
          </div>
        )}

        <div className="menu-actions">
          {isHost ? (
            <>
              <button
                className="btn"
                disabled={!waiting}
                onClick={() => net.send({ type: 'addBot' })}
              >
                添加机器人
              </button>
              <button
                className="btn"
                disabled={botCount === 0}
                onClick={() => net.send({ type: 'removeBot' })}
              >
                移除机器人
              </button>
              <button
                className="btn btn-big btn-primary"
                disabled={!room.canStart}
                onClick={() => net.send({ type: 'startGame' })}
              >
                {room.canStart
                  ? `开始游戏（${total} 人）`
                  : total < 2
                    ? '至少 2 人才能开始'
                    : '等待所有人准备…'}
              </button>
            </>
          ) : (
            <p className="hint">等待房主开始游戏…</p>
          )}
          {me && !me.isBot && (
            <button
              className="btn btn-big"
              onClick={() => net.send({ type: 'ready', ready: !me.ready })}
            >
              {me.ready ? '取消准备' : '准备'}
            </button>
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
      <p className="menu-sub">公网联机 · 创建房间后可添加机器人或等待朋友加入</p>

      <div className="menu-section">
        <label>昵称</label>
        <input
          className="text-input"
          value={name}
          maxLength={8}
          placeholder="输入你的昵称"
          onChange={(e) => setName(e.target.value)}
        />
        <div className="avatar-lobby">
          <AvatarPicker value={avatar} onChange={changeAvatar} />
        </div>
      </div>

      <div className="lobby-cols">
        <div className="lobby-col">
          <div className="menu-section">
            <button
              className="btn btn-big btn-primary"
              onClick={() => {
                if (!name.trim()) {
                  setError('请先输入昵称');
                  return;
                }
                net.send({ type: 'createRoom', name, avatar, config: { followWindowMs: createFollowMs, declareBonus: createBonus, allowSelfFollow: createSelfFollow, botMemory: createBotMemory } });
              }}
            >
              创建房间
            </button>
            <p className="hint">创建后可在房间内添加机器人（1~3 个）或等待玩家加入，最多 4 人</p>
            <details className="room-settings">
              <summary>⚙ 房间设置</summary>
              <div className="settings-grid">
                <div>
                  <label>跟弃窗口</label>
                  <div className="btn-group">
                    {[2000, 3000, 4000].map((ms) => (
                      <button key={ms} className={createFollowMs === ms ? "btn btn-primary" : "btn"} onClick={() => setCreateFollowMs(ms)}>
                        {ms / 1000} 秒
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label>机器人难度</label>
                  <div className="btn-group">
                    {[
                      { v: 0.4, t: "新手" },
                      { v: 0.2, t: "标准" },
                      { v: 0, t: "高手" },
                    ].map((o) => (
                      <button key={o.v} className={createBotMemory === o.v ? "btn btn-primary" : "btn"} onClick={() => setCreateBotMemory(o.v)}>
                        {o.t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label>规则开关</label>
                  <div className="btn-group">
                    <button className={createBonus ? "btn btn-primary" : "btn"} onClick={() => setCreateBonus(!createBonus)}>定牌奖励 {createBonus ? "开" : "关"}</button>
                    <button className={createSelfFollow ? "btn btn-primary" : "btn"} onClick={() => setCreateSelfFollow(!createSelfFollow)}>跟弃自己 {createSelfFollow ? "开" : "关"}</button>
                  </div>
                </div>
              </div>
            </details>
          </div>
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
            onClick={() => {
              if (!name.trim()) {
                setError('请先输入昵称');
                return;
              }
              if (joinCode.trim().length !== 4) {
                setError('请输入 4 位房间码');
                return;
              }
              net.send({ type: 'joinRoom', code: joinCode, name, avatar });
            }}
          >
            加入房间
          </button>

          <div className="menu-section room-list-section">
            <div className="room-list-head">
              <label>开放房间</label>
              <button className="btn btn-small" onClick={loadRooms}>
                刷新
              </button>
            </div>
            {openRooms.length === 0 ? (
              <p className="hint">暂无开放房间，创建一个吧</p>
            ) : (
              <div className="room-list">
                {openRooms.map((r) => {
                  const full = r.humanFilled >= r.humanTotal || r.inGame;
                  return (
                    <button
                      key={r.code}
                      className={`room-item ${full ? 'room-item-disabled' : ''}`}
                      disabled={full}
                      onClick={() => {
                        if (!name.trim()) {
                          setError('请先输入昵称');
                          return;
                        }
                        net.send({ type: 'joinRoom', code: r.code, name, avatar });
                      }}
                    >
                      <span className="room-item-host">{r.hostName}</span>
                      <span>
                        真人 {r.humanFilled}/{r.humanTotal}
                      </span>
                      <span className="badge">{r.inGame ? '对局中' : full ? '已满' : '可加入'}</span>
                      <span className="room-item-code">{r.code}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="menu-actions menu-actions-sub">
        <button className="btn" onClick={onGuided}>
          🎓 引导局（新手教学）
        </button>
      </div>
      {error && <p className="hint hint-error">{error}</p>}
    </div>
  );
}

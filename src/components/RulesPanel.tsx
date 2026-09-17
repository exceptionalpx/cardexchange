// 规则说明（主页大厅 / 对局内共用）
import type { ReactNode } from 'react';
export const RULES: ReactNode[] = [
  <>定牌后手牌总分<b>最小</b>者胜（并列同胜）</>,
  <>大小王 0 分 · ♥K -1 分 · A~K = 1~13</>,
  <>7/8 看自己 · 9/10 看别人 · J/Q 暗换 · K 明换</>,
  <>弃牌不补牌；同分可跟弃，抢先成功，失败罚补 1 张</>,
  <>自己回合可定牌，其余人各操作一轮后终局</>,
  <>定牌奖励（可开关）：定牌时牌堆剩余 ≥60% 手牌总分 −2，≥35% −1</>,
  <>牌堆耗尽：总分最低者胜</>,
];

export default function RulesPanel({ inline }: { inline?: boolean }) {
  return (
    <div className={inline ? 'rules-panel rules-panel-inline' : 'rules-panel'}>
      <div className="pile-label">规则</div>
      <ul>
        {RULES.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

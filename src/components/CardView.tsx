import type { Card } from '../core/types';
import { scoreOf } from '../core/score';

export function cardLabel(card: Card): string {
  if (card.rank === 'JOKER_BIG') return '大王';
  if (card.rank === 'JOKER_SMALL') return '小王';
  const suitMap: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
  return `${suitMap[card.suit as string]}${card.rank}`;
}

export function isRed(card: Card): boolean {
  return card.suit === 'hearts' || card.suit === 'diamonds' || card.rank === 'JOKER_BIG';
}

/** 功能牌短标注（印在牌面上；无功能的普通牌返回 null） */
export function abilityDesc(card: Card): string | null {
  switch (card.rank) {
    case '7':
    case '8':
      return '看自己牌';
    case '9':
    case '10':
      return '看他人牌';
    case 'J':
    case 'Q':
      return '暗换';
    case 'K':
      return '明换';
    default:
      return null;
  }
}

interface Props {
  card: Card | null;
  known: boolean;
  faceUp?: boolean; // 强制正面（发牌确认阶段）
  onClick?: () => void;
  selectable?: boolean;
  highlight?: boolean;
  /** 附加样式类（如最新弃牌黑框） */
  extraClass?: string;
  /** 牌面底部功能标注（如"看自己牌"，仅摸牌展示用） */
  footNote?: string;
}

export default function CardView({
  card,
  known,
  faceUp,
  onClick,
  selectable,
  highlight,
  extraClass,
  footNote,
}: Props) {
  if (!card) {
    return <div className="card card-empty" />;
  }

  const show = known || faceUp;
  const classes = ['card'];
  if (!show) classes.push('card-back');
  if (selectable) classes.push('card-selectable');
  if (highlight) classes.push('card-highlight');
  if (show && isRed(card)) classes.push('card-red');
  if (extraClass) classes.push(extraClass);

  if (!show) {
    return <div className={classes.join(' ')} onClick={onClick}>?</div>;
  }

  const score = scoreOf(card);
  return (
    <div className={classes.join(' ')} onClick={onClick}>
      <div className="card-corner">{cardLabel(card)}</div>
      <div className="card-score">{score > 0 ? `+${score}` : score}</div>
      {footNote && <div className="card-footnote">{footNote}</div>}
    </div>
  );
}

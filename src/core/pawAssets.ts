// 头像 → 换牌动画爪型素材映射（方案C：12 动物专属爪 + 机器人机械手）
// 素材：public/paws/*.png（透明底 PNG，由 AI 生成后去背景）
const PAW_ASSETS: Record<string, string> = {
  '🐯': '/paws/tiger.png',
  '🦁': '/paws/lion.png',
  '🐼': '/paws/panda.png',
  '🐨': '/paws/koala.png',
  '🦊': '/paws/fox.png',
  '🐸': '/paws/frog.png',
  '🐧': '/paws/penguin.png',
  '🐰': '/paws/rabbit.png',
  '🐶': '/paws/dog.png',
  '🐱': '/paws/cat.png',
  '🦄': '/paws/unicorn.png',
  '🐻': '/paws/bear.png',
  '🤖': '/paws/robot.png',
};

/** 兜底：自定义上传头像（dataURL）与未匹配头像一律用猫爪 */
export const DEFAULT_PAW = '/paws/cat.png';

export function pawForAvatar(avatar?: string): string {
  if (!avatar || avatar.startsWith('data:')) return DEFAULT_PAW;
  return PAW_ASSETS[avatar] ?? DEFAULT_PAW;
}

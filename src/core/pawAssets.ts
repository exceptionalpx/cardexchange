// 头像 → 换牌动画爪型素材映射（方案C：12 动物专属爪 + 机器人机械手）
// 素材：public/paws/*.webp（透明底 WebP，AI 生成后去背景、压缩）
// 路径用相对引用（./paws）：zip 离线包以 file:// 加载，绝对路径 /paws 在容器内不可用
const PAW_ASSETS: Record<string, string> = {
  '🐯': './paws/tiger.webp',
  '🦁': './paws/lion.webp',
  '🐼': './paws/panda.webp',
  '🐨': './paws/koala.webp',
  '🦊': './paws/fox.webp',
  '🐸': './paws/frog.webp',
  '🐧': './paws/penguin.webp',
  '🐰': './paws/rabbit.webp',
  '🐶': './paws/dog.webp',
  '🐱': './paws/cat.webp',
  '🦄': './paws/unicorn.webp',
  '🐻': './paws/bear.webp',
  '🤖': './paws/robot.webp',
};

/** 兜底：自定义上传头像（dataURL）与未匹配头像一律用猫爪 */
export const DEFAULT_PAW = './paws/cat.webp';

export function pawForAvatar(avatar?: string): string {
  if (!avatar || avatar.startsWith('data:')) return DEFAULT_PAW;
  return PAW_ASSETS[avatar] ?? DEFAULT_PAW;
}

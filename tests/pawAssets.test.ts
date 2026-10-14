// 换牌动画爪型素材映射测试（方案C：12 动物专属爪 + 机器人机械手）
// 注：小红书离线包要求相对路径 + webp 体积；master 构建同样使用这些相对路径（base='/' 下 './paws' 仍解析正常）
import { describe, expect, it } from 'vitest';
import { pawForAvatar, DEFAULT_PAW } from '../src/core/pawAssets';

describe('pawForAvatar', () => {
  it('12 个内置动物头像各自映射到专属爪型', () => {
    const map: Record<string, string> = {
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
    };
    for (const [avatar, expectUrl] of Object.entries(map)) {
      expect(pawForAvatar(avatar)).toBe(expectUrl);
    }
  });

  it('机器人头像使用机械手', () => {
    expect(pawForAvatar('🤖')).toBe('./paws/robot.webp');
  });

  it('自定义上传头像（dataURL）兜底为猫爪', () => {
    expect(pawForAvatar('data:image/png;base64,abc')).toBe(DEFAULT_PAW);
    expect(DEFAULT_PAW).toBe('./paws/cat.webp');
  });

  it('未知/空头像兜底为猫爪', () => {
    expect(pawForAvatar(undefined)).toBe(DEFAULT_PAW);
    expect(pawForAvatar('')).toBe(DEFAULT_PAW);
    expect(pawForAvatar('🐉')).toBe(DEFAULT_PAW);
  });

  it('素材文件必须存在（public/paws 下与映射一一对应）', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pawDir = path.join(__dirname, '..', 'public', 'paws');
    const names = [
      'tiger', 'lion', 'panda', 'koala', 'fox', 'frog', 'penguin',
      'rabbit', 'dog', 'cat', 'unicorn', 'bear', 'robot',
    ];
    for (const n of names) {
      expect(fs.existsSync(path.join(pawDir, `${n}.webp`)), `${n}.webp 缺失`).toBe(true);
    }
  });
});

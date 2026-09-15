// 换牌动画爪型素材映射测试（方案C：12 动物专属爪 + 机器人机械手）
import { describe, expect, it } from 'vitest';
import { pawForAvatar, DEFAULT_PAW } from '../src/core/pawAssets';

describe('pawForAvatar', () => {
  it('12 个内置动物头像各自映射到专属爪型', () => {
    const map: Record<string, string> = {
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
    };
    for (const [avatar, expectUrl] of Object.entries(map)) {
      expect(pawForAvatar(avatar)).toBe(expectUrl);
    }
  });

  it('机器人头像使用机械手', () => {
    expect(pawForAvatar('🤖')).toBe('/paws/robot.png');
  });

  it('自定义上传头像（dataURL）兜底为猫爪', () => {
    expect(pawForAvatar('data:image/png;base64,abc')).toBe(DEFAULT_PAW);
    expect(DEFAULT_PAW).toBe('/paws/cat.png');
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
      expect(fs.existsSync(path.join(pawDir, `${n}.png`)), `${n}.png 缺失`).toBe(true);
    }
  });
});

// 头像选择器：12 个内置可爱图标 + 支持上传本地图片（压缩 ≤64px 转 dataURL）
import { useRef } from 'react';

export const AVATAR_EMOJIS = ['🐱', '🐶', '🐰', '🐻', '🦊', '🐼', '🐨', '🦁', '🐸', '🐧', '🦄', '🐯'];

export const AVATAR_KEY = 'cardexchange-avatar';

export function loadAvatar(): string {
  return localStorage.getItem(AVATAR_KEY) ?? '';
}

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function AvatarPicker({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        onChange(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-grid">
        {AVATAR_EMOJIS.map((a) => (
          <button
            key={a}
            type="button"
            className={`avatar-opt ${value === a ? 'avatar-opt-active' : ''}`}
            onClick={() => onChange(a)}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="avatar-row">
        <span className="avatar avatar-preview">{value || '❓'}</span>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
        <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
          上传头像
        </button>
        {value && (
          <button type="button" className="btn btn-small" onClick={() => onChange('')}>
            清除
          </button>
        )}
      </div>
    </div>
  );
}

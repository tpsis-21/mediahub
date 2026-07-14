import { drawRoundedRect } from './canvas';

export const drawRankBadgeSquare = (args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  text: string;
}) => {
  const { ctx, x, y, size, text } = args;
  const badgeGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  badgeGradient.addColorStop(0, '#fbbf24');
  badgeGradient.addColorStop(1, '#d97706');
  ctx.fillStyle = badgeGradient;
  drawRoundedRect(ctx, x, y, size, size, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, x, y, size, size, 14);
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = `900 ${Math.max(16, Math.round(size * 0.40))}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size / 2, y + size / 2);
  ctx.textBaseline = 'alphabetic';
};

export const drawRankBadgeCircle = (args: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  text: string;
  isTopOne?: boolean;
}) => {
  const { ctx, x, y, size, text, isTopOne = false } = args;
  const badgeGradient = ctx.createLinearGradient(x, y, x + size, y + size);
  badgeGradient.addColorStop(0, isTopOne ? '#fbbf24' : '#fcd34d');
  badgeGradient.addColorStop(1, '#78350f');
  ctx.fillStyle = badgeGradient;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = `900 ${Math.max(18, Math.round(size * 0.48))}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + size / 2, y + size / 2);
  ctx.textBaseline = 'alphabetic';
};

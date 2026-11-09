export const PIECE_COLORS = Object.freeze({
  I: '#82D8C5', O: '#D8D66B', T: '#CE6B9C', S: '#86B98A',
  Z: '#C77772', J: '#6689C5', L: '#F27A52',
});

/** A screen pixel, not a mechanical key: flat color, dark gap and one faint top edge. */
export function paintCell(context, x, y, width, height, color, { ghost = false, active = false } = {}) {
  const inset = Math.max(.75, Math.min(width, height) * .04);
  const left = x + inset, top = y + inset;
  const w = Math.max(0, width - inset * 2), h = Math.max(0, height - inset * 2);
  context.save();
  context.shadowBlur = 0;
  if (ghost) {
    context.globalAlpha = .78;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1, Math.min(width, height) * .055);
    context.strokeRect(left + .5, top + .5, Math.max(0, w - 1), Math.max(0, h - 1));
    context.globalAlpha = .025;
    context.fillStyle = color;
    context.fillRect(left, top, w, h);
  } else {
    context.fillStyle = color;
    context.fillRect(left, top, w, h);
    context.fillStyle = active ? '#E2E4DD55' : '#E2E4DD30';
    context.fillRect(left, top, w, Math.min(1, h));
    context.fillStyle = '#070a0b45';
    context.fillRect(left, top + h - Math.min(2, h), w, Math.min(2, h));
    context.fillRect(left + w - Math.min(1, w), top, Math.min(1, w), h);
  }
  context.restore();
}

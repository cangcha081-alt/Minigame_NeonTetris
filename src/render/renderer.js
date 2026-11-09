import { BOARD_WIDTH, BOARD_HEIGHT } from '../core/board.js';
import { buildRenderModel, getPreviewModel } from './render-model.js';
import { PIECE_COLORS, paintCell } from './piece-painter.js';

function surface(canvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable');
  return { canvas, context };
}

function resize({ canvas, context }) {
  const { width, height } = canvas.getBoundingClientRect();
  if (width <= 0 || height <= 0) return null;
  const view = canvas.ownerDocument?.defaultView ?? globalThis;
  const dpr = Math.max(1, Math.min(view.devicePixelRatio || 1, 2));
  const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function themeFor(canvas) {
  const doc = canvas.ownerDocument;
  const style = doc?.defaultView?.getComputedStyle(doc.documentElement);
  const read = (key, fallback) => style?.getPropertyValue(key).trim() || fallback;
  return {
    board: read('--color-board', '#101416'),
    grid: read('--color-grid', '#273032'),
    colors: Object.fromEntries(Object.entries(PIECE_COLORS).map(([type, color]) => [type, read(`--piece-${type.toLowerCase()}`, color)])),
  };
}

function preview(target, type, theme) {
  if (!target) return;
  const dimensions = resize(target);
  if (!dimensions) return;
  const { context } = target;
  const { width, height } = dimensions;
  context.fillStyle = theme.board;
  context.fillRect(0, 0, width, height);
  const model = getPreviewModel(type);
  if (!model) return;
  const size = Math.max(1, Math.floor(Math.min((width - 20) / 4, (height - 16) / 2, 23)));
  const left = (width - model.width * size) / 2;
  const top = (height - model.height * size) / 2;
  for (const cell of model.cells) paintCell(context, left + cell.x * size, top + cell.y * size, size, size, theme.colors[cell.type]);
}

export function createRenderer(canvas, { nextCanvas, holdCanvas } = {}) {
  const boardSurface = surface(canvas);
  const nextSurface = nextCanvas ? surface(nextCanvas) : null;
  const holdSurface = holdCanvas ? surface(holdCanvas) : null;
  let disposed = false;
  return {
    draw(snapshot = {}) {
      if (disposed) return;
      const dimensions = resize(boardSurface);
      if (!dimensions) return;
      const { context } = boardSurface;
      const { width, height } = dimensions;
      const theme = themeFor(canvas);
      const model = buildRenderModel(snapshot);
      context.fillStyle = theme.board;
      context.fillRect(0, 0, width, height);
      const cellWidth = width / BOARD_WIDTH, cellHeight = height / BOARD_HEIGHT;
      context.save();
      context.beginPath(); context.rect(0, 0, width, height); context.clip();
      context.strokeStyle = theme.grid;
      context.lineWidth = .5;
      context.beginPath();
      for (let x = 1; x < BOARD_WIDTH; x++) { context.moveTo(x * cellWidth, 0); context.lineTo(x * cellWidth, height); }
      for (let y = 1; y < BOARD_HEIGHT; y++) { context.moveTo(0, y * cellHeight); context.lineTo(width, y * cellHeight); }
      context.stroke();
      for (const cell of model.ghost) paintCell(context, cell.x * cellWidth, cell.y * cellHeight, cellWidth, cellHeight, theme.colors[cell.type], { ghost: true });
      for (const cell of model.fixed) paintCell(context, cell.x * cellWidth, cell.y * cellHeight, cellWidth, cellHeight, theme.colors[cell.type]);
      for (const cell of model.active) paintCell(context, cell.x * cellWidth, cell.y * cellHeight, cellWidth, cellHeight, theme.colors[cell.type], { active: true });
      // The single scanline layer lives here, at 2% opacity. No moving or random texture.
      context.fillStyle = '#00000005';
      for (let y = 3; y < height; y += 4) context.fillRect(0, y, width, 1);
      context.restore();
      preview(nextSurface, snapshot.next, theme);
      preview(holdSurface, snapshot.hold, theme);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const target of [boardSurface, nextSurface, holdSurface]) {
        if (!target) continue;
        target.context.setTransform(1, 0, 0, 1, 0, 0);
        target.context.clearRect(0, 0, target.canvas.width, target.canvas.height);
      }
    },
  };
}

import { createApp } from './app.js';

try {
  const app = createApp();
  window.addEventListener('pagehide', event => { if (!event.persisted) void app.dispose(); });
} catch (error) {
  document.getElementById('app-status').textContent = '页面初始化失败，请检查浏览器控制台。';
  console.error('NEON TETRIS initialization failed', error);
}

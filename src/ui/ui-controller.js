export function createUIController(doc = document, { effects } = {}) {
  const element = id => doc.getElementById(id);
  const settingsDialog = element('settings-dialog'), restartDialog = element('restart-dialog'), helpDialog = element('help-dialog');
  const disposers = [];
  let pauseIntent = null, previousPhase = null, noticeTimer = null, previousStats = null;
  function listen(target, type, listener) { target.addEventListener(type, listener); disposers.push(() => target.removeEventListener(type, listener)); }
  function open(dialog) { if (!dialog.open) { dialog.showModal(); effects?.transition(dialog); } }
  function hideNotice() { clearTimeout(noticeTimer); noticeTimer = null; element('level-notice').hidden = true; }
  function showNotice(label, value) {
    hideNotice(); element('level-notice-label').textContent = label; element('level-notice-value').textContent = value;
    element('level-notice').hidden = false; effects?.transition(element('level-notice'), 'digit');
    noticeTimer = setTimeout(hideNotice, 400);
  }
  return {
    bind(commands) {
      listen(element('start-button'), 'click', commands.start);
      listen(element('pause-button'), 'pointerdown', () => { pauseIntent = element('pause-button').dataset.action; });
      listen(element('pause-button'), 'pointercancel', () => { pauseIntent = null; });
      listen(element('pause-button'), 'click', () => {
        const action = pauseIntent ?? element('pause-button').dataset.action; pauseIntent = null;
        if (action === 'pause') commands.pause(); else if (action === 'resume') commands.resume();
      });
      listen(element('overlay-action'), 'click', () => {
        const action = element('overlay-action').dataset.action;
        if (action === 'start') commands.start(); else if (action === 'resume') commands.resume(); else if (action === 'restart') commands.restart();
      });
      listen(element('return-title'), 'click', commands.returnToTitle);
      listen(element('restart-button'), 'click', () => { if (doc.body.dataset.phase === 'GAME_OVER') commands.restart(); else commands.requestRestart(); });
      listen(element('settings-button'), 'click', commands.openSettings);
      listen(element('help-button'), 'click', commands.openHelp);
      if (commands.enableAudio) listen(element('audio-retry'), 'click', commands.enableAudio);
      listen(settingsDialog, 'close', commands.settingsClosed);
      listen(helpDialog, 'close', commands.settingsClosed);
      listen(restartDialog, 'close', () => { if (restartDialog.returnValue === 'confirm') commands.restart(); });
      for (const id of ['musicEnabled', 'musicVolume', 'sfxEnabled', 'sfxVolume', 'effectsEnabled', 'reduceMotion']) {
        const field = element(id);
        listen(field, field.type === 'range' ? 'input' : 'change', () => commands.updateSettings({ [id]: field.type === 'range' ? Number(field.value) / 100 : field.checked }));
      }
      return () => { for (const dispose of disposers.splice(0)) dispose(); };
    },
    render(snapshot, best, preferences, status = {}) {
      const phase = snapshot.phase, running = phase === 'RUNNING', paused = phase === 'PAUSED', ended = phase === 'GAME_OVER';
      doc.body.dataset.phase = phase; doc.body.dataset.effects = preferences.effectiveMode;
      doc.body.dataset.motionExplicit = String(preferences.reduceMotion !== null);
      element('phase-label').textContent = running ? '游戏中' : paused ? '已暂停' : ended ? '游戏结束' : '等待开始';
      element('board-overlay').hidden = running;
      element('state-kicker').textContent = paused ? 'PAUSE' : ended ? 'GAME OVER' : 'READY';
      element('board-title').textContent = paused ? '稍作停留。' : ended ? '本局结束。' : '轮到你了。';
      const pauseDescription = status.pauseReason === 'STALL' ? '检测到运行停顿，已保护性暂停。' : status.pauseReason === 'OVERFLOW' ? '输入过密，已保护性暂停。' : '棋盘会等你回来。';
      element('board-description').textContent = paused ? pauseDescription : ended ? '这一局，记在这里。' : '让每一块，找到位置。';
      element('state-footnote').textContent = paused ? 'P / Esc 继续' : 'A / D 移动 · Space 硬降';
      element('overlay-action').textContent = paused ? '继续游戏' : ended ? '再来一局' : '开始游戏';
      element('overlay-action').dataset.action = paused ? 'resume' : ended ? 'restart' : 'start';
      element('return-title').hidden = !ended; element('result-stats').hidden = !ended;
      element('result-score').textContent = String(snapshot.score);
      element('result-lines').textContent = `${snapshot.lines} / ${snapshot.level}`;
      element('new-record').hidden = !ended || snapshot.score <= best;
      element('score').textContent = String(snapshot.score).padStart(6, '0');
      element('best').textContent = String(Math.max(status.bestScore ?? best, snapshot.score)).padStart(6, '0');
      element('level').textContent = String(snapshot.level).padStart(2, '0');
      element('lines').textContent = String(snapshot.lines).padStart(3, '0');
      if (previousStats && running) for (const key of ['score', 'level', 'lines']) if (snapshot[key] !== previousStats[key]) effects?.transition(element(key), 'digit');
      previousStats = { score: snapshot.score, level: snapshot.level, lines: snapshot.lines };
      element('start-button').disabled = phase !== 'READY';
      element('pause-button').disabled = !running && !paused;
      element('pause-button').textContent = paused ? '继续' : '暂停';
      element('pause-button').dataset.action = paused ? 'resume' : 'pause';
      element('restart-button').disabled = !running && !paused && !ended;
      element('next-preview').setAttribute('aria-label', snapshot.next ? `下一方块 ${snapshot.next}` : '开始后显示下一方块');
      element('hold-preview').setAttribute('aria-label', snapshot.hold ? `暂存方块 ${snapshot.hold}` : '暂无暂存方块');
      element('hold-note').textContent = snapshot.hold && !snapshot.canHold ? '本轮已用，固定后恢复' : '每轮可交换一次';
      for (const id of ['musicEnabled', 'sfxEnabled', 'effectsEnabled']) element(id).checked = preferences[id];
      for (const id of ['musicVolume', 'sfxVolume']) { element(id).value = String(Math.round(preferences[id] * 100)); element(`${id}-output`).textContent = `${Math.round(preferences[id] * 100)}%`; }
      element('reduceMotion').checked = preferences.reduced; element('reduceMotion').disabled = !preferences.effectsEnabled;
      element('motion-source').textContent = preferences.reduceMotion === null ? '当前跟随系统的减少动态偏好' : '正在使用你的动态效果选择';
      element('app-status').textContent = !preferences.saved || status.bestSaved === false ? '本次偏好或纪录未保存，仍可继续游戏' : '偏好与纪录自动保存 · A / D 移动 · P 暂停';
      if (status.audio) {
        const unavailable = Boolean(status.audio.error || status.audio.lastError) || status.audio.contextState === 'suspended';
        element('audio-notice').textContent = unavailable ? '声音尚未启用，可点击启用声音；游戏仍可正常运行。' : '原创电子音乐与操作音效，音量独立控制。';
        element('audio-retry').hidden = !unavailable;
      }
      if (phase !== previousPhase) {
        if (ended) effects?.transition(element('board-overlay'), 'end');
        else if (paused) effects?.transition(element('board-overlay'), 'panel');
        const focusMovedAway = paused && status.pauseReason === 'FOCUS';
        if (!running && !focusMovedAway && !settingsDialog.open && !helpDialog.open && !restartDialog.open) {
          element('overlay-action').focus({ preventScroll: true });
        }
        previousPhase = phase;
      }
      if (!running) hideNotice();
    },
    showLevelUp(level) {
      showNotice('LEVEL UP · 等级提升', String(level).padStart(2, '0'));
    },
    showLineClear(count, data) { showNotice(count === 4 ? 'TETRIS · 四行消除' : `${count} LINE${count > 1 ? 'S' : ''} · 消除`, Number.isFinite(data?.scoreDelta) ? `+${data.scoreDelta}` : String(count)); },
    clearTransientFeedback() { hideNotice(); previousStats = null; },
    openSettings() { open(settingsDialog); },
    openHelp() { open(helpDialog); },
    requestRestart() { if (!restartDialog.open) { restartDialog.returnValue = ''; open(restartDialog); } },
    getOverlayState: () => settingsDialog.open ? 'settings' : helpDialog.open ? 'help' : restartDialog.open ? 'restart' : null,
    focus: () => element('game-area').focus({ preventScroll: true }),
    dispose() { hideNotice(); for (const dispose of disposers.splice(0)) dispose(); settingsDialog.close(); restartDialog.close(); helpDialog.close(); },
  };
}

# NEON TETRIS

**NIGHT SHIFT ARCADE · METROPOLITAN ANALOG FUTURISM**

《智能软件开发》课程实践项目。一款以夜班街机控制台为主题的单人俄罗斯方块游戏。工业铭牌、内凹 CRT、磷光仪表与原创电子音乐构成同一台机器。棋盘始终优先，短时色差、消行闪光、粒子和奖励数字只在事件发生时出现。

## 双击启动

解压整个游戏文件夹，保留 `index.html`、`styles/` 和 `assets/` 的相对位置。双击 **`index.html`**，点击「开始游戏」。游玩无需联网、Node.js 或本地服务器。若浏览器限制本地文件存储，游戏仍可玩，设置和最高分可能只保留在当前页面。

### 开发与验收页

修改源码后，用 **Node.js 24+** 在项目根目录运行 `npm run build`，从 `src/index.template.html` 和玩家模块重新生成 `index.html`。无需安装第三方依赖。开发或打开验收页时可以启动本地服务。

```sh
node --version
npm run dev
```

在 Windows PowerShell 中也可用 `npm.cmd run dev`，或直接运行 `node scripts/serve.mjs`。浏览器打开 [http://127.0.0.1:5173/](http://127.0.0.1:5173/)。按 Ctrl+C 停止服务。

若 5173 已被占用，可先设置 `PORT` 再启动。例如 PowerShell 执行 `$env:PORT = '5174'`，macOS/Linux 执行 `PORT=5174 npm run dev`，然后访问对应端口。最高分和设置按浏览器来源保存，改端口后会使用另一份存储。

## 玩法与操作

在 10 列 × 20 行棋盘上旋转、移动和堆叠七种经典方块。每袋包含 I、O、T、S、Z、J、L 各一次，随机打乱后依次出现。填满的行会同时消除。Ghost 轮廓预告硬降落点，NEXT 显示下一块，HOLD 可暂存或交换方块，每次锁定前只可用一次。局内重开需要确认，结束后可直接再来一局或返回标题。

| 键位 | 操作 |
| --- | --- |
| A / D | 向左 / 向右移动，可长按 |
| W | 软降，可长按 |
| Q / E | 顺时针 / 逆时针旋转 |
| Space | 硬降并锁定 |
| C 或单独按下再释放 Shift | 暂存或交换 |
| P 或 Esc | 暂停 / 继续 |

窗口失焦、切换标签页、离开棋盘焦点或打开设置会暂停。回到游戏后主动继续。在弹层中，Esc 优先关闭弹层。

### 计分和等级

| 行为 | 得分 |
| --- | ---: |
| 消除 1 行 | 100 × 本次消行前等级 |
| 消除 2 行 | 300 × 本次消行前等级 |
| 消除 3 行 | 500 × 本次消行前等级 |
| 消除 4 行 | 800 × 本次消行前等级 |
| 软降 / 硬降 | 每格 1 / 2 分 |

从 1 级开始，每累计消除 10 行升一级。自然下落随等级变快，且每有效游玩 60 秒再加速一档，最多四档，下落间隔最低 80ms。暂停不计时，重开清零。时间档位也会加快音乐节拍，等级和计分仍按消行规则计算。

### 音乐、音效和动态效果

- 点击开始后尝试启用浏览器声音。原创循环音乐和 15 类事件音有独立开关及音量，默认 35% 和 55%。声音不可用时可在设置中点击「启用声音」。
- 暂停保留音乐位置，继续从该位置播放。结束时释放尾音，重开从曲首播放。
- 动效默认开启。减少动态效果初次跟随系统偏好，主动修改后以所选值为准。关闭动效优先于减少模式。关闭或减少时保留必要文字与得分反馈。
- 设置和最高分保存在当前浏览器的 `localStorage`。隐私限制或存储异常时仍可玩，本次更改可能无法跨刷新保留。

## 技术栈与结构

HTML、CSS、原生 JavaScript ES Modules、Canvas 2D、Web Animations API、Web Audio API 和 `localStorage`。本地 HTTP 服务与自动化测试分别使用 Node.js 内置 `http` 和 `node:test`。

```text
NEON-TETRIS/
├── README.md / AGENTS.md / package.json
├── index.html              玩家入口
├── styles/                 设计变量、布局与主题
├── assets/                 原创 SVG、来源说明和验收页面
├── src/
│   ├── main.js / app.js    启动与模块装配
│   ├── core/               棋盘、方块、旋转、计分和引擎
│   ├── runtime/            输入、逻辑时间、循环与事件
│   ├── render/ / ui/       Canvas 绘制、界面与设置面板
│   ├── audio/ / effects/   合成音乐、事件音和动态反馈
│   └── data/ / dev/        本地存储与独立验收夹具
├── scripts/serve.mjs       本地 HTTP 服务
├── tests/
│   ├── unit/               单元与边界回归
│   ├── integration/        时间、应用、音画和 HTTP 集成测试
│   └── fixtures/           固定棋盘与平台替身
└── docs/                   规则、设计、决策、协作日志与测试报告
```

## 测试与验收

```sh
npm test
```

Windows PowerShell 可用 `npm.cmd test`，也可直接运行 `node --test`。完整套件会开临时回环端口并创建临时链接，建议在普通本地终端执行。

- [视觉验收页](http://127.0.0.1:5173/assets/visual-review.html)使用合成状态，可检查七色方块、棋盘和视觉效果。
- [整合验收页](http://127.0.0.1:5173/assets/integration-review.html)使用真实引擎，提供固定四消升级与结束场景。开始后按 Space 触发。它使用内存存储，玩家纪录和偏好只由主入口保存。
- 最新结果、20 项验收和证据边界见 [最终验收报告](docs/FINAL_ACCEPTANCE_REPORT.md)。

## 已知限制与范围

- 核心玩法以桌面键盘为目标。窄屏会重排布局，短屏需要纵向滚动。触摸屏可用菜单与设置，局内移动和旋转需要键盘。
- 内置或节流浏览器若出现超过 250ms 的长帧，会触发保护性暂停。回到前台后可以手动继续。
- 尚未完成跨浏览器性能基准、色弱和屏幕阅读器实测。只保存设置与最高分，刷新不续局。
- 地域关卡、地图解锁、复杂任务、道具、Boss、多人联机与复杂成就均不在本版范围。

## 项目文档

- [项目上下文](docs/PROJECT_CONTEXT.md)、[架构](docs/ARCHITECTURE.md)、[算法](docs/ALGORITHMS.md)、[游戏规则](docs/GAME_RULES.md)
- [产品需求](docs/PRD.md)、[视觉规范](docs/DESIGN_SPEC.md)、[视听规范](docs/AUDIO_VISUAL_SPEC.md)、[资源来源](assets/ASSET_SOURCES.md)
- [技术决策](docs/DECISIONS.md)、[Agent 工作规则](AGENTS.md)、[人机协作日志](docs/AI_COLLABORATION_LOG.md)
- [测试方案](docs/TEST_PLAN.md)、[独立质量审查](docs/QUALITY_REVIEW_2026_11_07.md)、[最终验收报告](docs/FINAL_ACCEPTANCE_REPORT.md)


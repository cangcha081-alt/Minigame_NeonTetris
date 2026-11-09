# NEON TETRIS · 项目上下文

最后更新于 2026-11-07，Asia/Shanghai。进入工作区后依次读取 [AGENTS](../AGENTS.md)、本文件、[决策](DECISIONS.md)和[协作日志](AI_COLLABORATION_LOG.md)。

## 当前交付

NEON TETRIS 是《智能软件开发》课程实践项目。艺术主题为 NIGHT SHIFT ARCADE，副标为 METROPOLITAN ANALOG FUTURISM。桌面键盘玩法、视听效果、设置与最高分已实现。用户在收尾前反馈，已手动检查独立质量审查列出的几种情况，功能均正常可运行。具体设备、单项测量与原始数据未提供。

玩家可直接双击 `index.html`，相对路径读取样式和素材，普通脚本内嵌游戏模块。修改源码后由 Node.js 24+ 运行 `npm run build` 重新生成发布页，无第三方依赖。开发验收页仍使用本地 HTTP。新版使用用户当轮提供的房间 PNG，并用青粉电子色强化标题。音频和标识沿用原项目。见 [资源来源](../assets/ASSET_SOURCES.md)。

生产入口是 `index.html`，模板为 `src/index.template.html`。验收页及 `src/dev` 专供演示与复核。离线 ZIP 保留源码、验收页、测试和历史文档，排除 Git 元数据和本地调试产物。本地交付文件夹另含此前导出的 Markdown 对话。

## 技术和模块

| 位置 | 当前职责 |
| --- | --- |
| `src/main.js`、`src/app.js` | 浏览器启动、组装、事务发布、最高分与清理 |
| `src/core/` | 纯规则。公开入口 `createEngine`，提供 `start`、`advanceTo`、`dispatch`、`pause`、`resume`、`resetToReady`、`getSnapshot` |
| `src/runtime/` | 键盘边沿、输入队列、局内逻辑时钟、唯一 rAF、事件订阅 |
| `src/render/`、`src/ui/`、`styles/` | Canvas 2D 棋盘与预览、界面状态、设置、响应式布局 |
| `src/audio/` | Web Audio 合成谱面与 15 类事件音，单 Context、双总线、限频与手势恢复 |
| `src/effects/` | 有界 WAAPI 动画，独立视觉随机数，切换模式与换局清理 |
| `src/data/` | 六项偏好与最高分，schemaVersion 1，容错回退 |
| `src/dev/`、`assets/*-review.html` | 视觉样张、真实固定场景与离线信号诊断 |
| `scripts/`、`tests/` | Node 本地静态服务、单元/集成测试及夹具 |

规则层不依赖 DOM、Canvas、音频或存储。引擎返回原子事务，App 加上 `sessionId`、`transactionId` 与递增 `seq` 后分发。音画消费者按会话和序号去重，重画不产生事件。状态只有 READY、RUNNING、PAUSED 和 GAME_OVER，设置与确认留在界面层。暂停冻结引擎时间，失焦或隐藏后需手动继续。长帧超过 250ms 或输入队列溢出时保护性暂停。

## 当前规则和设置

- 10×20 可见区域加两行隐藏生成区，7-Bag、90° SRS、Ghost、Next、每次锁定前一次 Hold。软降间隔 35ms，锁定延迟 500ms，最多 15 次锁定刷新，左右长按 150ms 后每 45ms 重复。
- A/D 移动，W 软降，Q/E 顺/逆时针旋转，Space 硬降，C 或独立 Shift 暂存，P/Esc 暂停或继续。
- 单至四消为 100/300/500/800 × 消行前等级，软降每格 1 分，硬降每格 2 分。每 10 行升一级。有效游玩每 60 秒提升一档，最多四档，重力间隔下限 80ms，音乐节拍同时加快。完整曲线见 [游戏规则](GAME_RULES.md)。
- 音乐基准 112 BPM、16 小节，默认音乐 35%、音效 55%，均开启。开始手势解锁，暂停保留位置，结束释放尾音。音频初始化或排程异常可重试，玩法继续。
- 动效默认开启，初次减少模式跟随系统，显式选择覆盖，关闭优先。最多 32 个动画句柄、4 行短闪、16 粒子与一个奖励浮字，滚动一秒最多两次行亮度反馈。状态切换与模式变更会清理旧效果。
- 最高分和设置按浏览器来源持久化。重开保存偏好及最高分，不保存局面。整合夹具使用内存存储。

## 已知限制

短窄屏需要纵向滚动，完整玩法需要键盘。内置或节流浏览器曾触发长帧保护暂停。尚未测量跨浏览器持续性能、实际音频输出峰值、色弱及屏幕阅读器表现。用户手动反馈、浏览器实查、离线信号与自动化覆盖分别见 [最终验收报告](FINAL_ACCEPTANCE_REPORT.md)。

## 历史导航

- [需求与范围](PRD.md)、[分阶段计划](DEVELOPMENT_PLAN.md)、[任务](TASK_PLAN.md)、[算法](ALGORITHMS.md)、[架构](ARCHITECTURE.md)。
- [最小框架](STAGE_04_REPORT.md)、[纯引擎](STAGE_05_REPORT.md)、[初版视觉](STAGE_06_REPORT.md)、[视觉返工](STAGE_06_REWORK_B_REPORT.md)、[视觉精修](UI_REFINEMENT_2026_11_07.md)。
- [运行与视听整合](STAGE_07_REPORT.md)、[试玩反馈优化](PLAYTEST_FEEDBACK_2026_11_07.md)、[独立质量审查](QUALITY_REVIEW_2026_11_07.md)、[测试方案](TEST_PLAN.md)。
- 历史阶段报告保留当时实际状态和结果。当前部署、功能与验证范围以 README 和最终验收报告为准。


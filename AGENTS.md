# NEON TETRIS · Agent 工作规则

## 一、项目目标

本项目是《智能软件开发》课程实践：完成具有独立视听风格的经典俄罗斯方块，并保留可核验的人机协作记录。作品名NEON TETRIS，当前艺术主题NIGHT SHIFT ARCADE，主题副标METROPOLITAN ANALOG FUTURISM；旧宣传副标保留为历史，不在主画面叠加。

## 二、阶段纪律

1. 每次开始新阶段，先检查目录和 Git 状态，再依次读取本文件、`docs/PROJECT_CONTEXT.md`、`docs/DECISIONS.md`、`docs/AI_COLLABORATION_LOG.md`，然后读取本阶段相关设计文档。
2. 主 Agent 同时承担产品、架构、开发、测试、审查和文档职责。主动补齐需求，明确区分用户要求、Agent 建议、已实现事实和待验证事项。
3. 每个阶段完成后暂停，等待用户给出下一阶段指令。阶段内不反复确认已获授权的常规工作。
4. 不无故覆盖、删除文件，不未经分析大规模重构。保留现有 Git 元数据，不自行发布、推送或安装无关依赖。
5. 2026-11-07 课程离线版更新。保持双击 `index.html` 可玩。修改玩家模块或 `src/index.template.html` 后用 `npm run build` 同步发布页。用户提供背景的来源见资源清单，实际验证与浏览器限制见验收报告。
6. 后续阶段切换时同步更新本规则中的当前阶段约束，不将本条误读为永久禁止开发。

## 三、技术与体验约定

1. 已获用户认可的方向：HTML、CSS、JavaScript、Canvas 2D、Web Audio API，减少第三方依赖。玩家页支持本地文件与 HTTP，开发验收页使用 HTTP。
2. 游戏逻辑与 DOM、Canvas、音频、存储隔离；规则随机性与特效随机性分离。
3. 严格保留用户键位：A/D 左右、W 软降、Q 顺时针、E 逆时针、Space 硬降、C/Shift 暂存、P/Esc 暂停。
4. 当前视觉方向：NIGHT SHIFT ARCADE / METROPOLITAN ANALOG FUTURISM，都市模拟未来主义·夜班街机控制台；新配色和材质约定见DESIGN_SPEC。旧Urban Retrofuturism方案属于返工历史，棋盘可读性和输入响应继续优先。
5. 不增加地域关卡、地图解锁、复杂任务、道具、Boss、多人联机或复杂成就系统。
6. 文档中的“建议默认值”在用户确认前属于草案，不得在交接中写成已确认或已实现。

## 四、验证与协作

1. 修改实现后尽可能运行相关测试。记录准确命令、结果、失败与未测范围；不得声称执行未运行的测试。
2. 设计阶段可做文档一致性、链接、需求覆盖与公式检查，但不得将其称为游戏测试。
3. 合适时可调用子 Agent 做独立审查或测试；主 Agent 必须核验结论，并记录采纳、驳回或待验证的原因。
4. 每个阶段汇报八项内容：目标、实际工作、文件变更、Agent 能力与工具、测试真实结果、问题及解决、未解决问题、下一阶段建议。

## 五、记忆维护

1. `PROJECT_CONTEXT.md` 保存当前事实、阶段、技术栈、架构边界和待办。
2. `DECISIONS.md` 保存重要决策、原因、状态与变更，不以新结论抹去旧决策历史。
3. `AI_COLLABORATION_LOG.md` 保存用户意图、工具与检查摘要、Agent 建议、审查处理和阶段结果。它是过程摘要，不能替代完整聊天或命令原始输出。
4. 规则与计分以 `GAME_RULES.md` 为准，视觉以 `DESIGN_SPEC.md` 为准，音画事件以 `AUDIO_VISUAL_SPEC.md` 为准；架构接口以 `ARCHITECTURE.md`、数据与墙踢表以 `ALGORITHMS.md` 为准；任务/验证见 `TASK_PLAN.md`、`TEST_PLAN.md`。状态名仅用 READY/RUNNING/PAUSED/GAME_OVER。PRD 通过编号关联细则，出现冲突先修正文档再实现。
5. 文档使用 UTF-8 和明确日期，涉及时间按用户时区 Asia/Shanghai 记录；环境版本为调查时快照，不能假定永久不变。

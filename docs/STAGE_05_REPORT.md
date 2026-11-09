# 第五阶段 · 纯游戏引擎交付

日期：2026-11-06（Asia/Shanghai）。目标：优先实现稳定、可测试、与DOM和音频解耦的核心引擎。本阶段未修改HTML、CSS、UI、Renderer、App、音频或特效实现。

## 一、完成内容

- 七种方块、28个朝向数据、7-Bag、只读Next；连续两个袋之间允许相同方块相邻，但不会无限缺块。
- 10×20可见棋盘，内部另含两行隐藏生成区；合法位置、边界/堆叠碰撞、新棋盘固定与行压缩。
- 左右移动、双向90°旋转、I专用及其他类型基础墙踢、旋转失败原状态不变。
- 软降/硬降、重力截止时间推进、500ms锁定与15次刷新上限、离地暂停剩余锁定时间。
- Ghost与硬降共用落距查询；Hold空槽消费Next、非空交换不消费、锁定前仅一次，换出重置位置/朝向/计时。
- 单/双/三/四消、按结算前等级计分、软硬降逐格计分、累计每10行升级、最低80ms重力。
- READY/RUNNING/PAUSED/GAME_OVER、消行后隐藏区判定、出生/Hold碰撞、幂等暂停/继续/结束。
- 返回完整事务事件，核心不调用AudioManager、不读写DOM。自然重力不冒充SOFT_DROP，失败动作不发成功音事件；硬降/锁定/消行/升级各按实际行为发一次。

## 二、开发接口

`createEngine({rng,initialState})`：rng默认Math.random，测试可注入；initialState为构造时复制的确定性测试夹具，不是玩家续局或作弊界面。字段可含board、active、queue固定前缀、hold、canHold、score、lines；初始始终READY，start才应用夹具。队列前缀用尽后续接7-Bag。

| 方法 | 行为 |
|---|---|
| start() | READY→RUNNING，生成活动块，返回GAME_START及可能的出生失败事件 |
| dispatch(kind,payload) | 独立即时动作，返回事务数组；用于单步调用/测试，每次显式调用可作用当前块 |
| advanceTo(logicalMs,inputs) | 按时间戳和截止时间推进，返回按发生顺序排列的事务数组 |
| pause(reason)/resume() | 实际状态改变才返回PAUSE/RESUME；冻结规则时间，清理长按信号 |
| resetToReady() | 清本局数据，回READY；下次start重新初始化，不刷新页面 |
| getSnapshot() | 返回隔离的棋盘/活动块副本及Ghost、Next、Hold、统计、phase和logicalTime；不发事件、不消费随机数 |

dispatch支持MOVE{direction:-1/1}、ROTATE{direction:'CW'/'CCW'}、SOFT_DROP、HARD_DROP、HOLD。时间化输入另支持HORIZONTAL_DOWN/UP、SOFT_DOWN/UP、PAUSE，结构为{at,order?,kind,payload?}，at为逻辑毫秒，不是Date.now或音频时间。

每个返回事务为{events,summary,revision}；事件含type、logicalTime、pieceId、data。App层仍负责补sessionId/transactionId/seq并通过EventManager通知音画，不把核心改成DOM事件源。

### 时间边界约束

1. 同刻顺序：到期锁定→外部输入→横向重复→唯一垂直推进。DOWN/UP始终更新held，旧块代际只过滤即时动作。
2. advanceTo关闭已结算的时间点。全部同刻输入须在结算前一起提交；向已关闭时间点补输入抛RangeError，整批输入在任何动作前校验，失败不修改状态。允许无输入再次推进同一时刻。
3. dispatch为独立的单步事务，不用于模拟具有同一时间戳的一整组历史输入；它也关闭当前时刻。实时输入适配器后续应给已结算后真正到达的输入新的逻辑时刻，不回插历史。
4. 暂停冻结剩余时间，不累计墙钟暂停时长。若暂停恰在重力到期，剩余为0：resume本身不移动，后续推进才执行一次到期重力。软降按键会清除，恢复后使用普通重力。
5. >250ms平台停顿、512项输入队列限制属于下一阶段运行时适配器；纯引擎不把任意逻辑时间推进误判为浏览器卡顿，不静默丢逻辑时间。

## 三、实际测试

最终命令：`npm.cmd test` → **66通过、0失败、0跳过**。

| 文件 | 数量 | 覆盖 |
|---|---:|---|
| tests/unit/primitives.test.js | 16 | 七型/朝向、7000项七袋序列、碰撞/固定/Ghost、墙踢黄金样例、消行/计分/等级 |
| tests/unit/engine.test.js | 19 | 引擎行为、Hold、单至四消、事件数量/顺序、顶部失败、快照隔离 |
| tests/integration/timing.test.js | 12 | 499/500ms、15/16次刷新、长按、软降互斥、暂停剩余时间、同刻松键、60/144Hz逻辑结果一致 |
| tests/unit/review-regressions.test.js | 6 | 独立审查发现的校验/状态表/迟到输入，以及事件关联/离地锁定边界 |
| tests/integration/engine-invariants.test.js | 1 | 20固定种子×500步混合操作，检查合法占格、Ghost、行/格范围、无重复结算事件与计分一致性 |
| 既有foundation与server测试 | 12 | 框架接口、事件总线、设置/存储、音频边界及真实本机HTTP服务 |

本轮新增54项测试，保留既有12项。相关JS逐个`node --check`通过；检索src/core未发现document/window/AudioManager/Canvas/localStorage/rAF引用。未安装依赖。

### 用户要求的14类测试对应

| 类别 | 主要证据 |
|---|---|
| 七种方块生成 | 7种spawn、28朝向、7-Bag完整袋与最长缺块间隔 |
| 移动 | 成功一次MOVE、撞墙失败不动、长按150/45ms |
| 旋转 | CW/CCW、四转复原、失败纯性、O不变 |
| 边界碰撞 | 左右/地板/隐藏上界及负容器原点合法占格 |
| 方块间碰撞 | 固定格阻挡横移/旋转/落距 |
| 固定 | 新棋盘恰写四格、硬降与自然到期仅一次LOCK |
| 单行消除 | O补满一行后剩余两格下移，奖励100 |
| 多行消除 | 2/3/4行及非邻行压缩、旧位置快照 |
| 计分 | 硬降0/1/8格=0/2/16，双消合计316，四消跨级合计816 |
| 等级提升 | 原9行四消后13行/等级2，奖励采用原等级1 |
| Ghost | 移动/旋转更新，查询纯性，硬降落点一致 |
| Hold | 空槽/交换/重复拒绝/锁定后恢复/出场重置/交换受阻 |
| 游戏结束 | 消行救回、隐藏残留、普通出生阻挡、Hold阻挡，结束后动作无效 |
| 事件次数 | 每事务LOCK/LINE_CLEAR/LEVEL_UP/SCORE_CHANGED/GAME_OVER至多一次、失败无成功事件、读100次快照不发事件 |

## 四、失败、审查和修复

1. 独立测试首轮28项中27过1失败：测试误把暂停冻结理解为恢复后完整重计时。主Agent核对既定规则后纠正预期，新增零/非零剩余与held清理用例，没有为了通过测试改变规则。
2. 主Agent与独立审查发现稀疏数组被every跳过：引擎初始棋盘复用validateBoard，队列用for…of校验，构造时明确拒绝损坏夹具。
3. 状态表曾把constructor等继承属性当命令：改Object.hasOwn，仅接收自有转换。
4. 独立探针确认先结算1000ms重力再补同刻SOFT_DOWN会多移一格：增加closedTime，在整批执行前拒绝迟到同刻输入，不增加历史回滚复杂度。
5. 统一LOCK.cells.type为数字类型ID，SCORE_CHANGED关联产生奖励的旧块，避免误指下一块；以独立回归固化。
6. 替换Engine时一次补丁因重复目标操作未通过校验、没有落盘；随后明确替换该目标并完成实际测试。没有删除用户其他文件。

## 五、实际文件变更

新增源码7份：src/core/pieces.js、bag.js、collision.js、rotation.js、lines.js、score.js、state.js。

修改源码2份：src/core/board.js、src/core/game-engine.js。

新增测试/夹具6份：tests/unit/primitives.test.js、engine.test.js、review-regressions.test.js；tests/integration/timing.test.js、engine-invariants.test.js；tests/fixtures/core-fixtures.js。

新增本文。更新AGENTS.md、README.md、PROJECT_CONTEXT.md、DECISIONS.md、AI_COLLABORATION_LOG.md、ALGORITHMS.md、ARCHITECTURE.md、GAME_RULES.md、TEST_PLAN.md、TASK_PLAN.md、DEVELOPMENT_PLAN.md（除根目录两份外均位于docs）。不改UI/美术/底部布局。

## 六、限制与后续

页面仍是第四阶段预览：本轮完成的是引擎，尚未接完整InputManager、持续GameLoop、活动块/Ghost/Next/Hold绘制及结束页。没有新的浏览器、音频、视效或完整游戏性能验收，60/144Hz验证的是相同逻辑输入结果，不是渲染帧率达标。

用户指出现有美术仍是草图且效果不足，后续需要优化；建议底部板块改为按钮点击弹出，具体板块范围留到界面阶段再确认，本阶段没有擅自修改。

建议下一阶段接输入、运行循环与基础渲染，先形成可玩的完整循环，再做艺术与音画体验。当前完成后暂停等待用户指令。

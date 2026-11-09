# 第七阶段 · 完整运行与视听整合

日期：2026-11-07（Asia/Shanghai）。实现与自动回归完成；真实听音、独立桌面浏览器持续运行及完整体验验收仍未完成。本报告不把平台替身或静态画面称为听测。

## 1. 目标与实际结果

把已有纯引擎、NIGHT SHIFT ARCADE界面、输入、唯一游戏循环、原创音乐/事件音、设置和有限视觉反馈接成生产入口。没有改动9个core文件、计分、7-Bag或墙踢，也没有新增依赖/外部素材。

生产入口现在使用真实引擎处理开始、移动、双向旋转、软硬降、Hold、重力、锁定、消行、升级、结束、暂停、继续、重开和返回标题。App独占事务信封和局次；Renderer只读；声音和动画只消费事实，不反向驱动规则。

## 2. 关键实现与取舍

- InputManager使用物理code，保留A/D/W/Q/E/Space/C/Shift/P/Esc。只在RUNNING且棋盘有焦点时消费动作；忽略系统repeat。Shift独立释放暂存，组合、双Shift、失焦取消候选；Tab/原生控件/浏览器快捷键保留。
- GameLoop是唯一rAF所有者，最多一个待执行句柄。RUNNING连续，其他状态按需单帧；隐藏停止帧，返回不自动继续；dispose后不得复活。
- SessionController集中墙钟到逻辑时钟映射、输入队列（512上限）、暂停及重开。暂停作为时间化PAUSE插入，保留同刻锁定先于输入、输入先于重力的顺序。晚到已提交时刻的输入分配到新时刻（+0.000001ms），不回插历史。暂停重建映射排除冻结墙钟时间，保留重力和锁定剩余。
- 超过250ms的未提交停顿或队列溢出会保护性暂停，不追赶旧输入。UI说明停顿/过密原因；没有为了内置浏览器验证而放宽保护。
- 音频在同步开始/继续/设置手势中创建或resume Context；不等待解锁才开始游戏。一次Context、独立音乐/音效总线；异步结果按局次版本校验。失败可无声继续并在设置中点击“启用声音”重试。
- 原创NIGHT SHIFT谱：112 BPM、A小调方向、16小节，约34.286秒循环；方波旋律、三角低音/和声、电子节拍，不使用商业旋律或外部采样。25ms单调度检查，100ms前瞻，声音使用AudioContext时间而非rAF。
- 暂停80ms静音并停止音乐调度，保留位置；继续120ms淡入；结束600ms淡出；重开取消旧淡出、节点和旧任务，从曲首建立。正常重开复用Context。
- 14项必需事件音加Hold共15类，四消有独立奖励动机；按批次仲裁，消行省略独立固定/硬降音，四消与升级错峰。移动70ms、旋转60ms、软降100ms限频；最多8个音效振荡器。
- 预听独立且不推进暂停乐曲；等待解锁后核对设置面板/请求版本才播放，关闭面板/失焦/换局取消。对应音量归零立即取消预听，无关总线开关不干扰。Context.close拒绝被捕获，避免未处理Promise拒绝。
- 消行逻辑仍立即原子结算，表现只叠加旧行快照。1/2/3/4消强度.14/.16/.18/.20，140/150/160/180ms；四消青/黄绿局部彩带，滚动一秒最多两次亮度反馈。硬降局部1px/80ms；升级显示LEVEL UP；结束420ms逐渐变暗及有限色差后稳定。减少模式无扫描/冲击/色差，关闭模式不创建装饰动画；文字和规则保留。
- 最高分由App在得分/结束事务后保存，结束页“新纪录”比较本局开始时最高分；六项设置仍由Settings/Storage容错保存，声音开关不影响规则。

## 3. 文件范围

新增12份代码/测试：

- src/runtime/input.js、game-loop.js、session.js。
- src/audio/music-score.js、sound-presets.js。
- src/dev/integration-review.js、assets/integration-review.html。
- tests/fixtures/platform.js。
- tests/unit/runtime.test.js、audio-manager.test.js。
- tests/integration/app-lifecycle.test.js、feedback-pipeline.test.js。

修改7份代码/测试：src/app.js、audio/audio-manager.js、effects/visual-effects.js、ui/ui-controller.js；index.html；tests/unit/ui-state.test.js、visual-effects.test.js。

新增本报告；更新AGENTS.md、README.md及docs下PROJECT_CONTEXT、DECISIONS、AI_COLLABORATION_LOG、ARCHITECTURE、AUDIO_VISUAL_SPEC、TEST_PLAN、TASK_PLAN、GAME_RULES。CSS、Renderer、core、data、main和package未修改，无Git提交/推送/发布。

验收入口分工：visual-review只检查静态七色/状态；integration-review使用真实App/Engine/Input/Loop/Audio，提供普通、四消升级、结束前固定初局和只读诊断。后者使用内存存储，不污染玩家最高分；生产入口不导入夹具。其“两轮音频信号”按钮已提供，但本轮未点击执行，不声称已有PCM/峰值结果。

## 4. 实际验证

最终命令：npm.cmd test，116通过、0失败、0跳过，exit 0，约372.9ms。包含全部既有79项及37项新增。HTTP测试使用自动审核允许的本地回环/临时链接权限；本轮没有自动审批拒绝。

44份src/scripts/tests JS/MJS逐个node --check通过。与上轮SHA256快照比较，9个core文件变化0项。原始测试输出保存.artifacts/stage07/test-results.txt；静态结果保存.artifacts/stage07/static-verification.json。

新增自动化证据：

- 真正App＋Engine输入/重力/Hold/状态、焦点/隐藏/重开/销毁，重复开始不产生第二循环；40次UI命令重开，以及独立100次运行探针。
- Session时间化暂停、同刻重力边界、落地剩余锁定、迟到输入、512队列溢出、长停顿、不补播；同一时间化输入在60/144Hz结果和事件完全一致。
- 真正Engine→Session→EventManager→Audio/Effects流水线四消跨级：816分、13行、等级2；同批各一次；重复消费不重播。
- 静音＋关闭动画仍得到同样规则结果；暂停节点stop为+80ms，结束为+600ms；100次重开一个Context/调度器，销毁资源0。
- AudioContext替身跨约70秒两轮调度、暂停位置、音效限频/8声部、15事件映射、静音/预听、延迟解锁、旧局/旧回调、close拒绝；Effects强度/彩带/归稳/去重/真实存在节点的取消回收。

浏览器部分实查：既有127.0.0.1:5173服务可用，重新加载主入口；点击开始并发送D/Q/E/W/C/Space后，界面得分39、Hold为T、Next为J，随后PAUSED。主页面warn/error为空。真实整合页创建AudioContext后contextState=running，已播放位置约0.98秒，随后PAUSED、schedulerCount=0、音乐/音效/预听节点均为0，error=null。

浏览器限制：内置预览帧回调间隔约1秒，诊断lastPauseReason=STALL，正确触发250ms保护；无法据此完成持续游戏验证。尝试用Computer Use补查桌面Edge时，工具因无法可靠识别当前浏览器URL而停止，未继续控制窗口。一次document.hasFocus只读查询不受工具支持，不是页面控制台错误。截图在工具输出中展示，但本轮未保存新的截图文件；不复用旧图冒称本轮结果。之后仅继续终端测试和文档工作。

## 5. 用户要求的12项整合检查

“自动化通过”包含真实规则与可控平台边界，不等于实际设备听测。

| 项目 | 结果/证据与限制 |
|---|---|
| 1 开始音乐 | 自动化通过；浏览器Context running且乐曲位置推进；未实际听音 |
| 2 暂停音乐 | 自动化位置冻结/80ms释放通过；浏览器暂停调度0 |
| 3 恢复音乐 | 自动化保留位置、唯一调度器通过；实际听感未测 |
| 4 结束淡出 | 真实引擎失败事件到+600ms停止自动化通过；实际音量包络未听测 |
| 5 操作对应音效 | 15类映射与真实四消事件链通过；逐项实听未测 |
| 6 四消特殊反馈 | 独立奖励谱、错峰升级、局部双彩带、去重自动化通过；自然游玩/实听未测 |
| 7 关闭音效静音 | 禁止新节点、释放旧音/预听及跨重开静音通过；物理扬声器未测 |
| 8 关闭动画继续游戏 | 真实消行计分升级相同，无动画资源，自动化通过 |
| 9 设置持久化 | 序列化、重新构建读取和系统减少偏好测试通过；本轮实际浏览器刷新设置未重测 |
| 10 快速连续操作 | 限频、8声部、批次仲裁、重复seq与旧局抑制通过；听感未测 |
| 11 重开残留 | 100次换局资源清理、旧异步回调失效、Context复用通过 |
| 12 重复游戏循环 | 唯一rAF所有者、重复start/resume、40/100次重开、dispose后0通过；实际FPS未测 |

## 6. 发现、修复与审查处理

音频子Agent负责谱、音效及生命周期测试；效果子Agent负责分级局部反馈与效果测试，再转为只读整合审查；主Agent统一接口、读回代码、实际运行全套并修正问题，没有直接把子Agent报告当结论。

采纳的审查问题：预听音量归零仍响、无关开关取消预听、close拒绝传播；主Agent探针核验后修复，并增加2项回归。主Agent还修正同批升级标签被消行覆盖（先clear回调再upgrade）、本局新纪录比较基线、预听异步解锁后已关闭设置的旧请求。

一次60/144Hz新增测试先10通过/1失败，原因是测试时间线排序把undefined转Number得到NaN，导致同刻帧先提交、输入成为真实迟到；修正夹具同刻排序后11项全过，没有修改引擎迎合测试。内置浏览器STALL不是用放宽保护掩盖；额外显示保护暂停原因，新增UI回归。

## 7. 未解决事项与下一步

实现已接通，体验验收未全部完成。需在普通桌面浏览器前台连续游玩，实听至少两轮原创音乐、所有事件音、淡出/重开、快速操作；运行整合页两轮OfflineAudioContext信号检查，测峰值并核对循环接缝。独立浏览器、高DPR/缩放、物理触控、持续FPS、闪光录屏和色弱仍未测。没有承诺已达60FPS或无削波/无障碍认证。

下一阶段建议专注真实设备试玩、音量平衡与性能验收，不扩大玩法。本阶段暂停，等待用户指令。

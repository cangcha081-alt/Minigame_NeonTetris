# 第四阶段 · 最小可运行框架交付

日期：2026-11-06（Asia/Shanghai）。本阶段基于用户明确指令实施，不延伸到完整游戏。状态：框架运行验证完成，等待下一阶段指令。

## 一、实际范围

原生HTML/CSS/ES Modules，Node内置HTTP服务与test/assert；第三方运行和开发依赖均为0，因此未执行依赖下载/安装，没有node_modules或锁文件。package.json提供dev/test。

页面具备标题、副标题、10×20空Canvas网格、得分/等级/行数/最高分面板、Next/Hold占位区、完整键位说明、开始/暂停/继续/重开确认和设置入口。采用统一色彩、字体、边框、阴影、辉光和间距变量，静态色差与扫描线，不实现完整动态特效。

开始仅切换RUNNING框架预览，不生成方块；得分保持0、等级1。页面明确提示玩法尚未接入，不把空框架描述为可玩游戏。

## 二、模块实现程度

| 模块 | 当前实现 | 尚未实现 |
|---|---|---|
| GameEngine/Board | 空22×10数据、只读副本、READY/RUNNING/PAUSED幂等切换 | 活动方块、推进时间、随机、碰撞、旋转、消行、计分与GAME_OVER |
| EventManager | 同步批量分发、取消监听、错误隔离、禁止重入 | 完整游戏事件生产链与只读信封约束 |
| AudioManager | 用户手势初始化/恢复Context，独立音乐/音效增益，session失效，幂等销毁 | 乐谱、事件音效、音乐排程、声音预听和完整淡出 |
| VisualEffectsManager | applyMode/resetSession/handleBatch/sample/clear/dispose接口与局次过滤 | 动画、粒子、闪光与完整特效队列 |
| SettingsManager | 六项偏好、类型校验、音量夹取、系统减少偏好/显式覆盖、订阅与清理 | 拖动保存合并优化，真实音画效果响应 |
| StorageManager | schemaVersion=1、最高分/偏好读取写入、异常降级 | 真实游戏创新纪录事件接线 |
| App/UI/Renderer | 装配、单个按需rAF、窗口/棋盘失焦暂停、弹层、DPR网格 | 完整InputManager/GameLoop模块、活动块渲染与结束页 |

不为了空目录创建无用途文件；assets及其素材子目录在有实际资源时再建立，音乐数据未来归src/audio。

## 三、运行说明

在项目目录执行 `npm.cmd run dev`（PowerShell也可用`node scripts/serve.mjs`），访问 http://127.0.0.1:5173 。仅监听回环地址；Ctrl+C停止。若端口占用，显式设置PORT后启动，不自动换端口。当前交付时预览服务保持运行，若会话结束后服务不可达，重新执行上述命令。

测试命令：`npm.cmd test`。Node需求≥24，当前实测v24.18.0，npm11.16.0。

## 四、真实测试与浏览器检查

1. `node --test tests/unit/foundation.test.js`：7通过、0失败。覆盖事件移除/错误隔离/递归发布、设置保存与null系统偏好、存储失败/非法数据、最高分校验、快照隔离/幂等状态、迟到音频解锁与销毁。
2. `node --test tests/integration/server.test.js`：5通过、0失败。覆盖真实HTTP的HTML/JS/CSS/中文路径MIME、HEAD、404/405、私有路径与穿越、真实路径链接隔离。fixture在创建后立即注册清理，删除前校验位于tmpdir直属子目录且有专用前缀。
3. `npm.cmd test`：整套12通过、0失败。所有JS/MJS分别执行`node --check`，通过语法检查。不是完整游戏规则测试。
4. 服务与集成测试在默认沙箱曾因回环连接EACCES/junction权限EPERM失败；通过自动审核后在受控沙箱外运行本地命令，没有自动审核拒绝。真实测试首次暴露目录状态码不一致（403/预期404），修正后通过。没有隐瞒失败或把环境错误当逻辑通过。
5. 浏览器实际使用ChatGPT内置浏览器（不是另行宣称已测Edge/Chrome/Firefox）。页面data-ready=true，全部本地模块导入成功且Canvas已绘制；最后`tab.dev.logs`过滤warn/error返回空数组。
6. 浏览器实际点击：开始→暂停→继续；重开弹层→取消保持暂停；再确认重开进入RUNNING；从运行进入设置→关闭保持PAUSED。独立审查发现的focusout/click切换风险已修正，并在实际按钮点击中复核。
7. 设置将音乐调至42%、减少效果开启、总效果关闭：控件即时更新，减少选项禁用；刷新再开设置仍为42%/总效果关闭/减少开启。随后恢复35%/效果开启/减少关闭；测试浏览器的减少偏好为显式false，不再是首次访问的null。
8. 布局：1280×720、1366×768、960×640与390×844实际检查；均无横向溢出。1366页面为768高、960页面约641高（约1px纵向滚动），390窄屏棋盘在前、侧栏在下，允许纵向滚动，页面约1325高。临时视口最后已复位。
9. 普通视口截图已通过工具显示；一次fullPage截图接口失败，未冒称保存全页截图。浏览器验证过程中遇到一次布局切换后的节点失效、一次重开按钮同名定位歧义，均先重新观察，再使用弹层内定位完成验证；不是产品异常。

## 五、发现问题与修正

- 初版侧栏/棋盘高度令720高窗口底部按钮落到首屏外：收紧面板、间距并增加低高度断点，按实际可用高度缩放棋盘；低高度格子可到18px，真实可玩可读性后续复评。
- 暂停按钮按当前phase toggle可能与焦点自动暂停抵消：UI捕获按钮目标，App执行幂等pause/resume；补棋盘focusout暂停及销毁时移除监听。
- 子Agent服务测试夹具初版只在listen成功后注册清理：主Agent核验后要求提前注册并加入临时路径检查，已修正。

## 六、文件清单

新增实现/配置20份：

- .gitignore、package.json、index.html
- styles/tokens.css、styles/layout.css、styles/theme.css
- src/main.js、src/app.js
- src/core/board.js、src/core/game-engine.js
- src/runtime/events.js
- src/render/renderer.js、src/ui/ui-controller.js
- src/data/settings.js、src/data/storage.js
- src/audio/audio-manager.js、src/effects/visual-effects.js
- scripts/serve.mjs
- tests/unit/foundation.test.js、tests/integration/server.test.js

新增文档：docs/STAGE_04_REPORT.md。

修改文档：AGENTS.md、README.md、docs/PROJECT_CONTEXT.md、docs/DECISIONS.md、docs/AI_COLLABORATION_LOG.md、docs/ARCHITECTURE.md、docs/DESIGN_SPEC.md、docs/TASK_PLAN.md、docs/DEVELOPMENT_PLAN.md。

## 七、尚未验证与下一步

完整PRD的AC01～AC23均不能整体标通过。尚无方块玩法、音乐、操作音效、复杂动画、完整游戏输入及规则时间推进；未测完整游戏性能、所有音频输出、跨浏览器或真实手机操作。现有测试音频是假Context边界测试，不代表听感/自动播放兼容性已通过。

下一阶段建议从T02～T05的方块数据、碰撞、七袋、旋转和计分纯规则着手，再集成T06；本阶段结束后暂停，等待用户指令。

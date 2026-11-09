# 试玩反馈优化记录

2026-11-07（Asia/Shanghai）。目标：根据用户真实试玩的四项意见增强表现与节奏，保留NIGHT SHIFT ARCADE主题、计分/7-Bag/墙踢/输入约定。用户本轮明确允许背景图片及时间加速，覆盖此前无图片和仅等级加速的阶段限制。

## 已完成

1. 字体：暂停改为PAUSE大字，使用Impact/Arial Black系统字栈、纸白描边、斜切与立体投影；说明仍清晰无衬线。奖励数字使用同系夸张字形，计分仪表维持易读数字。
2. 背景：原样复制用户参考图二为assets/night-shift-room.jpg（429294字节），机台外显示复古CRT房间；实色机台遮挡杂乱中心，棋盘/仪表不叠图片。没有生成图片、外部字体或新依赖。来源说明见assets/ASSET_SOURCES.md，未将用户图片声明为原创/开源授权。
3. 节奏：有效游戏时间每60秒一档、最多4档。音乐112/120.96/129.92/138.88/147.84BPM；换档保曲中谱面位置、音高不变，旧音短释放，不增加第二调度器。仍为原主题曲，未增加新曲库。
4. 难度：自然下落为max(80,round(1000×0.82^(level−1)/(1+.12×档位)))ms。1级每档1000/893/806/735/676ms。暂停不计时、重开归零；已排截止不突然提前，下一排程采用新速度。软降35ms、锁定500ms和实际等级计分不变。此曲线由Agent选定首版，待用户实机反馈。
5. 消行：8/10/12/16个局部像素粒子及一次+实际消行奖励浮字，至多450ms；四消最多21节点（4旧行+16粒子+1浮字），总动画句柄上限32。独立xorshift随机源不消费规则随机。新消行/暂停/模式/换局/销毁回收；减少/关闭模式无飞散/放大，保留静态+奖励标签。不因软降每格刷屏。

## 文件范围

新增src/core/intensity.js、tests/unit/intensity.test.js、assets/night-shift-room.jpg、assets/ASSET_SOURCES.md和本报告。
修改src/core/score.js、game-engine.js（仅自然重力间隔接入时间）；src/app.js；src/audio/audio-manager.js；src/effects/visual-effects.js；src/ui/ui-controller.js；src/dev/visual-review.js；styles/theme.css；tests/unit/audio-manager.test.js、visual-effects.test.js、ui-state.test.js；tests/integration/feedback-pipeline.test.js、app-lifecycle.test.js。更新AGENTS、README及相关规范/记忆。没有改输入/循环实现、计分奖励、方块模板/随机/墙踢，没有提交/推送/发布。

## 协作与核验

tempo_feedback子Agent限定音频变速/共享纯函数/音频测试，实际相关20项通过；reward_feedback限定Effects及测试，13项通过。主Agent读回实现、接App/UI/CSS/规则，调整真实流水线测试检查4行+16粒子+1浮字，而非仅旧4行；新增有效时间/暂停/重开、App音频档位接线、静态奖励数字测试，整套复核。未把子Agent测试当作真实听音。

## 实际验证

- 最终npm.cmd test：126通过、0失败、0跳过（此前116，本轮新增10），exit0，约435.2ms；原输出.artifacts/playtest-feedback/tests.txt。
- src/scripts/tests共46份JS/MJS逐个node --check通过。
- 覆盖60秒边界/四分钟上限/80ms下限、暂停不积累难度、重开重置、tempo换档谱位/音高/单调度器/旧回调、真实消行粒子上限与自然完成释放、减少/off/暂停/换局清理、静态+2400文字及真实App时间接线。
- 最初服务未运行导致连接拒绝，启动npm.cmd run dev后仅127.0.0.1:5173服务可用。旧错误页为data URL，工具阻止绑定；新建合法localhost标签成功，没有操作错误页或绕过安全提示。
- 内置浏览器实际检查1366×1000及390×844的背景/七色/暂停标题；移动棋盘底边约778.9，文档宽375≤390，无横向溢出。四消样张分数12800→15200、行数24→28，之后资源0动画/0临时节点。该样张不代表真实游玩达成四消，也没有捕捉到粒子/浮字中间帧截图。
- 样张和主入口已查warn/error为空，主入口正常加载；临时视口已reset，主入口保留。本轮没有实际听音、长时间游玩或FPS测试。
- [桌面暂停截图](../.artifacts/playtest-feedback/desktop-pause.jpg)、[移动暂停截图](../.artifacts/playtest-feedback/mobile-pause.jpg)为实际截图，不是生成图。

## 未解决与下一步

需要用户再试玩确认字形/背景强度、一分钟一档的速度/音乐体验、奖励浮字与粒子强度。自动化验证的是调度/规则/资源，不代表听感或性能认证；减少模式保持无飞散。下一步建议集中调参，不再扩大玩法。本轮完成后暂停。

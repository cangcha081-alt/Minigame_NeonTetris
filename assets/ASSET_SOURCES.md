# NEON TETRIS · 视听资源来源

2026-11-07 · 课程提交版

| 资源 | 来源与实现 | 随项目交付的内容 |
| --- | --- | --- |
| NIGHT SHIFT 背景音乐 | 项目原创音符与节奏编排。以方波、三角波、正弦波通过 Web Audio 合成。基准 112 BPM，16 小节循环 | [music-score.js](../src/audio/music-score.js)、[audio-manager.js](../src/audio/audio-manager.js) |
| 15 类事件音效 | 项目原创预设。由振荡器、频率变化及短包络实时合成 | [sound-presets.js](../src/audio/sound-presets.js) |
| 当前 CRT 房间背景 | 用户在离线版更新时提供的原始 PNG，按要求作为游戏背景。未核实作者或公开分发授权 | [night-shift-room.png](night-shift-room.png) |
| 上一版夜班城市背景 | Agent 为本项目手写 SVG。保留为历史素材 | [night-shift-city.svg](night-shift-city.svg) |
| 机台标识、方块和 CRT 效果 | 项目内嵌 SVG 几何标识、Canvas 方块绘制、CSS 材质和 Web Animations 动效 | [index.html](../index.html)、[styles](../styles/)、[render](../src/render/)、[effects](../src/effects/) |
| 字体 | CSS 调用设备已有的 Bahnschrift、Arial Narrow、Impact、Arial Black、Segoe UI、Microsoft YaHei UI、Cascadia Mono、Consolas 或系统回退字体。字体由系统提供 | [字体变量](../styles/tokens.css)和[主题样式](../styles/theme.css)，无字体文件 |
| 验收页 | 项目编写的 HTML 与 JavaScript 夹具，复用游戏源码和同一套静态资源 | [视觉页](visual-review.html)、[整合页](integration-review.html) |

试玩阶段使用的 `night-shift-room.jpg` 是另一张图，已从早期提交版移除。当前 PNG 由用户在本轮提供，按要求用于本地交付。运行时素材均从本地项目加载，未打包外部音频或字体文件。


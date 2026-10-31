# LLM Analysis · Toneymiller

大模型算子、KV cache、显存预算与 Prefill / Decode 推理分析工作台。

**[打开在线工作台](https://toneymiller.github.io/LLM-Analysis/)** · [数据与依据](sources.html) · [审阅和改进](docs/AUDIT.md) · [技术修复细节](docs/TECHNICAL_AUDIT.md)

本仓库 fork 自 [Biuapha/LLM-Analysis](https://github.com/Biuapha/LLM-Analysis)，保留原作者的模型资料、来源引用、计算器和交互图。上游基线为 `06166dbbf9cd2dc0cd3119f4563cc8a46da489cf`。新增的工作台界面、参数分享及技术修复见提交记录。上游未声明许可证，本仓库不对上游内容新增许可授权。

## 可以做什么

- 在 GLM-5.3-Flash 和 DeepSeek-V4.1-Flash 之间切换，阅读执行总览和 Tensor 数据流。
- 查看 KV / recurrent state 分组和张量布局，估算单 rank 的权重及缓存预算。
- 分别分析纯 Prefill 和纯 Decode 的 batch / 延迟约束，导出原有仿真 JSON。
- 搜索算子、Tensor 和 Shape，放大画布，小屏左右滚动阅读。
- 自动在当前浏览器保存参数，点击“复制配置链接”分享完整计算器输入；链接优先于本地参数。

配置分享只包含模型与表单参数，不包含 token、后端任务 ID 或服务地址。没有统计脚本。存储受限时基础计算仍可使用。恢复初始参数会清除本工作台自己的保存值。

## 结果口径

图中的连线主要表示逻辑依赖，不能等同于实机 kernel trace。解析估算、指定范围内的实测校准以及运行快照应分别解读；更换硬件、并行布局、输入长度和实现版本时，校准数值不保证可迁移。界面中的 MTP 平均产出是独立假设，调高 ITL / TPOT 目标不会改变该假设。

GitHub Pages 上可直接运行解析计算。可选 msmodeling 原生模式需要用户自己运行兼容的本地服务；本仓库没有附带该服务，分享配置不会启动它，也不自动恢复连接。

## 本地运行与验证

只需要 Node.js 20+，没有安装依赖或构建步骤。

```sh
npm start
node scripts/check.cjs
npm test
```

打开 `http://127.0.0.1:4173`。原始直达路径 `glm53_prefill_decode_operator_block_diagram.html` 继续有效。

## 代码组织

| 路径 | 用途 |
| --- | --- |
| `glm53_prefill_decode_operator_block_diagram.html` | 上游图表、模型数据及经修复的计算逻辑 |
| `assets/workbench.*` | 独立工作台外观、搜索、缩放和键盘交互 |
| `assets/config-*` | 有版本号和大小限制的参数编码、保存和分享 |
| `tests/` | 仿真公式、SLO 独立性和配置处理的回归检查 |
| `docs/` | 审阅结果、来源与限制 |

快捷键：`1`–`4` 切页，`+` / `-` 缩放，`0` 适应窗口，`/` 搜索，`?` 打开帮助。输入参数时不触发全局快捷键。

## 发布

GitHub Pages 使用 `main` 根目录。GitHub Actions 自动运行静态校验与回归测试。修改页面后提交即可触发 Pages 更新。

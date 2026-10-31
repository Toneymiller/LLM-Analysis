# 技术审查与修正记录

审查日期：2026-10-31。审查基线为上游 `biuapha/LLM-Analysis` 提交 `06166dbbf9cd2dc0cd3119f4563cc8a46da489cf`。本页区分模型配置事实、参考运行时证据与浏览器规划假设。

## 本次修复

### 1. 将平均产出与 SLO 上限分开

原入口把每周期平均产出设为 `ITL 上限 / TPOT 上限`。这样，即使模型、batch、硬件与草稿数量不变，放宽 ITL 也会提高假设产出，进而提高候选的预测 QPS。例如，原设定由 90 ms / 20 ms 得到 4.5 tokens/周期；只把 ITL 改为 180 ms，就会触及 6 tokens/周期的上限。算子耗时未变时，候选吞吐因此增加约 33%。这混合了服务要求和工作负载假设。

现在 GLM 的“平均产出”输入和 DeepSeek 的“平均产出”输入独立控制该假设。两项时延上限只筛选候选。同一 batch 的周期时间、平均产出和预测吞吐不会因 SLO 修改而变化；搜索得到的最优可行 batch 仍可能变化。

- GLM MTP 的产出范围为 `1 … min(输出长度, draft + 1)`。
- DeepSeek DSpark 的产出范围为 `1 … min(输出长度, 6)`。
- 标准自回归与原生 msmodeling MTP0 每次产出 1 token。
- 非法数值会报告配置错误；缺少产出参数时采用 1。
- GLM 的实测插值来源重新可以选择；覆盖范围外使用界面中显式设置的手动值。

`TPOT = 周期平均服务时间 / 每周期平均产出` 仍是规划模型使用的定义。这不表示客户端逐 token 到达间隔恒定，也不表示测得了接受率。

### 2. 保留校准后的末上下文时延估计

原 MTP 校准路径将实测平均周期时延直接赋给 `worstITL`。平均值不能证明最慢一步或某个分位数。

现在先用原有实测均值校准平均周期，再把同一倍率应用于末上下文的解析周期时间。导出字段 `worstLatencyBasis` 明确标记为 `scaled_analytic_last_context`。该数值依然是模型估计，不是实测最大值或客户端 p99。

校准训练与验证划分没有改变：MTP5 的限定配置仍为 A3 单机、DP16/TP1/EP16、I4096/O1024；训练 batch 为 4/6/8，5/7 用于插值验证，9 在覆盖范围之外。未把这些残差迁移到 DeepSeek 或任意硬件布局。

### 3. 同步界面与导出说明

移除“从时延目标自动构造产出”的界面文案，更新产出来源、MTP 可选显存、双 SLO 与末步估计的导出定义。切换原生引擎时保存手动产出设定，切回本地模型后恢复。

## 官方资料核验

以下 GLM 模型结构与[官方配置](https://huggingface.co/zai-org/GLM-5.3-Flash/blob/main/config.json)一致：45 个主层，其中 34 个线性注意力层、11 个稀疏注意力层；前三层采用 Dense MLP，其余采用 MoE；288 个路由专家，每 token 选择 8 个；一层 MTP；主隐藏维度 4096；KDA 为 64 heads × 128；MLA latent 宽度 512；Indexer 的 pool 大小 4、token 选择预算 2048。

官方配置中的量化格式与本项目捕获的 Ascend W8A8 checkpoint/运行时布局不是同一口径。这里的权重字节、FP32 转换、统一物理页与页分组应理解为具体 checkpoint 和运行时的规划依据，不能推广为该模型在所有推理框架中的固定显存需求。

DeepSeek 的三层 DSpark、五个草稿位置、Markov/Confidence 分支以及复用主 embedding/head，可对照[官方参考实现](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/314113f8a7dadb388215396ba5fbee2c610a04d6/inference/model.py)阅读。本次没有声称该配置已在 Ascend 上部署验证。

## 仍属规划假设的部分

- 硬件峰值和效率画像、GEMM occupancy、向量流量、通信隐藏与负载偏斜均是模型输入或近似，不能替代 profiler 或吞吐压测。
- 单独的 P/D 服务容量没有包含请求排队、混合调度、PD 传输、到达分布与客户端分位时延；两端 QPS 不能直接相加得到端到端容量。
- MTP/DSpark 平均产出没有由硬件性能推导出来，需要实际工作负载的接受统计支持。手动值用于情景分析。
- GLM 的解析稀疏注意力以 2048 个 token 为主预算，未完整展开最多 3 个不完整 tail token 的逐位置差异。[Transformers 参考实现](https://github.com/huggingface/transformers/blob/main/src/transformers/models/glm5_next/modeling_glm5_next.py)明确处理完整 pool 与 incomplete tail；未来若追求逐位置计数，可结合该逻辑和具体后端补齐。
- 统一物理页、预留与 scratch 预算可能与后端的图缓存、实际分配器和抢占策略不同。容量通过表示“本规划预算可容纳”，不等于实测运行成功。

## 回归验证

执行：

```console
node --test tests/model.test.cjs
```

12 项测试全部通过。测试直接从 HTML 加载纯计算函数，不另写一份仿真器；覆盖脚本语法、SLO 与产出的独立性、AR/native 单 token 语义、产出限幅、非法输入、校准范围、校准后的末上下文估计、pool 的离散计数、Roofline 交叉点求和、稀疏阈值边界与显存页预算。

这些测试验证公式与程序行为的一致性，没有执行 NPU 内核，也没有新增硬件性能实测。

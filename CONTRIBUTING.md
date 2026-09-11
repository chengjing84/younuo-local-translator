# 参与开发

主源码位于本目录的 extension/ 与 host/，外层的 staging 与旧原型不用于发布。

## 提交前检查

- Python 3.10+：`python -m unittest discover -s tests -v`。
- Node 20+：`npm ci`，`npx playwright install chromium`，`npm test`，`npm run check`。
- 修改页面处理时，应补充原文恢复、异步响应、节点复用或用户操作回归测试。
- 模型提示词更改需运行 `python tools/model-smoke.py`，人工核对输出；不要把有效 JSON 当作语义准确性的证明。
- 服务只支持 loopback，不能增加未经说明的外部数据传输。
- 不提交 host/config.json、日志、用户网页、浏览器 profile 或模型文件。

## 报告问题

提供扩展/Edge/Ollama 版本、模型名称、简短复现步骤和脱敏的 HTML 样本。说明是原文恢复、排版、连接、性能还是翻译质量问题。截图中请去除访问令牌和私人内容。

浏览器回归测试对 Chrome API 与模型输出使用 mock；真实侧载、真实模型质量和 Windows 生命周期需分层验收。当前验证记录位于 docs/VALIDATION.md。

所有贡献按 MIT 发布。欢迎修复实际站点问题、改进中文/英文说明和增加质量样本。

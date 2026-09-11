# 优诺 · 本地网页翻译

**让阅读，回到内容本身。**

基于 Edge + Ollama 的免费开源翻译扩展。为已经会安装扩展、运行本地模型的用户而做：连接一次，一键翻译，滚动时继续，随时恢复原文。

[English](README_EN.md) · [B 站：ANNO_YOO杏野](https://space.bilibili.com/13412148) · [源码与反馈](https://github.com/chengjing84/younuo-local-translator)

![优诺翻译弹窗](docs/images/popup.png)

## 快速开始

环境：Windows 10/11、Microsoft Edge、Python 3.10+、Ollama。使用插件无需 Node.js；它仅用于开发测试。

1. 安装并启动 Ollama，下载模型：

   ```powershell
   ollama pull qwen3.5:9b
   ```

   推荐 Qwen3.5 9B；也支持已有的 `qwen2.5:3b`。`qwen3:1.7b` 保留为试验选项，可能存在明显的语义错误。

2. 解压发布包，双击 `install.cmd`。安装器检查 Python、创建虚拟环境、启动服务，成功后设置当前用户登录自启。后台仅依赖 Python 标准库，无付费 API。
3. 打开 `edge://extensions`，启用开发人员模式，加载本项目的 **extension** 文件夹。
4. 在首次连接页粘贴 `host/config.json` 中的 token，检查连接，选择已安装模型并保存。
5. 回到普通网页，点击优诺 → **开始翻译**。

日常启动：`start-host.cmd`。取消后台自启并停止服务：`uninstall.cmd`；扩展需在 Edge 中手动移除。Ollama 的安装、启动与模型下载由用户自行管理。

如果 PATH 中的 Python 指向错误环境，可显式指定：`powershell -ExecutionPolicy Bypass -File tools/install.ps1 -PythonPath "C:\你的Python路径\python.exe"`。

## 阅读与设置

- **译文**：原位替换文字。
- **对照**：保留原文，紧随显示译文。
- **原文**：停止该网站的持续翻译，恢复其已打开页面的原文。
- **网站记忆**：按完整来源（协议、主机、端口）保存。不同子域名、HTTP/HTTPS 互不继承。第三方 iframe 不继承顶层网站的开启状态。
- **划词**：只翻译实际选中的文字，结果可复制，Esc 关闭。当选中完整的已翻译文本节点时，可对照其原文润色。
- **术语**：固定译法和保护词各最多 100 条，区分大小写。保护标记未被模型保留时返回错误，不默默接受损坏结果。URL 也会被保护。
- **设置导入导出**：只包含模型和术语，不包含令牌。设置页可移除自动翻译的网站。

切换语言会重新翻译当前网站。保存模型或术语后，已开启页面会使用新设置。无法连接时，从弹窗进入连接设置；模型忙或超时时，点击重新翻译/重试。

## 0.8.0 升级

1. 运行旧版本的 `uninstall.cmd` 停止旧服务。如果从 0.7.0 升级，它的卸载脚本可能未识别相对路径启动的进程；请关闭原服务窗口，或确认该项目的 Python 服务进程已结束。
2. 更新文件，保留自己的 `host/config.json`。运行新版 `install.cmd` 或 `start-host.cmd`。
3. 在 Edge 扩展管理页点击重新加载，**刷新已经打开的网页**。
4. 旧版的标签页/域名会话被清除，需要在希望自动翻译的网站重新点一次开始。术语和连接设置保留。

## 隐私与权限

翻译正文只发送给 `127.0.0.1` 的优诺服务（默认端口 8765），再交给本机 Ollama。后台禁止远程 Ollama 地址并忽略系统 HTTP 代理，不记录请求正文，不包含遥测、广告或账户系统。模型下载与用户主动打开作者/GitHub 链接需要网络。

扩展需要访问网页内容来翻译文字；`tabs` 用于核对网站来源和清理页面状态，`storage` 保存本机偏好，`scripting/activeTab` 用于当前页面注入。后台访问需要令牌，网页来源即使持有令牌也不被接受。不要分享自己的 config.json。

近期译文在浏览器页面和后台内存中有有界缓存，服务退出后后台缓存消失；扩展保存术语、网站偏好与令牌。卸载脚本不删除这些本机配置，删除前可自行导出术语。

## 已知边界

- 模型生成的译文仍可能出现误译，尤其是较小模型、专业术语和长句。结构校验不能证明语义正确，重要信息建议使用对照模式。
- 不翻译浏览器内部页、PDF、Canvas/图片文字、Shadow DOM；第三方 iframe 不自动翻译。
- 编辑器、代码块、translate=no 区域默认跳过。当前按文本节点翻译，跨节点的完整句子可能失去上下文；超过 3000 字符的单节点暂时跳过。
- 页面高频修改、复杂虚拟列表与站点样式仍需更多实际站点验证。只读内容也可能与网站自身框架产生冲突；可以随时停止。
- 前端取消会丢弃旧响应并断开等待；已经交给 Ollama 的推理可能继续到完成或服务超时。模型忙时会提示重试，后台不会无限堆积任务。
- 单次后台模型等待最长约 20 秒，前端请求约 25 秒；非常长的片段或冷启动可能超时。模型质量样本与验证边界见 [验证记录](docs/VALIDATION.md)。

## 开发

```powershell
python -m unittest discover -s tests -v
npm ci
npx playwright install chromium
npm test
npm run check
```

Windows 可使用已有 Edge：运行测试前设置 `$env:EDGE_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'`。测试不需要真实模型；手动质量检查使用 `python tools/model-smoke.py`，需要已安装并启动对应模型。

运行 `build-package.cmd` 生成 dist 下的 ZIP。打包不含令牌、日志、虚拟环境、模型、node_modules；包含许可证、说明和测试。详见 [参与开发](CONTRIBUTING.md)、[版本记录](CHANGELOG.md)。

## 作者与许可证

作者：[ANNO_YOO杏野](https://space.bilibili.com/13412148)。欢迎在 B 站分享体验，在 GitHub 提交可复现的问题。

代码采用 [MIT](LICENSE) 许可证；Ollama 与模型的许可由各自项目提供。开源不代表对所有网站和模型输出作出准确性保证。

若默认端口冲突，可修改 host/config.json 的 port，并在连接页填写对应的本机地址。后台启动已不再依赖 VBS。

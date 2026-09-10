# 优诺本地翻译插件 / Younuo Local Translator

一款使用本机 Ollama + Qwen 的 Microsoft Edge 网页翻译扩展。网页文字只发送到本机服务，不经过云端翻译 API。

A Microsoft Edge translation extension powered by local Ollama and Qwen. Page text is sent only to the local service—no cloud translation API is used.

## 功能 / Features

- 自动识别中文、英文、日语和韩语，并可互译
- 原位替换网页文字，不添加影响阅读的译文框
- 点击“开始自动翻译”后，持续处理滚动加载、动态内容和同一标签页中的页面跳转
- 点击“显示原文”后停止自动翻译并恢复原文
- 支持划词翻译、润色、固定译法和禁止翻译词
- 可选 Qwen2.5 3B 或 Qwen3 1.7B

---

- Detects Chinese, English, Japanese, and Korean and translates between them
- Replaces page text in place without intrusive translation boxes
- After **Start auto translation**, keeps translating lazy-loaded content, dynamic page updates, and navigation in the same tab
- **Show original** stops automatic translation and restores the source text
- Supports selection translation, polishing, fixed terminology, and protected terms
- Supports Qwen2.5 3B and Qwen3 1.7B

## 中文安装教程

### 1. 准备环境

- Windows 10 或更高版本
- Microsoft Edge
- Python 3.10 或更高版本
- [下载 Ollama for Windows](https://ollama.com/download/windows)

### 2. 下载模型

至少选择一个模型：

- [Qwen2.5 3B 模型页](https://ollama.com/library/qwen2.5:3b)

  ```powershell
  ollama pull qwen2.5:3b
  ```

- [Qwen3 1.7B 模型页](https://ollama.com/library/qwen3:1.7b)

  ```powershell
  ollama pull qwen3:1.7b
  ```

Qwen2.5 3B 是默认选项；Qwen3 1.7B 占用更小。可以同时安装并在扩展设置中切换。

### 3. 安装优诺

1. 下载仓库 ZIP 并解压，或克隆仓库。
2. 双击根目录的 `install.cmd`。
3. 安装程序会生成本机访问令牌、启动后台，并设置登录 Windows 后自动启动。
4. 打开 `edge://extensions`，开启“开发人员模式”。
5. 点击“加载解压缩的扩展”，选择本项目的 `extension` 文件夹。
6. 打开扩展，根据首次运行页面完成连接检查。

如果需要手动启动后台，双击 `start-host.cmd`。卸载后台自启动可双击 `uninstall.cmd`；Edge 扩展仍需在扩展管理页手动删除。

### 4. 使用方法

1. 打开普通网页并点击优诺图标。
2. 选择原文语言（可用“自动检测”）和目标语言。
3. 点击“开始自动翻译”。之后滚动、新增内容和同一标签页里的页面切换都会继续翻译。
4. 点击“显示原文”可停止自动翻译并恢复网页。
5. 在网页中选中文字，可使用“翻译”或“润色”。

在设置页可以切换模型、添加固定译法和禁止翻译词。

## English setup guide

### 1. Requirements

- Windows 10 or later
- Microsoft Edge
- Python 3.10 or later
- [Download Ollama for Windows](https://ollama.com/download/windows)

### 2. Download a model

Install at least one model:

- [Qwen2.5 3B model page](https://ollama.com/library/qwen2.5:3b)

  ```powershell
  ollama pull qwen2.5:3b
  ```

- [Qwen3 1.7B model page](https://ollama.com/library/qwen3:1.7b)

  ```powershell
  ollama pull qwen3:1.7b
  ```

Qwen2.5 3B is the default. Qwen3 1.7B uses less disk space. Both can be installed and selected from the extension settings.

### 3. Install Younuo

1. Download and extract the repository ZIP, or clone the repository.
2. Double-click `install.cmd` in the project root.
3. The installer creates a local access token, starts the host service, and enables launch at Windows sign-in.
4. Open `edge://extensions` and enable **Developer mode**.
5. Select **Load unpacked**, then choose the project's `extension` folder.
6. Open the extension and complete the first-run connection check.

Double-click `start-host.cmd` to start the host manually. Run `uninstall.cmd` to remove automatic startup. Remove the Edge extension separately from `edge://extensions`.

### 4. Usage

1. Open a regular web page and click the Younuo icon.
2. Choose a source language (or Auto detect) and a target language.
3. Click **Start auto translation**. Lazy-loaded text, dynamic updates, and navigation in the same tab will continue to be translated.
4. Click **Show original** to stop automatic translation and restore the source text.
5. Select text on the page to translate or polish it.

Use the settings page to switch models and manage fixed or protected terminology.

## 隐私与安全 / Privacy and security

- 翻译请求仅发送到 `127.0.0.1` 上的本机服务和本机 Ollama。
- `host/config.json` 包含本机随机访问令牌，已被 Git 忽略，请勿上传或分享。
- The translation service listens on localhost. Keep `host/config.json` private; it is excluded from Git.

## 开发与测试 / Development and testing

```powershell
python -m unittest discover -s tests
node --check extension/background.js
node --check extension/content.js
node --check extension/popup.js
```

运行 `build-package.cmd` 可在 `dist` 中生成不含令牌、日志和虚拟环境的分享包。

Run `build-package.cmd` to create a distributable ZIP in `dist` without local tokens, logs, or the virtual environment.

## 已知限制 / Known limitations

- Edge 内部页面（如 `edge://extensions`）不允许扩展注入，无法翻译。
- Canvas、图片内文字和部分封闭 Shadow DOM 内容无法直接翻译。
- Translation cannot run on protected Edge pages such as `edge://extensions`.
- Text rendered in canvas, images, or some closed Shadow DOM components cannot be translated directly.

# Younuo · Local Web Translator

An open-source Edge extension powered by local Ollama models. Start once per site, translate visible text as you scroll, and restore the original whenever you need it.

[中文说明](README.md) · [Author: ANNO_YOO杏野](https://space.bilibili.com/13412148) · [GitHub](https://github.com/chengjing84/younuo-local-translator)

## Model trade-offs

| Model      | Strength / limitation                                         | Sample mean | Install                  |
| ---------- | ------------------------------------------------------------- | ----------- | ------------------------ |
| Qwen2.5 3B | Maximum speed; known omissions and instruction-answering risk | ~0.23 s     | `ollama pull qwen2.5:3b` |
| Qwen3.5 4B | Recommended daily balance                                     | ~0.41 s     | `ollama pull qwen3.5:4b` |
| Qwen3.5 9B | Quality at a relaxed pace; largest footprint                  | ~0.66 s     | `ollama pull qwen3.5:9b` |

These are eight short samples per model, not a hardware or full-page benchmark. NSFW translation has not been validated for any of these official tags; no support claim is made. The default is unchanged.

See the detailed Chinese [model guide](docs/MODELS.md) and [installation, usage and troubleshooting tutorial](docs/USAGE.md). They include disk/RAM/VRAM planning, exact commands, connection ports, switching models and upgrades.

## Setup

Requires Windows 10 22H2+ / 11, Microsoft Edge, Python 3.10+, and Ollama. Node.js is only needed for development.

1. Start Ollama and run `ollama pull qwen3.5:4b`. You may also enter another installed Ollama model or configure an OpenAI-compatible HTTPS API in Settings.
2. Run `install.cmd`. It creates a Python environment, checks the local service, and enables startup for the current Windows user after successful validation.
3. Open `edge://extensions`, enable developer mode, and load the `extension` directory.
4. Copy the token from `host/config.json` into the connection page, check the connection, and select an installed model.
5. Open a normal webpage and click Start Translation.

Use `start-host.cmd` for manual startup. `uninstall.cmd` stops this project's service and removes auto-start; remove the Edge extension separately. Ollama is managed separately.

## Features and boundaries

Translation, original and bilingual reading modes; exact-origin site preferences; selection translation; polishing of complete translated text nodes; fixed terminology and protected terms; settings import/export without credentials.

Stopping a site restores its open pages. Cross-origin frames do not inherit top-level consent. Switching languages preserves the source text, and stale responses are discarded. Requests are bounded, duplicate work is avoided, and errors are visible.

Translation text stays on loopback. The service rejects remote Ollama URLs, ignores system HTTP proxies and does not log request text. Recent translations are cached in bounded memory. The extension stores preferences and its token locally. There are no cloud translation APIs, accounts or telemetry. Model downloads and links you choose to open require internet access.

Unsupported: browser internal pages, PDFs, images/Canvas, Shadow DOM, automatic translation of third-party frames, and individual text nodes over 3000 characters. Editors and code blocks are skipped. Translation operates on text nodes, so sentences split across markup may lose context. Models can still mistranslate; use bilingual mode for important content. Cancellation discards results but may not stop inference already running in Ollama.

## Upgrade to 0.9.0 Beta

Run `install.cmd` again so the 0.9.0 local service replaces the old process, then reload the extension and refresh open pages. Existing model and glossary settings remain; external API keys are never exported.

## Upgrade to 0.8.0

Stop the old host, preserve `host/config.json`, update files and restart. The 0.7.0 uninstaller may fail to identify a process launched using a relative script path: verify that the old host has stopped. Reload the extension and refresh existing webpages. Legacy site/tab sessions are cleared; connection and terminology settings are retained.

## Development

```sh
python -m unittest discover -s tests -v
npm ci
npx playwright install chromium
npm test
npm run check
```

Set `EDGE_PATH` to an installed Edge executable to test with Edge instead of downloaded Chromium. `python tools/model-smoke.py` runs small manual quality samples against local models. `build-package.cmd` creates a ZIP without credentials, runtime environments or logs.

See [validation](docs/VALIDATION.md), [contributing](CONTRIBUTING.md) and [changes](CHANGELOG.md).

## License

MIT. Copyright 2026 ANNO_YOO杏野. Ollama and model licenses are separate. Qwen2.5 3B uses the Qwen Research License, not MIT; see the linked model guide. [Follow the author on Bilibili](https://space.bilibili.com/13412148).

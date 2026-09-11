# Younuo Local Translator

[简体中文](README.md) | **English**

A lightweight, local-first Microsoft Edge webpage translator powered by Ollama and Qwen. Page text is processed on your own computer and is not sent to a cloud translation API.

## Capabilities

| Capability | Description |
| --- | --- |
| Continuous translation | Click **Start auto translation** once for a site. Younuo keeps translating lazy-loaded text, dynamic updates, SPA routes, child pages, and new tabs on that site. |
| Reading modes | Switch between source, translation, and bilingual modes. Bilingual mode keeps the source text and adds a marked translation for review. |
| Restore source text | **Original** stops continuous translation for the site and restores previously replaced text. |
| Language selection | Auto-detect Chinese, English, Japanese, or Korean, or select the source language manually; choose any supported target language. |
| Local Qwen models | Switch between Qwen2.5 3B and Qwen3 1.7B. Both run through local Ollama. |
| Selection tools | Select page text to translate it independently or polish an existing translation. |
| Terminology rules | Define fixed translations and protect brand names, product names, or code identifiers from translation. |
| Local privacy | The extension talks only to the Younuo service on `127.0.0.1`, which calls your local Ollama instance. |

## Continuous translation behavior

Automatic translation is remembered per website domain:

1. Click **Start auto translation** to translate the currently visible text.
2. New text is translated as you scroll or the page lazy-loads content.
3. Dynamic text changes and SPA route changes are detected and translated.
4. Automatic translation remains active on child pages and new tabs for the same website.
5. Three green dots at the lower-right of the icon animate while translation is in progress; they disappear when the page is idle or complete.
6. Click **Original** to stop the site session and restore source text.

Other websites are unaffected.

## Requirements

- Windows 10 or later
- Microsoft Edge
- Python 3.10 or later
- [Download Ollama for Windows](https://ollama.com/download/windows)

## Download a model

Install at least one model. Model files are not bundled with the repository or release package.

### Qwen2.5 3B — default

[Official Ollama model page](https://ollama.com/library/qwen2.5:3b)

```powershell
ollama pull qwen2.5:3b
```

### Qwen3 1.7B — smaller option

[Official Ollama model page](https://ollama.com/library/qwen3:1.7b)

```powershell
ollama pull qwen3:1.7b
```

Both models can be installed at the same time and selected from Younuo's settings page.

## Installation

1. Download and extract the repository ZIP, or clone it:

   ```powershell
   git clone https://github.com/chengjing84/younuo-local-translator.git
   ```

2. Double-click `install.cmd` in the project root.
3. The installer creates a random local access token, starts the host service, and enables launch at Windows sign-in.
4. Open `edge://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked** and select the project's `extension` folder.
7. Open Younuo and complete the first-run connection check.

Double-click `start-host.cmd` to start the host manually. Run `uninstall.cmd` to remove launch at sign-in. Remove the Edge extension separately from `edge://extensions`.

## Usage

### Translate a page continuously

1. Open a regular webpage and click the Younuo icon.
2. Choose a source language or keep **Auto detect**.
3. Choose the target language.
4. Click **Start auto translation**.

### Translate or polish selected text

Select text on the webpage, then choose:

- **Translate** for an independent translation using the selected Qwen model.
- **Polish** to improve the wording and fluency of an existing translation.

### Models and terminology

The settings page lets you:

- switch between installed Qwen models;
- add fixed source-to-target translations;
- protect terms that should remain unchanged;
- import or export settings as JSON.

## Privacy and security

- Translation requests are sent only to the Younuo host on `127.0.0.1` and your local Ollama instance.
- `host/config.json` contains a randomly generated local access token. It is excluded from Git and must not be shared.
- The local host validates the token sent by the extension.
- No analytics, paid API, account system, or cloud translation service is included.

## Known limitations

- Edge blocks extension scripts on protected pages such as `edge://extensions`.
- Text rendered inside images or canvas cannot be translated directly.
- Some closed Shadow DOM components cannot be inspected by browser extensions.
- Sites that replace their DOM very frequently may cause individual text fragments to be translated again.
- Translation speed and quality depend on the selected model and local hardware.

## Development and testing

```powershell
python -m unittest discover -s tests
node --check extension/background.js
node --check extension/content.js
node --check extension/popup.js
```

Run `build-package.cmd` to create a distributable ZIP in `dist` without local tokens, logs, model files, or the Python virtual environment.

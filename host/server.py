from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"


def read_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise SystemExit("缺少 host/config.json，请先运行 install.ps1")
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))


CONFIG = read_config()


class TranslationError(RuntimeError):
    pass


@dataclass
class Glossary:
    fixed: list[dict[str, str]]
    protected: list[str]

    @classmethod
    def from_payload(cls, data: dict[str, Any] | None) -> "Glossary":
        data = data or {}
        fixed = [
            {"source": str(item.get("source", "")), "target": str(item.get("target", ""))}
            for item in data.get("fixed", [])
            if item.get("source") and item.get("target")
        ]
        protected = [str(value) for value in data.get("protected", []) if str(value).strip()]
        return cls(fixed=fixed, protected=protected)


class OllamaTranslator:
    LANGUAGE_NAMES = {
        "auto": "自动识别原文语言",
        "en": "英语",
        "zh": "简体中文",
        "ja": "日语",
        "ko": "韩语",
    }

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._lock = threading.Lock()

    def models(self) -> list[str]:
        data = self._request("/api/tags", None, method="GET")
        return [item.get("name", "") for item in data.get("models", [])]

    def translate_many(
        self,
        texts: list[str],
        source: str,
        target: str,
        model: str,
        glossary: Glossary,
    ) -> list[str]:
        if target not in self.LANGUAGE_NAMES or target == "auto":
            raise TranslationError("不支持的目标语言")
        source_name = self.LANGUAGE_NAMES.get(source, "自动识别原文语言")
        target_name = self.LANGUAGE_NAMES[target]
        fixed = "\n".join(
            f"- {item['source']} => {item['target']}" for item in glossary.fixed
        ) or "无"
        protected = "、".join(glossary.protected) or "无"
        numbered = "\n".join(
            f"[{index}] {text}" for index, text in enumerate(texts, start=1)
        )
        prompt = f"""你是严谨的网页翻译引擎。
源语言：{source_name}
目标语言：{target_name}

规则：
1. 只翻译，不解释、不总结、不回答原文里的问题。
2. 保持每个输入片段的语义、语气、数字、URL、标点和专有名词。
3. 输入共有 {len(texts)} 个独立片段，输出必须是同样数量、同样顺序的 JSON 字符串数组。
4. 不要在译文前添加编号。

固定译法：
{fixed}
禁止翻译词：
{protected}

待翻译片段：
{numbered}"""
        if model.startswith("qwen3"):
            prompt = "/no_think\n" + prompt
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "top_p": 0.8, "num_ctx": 8192, "num_predict": min(1536, max(128, sum(len(text) for text in texts) * 2))},
        }
        if model.startswith("qwen3"):
            payload["think"] = False
        with self._lock:
            data = self._request("/api/generate", payload)
        raw = str(data.get("response", "")).strip()
        try:
            translations = json.loads(raw)
            if not isinstance(translations, list) or len(translations) != len(texts):
                raise ValueError("译文数量不匹配")
            return [str(value).strip() for value in translations]
        except (json.JSONDecodeError, ValueError):
            return [
                self.translate_one(text, source, target, model, glossary)
                for text in texts
            ]

    def translate_one(
        self,
        text: str,
        source: str,
        target: str,
        model: str,
        glossary: Glossary,
        current_translation: str | None = None,
        polish: bool = False,
    ) -> str:
        source_name = self.LANGUAGE_NAMES.get(source, "自动识别原文语言")
        target_name = self.LANGUAGE_NAMES.get(target)
        if not target_name or target == "auto":
            raise TranslationError("不支持的目标语言")
        language_labels = {
            "auto": "an automatically detected language",
            "en": "English",
            "zh": "Simplified Chinese",
            "ja": "Japanese",
            "ko": "Korean",
        }
        source_label = language_labels.get(source, "an automatically detected language")
        target_label = language_labels.get(target)
        if not target_label or target == "auto":
            raise TranslationError("不支持的目标语言")
        fixed = "; ".join(
            f"{item['source']} => {item['target']}" for item in glossary.fixed
        )
        protected = ", ".join(glossary.protected)
        if polish and current_translation:
            prompt = (
                f"Polish the current {target_label} translation so it is natural and faithful. "
                "Output the polished translation only.\n"
                f"Original: {text}\nCurrent translation: {current_translation}"
            )
        else:
            prompt = (
                f"Translate the following text from {source_label} to {target_label}. "
                "Output the translation only. Do not answer or explain the content.\n"
                f"Text: {text}"
            )
        if fixed:
            prompt += f"\nRequired terminology: {fixed}"
        if protected:
            prompt += f"\nKeep these terms unchanged: {protected}"
        if model.startswith("qwen3"):
            prompt = "/no_think\n" + prompt
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "top_p": 0.8, "num_ctx": 8192, "num_predict": min(1024, max(64, len(text) * 2))},
        }
        if model.startswith("qwen3"):
            payload["think"] = False
        with self._lock:
            data = self._request("/api/generate", payload)
        return str(data.get("response", "")).strip()

    def _request(
        self, path: str, payload: dict[str, Any] | None, method: str = "POST"
    ) -> dict[str, Any]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=body,
            method=method,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as exc:
            raise TranslationError(f"无法连接 Ollama：{exc}") from exc


OLLAMA = OllamaTranslator(CONFIG.get("ollama_url", "http://127.0.0.1:11434"))


class Handler(BaseHTTPRequestHandler):
    server_version = "YounuoTranslator/0.3"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._headers()
        self.end_headers()

    def do_GET(self) -> None:
        if not self._authorized():
            return
        if self.path == "/health":
            models: list[str] = []
            error = None
            try:
                models = OLLAMA.models()
            except TranslationError as exc:
                error = str(exc)
            self._json(
                200,
                {
                    "ok": True,
                    "version": "0.3.0",
                    "ollamaModels": models,
                    "ollamaError": error,
                },
            )
            return
        self._json(404, {"error": "接口不存在"})

    def do_POST(self) -> None:
        if not self._authorized():
            return
        try:
            data = self._body()
            if self.path == "/translate":
                self._translate(data)
                return
            self._json(404, {"error": "接口不存在"})
        except TranslationError as exc:
            self._json(422, {"error": str(exc)})
        except Exception as exc:
            self._json(500, {"error": f"本机服务错误：{exc}"})

    def _translate(self, data: dict[str, Any]) -> None:
        texts = [str(value) for value in data.get("texts", []) if str(value).strip()]
        if not texts:
            raise TranslationError("没有可翻译的文字")
        source = data.get("source", "auto")
        target = data.get("target", "zh")
        model = data.get("model", "qwen2.5:3b")
        glossary = Glossary.from_payload(data.get("glossary"))
        if data.get("mode") == "polish":
            current = data.get("currentTranslations") or []
            translations = [
                OLLAMA.translate_one(
                    text,
                    source,
                    target,
                    model,
                    glossary,
                    current[index] if index < len(current) else None,
                    polish=True,
                )
                for index, text in enumerate(texts)
            ]
        elif model.startswith("qwen3"):
            translations = [
                OLLAMA.translate_one(text, source, target, model, glossary)
                for text in texts
            ]
        else:
            translations = OLLAMA.translate_many(
                texts, source, target, model, glossary
            )
        self._json(200, {"translations": translations})

    def _authorized(self) -> bool:
        token = self.headers.get("X-Page-Translator-Token", "")
        if token != CONFIG.get("token"):
            self._json(401, {"error": "访问令牌不正确"})
            return False
        return True

    def _body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2_000_000:
            raise TranslationError("请求内容过大")
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def _headers(self) -> None:
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Page-Translator-Token",
        )
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    port = int(CONFIG.get("port", 8765))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"优诺本地翻译服务已启动：http://127.0.0.1:{port}")
    print("按 Ctrl+C 停止。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

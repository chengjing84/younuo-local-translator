import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SERVER_PATH = ROOT / "host" / "server.py"


def load_server_module():
    temp = tempfile.TemporaryDirectory()
    temp_root = Path(temp.name)
    config_path = temp_root / "config.json"
    config_path.write_text(
        json.dumps(
            {
                "token": "test-token",
                "port": 8765,
                "ollama_url": "http://127.0.0.1:11434",
            }
        ),
        encoding="utf-8",
    )
    source = SERVER_PATH.read_text(encoding="utf-8").replace(
        'CONFIG_PATH = ROOT / "config.json"',
        f"CONFIG_PATH = Path({str(config_path)!r})",
    )
    module_path = temp_root / "server_under_test.py"
    module_path.write_text(source, encoding="utf-8")
    spec = importlib.util.spec_from_file_location("server_under_test", module_path)
    module = importlib.util.module_from_spec(spec)
    module._temporary_directory = temp
    sys.modules[spec.name] = module
    assert spec.loader
    spec.loader.exec_module(module)
    return module


server = load_server_module()


class GlossaryTests(unittest.TestCase):
    def test_empty_payload(self):
        glossary = server.Glossary.from_payload(None)
        self.assertEqual(glossary.fixed, [])
        self.assertEqual(glossary.protected, [])

    def test_filters_incomplete_fixed_terms(self):
        glossary = server.Glossary.from_payload(
            {
                "fixed": [
                    {"source": "workflow", "target": "工作流"},
                    {"source": "", "target": "无效"},
                ],
                "protected": ["ComfyUI", ""],
            }
        )
        self.assertEqual(len(glossary.fixed), 1)
        self.assertEqual(glossary.protected, ["ComfyUI"])


class OllamaTranslationTests(unittest.TestCase):
    def test_batch_translation_uses_json_prompt_and_auto_language(self):
        translator = server.OllamaTranslator("http://127.0.0.1:11434")
        with mock.patch.object(
            translator,
            "_request",
            return_value={"response": '["第一段", "第二段"]'},
        ) as request:
            result = translator.translate_many(
                ["First", "Second"],
                "auto",
                "zh",
                "qwen2.5:3b",
                server.Glossary([], []),
            )
        self.assertEqual(result, ["第一段", "第二段"])
        payload = request.call_args.args[1]
        self.assertNotIn("format", payload)
        self.assertGreater(payload["options"]["num_predict"], 0)
        self.assertIn("自动识别原文语言", payload["prompt"])
        self.assertIn("简体中文", payload["prompt"])

    def test_qwen3_disables_thinking(self):
        translator = server.OllamaTranslator("http://127.0.0.1:11434")
        with mock.patch.object(
            translator, "_request", return_value={"response": '["번역"]'}
        ) as request:
            translator.translate_many(
                ["翻译"],
                "zh",
                "ko",
                "qwen3:1.7b",
                server.Glossary([], []),
            )
        self.assertIs(request.call_args.args[1]["think"], False)

    def test_japanese_target(self):
        translator = server.OllamaTranslator("http://127.0.0.1:11434")
        with mock.patch.object(
            translator, "_request", return_value={"response": '["翻訳"]'}
        ) as request:
            translator.translate_many(
                ["translation"],
                "en",
                "ja",
                "qwen2.5:3b",
                server.Glossary([], []),
            )
        self.assertIn("日语", request.call_args.args[1]["prompt"])


if __name__ == "__main__":
    unittest.main()

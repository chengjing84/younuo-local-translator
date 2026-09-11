import importlib.util
import json
import sys
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
TOKEN = 'unit-test-token-123456789'

def load_server_module():
    temp = tempfile.TemporaryDirectory()
    root = Path(temp.name)
    config = root / 'config.json'
    config.write_text(json.dumps({'token': TOKEN, 'port': 8765, 'ollama_url': 'http://127.0.0.1:11434'}), encoding='utf-8')
    source = (ROOT / 'host/server.py').read_text(encoding='utf-8-sig').replace('CONFIG_PATH = ROOT / "config.json"', f'CONFIG_PATH = Path({str(config)!r})')
    module_path = root / 'server_under_test.py'
    module_path.write_text(source, encoding='utf-8')
    spec = importlib.util.spec_from_file_location('server_under_test', module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    module._temporary_directory = temp
    return module

server = load_server_module()

class GlossaryTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(server.Glossary.from_payload(None), server.Glossary([], []))
    def test_round_trip_keeps_spaces_and_longest_terms(self):
        g = server.Glossary([{'source': 'workflow', 'target': '工作流'}], ['ComfyUI'])
        text, mapping = g.protect('ComfyUI workflow __YN_TERM_0__')
        self.assertEqual(g.restore(text, mapping), 'ComfyUI 工作流 __YN_TERM_0__')
    def test_reject_invalid_terms(self):
        for data in [{'fixed':[None]}, {'fixed':[{'source':'x','target':''}]}, {'protected':[7]}, {'fixed':'x'}]:
            with self.subTest(data=data), self.assertRaises(server.TranslationError):
                server.Glossary.from_payload(data)
    def test_missing_placeholder_rejected(self):
        with self.assertRaises(server.TranslationError):
            server.Glossary.restore('wrong output', {'__YN_TERM_0__':'Name'})

class TranslationTests(unittest.TestCase):
    def setUp(self):
        self.translator = server.OllamaTranslator('http://127.0.0.1:11434')
    def run_translation(self, response, **extra):
        with mock.patch.object(self.translator, '_request', return_value={'response':response, **extra}):
            return self.translator.translate_many(['Source'], 'auto', 'zh', 'qwen2.5:3b', server.Glossary([], []))
    def test_valid_output(self):
        self.assertEqual(self.run_translation('{"translations":["译文"]}'), ['译文'])
    def test_invalid_outputs(self):
        for value in ['broken','{}','[]','[null]','[42]','[""]','["one","two"]']:
            with self.subTest(value=value), self.assertRaises(server.TranslationError):
                self.run_translation(value)
    def test_truncation(self):
        with self.assertRaises(server.TranslationError):
            self.run_translation('["partial"]', done_reason='length')
    def test_cache_avoids_duplicate_inference(self):
        with mock.patch.object(self.translator,'_request',return_value={'response':'{"translations":["译文"]}'}) as request:
            for _ in range(2):
                self.translator.translate_many(['Source'],'auto','zh','qwen2.5:3b',server.Glossary([],[]))
            self.assertEqual(request.call_count,1)
    def test_qwen3_schema_and_no_thinking(self):
        with mock.patch.object(self.translator,'_request',return_value={'response':'{"translations":["翻訳"]}'}) as request:
            self.translator.translate_many(['Hello'],'en','ja','qwen3:1.7b',server.Glossary([],[]))
            payload=request.call_args.args[1]
            self.assertFalse(payload['think'])
            self.assertEqual(payload['format']['properties']['translations']['type'],'array')
            self.assertIn('日语',payload['prompt'])
            self.assertIn('["Hello"]',payload['prompt'])
    def test_polish_has_original_and_draft(self):
        with mock.patch.object(self.translator,'_request',return_value={'response':'{"translations":["译文"]}'}) as request:
            self.translator.translate_one('Original','en','zh','qwen2.5:3b',server.Glossary([],[]),'草稿',True)
            payload=json.loads(request.call_args.args[1]['prompt'].split('\n',1)[1])
            self.assertEqual(payload,{'originals':['Original'],'drafts':['草稿']})

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd=server.LocalServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.httpd.serve_forever,daemon=True)
        cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.httpd.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown();cls.httpd.server_close();cls.thread.join()
    def request(self, data=None, token=TOKEN, origin=None, path='/translate'):
        headers={'X-Page-Translator-Token':token}
        if origin: headers['Origin']=origin
        body=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
        req=urllib.request.Request(self.base+path,data=body,headers=headers)
        try: response=urllib.request.urlopen(req,timeout=5)
        except urllib.error.HTTPError as e: response=e
        with response: return response.status,json.loads(response.read()),response.headers
    def test_unauthorized(self):
        self.assertEqual(self.request(token='',path='/health')[0],401)
    def test_reject_web_origin_even_with_token(self):
        self.assertEqual(self.request(path='/health',origin='https://example.com')[0],403)
    def test_extension_origin_health(self):
        with mock.patch.object(server.OLLAMA,'models',return_value=['qwen2.5:3b']):
            status,data,headers=self.request(path='/health',origin='chrome-extension://'+'a'*32)
        self.assertEqual(status,200);self.assertEqual(data['version'],'0.8.0')
        self.assertEqual(headers['Access-Control-Allow-Origin'],'chrome-extension://'+'a'*32)
    def test_invalid_json_and_types(self):
        for data in [b'{',[],{'texts':'abc'},{'texts':[None]},{'texts':['x'],'model':[]},{'texts':['x'],'target':'auto'},{'texts':['x'],'glossary':{'fixed':[None]}}]:
            with self.subTest(data=data): self.assertEqual(self.request(data)[0],422)
    def test_limits(self):
        for texts in [[],['x']*5,['x'*3001],['x'*3000]*3]:
            with self.subTest(texts=str(texts)[:40]): self.assertEqual(self.request({'texts':texts})[0],422)
    def test_polish_requires_draft(self):
        self.assertEqual(self.request({'texts':['x'],'mode':'polish'})[0],422)
    def test_normal_translate(self):
        with mock.patch.object(server.OLLAMA,'translate_many',return_value=['译文']):
            status,data,_=self.request({'texts':['Hello']})
        self.assertEqual((status,data),(200,{'translations':['译文']}))
    def test_busy_is_retryable_429(self):
        with mock.patch.object(server.OLLAMA,'translate_many',side_effect=server.BusyError('busy')):
            self.assertEqual(self.request({'texts':['Hello']})[0],429)
    def test_health_reports_missing_model_without_claiming_ready(self):
        with mock.patch.object(server.OLLAMA,'models',return_value=[]):
            self.assertEqual(self.request(path='/health')[1]['ollamaModels'],[])

if __name__=='__main__': unittest.main()

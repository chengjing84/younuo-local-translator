"""Verify the generated archive without executing or extracting its contents."""
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'extension/manifest.json').read_text(encoding='utf-8-sig'))['version']
with ZipFile(root / 'dist' / f'younuo-local-translator-v{version}.zip') as archive:
    names = {name.replace('\\', '/') for name in archive.namelist()}
    prefix = 'younuo-local-translator/'
    required = ['install.cmd', 'start-host.cmd', 'diagnose.cmd', 'tools/diagnose.ps1', 'tools/start-host.ps1', 'tools/install.ps1', 'README.md', 'README_EN.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md',
                'package.json', 'package-lock.json', 'build-package.cmd', 'docs/MODELS.md', 'docs/USAGE.md', 'docs/VALIDATION.md',
                'extension/manifest.json', 'host/server.py', 'tests/test_host.py', 'tests/browser.test.cjs']
    for name in required:
        assert prefix + name in names, f'Missing {name}'
        info = archive.getinfo(prefix + name)
        assert info.file_size > 20, f'Unexpectedly empty {name}'
    for name in ['tools/start-host.ps1', 'tools/install.ps1', 'host/install.ps1']:
        source = archive.read(prefix + name)
        assert len(source) > 500, f'Critical script is truncated: {name}'
        source.decode('utf-8-sig')
    for name in names:
        assert not any(part in name for part in ['host/config.json', '.venv/', '__pycache__/', 'node_modules/', '.git/', '.log', '.pyc']), name
    manifest = json.loads(archive.read(prefix + 'extension/manifest.json').decode('utf-8-sig'))
    for script in manifest['content_scripts']:
        for file in script['js'] + script['css']:
            assert prefix + 'extension/' + file in names, file
    for file in manifest['icons'].values():
        assert prefix + 'extension/' + file in names, file
    print(f'Package {version}: {len(names)} entries verified; required files present, runtime secrets excluded.')

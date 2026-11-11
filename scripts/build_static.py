#!/usr/bin/env python3
"""Build a clean static release from an explicit file manifest."""
from pathlib import Path
import json,shutil
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'dist'
manifest=json.loads((ROOT/'publish_manifest.json').read_text())
if DEST.is_symlink():raise SystemExit('dist must not be a symlink')
for name in manifest['files']:
 p=ROOT/name
 if not p.is_file() or not p.resolve().is_relative_to(ROOT.resolve()):
  raise SystemExit('Missing or out-of-scope release file: '+name)
if DEST.exists():shutil.rmtree(DEST)
DEST.mkdir()
for name in manifest['files']:
 target=DEST/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/name,target)
print(f'Built {len(manifest["files"])} explicit public files: {DEST}')

#!/usr/bin/env python3
"""Build a reproducible, dependency-free source archive. Run from any directory."""
import argparse
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=Path, default=root / 'dist' / 'This-Alien-Does-Not-Exist.zip')
args = parser.parse_args()
files = ['alien-api.js', 'api.html', 'index.html', '404.html', 'styles.css', 'README.md', 'LICENSE', 'CNAME',
         '.nojekyll', '.gitattributes', '.gitignore', 'package.json', 'package-lock.json']
for folder in ['src', 'legacy', 'scripts', 'tests', 'docs']:
    files.extend(str(p.relative_to(root)) for p in (root / folder).rglob('*')
                 if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc')
args.out.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.out, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(files):
        info = ZipInfo('This-Alien-Does-Not-Exist/' + name.replace('\\', '/'), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (root / name).read_bytes())
with ZipFile(args.out) as archive:
    bad = archive.testzip()
    if bad:
        raise RuntimeError('Archive integrity check failed: ' + bad)
print(args.out.resolve())
print(f'{len(files)} files, {args.out.stat().st_size:,} bytes')
print('SHA256 ' + hashlib.sha256(args.out.read_bytes()).hexdigest())

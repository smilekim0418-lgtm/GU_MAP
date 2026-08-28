import os
import sys
for root, dirs, files in os.walk('GUMAP-프론트'):
    for f in files:
        if f.endswith('.js'):
            path = os.path.join(root, f)
            try:
                text = open(path, encoding='utf-8').read()
                lines = text.split('\n')
                for i, line in enumerate(lines):
                    if '⚠' in line or 'warnings.forEach' in line or 'warnings.length' in line:
                        sys.stdout.buffer.write(f'{path} : {i}: {line.strip()}\n'.encode('utf-8'))
            except: pass

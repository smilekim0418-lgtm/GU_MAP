text = open(r'GUMAP-프론트\css\base.css', encoding='utf-8').read()
import sys
sys.stdout.buffer.write(text.encode('utf-8'))

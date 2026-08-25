import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

target = "const missing = (state.data.report && state.data.report.missing) || [];"
replacement = "const missing = (state.data.report && state.data.report.missing) || [];\n  missing.sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true}));"

text = text.replace(target, replacement)
codecs.open(fpath, 'w', encoding='utf-8').write(text)
print('Patched missing sort!')

import codecs

fpath = r'GUMAP-개발\floorplan\floorplan-editor.html'
text = codecs.open(fpath, encoding='utf-8').read()

css_addition = """
  .leaflet-tooltip.lbl {
    background: rgba(30, 41, 59, 0.9) !important;
    color: #e2e8f0 !important;
    border: 1px solid rgba(129, 140, 248, 0.5) !important;
    box-shadow: 0 2px 4px rgba(0,0,0,0.5) !important;
    font-weight: bold;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .leaflet-tooltip.lbl::before {
    display: none; /* Hide the little triangle pointer if any */
  }
"""

if '.leaflet-tooltip.lbl' not in text:
    text = text.replace('</style>', css_addition + '</style>')
    codecs.open(fpath, 'w', encoding='utf-8').write(text)
    print("Added CSS for tooltip!")
else:
    print("CSS already exists!")

import json

floors = ['2F', '3F', '4F', '5F']
for floor in floors:
    fpath = fr'GUMAP-개발\floorplan\work\{floor}_labeled.json'
    try:
        with open(fpath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        corridors = [p for p in data['polygons'] if p.get('type') == 'corridor']
        print(f'{floor}: {len(corridors)} corridors')
    except Exception as e:
        print(f'{floor} error: {e}')

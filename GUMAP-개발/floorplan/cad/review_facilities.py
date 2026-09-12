"""Render existing facility seeds against the new CAD geometry for review."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from shapely.geometry import Polygon

BASE=Path(__file__).resolve().parent
data=json.loads((BASE/'output/map.json').read_text(encoding='utf-8'))
for fl,f in data['floors'].items():
    fig,ax=plt.subplots(figsize=(11,11))
    ax.add_collection(LineCollection([p['points'] for p in f['paths']],colors='#64748b',linewidths=.35))
    for r in f['legacy']:
        if r['type'] not in ('stairs','elevator'):continue
        c=Polygon(r['rings'][0]).centroid
        color='#d97706' if r['type']=='stairs' else '#7c3aed'
        ax.scatter([c.x],[c.y],s=45,c=color)
        ax.annotate(r['id'].replace('계단','Stair'),(c.x,c.y),xytext=(5,5),textcoords='offset points',fontsize=9,color=color)
    ax.autoscale();ax.set_aspect('equal');ax.grid(alpha=.2);ax.set_title(fl)
    fig.savefig(BASE/f'output/facility-review-{fl}.png',dpi=125,bbox_inches='tight');plt.close(fig)

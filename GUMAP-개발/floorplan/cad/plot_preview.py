import json
from pathlib import Path
from collections import Counter
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection

BASE=Path(__file__).resolve().parent

def main():
    v=json.loads((BASE/'source/vectors.json').read_text(encoding='utf-8'))
    title=next(t for t in v['texts'] if t['text']=='2층 평면도')
    ox,oy=title['p']
    paths=[p for p in v['paths'] if all(ox-80000<q[0]<ox+80000 and oy-5000<q[1]<oy+125000 for q in p['points'])]
    print('layers',Counter((p['layer'],p['color']) for p in paths))
    fig,ax=plt.subplots(figsize=(14,12))
    colors=['#111827','#2563eb','#dc2626','#059669','#a855f7','#d97706']
    layers=list(Counter(p['layer'] for p in paths))
    for i,l in enumerate(layers):
        lines=[[( (x-ox)/1000,(y-oy)/1000) for x,y in p['points']] for p in paths if p['layer']==l]
        ax.add_collection(LineCollection(lines,colors=colors[i%len(colors)],linewidths=.35,label=l))
    for t in v['texts']:
        x,y=t['p']
        if ox-80000<x<ox+80000 and oy<y<oy+125000 and t['text'].replace('-','').isdigit():
            ax.text((x-ox)/1000,(y-oy)/1000,t['text'],fontsize=5)
    ax.autoscale();ax.set_aspect('equal');ax.legend();ax.grid(alpha=.15)
    fig.savefig(BASE/'preview_2F.png',dpi=170,bbox_inches='tight')

if __name__=='__main__': main()

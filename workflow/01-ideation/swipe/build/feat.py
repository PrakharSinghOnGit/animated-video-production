# measured features for a set: OCR text, faces, colour. usage: feat.py <dir> <list.json> <imgdir> <vis.jsonl> <out.json>
import json, sys, colorsys
from PIL import Image
D,L,I,V,O=sys.argv[1:]
vis={json.loads(l)['f'][:-4]:json.loads(l) for l in open(f'{D}/{V}')}
out=[]
for v in json.load(open(f'{D}/{L}')):
    im=Image.open(f"{D}/{I}/{v['id']}.jpg").convert('RGB'); w,h=im.size
    if abs(w/h-4/3)<0.05: im=im.crop((0,h//8,w,h-h//8))
    px=list(im.resize((64,36)).get_flattened_data())
    lum=[0.299*p[0]+0.587*p[1]+0.114*p[2] for p in px]
    hs=[colorsys.rgb_to_hsv(*(c/255 for c in p)) for p in px]
    m=sum(lum)/len(lum)
    red=sum(1 for x in hs if x[1]>.5 and x[2]>.35 and (x[0]<.04 or x[0]>.95))/len(px)
    yel=sum(1 for x in hs if x[1]>.5 and x[2]>.5 and .1<x[0]<.18)/len(px)
    grn=sum(1 for x in hs if x[1]>.4 and x[2]>.35 and .22<x[0]<.45)/len(px)
    x=vis[v['id']]; ws=x['words']
    words=sum(len(w['t'].split()) for w in ws)
    out.append(dict(id=v['id'],handle=v['handle'],multiple=v['multiple'],views=v['views'],title=v['title'],
      words=words,maxTextH=round(max([w['h'] for w in ws],default=0),3),faces=len(x['faces']),bigFace=round(max(x['faces'],default=0),3),
      faceSide=('L' if x['faceX'][0]<.4 else 'R' if x['faceX'][0]>.6 else 'C') if x['faces'] else '',
      bright=round(m),contrast=round((sum((l-m)**2 for l in lum)/len(lum))**.5),sat=round(sum(x[1] for x in hs)/len(hs),2),
      red=round(red,3),yellow=round(yel,3),green=round(grn,3),dark=round(sum(l<50 for l in lum)/len(lum),2),light=round(sum(l>205 for l in lum)/len(lum),2),
      hasDigit=any(c.isdigit() for w in ws for c in w['t']),hasDollar=any('$' in w['t'] for w in ws),ocr=' | '.join(w['t'] for w in ws)))
json.dump(out,open(f'{D}/{O}','w')); print(len(out))

import json, sys, os, colorsys, math
from PIL import Image, ImageDraw, ImageFont
D=sys.argv[1]; sw=json.load(open(f'{D}/swipe.json'))
out=[]
for i,v in enumerate(sw):
    im=Image.open(f"{D}/img/{v['id']}.jpg").convert('RGB')
    # crop letterbox from sddefault/hq (4:3 with bars)
    w,h=im.size
    if abs(w/h-4/3)<0.05: im=im.crop((0,h//8,w,h-h//8))
    sm=im.resize((64,36)); px=list(sm.getdata())
    hs=[colorsys.rgb_to_hsv(*(c/255 for c in p)) for p in px]
    rg=[p[0]-p[1] for p in px]; yb=[(p[0]+p[1])/2-p[2] for p in px]
    sd=lambda a:(sum((x-sum(a)/len(a))**2 for x in a)/len(a))**.5; mn=lambda a:sum(a)/len(a)
    colorful=(sd(rg)**2+sd(yb)**2)**.5+.3*(mn(rg)**2+mn(yb)**2)**.5
    q=sm.quantize(5,method=Image.Quantize.MEDIANCUT); pal=q.getpalette()[:15]; cnt=sorted(q.getcolors(),reverse=True)
    dom=[('#%02x%02x%02x'%tuple(pal[k*3:k*3+3]),round(n/len(px),2)) for n,k in cnt]
    lum=[0.299*p[0]+0.587*p[1]+0.114*p[2] for p in px]
    # left/right weight: contrast of halves
    out.append(dict(id=v['id'],bright=round(mn(lum)),sat=round(mn([x[1] for x in hs]),2),colorful=round(colorful),dark=round(sum(l<50 for l in lum)/len(lum),2),light=round(sum(l>205 for l in lum)/len(lum),2),lumSd=round(sd(lum)),dom=dom))
    v['_im']=im
json.dump(out,open(f'{D}/color.json','w'))
# numbered contact sheets, 6x5, ordered by multiple
os.makedirs(f'{D}/sheets',exist_ok=True); TW,TH=320,180
try: font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',22)
except: font=ImageFont.load_default()
for s in range(0,len(sw),30):
    sh=Image.new('RGB',(6*TW+5*6,5*TH+4*6),'white'); d=ImageDraw.Draw(sh)
    for j,v in enumerate(sw[s:s+30]):
        x,y=(j%6)*(TW+6),(j//6)*(TH+6); sh.paste(v['_im'].resize((TW,TH)),(x,y))
        d.rectangle((x,y,x+50,y+26),fill='black'); d.text((x+4,y+2),str(s+j),font=font,fill='yellow')
    sh.save(f'{D}/sheets/sheet_{s//30:02d}.jpg',quality=82)
print(len(out))

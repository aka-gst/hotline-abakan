from pathlib import Path
import re,collections,math
root=Path(__file__).resolve().parents[1]
src=(root/'Game/src/game.js').read_text(); core=(root/'Game/src/core.js').read_text(); boxes=[]
# structural walls
for m in re.finditer(r'wallBox\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)',src):
    x,_,z,sx,_,sz=map(float,m.groups()); boxes.append((x-sx/2,x+sx/2,z-sz/2,z+sz/2))
# canonical prop specs
specs={}
for m in re.finditer(r"'([^']+\.obj)':\{h:([\d.]+),w:([\d.]+),d:([\d.]+)\}",src):
    specs[m.group(1)]=(float(m.group(3)),float(m.group(4)))
# real props: use canonical footprint when available, otherwise explicit old footprint
prop_pat=r"loadProp\('([^']+)'\s*,\{x:\s*(-?[\d.]+),y:[^,]+,z:\s*(-?[\d.]+)\}\s*,\s*[^,]+\s*,\s*([^,]+)\s*,\s*[^,)]+(?:,\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\])?\)"
for m in re.finditer(prop_pat,src):
    path,x,z,rot,fw,fd=m.groups(); x=float(x);z=float(z)
    name=path.split('/')[-1]
    try: rv=float(eval(rot.strip().replace('Math.PI',str(math.pi)),{'__builtins__':{}},{}))
    except: rv=0.0
    if name in specs:
        w,d=specs[name]; c=abs(math.cos(rv)); sn=abs(math.sin(rv)); sx=w*c+d*sn; sz=w*sn+d*c
    elif fw and fd: sx,sz=float(fw),float(fd)
    else: continue
    boxes.append((x-sx/2,x+sx/2,z-sz/2,z+sz/2))
# authored solid setpieces
for m in re.finditer(r'solidSetpiece\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)',src):
    x,z,sx,sz=map(float,m.groups()); boxes.append((x-sx/2,x+sx/2,z-sz/2,z+sz/2))
# split walls, gates treated open
for m in re.finditer(r"\{z:(-?[\d.]+),x:(-?[\d.]+),half:([\d.]+),label:'[^']+'\}",core):
    z,x,h=map(float,m.groups()); left=x-h; right=x+h
    if left>-4.44:
        w=left+4.44; cx=-4.44+w/2; boxes.append((cx-w/2,cx+w/2,z-.11,z+.11))
    if right<4.44:
        w=4.44-right; cx=right+w/2; boxes.append((cx-w/2,cx+w/2,z-.11,z+.11))
r=.43; boxes=[(a-r,b+r,c-r,d+r) for a,b,c,d in boxes]
def blocked(x,z): return x<-4.5 or x>4.5 or z<-38.17 or z>10.37 or any(a<=x<=b and c<=z<=d for a,b,c,d in boxes)
step=.12
def flood(start):
    start=(round(start[0]/step),round(start[1]/step)); q=collections.deque([start]); seen={start}
    while q:
        ix,iz=q.popleft()
        for dx,dz in ((1,0),(-1,0),(0,1),(0,-1)):
            n=(ix+dx,iz+dz)
            if n in seen or blocked(n[0]*step,n[1]*step): continue
            seen.add(n); q.append(n)
    return seen
seen=flood((0,8.85))
def reachable(x,z,tol=.72): return any(math.hypot(ix*step-x,iz*step-z)<=tol for ix,iz in seen)
assert reachable(0,-32.0,1.15),'final living room unreachable after scale calibration'
assert reachable(0,8.85,.4),'stair extraction unreachable on return'
def interactable(cx,cz,reach):
    for rr in [0,.25,.5,.75,1.0,1.2]:
        if rr>reach: continue
        for i in range(32):
            a=i*math.tau/32; x,z=cx+math.cos(a)*rr,cz+math.sin(a)*rr
            if not blocked(x,z): return True
    return False
assert interactable(-3.25,-24.05,1.18),'cassette blocked'
assert interactable(-1.15,-31.05,1.28),'pipe blocked'
for m in re.finditer(r"\{id:'([^']+)'[^\n]*?x:(-?[\d.]+),z:(-?[\d.]+)",core):
    name,x,z=m.group(1),float(m.group(2)),float(m.group(3)); assert not blocked(x,z),f'enemy {name} spawns inside calibrated geometry'
print('route-scale-and-spawns-12: OK')

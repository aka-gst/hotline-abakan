from pathlib import Path
import re, math
root=Path(__file__).resolve().parents[1]
s=(root/'Game/src/game.js').read_text()
# mirrored from runtime scale bible so a scale regression is caught explicitly
spec={
 'Chair.obj':(.48,.56),'Table.obj':(1.30,2.48),'Bookcase.obj':(1.00,.38),'Door1.obj':(1.07,.16),
 'Kitchen_Fridge.obj':(.72,.72),'Kitchen_Oven.obj':(.57,.63),'Kitchen_Sink.obj':(.48,.53),
 'Bathroom_WashingMachine.obj':(.78,.80),'Sofa.obj':(2.42,1.02),'Trashcan_Large.obj':(.55,.55)
}
# inner face of side walls is ~4.44m
LIMIT=4.44
pat=re.compile(r"loadProp\('assets/props/([^']+)'\s*,\s*\{x:([-.\d]+),y:0,z:([-.\d]+)\}\s*,\s*[-.\d]+\s*,\s*([^,]+)")
issues=[]
for name,x,z,rot_expr in pat.findall(s):
    if name not in spec: continue
    x=float(x); z=float(z)
    rot_expr=rot_expr.strip().replace('Math.PI',str(math.pi))
    try: rot=eval(rot_expr,{'__builtins__':{}},{})
    except Exception: rot=0
    w,d=spec[name]; c=abs(math.cos(rot)); sn=abs(math.sin(rot)); fx=w*c+d*sn
    if abs(x)+fx/2>LIMIT+.02:
        issues.append(f'{name} at x={x:.2f} exceeds room: edge={abs(x)+fx/2:.2f} > {LIMIT:.2f}')
# authored procedural setpieces known to be wall-side: hard guard against old out-of-wall coordinates
for bad in ['solidSetpiece(4.52','decoBox(4.58','makeTVCorner(-4.78','{x:4.36,y:0,z:-22.35}']:
    if bad in s: issues.append('stale out-of-wall placement: '+bad)
if issues:
    raise SystemExit('art-sanity failed:\n- '+'\n- '.join(issues))
print('art-sanity-12: OK')

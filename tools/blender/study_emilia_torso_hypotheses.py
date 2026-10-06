"""Independent 2D section drawings and original-artwork evidence review only.

No Blender, model, GLB, prior reconstruction drawing or test surface is read.
Paper sections use independent hand-entered cubic controls, never an ellipse
primitive. Light tone is a synthetic illustration aid, not observed anatomy.
"""
from __future__ import annotations

import base64
import copy
import csv
import hashlib
import io
import json
import math
import textwrap
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import CubicSpline, PchipInterpolator

from analyze_emilia_references import Sheet, INK, MUTED

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/model-reviews/emilia-arc6-multi-hypothesis-study'
Y_LEVELS=[140,185,235,300,380]
SECTION_NAMES=['A','B','C','D','E']
SECTION_ROLES=['UPPER ONSET','RISING FULLNESS','FULLER REGION','LOWER RETURN','RIBCAGE JOIN']
CONTEXT_Y=[105,110,140,185,235,300,380,430]

# Width/depth coordinates are illustration units, NOT official body measures.
# Each row is an independent section description: lateral width, front extent,
# outer-anterior x/depth, medial-anterior x/depth and medial bridge depth.
# Shared posterior context is schematic and supplies no neutral-depth evidence.
CANDIDATES=[
 dict(id='A',name='Higher compact fullness',color='#187C86',
      levels=[(100,40,.87,.37,.43,.84,1.00),
              (116,68,.80,.49,.35,.93,1.00),
              (113,64,.76,.53,.33,.94,1.00),
              (97,46,.82,.42,.39,.89,1.00),
              (84,30,.82,.44,.42,.89,1.00)],
      description=[
          'Anterior turning is concentrated nearer the medial region, with receding outer flanks.',
          'Earlier onset; compact maximum above section C; a long taper starts before section D.',
          'The 3/4 turn is more anterior than lateral. Lower sections change toward a ribcage-shaped perimeter.'],
      variables='Earlier fullness / steeper medial-to-outer curvature / long upper-to-lower taper'),
 dict(id='B',name='Broader anterior sweep',color='#476DB3',
      levels=[(100,29,.84,.47,.43,.91,1.00),
              (112,46,.87,.68,.48,.97,1.00),
              (124,71,.86,.77,.47,.98,1.00),
              (111,63,.79,.59,.44,.95,1.00),
              (84,30,.82,.44,.42,.89,1.00)],
      description=[
          'Fullness spreads into the outer anterior sectors; the medial arc remains curved.',
          'Onset develops later than A. The broadest forward region spans the neighborhood of C-D.',
          'A long lateral turning zone changes the 3/4 wrap. Return is delayed, then dissolves into the ribcage.'],
      variables='Broader anterior distribution / wide turning zone / longer fullest span'),
 dict(id='C',name='Later, distributed anterior fullness',color='#A16B34',
      levels=[(100,25,.86,.31,.48,.76,1.00),
              (106,35,.80,.37,.46,.81,1.00),
              (112,58,.73,.55,.38,1.00,.96),
              (103,71,.77,.54,.40,.98,.99),
              (84,30,.82,.44,.42,.89,1.00)],
      extra=[(285,(109,72,.72,.56,.39,1.00,.97))],
      description=[
          'Anterior fullness is distributed across two gently connected sectors and a broad medial bridge.',
          'The side onset is later; a lower bounded maximum is followed by a long smooth return.',
          'The upper sidewall retains more ribcage character. The bridge is shallow, not a groove or separate object.'],
      variables='Later onset / lower anterior breadth / gentle medial bridge / retained sidewall'),
]

STATUS={'D':'DIRECTLY SUPPORTED','O':'CONSISTENT BUT UNOBSERVED',
        'W':'WEAKLY CONSTRAINED','X':'CONTRADICTED'}
STATUS_COLOR={'D':'#16815C','O':'#6C7687','W':'#3270B0','X':'#B74646'}
FRAME_ORDER=['S4-FRONT','S4-NEAR-FRONT','S4-OPENING','S4-RUNNING',
             'S4-SEATED','S4-STANDING-OBLIQUE','S4-TILTED','S4-LEANING']
FRAME_FACTS={
 'S4-FRONT':'Purple is exposed in the center aperture and below the white hems; short lower side outlines are visible. White panels conceal the upper anterior profile.',
 'S4-NEAR-FRONT':'The center purple field and part of the lower right outline are exposed. Hair, sleeves, uneven hems and an oblique camera obscure the upper contour.',
 'S4-OPENING':'A continuous purple field, painted curves, white inner edges and foreground rods are visible. No free complete outer torso silhouette or posterior limit is shown.',
 'S4-RUNNING':'Purple painted curves and part of the lower side outline are visible beneath lifted scallops. Lean, cloth motion and foreshortening prevent a neutral side measurement.',
 'S4-SEATED':'A narrow purple strip and lower purple surface are exposed. Seated/braced posture, white panels and sleeve overlap conceal upper anterior and posterior limits.',
 'S4-STANDING-OBLIQUE':'The lower purple sides and a separate armhole band are exposed. Forward arms and sleeves conceal the center aperture and fullest anterior region.',
 'S4-TILTED':'Hands and white cloth conceal the upper/inner torso. The lower purple field is visible, but tilted camera and arm occlusion limit shape reconstruction.',
 'S4-LEANING':'A short purple front/side connection and lower body surface are visible. Forward lean, cape, sleeves and hands obscure a neutral upper profile.',
}

PROPOSED_PROPERTY={
 'A':{'front_width':'Higher, relatively compact outer envelope',
      'medial_distribution':'Stronger medial-to-outer curvature with receding front flanks',
      'upper_onset':'Earlier continuously curving onset',
      'maximum_depth':'Compact forward maximum in the upper middle',
      'fullest_region':'Higher, shorter fullest span',
      'oblique_wrap':'Turning weighted toward the anterior arc',
      'lower_return':'Long taper beginning above section D',
      'whole_sections':'Rounded anterior taper with a shared posterior ribcage context'},
 'B':{'front_width':'Wider middle envelope',
      'medial_distribution':'Broad curved anterior sweep extending toward the outer sectors',
      'upper_onset':'Later onset than A',
      'maximum_depth':'Broader forward maximum around the middle',
      'fullest_region':'Longer broad fullest span around C-D',
      'oblique_wrap':'Extended lateral turning zone',
      'lower_return':'Delayed return with a longer middle span',
      'whole_sections':'Broad front-facing arcs and changing lateral walls'},
 'C':{'front_width':'Narrower upper envelope, later fullness',
      'medial_distribution':'Gentle anterior sectors joined by a shallow medial bridge',
      'upper_onset':'Latest gradual onset',
      'maximum_depth':'Later maximum between sections C-D',
      'fullest_region':'Lower bounded fullest span',
      'oblique_wrap':'Sidewall retained while anterior sectors turn forward',
      'lower_return':'Long smooth return after the later maximum',
      'whole_sections':'Continuous front sectors and a shallow bridge, not attached circles'},
}

CONSTRAINTS=[
 ('visible_purple','Exposed purple surface is connected',
  ['D']*8,
  'Direct support applies to the local visible purple field only. It does not establish hidden depth or connectivity behind every occluder.'),
 ('cloth_overlap','White cloth edges bound / overlap purple',
  ['D','D','D','D','D','D','D','D'],
  'The image separates cloth boundaries from purple surface. This constrains evidence ownership, not torso projection.'),
 ('lower_outline','Smooth exposed lower torso connection',
  ['D','W','O','W','W','W','W','W'],
  'Near-front artwork exposes a smooth lower purple outline. Other poses provide partial, camera-dependent constraints, not a neutral upper-return curve.'),
 ('front_width','Upper front width / outer transition',
  ['W','W','O','O','O','O','O','W'],
  'Exposed lower outlines and shoulder/arm context provide coarse bounds. The white-covered fullest width is not observed.'),
 ('medial_distribution','Outer-to-medial anterior distribution',
  ['W','W','W','W','O','O','O','W'],
  'Purple painted lines and tones provide weak curvature clues. Cloth shadows, stylization, pose and perspective prevent depth reconstruction.'),
 ('upper_onset','Neutral upper onset trajectory',
  ['O']*8,
  'The relevant upper torso is concealed; a neckline or white/purple border does not reveal the underlying onset.'),
 ('maximum_depth','Maximum neutral forward depth',
  ['O']*8,
  'No frame exposes the complete neutral anterior side profile. Posed cloth cannot determine forward depth.'),
 ('fullest_region','Height and breadth of maximum depth',
  ['O']*8,
  'Visible painted marks and changing hems are not maximum-depth landmarks. The neutral fullest span remains unobserved.'),
 ('oblique_wrap','Continuous turn toward the ribcage',
  ['O','W','O','W','W','W','O','W'],
  'Partial purple exposure in oblique poses weakly constrains a connection toward the lower ribcage. The hidden upper wrap remains free.'),
 ('lower_return','Hidden lower return length / curvature',
  ['W','W','O','W','W','W','O','W'],
  'Exposed lower surface supplies local clues. The complete return under cloth is not observed and no scallop sets its height.'),
 ('whole_sections','Complete horizontal section shape',
  ['O']*8,
  'No supplied original frame is a torso cross-section. Posterior extent, lateral turning and medial depth cannot be recovered as a whole perimeter.'),
 ('physical_contact','Physical cloth/body contact map',
  ['O']*8,
  'UNKNOWN RELATIONSHIP. White and purple meeting in 2D does not prove touching, close-follow, lift or an air gap.'),
]


def wrap(s,x,y,text,width=100,size=22,color=MUTED,spacing=30):
    lines=textwrap.wrap(text,width=width)
    s.lines(x,y,lines,size,color,spacing)
    return y+len(lines)*spacing


def cubic(p0,p1,p2,p3,count=32):
    t=np.linspace(0,1,count,endpoint=False)[:,None]
    return (1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3


def section_controls(row):
    w,f,outer_x,outer_d,medial_x,medial_d,bridge=row
    r=39.0
    a=np.array([(0,-r),(65,-34),(w,-3),
                (w*outer_x,f*outer_d),(w*medial_x,f*medial_d),(0,f*bridge),
                (-w*medial_x,f*medial_d),(-w*outer_x,f*outer_d),(-w,-3),(-65,-34)],float)
    # Hand-directed tangents keep the full perimeter joined and avoid isolated
    # circles, shelves and pointed joins. Candidate C has a smooth shallow
    # bridge, with no crease, detached lobe or deep medial recess.
    center_d=f*bridge-f*medial_d
    med_t=max(-.16*f,min(.16*f,2.3*center_d))
    tangents=np.array([(65,0),(48,15),(0,.48*f),(-.34*w,.35*f),
                       (-.39*w,med_t),(-.43*w,0),(-.39*w,-med_t),
                       (-.34*w,-.35*f),(0,-.48*f),(48,-15)],float)
    return [(a[i],a[i]+tangents[i]/3,a[(i+1)%10]-tangents[(i+1)%10]/3,a[(i+1)%10]) for i in range(10)]


def section(row):
    return np.concatenate([cubic(*p) for p in section_controls(row)])


def row_at(candidate,y):
    # These are 2D paper section control descriptions only. No 3D point,
    # topology, normal map, mesh object or model target is generated.
    c=candidate
    if y>=380:
        # Identical lower drawing context for A, B and C. The hypothesis ends
        # at E; no lower torso or abdomen contour is redesigned.
        t=min(1,max(0,(y-380)/50))
        return np.array([84-5*t,30-3*t,.82,.44,.42,.89,1.00])
    if 'interpolator' not in c:
        context=(100,25,.82,.44,.42,.89,1.00)
        pairs=[(105,context),(110,context),*zip(Y_LEVELS,c['levels'])]
        pairs.extend(c.get('extra',[]));pairs.sort(key=lambda a:a[0])
        values=np.array([row for _,row in pairs],float)
        c['interpolator']=PchipInterpolator([y for y,_ in pairs],values,axis=0)
        # Width and forward-extent paper profiles use continuous curvature,
        # rather than concentrating their turn at an interpolation landmark.
        c['profile']=CubicSpline([y for y,_ in pairs],values[:,:2],axis=0,
                                  bc_type=((1,np.array([0.,0.])),(1,np.array([-.1,-.06]))))
    row=c['interpolator'](float(y))
    row[:2]=c['profile'](float(y))
    return row


def paper_projection(points,view):
    angle={'FRONT':0,'TRUE SIDE':90,'3/4':40}[view]*math.pi/180
    # A rotation of TWO-dimensional section drawings, not a 3D camera/render.
    u=points[:,0]*math.cos(angle)-points[:,1]*math.sin(angle)
    facing=points[:,0]*math.sin(angle)+points[:,1]*math.cos(angle)
    return u,facing


def outline(candidate,view):
    ys=np.linspace(140,430,291)
    projected=[paper_projection(section(row_at(candidate,y)),view)[0] for y in ys]
    left=np.c_[[p.min() for p in projected],ys]
    right=np.c_[[p.max() for p in projected],ys]
    if view=='TRUE SIDE':
        l=[(-24,20),(-24,61),(-24,80),(-27,100),(-28,119)]
        r=[(39,118),(39,93),(30,71),(24,61),(24,20)]
    else:
        k=.82 if view=='3/4' else 1
        l=[(-25,20),(-25,61),(-31,74),(-57*k,85),(-96*k,96),
           (-137*k,103),(-152*k,123),(-168*k,155),(-155*k,168),
           (-138*k,146),(-123*k,126),(left[0,0]-7,126)]
        r=[(right[0,0]+7,126),(124,126),(139,146),(156,168),(169,155),
           (153,123),(138,103),(96,96),(57,85),(31,74),(25,61),(25,20)]
    def smooth(points,t0,t1):
        p=np.array(points,float);ts=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
        return CubicSpline(ts,p,bc_type=((1,t0),(1,t1)))(np.linspace(0,ts[-1],600))
    dl=left[1]-left[0];dl/=np.linalg.norm(dl)
    dr=right[0]-right[1];dr/=np.linalg.norm(dr)
    upper_l=smooth([*l,left[0]],[0,1],dl)
    upper_r=smooth([right[0],*r],dr,[0,-1])
    return np.r_[upper_l,left[1:],right[::-1],upper_r[1:]],left,right


def polygon(s,points,fill,stroke='#5A697A',width=3):
    p=[tuple(a) for a in points]
    s.draw.polygon(p,fill=fill)
    if stroke:s.draw.line([*p,p[0]],fill=stroke,width=width,joint='curve')
    text=' '.join(f'{a:.2f},{b:.2f}' for a,b in p)
    s.svg.append(f'<polygon points="{text}" fill="{fill}" stroke="{stroke or fill}" stroke-width="{width}" stroke-linejoin="round"/>')


def image_layer(s,im,x,y):
    s.image.paste(im,(round(x),round(y)),im.getchannel('A'))
    s.draw=ImageDraw.Draw(s.image)
    buf=io.BytesIO();im.save(buf,format='PNG')
    data=base64.b64encode(buf.getvalue()).decode()
    s.svg.append(f'<image x="{x:.2f}" y="{y:.2f}" width="{im.width}" height="{im.height}" href="data:image/png;base64,{data}"/>')


def tone_drawing(candidate,view,scale):
    # Synthetic paper tone uses section tangent direction only. No inferred
    # cloth, anatomical shadow, 3D lighting scene or reference shading is used.
    width=round(390*scale);height=round(292*scale)
    pixels=np.zeros((height,width,4),np.uint8)
    xs=(np.arange(width)-width/2)/scale
    for iy in range(height):
        yy=140+iy/scale
        points=section(row_at(candidate,yy))
        u,d=paper_projection(points,view)
        du=np.roll(u,-1)-u;dd=np.roll(d,-1)-d
        length=np.hypot(du,dd)
        vis=du<-.00001
        um=(u+np.roll(u,-1))/2
        nu=dd/np.maximum(length,.00001);nv=-du/np.maximum(length,.00001)
        light=np.clip(-.32*nu+.88*nv,0,1)
        order=np.argsort(um[vis]);xu=um[vis][order];shade=light[vis][order]
        mask=(xs>=u.min())&(xs<=u.max())
        tone=np.interp(xs[mask],xu,shade)
        grey=(203+32*tone).astype(np.uint8)
        pixels[iy,mask,:3]=np.c_[grey,grey+3,grey+6]
        fade=min(1,max(0,(yy-140)/42))
        fade=fade*fade*(3-2*fade)
        pixels[iy,mask,3]=round(255*fade)
    return Image.fromarray(pixels)


def figure(s,c,x,y,scale,view,levels=True):
    shape,left,right=outline(c,view)
    polygon(s,shape*scale+(x,y),'#E1E7EE',stroke=c['color'],width=3)
    tone=tone_drawing(c,view,scale)
    image_layer(s,tone,x-tone.width/2,y+140*scale)
    s.path([('M',*(shape[0]*scale+(x,y))),*[('L',*(p*scale+(x,y))) for p in shape[1:]]],c['color'],3)
    # Two synthetic anterior meridians explain wrap without drawing cups or
    # lower borders. They have NO evidentiary status.
    for knot in (4,6):
        line=[]
        for yy in np.linspace(146,379,100):
            anchors=[a[0] for a in section_controls(row_at(c,yy))]
            u=paper_projection(np.array([anchors[knot]]),view)[0][0]
            line.append((x+u*scale,y+yy*scale))
        s.path([('M',*line[0]),*[('L',*p) for p in line[1:]]],'#9EACBC',2,dashed=True)
    if levels:
        for label,yy in zip(SECTION_NAMES,Y_LEVELS):
            u=paper_projection(section(row_at(c,yy)),view)[0].min();py=y+yy*scale
            s.text(x-187*scale,py-11,label,22,c['color'],True)
            s.path([('M',x-163*scale,py),('L',x+(u-12)*scale,py)],'#9BA8B8',2,dashed=True)
    s.text(x-87*scale,y+449*scale,view,26,INK,True)


def section_strip(s,c,y,scale=1.2):
    for i,(label,role,row) in enumerate(zip(SECTION_NAMES,SECTION_ROLES,c['levels'])):
        x=55+410*i;s.rect(x,y,390,286)
        s.text(x+16,y+16,label+'  '+role,19,INK,True)
        polygon(s,section(row)*scale+(x+195,y+137),'#EEF2F6',stroke=c['color'],width=3)
        s.text(x+168,y+63,'BACK',15,MUTED)
        s.text(x+163,y+256,'FRONT',15,c['color'],True)


def frame_sources():
    prior=json.loads((ROOT/'docs/model-reviews/emilia-arc6-garment-body-interaction/interaction-analysis.json').read_text())
    # ONLY original reference paths/crops and observed E/F/V/H annotations are
    # reused. No prior hypothesis, reconstruction, contour or assessment is read.
    frames=copy.deepcopy(prior['frames'])
    for f in frames:
        f['marks']['U']=f['marks'].pop('K',[])
        f['lines'].pop('K',None)
    frames.extend([
       dict(id='S4-TILTED',path='docs/model-reviews/emilia-arc6-reference-analysis-v2/references/emilia_tilted_three_quarter.webp',
            box=(70,330,750,920),marks={'V':[(309,723)],'H':[(611,548)],'U':[(468,646)]},lines={}),
       dict(id='S4-LEANING',path='docs/model-reviews/emilia-arc6-reference-analysis-v2/references/emilia_leaning_three_quarter.jpeg',
            box=(75,210,286,455),marks={'V':[(237,354)],'H':[(198,301)],'U':[(233,322)]},lines={})])
    return frames


def source_atlas(frames):
    s=Sheet(2100,2420)
    s.text(45,25,'Emilia | original evidence + UNKNOWN RELATIONSHIP',38,INK,True)
    s.text(45,85,'No original frame is repainted. No synthetic body contour is placed into this evidence layer.',22,MUTED)
    s.text(45,133,'U UNKNOWN RELATIONSHIP: a white/purple meeting in 2D never proves contact or close-follow.',23,'#9A5877',True)
    s.text(45,176,'E overlap edge   V exposed purple   H hidden body   F apparent cloth flare (physical separation still unknown)',21,MUTED)
    colors={'U':'#9A5877','E':'#2464B9','V':'#17815B','H':'#AD497B','F':'#C77020'}
    for i,f in enumerate(frames):
        x=45+(i%3)*685;y=231+(i//3)*620
        s.rect(x,y,645,586);s.text(x+18,y+16,f'F{i+1}  '+f['id'],23,INK,True)
        p=ROOT/f['path'];off,sc=s.artwork(p.name,f['box'],x+18,y+63,609,407,source_dir=p.parent)
        for key in ('E','V','F'):
            for path in f['lines'].get(key,[]):s.path(path,colors[key],2.5,off,sc)
        for key,marks in f['marks'].items():
            for a,b in marks:s.marker(off[0]+sc*a,off[1]+sc*b,key,colors[key])
        if f['id']=='S4-OPENING':notes=['Purple paint marks are visible.','Neither depth nor contact is measured.']
        elif f['id']=='S4-STANDING-OBLIQUE':notes=['Sleeves/arms hide the anterior region.','Contact and center aperture are unknown.']
        else:notes=['White edges remain cloth evidence.','Covered body and contact stay unknown.']
        s.lines(x+18,y+493,notes,21,spacing=31)
    x=45+2*685;y=231+2*620;s.rect(x,y,645,586)
    s.text(x+18,y+16,'S1 | SECONDARY NEUTRAL STRUCTURE',22,INK,True)
    p=ROOT/'docs/model-reviews/emilia-arc6-reference-analysis-v3/references/emilia_s1_neutral_turnaround.jpeg'
    s.artwork(p.name,(80,50,390,266),x+18,y+63,609,337,source_dir=p.parent)
    s.lines(x+18,y+431,['Neutral posture / landmark ordering only.','No cup, bodice, costume or depth target.','No candidate receives hidden-shape support','from the S1 costume silhouette.'],21,spacing=33)
    s.text(45,2147,'Raw observations constrain visible fields and boundaries; they do not select a hidden upper-torso shape.',25,INK,True)
    s.lines(45,2200,['The original S4 interaction sheets remain intact. Their prior K contact inference is superseded by U in this study.',
                    'All eight useful S4 originals are assessed in the constraint matrix. Clean full-size source files are included in the package.',
                    'Synthetic drawings, smooth paper tone and section agreement NEVER supply anime evidence.'],22,spacing=41)
    s.finish(out=OUT,name='00-original-evidence-unknown-relationships')


def candidate_sheet(c,frames):
    s=Sheet(2100,2420)
    s.text(45,25,f'HYPOTHESIS {c["id"]} | '+c['name'],43,c['color'],True)
    s.text(45,89,'UNAPPROVED 2D DESIGN. Synthetic tone/flow are illustration aids, never source evidence.',23,INK,True)
    s.text(45,132,'Common neck / shoulder / lower context is fixed in the drawings. No model region or garment is changed.',21,MUTED)
    for x,v in ((350,'FRONT'),(1020,'TRUE SIDE'),(1670,'3/4')):figure(s,c,x,177,1.29,v)
    s.text(45,813,'One continuous torso perimeter. No attached circles, cup edges, under-chest hem or rigid pads.',22,MUTED)
    s.text(45,863,'SECTIONS A-E | distinct whole-perimeter cubic drawings, not an ellipse sequence',28,INK,True)
    s.text(45,907,'Same drawing scale. Front below / back above. ALL hidden section shapes and dimensions remain free hypotheses.',21,MUTED)
    section_strip(s,c,957)
    yy=1295
    for text in c['description']:yy=wrap(s,45,yy,text,width=151,size=23,spacing=32)+16
    s.text(45,1480,'Original S4 comparisons | evidence stays separate from this proposed surface',27,INK,True)
    selected=[frames[0],frames[4],frames[7]]
    for i,f in enumerate(selected):
        x=45+685*i;s.rect(x,1538,645,522)
        s.text(x+18,1554,f['id'],23,INK,True)
        p=ROOT/f['path'];s.artwork(p.name,f['box'],x+18,1604,609,329,source_dir=p.parent)
        s.lines(x+18,1954,['Original frame, unmodified crop.','Covered shape / physical contact unresolved.'],20,spacing=30)
    s.text(45,2104,'Support status: no candidate-specific neutral depth or complete section is directly supported.',25,c['color'],True)
    s.lines(45,2158,['Observed purple surfaces / cloth overlaps constrain evidence ownership. They do not validate the chosen curves.',
                    'All eight originals are tested, including opening, running, standing, seated, tilted and leaning views.',
                    'Internal paper-view consistency checks only drawing consistency. It is NOT evidence that Emilia has this shape.',
                    'No selection. No mesh edit. No garment edit. No GLB build. STOP FOR REVIEW.'],22,spacing=41)
    s.finish(out=OUT,name=f'0{ord(c["id"])-ord("A")+2}-hypothesis-{c["id"]}')


def overview():
    s=Sheet(2100,2440)
    s.text(45,25,'Emilia | THREE DISTINCT HYPOTHESES, NO SELECTED WINNER',38,INK,True)
    s.text(45,82,'A study of unobserved surface variables, not three scales of one oval. All drawings are synthetic.',22,MUTED)
    s.text(45,130,'FRONT',26,INK,True);s.text(805,130,'TRUE SIDE',26,INK,True);s.text(1400,130,'3/4 + SECTION C',26,INK,True)
    for i,c in enumerate(CANDIDATES):
        y=190+i*668;s.rect(45,y-15,2010,630)
        s.text(70,y,c['id']+' | '+c['name'],28,c['color'],True)
        for x,view in ((355,'FRONT'),(995,'TRUE SIDE'),(1530,'3/4')):figure(s,c,x,y+56,.94,view,levels=False)
        pts=section(c['levels'][2]);polygon(s,pts*.82+(1878,y+351),'#EEF2F6',stroke=c['color'],width=3)
        s.text(1830,y+263,'BACK',16,MUTED);s.text(1820,y+429,'FRONT',16,c['color'],True)
        wrap(s,75,y+546,c['variables'],width=135,size=22,color=c['color'],spacing=30)
    s.text(45,2230,'Distinctness is a design check, not evidence. The original frames do not choose among these hidden forms.',25,INK,True)
    s.lines(45,2282,['Candidate C explores a gentle connected medial bridge, not two attached objects or a deep central depression.',
                    'The full A-E sections and complete contour drawings appear on each candidate sheet. No geometry test is authorized.'],22,spacing=39)
    s.finish(out=OUT,name='01-three-hypotheses-overview')


def assessment(frames):
    records=[]
    for fi,f in enumerate(frames):
        for key,label,states,reason in CONSTRAINTS:
            for c in CANDIDATES:
                records.append({'candidate':c['id'],'frame':f['id'],'constraint':key,'property':label,
                                'classification':STATUS[states[fi]],'classification_code':states[fi],
                                'candidate_property':PROPOSED_PROPERTY[c['id']].get(key,'Shared visible-field / evidence-ownership condition'),
                                'source_path':f['path'],'original_observation':FRAME_FACTS[f['id']],
                                'reason':FRAME_FACTS[f['id']]+' LIMIT: '+reason,
                                'positive_hidden_geometry_support':False,
                                'unknown_contact_relationship':key=='physical_contact'})
    with (OUT/'candidate-constraint-assessments.csv').open('w',newline='') as file:
        w=csv.DictWriter(file,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
    return records


def assessment_sheet():
    s=Sheet(2100,2470)
    s.text(45,25,'Emilia | ORIGINAL-FRAME CONSTRAINT ASSESSMENT',40,INK,True)
    s.text(45,83,'NO CANDIDATE IS SUFFICIENTLY SUPPORTED TO SELECT. Covered pixels do not validate hidden shape.',23,'#9A5877',True)
    for i,(key,text) in enumerate(STATUS.items()):
        x=45+(i%2)*1035;y=138+(i//2)*45
        s.text(x,y,key+'  '+text,23,STATUS_COLOR[key],True)
    s.text(45,243,'O is not positive evidence. W is a weak clue, not an approved contour. D supports only the property stated.',21,MUTED)
    s.text(45,282,'Each cell lists hypothesis A / B / C. Identical labels expose underdetermination; no score or winner is computed.',21,MUTED)
    for i,name in enumerate(FRAME_ORDER):
        x=570+i*183;s.text(x,341,f'F{i+1}',23,INK,True)
    s.text(45,341,'Constraint / property',24,INK,True)
    for ri,(_,name,states,_) in enumerate(CONSTRAINTS):
        y=392+ri*69
        s.rect(40,y,2020,65,fill='white' if ri%2==0 else '#EAF0F6')
        wrap(s,55,y+15,name,width=38,size=21,color=INK,spacing=24)
        for fi,key in enumerate(states):s.text(570+fi*183,y+21,' / '.join([key]*3),22,STATUS_COLOR[key],True)
    y=1257
    for i,name in enumerate(FRAME_ORDER):
        x=45+(i%2)*1035;s.text(x,y+(i//2)*34,f'F{i+1} = '+name,20,MUTED)
    s.text(45,1440,'WHAT MULTIPLE S4 OBSERVATIONS REALLY CONSTRAIN',28,INK,True)
    s.rect(45,1495,965,470);s.rect(1050,1495,1005,470)
    s.text(65,1514,'Visible / partially constrained',25,'#16815C',True)
    yy=1564
    for text in ['Purple surfaces appear in the opening and below cloth.',
                 'Scalloped white boundaries cross purple and change with pose.',
                 'Some lower purple outlines are smooth and taper toward the waist.',
                 'Purple paint marks weakly suggest curvature; they do not measure it.',
                 'Side exposure limits some local connections, not complete upper depth.']:
        yy=wrap(s,65,yy,text,width=65,size=22,spacing=29)+16
    s.text(1070,1514,'Free / unresolved variables',25,'#9A5877',True)
    yy=1564
    for text in ['Upper onset under white panels.',
                 'Medial-versus-outer forward distribution and exact front width.',
                 'Maximum depth, its height and the span of the fullest region.',
                 'Hidden lower-return length, anterior-to-lateral wrap and whole sections.',
                 'Physical garment contact, lift and clearance; all remain UNKNOWN.']:
        yy=wrap(s,1070,yy,text,width=66,size=22,spacing=29)+16
    s.text(45,2010,'No direct hidden-geometry support. No candidate-specific contradiction is established from covered pixels.',24,INK,True)
    s.lines(45,2065,['The absence of contradiction is not support. X is reserved for conflict with an actual observed body constraint.',
                    'S1 contributes neutral posture and landmark ordering only. Costume cups, bodice outline and depth are excluded.',
                    'Candidate C bridge depth is explicitly free. A/B anterior turning and B widest span are equally unobserved.',
                    'All chosen dimensions, section handles, synthetic tones and flow lines are proposal choices, never anime measurements.'],22,spacing=42)
    s.text(45,2268,'DECISION: STOP FOR REVIEW. NO WINNER. NO MODELING TARGET FROZEN.',29,'#9A5877',True)
    s.text(45,2320,'Complete per-candidate / per-frame / per-constraint reasons are in the CSV, JSON and written study.',22,MUTED)
    s.text(45,2383,'No mesh edits. No garment mesh edits. No GLB builds. No Geometry Test 3.',23,INK,True)
    s.finish(out=OUT,name='05-assessment-and-free-variables')


def write_report(records,frames):
    text='''# Emilia multi-hypothesis 2D study

No candidate is sufficiently supported to select. The earlier single body
hypothesis is not carried forward as the default. A hidden surface being
uncontradicted by covered pixels does not supply positive evidence.

## Source and evidence rules

Eight original supplied S4 anime frames are the primary sources. S1 is secondary
neutral posture/landmark ordering only. No S1 costume, cup, fitted-bodice or depth
outline is transferred. No fan-estimated measurement is used. No prior model
render, failed test, reconstruction or generated garment supplies anatomy.

The original S4 evidence files and earlier annotation sheets remain intact.
This addendum assigns UNKNOWN RELATIONSHIP to physical contact at white/purple
meetings. The old contact inference is not retained as a body/cloth constraint.
An edge/flare visible in an image does not establish a physical cloth gap.

DIRECTLY SUPPORTED applies only to the property explicitly stated and where
visible. It is not support for a candidate's unobserved dimensions.
CONSISTENT BUT UNOBSERVED is not positive evidence. WEAKLY CONSTRAINED denotes
partial or ambiguous evidence. CONTRADICTED requires conflict with an observed
body constraint, not disagreement with another synthetic drawing.

## Independent hypotheses

'''
    for c in CANDIDATES:
        text+='### Hypothesis '+c['id']+': '+c['name']+'\n\n'
        for d in c['description']:text+='- '+d+'\n'
        text+='\nAll front/depth/section dimensions are illustrative free variables.\n\n'
    text+='''The candidates are independent per-level cubic perimeter drawings. They differ
in normalized anterior contour shape, onset, peak region, turning distribution
and lower return, not only size. Each section is one closed torso perimeter.
Their common posterior, neck, shoulder and lower context is schematic and
does not authorize any change to the character. There are no attached spheres,
ellipse primitives, cloth cup edges or lower-hem anatomical boundaries.

Synthetic tone and meridian strokes explain each proposed volume. They have
no evidentiary status. Paper-view agreement tests illustration consistency
only. It cannot validate the drawing against the original anime.

Hypothesis C explores gently distributed anterior sectors joined by a shallow
medial bridge. Its bridge depth is free, not directly supported, and is not a
claim that an anatomical groove exists. A deep recess, detached lobes or crease
is excluded. A and B avoid the bridge alternative through different front arcs.

## Every candidate against every useful original S4 frame

No candidate-specific hidden-shape preference is fabricated. The classified
evidence is shared because the relevant differences are concealed. Each table
is a qualitative test of the proposed property, not a calibrated photo fit.
The CSV and JSON include a separate row for every candidate/frame/constraint.

'''
    for f in frames:
        text+='### '+f['id']+'\n\nOriginal source: `'+f['path']+'`.\n\n'+FRAME_FACTS[f['id']]+'\n\n'
        text+='| Constraint | A | B | C | Reason and limit |\n| --- | --- | --- | --- | --- |\n'
        for key,label,_,reason in CONSTRAINTS:
            rr=[r for r in records if r['frame']==f['id'] and r['constraint']==key]
            text+='| '+label+' | '+' | '.join(r['classification'] for r in rr)+' | '+reason+' |\n'
        text+='\n'
    text+='''## What is constrained across independent S4 observations

- Local exposed purple surfaces and cloth/purple boundary ownership are observed.
- White scallops overlap purple at changing heights; they are cloth edges.
- Some exposed lower purple outlines are smooth and taper toward the waist.
- Painted purple lines and partial side exposure weakly constrain local curvature
  and the connection toward the lower ribcage. They do not calibrate neutral depth.

## Free variables

Upper onset; maximum forward depth; height and breadth of the maximum; the
outer-to-medial anterior distribution; hidden upper width; full anterior-to-side
wrap; lower-return length under cloth; complete horizontal sections and posterior
extent; physical cloth contact and clearance. None of the specific values or
perimeter handles chosen for A, B or C is directly supported by the supplied art.

All candidates are exploratory alternatives, not approved modeling targets.
No candidate-specific contradiction is claimed where the body is hidden.
This does not make all three equally accurate; their accuracy remains unknown.
No score, winner, averaged shape or default continuation is selected.

No mesh edit, garment mesh edit, GLB build or new geometry test occurred.
Stop for user review.
'''
    (OUT/'README.md').write_text(text)


def verify():
    lock=json.loads((OUT/'preservation-lock.json').read_text())
    for path,sha in lock['sha256'].items():assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path
    return len(lock['sha256'])


def main():
    OUT.mkdir(exist_ok=True);count=verify();frames=frame_sources()
    sources={f['path']:hashlib.sha256((ROOT/f['path']).read_bytes()).hexdigest() for f in frames}
    print('Drawing original evidence atlas',flush=True);source_atlas(frames)
    print('Drawing three-hypothesis overview',flush=True);overview()
    for c in CANDIDATES:
        print('Drawing candidate '+c['id'],flush=True);candidate_sheet(c,frames)
    records=assessment(frames);assessment_sheet();write_report(records,frames)
    data=[]
    for c in CANDIDATES:
        data.append({'id':c['id'],'name':c['name'],'description':c['description'],
                     'status':'UNAPPROVED_EXPLORATORY_HYPOTHESIS','dimensions':'paper units, not measured body proportions',
                     'additional_paper_section_controls':c.get('extra',[]),
                     'sections':[{'level':label,'height_paper_units':y,'design_controls':list(row),
                                  'whole_perimeter_2d':section(row).tolist(),
                                  'cubic_controls_2d':[[p.tolist() for p in controls] for controls in section_controls(row)]}
                                 for label,y,row in zip(SECTION_NAMES,Y_LEVELS,c['levels'])]})
    result={'decision':'NO_CANDIDATE_SUFFICIENTLY_SUPPORTED; STOP_FOR_REVIEW','winner':None,
            'previous_reconstruction_used_as_target_or_evidence':False,
            'candidate_design_basis':'independent 2D alternatives for unobserved surface variables, not inferred official dimensions',
            'candidates':data,'original_s4_sha256':sources,'classifications':STATUS,
            'assessments':records,'unknown_relationship':'physical contact/lift is unknown at white/purple image meetings',
            'positive_evidence_policy':'O never counts; D applies only to the observed property; no score computed',
            'direct_support_for_candidate_specific_hidden_geometry':False,
            'synthetic_tone_or_section_consistency_used_as_evidence':False,
            's1_role':'secondary neutral posture/landmark ordering; no cup, costume or depth outline',
            'mesh_edits':0,'garment_mesh_edits':0,'glb_builds':0,'new_geometry_tests':0}
    (OUT/'study.json').write_text(json.dumps(result,indent=2)+'\n')
    assert verify()==count
    (OUT/'preservation.json').write_text(json.dumps({'existing_locked_files_unchanged':count,
               'original_s4_frames_unchanged':len(sources),'mesh_edits':0,'garment_mesh_edits':0,
               'glb_builds':0,'new_geometry_tests':0,'winner':None,'stop_for_review':True},indent=2)+'\n')
    print(json.dumps({'sheets':6,'candidates':3,'assessment_records':len(records),'existing_files_unchanged':count,'winner':None}),flush=True)


if __name__=='__main__':main()

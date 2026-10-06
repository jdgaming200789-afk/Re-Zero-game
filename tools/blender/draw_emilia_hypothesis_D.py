"""Hypothesis D: analytic drawing surface, original-artwork prediction test.

This file never reads a character mesh, GLB, Blender scene, failed geometry
test or rendered model. No mesh is created or exported. A closed C2 spline
surface supplies paper projections, drawing normals, flow strokes and cuts.
B/C are small construction comparisons only. Original S4 pixels supply evidence.
"""
from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import math
import textwrap
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.interpolate import CubicSpline

from analyze_emilia_references import Sheet, INK, MUTED
import study_emilia_torso_hypotheses as previous

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/model-reviews/emilia-arc6-hypothesis-D'
COLOR = '#286B83'
FLOW = '#437FA4'
ANGLES = [0, 20, 40, 60, 90]
LABELS = ['FRONT', '20°', '40° 3/4', '60°', 'TRUE SIDE']
CUTS = [('A', 145, 'ONSET'), ('B', 200, 'RISING'), ('C', 260, 'FULLER'),
        ('D', 320, 'RETURN'), ('E', 380, 'JOIN')]

# Independent control net for an UNAPPROVED drawing, never official measures.
# y / lateral extent / forward extent / posterior context / inner x,z fractions
# / mid-anterior x,z fractions / outer x,z fractions. These are NOT B/C averages.
# Physical depth, span and transverse curvature remain free parameters.
CONTROL_ROWS = [
    (20, 25, 17, 16, .32, .84, .65, .58, .90, .25),
    (65, 37, 21, 20, .32, .84, .65, .58, .90, .25),
    (100, 90, 25, 30, .31, .83, .61, .50, .86, .19),
    (140, 101, 27, 35, .30, .82, .61, .48, .87, .19),
    (180, 106, 36, 38, .30, .86, .63, .57, .89, .25),
    (220, 111, 54, 40, .32, .89, .65, .64, .93, .31),
    (255, 112, 66, 41, .34, .89, .68, .64, .94, .30),
    (290, 108, 62, 41, .35, .85, .71, .57, .93, .28),
    (330, 99, 48, 40, .36, .82, .71, .51, .90, .24),
    (380, 84, 31, 38, .40, .78, .73, .48, .91, .22),
    (430, 79, 27, 36, .40, .78, .73, .48, .91, .22),
]


class DrawingSurface:
    """One periodic circumferential cubic B-spline, C2 in both parameters.

    Q_i(y) are independently shaped continuous control trajectories.
    S(u,y) = sum_i N_i(u) Q_i(y), with the same S used for every output.
    Sections are S(u,constant y), never a fitted primitive or separate volume.
    """

    def __init__(self, depth_factor=1.0, turning=0.0, span_shift=0.0):
        controls = []
        heights = []
        for y, w, f, r, ix, iz, mx, mz, ox, oz in CONTROL_ROWS:
            # Optional variants illustrate identifiability, not approved bounds.
            f *= depth_factor if y >= 140 else 1.0
            iz -= turning if y >= 180 else 0.0
            mz -= turning*.7 if y >= 180 else 0.0
            half = [(0, f), (ix*w, iz*f), (mx*w, mz*f), (ox*w, oz*f),
                    (w, 0), (.87*w, -.56*r), (.61*w, -.90*r),
                    (.31*w, -r), (0, -1.03*r)]
            whole = half + [(-x, z) for x, z in half[-2:0:-1]]
            controls.append(whole)
            heights.append(y + span_shift*math.sin(math.pi*(y-140)/240)**2 if 140 < y < 380 else y)
        self.heights = np.array(heights)
        self.controls = np.array(controls, float)
        self.spline = CubicSpline(self.heights, self.controls, axis=0,
                                 bc_type=((1, np.zeros((16, 2))),
                                          (1, np.array([(x/79*(-.1), z/27*(-.06))
                                                       for x,z in controls[-1]]))))

    def section(self, y, u, normals=False):
        u = np.atleast_1d(u).astype(float)
        t = (u % 1)*16
        j = np.floor(t).astype(int)
        t -= j
        basis = np.array([(1-t)**3, 3*t**3-6*t**2+4,
                          -3*t**3+3*t**2+3*t+1, t**3]).T/6
        dbasis = np.array([-3*(1-t)**2, 9*t**2-12*t,
                           -9*t**2+6*t+3, 3*t**2]).T/6*16
        indices = (j[:,None]+np.array([-1,0,1,2])) % 16
        q = self.spline(float(y))[indices]
        xz = np.sum(basis[:,:,None]*q,axis=1)
        if not normals:
            return xz
        du = np.sum(dbasis[:,:,None]*q,axis=1)
        dv = np.sum(basis[:,:,None]*self.spline(float(y),1)[indices],axis=1)
        n = np.c_[-du[:,1], du[:,1]*dv[:,0]-du[:,0]*dv[:,1], du[:,0]]
        n /= np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
        return xz,n

    def path(self, u, y, angle):
        pts=[];visibility=[]
        for uu,yy in zip(np.atleast_1d(u),np.atleast_1d(y)):
            xz,n = self.section(yy,[uu],True)
            screen,depth = project(xz,angle)
            camera = np.array([math.sin(math.radians(angle)),0,math.cos(math.radians(angle))])
            pts.append((screen[0],yy));visibility.append(n[0]@camera > .025)
        return np.array(pts),np.array(visibility)


SURFACE=DrawingSurface()
U=np.linspace(0,1,1024,endpoint=False)


def project(xz,angle):
    a=math.radians(angle)
    return xz[:,0]*math.cos(a)-xz[:,1]*math.sin(a), xz[:,0]*math.sin(a)+xz[:,1]*math.cos(a)


def line(s,points,color=COLOR,width=2,opacity=1):
    if len(points)>1:
        s.path([('M',*points[0]),*[('L',*p) for p in points[1:]]],color,width,opacity=opacity)


def image_layer(s,im,x,y):
    s.image.paste(im,(round(x),round(y)),im.getchannel('A'))
    s.draw=ImageDraw.Draw(s.image)
    stream=io.BytesIO();im.save(stream,format='PNG')
    data=base64.b64encode(stream.getvalue()).decode()
    s.svg.append(f'<image x="{x:.2f}" y="{y:.2f}" width="{im.width}" height="{im.height}" href="data:image/png;base64,{data}"/>')


def silhouette(surface,angle):
    ys=np.linspace(20,430,821)
    limits=np.array([(project(surface.section(y,U),angle)[0].min(),
                      project(surface.section(y,U),angle)[0].max()) for y in ys])
    return np.c_[limits[:,0],ys],np.c_[limits[:,1],ys]


def tone(surface,angle,scale):
    width=round(300*scale);height=round(410*scale)+1
    image=np.zeros((height,width,4),np.uint8)
    xx=(np.arange(width)-width/2)/scale
    a=math.radians(angle)
    camera=np.array([math.sin(a),0,math.cos(a)])
    # One fixed studio light for all views, not inferred anime shading.
    light=np.array([-.42,-.65,.72]);light/=np.linalg.norm(light)
    for iy in range(height):
        y=20+iy/scale
        xz,n=surface.section(y,U,True)
        h,d=project(xz,angle)
        visible=n@camera > -.001
        order=np.argsort(h[visible]);p=h[visible][order]
        illumination=.46+.54*np.maximum(0,n[visible][order]@light)
        mask=(xx>=h.min())&(xx<=h.max())
        shade=np.interp(xx[mask],p,illumination)
        intensity=(129+117*shade).astype(np.uint8)
        image[iy,mask,:3]=np.c_[intensity-8,intensity-2,intensity+4]
        image[iy,mask,3]=255
    return Image.fromarray(image)


def visible_line(s,surface,u,y,angle,x,top,scale,color=FLOW,width=2):
    points,visible=surface.path(u,y,angle)
    run=[]
    for point,show in zip(points,visible):
        if show:
            run.append((x+scale*point[0],top+scale*point[1]))
        else:
            line(s,run,color,width,.72);run=[]
    line(s,run,color,width,.72)


def figure(s,surface,x,top,scale,angle,flow=True,cuts=False):
    im=tone(surface,angle,scale);image_layer(s,im,x-im.width/2,top+20*scale)
    left,right=silhouette(surface,angle)
    for border in (left,right):
        context=border[:,1]<140
        line(s,border[context]*scale+(x,top),'#82919F',2)
        line(s,border[~context]*scale+(x,top),COLOR,3)
    line(s,np.array([left[0],right[0]])*scale+(x,top),'#8797A6',2)
    line(s,np.array([left[-1],right[-1]])*scale+(x,top),'#8797A6',2)
    if flow:
        ys=np.linspace(140,400,160)
        for u in [-.3125,-.25,-.1875,-.125,-.0625,0,.0625,.125,.1875,.25,.3125,.375]:
            visible_line(s,surface,np.full(len(ys),u),ys,angle,x,top,scale)
        # Curves traverse medial/anterior/outer/side regions. Their varying
        # height avoids making screen-horizontal strokes look like a shelf.
        # These are surface construction strokes, never seams or anatomy.
        us=np.linspace(-.5,.5,320)
        for base in [165,218,270,329]:
            ys=base+25*(1-np.cos(2*np.pi*us))
            visible_line(s,surface,us,ys,angle,x,top,scale)
    if cuts:
        for name,y,_ in CUTS:
            h=project(surface.section(y,U),angle)[0].min()
            px=x+scale*h;py=top+scale*y
            s.text(px-50,py-12,name,22,COLOR,True)
            line(s,[(px-24,py),(px-7,py)],'#8C9AA7',1)


def section_drawing(s,surface,y,cx,cy,scale,color=COLOR,width=3):
    xz=surface.section(y,np.linspace(0,1,512))
    # Front is below, back above, identical convention for every section.
    pts=xz*scale+(cx,cy)
    line(s,pts,color,width)


def small_comparison(s,x,y,cid):
    c=next(c for c in previous.CANDIDATES if c['id']==cid)
    s.text(x,y,cid+' EXTREME',24,c['color'],True)
    # Reuse B/C paper data only for before/after construction comparisons.
    # It supplies no anatomy and never enters SURFACE's independent controls.
    for i,(angle,view) in enumerate([(0,'FRONT'),(40,'3/4'),(90,'TRUE SIDE')]):
        _,old_left,old_right=previous.outline(c,view)
        sc=.66;cx=x+100+178*i;top=y-40
        for border in (old_left,old_right):
            line(s,border*sc+(cx,top),c['color'],2,.65)
        left,right=silhouette(SURFACE,angle)
        line(s,left[left[:,1]>=140]*sc+(cx,top),COLOR,2)
        line(s,right[right[:,1]>=140]*sc+(cx,top),COLOR,2)
        s.text(cx-42,y+257,view,15,MUTED)
    pts=previous.section(previous.row_at(c,260))*.98+(x+705,y+179)
    line(s,np.r_[pts,pts[:1]],c['color'],2,.65)
    section_drawing(s,SURFACE,260,x+705,y+179,.98,COLOR,3)
    s.text(x+593,y+297,'SAME MIDDLE CUT',17,MUTED)


def drawing_sheet():
    s=Sheet(2800,1880)
    s.text(42,29,'EMILIA | HYPOTHESIS D',43,COLOR,True)
    s.text(42,88,'Unapproved drawing surface. Five projections and all cuts use one continuous spline surface.',24,INK)
    for i,(angle,label) in enumerate(zip(ANGLES,LABELS)):
        cx=282+553*i
        figure(s,SURFACE,cx,118,1.42,angle,flow=True,cuts=i==0)
        s.text(cx-85,755,label,27,INK,True)
    s.text(42,810,'SURFACE FLOW',25,COLOR,True)
    s.text(282,812,'Blue strokes turn across the medial front, anterior region, outer region, sidewall and ribcage. Construction only.',22,MUTED)
    s.text(42,866,'SECTIONS A–E',27,INK,True)
    s.text(324,868,'Actual cuts of D, same scale. Front below, back above. Hidden profiles stay unapproved.',23,MUTED)
    for i,(name,y,role) in enumerate(CUTS):
        cx=281+552*i
        s.text(cx-164,928,name+'  '+role,24,COLOR,True)
        section_drawing(s,SURFACE,y,cx,1052,1.65)
        s.text(cx-29,966,'BACK',16,MUTED)
        s.text(cx-33,1180,'FRONT',16,COLOR,True)
    s.text(42,1244,'B / C COMPARISON',26,INK,True)
    s.text(353,1247,'Colored thin lines: B or C. Dark blue: D. Same paper scale. Neither extreme is evidence.',23,MUTED)
    small_comparison(s,48,1310,'B')
    small_comparison(s,940,1310,'C')
    s.text(1840,1310,'D CHANGES THE CONSTRUCTION',24,COLOR,True)
    s.lines(1840,1356,['Curved medial arc instead of C’s flat bridge.',
                       'Less lateral spread than B in the fuller region.',
                       'Independent turning trajectories around the torso.',
                       'A distributed side arc and a longer lower blend.',
                       'No averaging of B/C control points.'],22,spacing=37)
    s.text(1840,1564,'STILL FREE',23,'#965970',True)
    s.lines(1840,1605,['Depth, onset height, fullness span, medial curvature,',
                       'outer wrap, return length and posterior extent.',
                       'The original frames do not select their exact values.'],21,spacing=34)
    s.text(42,1712,'D is a construction proposal, not an evidence-selected reconstruction. Original S4 predicts local tests, not hidden measurements.',24,INK,True)
    s.text(42,1775,'Synthetic light and flow lines show the proposed surface only. No mesh edit. No GLB build. Stop for drawing review.',23,MUTED)
    s.finish(out=OUT,name='01-D-five-views-and-sections')


STATUS={'S':'SUPPORTED BY OBSERVED SURFACE','W':'WEAKLY CONSISTENT',
        'U':'UNTESTABLE DUE TO OCCLUSION','X':'CONTRADICTED'}
SCOL={'S':'#148062','W':'#346BB2','U':'#85667A','X':'#BC4444'}

# Each test is a prediction in an exposed region, paired with original-image
# observation. No compatibility score and no credit for hidden pixels.
FRAME_TESTS=[
    ('S4-FRONT',[
      ('S','The exposed lower outline should narrow without a ledge.',
       'The purple side segments below the white hems taper smoothly.'),
      ('W','Visible medial shading should turn without establishing a flat plate.',
       'The narrow center opening carries stylized tone, not measurable depth.'),
      ('U','The fuller span, onset and upper width should remain bounded.',
       'White panels conceal those contours. Their outside edges are cloth.')]),
    ('S4-NEAR-FRONT',[
      ('W','The exposed lower flank should retain a continuous outward-to-inward turn.',
       'A partial purple right outline turns smoothly beneath the hem.'),
      ('W','The medial surface should remain connected as the view turns.',
       'A purple aperture is visible, but its tone and width also depend on cloth.'),
      ('U','Medial transverse curvature should distinguish D from B/C.',
       'White cloth and hair hide most of the relevant anterior surface.')]),
    ('S4-OPENING',[
      ('W','The exposed medial/lower region should carry gradual curvature.',
       'Purple painted arcs supply weak curvature clues. They are not section cuts.'),
      ('U','A curved medial front should replace C’s broad flat bridge.',
       'The crop contains no complete depth profile. Rods hide part of the field.'),
      ('U','D should sit beneath cloth without requiring rigid contact pads.',
       'White/purple meetings show UNKNOWN RELATIONSHIP, not contact.')]),
    ('S4-RUNNING',[
      ('S','The exposed lower lateral silhouette should stay continuous.',
       'The purple outline below the lifted cloth forms a smooth local connection.'),
      ('W','A turning lower anterior surface should read across the oblique pose.',
       'Purple curves and tones turn beneath the cloth. Lean and fabric affect them.'),
      ('U','The neutral maximum depth should form a bounded smooth arc.',
       'Cloth covers the maximum. The posed white profile is not a body profile.')]),
    ('S4-SEATED',[
      ('W','A connected return should continue into the exposed purple torso.',
       'A thin purple strip connects toward the lower torso beneath the panel.'),
      ('U','D’s sidewall/depth distribution should survive a near-side view.',
       'Panel, sleeve and seated/braced posture hide both complete depth limits.'),
      ('U','The return length should distinguish D from the extremes.',
       'The cloth edge interrupts the relevant profile. Its edge does not set anatomy.')]),
    ('S4-STANDING-OBLIQUE',[
      ('W','The exposed lower side should taper without an attachment step.',
       'Short purple lower outlines provide a local turning clue.'),
      ('U','The upper anterior arc should join the sidewall continuously.',
       'Forward arms and sleeves hide this junction. The armhole band is separate.'),
      ('U','Fullness breadth and front-to-back depth should distinguish D.',
       'Hands, cloth and camera prevent a complete neutral silhouette.')]),
    ('S4-TILTED',[
      ('W','The exposed lower anterior field should avoid a geometric shelf.',
       'The purple field looks continuous, but hands and camera hide a free profile.'),
      ('U','Curved medial turning should produce a changing oblique normal field.',
       'Hands and white panels conceal the important upper/inner region.'),
      ('U','D’s hidden fullest height should stay stable after camera tilt.',
       'No visible body landmark identifies the hidden maximum.')]),
    ('S4-LEANING',[
      ('W','The short exposed purple front/side region should turn smoothly.',
       'The purple patch and lower outline form a partial oblique connection.'),
      ('W','A distributed return should merge without a separate termination.',
       'Lower purple surface supplies a weak local clue, with strong pose effects.'),
      ('U','D should have narrower outer spread than B and a curved medial arc.',
       'Cape, hands and white panels hide the neutral fullest region.')]),
]


def compact_text(s,x,y,text,width=56,size=20,color=MUTED,line_height=26):
    lines=textwrap.wrap(text,width=width)
    s.lines(x,y,lines,size,color,spacing=line_height)
    return y+len(lines)*line_height


def prediction_sheet(frames):
    s=Sheet(2800,2360)
    s.text(42,25,'D | ORIGINAL S4 PREDICTION TEST',40,COLOR,True)
    s.text(42,83,'Predictions concern exposed surface only. Hidden pixels add no evidence. S = local support, not approval of D.',23,INK)
    records=[]
    for i,(fid,tests) in enumerate(FRAME_TESTS):
        x=42+1390*(i%2);y=147+505*(i//2)
        f=next(f for f in frames if f['id']==fid)
        p=ROOT/f['path']
        s.rect(x,y,1340,481)
        s.text(x+18,y+17,fid,25,INK,True)
        s.artwork(p.name,f['box'],x+18,y+61,365,360,source_dir=p.parent)
        yy=y+63
        for j,(status,prediction,observation) in enumerate(tests):
            s.text(x+403,yy,status+'  '+STATUS[status],18,SCOL[status],True)
            yy=compact_text(s,x+403,yy+26,'Prediction: '+prediction,width=75,size=18,line_height=24)
            yy=compact_text(s,x+403,yy+3,'Observed: '+observation,width=75,size=18,line_height=24)+14
            records.append({'frame':fid,'test':j+1,'classification':STATUS[status],
                            'classification_code':status,'prediction':prediction,
                            'original_observation':observation,'original_source':f['path'],
                            'positive_evidence':status=='S',
                            'candidate_specific_hidden_geometry_support':False})
    s.text(42,2208,'RESULT: no observed prediction selects D’s hidden surface over B/C. Local smoothness is shared, not a discriminator.',25,INK,True)
    s.text(42,2260,'Free: neutral depth, fullness height/span, medial curvature, outer wrap, hidden return and posterior extent. Contact stays UNKNOWN.',22,MUTED)
    s.text(42,2310,'No untestable result counts as support. No contradiction is invented from clothing. No modeling target is approved.',22,MUTED)
    s.finish(out=OUT,name='02-D-original-S4-predictions')
    return records


def surface_checks():
    # Mathematical/illustration checks only. They do not validate Emilia anatomy.
    maximum_front_depression=0.;minimum_jacobian=float('inf')
    for y in np.linspace(140,400,131):
        xz,n=SURFACE.section(y,U,True)
        center=SURFACE.section(y,[0])[0,1]
        maximum_front_depression=max(maximum_front_depression,float(xz[:,1].max()-center))
        q=SURFACE.spline(y)
        assert np.isfinite(xz).all() and np.isfinite(n).all()
        # Depth decreases along the complete right half from medial front
        # to medial back. The outermost x need not sit at the spline's .25
        # parameter. Positive half-width and monotonic depth exclude loops.
        half=SURFACE.section(y,np.linspace(0,.5,257))
        assert np.diff(half[:,1]).max()<1e-6
        assert half[:,0].min()>-1e-6
        minimum_jacobian=min(minimum_jacobian,float(np.linalg.norm(np.diff(xz,axis=0),axis=1).min()))
    assert maximum_front_depression < 1e-7
    return {'purpose':'drawing coherence only; NOT anime validation','surface':'one periodic C2 spline surface',
            'views':[{'yaw_degrees':a,'label':l} for a,l in zip(ANGLES,LABELS)],
            'cut_source':'same S(u,y) as exterior views',
            'max_sampled_medial_depression':maximum_front_depression,
            'nonzero_sampled_circumferential_steps':minimum_jacobian>0,
            'anatomical_validation':False,'frozen_modeling_target':False}


def write_report(frames,records,checks):
    text='''# Emilia, hypothesis D drawing review

D is an unapproved construction proposal. No mesh, garment or GLB changed.
A is rejected. B and C survive only as comparison extremes. No winner is selected.

## Drawing construction

One periodic cubic B-spline surface supplies FRONT, 20°, 40°, 60°, TRUE SIDE,
construction-flow curves and sections A–E. Independently varying control
trajectories shape the medial, anterior, outer, side and posterior regions.
The surface is C2 in both parameters. Cuts come from this surface. They are not
independent ellipse/rectangle targets. D never averages B/C control points.

The medial arc stays curved, with no central depression. The lateral spread
is reduced relative to B. Anterior-to-outer turning changes with height. The
side has a bounded rounded span and a long lower blend. Surface-flow lines
are construction strokes on the surface, never seams, grooves or anatomy.
Light is synthetic and fixed across views. Neither light nor drawing coherence
provides official evidence. Context above the upper torso and below its return
is schematic. No shoulder, neck, abdomen or other character region is edited.

## Prediction test and cross-correlation

All eight useful original S4 frames are tested. The original photos remain
unchanged. White garment edges do not define hidden body contours. Contact,
close-follow and cloth clearance remain UNKNOWN RELATIONSHIP.

Near-front and oblique frames expose portions of a smooth lower purple
connection. Running, seated and leaning frames supply additional partial
purple connections. These cross-view observations support local continuity,
with pose and camera limiting curvature estimates. They do not establish
the neutral anterior depth or the full hidden transverse shape.

The opening crop has curved purple painted marks, but no complete profile.
The tilted frame and standing oblique frame hide key anterior regions behind
hands or sleeves. They provide no discriminator for D's medial arc or depth.
No clothed outline is converted into a body depth measurement.

S1 supplies secondary neutral posture/landmark ordering only. No S1 costume,
cup or fitted-bodice contour is transferred. No fan body measurements enter.
Previous reconstructions and B/C supply construction comparisons, never evidence.

'''
    for fid,tests in FRAME_TESTS:
        f=next(f for f in frames if f['id']==fid)
        text+='## '+fid+'\n\nOriginal: `'+f['path']+'`.\n\n'
        text+='| Prediction | Original observation | Result |\n| --- | --- | --- |\n'
        for code,p,o in tests:text+='| '+p+' | '+o+' | '+STATUS[code]+' |\n'
        text+='\n'
    text+='''## Identifiability

The observed predictions do not distinguish D's hidden distribution from B/C.
Local continuity is shared. WEAKLY CONSISTENT supplies an ambiguous clue.
UNTESTABLE DUE TO OCCLUSION supplies no positive evidence. No contradiction
is invented where cloth hides the relevant surface.

Free parameters: absolute normalized depth, onset height, maximum height and
span, medial transverse curvature, outer-anterior turning, hidden lower-return
length, posterior extent, and physical cloth clearance. The drawing control
values describe one illustrative draft, not inferred official measurements,
selected parameter values or a frozen modeling target. No evidence-derived
numeric range is claimed. These parameters require drawing review.

The drawings answer how D would be constructed, not whether Emilia has D's
hidden shape. No mesh fitting is authorized. Stop for drawing review.
'''
    (OUT/'README.md').write_text(text)
    with (OUT/'prediction-tests.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(records[0]),lineterminator='\n')
        writer.writeheader();writer.writerows(records)
    data={'hypothesis':'D','approval':'NOT_APPROVED','decision':'STOP_FOR_DRAWING_REVIEW',
          'comparison_status':{'A':'REJECTED','B':'EXTREME_ONLY','C':'EXTREME_ONLY'},
          'construction':'S(u,y) = sum N_i(u) Q_i(y); periodic cubic circumferential basis; C2 control trajectories',
          'independent_control_rows':CONTROL_ROWS,'controls_are_official_measurements':False,
          'controls_are_selected_or_frozen_targets':False,'B_C_controls_averaged':False,
          'sections':[{'label':name,'paper_height':y,'role':role,
                       'perimeter_from_same_surface':SURFACE.section(y,np.linspace(0,1,512)).tolist()}
                      for name,y,role in CUTS],
          'prediction_tests':records,'original_s4_sha256':{f['path']:hashlib.sha256((ROOT/f['path']).read_bytes()).hexdigest() for f in frames},
          'hidden_shape_distinguished_from_B_C':False,
          'free_parameters':['depth','onset height','maximum height/span','medial curvature',
                             'outer wrap','hidden lower return','posterior extent','cloth clearance'],
          'surface_checks':checks,'mesh_edits':0,'garment_mesh_edits':0,'glb_builds':0,'geometry_tests':0}
    (OUT/'study.json').write_text(json.dumps(data,indent=2)+'\n')


def verify_preservation():
    lock=json.loads((OUT/'preservation-lock.json').read_text())
    for path,sha in lock['sha256'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path
    return len(lock['sha256'])


def main():
    OUT.mkdir(exist_ok=True);count=verify_preservation()
    frames=previous.frame_sources()
    checks=surface_checks()
    print('Drawing D from one analytic surface',flush=True)
    drawing_sheet()
    print('Testing predictions against eight original S4 frames',flush=True)
    records=prediction_sheet(frames)
    write_report(frames,records,checks)
    assert verify_preservation()==count
    (OUT/'preservation.json').write_text(json.dumps({'existing_files_unchanged':count,
                   'original_s4_frames_unchanged':8,'mesh_edits':0,'garment_mesh_edits':0,
                   'glb_builds':0,'geometry_tests':0,'stop_for_drawing_review':True},indent=2)+'\n')
    print(json.dumps({'sheets':2,'original_s4_frames':8,'prediction_tests':len(records),
                      'existing_files_unchanged':count,'winner':None}),flush=True)


if __name__=='__main__':main()

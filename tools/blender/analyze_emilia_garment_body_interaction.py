"""Original-artwork annotations and a SEPARATE unapproved paper hypothesis.

Only native S4 reference files supply evidence. No generated picture supplies
cloth, contact, anatomy, or depth evidence. The previous 2D body drawing is
loaded only as the hypothesis under review. No Blender/model/GLB is loaded.
"""
from __future__ import annotations

import hashlib
import json
import textwrap
from pathlib import Path

import numpy as np

from analyze_emilia_references import Sheet, INK, MUTED
import draw_emilia_body_reconstruction as proposal

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/model-reviews/emilia-arc6-garment-body-interaction'
R1 = 'docs/model-reviews/emilia-arc6-body-contour-review/references/'
R2 = 'docs/model-reviews/emilia-arc6-reference-analysis-v2/references/'
R4 = 'docs/model-reviews/emilia-arc6-v3-s4-cross-validation/references/'
COLORS = {'K': '#167B8A', 'F': '#C77020', 'E': '#2464B9', 'V': '#17815B', 'H': '#AD497B'}
NAMES = {'K': 'CONTACT / CLOSE FOLLOW', 'F': 'FREE OR PROJECTING CLOTH',
         'E': 'OVERLAP EDGE', 'V': 'VISIBLE PURPLE BODY/BODYSUIT',
         'H': 'HIDDEN / UNRESOLVED BODY'}


FRAMES = [
    dict(id='S4-FRONT', title='S4 | front, no cape covering the panels',
         path=R1+'emilia_front_reference.jpeg', box=(177,240,377,449),
         marks={'K':[(271,334)], 'F':[(199,420),(355,419)], 'E':[(242,386)],
                'V':[(279,343),(278,399)], 'H':[(230,310),(321,310)]},
         lines={
             'K':[[('M',269,321),('C',272,332,269,342,264,348)]],
             'F':[[('M',213,407),('C',207,419,198,423,192,425)],
                  [('M',340,408),('C',344,418,355,424,362,426)]],
             'E':[[('M',262,349),('C',247,360,246,373,240,390),
                   ('C',229,412,209,422,193,426)],
                  [('M',299,353),('C',318,362,317,381,326,404),
                   ('C',334,418,350,424,361,426)]],
             'V':[[('M',224,430),('C',224,436,223,442,222,447)],
                  [('M',328,430),('C',329,435,330,441,332,447)]]},
         notes=[
             ('K','Likely close-follow at the inner opening. Physical contact is NOT resolved.'),
             ('F','Outer tips extend past the exposed purple sides in the image. Air-gap size is unknown.'),
             ('E','The lower cloth edges cover purple areas at different heights. No body shelf is observed.'),
             ('V','Purple is visible in the opening and below the panels. Only short lower side outlines are free.'),
             ('H','Upper, outer and medial depth under white cloth remains hidden.')],
         opening='Narrow upper opening, widening below the inner cloth edges; this is a garment aperture.',
         pose='Near front, small pose/camera effects still present.'),

    dict(id='S4-NEAR-FRONT', title='S4 | standing near front',
         path=R2+'emilia_neutral_front.jpeg', box=(432,188,623,374),
         marks={'K':[(507,281)], 'F':[(588,347)], 'E':[(536,327)],
                'V':[(511,302),(520,353)], 'H':[(468,273),(549,281)]},
         lines={
             'K':[[('M',507,269),('C',505,282,507,291,513,297)]],
             'F':[[('M',570,337),('C',580,345,590,350,598,348)]],
             'E':[[('M',516,301),('C',518,316,530,326,543,324),
                   ('C',548,337,562,346,571,339),('C',579,346,588,350,598,348)],
                  [('M',489,302),('C',486,317,475,322,463,322),
                   ('C',458,332,450,337,442,338)]],
             'V':[[('M',566,352),('C',569,360,572,369,575,373)]]},
         notes=[
             ('K','The inner white/purple boundary is a likely close-follow zone, not a measured contact seam.'),
             ('F','The outer white lip flares. Panel and sleeve overlap makes the side junction uncertain.'),
             ('E','Scallops overlap the bodysuit. Their heights differ across the two visible sides.'),
             ('V','Center and lower purple surface is visible. Shaded strokes do not supply a depth scan.'),
             ('H','The broad white fields conceal the anterior surface and most of the side wrap.')],
         opening='The aperture appears less symmetric than the near-front frame above.',
         pose='Near-front oblique pose; sleeve and hair obscure some panel boundaries.'),

    dict(id='S4-OPENING', title='S4 | original opening close-up',
         path=R1+'emilia_opening_reference.jpeg', box=(0,0,495,232),
         marks={'K':[(151,139)], 'F':[], 'E':[(209,94)],
                'V':[(310,66),(210,184)], 'H':[(78,86)]},
         lines={
             'K':[[('M',141,141),('C',146,151,148,165,147,176)]],
             'E':[[('M',220,24),('C',230,50,230,70,218,93),
                   ('C',205,116,176,136,134,138),('C',147,168,144,204,111,228)],
                  [('M',403,11),('C',395,44,407,78,429,102)]]},
         notes=[
             ('K','Purple continues under the inner white edge. Close-follow is plausible; no gap is measurable.'),
             ('F','NOT RESOLVED in this crop. White shading alone does not prove projecting cloth.'),
             ('E','The curved inner white edges belong to the garment, not a medial anatomical boundary.'),
             ('V','Purple inside the opening is directly visible. Painted shadow/crease marks are not 3D contour measurements.'),
             ('H','The body beneath the white portions and beyond the crop remains concealed.')],
         opening='The aperture exposes one continuous purple field; its outline does not define two rigid pads.',
         pose='Close crop and foreground rods limit context; viewing direction is not calibrated.'),

    dict(id='S4-RUNNING', title='S4 | running oblique / side support',
         path=R1+'emilia_running_side_reference.jpg', box=(257,507,700,783),
         marks={'K':[(568,638)], 'F':[(284,665)], 'E':[(399,700)],
                'V':[(621,650),(485,735)], 'H':[(440,570)]},
         lines={
             'K':[[('M',575,612),('C',575,634,565,655,548,667)]],
             'F':[[('M',270,651),('C',258,661,265,674,322,673)]],
             'E':[[('M',324,673),('C',309,697,326,708,367,702),
                   ('C',383,715,429,708,442,699),('C',463,710,501,696,506,676),
                   ('C',545,686,576,656,576,603)]],
             'V':[[('M',357,726),('C',351,746,342,764,328,778)]]},
         notes=[
             ('K','The inner border follows the visible purple region locally. True contact remains inferred.'),
             ('F','The near lower lip flares beyond exposed purple. No fixed cloth/body offset follows from this.'),
             ('E','Lifted scallops cross over purple at unequal heights. The white outline is not the torso profile.'),
             ('V','The opening and lower bodysuit are visible. Internal painted lines do not determine hidden depth.'),
             ('H','Most anterior fullness is hidden. Cape above and behind the panel is excluded from body evidence.')],
         opening='Near and far white regions are differently foreshortened; do not mirror this posed aperture.',
         pose='Forward lean, arm pose, perspective and cloth motion confound a neutral true-side contour.'),

    dict(id='S4-SEATED', title='S4 | seated near-side support',
         path=R4+'emilia_s4_seated_near_side.jpeg', box=(331,190,438,330),
         marks={'K':[(367,249)], 'F':[(371,293)], 'E':[(379,267)],
                'V':[(355,241),(390,304)], 'H':[(375,225)]},
         lines={
             'K':[[('M',365,244),('C',364,251,366,257,370,261)]],
             'F':[[('M',359,286),('C',365,285,369,290,376,298)]],
             'E':[[('M',368,260),('C',371,266,379,269,388,270)],
                  [('M',349,258),('C',346,265,350,270,358,271)]],
             'V':[]},
         notes=[
             ('K','A narrow inner white/purple boundary is visible. Contact depth is still unresolved.'),
             ('F','A small lower white lip projects in the image; sleeve/cloth overlap obscures its 3D gap.'),
             ('E','Visible hem segments cover purple. The large white arm region is not a free chest outline.'),
             ('V','A narrow purple strip and lower purple surface are visible. No clean complete upper-body outline is exposed.'),
             ('H','White panels, sleeves and pose hide anterior and rear limits of the upper torso.')],
         opening='The near-side angle compresses the opening into a partial strip; far edges are occluded.',
         pose='Sitting and bracing alter posture. This is near-side artwork, not an orthographic body scan.'),

    dict(id='S4-STANDING-OBLIQUE', title='S4 | standing oblique, arms forward',
         path=R4+'emilia_s4_standing_side_oblique.webp', box=(220,185,329,330),
         marks={'K':[], 'F':[(237,287)], 'E':[(268,287)],
                'V':[(268,309),(267,236)], 'H':[(282,254)]},
         lines={
             'F':[[('M',248,278),('C',244,284,236,289,232,290)]],
             'E':[[('M',238,287),('C',249,300,263,293,274,285),
                   ('C',282,294,290,286,295,282)]],
             'V':[[('M',248,301),('C',246,310,240,320,235,327)],
                  [('M',300,298),('C',299,309,299,318,299,328)]]},
         notes=[
             ('K','NOT RESOLVED. Raised arms and sleeves hide any defensible panel-contact location.'),
             ('F','The outer/lower white lip extends past visible purple. Panel/sleeve identity is partly occluded.'),
             ('E','The scalloped edge overlaps the bodysuit. This is not the body lower-return contour.'),
             ('V','Lower purple sides are exposed. The upper purple armhole band is separate clothing evidence.'),
             ('H','The fullest anterior region and center opening are hidden behind posed arms and white cloth.')],
         opening='The center opening is mostly occluded, so its width and hidden side cannot be traced here.',
         pose='Inclination, oblique camera and forward arms prevent a neutral depth measurement.'),
]


def wrap(s, x, y, value, width=58, size=22, color=MUTED, spacing=30):
    lines = textwrap.wrap(value, width=width)
    s.lines(x, y, lines, size, color, spacing)
    return y+len(lines)*spacing


def annotation(s, e, off, scale):
    for key in ('E','F','K','V'):
        for path in e['lines'].get(key,[]):
            s.path(path, '#FFFFFF', 6, off, scale)
            s.path(path, COLORS[key], 3, off, scale, dashed=key=='K')
    for key,points in e['marks'].items():
        for x,y in points:s.marker(off[0]+scale*x,off[1]+scale*y,key,COLORS[key])


def evidence_card(s, e, y):
    s.rect(40,y,1720,584)
    s.text(65,y+18,e['title'],28,INK,True)
    s.text(70,y+63,'ORIGINAL CROP',19,MUTED,True)
    s.text(520,y+63,'SAME CROP + ANNOTATIONS',19,MUTED,True)
    path=ROOT/e['path']
    s.artwork(path.name,e['box'],65,y+99,425,390,source_dir=path.parent)
    off,sc=s.artwork(path.name,e['box'],510,y+99,425,390,source_dir=path.parent)
    annotation(s,e,off,sc)
    yy=y+74
    for key,note in e['notes']:
        s.text(966,yy,key,23,COLORS[key],True)
        yy=wrap(s,1001,yy,note,width=55,size=21,spacing=28)+13
    wrap(s,65,y+509,e['opening'],width=117,size=21,color=INK,spacing=28)
    wrap(s,65,y+547,e['pose'],width=118,size=18,color=MUTED,spacing=26)


def evidence_sheet(entries, name, subtitle):
    s=Sheet(1800,2250)
    s.text(40,27,'Emilia | ORIGINAL S4 garment / body interaction',36,INK,True)
    s.text(40,83,subtitle,23,MUTED)
    s.text(40,125,'Source artwork is not repainted. No synthetic anatomy or cloth appears in this evidence layer.',22,INK)
    for i,(key,label) in enumerate(NAMES.items()):
        x=48+(i%2)*875; y=172+(i//2)*47
        s.marker(x+15,y+13,key,COLORS[key]);s.text(x+44,y+1,label,23,COLORS[key],True)
    s.text(40,325,'K = inferred close-follow. F = visible flare / projecting edge; an actual air gap is not measured.',21,MUTED)
    s.text(40,361,'E and V are observed image boundaries/surfaces. H marks concealment, not an anatomical outline.',21,MUTED)
    for i,e in enumerate(entries):evidence_card(s,e,412+i*604)
    s.text(40,2230,'S4 is authoritative. S1 is not used to label S4 garment behavior. DRAWING REVIEW ONLY.',18,MUTED)
    s.finish(out=OUT,name=name)


def plain_hypothesis(s,x,y,scale,view):
    shape,left,right=proposal.outline(view)
    proposal.polygon(s,shape*scale+(x,y),'#FAF0F3',stroke='#92546F',width=3)
    # Only synthetic construction strokes, with NO invented shading or garment.
    for frac in (.25,.76) if view!='TRUE SIDE' else (.65,):
        points=[]
        for yy in np.linspace(146,358,90):
            cut=proposal.section(float(proposal.WIDTH(yy)),float(proposal.FRONT(yy)),float(proposal.REAR(yy)))
            idx=int((.25+.5*frac)*len(cut))%len(cut)
            u=float(proposal.project(cut[idx:idx+1],view)[0]);points.append((x+u*scale,y+yy*scale))
        proposal.polyline(s,points,'#B793A4',2,dashed=True)
    for letter,_,yy,*_ in proposal.LEVELS:
        cut=proposal.section(float(proposal.WIDTH(yy)),float(proposal.FRONT(yy)),float(proposal.REAR(yy)))
        u=float(proposal.project(cut,view).min());py=y+yy*scale
        s.text(x-190*scale,py-10,letter,22,'#92546F',True)
        proposal.polyline(s,[(x-169*scale,py),(x+(u-13)*scale,py)],'#BAA3B0',2,True)
    s.text(x-96*scale,y+438*scale,view,26,INK,True)


COMPATIBILITY = [
    ('Continuous exposed purple surface',
     'All primary frames reveal purple in the opening and/or below the hems.',
     'One continuous torso supplies this surface. No seam, attached pad or medial groove is required.',
     'COMPATIBLE; EXACT HIDDEN DEPTH UNRESOLVED'),
    ('Changing scalloped overlap and outer flare',
     'Front and running frames show unequal cloth edges crossing purple; side frames retain partial overlaps.',
     'The same smooth body permits independent cloth overlap. Hem height never fixes a body shelf or pocket.',
     'COMPATIBLE IF CLOTH IS FREE TO OVERLAP'),
    ('Center aperture and side wrap',
     'The opening appears near symmetric in front, partial/asymmetric in oblique views, and hidden behind arms.',
     'A continuous surface works behind these apertures. The white borders cannot set anterior depth or far-side width.',
     'COMPATIBLE; CONTACT MAP UNRESOLVED'),
    ('Neutral depth / onset / lower return',
     'Seated/running upper limits are cloth- and pose-dependent; standing oblique arms conceal the fullest region.',
     'No repeated original S4 observation proves or refutes the present section depths. S1 costume edges do not resolve them.',
     'UNRESOLVED; NOT BODY APPROVAL'),
]


def hypothesis_sheet(record):
    s=Sheet(2100,2330)
    s.text(45,25,'Emilia | SEPARATE BODY HYPOTHESIS + compatibility review',39,INK,True)
    s.text(45,84,'SYNTHETIC CONSTRUCTION. Not anime evidence. No garment or anatomy is observed in these drawings.',22,'#92546F',True)
    s.text(45,128,'Body contours and five section shapes are UNCHANGED. Old photo hypothesis overlays are withdrawn as evidence.',21,MUTED)
    for x,view in ((350,'FRONT'),(1020,'TRUE SIDE'),(1670,'3/4')):plain_hypothesis(s,x,170,1.27,view)
    s.text(45,782,'Dashed interior strokes show synthetic construction flow only. No drawn shading is used as evidence.',22,MUTED)
    s.text(45,833,'A-E | same complete torso sections; ALL INTERPOLATED',29,INK,True)
    s.text(45,879,'No section coordinate is an official measurement. Front below / back above. No cloth outline is a body target.',21,MUTED)
    for i,entry in enumerate(record['sections']):
        x=55+i*410;ox=x+195
        s.rect(x,923,390,278)
        s.text(x+16,940,entry['level']+'  '+entry['role'],20,INK,True)
        points=np.array(entry['closed_section_2d_pixels'])
        proposal.polygon(s,points*1.28+(ox,1058),'#FAF0F3',stroke='#92546F',width=3)
        s.text(ox-25,987,'BACK',15,MUTED)
        s.text(ox-28,1162,'FRONT',15,'#92546F',True)
    s.text(45,1245,'Actual S4 cloth over this body: qualitative compatibility, not a calibrated fit',28,INK,True)
    s.text(45,1287,'Evidence remains on sheets 1-2. No new white-cloth drawing is invented to rescue this hypothesis.',21,MUTED)
    yy=1342
    for title,observed,test,status in COMPATIBILITY:
        s.rect(45,yy,2010,176)
        s.text(70,yy+16,title,24,INK,True)
        wrap(s,70,yy+53,'S4 OBSERVED: '+observed,width=156,size=20,spacing=27)
        wrap(s,70,yy+101,'HYPOTHESIS TEST: '+test,width=156,size=20,spacing=27)
        s.text(70,yy+146,status,18,'#92546F',True)
        yy+=194
    s.text(45,2135,'Revision decision: no contour/section change justified by garment evidence alone.',25,INK,True)
    s.lines(45,2176,[
        'The fitted-cloth assumption is rejected. Hidden body depth remains unapproved, rather than being re-inferred from white edges.',
        'S1 stays secondary structural support only. A future body hypothesis must yield if stronger original S4 body evidence contradicts it.',
        'NO MESH EDITS. NO GARMENT MESH EDITS. NO GLB BUILD. STOP FOR REVIEW.'],21,spacing=39)
    s.finish(out=OUT,name='03-body-hypothesis-compatibility')


def report_text():
    text = '''# Emilia S4 garment/body interaction review

This review corrects the evidence hierarchy. All garment observations come
from original supplied S4 frame files. The previously generated illustrations
are synthetic and have no evidentiary weight. The earlier orange reconstruction
overlays do not identify observed anatomy and are withdrawn as shape evidence.

The white covering has curved inner edges, independent lower scallops and side
overlaps. These describe cloth. The purple opening is a visible bodysuit area,
not a separate chest object or a measured medial groove. A painted purple
crease/shadow is an observed paint mark, not a 3D depth measurement.

| Label | Meaning | Evidentiary limit |
| --- | --- | --- |
| CONTACT / CLOSE FOLLOW (K) | Likely close-follow beside some visible inner opening borders | Inferred from the image; actual contact, support force and air gap are not measurable |
| FREE OR PROJECTING CLOTH (F) | A lip/flare projects past an exposed purple contour in the image | Physical separation remains inferred; a sleeve or cape occlusion sometimes limits panel identity |
| OVERLAP EDGE (E) | White scalloped or inner edge covers purple | Direct image boundary; never a lower-chest anatomical boundary |
| VISIBLE PURPLE BODY/BODYSUIT (V) | Exposed purple surface and occasional free outer silhouette | Surface visibility does not provide neutral anterior depth |
| HIDDEN / UNRESOLVED BODY (H) | Body concealed by white panels, sleeves, arms or crop | No contour or measurement is claimed |

No frame supplies a complete physical contact map. K is intentionally marked
as inferred. The close-up has no defensible F location; the standing arms-forward
frame has no defensible K location. Missing evidence is not filled with a
synthetic garment. Clean source crops appear beside their annotation layers.

## Independent S4 observations

'''
    for e in FRAMES:
        text+='### '+e['id']+'\n\n'
        for key,note in e['notes']:text+='- '+NAMES[key]+': '+note+'\n'
        text+='\nCenter opening: '+e['opening']+'\n\nPose limitation: '+e['pose']+'\n\n'
    text+='''## Hypothesis test and revision decision

The body proposal is shown separately on sheet 3, without an invented white
garment, generated shadows, cup borders or under-chest folds. Pale flow strokes
are construction lines only. None supplies anatomical evidence.

The unchanged proposal permits the visible purple field to remain continuous
behind the cloth, permits lower hems to cross over it at changing heights, and
does not demand a medial groove to explain the opening. These are qualitative
compatibility checks, not a proven clothing fit. The actual contact map, front
depth, outer turn under the panels and posterior upper limits remain unresolved.

The original S4 frames do not show a repeated neutral-body contradiction that
justifies selecting a different hidden section shape. The body silhouettes and
all five section contours therefore remain byte-for-byte equivalent as 2D
proposal data. No body or garment mesh was changed. S1 stays secondary and is
not used to label S4 garment behavior or borrow S1 cup/bodice outlines.

This choice does not approve the proposal. It removes the claim that synthetic
clothing or shading validates it. If stronger original S4 body observations
contradict a region, revise the body hypothesis rather than changing the garment
evidence. Cloth contact, lift and overlap must remain independent constraints.

## Prohibited shortcuts

Do not shrink-wrap the white outline into the body. Do not treat the covering
as two rigid pads. Do not map scallops or painted shadows to a body shelf,
crease, pair of pockets or central depression. Do not obtain hidden side depth
from a white sleeve or cape. Do not promote this paper consistency check into
a geometry approval or a new test authorization.

No mesh edit, garment mesh edit, GLB build or geometry test ran.
Stop for user review.
'''
    return text


def main():
    OUT.mkdir(exist_ok=True)
    lock=json.loads((OUT/'model-lock.json').read_text())
    for path,sha in lock['sha256'].items():assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path
    prior=ROOT/'docs/model-reviews/emilia-arc6-body-reconstruction-proposal/reconstruction.json'
    record=json.loads(prior.read_text())
    # Exact equality guards against quietly revising the body to fit cloth.
    for entry,level in zip(record['sections'],proposal.LEVELS):
        assert [entry['level'],entry['role'],entry['height_drawing_pixels'],entry['half_width_drawing_pixels'],entry['front_depth_drawing_pixels'],entry['rear_depth_drawing_pixels']]==list(level)
        assert np.array_equal(np.array(entry['closed_section_2d_pixels']),proposal.section(*level[3:]))
    evidence_sheet(FRAMES[:3],'01-original-s4-front-interaction','1 of 3 | FRONT + OPENING evidence only')
    evidence_sheet(FRAMES[3:],'02-original-s4-oblique-interaction','2 of 3 | POSED / OBLIQUE evidence only')
    hypothesis_sheet(record)
    sources={e['path']:hashlib.sha256((ROOT/e['path']).read_bytes()).hexdigest() for e in FRAMES}
    supplementary=[R2+'emilia_tilted_three_quarter.webp',R2+'emilia_leaning_three_quarter.jpeg']
    for path in supplementary:sources[path]=hashlib.sha256((ROOT/path).read_bytes()).hexdigest()
    result={'status':'UNAPPROVED_ANALYSIS_STOP_FOR_REVIEW','evidence_source':'original supplied S4 artwork only',
            'synthetic_drawing_used_as_evidence':False,'synthetic_cloth_drawn':False,
            'classification':NAMES,'frames':FRAMES,'reference_sha256':sources,
            'supplementary_pose_checks':'tilted and leaning frames were inspected; they add arm/cloth occlusion, not neutral hidden-depth measurements',
            'contact_limit':'physical contact not resolved; K is an inference',
            'free_cloth_limit':'projecting image outline observed; physical air gap not measured',
            'hypothesis_test':COMPATIBILITY,'body_contours_changed':False,'body_sections_changed':False,
            'prior_hypothesis_sha256':hashlib.sha256(prior.read_bytes()).hexdigest(),
            'section_data_sha256':hashlib.sha256(json.dumps(record['sections'],sort_keys=True).encode()).hexdigest(),
            'body_proposal_status':'COMPATIBLE IN TOPOLOGY; HIDDEN GEOMETRY AND CLOTH FIT UNRESOLVED',
            'old_photo_hypothesis_overlay_status':'withdrawn as shape evidence; historical uncalibrated speculation only',
            'mesh_edits':0,'garment_mesh_edits':0,'glb_builds':0,'new_geometry_tests':0,
            'next_action':'STOP FOR USER REVIEW'}
    (OUT/'interaction-analysis.json').write_text(json.dumps(result,indent=2)+'\n')
    (OUT/'README.md').write_text(report_text())
    for path,sha in lock['sha256'].items():assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha,path
    proof={'locked_existing_files_unchanged':len(lock['sha256']), 'original_s4_sources_unchanged':len(sources),
           'old_hypothesis_data_unchanged':True,'body_section_arrays_unchanged':True,
           'mesh_edits':0,'garment_mesh_edits':0,'glb_builds':0,'new_geometry_tests':0}
    (OUT/'preservation.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps({'sheets':3,**proof}),flush=True)


if __name__=='__main__':main()

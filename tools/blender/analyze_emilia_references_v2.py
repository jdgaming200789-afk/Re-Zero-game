"""Revise only 2D guide diagrams using six supplied anime images.

This script has no Blender/model import, GLB reader, vertex array or mesh output.
The prior sheet supplies only its drawing helper and official-image annotations.
New guide paths are qualitative hypotheses; source-pixel annotations are not
mesh coordinates or inferred measurements of concealed anatomy.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from analyze_emilia_references import Sheet, EVIDENCE, A, B, C, G, INK, MUTED, LINE, ROOT, SOURCES

OUT=ROOT/'docs/model-reviews/emilia-arc6-reference-analysis-v2'
NEW=OUT/'references'
P='#BB622D'

NEW_EVIDENCE=[
 dict(name='emilia_neutral_front.jpeg',title='01  NEW / STANDING FRONT',box=(423,188,625,423),source=NEW,
      A=[[('M',568,351),('C',570,370,578,394,591,416)]],
      B=[[('M',472,215),('C',448,231,438,255,445,281),('C',450,300,445,313,438,325),('C',434,333,430,337,429,340)],
         [('M',500,228),('C',485,242,489,255,498,262),('C',488,266,489,272,489,277),('C',491,287,486,294,479,298),('C',470,302,469,307,466,314),('C',463,326,454,328,449,326)],
         [('M',507,264),('C',506,281,510,297,521,301),('C',519,316,533,324,549,324),('C',553,343,565,344,578,338),('C',585,347,593,351,601,347)]],
      C=[[(464,232),(485,237),(485,258),(475,296),(452,312),(447,287),(442,263)],
         [(520,235),(550,241),(562,266),(575,290),(568,316),(542,319),(516,292)]],
      P=[],markers=[(531,354,'A',A),(554,322,'B',B),(459,270,'C',C),(602,240,'P',P)],
      notes=['A  Exposed lower purple side; chest is covered.',
             'B  Inner edges and lower lobed hem are cloth.',
             'P  Near-front, still uncalibrated perspective.',
             'C  Hidden fullness / medial depth are unresolved.']),
 dict(name='emilia_tilted_three_quarter.webp',title='02  NEW / TILTED OBLIQUE',box=(160,357,780,958),source=NEW,
      A=[],
      B=[[('M',460,568),('C',443,591,449,617,461,640)],
         [('M',653,524),('C',674,547,676,574,667,606),('C',660,635,650,652,645,665)]],
      C=[[(561,487),(621,524),(651,565),(644,616),(612,657),(566,652),(496,633),(462,617),(471,581),(510,544)]],
      P=[[('M',260,911),('L',492,485)]],
      markers=[(377,753,'A',A),(667,598,'B',B),(570,595,'C',C),(390,527,'P',P)],
      notes=['A  Purple field visible; no clear chest outline.',
             'B  White panel edge turns in an oblique view.',
             'P  Tilt + hands obscure the medial / lower join.',
             'C  Near-side body depth remains interpolation.']),
 dict(name='emilia_leaning_three_quarter.jpeg',title='03  NEW / LEANING OBLIQUE',box=(54,237,285,423),source=NEW,
      A=[[('M',108,357),('C',91,365,78,373,65,386)]],
      B=[[('M',164,297),('C',164,312,163,323,170,335),('C',185,342,201,338,207,325),('C',216,330,229,324,234,309),('C',247,310,256,302,261,289)],
         [('M',263,290),('C',273,301,280,308,276,323),('C',272,338,269,340,266,346)],
         [('M',260,342),('C',246,346,238,345,232,352),('C',222,367,213,374,208,377)]],
      C=[[(174,291),(214,281),(248,283),(253,301),(232,315),(207,329),(176,326)],
         [(239,347),(258,343),(266,351),(252,361),(224,370)]],
      P=[[('M',120,391),('L',226,276)]],
      markers=[(231,331,'A',A),(205,324,'B',B),(204,301,'C',C),(180,377,'P',P)],
      notes=['A  Only a short lower purple contour is clear.',
             'B  Cape and panel hem vary independently.',
             'P  Lean, raised arm and hands hide the return.',
             'C  Do not trace a neutral side from this pose.']),
]

OLD_EVIDENCE=[]
for old in EVIDENCE:
 e=dict(old,source=SOURCES,P=[])
 e['title']={'emilia_front_reference.jpeg':'04  ORIGINAL / FRONT',
             'emilia_running_side_reference.jpg':'05  ORIGINAL / RUNNING',
             'emilia_opening_reference.jpeg':'06  ORIGINAL / OPENING'}[e['name']]
 if e['name']=='emilia_running_side_reference.jpg':
  e['P']=[[('M',393,801),('L',573,524)]]
  e['markers']=e['markers']+[(610,563,'P',P)]
 if e['name']=='emilia_front_reference.jpeg':
  e['notes']=['A  Short purple side contours are directly seen.',
              'B  Long white hems differ from standing frame.',
              'P  Uncalibrated front; perspective not removed.',
              'C  White silhouette cannot set body width.']
 elif e['name']=='emilia_running_side_reference.jpg':
  e['notes']=['A  Lower bodysuit contour is exposed.',
              'B  Lifted white hem and cape are cloth.',
              'P  Lean + moving arm confound chest projection.',
              'C  Onset, peak and lower join are obscured.']
 else:
  e['notes']=['A  Visible purple, no outer body contour.',
              'B  White inner edges define the opening.',
              'P  Tight crop / occlusion; no calibrated camera.',
              'C  Covered body depth cannot be measured.']
 OLD_EVIDENCE.append(e)

# New drawings: fronts flare gradually instead of near-vertical rectangular
# walls. The side projection joins a single long return with matching tangent;
# it never curls back upright into a second visible bend.
FRONT_L=[('M',140,76),('C',131,98,124,121,123,149),('C',122,177,127,213,137,248),('C',141,265,145,292,146,311)]
FRONT_R=[(p[0],*[432-v if i%2==0 else v for i,v in enumerate(p[1:])]) for p in FRONT_L]
SIDE=[('M',242,55),('C',242,84,246,101,259,117),('C',272,133,294,138,298,157),
      ('C',302,176,288,209,244,306)]
FAR=[('M',160,73),('C',145,103,136,124,135,150),('C',134,188,143,249,160,310)]
NEAR=[('M',280,71),('C',288,98,309,124,321,154),('C',333,184,299,248,278,310)]
GUIDES=[
 dict(title='FRONT',subtitle='Continuous upper-to-lower transition',name='emilia_neutral_front.jpeg',
      box=(432,196,613,397),source=NEW,
      evidence=['Standing front supports', 'cloth placement, not hidden', 'body width or medial depth.'],
      paths=[FRONT_L,FRONT_R],flows=[[('M',216,62),('C',213,136,219,214,216,310)]],
      context=[[('M',183,16),('C',181,35,149,54,140,76)],
               [('M',249,16),('C',251,35,283,54,292,76)],
               [('M',146,311),('L',146,334)],[('M',286,311),('L',286,334)]],
      labels=[(23,102,'upper transition'),(4,199,'broad turn'),(277,282,'gradual return')],
      notes=['Replaced the near-vertical box sides with',
             'a gradual outward transition and long taper.',
             'No shelf, band, medial flattening or front island.',
             'Fullness is unresolved by the front view alone.']),
 dict(title='3/4',subtitle='One surface wrapping around the ribcage',name='emilia_tilted_three_quarter.webp',
      box=(220,407,718,911),source=NEW,
      evidence=['Oblique views test wrapping.', 'Hands / tilt block the join;', 'do not transfer the outline.'],
      paths=[FAR,NEAR],flows=[[('M',235,73),('C',256,115,285,148,293,175),('C',300,202,268,261,255,310)]],
      context=[[('M',182,22),('C',174,36,175,43,160,73)],
               [('M',257,22),('C',267,40,272,44,280,71)],
               [('M',160,310),('L',166,334)],[('M',278,310),('L',270,334)]],
      labels=[(290,134,'near turn'),(11,238,'far return')],
      notes=['Preserved the continuous ribcage-wrap idea.',
             'The lower near-side arc returns gradually.',
             'Thin interior lines indicate flow, not a groove.',
             'No separate anterior objects or cups are implied.']),
 dict(title='SIDE',subtitle='Projection dissolves into a long return',name='emilia_leaning_three_quarter.jpeg',
      box=(115,266,280,395),source=NEW,
      evidence=['No true side in this frame.', 'Lean + arms hide the join;', 'depth remains hypothetical.'],
      paths=[SIDE],flows=[],
      context=[[('M',130,55),('C',131,126,130,232,132,306)],
               [('M',244,306),('C',240,315,237,322,234,334)],
               [('M',132,306),('L',131,334)]],
      labels=[(94,70,'soft onset'),(76,133,'fullest region'),(5,264,'long gradual return')],
      notes=['The return is one extended arc, not a short',
             'inward bend followed by an upright reset.',
             'No ribcage notch or new abdomen target.',
             'Neither running nor leaning sets literal depth.']),
]


def legend(s,y):
 for x,c,l in [(75,A,'A  Observed'),(368,B,'B  Cloth'),(643,P,'P  Pose / perspective'),(1090,C,'C  Hidden'),(1425,G,'G  Proposal')]:
  s.marker(x,y+14,l[0],c);s.text(x+27,y,l,22,c,True)


def evidence_sheet():
 s=Sheet(1800,2050)
 s.text(60,40,'Emilia | six-reference evidence check',48,INK,True)
 s.text(60,103,'Only supplied anime art. Observations and hidden shape remain separate.',25,MUTED)
 legend(s,158)
 for i,e in enumerate(NEW_EVIDENCE+OLD_EVIDENCE):
  x,y=60+(i%3)*570,224+(i//3)*727
  s.rect(x,y,540,696);s.text(x+20,y+19,e['title'],23,INK,True)
  off,scale=s.artwork(e['name'],e['box'],x+20,y+67,500,438,source_dir=e['source'])
  for patch in e['C']: s.patch(patch,C,offset=off,scale=scale)
  for cl,col in [('B',B),('A',A)]:
   for p in e[cl]: s.path(p,'#FFFFFF',6,off,scale);s.path(p,col,3,off,scale)
  for p in e['P']: s.path(p,P,3,off,scale,dashed=True)
  for px,py,l,c in e['markers']:s.marker(off[0]+scale*px,off[1]+scale*py,l,c)
  s.lines(x+20,y+526,e['notes'],20,spacing=34)
 s.text(60,1715,'What survives the cross-check',30,INK,True)
 s.lines(60,1766,[
  'Repeated: purple openings and smooth exposed lower-torso segments; most of the chest stays covered.',
  'Variable: white hem position / lift, apparent projection, visible width and armpit exposure change with pose.',
  'Unresolved: hidden upper onset, medial fullness, true depth and exact lower-chest return.',
  'Several clothed frames strengthen continuity reasoning; repeated cloth edges still do not measure the body.',
  'Orange axes are apparent tilt indicators only. No pose was numerically rectified or deprojected.',
  'Amber patches mark selected occlusion, not concealed anatomical outlines. Lower-body traces set no targets.'
 ],23,spacing=38)
 s.finish(OUT,'emilia-six-reference-evidence')


def guide_sheet():
 s=Sheet(1800,1525)
 s.text(60,40,'Emilia | revised guides for review',48,INK,True)
 s.text(60,105,'V2: softer front transition, longer side return, continuous oblique wrap. No mesh edits.',24,MUTED)
 s.text(60,153,'Magenta = hypothesis. Amber = unresolved shape. Gray = unchanged context; no physical scale.',23,MUTED)
 for i,g in enumerate(GUIDES):
  x,y=60+i*570,213;s.rect(x,y,540,1005)
  s.text(x+20,y+20,g['title'],30,INK,True)
  s.text(x+20,y+66,g['subtitle'],20,MUTED)
  s.artwork(g['name'],g['box'],x+20,y+117,214,220,source_dir=g['source'])
  s.lines(x+255,y+151,g['evidence'],20,spacing=31)
  off=(x+41,y+388);scale=1.03
  for p in g['context']:s.path(p,LINE,3,off,scale)
  for p in g['paths']:s.path(p,C,17,off,scale,opacity=.17);s.path(p,G,4,off,scale,dashed=True)
  for p in g['flows']:s.path(p,G,2.4,off,scale,dashed=True,opacity=.6)
  for px,py,l in g['labels']:s.text(off[0]+px,off[1]+py,l,17,MUTED)
  s.text(x+20,y+755,'Lower join: meet the existing ribcage smoothly.',19,MUTED)
  s.lines(x+20,y+809,g['notes'],21,spacing=35)
 s.text(60,1260,'These are revised hypotheses, not approved modeling targets.',29,INK,True)
 s.lines(60,1313,[
  'The standing and original front frames constrain garment/body separation; the oblique frames test continuity.',
  'The running and leaning frames supply support only. They are not neutral side blueprints.',
  'No previous Claude / Devin render, failed mesh, or clothed edge was used as an anatomical target.',
  'All model files stay locked. Body, garment and every surrounding part remain paused until guide approval.'
 ],23,spacing=38)
 s.finish(OUT,'emilia-revised-guides-v2')


def main():
 evidence_sheet();guide_sheet()
 evidence=[]
 for e in NEW_EVIDENCE+OLD_EVIDENCE:
  item={k:v for k,v in e.items() if k!='source'}
  item['source_sha256']=hashlib.sha256((e['source']/e['name']).read_bytes()).hexdigest()
  evidence.append(item)
 guides=[{k:v for k,v in g.items() if k!='source'} for g in GUIDES]
 record={'status':'revised_analysis_only_awaiting_user_approval','physical_scale':None,
         'model_reads_or_writes':False,'observed_anatomical_depth_measurements':False,
         'reference_annotations':evidence,'proposed_qualitative_guides':guides,
         'source_roles':{'standing_front':'cloth/body separation; no hidden depth',
                         'original_front':'front consistency, excluding garment-derived body inference',
                         'oblique_frames':'continuity checks subject to pose/camera/hand occlusion',
                         'running_and_leaning':'support only; no neutral-side reconstruction',
                         'opening_close_up':'garment inner edges; purple visibility does not reveal depth'}}
 (OUT/'analysis-v2.json').write_text(json.dumps(record,indent=2)+'\n')
 lock=json.loads((OUT/'model-lock.json').read_text())
 for name,expected in lock['sha256'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,name
 (OUT/'model-preservation.json').write_text(json.dumps({'unchanged_files':len(lock['sha256']),
          'all_sha256_equal':True,'new_model_builds':0,'new_mesh_edits':0,'approval_status':'unapproved'},indent=2)+'\n')
 print(json.dumps({'sheets':['emilia-revised-guides-v2.png','emilia-six-reference-evidence.png'],
                   'model_files_unchanged':len(lock['sha256']),'model_builds':0,'mesh_edits':0}))


if __name__=='__main__':main()

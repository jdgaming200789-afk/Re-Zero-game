"""Conceptual S4 cross-validation of unchanged V3 2D guides.

No bpy, model import, geometry test, posed render, camera solve or GLB build.
Manual annotations separate free body contours from cloth/arm occlusion.
The supplied views check visibility and continuity, not calibrated projection.
"""
from __future__ import annotations

import hashlib
import io
import json
import textwrap
from pathlib import Path

from analyze_emilia_references import Sheet, A, B, C, G, INK, MUTED, LINE, ROOT
from analyze_emilia_references_v3 import proposal, traces, P

OUT=ROOT/'docs/model-reviews/emilia-arc6-v3-s4-cross-validation'
REF=OUT/'references'
V3=ROOT/'docs/model-reviews/emilia-arc6-reference-analysis-v3'
UNRESOLVED='COMPATIBLE BUT UNRESOLVED'
SUPPORTED='SUPPORTED'

EVIDENCE=[
 dict(name='emilia_s4_seated_near_side.jpeg',title='NEW S4 / SEATED NEAR SIDE',
      box=(330,198,430,328),full_box=(0,0,554,554),
      A=[],
      B=[[('M',356,216),('C',350,228,352,236,363,241),
          ('C',374,247,365,247,367,255),('C',367,266,376,269,386,270)],
         [('M',387,270),('C',386,280,397,291,414,285)],
         [('M',347,242),('C',347,254,355,263,364,268)]],
      P=[[('M',394,310),('L',380,213)]],
      C=[[(359,211),(376,205),(392,226),(384,241),(370,239)],
         [(372,244),(390,251),(409,276),(402,284),(382,276)],
         [(412,228),(429,230),(429,309),(414,290)]],
      notes=['A  Purple is visible. No reliable free chest contour.',
             'B  White panel edges bound the purple opening.',
             'P  Sitting, hip flexion, braced arms and near-side view.',
             'C  Onset, crest silhouette and rear depth stay hidden.'],
      interpretation={
       'A':'Visible upper and lower purple fields, but no reliable free torso silhouette in the relevant crop. No A chest curve traced.',
       'B':'Inner white-panel boundaries and hanging front cloth. Purple/white borders belong to occlusion, not a free body profile.',
       'P':'Seated hips and knees, braced arms, shoulder position and uncalibrated near-side camera. No numeric deprojection.',
       'C':'Upper onset, free crest profile, medial distribution and rear torso edge under collar, hair, panel and sleeve.',
       'conceptual_test':'A neutral continuous torso fits the visible purple patches without requiring a separate front object. Hip flexion and bracing explain apparent lower-torso changes. Exact neutral depth and lower return are untested.'}),
 dict(name='emilia_s4_standing_side_oblique.webp',title='NEW S4 / STANDING SIDE / 3/4',
      box=(220,190,328,325),full_box=(0,0,696,392),
      A=[[('M',248,295),('C',248,305,239,313,232,319)],
         [('M',303,289),('C',301,300,299,311,299,323)]],
      B=[[('M',242,286),('C',249,300,263,293,274,285),
          ('C',282,294,290,286,295,282)],
         [('M',247,235),('C',267,246,289,249,300,245)],
         [('M',306,242),('C',320,250,318,278,306,284)]],
      P=[[('M',254,319),('L',273,211)]],
      C=[[(271,217),(292,221),(307,239),(310,262),(291,280),(271,269)],
         [(235,217),(247,232),(246,266),(239,280),(230,268)]],
      notes=['A  Exposed purple front / rear sides below the hem.',
             'B  Sleeve and scalloped hem conceal the chest return.',
             'P  Oblique camera, forward hands and trunk inclination.',
             'C  Arms / hair cover upper, medial and rear chest.'],
      interpretation={
       'A':'Two free purple/background contours below the white hem. Smooth exposed anterior and posterior lower-torso edges; no upper-chest target read.',
       'B':'White sleeve, cuff and lower hem. These edges are garment boundaries even beside purple.',
       'P':'Standing oblique camera, inclined trunk and joined hands / forearms in front of the chest. No neutral orthographic reconstruction.',
       'C':'Upper onset, medial fullness, near-side crest and upper posterior boundary obscured by arms, sleeve and hair.',
       'conceptual_test':'A connected neutral ribcage wrapping toward the front is compatible with the visible lower contours. Near-side arm occlusion explains the hidden front. The frame cannot settle the upper wrap, true depth or crest height.'}),
]

REGIONS=[
 dict(region='FRONT / upper outer turn',status=UNRESOLVED,
      seated='No new true-front width. White cloth covers the outer chest.',
      standing='Oblique arms and sleeve hide the chest width.',
      basis='Neither new view measures the neutral front width.'),
 dict(region='FRONT / medial shape',status=UNRESOLVED,
      seated='Purple opening is visible, but garment borders hide the free medial profile.',
      standing='Joined hands and forearms cover the medial join.',
      basis='No direct evidence for exact medial fullness or a central depression.'),
 dict(region='3/4 / ribcage wrap',status=UNRESOLVED,
      seated='Connected visible purple fields fit a continuous torso concept.',
      standing='Exposed lower sides are connected, but upper wrap is covered.',
      basis='One connected surface is plausible. Exact upper turning remains concealed.'),
 dict(region='SIDE / upper onset',status=UNRESOLVED,
      seated='Collar, hair and upper panel hide the onset.',
      standing='Arms, sleeve and hair hide the onset.',
      basis='A gentle onset has no repeated visible conflict, but lacks a free contour test.'),
 dict(region='SIDE / crest and depth',status=UNRESOLVED,
      seated='Visible purple patch is bounded by cloth and hair. Rear torso is covered.',
      standing='No exposed upper crest. Upper rear boundary stays hidden.',
      basis='Neither frame supplies total neutral torso depth or a crest measurement.'),
 dict(region='SIDE / long lower return',status=UNRESOLVED,
      seated='White panels cover the upper return. Seated lower purple field is continuous.',
      standing='Scalloped hem hides the upper return. Exposed edges below stay smooth.',
      basis='A long return is compatible. Its full course is hidden in both frames.'),
 dict(region='RIBCAGE / visible continuation',status=SUPPORTED,
      seated='Visible lower purple field continues without a separated anterior piece.',
      standing='The two free A contours taper smoothly below the hem.',
      basis='Local exposed continuity is supported. This does not validate the hidden chest.'),
]


def wrapped(s,x,y,text,width=53,size=20,color=MUTED,spacing=29):
    s.lines(x,y,textwrap.wrap(text,width=width),size,color,spacing=spacing)


def save_complete(s,name):
    # Encode the complete PNG before writing a workspace file. Temporary
    # image drafts should never enter the saved review folder or review ZIP.
    stream=io.BytesIO();s.image.save(stream,format='PNG')
    (OUT/(name+'.png')).write_bytes(stream.getvalue())
    (OUT/(name+'.svg')).write_text('\n'.join(s.svg+['</svg>']))


def sheet(guides):
    s=Sheet(1800,2280)
    s.text(60,38,'Emilia | V3 S4 cross-validation',46,INK,True)
    s.text(60,101,'Existing V3 paths unchanged. Conceptual visibility check, no posed 3D render or camera solve.',23,MUTED)
    s.text(60,146,'Evidence method approved. Geometry hypothesis frozen for user review, still unapproved.',23,MUTED)
    for x,c,t in [(75,A,'A  Body contour'),(423,B,'B  Garment'),(765,P,'P  Pose / camera'),(1135,C,'C  Hidden'),(1440,G,'G  V3 guide')]:
        s.marker(x,205,t[0],c);s.text(x+25,190,t,22,c,True)

    for i,e in enumerate(EVIDENCE):
        x,y=60+i*860,245;s.rect(x,y,820,660)
        s.text(x+20,y+20,e['title'],25,INK,True)
        s.artwork(e['name'],e['full_box'],x+20,y+77,300,317,source_dir=REF)
        off,sc=s.artwork(e['name'],e['box'],x+354,y+78,433,383,source_dir=REF)
        traces(s,e,off,sc)
        s.text(x+20,y+412,'Original pose context',19,MUTED)
        s.text(x+360,y+482,'Annotated torso / selected occlusion',19,MUTED)
        s.lines(x+20,y+524,e['notes'],19,spacing=29)

    for i,g in enumerate(guides):
        x,y=60+i*570,947;s.rect(x,y,540,489)
        s.text(x+20,y+17,'V3 '+g['title'],27,INK,True)
        e=EVIDENCE[0 if i==2 else 1]
        off,sc=s.artwork(e['name'],e['box'],x+20,y+69,203,262,source_dir=REF)
        traces(s,e,off,sc)
        proposal(s,g,x+252,y+61,267,280)
        s.text(x+20,y+356,'New S4 / posed',18,INK,True)
        s.text(x+272,y+356,'V3 / unchanged',18,G,True)
        note=[
          'No new true front. Covered outer width and medial fullness stay unresolved.',
          'Forearms hide the upper wrap. Exposed lower sides fit continuous ribcage flow.',
          'Seated purple is visible, but cloth / hair bound the crest. Neutral depth stays unresolved.'
        ][i]
        wrapped(s,x+20,y+403,note,width=49,size=19,spacing=27)

    s.text(60,1475,'Region verdicts | hidden geometry receives no automatic approval',29,INK,True)
    xx=[60,445,930];ww=[385,485,810];yy=1532
    for x,w,t in zip(xx,ww,['Guide region','Verdict','New S4 cross-check']):
        s.rect(x,yy,w,53,fill='#E9EEF5');s.text(x+13,yy+17,t,21,INK,True)
    concise=[
      'No new true front. Cloth and arms cover outer chest width.',
      'Opening / hands obscure the free medial profile.',
      'A connected torso fits both views. Upper wrap stays hidden.',
      'Collar, hair and sleeve conceal the projection onset.',
      'Purple patch is visible, but no free crest or total depth.',
      'Both hems hide the upper return. Exposed purple stays smooth.',
      'Standing A contours taper smoothly. Support covers exposed joins only.'
    ]
    for i,r in enumerate(REGIONS):
        y=yy+55+i*74
        for x,w in zip(xx,ww):s.rect(x,y,w,72)
        wrapped(s,xx[0]+13,y+16,r['region'],width=30,size=20,color=INK,spacing=26)
        s.text(xx[1]+13,y+23,r['status'],19,A if r['status']==SUPPORTED else C,True)
        wrapped(s,xx[2]+13,y+13,concise[i],width=66,size=20,spacing=27)
    s.text(60,2141,'No repeated S4 contradiction found. Freeze V3 for review, no curve revision.',28,INK,True)
    s.text(60,2190,'S4 stays authoritative. S1 adds neutral structure only. No mesh, garment or GLB changes.',23,MUTED)
    s.text(60,2229,'Frozen means analysis closed, not geometry approved. The first geometry test still needs user authorization.',22,MUTED)
    save_complete(s,'emilia-v3-s4-cross-validation')


def canonical(guides):
    subset=[{k:g[k] for k in ['title','paths','flows','context']} for g in guides]
    return subset,json.dumps(subset,sort_keys=True,separators=(',',':')).encode()


def verify(lock):
    for name,sha in lock['sha256'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==sha,name
    for name,sha in lock['V3_source_sha256'].items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==sha,name


def main():
    lock=json.loads((OUT/'model-and-guide-lock.json').read_text());verify(lock)
    previous=json.loads((V3/'analysis-v3.json').read_text());guides=previous['guide_proposals']
    frozen,payload=canonical(guides);sha=hashlib.sha256(payload).hexdigest()
    assert sha==lock['guide_payload_sha256']
    sheet(guides)
    annotations=[]
    for e in EVIDENCE:
        annotations.append({**e,'source_sha256':hashlib.sha256((REF/e['name']).read_bytes()).hexdigest()})
    decision={'repeated_S4_contradictions':[],'guide_paths_revised':False,
              'supported_regions':1,'compatible_but_unresolved_regions':6,'contradicted_regions':0,
              'outcome':'freeze_unchanged_V3_for_user_review',
              'scope':'qualitative plausibility and visibility, not calibrated 3D projection or hidden-body validation'}
    record={'evidence_method':'approved_by_user','guide_geometry':'not_approved',
            'S4_primary':True,'S1_secondary_only':True,'new_S4_annotations':annotations,
            'region_verdicts':REGIONS,'decision':decision,'conceptual_projection_only':True,
            'camera_calibration':None,'posed_mesh_created':False,
            'new_metric_body_targets':None,'fan_measurements_used':False,
            'historical_model_renders_used_as_evidence':False}
    (OUT/'cross-validation.json').write_text(json.dumps(record,indent=2)+'\n')
    sources=previous['source_images']+[
        {'file':e['name'],'repository_path':str((REF/e['name']).relative_to(ROOT)),
         'sha256':e['source_sha256'],'priority':'authoritative_S4'} for e in annotations]
    freeze={'guide_version':'V3','status':'frozen_for_user_review',
            'evidence_method_approval':'approved','geometry_hypothesis_approval':'not_approved',
            'first_geometry_test_authorized':False,'reference_analysis_iteration_closed':True,
            'freeze_basis':'No repeated visible S4 contradiction in eight supplied S4 frames. Most chest regions remain hidden / unresolved.',
            'guide_payload_sha256':sha,'guide_paths':frozen,'source_images':sources,
            'V3_analysis_repository_path':str((V3/'analysis-v3.json').relative_to(ROOT))}
    (OUT/'frozen-guide-v3.json').write_text(json.dumps(freeze,indent=2)+'\n')
    verify(lock)
    preservation={'model_files_unchanged':len(lock['sha256']),
                  'V3_reference_analysis_files_unchanged':len(lock['V3_source_sha256']),
                  'guide_payload_sha256_equal':True,'new_mesh_edits':0,'new_garment_edits':0,
                  'new_GLB_builds':0,'new_character_render_calls':0}
    (OUT/'preservation.json').write_text(json.dumps(preservation,indent=2)+'\n')
    print(json.dumps({'decision':decision,'preservation':preservation}))


if __name__=='__main__':main()

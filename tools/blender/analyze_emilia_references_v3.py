"""Official-art analysis only: add S1 neutral evidence to unapproved S4 guides.

No Blender, model geometry, GLB load, build, or render. Manual source-pixel
landmarks produce dimensionless IMAGE ratios, never hidden-body measurements.
The V2 proposal paths are retained rather than fitted to S1 costume edges.
"""
from __future__ import annotations

import copy
import hashlib
import json

from analyze_emilia_references import Sheet, A, B, C, G, INK, MUTED, LINE, ROOT
from analyze_emilia_references_v2 import GUIDES, NEW_EVIDENCE, OLD_EVIDENCE, P

OUT = ROOT / 'docs/model-reviews/emilia-arc6-reference-analysis-v3'
S1 = OUT / 'references'
TURN = 'emilia_s1_neutral_turnaround.jpeg'
INFO = 'emilia_s1_production_sheet.jpeg'

# All observations below are on VISIBLE COSTUME edges. In particular the
# S1 cup rim is not an observed anatomical lower-chest boundary.
S1_SIDE = {
    'name': TURN, 'source': S1, 'box': (96,87,176,200),
    'B': [[('M',125,119),('C',115,120,110,128,111,135),
           ('C',111,143,116,146,120,148)],
          [('M',120,150),('C',120,160,120,176,120,188)]],
    'A': [], 'P': [],
    'C': [[(116,124),(136,123),(143,138),(134,148),(119,144)],
          [(146,132),(158,138),(158,185),(146,184)]],
    'landmarks': {'upper_lateral_bodice_rim_y':120, 'waist_trim_y':188,
                  'covered_crest':[111,135], 'visible_cup_lower_edge_y':148,
                  'lower_bodice_front_x':120},
}
S1_FRONT = {
    'name': TURN, 'source': S1, 'box': (282,96,360,194),
    'B': [[('M',299,124),('C',294,128,294,138,299,144),
           ('C',305,148,311,148,318,143)],
          [('M',337,124),('C',345,127,347,138,341,145),
           ('C',333,148,324,146,318,143)],
          [('M',303,152),('C',303,163,303,177,302,184)],
          [('M',339,151),('C',338,163,338,177,338,184)]],
    'A': [], 'P': [],
    'C': [[(300,129),(336,129),(339,142),(305,142)]],
    'landmarks': {'upper_lateral_bodice_rim_y':124, 'waist_trim_y':184,
                  'covered_chest_width':{'y':136,'x':[295,345]},
                  'fitted_bodice_width':{'y':171,'x':[303,338]},
                  'visible_cup_lower_edge_y':147},
}
S1_FRONT_INFO = {
    'name': INFO, 'source': S1,
    'landmarks': {'upper_lateral_bodice_rim_y':119, 'waist_trim_y':187,
                  'covered_chest_width':{'y':134,'x':[65,124]},
                  'fitted_bodice_width':{'y':168,'x':[74,116]}},
    'role':'Same S1 design / reproduction check; not an independent body scan.',
}
S4_FRONT = copy.deepcopy(NEW_EVIDENCE[0])
S4_FRONT['landmarks'] = {
    'covered_chest_width':{'y':276,'x':[444,578]},
    'exposed_lower_purple_width':{'y':357,'x':[457,568]},
}

SUPPORT = [
 ('Upper onset',
  ['S4: covered upper chest; neck /', 'cloth placement limits interpretation.'],
  ['S1: upright trunk removes lean;', 'upper costume rim is a height cue.'],
  ['Gentle body onset is hypothetical.', 'No rim copied into the body.']),
 ('Projection region',
  ['S4: oblique frames check how', 'covered volume turns with the torso.'],
  ['S1: covered crest lies near the', 'upper part of its bodice span.'],
  ['Exact body depth and medial /', 'outer distribution remain unknown.']),
 ('Lower return',
  ['S4: exposed purple continues', 'smoothly below a variable cloth hem.'],
  ['S1: torso below cups is upright.', 'Its sharp cup edge is excluded.'],
  ['Long smooth return joins the', 'existing ribcage; no notch or shelf.']),
 ('Full torso depth',
  ['S4: pose and cloth obscure', 'neutral anterior / posterior limits.'],
  ['S1: rear hair / cape still hide', 'the posterior torso boundary.'],
  ['Unmeasured. Costume excursion', 'is not total anatomical depth.']),
]


def line(s,x1,y1,x2,y2,color=LINE,width=2,dashed=False):
    s.path([('M',x1,y1),('L',x2,y2)],color,width,dashed=dashed)


def traces(s,e,off,scale,hidden=True):
    if hidden:
        for points in e.get('C',[]): s.patch(points,C,.17,off,scale)
    for role,col in [('B',B),('A',A),('P',P)]:
        for path in e.get(role,[]):
            if role != 'P': s.path(path,'#FFFFFF',5,off,scale)
            s.path(path,col,3,off,scale,dashed=role=='P')


def proposal(s,g,x,y,w,h):
    # Diagram coordinates have no registered correspondence to source pixels.
    box=(105,15,350,338)
    scale=min(w/(box[2]-box[0]),h/(box[3]-box[1]))
    off=(x+(w-(box[2]-box[0])*scale)/2-box[0]*scale,
         y+(h-(box[3]-box[1])*scale)/2-box[1]*scale)
    def oriented(path):
        if g['title'] != 'SIDE': return path
        # Display the hypothesis facing left, as the unmodified S1 side art
        # does. This is diagram orientation only; the V2 path is retained.
        return [(cmd[0],*[455-v if i%2==0 else v for i,v in enumerate(cmd[1:])]) for cmd in path]
    for p in g['context']: s.path(oriented(p),LINE,2,off,scale)
    for p in g['paths']:
        p=oriented(p)
        s.path(p,C,16,off,scale,opacity=.17)
        s.path(p,G,4,off,scale,dashed=True)
    # Only the oblique flow line is useful here. It indicates surface flow,
    # never an internal boundary, groove, or separate anterior object.
    if g['title']=='3/4':
        for p in g['flows']: s.path(p,G,2,off,scale,dashed=True,opacity=.6)
    if g['title']=='SIDE':
        for name,px,py in [('1',247,86),('2',298,157),('3',264,261)]:
            s.marker(off[0]+(455-px)*scale,off[1]+py*scale,name,G)
    return off,scale


def guide_sheet():
    s=Sheet(1800,1880)
    s.text(60,40,'Emilia | V3 guide evidence review',46,INK,True)
    s.text(60,104,'S4 is authoritative. S1 neutral side adds secondary structure, not its costume outline.',24,MUTED)
    s.text(60,151,'V2 curves retained as unapproved hypotheses. No body depth inferred from a covered edge.',23,MUTED)
    for x,c,t in [(75,A,'A Body / bodysuit'),(412,B,'B Costume edge'),(768,P,'P Pose / camera'),(1124,C,'C Hidden'),(1411,G,'G Proposal')]:
        s.marker(x,206,t[0],c);s.text(x+25,192,t,22,c,True)
    panel_notes=[
      ['S4 front: white envelope is garment.',
       'Visible purple begins below / between panels.',
       'S1 front: older fitted bodice is secondary.',
       'Body width under either outfit is hidden.',
       'Proposal: continuous outer turn and taper.',
       'No rectangular target, band or center dip.'],
      ['S4 oblique: check one ribcage wrap.',
       'Tilt, hands and cloth conceal exact depth.',
       'S1 neutral: test landmark ordering only.',
       'No numeric deprojection of the S4 frames.',
       'Proposal: near and far sides stay connected.',
       'Interior stroke is flow, not a crease.'],
      ['1  Onset: gentle; hidden body interpolation.',
       '2  Crest: bounded region; depth unmeasured.',
       '3  Return: extended, smooth interpolation.',
       'S1 blue cup rim is cloth and is excluded.',
       'S4 posed frames remain the primary check.',
       'No literal tracing of the running silhouette.'],
    ]
    for i,g in enumerate(GUIDES):
        x,y=60+i*570,248;s.rect(x,y,540,819)
        s.text(x+20,y+22,g['title'],30,INK,True)
        subt=['Smooth upper transition / lower taper', 'One surface around the ribcage', 'S1 neutral side beside SIDE hypothesis'][i]
        s.text(x+20,y+67,subt,20,MUTED)
        if i<2:
            e=NEW_EVIDENCE[i]
            off,sc=s.artwork(e['name'],e['box'],x+20,y+118,225,329,source_dir=e['source'])
            traces(s,e,off,sc)
            s.text(x+20,y+458,'S4 PRIMARY',18,INK,True)
            s.text(x+20,y+487,'Official supplied frame',17,MUTED)
        else:
            # Include head, upright trunk and waist so this is visibly a
            # neutral side, not an uncontextualized crop of the S1 cups.
            off,sc=s.artwork(TURN,(95,30,195,222),x+20,y+116,207,333,source_dir=S1)
            traces(s,S1_SIDE,off,sc)
            s.text(x+20,y+458,'S1 SECONDARY',18,INK,True)
            s.text(x+20,y+487,'Neutral true side',17,MUTED)
        proposal(s,g,x+254,y+120,266,330)
        s.text(x+280,y+458,'UNAPPROVED',18,G,True)
        s.text(x+280,y+487,'Schematic guide',17,G)
        s.lines(x+20,y+525,panel_notes[i],20,spacing=38)
        s.text(x+20,y+774,'Gray context is schematic; surroundings stay fixed.',17,MUTED)

    s.text(60,1111,'SIDE support: what the art does and does not establish',30,INK,True)
    x=[60,315,825,1300]; w=[255,510,475,440]; y=1170
    for xx,ww,title in zip(x,w,['Curve region','S4 primary evidence','S1 secondary evidence','Hidden interpolation']):
        s.rect(xx,y,ww,63,fill='#E9EEF5');s.text(xx+14,y+20,title,20,INK,True)
    for k,(label,primary,secondary,unknown) in enumerate(SUPPORT):
        yy=y+65+k*91
        for xx,ww in zip(x,w):s.rect(xx,yy,ww,88)
        s.text(x[0]+14,yy+22,label,20,INK,True)
        for xx,lines,col in zip(x[1:],[primary,secondary,unknown],[MUTED,MUTED,G]):
            s.lines(xx+14,yy+17,lines,20,col,spacing=29)
    s.text(60,1625,'Dimensionless checks are on visible art boundaries, not official body measurements.',25,INK,True)
    s.lines(60,1674,[
      'S1 covered chest / fitted bodice width is about 1.4 in both sheets; S4 white envelope / purple width is about 1.2.',
      'These use different garments and levels. They are not a body-width ratio, a transfer scale, or a size target.',
      'S1 forward costume excursion is about 0.13 of its visible bodice span. Total body depth remains hidden.',
      'Full numeric definitions, landmarks and uncertainty appear in the companion evidence sheet.',
      'No fan measurements, model renders, mesh edits, GLB builds or renderer changes were used in this analysis.'
    ],22,spacing=35)
    s.finish(OUT,'emilia-revised-guides-v3')


def dimensionless_records():
    records=[]
    for e in [S1_FRONT,S1_FRONT_INFO]:
        d=e['landmarks'];h=d['waist_trim_y']-d['upper_lateral_bodice_rim_y']
        full=d['covered_chest_width']['x']; fitted=d['fitted_bodice_width']['x']
        rec={'source':e['name'],'view':'front','denominator':'visible upper lateral bodice rim to waist trim',
             'span_pixels':h,'covered_width_over_span':(full[1]-full[0])/h,
             'fitted_width_over_span':(fitted[1]-fitted[0])/h,
             'covered_over_fitted_width':(full[1]-full[0])/(fitted[1]-fitted[0]),
             'landmarks':d,'classification':'costume; not anatomical body width'}
        if 'visible_cup_lower_edge_y' in d:
            rec['cup_edge_height_u']=(d['visible_cup_lower_edge_y']-d['upper_lateral_bodice_rim_y'])/h
            rec['covered_crest_height_u']=(d['covered_chest_width']['y']-d['upper_lateral_bodice_rim_y'])/h
        records.append(rec)
    d=S1_SIDE['landmarks'];h=d['waist_trim_y']-d['upper_lateral_bodice_rim_y']
    records.append({'source':TURN,'view':'neutral_side','span_pixels':h,
                    'denominator':'visible upper lateral bodice rim to waist trim',
                    'covered_crest_height_u':(d['covered_crest'][1]-d['upper_lateral_bodice_rim_y'])/h,
                    'cup_edge_height_u':(d['visible_cup_lower_edge_y']-d['upper_lateral_bodice_rim_y'])/h,
                    'forward_costume_excursion_over_span':(d['lower_bodice_front_x']-d['covered_crest'][0])/h,
                    'landmarks':d,'true_torso_depth':None,
                    'classification':'costume front excursion, not body depth; rear occluded'})
    d=S4_FRONT['landmarks'];a=d['covered_chest_width']['x'];b=d['exposed_lower_purple_width']['x']
    records.append({'source':S4_FRONT['name'],'view':'standing_front',
                    'covered_over_exposed_lower_width':(a[1]-a[0])/(b[1]-b[0]),
                    'landmarks':d,'classification':'cloth envelope / exposed purple at different levels; not chest / waist anatomy'})
    return records


def span_axis(s,off,sc,x,top,bottom):
    px=off[0]+sc*x;yt=off[1]+sc*top;yb=off[1]+sc*bottom
    line(s,px,yt,px,yb,B,2,dashed=True)
    for val in [0,.25,.5,.75,1]:
        yy=yt+(yb-yt)*val;line(s,px-5,yy,px+5,yy,B)
        s.text(px+10,yy-8,f'{val:g}',17,B)
    s.text(px-3,yt-27,'u',19,B,True)


def width_mark(s,off,sc,d,label,color):
    a,b=d['x'];yy=off[1]+sc*d['y'];x1=off[0]+sc*a;x2=off[0]+sc*b
    line(s,x1,yy,x2,yy,color,2,True)
    line(s,x1,yy-5,x1,yy+5,color);line(s,x2,yy-5,x2,yy+5,color)
    s.text((x1+x2)/2-13,yy-27,label,19,color,True)


def evidence_sheet():
    s=Sheet(1800,2180)
    s.text(60,40,'Emilia | dimensionless reference checks',46,INK,True)
    s.text(60,103,'Manual image landmarks only. S1 supplies a neutral pose; S4 determines the design.',25,MUTED)
    s.text(60,151,'Blue = costume boundary / image ratio. Green = exposed purple. Amber = hidden body.',23,MUTED)
    s.text(60,191,'u = (image y - upper lateral bodice rim y) / (waist trim y - rim y), only within the S1 image.',22,MUTED)
    for i,e in enumerate([S1_FRONT,S1_SIDE,S4_FRONT]):
        x,y=60+i*570,250;s.rect(x,y,540,893)
        title=['S1 / NEUTRAL FRONT','S1 / NEUTRAL TRUE SIDE','S4 / STANDING FRONT'][i]
        s.text(x+20,y+20,title,25,INK,True)
        off,sc=s.artwork(e['name'],e['box'],x+35,y+84,430,501,source_dir=e['source'])
        traces(s,e,off,sc)
        d=e['landmarks']
        if i==0:
            span_axis(s,off,sc,352,d['upper_lateral_bodice_rim_y'],d['waist_trim_y'])
            width_mark(s,off,sc,d['covered_chest_width'],'Wc',B)
            width_mark(s,off,sc,d['fitted_bodice_width'],'Wb',B)
            notes=['H = rim-to-waist costume span = 60 px.',
                   'Wc / H ~ 0.83; Wb / H ~ 0.58.',
                   'Wc / Wb ~ 1.4, both clothed boundaries.',
                   'Covered crest u ~ 0.20; cup edge u ~ 0.38.',
                   'The cup edge is NOT a body return.',
                   'No hidden medial or outer body width read.']
        elif i==1:
            span_axis(s,off,sc,163,d['upper_lateral_bodice_rim_y'],d['waist_trim_y'])
            width_mark(s,off,sc,{'y':135,'x':[111,120]},'E',B)
            # Visible front bodice position is the excursion datum. Do not
            # introduce a guessed spine, torso centreline or rear skin edge.
            p1=(off[0]+sc*120,off[1]+sc*150);p2=(p1[0],off[1]+sc*121)
            line(s,*p1,*p2,B,2,True)
            notes=['H = rim-to-waist costume span = 68 px.',
                   'E = crest beyond lower bodice front = 9 px.',
                   'E / H ~ 0.13; this is costume excursion.',
                   'Covered crest u ~ 0.22; cup edge u ~ 0.41.',
                   'Rear torso boundary is hidden by hair / cape.',
                   'Full body depth cannot be measured here.']
        else:
            width_mark(s,off,sc,d['covered_chest_width'],'Wc',B)
            width_mark(s,off,sc,d['exposed_lower_purple_width'],'Wp',A)
            notes=['White chest envelope Wc ~ 134 px.',
                   'Exposed lower purple span Wp ~ 111 px.',
                   'Wc / Wp ~ 1.2, at DIFFERENT body levels.',
                   'Exclude sleeves and hanging white hem.',
                   'Covered body width is still unobserved.',
                   'Do not transfer the S1 fitted bodice ratio.']
        s.lines(x+20,y+626,notes,20,spacing=36)

    s.text(60,1185,'How these checks constrain a proposal',30,INK,True)
    s.lines(60,1238,[
      'FRONT: compare the observed S4 envelope and exposed purple separately. Hidden chest width stays a hypothesis.',
      'SIDE: S1 removes trunk lean; crest / rim ordering is readable. Body onset, depth and smooth return remain hidden.',
      '3/4: cross-check the six S4 frames for one continuous wrap. No single pose supplies a neutral 3D scan.',
      'A future surface must satisfy all three views together. These image ratios alone cannot construct that surface.',
      'No shoulder, waist, abdomen or lower-body changes follow from the landmarks marked on this sheet.'
    ],23,spacing=40)
    s.text(60,1487,'Reading limits and the second S1 sheet',30,INK,True)
    s.artwork(INFO,(0,0,600,491),60,1544,420,344,source_dir=S1)
    s.lines(510,1553,[
      'The second supplied S1 sheet repeats the same costume design.',
      'Its larger front gives Wc / Wb ~ 1.4 and Wc / H ~ 0.87.',
      'This supports a coarse image-reading check, not a second anatomical measurement.',
      'Manual source landmarks have about +/- 2 px reading ambiguity.',
      'Line weight, low resolution, occlusion and garment stiffness dominate precision.',
      'Values are deliberately rounded; there is no physical scale or official body size.',
      'The S1 side cup edge is sharper than the proposed S4 body return.',
      'That costume feature is excluded rather than averaged with S4.',
      'The S4 white panels also obscure the underlying surface. They are not a scan.'
    ],21,spacing=37)
    s.text(60,1931,'Decision boundary',29,INK,True)
    s.lines(60,1985,[
      'If S1 and S4 visibly disagree, follow S4. S1 contributes neutral landmark structure only.',
      'V3 keeps the V2 proposal paths. It adds evidence labels without claiming newly measured hidden depth.',
      'All guides remain unapproved. The body and garment stay paused; no model render is anatomical evidence.',
      'Original references, manual paths, normalized calculations and source hashes are included in the review pack.'
    ],23,spacing=37)
    s.finish(OUT,'emilia-neutral-side-evidence-v3')


def main():
    lock=json.loads((OUT/'model-lock.json').read_text())
    for name,expected in lock['sha256'].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,name
    guide_sheet();evidence_sheet()
    sources=[]
    for e in NEW_EVIDENCE+OLD_EVIDENCE+[S1_FRONT,S1_FRONT_INFO]:
        if e['name'] not in [v['file'] for v in sources]:
            sources.append({'file':e['name'],
                            'repository_path':str((e['source']/e['name']).relative_to(ROOT)),
                            'sha256':hashlib.sha256((e['source']/e['name']).read_bytes()).hexdigest(),
                            'priority':'secondary_S1' if e['source']==S1 else 'authoritative_S4'})
    record={'status':'analysis_only_awaiting_explicit_guide_approval',
            'hierarchy':'S4 authoritative; S1 secondary structural evidence; S4 wins visible disagreements',
            'prior_guide_paths_changed':False,'side_display_orientation':'mirrored diagram to face left like unmodified S1 art',
            'physical_scale':None,'fan_measurements_used':False,
            'no_anatomical_measurement_claim':True,'manual_landmark_reading_ambiguity_pixels':2,
            'source_images':sources,'dimensionless_image_checks':dimensionless_records(),
            'support_matrix':[{'region':r,'S4':a,'S1':b,'interpolation':c} for r,a,b,c in SUPPORT],
            'S1_manual_traces':[{k:v for k,v in e.items() if k!='source'} for e in [S1_FRONT,S1_SIDE]],
            'guide_proposals':[{k:v for k,v in g.items() if k!='source'} for g in GUIDES]}
    (OUT/'analysis-v3.json').write_text(json.dumps(record,indent=2)+'\n')
    for name,expected in lock['sha256'].items():
        assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==expected,name
    result={'unchanged_files':len(lock['sha256']),'all_sha256_equal':True,
            'new_model_builds':0,'new_mesh_edits':0,'new_render_calls':0,
            'approval_status':'unapproved','guide_paths_changed':False}
    (OUT/'model-preservation.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))


if __name__=='__main__':main()

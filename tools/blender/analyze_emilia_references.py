"""Artwork-only annotations and tentative 2D guides. Never imports bpy/model code.

The hand-entered paths annotate source-image pixels. Guide coordinates live in
a separate diagram space, have no anatomical units, and are not fit targets.
Both PNG and standalone SVG share the same paths. No render or mesh is read.
"""
from __future__ import annotations

import base64
import hashlib
import io
import json
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/model-reviews/emilia-arc6-reference-analysis'
SOURCES = ROOT / 'docs/model-reviews/emilia-arc6-body-contour-review/references'
W, H = 1800, 1940
A, B, C, G = '#129679', '#146CCE', '#DBA037', '#9B408C'
INK, MUTED, LINE = '#24344B', '#5A6B80', '#D6DEE8'
FONTS = Path('/usr/share/fonts/truetype/dejavu')


class Sheet:
    def __init__(self, width=W, height=H):
        self.image = Image.new('RGB', (width, height), '#F3F5F9')
        self.draw = ImageDraw.Draw(self.image)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
                    f'<rect width="{width}" height="{height}" fill="#F3F5F9"/>']

    def rect(self, x, y, w, h, fill='white', stroke=LINE):
        self.draw.rounded_rectangle((x, y, x+w, y+h), radius=14, fill=fill, outline=stroke, width=2)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

    def text(self, x, y, text, size=22, color=INK, bold=False):
        font = ImageFont.truetype(str(FONTS / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')), size)
        self.draw.text((x, y), text, font=font, fill=color, anchor='lt')
        self.svg.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="DejaVu Sans, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" dominant-baseline="text-before-edge">{escape(text)}</text>')

    def lines(self, x, y, lines, size=22, color=MUTED, spacing=32):
        for i, line in enumerate(lines):
            self.text(x, y+i*spacing, line, size, color)

    def path(self, commands, color, width=3, offset=(0, 0), scale=1, dashed=False, opacity=1):
        def tr(p): return (offset[0]+scale*p[0], offset[1]+scale*p[1])
        points, svg, previous = [], [], None
        for cmd in commands:
            if cmd[0] in ('M', 'L'):
                p = tr(cmd[1:3]); svg.append(f'{cmd[0]}{p[0]:.2f},{p[1]:.2f}')
                points.append(p); previous = cmd[1:3]
            elif cmd[0] == 'C':
                p0, p1, p2, p3 = previous, cmd[1:3], cmd[3:5], cmd[5:7]
                q1, q2, q3 = tr(p1), tr(p2), tr(p3)
                svg.append('C'+','.join(f'{v:.2f}' for p in (q1, q2, q3) for v in p))
                for k in range(1, 81):
                    t=k/80; u=1-t
                    points.append(tr((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0],
                                      u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1])))
                previous=p3
        layer=Image.new('RGBA', self.image.size)
        d=ImageDraw.Draw(layer)
        rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))+(int(opacity*255),)
        if dashed:
            phase=0.0
            for p,q in zip(points, points[1:]):
                length=((q[0]-p[0])**2+(q[1]-p[1])**2)**.5
                if phase%17 < 10: d.line((p,q),fill=rgb,width=round(width))
                phase+=length
        else: d.line(points,fill=rgb,width=round(width),joint='curve')
        self.image=Image.alpha_composite(self.image.convert('RGBA'),layer).convert('RGB')
        self.draw=ImageDraw.Draw(self.image)
        dash=' stroke-dasharray="10 7"' if dashed else ''
        self.svg.append(f'<path d="{" ".join(svg)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" opacity="{opacity}"{dash}/>')

    def patch(self, points, color, opacity=.22, offset=(0,0), scale=1):
        pts=[(offset[0]+scale*x,offset[1]+scale*y) for x,y in points]
        layer=Image.new('RGBA',self.image.size); d=ImageDraw.Draw(layer)
        rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))+(round(opacity*255),)
        d.polygon(pts,fill=rgb)
        self.image=Image.alpha_composite(self.image.convert('RGBA'),layer).convert('RGB'); self.draw=ImageDraw.Draw(self.image)
        self.svg.append(f'<polygon points="{" ".join(f"{x:.2f},{y:.2f}" for x,y in pts)}" fill="{color}" opacity="{opacity}"/>')

    def marker(self, x,y,label,color):
        self.draw.ellipse((x-15,y-15,x+15,y+15),fill=color,outline='white',width=2)
        self.svg.append(f'<circle cx="{x}" cy="{y}" r="15" fill="{color}" stroke="white" stroke-width="2"/>')
        self.text(x-7,y-10,label,19,'white',True)

    def artwork(self, name, box, x,y,w,h, source_dir=SOURCES):
        im=Image.open(source_dir/name).convert('RGB').crop(box)
        scale=min(w/im.width,h/im.height)
        pw,ph=round(im.width*scale),round(im.height*scale)
        px,py=x+(w-pw)/2,y+(h-ph)/2
        self.image.paste(im.resize((pw,ph),Image.Resampling.LANCZOS),(round(px),round(py)))
        self.draw=ImageDraw.Draw(self.image)
        stream=io.BytesIO(); im.save(stream,format='PNG')
        encoded=base64.b64encode(stream.getvalue()).decode()
        self.svg.append(f'<image x="{px}" y="{py}" width="{pw}" height="{ph}" href="data:image/png;base64,{encoded}"/>')
        return (px-scale*box[0],py-scale*box[1]), scale

    def finish(self, out=OUT, name='emilia-reference-analysis'):
        out.mkdir(parents=True,exist_ok=True)
        self.image.save(out/(name+'.png'))
        (out/(name+'.svg')).write_text('\n'.join(self.svg+['</svg>']))


# A: only directly visible purple contour segments, never a white outer edge.
# B: manually traced white garment edges. C: body concealed by those surfaces.
EVIDENCE = [
    dict(name='emilia_front_reference.jpeg', title='01  FRONT ART', box=(170,238,382,494),
         A=[[('M',227,430),('C',224,445,223,453,219,462),('C',217,470,213,479,210,489)],
            [('M',328,430),('C',327,441,328,449,332,459),('C',335,472,339,482,342,490)]],
         B=[[('M',229,251),('C',227,281,208,295,209,326),('C',208,350,218,363,211,382),('C',208,405,200,418,192,426),('C',212,427,231,419,236,405)],
            [('M',277,273),('C',254,281,254,304,266,314),('C',274,320,285,317,290,321),('C',286,340,293,350,307,359)],
            [('M',334,252),('C',331,279,341,300,344,323),('C',347,347,339,364,339,382),('C',343,406,353,420,362,426),('C',346,428,332,416,326,404)]],
         C=[[(220,269),(256,272),(258,305),(267,319),(263,347),(245,376),(219,376),(211,344),(211,312)],
            [(302,269),(331,267),(339,305),(342,339),(333,377),(313,371),(298,345),(291,324),(283,303)]],
         markers=[(269,403,'A',A),(340,400,'B',B),(232,308,'C',C)],
         notes=['A  Short visible bodysuit sides below the hem.',
                'B  White outline and inner opening are cloth.',
                'C  Chest under the white panels is hidden.',
                'The front image cannot set medial depth.']),
    dict(name='emilia_running_side_reference.jpg', title='02  RUNNING ART', box=(275,470,695,840),
         A=[[('M',358,725),('C',351,749,339,769,316,788),('C',301,801,287,807,277,813)],
            [('M',593,725),('C',587,743,575,761,566,777),('C',553,799,539,814,528,825)]],
         B=[[('M',319,482),('C',326,531,300,596,269,650),('C',259,661,265,672,324,673),('C',309,698,326,708,367,702),('C',383,715,429,708,442,699),('C',463,710,501,696,506,676),('C',545,686,576,656,576,603)],
            [('M',578,600),('C',589,599,610,589,617,594),('C',619,604,646,609,651,609),('C',645,635,649,668,663,691),('C',661,708,653,725,644,738)]],
         C=[[(357,501),(431,514),(515,534),(570,576),(570,620),(543,659),(497,674),(432,692),(363,690),(334,661),(337,590)],
            [(626,551),(650,564),(667,619),(674,673),(663,702),(651,678),(649,635)]],
         markers=[(455,758,'A',A),(478,680,'B',B),(469,577,'C',C)],
         notes=['A  Lower bodysuit contour is visibly exposed.',
                'B  Lifted/scalloped cloth edge is not the body.',
                'C  Chest depth and upper onset are obscured.',
                'Lean, arm pose and perspective confound depth.']),
    dict(name='emilia_opening_reference.jpeg', title='03  OPENING CLOSE-UP', box=(0,0,495,232),
         A=[],
         B=[[('M',220,24),('C',230,50,230,70,218,93),('C',205,116,176,136,134,138),('C',147,168,144,204,111,228)],
            [('M',403,11),('C',395,44,407,78,429,102)]],
         C=[[(31,60),(107,50),(171,66),(213,96),(187,119),(137,133),(147,181),(126,214),(61,226),(7,218)],
            [(462,59),(487,51),(491,92),(456,96),(434,103),(416,72),(412,51)]],
         markers=[(314,63,'A',A),(180,126,'B',B),(67,135,'C',C)],
         notes=['A  Purple surface is visible; depth is unknown.',
                'B  Inner white edges define the opening.',
                'C  Body beneath the white cloth stays hidden.',
                'No independent outer body contour is exposed.']),
]

# Qualitative hand-drawn review proposals in a separate 2D diagram space.
# These are intentionally not copied from or fitted to source-image outlines.
FRONT_LEFT=[('M',108,72),('C',104,104,103,124,99,151),('C',94,179,103,203,113,230),('C',120,249,124,263,126,281)]
FRONT_RIGHT=[(p[0],*[432-v if i%2==0 else v for i,v in enumerate(p[1:])]) for p in FRONT_LEFT]
SIDE=[('M',253,63),('C',253,91,261,112,278,129),('C',291,142,306,155,309,177),('C',312,196,299,211,281,230),('C',265,247,254,260,253,281)]
OBLIQUE_FAR=[('M',147,72),('C',134,110,126,141,131,172),('C',133,205,148,248,156,281)]
OBLIQUE_NEAR=[('M',278,70),('C',285,101,313,127,328,156),('C',341,182,330,209,308,232),('C',289,248,279,263,276,281)]
GUIDES=[
    dict(title='FRONT  |  outer transition',paths=[FRONT_LEFT,FRONT_RIGHT],
         flows=[[('M',216,83),('C',214,122,219,162,216,207),('C',213,240,217,263,216,278)]],
         labels=[(23,109,'outer turn'),(280,239,'lower return')],
         notes=['Modest outer turn; tapered lower return.',
                'No cross-chest shelf or central depression.',
                'Front outline alone does not fix fullness.']),
    dict(title='3/4  |  continuous ribcage wrap',paths=[OBLIQUE_FAR,OBLIQUE_NEAR],
         flows=[[('M',231,70),('C',243,107,282,155,290,187),('C',297,214,255,258,252,278)],
                [('M',170,87),('C',184,119,201,160,208,198),('C',215,225,214,252,222,278)]],
         labels=[(270,185,'near turn'),(7,229,'far return')],
         notes=['One surface turns around the ribcage.',
                'Interior lines indicate flow, never grooves.',
                'No supplied true 3/4 art verifies this proposal.']),
    dict(title='SIDE  |  onset, projection, return',paths=[SIDE],flows=[],
         labels=[(82,84,'gentle onset'),(14,161,'projection region'),(90,240,'lower return')],
         notes=['Gradual onset, a bounded fullest region,',
                'then a longer smooth return to the ribcage.',
                'Depth remains tentative; running art is support.']),
]


def main():
    s=Sheet()
    s.text(60,48,'Emilia | reference analysis',52,INK,True)
    s.text(60,115,'Body restored to the preceding revision. Geometry work paused for guide review.',25,MUTED)
    for x,c,label in [(75,A,'A  Visible body / bodysuit'),(532,B,'B  White garment edges'),(971,C,'C  Hidden body'),(1292,G,'G  Proposed guides')]:
        s.marker(x,185,label[0],c); s.text(x+27,171,label,22,c,True)
    for i,e in enumerate(EVIDENCE):
        x,y=60+i*570,236; s.rect(x,y,540,695)
        s.text(x+20,y+20,e['title'],25,INK,True)
        offset,scale=s.artwork(e['name'],e['box'],x+20,y+68,500,438)
        for patch in e['C']: s.patch(patch,C,offset=offset,scale=scale)
        for classification,color in [('B',B),('A',A)]:
            for p in e[classification]: s.path(p,'#FFFFFF',6,offset,scale); s.path(p,color,3,offset,scale)
        for px,py,l,c in e['markers']: s.marker(offset[0]+scale*px,offset[1]+scale*py,l,c)
        s.lines(x+20,y+527,e['notes'],20,spacing=34)
    s.text(60,970,'Proposed guide curves | hypotheses for review',33,INK,True)
    s.lines(60,1020,['Dashed magenta is a proposal, not an observed body contour. Amber bands mark unresolved shape.',
                     'These diagrams have no physical scale. Anchor heights, widths and depths are not measurements.'],23,spacing=32)
    for i,g in enumerate(GUIDES):
        x,y=60+i*570,1107; s.rect(x,y,540,611)
        s.text(x+20,y+22,g['title'],22,INK,True)
        offset=(x+45,y+83); scale=1.02
        # Context strokes mark only the ends of the local patch, not edited shoulders/waist.
        if i==0:
            s.path([('M',108,72),('C',166,51,266,51,324,72)],LINE,3,offset,scale)
            s.path([('M',126,281),('C',178,294,254,294,306,281)],LINE,3,offset,scale)
        elif i==1:
            s.path([('M',147,72),('C',188,49,241,48,278,70)],LINE,3,offset,scale)
            s.path([('M',156,281),('C',206,295,248,293,276,281)],LINE,3,offset,scale)
        else:
            s.path([('M',130,64),('C',130,131,133,228,140,281)],LINE,3,offset,scale)
            s.path([('M',140,281),('C',176,290,226,290,253,281)],LINE,3,offset,scale)
        for p in g['paths']:
            s.path(p,C,19,offset,scale,opacity=.18)
            s.path(p,G,4,offset,scale,dashed=True)
        for p in g['flows']: s.path(p,G,2.5,offset,scale,dashed=True,opacity=.65)
        for px,py,label in g['labels']: s.text(offset[0]+px,offset[1]+py,label,17,MUTED)
        s.text(x+20,y+420,'Existing ribcage join: keep fixed during fitting.',19,MUTED)
        s.lines(x+20,y+461,g['notes'],20,spacing=33)
    s.text(60,1770,'The hidden chest remains an interpolation, not a claimed scan.',29,INK,True)
    s.lines(60,1820,['No model render was used to design these guides. No vertex was moved for this sheet.',
                     'Waist, abdomen, pelvis, hips, thighs, shoulders, arms and neck receive no new targets.',
                     'Next step is your review of the guides; body and garment fitting remain paused.'],23,spacing=33)
    s.finish()
    manifest={'status':'analysis_only_awaiting_user_review','not_anatomical_measurements':True,
              'body_rollback':'rollback.json','reference_annotations':EVIDENCE,
              'guide_proposals':GUIDES,'classification':{'A':'visible body/bodysuit information',
               'B':'white garment-produced boundaries','C':'body hidden by clothing','G':'unverified qualitative proposed curve'},
              'sources':[{ 'file':e['name'],'sha256':hashlib.sha256((SOURCES/e['name']).read_bytes()).hexdigest()} for e in EVIDENCE]}
    (OUT/'reference-analysis.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'sheet':str(OUT/'emilia-reference-analysis.png'),'size':[W,H],
                      'model_imported':False,'new_geometry':False}))


if __name__=='__main__': main()

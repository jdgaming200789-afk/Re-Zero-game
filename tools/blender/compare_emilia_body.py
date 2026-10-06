"""Place the supplied official art beside each unchanged body-review PNG.

This only composes review images. It never supplies geometry or design targets.
The running reference is posed and clothed; neither it nor the supplied front
art is an exact orthographic body drawing. No independent 3/4 art was supplied.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


VIEWS = ("front", "three_quarter", "side", "low_front", "full_front", "full_side")


def font(size):
    return ImageFont.truetype("DejaVuSans.ttf", size)


def fit(canvas, image, box):
    x, y, w, h = box
    scaled = ImageOps.contain(image, (w, h), Image.Resampling.LANCZOS)
    canvas.paste(scaled, (x + (w - scaled.width) // 2, y + (h - scaled.height) // 2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review", required=True)
    parser.add_argument("--references", required=True)
    parser.add_argument("--baseline", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    review, refs, baseline, out = map(Path, (args.review, args.references, args.baseline, args.out))
    out.mkdir(parents=True, exist_ok=True)
    front = Image.open(refs / "emilia_front_reference.jpeg").convert("RGB")
    side = Image.open(refs / "emilia_running_side_reference.jpg").convert("RGB")
    pairs = []
    for name in VIEWS:
        pair = Image.new("RGB", (1180, 850), (38, 43, 51))
        draw = ImageDraw.Draw(pair)
        draw.text((22, 15), "EMILIA | " + name.replace("_", " ").upper(), font=font(27), fill=(240, 242, 248))
        draw.text((620, 65), "BODY ONLY | ORTHOGRAPHIC", font=font(20), fill=(209, 215, 227))
        with Image.open(review / (name + ".png")) as image:
            pair.paste(image.convert("RGB"), (580, 105))
        if name == "three_quarter":
            draw.text((22, 65), "SUPPLIED FRONT + POSED SIDE ART", font=font(20), fill=(209, 215, 227))
            fit(pair, front.crop((160, 225, 395, 500)), (20, 105, 540, 335))
            fit(pair, side.crop((240, 480, 765, 1000)), (20, 455, 540, 335))
            note = "40-degree consistency test; no matching official 3/4 camera was supplied."
        elif name in ("side", "full_side"):
            draw.text((22, 65), "SUPPLIED RUNNING REFERENCE", font=font(20), fill=(209, 215, 227))
            fit(pair, side, (20, 105, 540, 670))
            note = "The art is posed and partly cloaked. Side depth is an approximate inference."
        else:
            draw.text((22, 65), "SUPPLIED NO-CLOAK FRONT ART", font=font(20), fill=(209, 215, 227))
            fit(pair, front, (20, 120, 540, 650))
            note = "Clothed outline guides the body; the hanging white hem is excluded."
            if name == "low_front":
                note = "No matching low-front art was supplied; this view checks surface curvature."
            if name == "full_front":
                note = "The reference ends at the upper thighs; retained legs remain visible for context."
        draw.text((22, 803), note, font=font(16), fill=(202, 208, 222))
        pair.save(out / (name + "-reference.jpg"), quality=94)
        pairs.append(pair)
    sheet = Image.new("RGB", (3540, 1700), (38, 43, 51))
    for i, pair in enumerate(pairs):
        sheet.paste(pair, (i % 3 * 1180, i // 3 * 850))
    sheet.save(out / "all-six-reference-comparisons.jpg", quality=94)
    # Exact camera pixels appear in both columns; baseline is historical
    # comparison evidence only, never a visual design reference.
    history = Image.new("RGB", (1200, 6 * 790), (38, 43, 51))
    draw = ImageDraw.Draw(history)
    for i, name in enumerate(VIEWS):
        y = i * 790
        draw.text((20, y + 12), name.replace("_", " ") + " | BEFORE", font=font(23), fill=(236, 239, 247))
        draw.text((620, y + 12), "CURRENT BODY CHECKPOINT", font=font(23), fill=(236, 239, 247))
        for x, path in ((0, baseline), (600, review)):
            with Image.open(path / (name + ".png")) as image:
                history.paste(image.convert("RGB"), (x, y + 50))
    history.save(out / "body-before-after.jpg", quality=94)


if __name__ == "__main__":
    main()

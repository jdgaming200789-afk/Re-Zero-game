#!/bin/bash
# Rebuild body-only Emilia, then profile + side/front sheets. Usage: iter.sh <tag>
set -e
cd "$(dirname "$0")/../.."
tag=${1:-iter}
EMILIA_BODY_ONLY=1 /home/ubuntu/bpyenv/bin/python tools/blender/build_characters.py emilia 2>&1 | grep -E "emilia:|Error|Traceback" || true
cp public/assets/models/characters/emilia.glb public/review/$tag.glb
/home/ubuntu/bpyenv/bin/python tools/review/profiles.py /home/ubuntu/prof_$tag.png public/review/base_body.glb public/review/$tag.glb >/dev/null 2>&1 || true
source ~/.nvm/nvm.sh
node tools/review/review.mjs /home/ubuntu/rv_${tag}_side.png "$tag side" /review/$tag.glb tools/review/side_views.json hide=hair,part_,clasp,bow arms=70
node tools/review/review.mjs /home/ubuntu/rv_${tag}_body.png "$tag body" /review/$tag.glb tools/review/body_views.json hide=hair,part_,clasp,bow

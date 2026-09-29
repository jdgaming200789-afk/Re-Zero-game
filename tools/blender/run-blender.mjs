// Runs the headless Blender asset builds.
//
//   node tools/blender/run-blender.mjs [kit|tower|textures|all]
//
// Blender is used as a Python module (`pip install bpy==4.2.0` into a
// Python 3.11 environment) or through a Blender binary. Set BLENDER_PYTHON
// to the interpreter that has `bpy`, or BLENDER to a blender executable.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const target = process.argv[2] ?? 'all';

const scripts = {
  textures: join(root, 'tools', 'textures', 'gen_textures.py'),
  kit: join(here, 'build_kit.py'),
  tower: join(here, 'build_tower.py'),
};
const order = target === 'all' ? ['textures', 'kit', 'tower'] : [target];

function runner(script) {
  const py = process.env.BLENDER_PYTHON;
  if (py) return [py, [script]];
  const blender = process.env.BLENDER ?? 'blender';
  return [blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script]];
}

for (const name of order) {
  const script = scripts[name];
  if (!script || !existsSync(script)) {
    console.error(`Unknown or missing build "${name}"`);
    process.exit(1);
  }
  // Texture generation only needs numpy + Pillow.
  const [cmd, args] = name === 'textures' ? [process.env.BLENDER_PYTHON ?? 'python3', [script]] : runner(script);
  console.log(`> ${name}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

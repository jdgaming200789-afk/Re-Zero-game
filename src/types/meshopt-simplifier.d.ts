declare module 'three/examples/jsm/libs/meshopt_simplifier.module.js' {
  type Flag = 'LockBorder' | 'Sparse' | 'ErrorAbsolute' | 'Prune' | 'Regularize' | 'Permissive';
  export const MeshoptSimplifier: {
    ready: Promise<void>;
    supported: boolean;
    simplify(
      indices: Uint32Array,
      positions: Float32Array,
      stride: number,
      targetIndexCount: number,
      targetError: number,
      flags?: Flag[],
    ): [Uint32Array, number];
    simplifyWithAttributes(
      indices: Uint32Array,
      positions: Float32Array,
      stride: number,
      attributes: Float32Array,
      attributeStride: number,
      weights: number[],
      lock: Uint8Array | null,
      targetIndexCount: number,
      targetError: number,
      flags?: Flag[],
    ): [Uint32Array, number];
  };
}

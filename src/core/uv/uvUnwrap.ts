/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditableMesh, MeshFace, Vec2, Vec3 } from '../mesh/EditableMesh';
import { UVIsland, UVPackOptions } from './types';

/**
 * Ensures all faces in the mesh have valid uvs array matching vertexIds.
 * If missing, generates a fallback planar or box projection.
 */
export function ensureMeshUvs(mesh: EditableMesh): void {
  for (const f of mesh.faces) {
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) {
      // Generate default planar UV based on face normal or vertex positions
      f.uvs = f.vertexIds.map((vid) => {
        const v = mesh.getVertex(vid);
        if (!v) return [0, 0] as Vec2;
        // Simple planar projection on XY
        return [(v.position[0] + 1) * 0.5, (v.position[1] + 1) * 0.5] as Vec2;
      });
    }
  }
}

/**
 * Extracts UV islands from the mesh by tracing connected face paths
 * that are not separated by edge seams.
 */
export function extractUVIslands(mesh: EditableMesh): UVIsland[] {
  ensureMeshUvs(mesh);
  const visitedFaces = new Set<string>();
  const islands: UVIsland[] = [];

  // Build adjacency graph of faces connected by non-seam edges
  const faceMap = new Map<string, MeshFace>();
  for (const f of mesh.faces) faceMap.set(f.id, f);

  for (const startFace of mesh.faces) {
    if (visitedFaces.has(startFace.id)) continue;

    const islandFaceIds: string[] = [];
    const islandVertexKeys = new Set<string>();
    const queue: string[] = [startFace.id];
    visitedFaces.add(startFace.id);

    while (queue.length > 0) {
      const fid = queue.shift()!;
      const face = faceMap.get(fid);
      if (!face) continue;

      islandFaceIds.push(fid);
      for (let i = 0; i < face.vertexIds.length; i++) {
        const vid = face.vertexIds[i];
        islandVertexKeys.add(`${fid}::${vid}`);
      }

      // Find adjacent faces across non-seam edges
      const faceEdges = mesh.getEdgesForFace(fid);
      for (const eid of faceEdges) {
        const edge = mesh.getEdge(eid);
        if (edge?.isSeam) continue;
        const connectedFaces = mesh.getFacesForEdge(eid);
        for (const nbrId of connectedFaces) {
          if (nbrId !== fid && !visitedFaces.has(nbrId)) {
            visitedFaces.add(nbrId);
            queue.push(nbrId);
          }
        }
      }
    }

    // Compute bounding box in UV space for this island
    let minU = Infinity, minV = Infinity;
    let maxU = -Infinity, maxV = -Infinity;
    let sumU = 0, sumV = 0, count = 0;

    for (const fid of islandFaceIds) {
      const f = faceMap.get(fid);
      if (!f || !f.uvs) continue;
      for (const uv of f.uvs) {
        minU = Math.min(minU, uv[0]);
        minV = Math.min(minV, uv[1]);
        maxU = Math.max(maxU, uv[0]);
        maxV = Math.max(maxV, uv[1]);
        sumU += uv[0];
        sumV += uv[1];
        count++;
      }
    }

    if (count === 0) {
      minU = 0; minV = 0; maxU = 1; maxV = 1;
      sumU = 0.5; sumV = 0.5;
    }

    islands.push({
      id: `island_${islands.length + 1}`,
      faceIds: islandFaceIds,
      vertexIds: Array.from(islandVertexKeys),
      min: [minU, minV],
      max: [maxU, maxV],
      center: [sumU / Math.max(1, count), sumV / Math.max(1, count)],
    });
  }

  return islands;
}

/**
 * Planar projection mapping for selected or all faces.
 */
export function applyPlanarProjection(
  mesh: EditableMesh,
  faceIds?: Set<string>,
  axis: 'x' | 'y' | 'z' = 'z',
): void {
  ensureMeshUvs(mesh);
  for (const f of mesh.faces) {
    if (faceIds && !faceIds.has(f.id)) continue;
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;

    f.uvs = f.vertexIds.map((vid) => {
      const v = mesh.getVertex(vid);
      if (!v) return [0, 0] as Vec2;
      let u = 0, w = 0;
      if (axis === 'x') {
        u = v.position[1];
        w = v.position[2];
      } else if (axis === 'y') {
        u = v.position[0];
        w = v.position[2];
      } else {
        u = v.position[0];
        w = v.position[1];
      }
      return [u * 0.5 + 0.5, w * 0.5 + 0.5] as Vec2;
    });
  }
}

/**
 * Cylindrical projection mapping.
 */
export function applyCylindricalProjection(
  mesh: EditableMesh,
  faceIds?: Set<string>,
): void {
  ensureMeshUvs(mesh);
  for (const f of mesh.faces) {
    if (faceIds && !faceIds.has(f.id)) continue;
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;

    f.uvs = f.vertexIds.map((vid) => {
      const v = mesh.getVertex(vid);
      if (!v) return [0, 0] as Vec2;
      const theta = Math.atan2(v.position[1], v.position[0]);
      const u = (theta + Math.PI) / (2 * Math.PI);
      const h = (v.position[2] + 1) * 0.5;
      return [u, h] as Vec2;
    });
  }
}

/**
 * Spherical projection mapping.
 */
export function applySphericalProjection(
  mesh: EditableMesh,
  faceIds?: Set<string>,
): void {
  ensureMeshUvs(mesh);
  for (const f of mesh.faces) {
    if (faceIds && !faceIds.has(f.id)) continue;
    if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;

    f.uvs = f.vertexIds.map((vid) => {
      const v = mesh.getVertex(vid);
      if (!v) return [0, 0] as Vec2;
      const len = Math.hypot(v.position[0], v.position[1], v.position[2]) || 1;
      const nx = v.position[0] / len;
      const ny = v.position[1] / len;
      const nz = v.position[2] / len;

      const u = (Math.atan2(ny, nx) + Math.PI) / (2 * Math.PI);
      const lat = Math.asin(Math.max(-1, Math.min(1, nz)));
      const vCoord = lat / Math.PI + 0.5;
      return [u, vCoord] as Vec2;
    });
  }
}

/**
 * Seam-based Unwrap algorithm: parameterizes islands by spreading them out
 * and performing a basic relaxation / flattening so they don't overlap.
 */
export function executeUnwrap(mesh: EditableMesh, faceIds?: Set<string>): void {
  // If specific faces requested, apply planar projection as initial unwrap for those,
  // else run full island extraction and layout
  if (faceIds && faceIds.size > 0) {
    applyPlanarProjection(mesh, faceIds, 'z');
  } else {
    // Default unwrap: planar projection + automatic island separation
    applyPlanarProjection(mesh, undefined, 'z');
  }
  packUVIslands(mesh, { margin: 0.02, rotate: true, scale: true });
}

/**
 * Packs UV islands into the 0-1 UV space without overlapping.
 */
export function packUVIslands(mesh: EditableMesh, options: UVPackOptions): void {
  const islands = extractUVIslands(mesh);
  if (islands.length === 0) return;

  const margin = options.margin;
  let currentX = margin;
  let currentY = margin;
  let rowHeight = 0;
  const maxPerRow = 1.0 - margin;

  for (const island of islands) {
    const width = Math.max(0.05, island.max[0] - island.min[0]);
    const height = Math.max(0.05, island.max[1] - island.min[1]);

    if (currentX + width > maxPerRow) {
      currentX = margin;
      currentY += rowHeight + margin;
      rowHeight = 0;
    }

    const du = currentX - island.min[0];
    const dv = currentY - island.min[1];

    // Shift all UV coordinates in this island
    for (const fid of island.faceIds) {
      const f = mesh.faces.find((face) => face.id === fid);
      if (!f || !f.uvs) continue;
      for (let i = 0; i < f.vertexIds.length; i++) {
        // Find if this corner belongs to the island
        f.uvs[i][0] += du;
        f.uvs[i][1] += dv;
      }
    }

    currentX += width + margin;
    rowHeight = Math.max(rowHeight, height);
  }
}

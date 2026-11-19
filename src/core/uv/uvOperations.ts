/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EditableMesh, Vec2 } from '../mesh/EditableMesh';
import { UVSelectionState } from './types';

export function translateUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  dx: number,
  dy: number,
): void {
  for (const f of mesh.faces) {
    if (!f.uvs) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      const vid = f.vertexIds[i];
      const key = `${f.id}::${vid}`;
      const isSelected =
        (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
        (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
      if (isSelected) {
        f.uvs[i][0] += dx;
        f.uvs[i][1] += dy;
      }
    }
  }
}

export function rotateUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  angleRad: number,
  pivot: Vec2,
): void {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  for (const f of mesh.faces) {
    if (!f.uvs) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      const vid = f.vertexIds[i];
      const key = `${f.id}::${vid}`;
      const isSelected =
        (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
        (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
      if (isSelected) {
        const u = f.uvs[i][0] - pivot[0];
        const v = f.uvs[i][1] - pivot[1];
        f.uvs[i][0] = pivot[0] + (u * cos - v * sin);
        f.uvs[i][1] = pivot[1] + (u * sin + v * cos);
      }
    }
  }
}

export function scaleUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  sx: number,
  sy: number,
  pivot: Vec2,
): void {
  for (const f of mesh.faces) {
    if (!f.uvs) continue;
    for (let i = 0; i < f.vertexIds.length; i++) {
      const vid = f.vertexIds[i];
      const key = `${f.id}::${vid}`;
      const isSelected =
        (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
        (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
      if (isSelected) {
        f.uvs[i][0] = pivot[0] + (f.uvs[i][0] - pivot[0]) * sx;
        f.uvs[i][1] = pivot[1] + (f.uvs[i][1] - pivot[1]) * sy;
      }
    }
  }
}

export function mirrorUVSelection(
  mesh: EditableMesh,
  selection: UVSelectionState,
  horizontal: boolean,
  vertical: boolean,
  pivot: Vec2,
): void {
  const sx = horizontal ? -1 : 1;
  const sy = vertical ? -1 : 1;
  scaleUVSelection(mesh, selection, sx, sy, pivot);
}

/**
 * Generates a procedural checkerboard data URL for UV checker verification.
 */
export function generateCheckerTextureUrl(): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const size = 64;
  for (let y = 0; y < canvas.height; y += size) {
    for (let x = 0; x < canvas.width; x += size) {
      const isDark = (x / size + y / size) % 2 === 0;
      ctx.fillStyle = isDark ? '#2c313b' : '#5ecd6e';
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = '#181a1f';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, size, size);
    }
  }

  // Add numbers / grid guides
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('0,0', 8, 20);
  ctx.fillText('1,0', 470, 20);
  ctx.fillText('0,1', 8, 500);
  ctx.fillText('1,1', 470, 500);

  return canvas.toDataURL('image/png');
}

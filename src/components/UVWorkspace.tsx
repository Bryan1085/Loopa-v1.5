/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EditableMesh } from '../core/mesh/EditableMesh';
import { UVDisplayMode, UVSelectionState, UVSelectMode } from '../core/uv/types';
import { executeUnwrap, packUVIslands, applyPlanarProjection, applyCylindricalProjection, applySphericalProjection } from '../core/uv/uvUnwrap';
import { UVEditorCanvas } from './UVEditorCanvas';
import { UVToolToolbar } from './UVToolToolbar';

interface UVWorkspaceProps {
  mesh: EditableMesh | null;
  onUpdateMesh: (nextMesh: EditableMesh) => void;
  onCommitMesh?: (beforeMesh: EditableMesh, afterMesh: EditableMesh) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onReturnToModeler: () => void;
}

export const UVWorkspace: React.FC<UVWorkspaceProps> = ({
  mesh,
  onUpdateMesh,
  onCommitMesh,
  onUndo,
  onRedo,
  onReturnToModeler,
}) => {
  const [selection, setSelection] = useState<UVSelectionState>({
    mode: 'face',
    selectedVertexKeys: new Set(),
    selectedEdgeKeys: new Set(),
    selectedFaceIds: new Set(),
    selectedIslandIds: new Set(),
    pinnedVertexKeys: new Set(),
  });
  const [displayMode, setDisplayMode] = useState<UVDisplayMode>('standard');
  const [showChecker, setShowChecker] = useState(false);

  const handleUnwrap = (type: string) => {
    if (!mesh) return;
    const before = mesh.clone();
    const cloned = mesh.clone();
    if (type === 'unwrap' || type === 'view') {
      executeUnwrap(cloned);
    } else if (type === 'planar') {
      applyPlanarProjection(cloned, undefined, 'z');
    } else if (type === 'cylindrical') {
      applyCylindricalProjection(cloned);
    } else if (type === 'spherical') {
      applySphericalProjection(cloned);
    }
    onCommitMesh?.(before, cloned);
  };

  const handlePack = () => {
    if (!mesh) return;
    const before = mesh.clone();
    const cloned = mesh.clone();
    packUVIslands(cloned, { margin: 0.02, rotate: true, scale: true });
    onCommitMesh?.(before, cloned);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#18191c] text-[#e4e6eb] overflow-hidden">
      {/* Top UV Tool Bar */}
      <UVToolToolbar
        onUnwrap={handleUnwrap}
        onPackIslands={handlePack}
        onToggleChecker={() => setShowChecker((prev) => !prev)}
        showChecker={showChecker}
      />

      {/* Split view: Left instructions/status or secondary view, Right UV Editor */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="w-80 bg-[#16181d] border-r border-[#2b2e36] p-4 flex flex-col gap-4 overflow-y-auto cad-scroll">
          <div>
            <div className="text-xs font-semibold text-[#5ecd6e] uppercase tracking-wider mb-1">
              Espacio de Trabajo UV 2D
            </div>
            <div className="text-xs text-[#9ca3af] leading-relaxed">
              Edita y organiza las coordenadas UV del modelo con gestos táctiles y gizmo 2D profesional.
            </div>
          </div>

          <div className="h-px bg-[#2b2e36]" />

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#eceef2]">
              Operaciones Rápidas
            </div>
            <button
              type="button"
              onClick={() => handleUnwrap('unwrap')}
              className="w-full h-9 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center justify-center gap-2 transition-colors"
            >
              Desenvolver Malla (Unwrap)
            </button>
            <button
              type="button"
              onClick={handlePack}
              className="w-full h-9 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center justify-center gap-2 transition-colors"
            >
              Empaquetar Islas (Pack)
            </button>
          </div>

          <div className="h-px bg-[#2b2e36]" />

          <button
            type="button"
            onClick={onReturnToModeler}
            className="w-full h-10 rounded-lg bg-[#5ecd6e] hover:bg-[#4dbb5e] text-xs font-semibold text-[#121418] flex items-center justify-center gap-2 transition-colors mt-auto"
          >
            Volver al Modelador 3D
          </button>
        </div>

        {/* Main UV Canvas */}
        <UVEditorCanvas
          mesh={mesh}
          selection={selection}
          displayMode={displayMode}
          showChecker={showChecker}
          onUpdateMesh={onUpdateMesh}
          onCommitMesh={onCommitMesh}
          onUndo={onUndo}
          onRedo={onRedo}
          onSelectModeChange={(mode) => setSelection((s) => ({ ...s, mode }))}
          onSelectionChange={setSelection}
        />
      </div>
    </div>
  );
};

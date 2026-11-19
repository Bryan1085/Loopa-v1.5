/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Box,
  CheckSquare,
  Compass,
  Grid,
  Maximize2,
  Move,
  RotateCw,
  Scissors,
  Sparkles,
  Layers,
} from 'lucide-react';
import { UVProjectionType } from '../core/uv/types';

interface UVToolToolbarProps {
  onUnwrap: (type: UVProjectionType) => void;
  onPackIslands: () => void;
  onToggleChecker: () => void;
  showChecker: boolean;
}

export const UVToolToolbar: React.FC<UVToolToolbarProps> = ({
  onUnwrap,
  onPackIslands,
  onToggleChecker,
  showChecker,
}) => {
  return (
    <div className="h-12 bg-[#181a1f] border-b border-[#2b2e36] px-3 flex items-center justify-between gap-2 z-20">
      <div className="flex items-center gap-1.5 overflow-x-auto cad-scroll">
        <button
          type="button"
          onClick={() => onUnwrap('unwrap')}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-semibold text-[#5ecd6e] flex items-center gap-1.5 whitespace-nowrap"
          title="Desarrollar malla (Unwrap basado en costuras)"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Unwrap</span>
        </button>

        <div className="h-5 w-px bg-[#2b2e36]" />

        <button
          type="button"
          onClick={() => onUnwrap('planar')}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap"
          title="Proyección Plana"
        >
          <Box className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Plana</span>
        </button>

        <button
          type="button"
          onClick={() => onUnwrap('cylindrical')}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap"
          title="Proyección Cilíndrica"
        >
          <Compass className="w-3.5 h-3.5 text-[#34d399]" />
          <span>Cilíndrica</span>
        </button>

        <button
          type="button"
          onClick={() => onUnwrap('spherical')}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-medium text-[#e4e6eb] flex items-center gap-1.5 whitespace-nowrap"
          title="Proyección Esférica"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span>Esférica</span>
        </button>

        <div className="h-5 w-px bg-[#2b2e36]" />

        <button
          type="button"
          onClick={onPackIslands}
          className="h-8 px-2.5 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-semibold text-[#f3f4f6] flex items-center gap-1.5 whitespace-nowrap"
          title="Organizar y empaquetar islas UV (Pack Islands)"
        >
          <Layers className="w-3.5 h-3.5 text-[#f59e0b]" />
          <span>Pack Islands</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleChecker}
          className={`h-8 px-3 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            showChecker
              ? 'bg-[#16261a] border border-[#5ecd6e] text-[#5ecd6e]'
              : 'bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-[#9ca3af]'
          }`}
          title="Activar textura de comprobación Checker"
        >
          <Grid className="w-3.5 h-3.5" />
          <span>Checker</span>
        </button>
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EditableMesh, Vec2 } from '../core/mesh/EditableMesh';
import { UVDisplayMode, UVSelectionState, UVSelectMode, UVTransformTool } from '../core/uv/types';
import { extractUVIslands } from '../core/uv/uvUnwrap';
import { Maximize, ZoomIn, ZoomOut, RefreshCw, Grid, Move, RotateCw, Maximize2, Undo2, Redo2 } from 'lucide-react';

interface UVEditorCanvasProps {
  mesh: EditableMesh | null;
  selection: UVSelectionState;
  displayMode: UVDisplayMode;
  showChecker: boolean;
  onUpdateMesh: (nextMesh: EditableMesh) => void;
  onCommitMesh?: (beforeMesh: EditableMesh, afterMesh: EditableMesh) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectModeChange: (mode: UVSelectMode) => void;
  onSelectionChange: (nextSelection: UVSelectionState) => void;
}

export const UVEditorCanvas: React.FC<UVEditorCanvasProps> = ({
  mesh,
  selection,
  displayMode,
  showChecker,
  onUpdateMesh,
  onCommitMesh,
  onUndo,
  onRedo,
  onSelectModeChange,
  onSelectionChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(380);
  const [pan, setPan] = useState<Vec2>([150, 150]);
  const [transformTool, setTransformTool] = useState<UVTransformTool>('move');
  const [spacePressed, setSpacePressed] = useState(false);

  // Interaction refs
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const dragStartScreenRef = useRef<Vec2>([0, 0]);
  const beforeMeshRef = useRef<EditableMesh | null>(null);
  const activeGizmoHandleRef = useRef<string | null>(null);
  const selectionCenterRef = useRef<Vec2>([0, 0]);
  const initialSelectedUVsRef = useRef<Map<string, { u: number; v: number }>>(new Map());

  // Touch gesture & smart multi-touch tracking
  const touchMapRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const gestureStateRef = useRef<{
    type: 'none' | 'pan' | 'zoom' | 'transform' | 'tap_candidate';
    startTime: number;
    startDist: number;
    startMid: Vec2;
    maxTouchCount: number;
    totalMovement: number;
  }>({
    type: 'none',
    startTime: 0,
    startDist: 0,
    startMid: [0, 0],
    maxTouchCount: 0,
    totalMovement: 0,
  });

  // Convert canvas pixel to UV coordinate (0-1 range)
  const canvasToUV = useCallback(
    (px: number, py: number): Vec2 => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      const x = px - rect.left;
      const y = py - rect.top;
      const cssHeight = canvas.clientHeight;
      const u = (x - pan[0]) / zoom;
      const v = (cssHeight - y - pan[1]) / zoom;
      return [u, v];
    },
    [pan, zoom],
  );

  // UV to Screen conversion
  const uvToScreen = useCallback(
    (u: number, v: number): Vec2 => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const cssHeight = canvas.clientHeight;
      const sx = pan[0] + u * zoom;
      const sy = cssHeight - (pan[1] + v * zoom);
      return [sx, sy];
    },
    [pan, zoom],
  );

  // Calculate selection center and bounding box in UV space
  const getSelectionCenter = useCallback((): Vec2 => {
    if (!mesh) return [0.5, 0.5];
    let sumU = 0;
    let sumV = 0;
    let count = 0;

    for (const f of mesh.faces) {
      if (!f.uvs) continue;
      for (let i = 0; i < f.vertexIds.length; i++) {
        const vid = f.vertexIds[i];
        const key = `${f.id}::${vid}`;
        const isSelected =
          (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
          (selection.mode === 'edge' && selection.selectedEdgeKeys.has(`${f.id}::${f.vertexIds[i]}-${f.vertexIds[(i + 1) % f.vertexIds.length]}`)) ||
          (selection.mode === 'face' && selection.selectedFaceIds.has(f.id)) ||
          (selection.mode === 'island' && selection.selectedIslandIds.has(f.id));

        if (isSelected) {
          sumU += f.uvs[i][0];
          sumV += f.uvs[i][1];
          count++;
        }
      }
    }

    if (count === 0) return [0.5, 0.5];
    return [sumU / count, sumV / count];
  }, [mesh, selection]);

  // Framing functions
  const handleFit01 = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 600;
    const targetZoom = Math.min(w, h) * 0.75;
    const px = (w - targetZoom) / 2;
    const py = (h - targetZoom) / 2;
    setZoom(targetZoom);
    setPan([px, py]);
  }, []);

  const handleFrameAll = useCallback(() => {
    if (!mesh || mesh.faces.length === 0) {
      handleFit01();
      return;
    }
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (const f of mesh.faces) {
      if (!f.uvs) continue;
      for (const uv of f.uvs) {
        minU = Math.min(minU, uv[0]);
        minV = Math.min(minV, uv[1]);
        maxU = Math.max(maxU, uv[0]);
        maxV = Math.max(maxV, uv[1]);
      }
    }
    if (!Number.isFinite(minU)) {
      handleFit01();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 600;

    const spanU = Math.max(0.2, maxU - minU);
    const spanV = Math.max(0.2, maxV - minV);
    const targetZoom = Math.min(w / spanU, h / spanV) * 0.8;
    const px = w / 2 - ((minU + maxU) / 2) * targetZoom;
    const py = h / 2 - ((minV + maxV) / 2) * targetZoom;
    setZoom(targetZoom);
    setPan([px, py]);
  }, [mesh, handleFit01]);

  const handleResetView = useCallback(() => {
    setZoom(380);
    setPan([150, 150]);
  }, []);

  // Keyboard listeners for Space pan and Undo/Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePressed) {
        setSpacePressed(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo?.();
        } else {
          onUndo?.();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [spacePressed, onUndo, onRedo]);

  // Initial fit on mount
  useEffect(() => {
    handleFit01();
  }, [handleFit01]);

  // Hit test gizmo handles
  const hitTestGizmo = useCallback(
    (clientX: number, clientY: number): string | null => {
      if (!mesh) return null;
      const center = getSelectionCenter();
      const [cx, cy] = uvToScreen(center[0], center[1]);
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);

      // Center box (Free Move)
      if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return 'move_free';
      // X axis handle (Right arrow)
      if (dx > 20 && dx < 70 && Math.abs(dy) < 12) return 'move_x';
      // Y axis handle (Up arrow)
      if (dy < -20 && dy > -70 && Math.abs(dx) < 12) return 'move_y';
      // Rotate handle (top-right circle ring)
      if (dist > 45 && dist < 65 && dx > 0 && dy < 0) return 'rotate';
      // Scale uniform handle (corner box at ~45 deg)
      if (dist > 70 && dist < 90) return 'scale_uniform';

      return null;
    },
    [mesh, getSelectionCenter, uvToScreen],
  );

  // Render UV editor canvas & gizmo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 600;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#14161b';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(pan[0], pan[1]);
    ctx.scale(zoom, zoom);
    // Invert Y for standard UV coordinate system (0,0 at bottom-left)
    ctx.transform(1, 0, 0, -1, 0, height / zoom);

    // 1. Draw 0-1 UV texture space background
    ctx.fillStyle = showChecker ? '#1a1d24' : '#181a1f';
    ctx.fillRect(-10, -10, 20, 20);

    ctx.fillStyle = '#14161b';
    ctx.fillRect(0, 0, 1, 1);

    // Grid lines in 0-1 space
    ctx.strokeStyle = '#272b35';
    ctx.lineWidth = 1 / zoom;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ctx.beginPath();
      ctx.moveTo(t, 0);
      ctx.lineTo(t, 1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, t);
      ctx.lineTo(1, t);
      ctx.stroke();
    }

    // Border of 0-1 UV space
    ctx.strokeStyle = '#5ecd6e';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, 1, 1);

    if (mesh) {
      // Draw UV faces/islands
      for (const f of mesh.faces) {
        if (!f.uvs || f.uvs.length !== f.vertexIds.length) continue;
        const isFaceSelected = selection.selectedFaceIds.has(f.id);

        ctx.beginPath();
        for (let i = 0; i < f.uvs.length; i++) {
          const uv = f.uvs[i];
          if (i === 0) ctx.moveTo(uv[0], uv[1]);
          else ctx.lineTo(uv[0], uv[1]);
        }
        ctx.closePath();

        ctx.fillStyle = isFaceSelected ? 'rgba(94, 205, 110, 0.35)' : 'rgba(44, 49, 59, 0.55)';
        ctx.fill();

        ctx.strokeStyle = isFaceSelected ? '#5ecd6e' : '#3d4452';
        ctx.lineWidth = 1.2 / zoom;
        ctx.stroke();

        // Draw vertices / corners
        for (let i = 0; i < f.uvs.length; i++) {
          const uv = f.uvs[i];
          const vid = f.vertexIds[i];
          const key = `${f.id}::${vid}`;
          const isVertexSelected = selection.selectedVertexKeys.has(key);

          ctx.beginPath();
          ctx.arc(uv[0], uv[1], isVertexSelected ? 6 / zoom : 3.5 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = isVertexSelected ? '#5ecd6e' : '#9ca3af';
          ctx.fill();
          ctx.strokeStyle = '#121418';
          ctx.lineWidth = 1 / zoom;
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // Render 2D Gizmo Overlay if there is a selection
    const hasSelection =
      selection.selectedVertexKeys.size > 0 ||
      selection.selectedFaceIds.size > 0 ||
      selection.selectedEdgeKeys.size > 0;

    if (hasSelection && mesh) {
      const center = getSelectionCenter();
      selectionCenterRef.current = center;
      const [cx, cy] = uvToScreen(center[0], center[1]);

      ctx.save();
      // Gizmo center point
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (transformTool === 'move') {
        // X Arrow (Right)
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 50, cy);
        ctx.stroke();

        // Y Arrow (Up in screen coords since Y is inverted or down)
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 50);
        ctx.stroke();
      } else if (transformTool === 'rotate') {
        // Rotation Circle Arc
        ctx.strokeStyle = '#5ecd6e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 45, 0, Math.PI * 1.5);
        ctx.stroke();
      } else if (transformTool === 'scale') {
        // Scale handles
        ctx.fillStyle = '#a78bfa';
        ctx.fillRect(cx + 35 - 5, cy - 5, 10, 10);
        ctx.fillRect(cx - 5, cy - 35 - 5, 10, 10);
        ctx.fillRect(cx + 35 - 5, cy - 35 - 5, 10, 10);
      }
      ctx.restore();
    }
  }, [mesh, selection, zoom, pan, showChecker, transformTool, getSelectionCenter, uvToScreen]);

  // Handle selection hit testing on click
  const handleCanvasClick = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!mesh) return;
    const [u, v] = canvasToUV(clientX, clientY);

    if (selection.mode === 'vertex') {
      // Find closest vertex corner
      let closestKey: string | null = null;
      let minDist = 15 / zoom; // screen threshold converted to UV space roughly

      for (const f of mesh.faces) {
        if (!f.uvs) continue;
        for (let i = 0; i < f.uvs.length; i++) {
          const uv = f.uvs[i];
          const dist = Math.hypot(uv[0] - u, uv[1] - v);
          if (dist < minDist) {
            minDist = dist;
            closestKey = `${f.id}::${f.vertexIds[i]}`;
          }
        }
      }

      const nextVertices = new Set(shiftKey ? selection.selectedVertexKeys : []);
      if (closestKey) {
        if (nextVertices.has(closestKey)) nextVertices.delete(closestKey);
        else nextVertices.add(closestKey);
      }
      onSelectionChange({ ...selection, selectedVertexKeys: nextVertices });
    } else if (selection.mode === 'face') {
      // Find face containing click point
      let clickedFaceId: string | null = null;
      for (const f of mesh.faces) {
        if (!f.uvs) continue;
        // Simple bounding box or point-in-polygon check
        let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
        for (const uv of f.uvs) {
          minU = Math.min(minU, uv[0]);
          minV = Math.min(minV, uv[1]);
          maxU = Math.max(maxU, uv[0]);
          maxV = Math.max(maxV, uv[1]);
        }
        if (u >= minU && u <= maxU && v >= minV && v <= maxV) {
          clickedFaceId = f.id;
          break;
        }
      }

      const nextFaces = new Set(shiftKey ? selection.selectedFaceIds : []);
      if (clickedFaceId) {
        if (nextFaces.has(clickedFaceId)) nextFaces.delete(clickedFaceId);
        else nextFaces.add(clickedFaceId);
      }
      onSelectionChange({ ...selection, selectedFaceIds: nextFaces });
    } else if (selection.mode === 'island') {
      const islands = extractUVIslands(mesh);
      let clickedIslandId: string | null = null;
      for (const island of islands) {
        if (u >= island.min[0] && u <= island.max[0] && v >= island.min[1] && v <= island.max[1]) {
          clickedIslandId = island.id;
          break;
        }
      }
      const nextIslands = new Set(shiftKey ? selection.selectedIslandIds : []);
      if (clickedIslandId) {
        if (nextIslands.has(clickedIslandId)) nextIslands.delete(clickedIslandId);
        else nextIslands.add(clickedIslandId);
      }
      onSelectionChange({ ...selection, selectedIslandIds: nextIslands });
    }
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || e.button === 2 || spacePressed || e.shiftKey) {
      isPanningRef.current = true;
      dragStartScreenRef.current = [e.clientX, e.clientY];
      return;
    }

    if (e.button === 0 && mesh) {
      // Check if clicking gizmo handle
      const gizmoHit = hitTestGizmo(e.clientX, e.clientY);
      if (gizmoHit) {
        activeGizmoHandleRef.current = gizmoHit;
        isDraggingRef.current = true;
        dragStartScreenRef.current = [e.clientX, e.clientY];
        beforeMeshRef.current = mesh.clone();
        return;
      }

      // Otherwise click selection
      handleCanvasClick(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
      // Also prepare for potential dragging selected elements
      isDraggingRef.current = true;
      dragStartScreenRef.current = [e.clientX, e.clientY];
      beforeMeshRef.current = mesh.clone();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      const dx = e.clientX - dragStartScreenRef.current[0];
      const dy = e.clientY - dragStartScreenRef.current[1];
      setPan((p) => [p[0] + dx, p[1] + dy]);
      dragStartScreenRef.current = [e.clientX, e.clientY];
      return;
    }

    if (isDraggingRef.current && mesh && beforeMeshRef.current) {
      const dxScreen = e.clientX - dragStartScreenRef.current[0];
      const dyScreen = e.clientY - dragStartScreenRef.current[1];
      dragStartScreenRef.current = [e.clientX, e.clientY];

      const du = dxScreen / zoom;
      const dv = -dyScreen / zoom; // Invert for UV space

      const cloned = beforeMeshRef.current.clone();
      const handle = activeGizmoHandleRef.current;

      if (handle === 'move_x') {
        for (const f of cloned.faces) {
          if (!f.uvs) continue;
          for (let i = 0; i < f.vertexIds.length; i++) {
            const vid = f.vertexIds[i];
            const key = `${f.id}::${vid}`;
            const isSelected =
              (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
              (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
            if (isSelected) f.uvs[i][0] += du;
          }
        }
      } else if (handle === 'move_y') {
        for (const f of cloned.faces) {
          if (!f.uvs) continue;
          for (let i = 0; i < f.vertexIds.length; i++) {
            const vid = f.vertexIds[i];
            const key = `${f.id}::${vid}`;
            const isSelected =
              (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
              (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
            if (isSelected) f.uvs[i][1] += dv;
          }
        }
      } else if (handle === 'rotate') {
        const center = selectionCenterRef.current;
        const angle = dxScreen * 0.01;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (const f of cloned.faces) {
          if (!f.uvs) continue;
          for (let i = 0; i < f.vertexIds.length; i++) {
            const vid = f.vertexIds[i];
            const key = `${f.id}::${vid}`;
            const isSelected =
              (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
              (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
            if (isSelected) {
              const u = f.uvs[i][0] - center[0];
              const v = f.uvs[i][1] - center[1];
              f.uvs[i][0] = center[0] + (u * cos - v * sin);
              f.uvs[i][1] = center[1] + (u * sin + v * cos);
            }
          }
        }
      } else {
        // Free move or standard drag
        for (const f of cloned.faces) {
          if (!f.uvs) continue;
          for (let i = 0; i < f.vertexIds.length; i++) {
            const vid = f.vertexIds[i];
            const key = `${f.id}::${vid}`;
            const isSelected =
              (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
              (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
            if (isSelected) {
              f.uvs[i][0] += du;
              f.uvs[i][1] += dv;
            }
          }
        }
      }

      onUpdateMesh(cloned);
    }
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current && beforeMeshRef.current && mesh) {
      onCommitMesh?.(beforeMeshRef.current, mesh);
    }
    isPanningRef.current = false;
    isDraggingRef.current = false;
    activeGizmoHandleRef.current = null;
    beforeMeshRef.current = null;
  };

  // Touch Gesture Handlers (1 finger drag/select, 2 fingers pan/pinch/undo, 3 fingers redo)
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const now = Date.now();
    touchMapRef.current.clear();
    for (let i = 0; i < e.touches.length; i++) {
      touchMapRef.current.set(e.touches[i].identifier, {
        clientX: e.touches[i].clientX,
        clientY: e.touches[i].clientY,
      });
    }

    const touchCount = e.touches.length;
    gestureStateRef.current.maxTouchCount = Math.max(gestureStateRef.current.maxTouchCount, touchCount);

    if (touchCount === 1) {
      const t = e.touches[0];
      const gizmoHit = hitTestGizmo(t.clientX, t.clientY);
      if (gizmoHit && mesh) {
        activeGizmoHandleRef.current = gizmoHit;
        isDraggingRef.current = true;
        dragStartScreenRef.current = [t.clientX, t.clientY];
        beforeMeshRef.current = mesh.clone();
      } else {
        handleCanvasClick(t.clientX, t.clientY, false);
        isDraggingRef.current = true;
        dragStartScreenRef.current = [t.clientX, t.clientY];
        if (mesh) beforeMeshRef.current = mesh.clone();
      }
      gestureStateRef.current = {
        type: 'transform',
        startTime: now,
        startDist: 0,
        startMid: [t.clientX, t.clientY],
        maxTouchCount: 1,
        totalMovement: 0,
      };
    } else if (touchCount === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const mid: Vec2 = [(t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2];

      gestureStateRef.current = {
        type: 'tap_candidate',
        startTime: now,
        startDist: dist,
        startMid: mid,
        maxTouchCount: 2,
        totalMovement: 0,
      };
    } else if (touchCount === 3) {
      gestureStateRef.current = {
        type: 'tap_candidate',
        startTime: now,
        startDist: 0,
        startMid: [0, 0],
        maxTouchCount: 3,
        totalMovement: 0,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const now = Date.now();
    for (let i = 0; i < e.touches.length; i++) {
      touchMapRef.current.set(e.touches[i].identifier, {
        clientX: e.touches[i].clientX,
        clientY: e.touches[i].clientY,
      });
    }

    const touchCount = e.touches.length;
    gestureStateRef.current.maxTouchCount = Math.max(gestureStateRef.current.maxTouchCount, touchCount);

    if (touchCount === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const mid: Vec2 = [(t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2];

      const state = gestureStateRef.current;
      const moveDelta = Math.hypot(mid[0] - state.startMid[0], mid[1] - state.startMid[1]);
      state.totalMovement += moveDelta;

      if (state.totalMovement > 10) {
        // Differentiate pinch zoom vs pan
        const distDelta = Math.abs(dist - state.startDist);
        if (distDelta > 8) {
          // Pinch Zoom
          state.type = 'zoom';
          const factor = dist / state.startDist;
          state.startDist = dist;
          setZoom((z) => Math.max(80, Math.min(4000, z * factor)));
        } else {
          // Pan
          state.type = 'pan';
          const dx = mid[0] - state.startMid[0];
          const dy = mid[1] - state.startMid[1];
          setPan((p) => [p[0] + dx, p[1] + dy]);
          state.startMid = mid;
        }
      }
    } else if (touchCount === 1 && isDraggingRef.current && mesh && beforeMeshRef.current) {
      const t = e.touches[0];
      const dxScreen = t.clientX - dragStartScreenRef.current[0];
      const dyScreen = t.clientY - dragStartScreenRef.current[1];
      dragStartScreenRef.current = [t.clientX, t.clientY];

      gestureStateRef.current.totalMovement += Math.hypot(dxScreen, dyScreen);

      const du = dxScreen / zoom;
      const dv = -dyScreen / zoom;

      const cloned = beforeMeshRef.current.clone();
      for (const f of cloned.faces) {
        if (!f.uvs) continue;
        for (let i = 0; i < f.vertexIds.length; i++) {
          const vid = f.vertexIds[i];
          const key = `${f.id}::${vid}`;
          const isSelected =
            (selection.mode === 'vertex' && selection.selectedVertexKeys.has(key)) ||
            (selection.mode === 'face' && selection.selectedFaceIds.has(f.id));
          if (isSelected) {
            f.uvs[i][0] += du;
            f.uvs[i][1] += dv;
          }
        }
      }
      onUpdateMesh(cloned);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const state = gestureStateRef.current;
    const duration = Date.now() - state.startTime;

    if (e.touches.length === 0) {
      if (state.maxTouchCount === 2 && state.totalMovement < 12 && duration < 500) {
        // Two finger tap -> Undo
        onUndo?.();
      } else if (state.maxTouchCount === 3 && state.totalMovement < 12 && duration < 500) {
        // Three finger tap -> Redo
        onRedo?.();
      } else if (isDraggingRef.current && beforeMeshRef.current && mesh) {
        onCommitMesh?.(beforeMeshRef.current, mesh);
      }

      isDraggingRef.current = false;
      activeGizmoHandleRef.current = null;
      beforeMeshRef.current = null;
      touchMapRef.current.clear();
      gestureStateRef.current.type = 'none';
      gestureStateRef.current.maxTouchCount = 0;
      gestureStateRef.current.totalMovement = 0;
    }
  };

  return (
    <div className="relative flex-1 min-h-0 bg-[#14161b] flex flex-col overflow-hidden">
      {/* Header bar with navigation, select modes & 2D transform tools */}
      <div className="h-11 bg-[#181a1f] border-b border-[#2b2e36] px-3 flex items-center justify-between text-xs text-[#e4e6eb] z-10">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#5ecd6e]">Editor UV 2D</span>
          <div className="h-4 w-px bg-[#2b2e36]" />
          <div className="flex items-center gap-1 bg-[#121418] rounded p-0.5 border border-[#2b2e36]">
            {(['vertex', 'edge', 'face', 'island'] as UVSelectMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSelectModeChange(mode)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                  selection.mode === mode
                    ? 'bg-[#5ecd6e] text-[#121418] font-semibold'
                    : 'text-[#9ca3af] hover:text-white'
                }`}
              >
                {mode === 'vertex'
                  ? 'Vértice'
                  : mode === 'edge'
                    ? 'Arista'
                    : mode === 'face'
                      ? 'Cara'
                      : 'Isla'}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-[#2b2e36]" />

          {/* Transform Tool selector */}
          <div className="flex items-center gap-1 bg-[#121418] rounded p-0.5 border border-[#2b2e36]">
            <button
              type="button"
              onClick={() => setTransformTool('move')}
              className={`p-1.5 rounded transition-colors ${
                transformTool === 'move' ? 'bg-[#2b2e36] text-[#5ecd6e]' : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Herramienta Mover (Gizmo X/Y)"
            >
              <Move className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTransformTool('rotate')}
              className={`p-1.5 rounded transition-colors ${
                transformTool === 'rotate' ? 'bg-[#2b2e36] text-[#5ecd6e]' : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Herramienta Rotar 2D"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTransformTool('scale')}
              className={`p-1.5 rounded transition-colors ${
                transformTool === 'scale' ? 'bg-[#2b2e36] text-[#5ecd6e]' : 'text-[#9ca3af] hover:text-white'
              }`}
              title="Herramienta Escalar 2D"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#121418] rounded p-0.5 border border-[#2b2e36]">
            <button
              type="button"
              onClick={handleFit01}
              className="h-7 px-2 rounded hover:bg-[#252932] text-[11px] text-[#cbd5e1] flex items-center gap-1 transition-colors"
              title="Ajustar al espacio 0–1"
            >
              <Grid className="w-3.5 h-3.5 text-[#5ecd6e]" />
              <span className="hidden sm:inline">0–1 Fit</span>
            </button>
            <button
              type="button"
              onClick={handleFrameAll}
              className="h-7 px-2 rounded hover:bg-[#252932] text-[11px] text-[#cbd5e1] flex items-center gap-1 transition-colors"
              title="Encuadrar todas las islas UV"
            >
              <Maximize className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span className="hidden sm:inline">Encuadrar</span>
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="h-7 px-2 rounded hover:bg-[#252932] text-[11px] text-[#cbd5e1] flex items-center gap-1 transition-colors"
              title="Restablecer vista"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#9ca3af]" />
            </button>
          </div>

          <div className="h-4 w-px bg-[#2b2e36]" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4000, z * 1.25))}
              className="w-7 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-bold text-[#e4e6eb] flex items-center justify-center"
              title="Acercar Zoom"
            >
              +
            </button>
            <span className="font-mono-tabular text-[11px] text-[#5ecd6e] w-12 text-center">
              {Math.round((zoom / 380) * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(80, z * 0.8))}
              className="w-7 h-7 rounded bg-[#22252d] hover:bg-[#2c313b] border border-[#323640] text-xs font-bold text-[#e4e6eb] flex items-center justify-center"
              title="Alejar Zoom"
            >
              -
            </button>
          </div>
        </div>
      </div>

      {/* Interactive 2D Canvas Area */}
      <div className="flex-1 min-h-0 relative">
        <canvas
          ref={canvasRef}
          className={`w-full h-full touch-none ${
            spacePressed || isPanningRef.current ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            e.preventDefault();
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const cssHeight = canvas.clientHeight;

            const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
            const nextZoom = Math.max(80, Math.min(4000, zoom * zoomFactor));

            const u = (mouseX - pan[0]) / zoom;
            const v = (cssHeight - mouseY - pan[1]) / zoom;

            const nextPanX = mouseX - u * nextZoom;
            const nextPanY = cssHeight - mouseY - v * nextZoom;

            setZoom(nextZoom);
            setPan([nextPanX, nextPanY]);
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>
    </div>
  );
};

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenTool } from 'lucide-react';

export function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string | undefined) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
  }, []);

  const getPoint = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const pt = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    if (!hasStroke) setHasStroke(true);
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'));
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange(undefined);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-label-md font-medium text-on-surface flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-secondary" />
          Client digital sign-off (Proof of Visit)
        </span>
        {hasStroke ? (
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 text-caption text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <Eraser className="w-3 h-3" />
            Clear
          </button>
        ) : null}
      </div>

      <div className="relative rounded-xl border border-dashed border-outline-variant bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          width={520}
          height={140}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-[120px] touch-none cursor-crosshair block"
        />
        {!hasStroke ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-caption text-on-surface-variant/70">
            Sign here with finger or mouse
          </div>
        ) : null}
      </div>
    </div>
  );
}

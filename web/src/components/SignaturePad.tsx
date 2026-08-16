import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

export interface SignaturePadHandle {
  clear: () => void;
  /** PNG data URL, or null if nothing has been drawn. */
  toDataUrl: () => string | null;
}

/**
 * Finger-and-stylus signature capture. Most customers sign on a phone, so this
 * uses pointer events (covering mouse, touch and pen in one path) and stops the
 * page from scrolling while a stroke is in progress.
 */
const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(
  function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [hasInk, setHasInk] = useState(false);

    // Size the backing store to the device pixel ratio, or strokes render soft.
    const fit = useCallback(() => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      // Preserve any existing ink across a resize.
      const prev = hasInk ? c.toDataURL() : null;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      if (prev) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height);
        img.src = prev;
      }
    }, [hasInk]);

    useEffect(() => {
      fit();
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }, [fit]);

    const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    function down(e: React.PointerEvent<HTMLCanvasElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pos(e);
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext('2d');
      const p = pos(e);
      if (!ctx || !last.current) return;
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
      if (!hasInk) { setHasInk(true); onChange?.(true); }
    }

    function up() {
      drawing.current = false;
      last.current = null;
    }

    const clear = useCallback(() => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.restore();
      setHasInk(false);
      onChange?.(false);
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      clear,
      toDataUrl: () => {
        const c = canvasRef.current;
        if (!c || !hasInk) return null;
        // Flatten onto white — a transparent PNG signature is unreadable on
        // any printed or PDF copy of the approval.
        const out = document.createElement('canvas');
        out.width = c.width;
        out.height = c.height;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(c, 0, 0);
        return out.toDataURL('image/png');
      },
    }), [clear, hasInk]);

    return (
      <div>
        <div className="relative rounded-xl border border-white/15 bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            onPointerCancel={up}
            className="block h-40 w-full touch-none rounded-xl"
            aria-label="Signature area — draw your signature here"
            role="img"
          />
          {!hasInk && (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-5">
              <span className="border-t border-slate-300 px-12 pt-1.5 text-[0.7rem] text-slate-400">
                Sign above
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={clear}
          className="mt-2 text-[0.7rem] font-semibold text-muted underline underline-offset-2 hover:text-text"
        >
          Clear signature
        </button>
      </div>
    );
  },
);

export default SignaturePad;

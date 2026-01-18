
import React, { useRef, useState, useEffect } from 'react';
import { PitchPoint } from '../types';
import { Music2, Plus, Trash2, Move } from 'lucide-react';

interface PitchEditorProps {
  points: PitchPoint[];
  setPoints: React.Dispatch<React.SetStateAction<PitchPoint[]>>;
  currentTime: number; // 0-1 Normalized playback position
  isPlaying: boolean;
  disabled: boolean;
}

const PitchEditor: React.FC<PitchEditorProps> = ({ points, setPoints, currentTime, isPlaying, disabled }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);

  // Constants
  const MIN_PITCH = -12;
  const MAX_PITCH = 12;
  const RANGE = MAX_PITCH - MIN_PITCH;

  // Convert coordinate to value
  const toDataX = (pixelX: number, width: number) => Math.max(0, Math.min(1, pixelX / width));
  const toDataY = (pixelY: number, height: number) => {
    // 0px is MAX_PITCH, height px is MIN_PITCH
    const normalized = 1 - (pixelY / height);
    return MIN_PITCH + (normalized * RANGE);
  };

  // Convert value to coordinate %
  const toPctX = (x: number) => x * 100;
  const toPctY = (y: number) => {
    // y=-12 => 0% (bottom), y=12 => 100% (top)
    return ((y - MIN_PITCH) / RANGE) * 100;
  };

  const handleMouseDown = (e: React.MouseEvent, id?: string) => {
    if (disabled) return;
    // Important: Stop propagation so a click on a point doesn't trigger the container's "add point" logic
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    
    if (id) {
      // Start dragging existing point
      setDraggedPointId(id);
    } else {
      // Add new point logic (when clicking background)
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = toDataX(e.clientX - rect.left, rect.width);
        const y = toDataY(e.clientY - rect.top, rect.height);
        
        // Use a more robust ID generation
        const newPoint: PitchPoint = {
          id: `pt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          x,
          y
        };
        
        // Add new point and start dragging it immediately
        setPoints(prev => [...prev, newPoint].sort((a, b) => a.x - b.x));
        setDraggedPointId(newPoint.id);
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!draggedPointId || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let x = toDataX(e.clientX - rect.left, rect.width);
    const y = toDataY(e.clientY - rect.top, rect.height);

    setPoints((prev) => {
       return prev.map(p => {
          if (p.id === draggedPointId) {
             return { ...p, x, y };
          }
          return p;
       }).sort((a, b) => a.x - b.x);
    });
  };

  const handleMouseUp = () => {
    setDraggedPointId(null);
  };
  
  const handleDoubleClick = (e: React.MouseEvent, id: string) => {
     if (disabled) return;
     e.stopPropagation();
     setPoints(prev => prev.filter(p => p.id !== id));
  };

  useEffect(() => {
    if (draggedPointId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedPointId]);

  // Generate Path for SVG
  const generatePath = () => {
    if (points.length === 0) return `M 0 50 L 100 50`; // Flat line at 0
    
    const sorted = [...points].sort((a, b) => a.x - b.x);
    
    // SVG coordinate system (0 at top, 100 at bottom)
    const svgY = (y: number) => 100 - toPctY(y);
    
    // Start Path
    let d = ``;
    
    // If first point is not at x=0, assume flat from 0
    if (sorted[0].x > 0) {
        d = `M 0 ${svgY(sorted[0].y)} L ${sorted[0].x * 100} ${svgY(sorted[0].y)}`;
    } else {
        d = `M 0 ${svgY(sorted[0].y)}`;
    }

    sorted.forEach(p => {
        d += ` L ${p.x * 100} ${svgY(p.y)}`;
    });

    // Extend to end
    const last = sorted[sorted.length - 1];
    if (last.x < 1) {
        d += ` L 100 ${svgY(last.y)}`;
    }

    return d;
  };

  return (
    <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-3">
      <div className="flex items-center justify-between text-gray-300">
         <div className="flex items-center gap-2">
            <Music2 size={16} className="text-qubit-accent" />
            <h3 className="font-mono text-xs font-semibold tracking-wider uppercase">Pitch Automation</h3>
         </div>
         <div className="text-[10px] text-gray-500 font-mono flex items-center gap-4">
             <div className="flex items-center gap-1"><Move size={10}/> <span>DRAG</span></div>
             <div className="flex items-center gap-1"><Plus size={10}/> <span>CLICK ADD</span></div>
             <div className="flex items-center gap-1"><Trash2 size={10}/> <span>DBL-CLICK DEL</span></div>
         </div>
      </div>

      <div 
         className={`relative w-full h-32 bg-qubit-900/50 rounded-lg border border-white/10 overflow-hidden select-none ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-crosshair'}`}
         ref={containerRef}
         onMouseDown={(e) => handleMouseDown(e)}
      >
          {/* Grid Lines */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-qubit-accent/20"></div> {/* 0 semitones */}
          <div className="absolute top-[10%] left-0 right-0 h-px bg-white/5 border-t border-dashed border-white/5"></div> {/* +10ish */}
          <div className="absolute bottom-[10%] left-0 right-0 h-px bg-white/5 border-t border-dashed border-white/5"></div> {/* -10ish */}

          {/* SVG Line */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
              <path 
                d={generatePath()} 
                fill="none" 
                stroke="#00D8FF" 
                strokeWidth="2" 
                vectorEffect="non-scaling-stroke"
                className="drop-shadow-[0_0_8px_rgba(0,216,255,0.4)]"
              />
          </svg>

          {/* Points */}
          {points.map(p => (
              <div
                key={p.id}
                onMouseDown={(e) => handleMouseDown(e, p.id)}
                onDoubleClick={(e) => handleDoubleClick(e, p.id)}
                onMouseEnter={() => setHoveredPointId(p.id)}
                onMouseLeave={() => setHoveredPointId(null)}
                className={`absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 transition-transform ${
                    draggedPointId === p.id 
                    ? 'bg-white border-qubit-accent scale-150 z-20 cursor-grabbing' 
                    : hoveredPointId === p.id
                        ? 'bg-qubit-accent border-white scale-125 z-10 cursor-grab'
                        : 'bg-qubit-900 border-qubit-accent z-10 cursor-grab'
                }`}
                style={{
                    left: `${toPctX(p.x)}%`,
                    bottom: `${toPctY(p.y)}%`
                }}
              >
                 {/* Tooltip */}
                 {(hoveredPointId === p.id || draggedPointId === p.id) && (
                     <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/90 text-qubit-accent text-[10px] px-2 py-1 rounded font-mono whitespace-nowrap pointer-events-none border border-white/10 z-30">
                         {p.y > 0 ? '+' : ''}{p.y.toFixed(1)}st
                     </div>
                 )}
              </div>
          ))}

          {/* Playhead */}
          <div 
             className="absolute top-0 bottom-0 w-px bg-white/50 pointer-events-none z-0"
             style={{ left: `${currentTime * 100}%` }}
          ></div>
      </div>
    </div>
  );
};

export default PitchEditor;

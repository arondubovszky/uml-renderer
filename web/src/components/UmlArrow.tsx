"use client";

import { UmlArrowConfig, UmlClassConfig } from "@/types/diagram";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { diagramEvents } from "@/utils/events";
import { getPerimeterPoint, getClosestPerimeterParam } from "@/utils/geometry";

interface UmlArrowProps {
  arrow: UmlArrowConfig;
  classes: UmlClassConfig[];
  isSelected: boolean;
  onSelect: () => void;
  onUpdateArrow: (id: string, updates: Partial<UmlArrowConfig>) => void;
}

export function UmlArrow({ arrow, classes, isSelected, onSelect, onUpdateArrow }: UmlArrowProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const hitboxRef = useRef<SVGPathElement>(null); 
  
  // Refs for draggable dots and highlight frames
  const startCircleRef = useRef<SVGCircleElement>(null);
  const endCircleRef = useRef<SVGCircleElement>(null);
  const wpRefs = useRef<(SVGCircleElement | null)[]>([]);
  
  const fromHighlightRef = useRef<SVGGElement>(null);
  const toHighlightRef = useRef<SVGGElement>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fromClass = classes.find(c => c.id === arrow.fromClassId);
  const toClass = classes.find(c => c.id === arrow.toClassId);

  const stateRef = useRef({
    fromPos: arrow.fromPosition,
    toPos: arrow.toPosition,
    waypoints: [...arrow.waypoints]
  });

  useEffect(() => {
    stateRef.current = {
      fromPos: arrow.fromPosition,
      toPos: arrow.toPosition,
      waypoints: [...arrow.waypoints]
    };
    updatePathDOM();
  }, [arrow]);

  const boxesRef = useRef({
    from: fromClass ? { ...fromClass } : null,
    to: toClass ? { ...toClass } : null,
  });

  const updatePathDOM = () => {
    const { from, to } = boxesRef.current;
    if (!from || !to || !pathRef.current || !hitboxRef.current) return;

    const startPoint = getPerimeterPoint(from, stateRef.current.fromPos);
    const endPoint = getPerimeterPoint(to, stateRef.current.toPos);

    let d = `M ${startPoint.x} ${startPoint.y}`;
    stateRef.current.waypoints.forEach(wp => { d += ` L ${wp.x} ${wp.y}`; });
    d += ` L ${endPoint.x} ${endPoint.y}`;
    
    pathRef.current.setAttribute("d", d);
    hitboxRef.current.setAttribute("d", d);

    // Move highlight frames
    if (fromHighlightRef.current) {
      fromHighlightRef.current.setAttribute("transform", `translate(${from.x}, ${from.y})`);
    }
    if (toHighlightRef.current) {
      toHighlightRef.current.setAttribute("transform", `translate(${to.x}, ${to.y})`);
    }

    // Update circle coordinates on screen
    if (startCircleRef.current) {
      startCircleRef.current.setAttribute("cx", startPoint.x.toString());
      startCircleRef.current.setAttribute("cy", startPoint.y.toString());
    }
    if (endCircleRef.current) {
      endCircleRef.current.setAttribute("cx", endPoint.x.toString());
      endCircleRef.current.setAttribute("cy", endPoint.y.toString());
    }
    stateRef.current.waypoints.forEach((wp, i) => {
      if (wpRefs.current[i]) {
        wpRefs.current[i]!.setAttribute("cx", wp.x.toString());
        wpRefs.current[i]!.setAttribute("cy", wp.y.toString());
      }
    });
  };

  useEffect(() => {
    const unsubFrom = diagramEvents.subscribe(arrow.fromClassId, (x, y) => {
      if (boxesRef.current.from) { boxesRef.current.from.x = x; boxesRef.current.from.y = y; updatePathDOM(); }
    });
    const unsubTo = diagramEvents.subscribe(arrow.toClassId, (x, y) => {
      if (boxesRef.current.to) { boxesRef.current.to.x = x; boxesRef.current.to.y = y; updatePathDOM(); }
    });
    updatePathDOM();
    return () => { unsubFrom(); unsubTo(); };
  }, [arrow.fromClassId, arrow.toClassId]);

  if (!fromClass || !toClass) return null;

  const handleDragPoint = (e: React.PointerEvent, type: "start" | "end" | number) => {
    e.stopPropagation(); 
    if (e.buttons !== 1) return;

    const svgElement = document.getElementById("uml-canvas") as unknown as SVGSVGElement;
    const CTM = svgElement.getScreenCTM();
    if (!CTM) return;
    const mx = Math.round((e.clientX - CTM.e) / CTM.a);
    const my = Math.round((e.clientY - CTM.f) / CTM.d);

    if (type === "start" && boxesRef.current.from) {
      stateRef.current.fromPos = getClosestPerimeterParam(boxesRef.current.from, mx, my);
    } else if (type === "end" && boxesRef.current.to) {
      stateRef.current.toPos = getClosestPerimeterParam(boxesRef.current.to, mx, my);
    } else if (typeof type === "number") {
      stateRef.current.waypoints[type] = { x: mx, y: my };
    }
    
    updatePathDOM();
  };

  const handleAddWaypoint = (e: React.MouseEvent) => {
    e.stopPropagation();
    const svgElement = document.getElementById("uml-canvas") as unknown as SVGSVGElement;
    const CTM = svgElement.getScreenCTM();
    if (!CTM) return;
    const mx = Math.round((e.clientX - CTM.e) / CTM.a);
    const my = Math.round((e.clientY - CTM.f) / CTM.d);

    const sp = getPerimeterPoint(fromClass, stateRef.current.fromPos);
    const ep = getPerimeterPoint(toClass, stateRef.current.toPos);
    const pts = [sp, ...stateRef.current.waypoints, ep];
    
    let minIdx = 0;
    let minD = Infinity;
    
    const dist2 = (v: {x: number, y: number}, w: {x: number, y: number}) => (v.x - w.x)**2 + (v.y - w.y)**2;
    const distToSegment = (p: {x: number, y: number}, v: {x: number, y: number}, w: {x: number, y: number}) => {
      const l2 = dist2(v, w);
      if (l2 === 0) return Math.sqrt(dist2(p, v));
      let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.sqrt(dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }));
    };

    for (let i = 0; i < pts.length - 1; i++) {
      const d = distToSegment({x: mx, y: my}, pts[i], pts[i+1]);
      if (d < minD) {
        minD = d;
        minIdx = i;
      }
    }

    stateRef.current.waypoints.splice(minIdx, 0, { x: mx, y: my });
    saveArrowState(e);
    updatePathDOM();
  };

  const handleRemoveWaypoint = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    stateRef.current.waypoints.splice(index, 1);
    saveArrowState(e);
    updatePathDOM();
  };

  const saveArrowState = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    onUpdateArrow(arrow.id, {
      fromPosition: stateRef.current.fromPos,
      toPosition: stateRef.current.toPos,
      waypoints: [...stateRef.current.waypoints]
    });
  };

  const startPoint = getPerimeterPoint(fromClass, stateRef.current.fromPos);
  const endPoint = getPerimeterPoint(toClass, stateRef.current.toPos);
  wpRefs.current = wpRefs.current.slice(0, stateRef.current.waypoints.length);

  const overlayRoot = mounted ? document.getElementById("interactive-overlay") : null;

  return (
    <>
      <g style={{ outline: "none" }} className="focus:outline-none" focusable="false">
        <path 
          ref={hitboxRef} fill="none" stroke="transparent" strokeWidth="15" 
          strokeLinecap="round" strokeLinejoin="round"
          style={{ cursor: "pointer", outline: "none", WebkitTapHighlightColor: "transparent" }}
          className="focus:outline-none"
          focusable="false"
          onMouseDown={(e) => { e.stopPropagation(); onSelect(); }}
          onDoubleClick={handleAddWaypoint}
        />
        <path 
          ref={pathRef} fill="none" 
          stroke={isSelected ? "#007acc" : "#333"} 
          strokeWidth={isSelected ? "3" : "2"}
          strokeLinecap="round" strokeLinejoin="round"
          style={{ outline: "none", pointerEvents: "none" }}
          className="focus:outline-none"
          focusable="false"
        />
      </g>
      
      {isSelected && overlayRoot && createPortal(
        <g style={{ outline: "none" }} className="focus:outline-none" focusable="false">
          {/* Red borders around selected boxes */}
          <g ref={fromHighlightRef} transform={`translate(${fromClass.x}, ${fromClass.y})`} focusable="false">
            <rect 
              x={-fromClass.borderWidth} y={-fromClass.borderWidth} 
              width={fromClass.width + fromClass.borderWidth * 2} height={fromClass.height + fromClass.borderWidth * 2} 
              fill="none" stroke="red" strokeWidth={fromClass.borderWidth} 
              rx={fromClass.borderRadius + fromClass.borderWidth}
              style={{ pointerEvents: "none", outline: "none" }}
              focusable="false"
            />
          </g>
          <g ref={toHighlightRef} transform={`translate(${toClass.x}, ${toClass.y})`} focusable="false">
            <rect 
              x={-toClass.borderWidth} y={-toClass.borderWidth} 
              width={toClass.width + toClass.borderWidth * 2} height={toClass.height + toClass.borderWidth * 2} 
              fill="none" stroke="red" strokeWidth={toClass.borderWidth} 
              rx={toClass.borderRadius + toClass.borderWidth}
              style={{ pointerEvents: "none", outline: "none" }}
              focusable="false"
            />
          </g>

          <circle 
            ref={startCircleRef} cx={startPoint.x} cy={startPoint.y} r={6} fill="red" stroke="white" strokeWidth="1" 
            style={{ cursor: "grab", outline: "none" }} className="focus:outline-none" focusable="false"
            onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }} 
            onMouseDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => handleDragPoint(e, "start")} 
            onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); saveArrowState(e); }} 
          />
          
          {stateRef.current.waypoints.map((wp, i) => (
            <circle 
              key={i} ref={(el) => { wpRefs.current[i] = el; }} cx={wp.x} cy={wp.y} r={6} fill="red" stroke="white" strokeWidth="1" 
              style={{ cursor: "grab", outline: "none" }} className="focus:outline-none" focusable="false"
              onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }} 
              onMouseDown={(e) => e.stopPropagation()}
              onPointerMove={(e) => handleDragPoint(e, i)} 
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); saveArrowState(e); }} 
              onDoubleClick={(e) => handleRemoveWaypoint(e, i)}
            />
          ))}
          
          <circle 
            ref={endCircleRef} cx={endPoint.x} cy={endPoint.y} r={6} fill="red" stroke="white" strokeWidth="1" 
            style={{ cursor: "grab", outline: "none" }} className="focus:outline-none" focusable="false"
            onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }} 
            onMouseDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => handleDragPoint(e, "end")} 
            onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); saveArrowState(e); }} 
          />
        </g>,
        overlayRoot
      )}
    </>
  );
}

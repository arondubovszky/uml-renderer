"use client";

import { UmlClassConfig } from "@/types/diagram";
import { useRef } from "react";
import { diagramEvents } from "@/utils/events";

interface UmlClassBoxProps {
  config: UmlClassConfig;
  onUpdatePosition: (id: string, newX: number, newY: number) => void;
  isEditingArrow: boolean;
}

export function UmlClassBox({ config, onUpdatePosition, isEditingArrow }: UmlClassBoxProps) {
  // Direct reference to the DOM element (bypassing React)
  const groupRef = useRef<SVGGElement>(null);
  
  // Keep the position in memory, but DO NOT trigger React re-renders!
  const posRef = useRef({ x: config.x, y: config.y });

  const handleDrag = (e: React.MouseEvent<SVGGElement>) => {
    if (e.buttons !== 1) return; // Only left click
    if (isEditingArrow) return;  // PREVENT DRAGGING IF AN ARROW IS SELECTED
    
    // 1. Calculate new position
    posRef.current.x += e.movementX;
    posRef.current.y += e.movementY;

    // 2. DIRECTLY modify the browser DOM (Ultra fast, 120 FPS!)
    if (groupRef.current) {
      groupRef.current.setAttribute("transform", `translate(${posRef.current.x}, ${posRef.current.y})`);
    }

    // 3. Notify the arrows in the background that we moved! (bypassing React)
    diagramEvents.emit(config.id, posRef.current.x, posRef.current.y);
  };

  const handleDragEnd = () => {
    // When released, ONLY THEN save to JSON through React
    onUpdatePosition(config.id, posRef.current.x, posRef.current.y);
  };

  return (
    <g 
      ref={groupRef}
      transform={`translate(${config.x}, ${config.y})`}
      onMouseMove={handleDrag}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      style={{ cursor: "grab" }}
    >
      <rect 
        width={config.width} 
        height={config.height} 
        fill={config.backgroundColor} 
        stroke={config.borderColor}
        strokeWidth={config.borderWidth}
        rx={config.borderRadius}
      />
      <text x={10} y={20} fontFamily="Arial" fontSize="14" fontWeight="bold" style={{ userSelect: "none" }}>
        {config.className}
      </text>
      <rect x={0} y={30} width={config.width} height={1} fill={config.borderColor} />
      {config.attributes.map((attr, idx) => (
        <text key={idx} x={10} y={45 + (idx * 18)} fontFamily="Arial" fontSize="12" style={{ userSelect: "none" }}>
          {attr}
        </text>
      ))}
    </g>
  );
}

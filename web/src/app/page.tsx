"use client";

import { useState, useRef, useEffect } from "react";
import { UmlClassConfig, UmlArrowConfig } from "@/types/diagram";
import { UmlClassBox } from "@/components/UmlClassBox";
import { UmlArrow } from "@/components/UmlArrow";
import initialDiagramData from "@/data/uml_diagram.json";

export default function Home() {
  const [classes, setClasses] = useState<UmlClassConfig[]>(initialDiagramData.classes);
  const [arrows, setArrows] = useState<UmlArrowConfig[]>(initialDiagramData.arrows);

  const classesRef = useRef(classes);
  const arrowsRef = useRef(arrows);

  useEffect(() => { classesRef.current = classes; }, [classes]);
  useEffect(() => { arrowsRef.current = arrows; }, [arrows]);

  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);

  const saveToDisk = async (newClasses: UmlClassConfig[], newArrows: UmlArrowConfig[]) => {
    try {
      await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: newClasses, arrows: newArrows })
      });
    } catch (e) {
      console.error("Failed to save to disk", e);
    }
  };

  const handleUpdatePosition = (id: string, newX: number, newY: number) => {
    const updated = classesRef.current.map(c => 
      c.id === id ? { ...c, x: newX, y: newY } : c
    );
    setClasses(updated);
    saveToDisk(updated, arrowsRef.current);
  };

  const handleUpdateArrow = (id: string, updates: Partial<UmlArrowConfig>) => {
    const updated = arrowsRef.current.map(a => 
      a.id === id ? { ...a, ...updates } : a
    );
    setArrows(updated);
    saveToDisk(classesRef.current, updated);
  };

  // --- SVG Export Logic ---
  const downloadSvg = () => {
    const originalSvg = document.getElementById("uml-canvas");
    if (!originalSvg) return;

    // Clone the SVG so we don't modify the live DOM
    const clone = originalSvg.cloneNode(true) as SVGSVGElement;
    
    // 1. Remove the interactive overlay (red dots, selection frames)
    const overlay = clone.querySelector('#interactive-overlay');
    if (overlay) overlay.innerHTML = '';
    
    // 2. Reset all selected (blue, thick) arrows to their default state in the clone
    const paths = clone.querySelectorAll('path');
    paths.forEach(p => {
      if (p.getAttribute('stroke') === '#007acc') {
        p.setAttribute('stroke', '#333');
        p.setAttribute('stroke-width', '2'); // React strokeWidth -> SVG stroke-width attr
      }
    });

    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = "diagram.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // --- Render ---
  return (
    <main className="flex flex-col h-screen bg-gray-50 p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">UML Renderer - React Canvas</h1>
        
        <div className="relative">
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition flex items-center gap-2"
          >
            Save <span className="text-xs">▼</span>
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded shadow-lg z-50">
              <button 
                onClick={() => {
                  downloadSvg();
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-gray-800 hover:bg-gray-100 transition"
              >
                Download as .svg
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white border-2 border-gray-300 rounded shadow-inner overflow-hidden relative">
        <style dangerouslySetInnerHTML={{ __html: `
          * { outline: none !important; }
          *:focus { outline: none !important; }
          *:focus-visible { outline: none !important; }
          svg, g, path, circle, rect { outline: none !important; -webkit-tap-highlight-color: transparent !important; }
        `}} />
        <svg 
          id="uml-canvas" 
          width="100%" 
          height="100%" 
          xmlns="http://www.w3.org/2000/svg"
          onMouseDown={() => setSelectedArrowId(null)} // Clear selection on canvas click
          className="outline-none"
          style={{ userSelect: "none" }}
          focusable="false"
        >
          {/* Layer 1: Render arrows first (behind the boxes) */}
          {arrows.map(arrow => (
            <UmlArrow 
              key={arrow.id} 
              arrow={arrow} 
              classes={classes} 
              isSelected={selectedArrowId === arrow.id}
              onSelect={() => setSelectedArrowId(arrow.id)}
              onUpdateArrow={handleUpdateArrow}
            />
          ))}

          {/* Layer 2: Render class boxes */}
          {classes.map(cls => (
            <UmlClassBox 
              key={cls.id} 
              config={cls} 
              onUpdatePosition={handleUpdatePosition} 
              isEditingArrow={selectedArrowId !== null} // Pass down if any arrow is currently selected
            />
          ))}

          {/* Layer 3: React Portal target for interactive overlay (always on top) */}
          <g id="interactive-overlay" />
        </svg>
      </div>
    </main>
  );
}

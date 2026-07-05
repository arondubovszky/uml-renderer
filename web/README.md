# UML Renderer (React + SVG)

An interactive, high-performance UML diagram renderer and editor built with Next.js, React, and SVG. 
This project allows you to visually render UML class diagrams, move classes around freely, manipulate relationship arrows, add waypoints, and export the final result as a clean, standalone `.svg` file.

## 🚀 Key Features

- **High-Performance Dragging (120 FPS):** Dragging class boxes bypasses React's render cycle completely. It manipulates the DOM directly and communicates with connecting arrows via a custom Event Bus.
- **Interactive Routing:** Arrows dynamically connect to the exact perimeter of the boxes, taking border-radius into account. You can drag the start/end points of the arrows to any position on the box's perimeter.
- **Waypoints:** Double-click on any arrow to add a waypoint. Drag waypoints to route the arrow around obstacles. Double-click a waypoint to remove it.
- **Auto-Save:** Diagram state (positions, arrow configurations, waypoints) is automatically saved back to the `uml_diagram.json` file on the server.
- **SVG Export:** Export your diagram with a single click. Interactive elements (like red drag handles or blue selection highlights) are automatically stripped from the exported SVG, resulting in a clean, presentation-ready file.

## 🏗️ Architecture & Core Components

This application is built with a specific architecture designed to overcome React's performance limitations when rendering and dragging hundreds of SVG nodes.

### 1. The React Render Cycle (`page.tsx`)
React is responsible for the **initial render** and **persisting state**. 
- `page.tsx` loads the diagram data from `src/data/uml_diagram.json`.
- It renders `<UmlClassBox>` and `<UmlArrow>` components.
- React only re-renders when a drag operation *finishes* (on `mouseUp`), at which point it triggers the API call to save the JSON.

### 2. High-Performance Dragging (`UmlClassBox.tsx`)
When the user drags a class box, we do **not** use `setState`. Calling `setState` on every mouse move would cause the entire SVG to re-render, resulting in massive lag.
- We hold a `useRef` to the `<g>` SVG element representing the box.
- On `mouseMove`, we directly update the `transform="translate(x, y)"` attribute of the DOM element.
- This allows the browser to move the box at the hardware's maximum refresh rate (e.g., 120 FPS or 144 FPS).

### 3. The Event Bus (`events.ts`)
Since we bypass React during dragging, the connecting arrows don't naturally know that the box is moving.
- We use a custom, ultra-lightweight Event Bus (`DiagramEventBus`).
- When `UmlClassBox` moves, it calls `diagramEvents.emit(id, newX, newY)`.
- The `UmlArrow` components subscribe to the IDs of their connected boxes. When an event fires, the arrow recalculates its path and updates its `<path>` DOM element directly.

### 4. Geometry Math (`geometry.ts`)
To make arrows connect beautifully to the edges of the class boxes, we use precise math.
- `getPerimeterPoint`: Calculates the exact `(x, y)` coordinate on the perimeter of a rounded rectangle given a parameter `t` (0.0 to 1.0). It accounts for straight edges and quarter-circle corners.
- `getClosestPerimeterParam`: Given a user's mouse coordinate, it uses a binary search algorithm to find the closest `t` parameter on the box's perimeter so arrows snap to where the user drops them.

### 5. Waypoints and Interactive Overlay (`UmlArrow.tsx`)
- When an arrow is selected, it renders red interactive drag handles (circles) using a **React Portal**.
- The portal targets an empty `<g id="interactive-overlay">` at the very end of the main SVG.
- This guarantees that the interactive handles are always rendered **on top** of all other SVG elements (solving SVG's lack of `z-index`).

## 💾 Auto-Save API

The frontend automatically persists changes via the `POST /api/save` endpoint.
- Handled by `src/app/api/save/route.ts`.
- Updates `src/data/uml_diagram.json` natively on the filesystem.

## 🛠️ Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **UI:** React, TailwindCSS
- **Rendering:** Vanilla SVG elements inside React
- **Language:** TypeScript

## 🏃‍♂️ Running Locally

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Open `http://localhost:3000` in your browser.

/**
 * A lightweight, ultra-fast event bus to bypass React's render cycle for 60FPS dragging.
 */
type Listener = (x: number, y: number) => void;

class DiagramEventBus {
  private listeners: Record<string, Listener[]> = {};

  /**
   * Called when a class box is dragged, notifying connected arrows to redraw immediately.
   */
  emit(id: string, x: number, y: number) {
    if (this.listeners[id]) {
      for (const listener of this.listeners[id]) {
        listener(x, y);
      }
    }
  }

  /**
   * Arrows subscribe to the movement of their connected class boxes.
   */
  subscribe(id: string, listener: Listener) {
    if (!this.listeners[id]) {
      this.listeners[id] = [];
    }
    this.listeners[id].push(listener);

    return () => {
      this.listeners[id] = this.listeners[id].filter(l => l !== listener);
    };
  }
}

// Global instance
export const diagramEvents = new DiagramEventBus();

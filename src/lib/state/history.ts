export class History<T> {
  private undoStack: T[] = []
  private redoStack: T[] = []

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  push(snapshot: T): void {
    this.undoStack.push(snapshot)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  /** Snapshots that can still be reached through Undo or Redo. */
  snapshots(): readonly T[] {
    return [...this.undoStack, ...this.redoStack]
  }

  /**
   * Drops the least-recently reachable undo state. Resource caches use this
   * when their byte budget is exhausted, so an available Undo never refers to
   * bytes that have already been discarded.
   */
  discardOldestUndo(): boolean {
    if (!this.undoStack.length) return false
    this.undoStack.shift()
    return true
  }

  undo(current: T): T | undefined {
    const previous = this.undoStack.pop()
    if (previous === undefined) return undefined
    this.redoStack.push(current)
    return previous
  }

  redo(current: T): T | undefined {
    const next = this.redoStack.pop()
    if (next === undefined) return undefined
    this.undoStack.push(current)
    return next
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}

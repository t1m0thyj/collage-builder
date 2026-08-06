export class History<T> {
  private undoStack: T[] = []
  private redoStack: T[] = []

  constructor(private readonly limit = 100) {}

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  push(snapshot: T): void {
    this.undoStack.push(snapshot)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
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
}

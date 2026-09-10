export interface Identifiable {
  id: string
}

/** Small in-memory repository shared by protocol plugins. */
export class MemoryRepository<T extends Identifiable> {
  private readonly records = new Map<string, T>()

  insert(record: T) {
    if (this.records.has(record.id)) throw new Error(`Record ${record.id} already exists`)
    this.records.set(record.id, record)
    return record
  }

  find(id: string) {
    return this.records.get(id)
  }

  list() {
    return [...this.records.values()]
  }

  update(id: string, updater: (record: T) => T) {
    const record = this.records.get(id)
    if (!record) return undefined
    const updated = updater(record)
    this.records.set(id, updated)
    return updated
  }

  delete(id: string) {
    return this.records.delete(id)
  }

  clear() {
    const count = this.records.size
    this.records.clear()
    return count
  }
}

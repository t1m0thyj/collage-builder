import { openDB, type IDBPDatabase } from 'idb'

/** Share one connection and release it when another tab upgrades the schema. */
export function browserDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBPDatabase) => void,
): () => Promise<IDBPDatabase> {
  let connection: Promise<IDBPDatabase> | undefined
  return () => {
    if (!connection) {
      const opening = openDB(name, version, {
        upgrade,
        blocking() {
          void opening.then((db) => db.close()).catch(() => undefined)
          if (connection === opening) connection = undefined
        },
        terminated() {
          if (connection === opening) connection = undefined
        },
      })
      connection = opening
      void opening.catch(() => {
        if (connection === opening) connection = undefined
      })
    }
    return connection
  }
}

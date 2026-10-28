import { recordID, validRecord } from "./registry.js";
export class CatalogueStore {
  constructor() {
    this.db = null;
    this.memory = new Map();
    this.persistent = false;
    this.warning = "";
  }
  async open() {
    try {
      this.db = await new Promise((resolve, reject) => {
        let settled = false;
        const fail = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        };
        const timer = setTimeout(
          () =>
            fail(
              new Error(
                "Storage did not respond; reload to retry persistent saving.",
              ),
            ),
          2500,
        );
        let req;
        try {
          req = indexedDB.open("this-alien-catalogue", 2);
        } catch (error) {
          fail(error);
          return;
        }
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains("records"))
            req.result.createObjectStore("records", { keyPath: "id" });
        };
        req.onsuccess = () => {
          if (settled) {
            req.result.close();
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(req.result);
        };
        req.onerror = () => fail(req.error);
        req.onblocked = () =>
          fail(
            new Error(
              "Close another open version of the catalogue, then reload.",
            ),
          );
      });
      this.db.onversionchange = () => {
        this.db.close();
        this.persistent = false;
        this.warning =
          "Catalogue changed in another tab; reload to resume saving.";
      };
      this.persistent = true;
    } catch (error) {
      this.warning = `Discoveries are kept for this session only: ${error.message}`;
    }
    return this;
  }
  async put(record) {
    if (!validRecord(record))
      throw new Error("Cannot save an invalid catalogue record.");
    const id = recordID(record),
      entry = { id, record, seenAt: new Date().toISOString() };
    this.memory.set(id, record);
    if (!this.persistent) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction("records", "readwrite");
        tx.objectStore("records").put(entry);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Save aborted."));
      });
    } catch (error) {
      this.persistent = false;
      this.warning = `Saving failed; new discoveries are kept in this session: ${error.message}`;
      throw new Error(this.warning);
    }
  }
  async putMany(records) {
    if (records.some((r) => !validRecord(r)))
      throw new Error("Cannot save invalid catalogue records.");
    const seenAt = new Date().toISOString();
    if (this.persistent) {
      try {
        await new Promise((resolve, reject) => {
          const tx = this.db.transaction("records", "readwrite"),
            table = tx.objectStore("records");
          for (const record of records)
            table.put({ id: recordID(record), record, seenAt });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () =>
            reject(tx.error || new Error("Import transaction aborted."));
        });
      } catch (error) {
        throw new Error(`Import was not committed: ${error.message}`);
      }
    }
    for (const record of records) this.memory.set(recordID(record), record);
  }
  async all() {
    if (!this.db) return [...this.memory.values()];
    try {
      const entries = await new Promise((resolve, reject) => {
        const tx = this.db.transaction("records", "readonly"),
          req = tx.objectStore("records").getAll();
        const timer = setTimeout(() => {
          tx.abort();
          reject(new Error("Storage read timed out."));
        }, 3000);
        req.onsuccess = () => {
          clearTimeout(timer);
          resolve(req.result);
        };
        req.onerror = () => {
          clearTimeout(timer);
          reject(req.error);
        };
        tx.onabort = () => {
          clearTimeout(timer);
          reject(tx.error || new Error("Storage read aborted."));
        };
      });
      const merged = new Map(
        entries
          .filter((e) => validRecord(e.record))
          .map((e) => [e.id, e.record]),
      );
      for (const [id, r] of this.memory) merged.set(id, r);
      return [...merged.values()];
    } catch (error) {
      this.warning = `Saved catalogue could not be read: ${error.message}`;
      return [...this.memory.values()];
    }
  }
}

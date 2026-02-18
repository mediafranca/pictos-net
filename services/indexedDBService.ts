/**
 * IndexedDB Service — primary persistence layer for pictos-net
 *
 * v3 schema:
 *   rows    — RowData metadata WITHOUT binary fields (bitmap, rawSvg, structuredSvg)
 *   bitmaps — { id, bitmap: base64 data URL }
 *   svgs    — { id, rawSvg?, structuredSvg? }
 *
 * localStorage is used only for config (pictonet_v19_config).
 */

const DB_NAME = 'pictonet_storage';
const DB_VERSION = 3;
const STORE_ROWS = 'rows';
const STORE_BITMAPS = 'bitmaps';
const STORE_SVGS = 'svgs';

interface BitmapEntry {
  id: string;
  bitmap: string;
  timestamp: number;
}

interface SvgEntry {
  id: string;
  rawSvg?: string;
  structuredSvg?: string;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

// ─── DB init ────────────────────────────────────────────────────────────────

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_BITMAPS)) {
        const store = db.createObjectStore(STORE_BITMAPS, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SVGS)) {
        const store = db.createObjectStore(STORE_SVGS, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // v3: rows store for all RowData metadata (no binary fields)
      if (!db.objectStoreNames.contains(STORE_ROWS)) {
        const store = db.createObjectStore(STORE_ROWS, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

// ─── Rows ────────────────────────────────────────────────────────────────────

/**
 * Save all rows atomically (clears existing, then writes all).
 * Rows must not include binary fields (bitmap, rawSvg, structuredSvg).
 */
export const saveRows = async (rows: object[]): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ROWS], 'readwrite');
    const store = transaction.objectStore(STORE_ROWS);

    const clearReq = store.clear();
    clearReq.onsuccess = () => {
      const now = Date.now();
      rows.forEach((row: any) => {
        store.put({ ...row, timestamp: now });
      });
    };
    clearReq.onerror = () => reject(clearReq.error);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Get all rows from IndexedDB (without binary fields).
 */
export const getAllRows = async (): Promise<object[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ROWS], 'readonly');
    const store = transaction.objectStore(STORE_ROWS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete a single row by id.
 */
export const deleteRow = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ROWS], 'readwrite');
    const store = transaction.objectStore(STORE_ROWS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear all rows (used by clearAll).
 */
export const clearAllRows = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ROWS], 'readwrite');
    const store = transaction.objectStore(STORE_ROWS);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ─── Bitmaps ─────────────────────────────────────────────────────────────────

/**
 * Save all bitmaps atomically in a single transaction (much faster than
 * calling saveBitmap() individually for large libraries).
 */
export const saveBitmapsBatch = async (entries: { id: string; bitmap: string }[]): Promise<void> => {
  if (entries.length === 0) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readwrite');
    const store = transaction.objectStore(STORE_BITMAPS);
    const now = Date.now();
    entries.forEach(({ id, bitmap }) => {
      store.put({ id, bitmap, timestamp: now } as BitmapEntry);
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const saveBitmap = async (id: string, bitmap: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readwrite');
    const store = transaction.objectStore(STORE_BITMAPS);
    const request = store.put({ id, bitmap, timestamp: Date.now() } as BitmapEntry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getBitmap = async (id: string): Promise<string | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readonly');
    const store = transaction.objectStore(STORE_BITMAPS);
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result as BitmapEntry | undefined;
      resolve(result?.bitmap || null);
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllBitmaps = async (): Promise<Map<string, string>> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readonly');
    const store = transaction.objectStore(STORE_BITMAPS);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as BitmapEntry[];
      const map = new Map<string, string>();
      entries.forEach(e => map.set(e.id, e.bitmap));
      resolve(map);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteBitmap = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readwrite');
    const store = transaction.objectStore(STORE_BITMAPS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ─── SVGs ────────────────────────────────────────────────────────────────────

export const saveSvgs = async (id: string, svgs: { rawSvg?: string; structuredSvg?: string }): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SVGS], 'readwrite');
    const store = transaction.objectStore(STORE_SVGS);

    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as SvgEntry | undefined;
      const entry: SvgEntry = {
        id,
        timestamp: Date.now(),
        rawSvg: svgs.rawSvg !== undefined ? svgs.rawSvg : existing?.rawSvg,
        structuredSvg: svgs.structuredSvg !== undefined ? svgs.structuredSvg : existing?.structuredSvg,
      };
      const putReq = store.put(entry);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
};

export const getSvgs = async (id: string): Promise<{ rawSvg?: string; structuredSvg?: string } | null> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SVGS], 'readonly');
    const store = transaction.objectStore(STORE_SVGS);
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result as SvgEntry | undefined;
      if (!result) { resolve(null); return; }
      resolve({ rawSvg: result.rawSvg, structuredSvg: result.structuredSvg });
    };
    request.onerror = () => reject(request.error);
  });
};

export const getAllSvgs = async (): Promise<Map<string, { rawSvg?: string; structuredSvg?: string }>> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SVGS], 'readonly');
    const store = transaction.objectStore(STORE_SVGS);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result as SvgEntry[];
      const map = new Map<string, { rawSvg?: string; structuredSvg?: string }>();
      entries.forEach(e => map.set(e.id, { rawSvg: e.rawSvg, structuredSvg: e.structuredSvg }));
      resolve(map);
    };
    request.onerror = () => reject(request.error);
  });
};

export const deleteSvgs = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SVGS], 'readwrite');
    const store = transaction.objectStore(STORE_SVGS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ─── Clear all ───────────────────────────────────────────────────────────────

/**
 * Clear all data from all stores (used by "delete all" action).
 */
export const clearAllData = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_ROWS, STORE_BITMAPS, STORE_SVGS], 'readwrite');
    transaction.objectStore(STORE_ROWS).clear();
    transaction.objectStore(STORE_BITMAPS).clear();
    transaction.objectStore(STORE_SVGS).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/** @deprecated use clearAllData() */
export const clearAllBitmaps = clearAllData;

// ─── Storage estimate ────────────────────────────────────────────────────────

export const getStorageEstimate = async (): Promise<{ usage: number; quota: number } | null> => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return { usage: estimate.usage || 0, quota: estimate.quota || 0 };
  }
  return null;
};

/**
 * IndexedDB Service for storing large binary data (bitmaps & SVGs)
 * LocalStorage has a ~5-10MB limit, IndexedDB can store 50MB-1GB+
 */

const DB_NAME = 'pictonet_storage';
const DB_VERSION = 2; // Incremented for 'svgs' store
const STORE_BITMAPS = 'bitmaps';
const STORE_SVGS = 'svgs';

interface BitmapEntry {
  id: string;
  bitmap: string; // base64 data URL
  timestamp: number;
}

interface SvgEntry {
  id: string;
  rawSvg?: string;
  structuredSvg?: string;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize IndexedDB
 */
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

      // Create bitmaps store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_BITMAPS)) {
        const objectStore = db.createObjectStore(STORE_BITMAPS, { keyPath: 'id' });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create SVGs store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_SVGS)) {
        const objectStore = db.createObjectStore(STORE_SVGS, { keyPath: 'id' });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

/**
 * Save a bitmap to IndexedDB
 */
export const saveBitmap = async (id: string, bitmap: string): Promise<void> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readwrite');
    const store = transaction.objectStore(STORE_BITMAPS);

    const entry: BitmapEntry = {
      id,
      bitmap,
      timestamp: Date.now()
    };

    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get a bitmap from IndexedDB
 */
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

/**
 * Save SVGs to IndexedDB
 */
export const saveSvgs = async (id: string, svgs: { rawSvg?: string; structuredSvg?: string }): Promise<void> => {
  const db = await initDB();

  return new Promise(async (resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_SVGS], 'readwrite');
      const store = transaction.objectStore(STORE_SVGS);

      // First get existing entry to merge if needed
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result as SvgEntry | undefined;

        const entry: SvgEntry = {
          id,
          timestamp: Date.now(),
          rawSvg: svgs.rawSvg !== undefined ? svgs.rawSvg : existing?.rawSvg,
          structuredSvg: svgs.structuredSvg !== undefined ? svgs.structuredSvg : existing?.structuredSvg
        };

        const putReq = store.put(entry);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };

      getReq.onerror = () => reject(getReq.error);

    } catch (e) {
      reject(e);
    }
  });
};

/**
 * Get SVGs from IndexedDB
 */
export const getSvgs = async (id: string): Promise<{ rawSvg?: string; structuredSvg?: string } | null> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SVGS], 'readonly');
    const store = transaction.objectStore(STORE_SVGS);
    const request = store.get(id);

    request.onsuccess = () => {
      const result = request.result as SvgEntry | undefined;
      if (!result) {
        resolve(null);
        return;
      }
      resolve({
        rawSvg: result.rawSvg,
        structuredSvg: result.structuredSvg
      });
    };

    request.onerror = () => reject(request.error);
  });
};


/**
 * Get all SVGs from IndexedDB
 */
export const getAllSvgs = async (): Promise<Map<string, { rawSvg?: string; structuredSvg?: string }>> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SVGS], 'readonly');
    const store = transaction.objectStore(STORE_SVGS);
    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as SvgEntry[];
      const map = new Map<string, { rawSvg?: string; structuredSvg?: string }>();
      entries.forEach(entry => {
        map.set(entry.id, {
          rawSvg: entry.rawSvg,
          structuredSvg: entry.structuredSvg
        });
      });
      resolve(map);
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * Get all bitmaps (keeping legacy name for compatibility, but maybe should verify usage)
 */
export const getAllBitmaps = async (): Promise<Map<string, string>> => {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS], 'readonly');
    const store = transaction.objectStore(STORE_BITMAPS);
    const request = store.getAll();

    request.onsuccess = () => {
      const entries = request.result as BitmapEntry[];
      const map = new Map<string, string>();
      entries.forEach(entry => {
        map.set(entry.id, entry.bitmap);
      });
      resolve(map);
    };

    request.onerror = () => reject(request.error);
  });
};

/**
 * Delete a bitmap from IndexedDB
 */
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

/**
 * Delete SVGs from IndexedDB
 */
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

/**
 * Clear all data from IndexedDB
 */
export const clearAllBitmaps = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_BITMAPS, STORE_SVGS], 'readwrite');

    const bStore = transaction.objectStore(STORE_BITMAPS);
    bStore.clear();

    const sStore = transaction.objectStore(STORE_SVGS);
    sStore.clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Get database storage estimate
 */
export const getStorageEstimate = async (): Promise<{ usage: number; quota: number } | null> => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return null;
};

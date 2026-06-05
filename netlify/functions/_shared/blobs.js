import { getStore } from '@netlify/blobs';
import fs from 'fs';
import path from 'path';

export function getBlobStore(name) {
  // If we are locally running and blobs context is missing, use a local FS mock
  const isLocalMock = process.env.NETLIFY_DEV === 'true' && !process.env.NETLIFY_BLOBS_CONTEXT;
  
  if (!isLocalMock) {
    try {
      return getStore(name);
    } catch (err) {
      console.warn(`[blobs] Falling back to local FS mock for store: ${name}`);
    }
  }

  const localDir = path.join(process.cwd(), '.netlify', 'mock-blobs', name);
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

  const getPath = (key) => path.join(localDir, key);
  const ensureDir = (p) => {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  };

  return {
    async get(key, options) {
      const p = getPath(key);
      if (!fs.existsSync(p)) return null;
      const data = fs.readFileSync(p, 'utf8');
      if (options?.type === 'json') return JSON.parse(data);
      return data;
    },
    async setJSON(key, value) {
      const p = getPath(key);
      ensureDir(p);
      fs.writeFileSync(p, JSON.stringify(value));
    },
    async set(key, value) {
      const p = getPath(key);
      ensureDir(p);
      fs.writeFileSync(p, value);
    },
    async delete(key) {
      const p = getPath(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    },
    async list(options) {
      if (!fs.existsSync(localDir)) return { blobs: [] };
      
      const walkSync = (dir, filelist = [], baseDir) => {
        fs.readdirSync(dir).forEach(file => {
          const filepath = path.join(dir, file);
          if (fs.statSync(filepath).isDirectory()) {
            walkSync(filepath, filelist, baseDir);
          } else {
            filelist.push(path.relative(baseDir, filepath));
          }
        });
        return filelist;
      };

      let files = walkSync(localDir, [], localDir);
      if (options?.prefix) {
        files = files.filter(f => f.startsWith(options.prefix));
      }
      return { blobs: files.map(f => ({ key: f })) };
    }
  };
}

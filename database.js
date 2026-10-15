function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('screener', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('captures', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCapture(capture) {
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('captures', 'readwrite');
      const store = tx.objectStore('captures');
      store.put(capture);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.value.created < Date.now() - 86400000) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Could not save screenshot.'));
    });
  } finally { db.close(); }
}

export async function getCapture(id) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('captures').objectStore('captures').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

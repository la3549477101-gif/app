import { APP_NAME, SCHEMA_VERSION, COLLECTIONS, validateBackup, makeBackup } from "./domain.mjs";

const DATABASE_NAME = "my-daily-local-data";
const DATABASE_VERSION = 1;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地数据读取失败"));
  });
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("本地数据操作已取消"));
    transaction.onerror = () => reject(transaction.error ?? new Error("本地数据操作失败"));
  });
}

export function createLocalStore(indexedDBApi = globalThis.indexedDB) {
  if (!indexedDBApi) throw new Error("当前浏览器不支持本地持久化存储");
  let databasePromise;

  function open() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDBApi.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          for (const collection of COLLECTIONS) {
            if (!database.objectStoreNames.contains(collection)) database.createObjectStore(collection, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          databasePromise = null;
          reject(request.error ?? new Error("无法打开本地数据"));
        };
        request.onblocked = () => reject(new Error("本地数据升级被另一个打开的页面阻止，请关闭其他应用页面后重试"));
      });
    }
    return databasePromise;
  }

  async function readAll() {
    const database = await open();
    const transaction = database.transaction(COLLECTIONS, "readonly");
    const completion = transactionResult(transaction);
    const data = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (collection) => [
      collection,
      await requestResult(transaction.objectStore(collection).getAll()),
    ])));
    await completion;
    return data;
  }

  async function save(collection, record) {
    if (!COLLECTIONS.includes(collection)) throw new TypeError(`未知的数据集合：${collection}`);
    const database = await open();
    const transaction = database.transaction(collection, "readwrite");
    const completion = transactionResult(transaction);
    transaction.objectStore(collection).put(record);
    await completion;
    return record;
  }

  async function remove(collection, id) {
    if (!COLLECTIONS.includes(collection)) throw new TypeError(`未知的数据集合：${collection}`);
    const data = await readAll();
    if (collection === "memoCategories" && data.memos.some((memo) => memo.categoryId === id)) {
      throw new Error("此分类仍被备忘使用，请先将相关备忘移至其他分类");
    }
    const removeIds = new Map([[collection, new Set([id])]]);
    if (collection === "projects") {
      removeIds.set("devTasks", new Set(data.devTasks.filter((row) => row.projectId === id).map((row) => row.id)));
    }
    if (collection === "clients") {
      const consultationIds = new Set(data.consultations.filter((row) => row.clientId === id).map((row) => row.id));
      removeIds.set("consultations", consultationIds);
      removeIds.set("followUps", new Set(data.followUps.filter((row) => consultationIds.has(row.consultationId)).map((row) => row.id)));
    }
    if (collection === "consultations") {
      removeIds.set("followUps", new Set(data.followUps.filter((row) => row.consultationId === id).map((row) => row.id)));
    }
    const affected = [...removeIds.keys()];
    const database = await open();
    const transaction = database.transaction(affected, "readwrite");
    const completion = transactionResult(transaction);
    for (const [name, ids] of removeIds) {
      const store = transaction.objectStore(name);
      for (const recordId of ids) store.delete(recordId);
    }
    await completion;
  }

  async function replaceAll(data) {
    const validation = validateBackup({ app: APP_NAME, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data });
    if (!validation.valid) throw new TypeError(validation.errors.join("；"));
    const database = await open();
    const transaction = database.transaction(COLLECTIONS, "readwrite");
    const completion = transactionResult(transaction);
    for (const collection of COLLECTIONS) {
      const store = transaction.objectStore(collection);
      store.clear();
      for (const record of data[collection]) store.put(record);
    }
    await completion;
  }

  async function exportBackup(exportedAt = new Date().toISOString()) {
    return makeBackup(await readAll(), exportedAt);
  }

  return { readAll, save, remove, replaceAll, exportBackup, close: async () => (await open()).close() };
}

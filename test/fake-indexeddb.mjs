const clone = (value) => structuredClone(value);

class FakeRequest {}

class FakeStore {
  constructor(transaction, name) { this.transaction = transaction; this.name = name; }
  getAll() {
    const request = new FakeRequest();
    this.transaction.request(() => [...this.transaction.database.stores.get(this.name).values()].map(clone), request);
    return request;
  }
  put(record) { this.transaction.write({ type: "put", name: this.name, value: clone(record) }); }
  delete(id) { this.transaction.write({ type: "delete", name: this.name, id }); }
  clear() { this.transaction.write({ type: "clear", name: this.name }); }
}

class FakeTransaction {
  constructor(database, names, mode) {
    this.database = database;
    this.names = Array.isArray(names) ? names : [names];
    this.mode = mode;
    this.operations = [];
    this.pending = 0;
    this.writeQueued = false;
  }
  objectStore(name) {
    if (!this.names.includes(name)) throw new Error(`Object store ${name} is outside the transaction`);
    return new FakeStore(this, name);
  }
  request(operation, request) {
    this.pending += 1;
    queueMicrotask(() => {
      try { request.result = operation(); request.onsuccess?.(); }
      catch (error) { request.error = error; request.onerror?.(); }
      this.pending -= 1;
      if (this.pending === 0) this.commit();
    });
  }
  write(operation) {
    if (this.mode !== "readwrite") throw new Error("Readonly transaction");
    this.operations.push(operation);
    if (!this.writeQueued) {
      this.writeQueued = true;
      queueMicrotask(() => this.commit());
    }
  }
  commit() {
    if (this.finished) return;
    this.finished = true;
    try {
      const staged = new Map(this.database.stores);
      for (const name of this.names) staged.set(name, new Map(this.database.stores.get(name)));
      for (const operation of this.operations) {
        const store = staged.get(operation.name);
        if (operation.type === "clear") store.clear();
        else if (operation.type === "delete") store.delete(operation.id);
        else store.set(operation.value.id, clone(operation.value));
      }
      this.database.stores = staged;
      this.oncomplete?.();
    } catch (error) {
      this.error = error;
      this.onabort?.();
    }
  }
}

class FakeDatabase {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }
  createObjectStore(name) { this.stores.set(name, new Map()); }
  transaction(names, mode) { return new FakeTransaction(this, names, mode); }
  close() {}
}

export class FakeIndexedDB {
  constructor() { this.database = null; }
  open() {
    const request = new FakeRequest();
    queueMicrotask(() => {
      if (!this.database) {
        this.database = new FakeDatabase();
        request.result = this.database;
        request.onupgradeneeded?.();
      }
      request.result = this.database;
      request.onsuccess?.();
    });
    return request;
  }
}

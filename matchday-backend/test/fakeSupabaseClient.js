// A small in-memory stand-in for @supabase/supabase-js's query builder.
// Implements exactly the chain db.js uses (from/select/insert/update/
// delete/eq/order/single, and being awaitable directly) so tests don't
// need a live Supabase project. Not a general-purpose mock — if db.js
// starts using a method this doesn't support, extend it here.

const crypto = require("crypto");

class FakeQueryBuilder {
  constructor(table, store) {
    this.table = table;
    this.store = store;
    this._filters = [];
    this._op = null;
    this._payload = null;
    this._single = false;
    this._orderCol = null;
  }

  select() {
    this._returning = true;
    if (!this._op) this._op = "select";
    return this;
  }

  insert(obj) {
    this._op = "insert";
    this._payload = obj;
    return this;
  }

  update(obj) {
    this._op = "update";
    this._payload = obj;
    return this;
  }

  delete() {
    this._op = "delete";
    return this;
  }

  eq(col, val) {
    this._filters.push([col, val]);
    return this;
  }

  order(col) {
    this._orderCol = col;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  _matching(rows) {
    return rows.filter((row) => this._filters.every(([col, val]) => row[col] === val));
  }

  _wrap(rows) {
    if (this._orderCol) {
      rows = [...rows].sort((a, b) => (a[this._orderCol] > b[this._orderCol] ? 1 : -1));
    }
    if (this._single) {
      if (rows.length !== 1) {
        return { data: null, error: { message: "no rows found" } };
      }
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  _execute() {
    const rows = this.store[this.table];

    if (this._op === "select") {
      return this._wrap(this._matching(rows));
    }

    if (this._op === "insert") {
      const row = { id: crypto.randomUUID(), ...this._payload };
      rows.push(row);
      return this._wrap([row]);
    }

    if (this._op === "update") {
      const matched = this._matching(rows);
      matched.forEach((row) => Object.assign(row, this._payload));
      return this._wrap(matched);
    }

    if (this._op === "delete") {
      const matched = this._matching(rows);
      this.store[this.table] = rows.filter((row) => !matched.includes(row));
      return this._wrap(matched);
    }

    throw new Error(`FakeQueryBuilder: no operation set for table "${this.table}"`);
  }

  // makes the builder itself awaitable, like the real supabase-js client
  then(resolve, reject) {
    try {
      resolve(this._execute());
    } catch (err) {
      reject(err);
    }
  }
}

function createFakeSupabaseClient(initialStore = { teams: [], matches: [] }) {
  const store = initialStore;
  return {
    store,
    from(table) {
      if (!store[table]) store[table] = [];
      return new FakeQueryBuilder(table, store);
    },
  };
}

module.exports = { createFakeSupabaseClient };

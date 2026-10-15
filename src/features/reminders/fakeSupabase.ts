// A stand-in for the Supabase client, used only by the tests in this folder.
// `from(table)` returns a chainable query that records every call and resolves
// to whatever the test put in `fake`.

type Row = Record<string, unknown>
type Call = { table: string; method: string; args: unknown[] }

export const fake = {
  /** Rows returned for `reminders` queries filtered with .is(...) (the open list). */
  open: [] as Row[],
  /** Rows returned for `reminders` queries filtered with .not(...) (finished). */
  finished: [] as Row[],
  /** Rows returned for `reminder_completions`. */
  completions: [] as Row[],
  /** When set, every query fails with this error. */
  error: null as { message: string; code?: string } | null,
  /** Row returned by insert / update. */
  saved: null as Row | null,
  calls: [] as Call[],
  rpcCalls: [] as { name: string; args: unknown }[],
  /** Error to return from rpc calls, if any. */
  rpcError: null as { message: string; code?: string } | null,
  /** When set, rpc calls wait for this promise before answering. */
  rpcGate: null as Promise<void> | null,
  reset() {
    this.open = []
    this.finished = []
    this.completions = []
    this.error = null
    this.saved = null
    this.calls = []
    this.rpcCalls = []
    this.rpcError = null
    this.rpcGate = null
  },
  called(table: string, method: string) {
    return this.calls.filter((c) => c.table === table && c.method === method)
  },
}

function resolve(table: string, methods: string[]) {
  if (fake.error) return { data: null, error: fake.error }
  if (methods.includes('insert') || methods.includes('update')) return { data: fake.saved, error: null }
  if (methods.includes('delete')) return { data: null, error: null }
  if (table === 'reminder_completions') return { data: fake.completions, error: null }
  return { data: methods.includes('not') ? fake.finished : fake.open, error: null }
}

export const fakeSupabase = {
  from(table: string) {
    const methods: string[] = []
    const query: object = new Proxy(
      {},
      {
        get(_target, method: string) {
          if (method === 'then') {
            const result = resolve(table, methods)
            return (ok: (value: unknown) => unknown, fail: (reason: unknown) => unknown) =>
              Promise.resolve(result).then(ok, fail)
          }
          return (...args: unknown[]) => {
            fake.calls.push({ table, method, args })
            methods.push(method)
            return query
          }
        },
      },
    )
    return query
  },
  async rpc(name: string, args: unknown) {
    fake.rpcCalls.push({ name, args })
    if (fake.rpcGate) await fake.rpcGate
    return fake.rpcError ? { data: null, error: fake.rpcError } : { data: null, error: null }
  },
}

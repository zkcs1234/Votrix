// Minimal in-memory stand-in for the Supabase/PostgREST client, just enough
// query surface for the organizer onboarding services. Each query executes
// synchronously when awaited, so a conditional UPDATE ("claim") behaves like
// the single atomic statement it is in Postgres.

let seq = 0

export function createFakeSupabase(seed = {}) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]))
  const injected = []

  const rowsOf = (name) => {
    if (!tables.has(name)) tables.set(name, [])
    return tables.get(name)
  }

  function from(table) {
    const state = {
      op: 'select',
      filters: [],
      patch: null,
      insertRows: null,
      order: null,
      range: null,
      count: false,
      returning: false,
      embeds: [], // embedded relations parsed from select(), e.g. "rel!fk!inner(a, b)"
    }

    // Column predicate. "table.col" refers to an embedded relation (any related
    // row matching counts, like a PostgREST inner join filter).
    const column = (col, test) => {
      if (col.includes('.')) {
        const [rel, c] = col.split('.')
        return (r) => (r.__rel?.[rel] ?? []).some((x) => test(x[c]))
      }
      return (r) => test(r[col])
    }

    function exec(mode) {
      const injectedIdx = injected.findIndex((i) => i.table === table && i.op === state.op)
      if (injectedIdx !== -1) {
        const [{ message, code }] = injected.splice(injectedIdx, 1)
        return { data: null, error: { message, ...(code ? { code } : {}) } }
      }

      const all = rowsOf(table)
      let result

      if (state.op === 'upsert') {
        const saved = state.insertRows.map((row) => {
          const existing = state.onConflict ? all.find((r) => r[state.onConflict] === row[state.onConflict]) : null
          if (existing) return Object.assign(existing, row)
          seq += 1
          const created = { id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, created_at: new Date(Date.now() + seq).toISOString(), ...row }
          all.push(created)
          return created
        })
        result = state.returning ? saved.map((r) => ({ ...r })) : null
      } else if (state.op === 'insert') {
        const created = state.insertRows.map((r) => {
          seq += 1
          return {
            id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
            created_at: new Date(Date.now() + seq).toISOString(),
            ...r,
          }
        })
        all.push(...created)
        result = state.returning ? created.map((r) => ({ ...r })) : null
      } else if (state.op === 'update') {
        const matched = all.filter((r) => state.filters.every((f) => f(r)))
        matched.forEach((r) => Object.assign(r, state.patch))
        result = state.returning ? matched.map((r) => ({ ...r })) : null
      } else if (state.op === 'delete') {
        const keep = all.filter((r) => !state.filters.every((f) => f(r)))
        tables.set(table, keep)
        result = null
      } else {
        // Related rows are matched by convention: related.user_id === parent.id.
        const base = state.embeds.length
          ? all.map((r) => ({
              ...r,
              __rel: Object.fromEntries(
                state.embeds.map((e) => [e.name, rowsOf(e.name).filter((x) => x.user_id === r.id)]),
              ),
            }))
          : all
        let matched = base.filter((r) => state.filters.every((f) => f(r)))
        for (const e of state.embeds) {
          if (e.inner) matched = matched.filter((r) => r.__rel[e.name].length > 0)
        }
        const strip = (r) => {
          if (!r.__rel) return { ...r }
          const { __rel, ...rest } = r
          return { ...rest, ...Object.fromEntries(Object.entries(__rel).map(([k, v]) => [k, v.map((x) => ({ ...x }))])) }
        }
        if (state.order) {
          const { column, ascending } = state.order
          matched = [...matched].sort((a, b) => (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * (ascending ? 1 : -1))
        }
        const total = matched.length
        if (state.range) matched = matched.slice(state.range[0], state.range[1] + 1)
        result = matched.map(strip)
        if (mode === undefined) return { data: result, error: null, count: state.count ? total : null }
      }

      if (mode === 'single' || mode === 'maybeSingle') {
        const list = result ?? []
        if (list.length === 1) return { data: list[0], error: null }
        if (list.length === 0) {
          return mode === 'single'
            ? { data: null, error: { code: 'PGRST116', message: 'no rows' } }
            : { data: null, error: null }
        }
        return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      }
      return { data: result, error: null }
    }

    const builder = {
      select(cols, opts) {
        if (state.op === 'select') {
          state.count = Boolean(opts?.count)
          for (const m of String(cols ?? '').matchAll(/([a-z_]+)((?:![a-z_]+)*)\(([^)]*)\)/gi)) {
            state.embeds.push({ name: m[1], inner: m[2].includes('!inner') })
          }
        }
        state.returning = true
        return builder
      },
      insert(rows) {
        state.op = 'insert'
        state.insertRows = Array.isArray(rows) ? rows : [rows]
        return builder
      },
      upsert(rows, opts) {
        state.op = 'upsert'
        state.insertRows = Array.isArray(rows) ? rows : [rows]
        state.onConflict = opts?.onConflict
        return builder
      },
      update(patch) {
        state.op = 'update'
        state.patch = patch
        return builder
      },
      delete() {
        state.op = 'delete'
        return builder
      },
      eq(col, val) { state.filters.push(column(col, (v) => v === val)); return builder },
      neq(col, val) { state.filters.push(column(col, (v) => v !== val)); return builder },
      gt(col, val) { state.filters.push(column(col, (v) => v != null && v > val)); return builder },
      gte(col, val) { state.filters.push(column(col, (v) => v != null && v >= val)); return builder },
      lte(col, val) { state.filters.push(column(col, (v) => v != null && v <= val)); return builder },
      is(col, val) { state.filters.push(column(col, (v) => (val === null ? v == null : v === val))); return builder },
      in(col, vals) { state.filters.push(column(col, (v) => vals.includes(v))); return builder },
      // Supports "col.ilike.%text%,col2.ilike.%text%" (substring, case-insensitive).
      or(expr) {
        const tests = String(expr).split(',').map((part) => {
          const [col, op, pattern] = part.split('.')
          const needle = String(pattern ?? '').replace(/%/g, '').toLowerCase()
          return op === 'ilike' ? (r) => String(r[col] ?? '').toLowerCase().includes(needle) : () => false
        })
        state.filters.push((r) => tests.some((t) => t(r)))
        return builder
      },
      order(column, { ascending = true } = {}) { state.order = { column, ascending }; return builder },
      range(from_, to) { state.range = [from_, to]; return builder },
      limit() { return builder },
      single() { return Promise.resolve(exec('single')) },
      maybeSingle() { return Promise.resolve(exec('maybeSingle')) },
      then(resolve, reject) { return Promise.resolve(exec()).then(resolve, reject) },
    }
    return builder
  }

  return {
    client: { from },
    // Test helpers
    rows: (name) => rowsOf(name).map((r) => ({ ...r })),
    raw: (name) => rowsOf(name),
    failNext: (table, op, message = 'injected failure', code) => injected.push({ table, op, message, code }),
  }
}

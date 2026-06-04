/**
 * Foundation: BaseRepository.
 *
 * A thin CRUD helper for tables that follow the same access pattern
 * (UUID primary key, created_at/updated_at timestamps, single row fetch
 * by id, list with optional filters).
 *
 * Modules are free to keep using bespoke queries when they need joins or
 * module-specific filters; BaseRepository covers the boring 80% of
 * read/write paths so service code can focus on domain logic.
 *
 * It does NOT enforce row-level security, business rules, or
 * permission checks — those remain the service's responsibility.
 */

import { db, wrap } from './db.js'
import { buildRange, parsePagination, pagePayload } from './pagination.js'

export class BaseRepository {
  /**
   * @param {object} opts
   * @param {string} opts.table              — DB table name (must exist in DB_TABLES).
   * @param {string} [opts.idColumn='id']    — primary key column.
   * @param {string} [opts.defaultOrder='created_at']
   * @param {boolean} [opts.softDelete]      — if true, `delete` sets a `deleted_at`
   *                                          column instead of removing the row.
   */
  constructor({ table, idColumn = 'id', defaultOrder = 'created_at', softDelete = false }) {
    if (!table) throw new Error('BaseRepository: `table` is required')
    this.table = table
    this.idColumn = idColumn
    this.defaultOrder = defaultOrder
    this.softDelete = softDelete
  }

  _client() {
    return db().from(this.table)
  }

  async findById(id, { select = '*' } = {}) {
    return wrap(
      this._client().select(select).eq(this.idColumn, id).maybeSingle(),
      { context: `${this.table}.findById` },
    )
  }

  async findByIdOrThrow(id, { select = '*', notFoundMessage } = {}) {
    const row = await this.findById(id, { select })
    if (!row) {
      const { notFound } = await import('./errors.js')
      throw notFound(notFoundMessage ?? `${this.table} not found`)
    }
    return row
  }

  async list({ select = '*', filters = {}, order, pagination, range } = {}) {
    let query = this._client().select(select, { count: 'exact' })

    for (const [col, value] of Object.entries(filters ?? {})) {
      if (value === undefined || value === null) continue
      query = query.eq(col, value)
    }

    const ord = order ?? { field: this.defaultOrder, ascending: false }
    query = query.order(ord.field, { ascending: Boolean(ord.ascending) })

    const pg = pagination ?? parsePagination()
    query = query.range(...(range ?? buildRange(pg)))

    const { data, error, count } = await query
    if (error) {
      const { serverError } = await import('./errors.js')
      throw serverError(`${this.table}.list: ${error.message}`)
    }
    return pagePayload(data ?? [], count ?? data?.length ?? 0, pg)
  }

  async create(payload, { select = '*' } = {}) {
    return wrap(
      this._client().insert(payload).select(select).single(),
      { context: `${this.table}.create` },
    )
  }

  async update(id, patch, { select = '*' } = {}) {
    return wrap(
      this._client().update(patch).eq(this.idColumn, id).select(select).single(),
      { context: `${this.table}.update` },
    )
  }

  async delete(id) {
    if (this.softDelete) {
      return this.update(id, { deleted_at: new Date().toISOString() })
    }
    const { error } = await this._client().delete().eq(this.idColumn, id)
    if (error) {
      const { serverError } = await import('./errors.js')
      throw serverError(`${this.table}.delete: ${error.message}`)
    }
    return true
  }
}

import type { SelectQueryBuilder, ObjectLiteral } from 'typeorm'
import { Brackets } from 'typeorm'

type QueryValue = string | number | boolean | Date | null | undefined

/**
 * A generic and elegant query builder wrapper for TypeORM.
 * Provides a fluent API for building complex queries concisely.
 */
export class TypeORMQueryBuilder<T extends ObjectLiteral> {
  private query: SelectQueryBuilder<T>
  private paramIndex = 0

  constructor(queryBuilder: SelectQueryBuilder<T>) {
    this.query = queryBuilder
  }

  /**
   * Equals condition (`column = :value`)
   */
  equals(column: string, value: QueryValue, ignoreEmpty = true): this {
    if (ignoreEmpty && this.isEmpty(value)) return this

    const paramName = this.generateParamName(column)
    this.query.andWhere(`${column} = :${paramName}`, { [paramName]: value })
    return this
  }

  /**
   * ILIKE condition (`column ILIKE :value`)
   * Automatically adds `%` around the value.
   */
  ilike(column: string, value: QueryValue, ignoreEmpty = true): this {
    if (ignoreEmpty && this.isEmpty(value)) return this

    const paramName = this.generateParamName(column)
    this.query.andWhere(`${column} ILIKE :${paramName}`, { [paramName]: `%${value}%` })
    return this
  }

  /**
   * IN condition (`column IN (:...value)`)
   */
  in(column: string, value: QueryValue[], ignoreEmpty = true): this {
    if (ignoreEmpty && (!value || value.length === 0)) return this

    const paramName = this.generateParamName(column)
    this.query.andWhere(`${column} IN (:...${paramName})`, { [paramName]: value })
    return this
  }

  /**
   * PostgreSQL ANY string_to_array condition.
   * Specifically for querying a comma-separated string column via `string_to_array`.
   */
  anyStringArray(
    column: string,
    value: QueryValue,
    options: { separator?: string; ignoreEmpty?: boolean } = {},
  ): this {
    const { separator = ',', ignoreEmpty = true } = options
    if (ignoreEmpty && this.isEmpty(value)) return this

    const paramName = this.generateParamName(column)
    this.query.andWhere(`:${paramName} = ANY(string_to_array(${column}, '${separator}'))`, {
      [paramName]: value,
    })
    return this
  }

  /**
   * Fuzzy search across multiple columns combined with OR logic inside an AND block.
   */
  search(columns: string[], keyword: QueryValue, ignoreEmpty = true): this {
    if (ignoreEmpty && this.isEmpty(keyword)) return this
    if (!columns || columns.length === 0) return this

    this.query.andWhere(
      new Brackets((qb) => {
        columns.forEach((column, index) => {
          const paramName = this.generateParamName('search_' + column)
          if (index === 0) {
            qb.where(`${column} ILIKE :${paramName}`, { [paramName]: `%${keyword}%` })
          } else {
            qb.orWhere(`${column} ILIKE :${paramName}`, { [paramName]: `%${keyword}%` })
          }
        })
      }),
    )
    return this
  }

  /**
   * Allows executing custom condition logic within the chain.
   * Useful for joins, subqueries, or complex conditions that don't fit the standard methods.
   */
  custom(conditionFn: (query: SelectQueryBuilder<T>) => void, apply = true): this {
    if (apply) {
      conditionFn(this.query)
    }
    return this
  }

  /**
   * Add Order By
   */
  orderBy(column: string, order: 'ASC' | 'DESC' = 'ASC', apply = true): this {
    if (apply) {
      this.query.orderBy(column, order)
    }
    return this
  }

  /**
   * Returns the underlying SelectQueryBuilder instance.
   */
  build(): SelectQueryBuilder<T> {
    return this.query
  }

  /**
   * Generates a unique parameter name for internal TypeORM binding
   */
  private generateParamName(field: string): string {
    this.paramIndex++
    return `${field.replace(/\./g, '_')}_${this.paramIndex}`
  }

  /**
   * Checks if a value is considered "empty".
   * For this generic builder, we consider null, undefined, and empty strings as empty.
   * We do not consider 0, false, or empty arrays as empty by default,
   * but arrays are typically checked for length > 0 before calling `.in()`.
   */
  private isEmpty(value: QueryValue): boolean {
    return value === undefined || value === null || value === ''
  }
}

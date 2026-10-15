import type { CommonPaginationData } from '../../../types/common';

export function toPagination<T>(response: {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}): CommonPaginationData<T> {
  return {
    items: response.items,
    meta: {
      currentPage: response.page,
      itemsPerPage: response.pageSize,
      totalItems: response.total,
      totalPages: Math.ceil(response.total / response.pageSize),
    },
  };
}

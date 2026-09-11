export function createEmptyBusinessPage(page: number, pageSize: number) {
  return {
    items: [],
    meta: {
      currentPage: page,
      itemsPerPage: pageSize,
      totalItems: 0,
      totalPages: 0,
    },
  };
}

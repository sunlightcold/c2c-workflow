import { describe, expect, it } from 'vitest';

import { createEmptyBusinessPage } from './business-grid';

describe('business grid helpers', () => {
  it('creates an empty page without changing the requested pagination', () => {
    expect(createEmptyBusinessPage(3, 50)).toEqual({
      items: [],
      meta: {
        currentPage: 3,
        itemsPerPage: 50,
        totalItems: 0,
        totalPages: 0,
      },
    });
  });
});

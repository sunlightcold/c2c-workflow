import { describe, expect, it } from 'vitest';

import { editModalOptions } from './schema';

function fields(options: typeof editModalOptions) {
  return options.formProps?.rule?.map((rule) => rule.field) ?? [];
}

describe('task edit forms', () => {
  it('keeps status changes in the table switch', () => {
    expect(fields(editModalOptions)).not.toContain('status');
  });

  it('exposes service and execution parameters in the task edit form', () => {
    expect(fields(editModalOptions)).toContain('service');
    expect(fields(editModalOptions)).toContain('data');
    expect(fields(editModalOptions)).toContain('type');
    expect(fields(editModalOptions)).toContain('description');
  });
});

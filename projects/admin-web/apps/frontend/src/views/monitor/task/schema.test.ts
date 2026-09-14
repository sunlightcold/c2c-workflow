import { describe, expect, it } from 'vitest';

import { editModalOptions, systemEditModalOptions } from './schema';

function fields(options: typeof editModalOptions) {
  return options.formProps?.rule?.map((rule) => rule.field) ?? [];
}

describe('task edit forms', () => {
  it('keeps status changes in the table switch', () => {
    expect(fields(editModalOptions)).not.toContain('status');
    expect(fields(systemEditModalOptions)).not.toContain('status');
  });

  it('does not expose immutable system task execution settings', () => {
    expect(fields(systemEditModalOptions)).not.toContain('service');
    expect(fields(systemEditModalOptions)).not.toContain('data');
    expect(fields(systemEditModalOptions)).toContain('type');
    expect(fields(systemEditModalOptions)).toContain('description');
  });
});

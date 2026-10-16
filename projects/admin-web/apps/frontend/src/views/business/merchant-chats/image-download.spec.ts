import { describe, expect, it } from 'vitest';

import { downloadChatImage } from './image-download';

describe('chat image download queue', () => {
  it('limits parallel downloads and lets later images proceed after a failure', async () => {
    let active = 0;
    let maximum = 0;
    const release: Array<() => void> = [];
    const downloads = Array.from({ length: 7 }, (_, index) =>
      downloadChatImage(async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active--;
        if (index === 1) throw new Error('expired');
        return index;
      }),
    );
    const settled = Promise.allSettled(downloads);
    expect(active).toBe(2);
    for (let index = 0; index < 7; index++) {
      release.shift()?.();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const results = await settled;
    expect(maximum).toBe(2);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(6);
    expect(active).toBe(0);
  });
});

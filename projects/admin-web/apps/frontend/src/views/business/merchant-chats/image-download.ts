let active = 0;
const waiting: Array<() => void> = [];

export async function downloadChatImage<T>(
  download: () => Promise<T>,
): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await download();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

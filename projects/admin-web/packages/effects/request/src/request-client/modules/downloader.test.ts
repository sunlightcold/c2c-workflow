import type { AxiosRequestConfig } from 'axios';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileDownloader } from './downloader';

describe('fileDownloader', () => {
  let fileDownloader: FileDownloader;
  const mockAxiosInstance = {
    request: vi.fn(),
  } as any;

  beforeEach(() => {
    fileDownloader = new FileDownloader(mockAxiosInstance);
  });

  it('should create an instance of FileDownloader', () => {
    expect(fileDownloader).toBeInstanceOf(FileDownloader);
  });

  it('should download a file and return a Blob', async () => {
    const url = 'https://example.com/file';
    const mockBlob = new Blob(['file content'], { type: 'text/plain' });
    const mockResponse: Blob = mockBlob;

    mockAxiosInstance.request.mockResolvedValueOnce(mockResponse);

    const result = await fileDownloader.download(url);

    expect(result).toBeInstanceOf(Blob);
    expect(result).toEqual(mockBlob);
    expect(mockAxiosInstance.request).toHaveBeenCalledWith(url, {
      responseType: 'blob',
      responseReturn: 'body',
    });
  });

  it('should merge provided config with default config', async () => {
    const url = 'https://example.com/file';
    const mockBlob = new Blob(['file content'], { type: 'text/plain' });
    const mockResponse: Blob = mockBlob;

    mockAxiosInstance.request.mockResolvedValueOnce(mockResponse);

    const customConfig: AxiosRequestConfig = {
      headers: { 'Custom-Header': 'value' },
    };

    const result = await fileDownloader.download(url, customConfig);
    expect(result).toBeInstanceOf(Blob);
    expect(result).toEqual(mockBlob);
    expect(mockAxiosInstance.request).toHaveBeenCalledWith(url, {
      ...customConfig,
      responseType: 'blob',
      responseReturn: 'body',
    });
  });

  it('should handle errors gracefully', async () => {
    const url = 'https://example.com/file';
    mockAxiosInstance.request.mockRejectedValueOnce(new Error('Network Error'));
    await expect(fileDownloader.download(url)).rejects.toThrow('Network Error');
  });

  it('should handle empty URL gracefully', async () => {
    const url = '';
    mockAxiosInstance.request.mockRejectedValueOnce(
      new Error('Request failed with status code 404'),
    );

    await expect(fileDownloader.download(url)).rejects.toThrow(
      'Request failed with status code 404',
    );
  });

  it('should handle null URL gracefully', async () => {
    const url = null as unknown as string;
    mockAxiosInstance.request.mockRejectedValueOnce(
      new Error('Request failed with status code 404'),
    );

    await expect(fileDownloader.download(url)).rejects.toThrow(
      'Request failed with status code 404',
    );
  });
});

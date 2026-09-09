import { StoragePublicAccessProbe } from './storage-public-access.probe'

describe('StoragePublicAccessProbe', () => {
  const fetchMock = jest.spyOn(global, 'fetch')
  const probe = new StoragePublicAccessProbe()

  afterEach(() => {
    fetchMock.mockReset()
  })

  afterAll(() => {
    fetchMock.mockRestore()
  })

  it('returns an anonymously accessible object', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('storage-health-check'), { status: 200 }))

    await expect(probe.read('https://cdn.example.com/health.txt')).resolves.toEqual(
      Buffer.from('storage-health-check'),
    )
  })

  it('rejects a public URL that requires authorization', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }))

    await expect(probe.read('https://cdn.example.com/health.txt')).rejects.toThrow(
      'Public object request failed with HTTP 403',
    )
  })
})

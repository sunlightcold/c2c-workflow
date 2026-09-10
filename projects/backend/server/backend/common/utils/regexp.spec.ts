import { ValidationMatch } from './regexp'

describe('username validation', () => {
  it.each(['老伍', 'admin', '运营_01', 'agent-01'])('accepts supported username %s', (username) => {
    expect(ValidationMatch.username.regExp.test(username)).toBe(true)
  })

  it.each(['伍', 'bad.name', 'bad name', '12345678901234567'])(
    'rejects username %s',
    (username) => {
      expect(ValidationMatch.username.regExp.test(username)).toBe(false)
    },
  )
})

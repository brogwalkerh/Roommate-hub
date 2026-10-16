import { validateSignup } from './signup'

const good = { email: ' Sam@Example.com ', password: 'correct horse battery', display_name: ' Sam ', invite_code: 'qj47-ucg6-kfk6-3btr' }

describe('validateSignup', () => {
  it('cleans up a valid signup', () => {
    expect(validateSignup(good)).toEqual({
      ok: true,
      value: { email: 'sam@example.com', password: 'correct horse battery', display_name: 'Sam', invite_code: 'QJ47-UCG6-KFK6-3BTR' },
    })
  })

  it.each([
    [{ ...good, email: 'not-an-email' }, 'invalid_email'],
    [{ ...good, password: 'short' }, 'weak_password'],
    [{ ...good, password: 'x'.repeat(73) }, 'long_password'],
    [{ ...good, display_name: '   ' }, 'invalid_name'],
    [{ ...good, invite_code: '' }, 'signup_not_allowed'],
    [null, 'invalid_email'],
  ])('rejects %j with %s', (body, error) => {
    expect(validateSignup(body)).toEqual({ ok: false, error })
  })
})

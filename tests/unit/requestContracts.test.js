// Contract tests for src/api/requestContracts.js — no npm deps, no network.
// Run: npm run test:unit  (Node >= 18)

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  bearerAuthorization,
  fitIdPathSegment,
  buildSignUpOptions,
  buildSignInOptions,
  buildSignOutOptions,
  buildChangePasswordOptions,
  buildFitIndexOptions,
  buildFitCreateOptions,
  buildFitShowOptions
} = require('../../src/api/requestContracts')

const BASE = 'http://fixture.test:4741'
const FABRICATED_TOKEN = 'fab00000000000000000000000000001'
const VALID_FIT_ID = '5a7db6c74d55bc51bdf39793'
const user = { token: FABRICATED_TOKEN }

describe('bearerAuthorization', () => {
  it('formats Bearer header for backend passport bearer strategy', () => {
    assert.deepEqual(bearerAuthorization(FABRICATED_TOKEN), {
      Authorization: `Bearer ${FABRICATED_TOKEN}`
    })
  })

  it('rejects missing or blank tokens', () => {
    assert.throws(() => bearerAuthorization(''), /token is required/i)
    assert.throws(() => bearerAuthorization(null), /token is required/i)
  })
})

describe('fitIdPathSegment', () => {
  it('accepts 24-character hex ObjectIds', () => {
    assert.equal(fitIdPathSegment(VALID_FIT_ID), VALID_FIT_ID)
  })

  it('rejects path injection and malformed ids', () => {
    assert.throws(() => fitIdPathSegment(''), /required/i)
    assert.throws(() => fitIdPathSegment('../fits'), /invalid fit id/i)
    assert.throws(() => fitIdPathSegment('5a7db6c7'), /invalid fit id/i)
    assert.throws(() => fitIdPathSegment('zzzzzzzzzzzzzzzzzzzzzzzz'), /invalid fit id/i)
  })
})

describe('auth request contracts', () => {
  const credentials = {
    email: 'fixture-user@example.test',
    password: 'fixture-password',
    passwordConfirmation: 'fixture-password'
  }

  it('POST /sign-up with credentials payload shape', () => {
    const opts = buildSignUpOptions(BASE, credentials)
    assert.equal(opts.method, 'POST')
    assert.equal(opts.url, `${BASE}/sign-up`)
    assert.deepEqual(opts.data, {
      credentials: {
        email: credentials.email,
        password: credentials.password,
        password_confirmation: credentials.passwordConfirmation
      }
    })
    assert.equal(opts.headers, undefined)
  })

  it('POST /sign-in without Authorization header', () => {
    const opts = buildSignInOptions(BASE, credentials)
    assert.equal(opts.method, 'POST')
    assert.equal(opts.url, `${BASE}/sign-in`)
    assert.deepEqual(opts.data.credentials, {
      email: credentials.email,
      password: credentials.password
    })
    assert.equal(opts.headers, undefined)
  })

  it('DELETE /sign-out with Bearer token (not legacy Token token=)', () => {
    const opts = buildSignOutOptions(BASE, user)
    assert.equal(opts.method, 'DELETE')
    assert.equal(opts.url, `${BASE}/sign-out`)
    assert.deepEqual(opts.headers, bearerAuthorization(FABRICATED_TOKEN))
    assert.ok(!String(opts.headers.Authorization).startsWith('Token token='))
  })

  it('PATCH /change-password with Bearer and passwords keys', () => {
    const passwords = { oldPassword: 'old-fixture', newPassword: 'new-fixture' }
    const opts = buildChangePasswordOptions(BASE, passwords, user)
    assert.equal(opts.method, 'PATCH')
    assert.equal(opts.url, `${BASE}/change-password`)
    assert.deepEqual(opts.headers, bearerAuthorization(FABRICATED_TOKEN))
    assert.deepEqual(opts.data.passwords, { old: 'old-fixture', new: 'new-fixture' })
  })
})

describe('fits request contracts', () => {
  const fit = { name: 'Fixture Fit', brand: 'Fixture Brand', site: 'https://example.test' }

  it('GET /fits with Bearer (not legacy /my-fits)', () => {
    const opts = buildFitIndexOptions(BASE, user)
    assert.equal(opts.method, 'GET')
    assert.equal(opts.url, `${BASE}/fits`)
    assert.deepEqual(opts.headers, bearerAuthorization(FABRICATED_TOKEN))
    assert.ok(!opts.url.includes('/my-fits'))
  })

  it('POST /fits with Bearer and fit body', () => {
    const opts = buildFitCreateOptions(BASE, fit, user)
    assert.equal(opts.method, 'POST')
    assert.equal(opts.url, `${BASE}/fits`)
    assert.deepEqual(opts.headers, bearerAuthorization(FABRICATED_TOKEN))
    assert.deepEqual(opts.data, { fit })
  })

  it('GET /fits/:id with Bearer for scoped show', () => {
    const opts = buildFitShowOptions(BASE, VALID_FIT_ID, user)
    assert.equal(opts.method, 'GET')
    assert.equal(opts.url, `${BASE}/fits/${VALID_FIT_ID}`)
    assert.deepEqual(opts.headers, bearerAuthorization(FABRICATED_TOKEN))
    assert.ok(!opts.url.includes('/my-fits'))
  })

  it('does not embed untrusted id segments in show URL', () => {
    assert.throws(
      () => buildFitShowOptions(BASE, 'other-user-fit-id/evil', user),
      /invalid fit id/i
    )
  })
})

describe('base URL joining', () => {
  it('strips trailing slashes on base before appending paths', () => {
    const opts = buildFitIndexOptions(`${BASE}/`, user)
    assert.equal(opts.url, `${BASE}/fits`)
  })
})

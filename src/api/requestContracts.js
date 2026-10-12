/**
 * Pure HTTP request option builders for FitCheck API (no axios, no network).
 * CommonJS so Node's built-in test runner can require this without legacy Babel.
 */

const FIT_ID_PATTERN = /^[a-fA-F0-9]{24}$/

function bearerAuthorization (token) {
  if (token == null || String(token).trim() === '') {
    throw new Error('Authentication token is required')
  }
  return { Authorization: `Bearer ${token}` }
}

/**
 * Validates Mongo-style ObjectId strings and returns a safe path segment.
 * Rejects empty, slash-bearing, or non-hex IDs before they reach the URL.
 */
function fitIdPathSegment (id) {
  if (id == null || id === '') {
    throw new Error('Fit id is required')
  }
  const segment = String(id)
  if (!FIT_ID_PATTERN.test(segment)) {
    throw new Error('Invalid fit id format')
  }
  return encodeURIComponent(segment)
}

function joinUrl (baseUrl, path) {
  const base = String(baseUrl).replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return base + suffix
}

function buildSignUpOptions (baseUrl, credentials) {
  return {
    method: 'POST',
    url: joinUrl(baseUrl, '/sign-up'),
    data: {
      credentials: {
        email: credentials.email,
        password: credentials.password,
        password_confirmation: credentials.passwordConfirmation
      }
    }
  }
}

function buildSignInOptions (baseUrl, credentials) {
  return {
    method: 'POST',
    url: joinUrl(baseUrl, '/sign-in'),
    data: {
      credentials: {
        email: credentials.email,
        password: credentials.password
      }
    }
  }
}

function buildSignOutOptions (baseUrl, user) {
  return {
    method: 'DELETE',
    url: joinUrl(baseUrl, '/sign-out'),
    headers: bearerAuthorization(user.token)
  }
}

function buildChangePasswordOptions (baseUrl, passwords, user) {
  return {
    method: 'PATCH',
    url: joinUrl(baseUrl, '/change-password'),
    headers: bearerAuthorization(user.token),
    data: {
      passwords: {
        old: passwords.oldPassword,
        new: passwords.newPassword
      }
    }
  }
}

function buildFitIndexOptions (baseUrl, user) {
  return {
    method: 'GET',
    url: joinUrl(baseUrl, '/fits'),
    headers: bearerAuthorization(user.token)
  }
}

function buildFitCreateOptions (baseUrl, fit, user) {
  return {
    method: 'POST',
    url: joinUrl(baseUrl, '/fits'),
    headers: bearerAuthorization(user.token),
    data: { fit }
  }
}

function buildFitShowOptions (baseUrl, id, user) {
  const segment = fitIdPathSegment(id)
  return {
    method: 'GET',
    url: joinUrl(baseUrl, `/fits/${segment}`),
    headers: bearerAuthorization(user.token)
  }
}

module.exports = {
  bearerAuthorization,
  fitIdPathSegment,
  buildSignUpOptions,
  buildSignInOptions,
  buildSignOutOptions,
  buildChangePasswordOptions,
  buildFitIndexOptions,
  buildFitCreateOptions,
  buildFitShowOptions
}

/**
 * Foundation: shared error helpers.
 *
 * Centralises the small set of HTTP error factories the controllers and
 * services throw repeatedly. Keeping the messages and status codes in one
 * place makes it easier to keep responses consistent across modules.
 */

import { ApiError } from '../utils/ApiError.js'

export const badRequest = (message, details) => new ApiError(400, message, details)
export const unauthorized = (message = 'Authentication required') => new ApiError(401, message)
export const forbidden = (message = 'Insufficient permissions') => new ApiError(403, message)
export const notFound = (message = 'Not found') => new ApiError(404, message)
export const conflict = (message, details) => new ApiError(409, message, details)
export const serverError = (message = 'Internal server error', details) =>
  new ApiError(500, message, details)
export const upstream = (message, details) => new ApiError(502, message, details)
export const unavailable = (message = 'Service unavailable') => new ApiError(503, message)

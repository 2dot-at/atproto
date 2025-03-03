import * as ident from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../context'
import { hasExplicitSlur } from './explicit-slurs'
import { reservedSubdomains } from './reserved'

export const normalizeAndValidateHandle = async (opts: {
  ctx: AppContext
  handle: string
  did?: string
  allowAnyValid?: boolean
}): Promise<string> => {
  const { ctx, did, allowAnyValid } = opts
  // base formatting validation
  const handle = baseNormalizeAndValidate(opts.handle)
  // tld validation
  if (!ident.isValidTld(handle)) {
    throw new InvalidRequestError(
      'Handle TLD is invalid or disallowed',
      'InvalidHandle',
    )
  }
  // slur check
  if (!allowAnyValid && hasExplicitSlur(handle)) {
    throw new InvalidRequestError(
      'Inappropriate language in handle',
      'InvalidHandle',
    )
  }
  if (isServiceDomain(handle, ctx.cfg.identity.serviceHandleDomains)) {
    // verify constraints on a service domain
    ensureHandleServiceConstraints(
      handle,
      ctx.cfg.identity.serviceHandleDomains,
      allowAnyValid,
    )
  } else {
    if (opts.did === undefined) {
      throw new InvalidRequestError(
        'Not a supported handle domain',
        'UnsupportedDomain',
      )
    }
    // verify resolution of a non-service domain
    const resolvedDid = await ctx.idResolver.handle.resolve(handle)
    if (resolvedDid !== did) {
      throw new InvalidRequestError('External handle did not resolve to DID')
    }
  }
  return handle
}

export const baseNormalizeAndValidate = (handle: string) => {
  try {
    const normalized = ident.normalizeAndEnsureValidHandle(handle)
    return normalized
  } catch (err) {
    if (err instanceof ident.InvalidHandleError) {
      throw new InvalidRequestError(err.message, 'InvalidHandle')
    }
    throw err
  }
}

export const isServiceDomain = (
  handle: string,
  availableUserDomains: string[],
): boolean => {
  return availableUserDomains.some((domain) => handle.endsWith(domain))
}

export const ensureHandleServiceConstraints = (
  handle: string,
  availableUserDomains: string[],
  allowReserved = false,
): void => {
  const supportedDomain =
    availableUserDomains.find((domain) => handle.endsWith(domain)) ?? ''
  const front = handle.slice(0, handle.length - supportedDomain.length)
  if (front.includes('.')) {
    throw new InvalidRequestError(
      'Invalid characters in handle',
      'InvalidHandle',
    )
  }
  if (front.length < 3) {
    throw new InvalidRequestError('Handle too short', 'InvalidHandle')
  }
  if (front.length > 18) {
    throw new InvalidRequestError('Handle too long', 'InvalidHandle')
  }
  if (!allowReserved && reservedSubdomains[front]) {
    throw new InvalidRequestError('Reserved handle', 'HandleNotAvailable')
  }
}

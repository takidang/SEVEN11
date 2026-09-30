"use client"

/**
 * Lets non-React code (toast actions, store helpers) navigate with the Next.js
 * router instead of a full page reload. <Providers> registers the router.
 */
let navigator: ((href: string) => void) | null = null

export function registerNavigator(fn: (href: string) => void) {
  navigator = fn
}

export function navigate(href: string) {
  if (navigator) navigator(href)
  else window.location.assign(href)
}

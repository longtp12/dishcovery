/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the short-link expander worker (optional). */
  readonly VITE_LINK_EXPANDER_URL?: string
}

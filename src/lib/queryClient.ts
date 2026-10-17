import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

/**
 * Query keys, one root per table. Realtime invalidation uses the root, so
 * every key for a table must start with its root.
 */
export const qk = {
  household: ['household'] as const,
  profiles: ['profiles'] as const,
  events: ['events'] as const,
  feeds: ['calendar_feeds'] as const,
  feedEvents: ['feed_events'] as const,
  reminders: ['reminders'] as const,
  notes: ['notes'] as const,
  bills: ['bills'] as const,
  recurringBills: ['recurring_bills'] as const,
  settlements: ['settlements'] as const,
  balances: ['balances'] as const,
  files: ['files'] as const,
  pushSubscriptions: ['push_subscriptions'] as const,
  /** pending_invites() RPC; not a table, so no realtime. */
  invites: ['invites'] as const,
}

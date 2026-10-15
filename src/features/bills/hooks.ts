// Bills data: bills with their shares, settlements, recurring bills and the
// balances view, plus every write the Bills page makes.
//
// Contract used by the Home dashboard (keep these names):
//   useBalance()          -> { myNetCents, roommateNetCents, isLoading }  (positive = is owed money)
//   useUnpaidBills()      -> query whose data is unpaid bills, soonest due first, no due date last
//   useBillsDueSoon(days) -> { bills, isLoading }: unpaid, due within `days` (overdue included)
//   Bill                  -> a bills row with its bill_shares

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import { useHousehold, useMembers } from '../../household/useHousehold'
import type { Tables, TablesUpdate, Views } from '../../lib/database.types'
import { unwrap } from '../../lib/errors'
import { qk } from '../../lib/queryClient'
import { STORAGE_BUCKET, supabase } from '../../lib/supabase'
import { storageContentType } from '../../lib/contentTypes'
import { useRealtime } from '../../lib/useRealtime'
import { describeBillError } from './billErrors'
import {
  MISSING_RECEIPT_MESSAGE,
  RECEIPTS_FOLDER,
  isMissingFileError,
  receiptDisplayName,
  receiptMimeType,
  receiptStoragePath,
  validateReceipt,
} from './receipts'
import { compareByDue, isDueWithin, todayIn } from './schedule'
import { parseShares, type Share, type SplitType } from './split'

export type BillShare = Tables<'bill_shares'>
/** A bills row with its shares. */
export type Bill = Tables<'bills'> & { bill_shares: BillShare[] }
export type Settlement = Tables<'settlements'>
/** A recurring_bills row with `shares` parsed (null when the stored JSON is malformed). */
export type RecurringBill = Omit<Tables<'recurring_bills'>, 'shares'> & { shares: Share[] | null }
export type Balance = Views<'balances'>

const BILL_SELECT = '*, bill_shares(*)' as const

/** unwrap() for list queries: an error throws, no rows is []. */
function rowsOf<T>(result: { data: T[] | null; error: unknown }): T[] {
  return unwrap(result) ?? []
}

/** unwrap() for single-row writes: an error throws, and so does a missing row. */
function rowOf<T>(result: { data: T; error: unknown }): NonNullable<T> {
  const row = unwrap(result)
  if (row === null || row === undefined) throw new Error('The server didn’t send the saved row back. Refresh to check it saved.')
  return row
}

/** Keep shares in a stable order and make sure numeric columns are numbers. */
function normalizeBill(row: Tables<'bills'> & { bill_shares: BillShare[] | null }): Bill {
  return {
    ...row,
    amount_cents: Number(row.amount_cents),
    bill_shares: (row.bill_shares ?? []).map((s) => ({
      ...s,
      share_cents: Number(s.share_cents),
      percent: s.percent === null ? null : Number(s.percent),
    })),
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Today's date in the household's time zone ("2026-10-15"). */
export function useToday(): string {
  const { data: household } = useHousehold()
  return todayIn(household?.timezone)
}

function useBillsRealtime() {
  useRealtime('bills', qk.bills, qk.balances)
  useRealtime('bill_shares', qk.bills, qk.balances)
}

/** Unpaid bills, soonest due first; bills with no due date last. */
export function useUnpaidBills() {
  const { user } = useAuth()
  useBillsRealtime()
  return useQuery({
    queryKey: [...qk.bills, 'unpaid'],
    queryFn: async () => {
      const rows = rowsOf(
        await supabase
          .from('bills')
          .select(BILL_SELECT)
          .is('paid_on', null)
          .order('due_on', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
      )
      return rows.map(normalizeBill).sort(compareByDue)
    },
    enabled: !!user,
  })
}

/** Paid bills, most recently paid first. */
export function usePaidBills() {
  const { user } = useAuth()
  useBillsRealtime()
  return useQuery({
    queryKey: [...qk.bills, 'paid'],
    queryFn: async () => {
      const rows = rowsOf(
        await supabase
          .from('bills')
          .select(BILL_SELECT)
          .not('paid_on', 'is', null)
          .order('paid_on', { ascending: false })
          .order('created_at', { ascending: false }),
      )
      return rows.map(normalizeBill)
    },
    enabled: !!user,
  })
}

/** Unpaid bills due within `days` of today, overdue ones included. */
export function useBillsDueSoon(days = 7) {
  const query = useUnpaidBills()
  const today = useToday()
  const bills = useMemo(
    () => (query.data ?? []).filter((b) => isDueWithin(b.due_on, today, days)),
    [query.data, today, days],
  )
  return { bills, isLoading: query.isLoading, error: query.error }
}

/** Settle-up payments, newest first. */
export function useSettlements() {
  const { user } = useAuth()
  useRealtime('settlements', qk.settlements, qk.balances)
  return useQuery({
    queryKey: [...qk.settlements, 'list'],
    queryFn: async () => {
      const rows = rowsOf(
        await supabase
          .from('settlements')
          .select('*')
          .order('paid_on', { ascending: false })
          .order('created_at', { ascending: false }),
      )
      return rows.map((s) => ({ ...s, amount_cents: Number(s.amount_cents) }))
    },
    enabled: !!user,
  })
}

/** Recurring bill templates, in the order they come due each month. */
export function useRecurringBills() {
  const { user } = useAuth()
  useRealtime('recurring_bills', qk.recurringBills)
  return useQuery({
    queryKey: [...qk.recurringBills, 'list'],
    queryFn: async () => {
      const rows = rowsOf(
        await supabase
          .from('recurring_bills')
          .select('*')
          .order('day_of_month', { ascending: true })
          .order('created_at', { ascending: true }),
      )
      return rows.map(
        (r): RecurringBill => ({ ...r, amount_cents: Number(r.amount_cents), shares: parseShares(r.shares) }),
      )
    },
    enabled: !!user,
  })
}

/** Net position per member from the balances view. */
export function useBalances() {
  const { user } = useAuth()
  useRealtime('bills', qk.balances)
  useRealtime('bill_shares', qk.balances)
  useRealtime('settlements', qk.balances)
  return useQuery({
    queryKey: [...qk.balances, 'all'],
    queryFn: async () => {
      const rows = rowsOf(await supabase.from('balances').select('*'))
      return rows.map((r) => ({ user_id: r.user_id, net_cents: Number(r.net_cents) }))
    },
    enabled: !!user,
  })
}

/** My and my roommate's net balance in cents. Positive = is owed money. */
export function useBalance() {
  const members = useMembers()
  const query = useBalances()
  const netOf = (id: string | undefined) => (id ? (query.data?.find((r) => r.user_id === id)?.net_cents ?? 0) : 0)
  return {
    myNetCents: netOf(members.me?.id),
    roommateNetCents: netOf(members.roommate?.id),
    isLoading: query.isLoading || members.isLoading,
    error: query.error ?? members.error,
    refetch: query.refetch,
  }
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

type UploadedReceipt = { path: string; fileId: string }

/**
 * Upload a receipt to the household bucket and list it in Files under
 * "Receipts". Cleans up the stored object if the files row can't be added.
 */
async function uploadReceipt(file: File): Promise<UploadedReceipt> {
  const problem = validateReceipt(file)
  if (problem) throw new Error(problem)
  const path = receiptStoragePath(crypto.randomUUID(), file.name)
  const mimeType = receiptMimeType(file) ?? 'application/octet-stream'
  const bucket = supabase.storage.from(STORAGE_BUCKET)

  const uploaded = await bucket.upload(path, file, { contentType: storageContentType(mimeType), upsert: false })
  if (uploaded.error) throw uploaded.error

  const row = await supabase
    .from('files')
    .insert({
      storage_path: path,
      name: receiptDisplayName(file.name),
      folder: RECEIPTS_FOLDER,
      size_bytes: file.size,
      mime_type: mimeType,
    })
    .select('id')
    .single()
  if (row.error) {
    await bucket.remove([path])
    throw row.error
  }
  return { path, fileId: row.data.id }
}

/** Best-effort undo of uploadReceipt when the bill itself fails to save. */
async function discardReceipt(receipt: UploadedReceipt): Promise<void> {
  try {
    await supabase.from('files').delete().eq('id', receipt.fileId)
    await supabase.storage.from(STORAGE_BUCKET).remove([receipt.path])
  } catch {
    // Leaving an extra file in Files is better than hiding the real error.
  }
}

/** A 60-second link to a receipt. Throws a plain-language error if the file is gone. */
export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60)
  if (error) throw isMissingFileError(error) ? new Error(MISSING_RECEIPT_MESSAGE) : error
  return data.signedUrl
}

/**
 * Open a receipt in a new tab. The tab opens during the click (so popup
 * blockers allow it) and is pointed at the signed link once it's ready.
 */
export function useOpenReceipt() {
  const { toast } = useToast()
  return useCallback(
    async (path: string) => {
      const tab = window.open('', '_blank')
      try {
        const url = await receiptUrl(path)
        if (tab) {
          tab.opener = null
          tab.location.href = url
        } else {
          toast('Your receipt is ready.', { action: { label: 'Open', onClick: () => window.open(url, '_blank', 'noopener') } })
        }
      } catch (err) {
        tab?.close()
        toast(describeBillError(err), { tone: 'error' })
      }
    },
    [toast],
  )
}

// ---------------------------------------------------------------------------
// Bill writes
// ---------------------------------------------------------------------------

export type SaveBillInput = {
  /** null creates a new bill. */
  id: string | null
  title: string
  category: string
  amountCents: number
  split: SplitType
  dueOn: string | null
  /** paidOn and paidBy are both set or both null (bills_paid_shape). */
  paidOn: string | null
  paidBy: string | null
  notes: string | null
  /** Shares that sum to amountCents, in household order. */
  shares: Share[]
  /** The receipt to keep (existing path) or null for none. Ignored when receiptFile is set. */
  receiptPath: string | null
  /** A new receipt to upload and attach. */
  receiptFile: File | null
}

function useInvalidateBills() {
  const queryClient = useQueryClient()
  return useCallback(
    (...extra: (readonly string[])[]) =>
      Promise.all(
        [qk.bills, qk.balances, ...extra].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    [queryClient],
  )
}

/** Create or update a bill and its shares in one transaction (save_bill RPC). */
export function useSaveBill() {
  const invalidate = useInvalidateBills()
  return useMutation({
    mutationFn: async (input: SaveBillInput) => {
      if ((input.paidOn === null) !== (input.paidBy === null)) {
        throw new Error('Pick who paid and the date they paid.')
      }
      const uploaded = input.receiptFile ? await uploadReceipt(input.receiptFile) : null
      try {
        const saved = rowOf(
          await supabase.rpc('save_bill', {
            p_id: input.id,
            p_title: input.title,
            p_category: input.category,
            p_amount_cents: input.amountCents,
            p_split: input.split,
            p_due_on: input.dueOn,
            p_paid_on: input.paidOn,
            p_paid_by: input.paidBy,
            p_notes: input.notes,
            p_receipt_path: uploaded ? uploaded.path : input.receiptPath,
            p_shares: input.shares,
          }),
        )
        return saved
      } catch (err) {
        if (uploaded) await discardReceipt(uploaded)
        throw err
      }
    },
    onSettled: (_data, _error, input) => invalidate(...(input?.receiptFile ? [qk.files] : [])),
  })
}

/**
 * Mark an unpaid bill paid. Sets paid_on and paid_by together and only
 * touches the bill if it's still unpaid, so two people can't both pay it.
 */
export function useMarkPaid() {
  const invalidate = useInvalidateBills()
  return useMutation({
    mutationFn: async ({ id, paidBy, paidOn }: { id: string; paidBy: string; paidOn: string }) => {
      const patch: TablesUpdate<'bills'> = { paid_on: paidOn, paid_by: paidBy }
      const rows = rowsOf(await supabase.from('bills').update(patch).eq('id', id).is('paid_on', null).select('id'))
      if (rows.length === 0) throw new Error('Your roommate already marked this bill paid or deleted it.')
    },
    onSettled: () => invalidate(),
  })
}

/** Undo "Mark paid". */
export function useMarkUnpaid() {
  const invalidate = useInvalidateBills()
  return useMutation({
    mutationFn: async (id: string) => {
      const patch: TablesUpdate<'bills'> = { paid_on: null, paid_by: null }
      unwrap(await supabase.from('bills').update(patch).eq('id', id).select('id'))
    },
    onSettled: () => invalidate(),
  })
}

/** Delete a bill. Its shares go with it; its receipt stays in Files. */
export function useDeleteBill() {
  const invalidate = useInvalidateBills()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('bills').delete().eq('id', id))
    },
    onSettled: () => invalidate(),
  })
}

// ---------------------------------------------------------------------------
// Settle up
// ---------------------------------------------------------------------------

export type SettleUpInput = {
  /** The person who owed and paid. */
  fromUser: string
  /** The person who was owed. */
  toUser: string
  amountCents: number
  paidOn: string
  note: string | null
}

export function useSettleUp() {
  const invalidate = useInvalidateBills()
  return useMutation({
    mutationFn: async (input: SettleUpInput) =>
      rowOf(
        await supabase
          .from('settlements')
          .insert({
            from_user: input.fromUser,
            to_user: input.toUser,
            amount_cents: input.amountCents,
            paid_on: input.paidOn,
            note: input.note,
          })
          .select()
          .single(),
      ),
    onSettled: () => invalidate(qk.settlements),
  })
}

export function useDeleteSettlement() {
  const invalidate = useInvalidateBills()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('settlements').delete().eq('id', id))
    },
    onSettled: () => invalidate(qk.settlements),
  })
}

// ---------------------------------------------------------------------------
// Recurring bills
// ---------------------------------------------------------------------------

export type RecurringBillInput = {
  /** null creates a new recurring bill. */
  id: string | null
  title: string
  category: string
  amountCents: number
  split: SplitType
  /** Must sum to amountCents. */
  shares: Share[]
  dayOfMonth: number
  defaultPayer: string | null
  leadDays: number
  active: boolean
}

export type RecurringSaveResult = {
  saved: Tables<'recurring_bills'>
  /** Bills generate_recurring_bills added, or null if it failed. */
  generated: number | null
  generateError: unknown
}

/** Ask the database to add any recurring bill that is now within its lead days. */
async function generateRecurringBills(): Promise<{ generated: number | null; generateError: unknown }> {
  const { data, error } = await supabase.rpc('generate_recurring_bills')
  return error ? { generated: null, generateError: error } : { generated: data, generateError: null }
}

function useInvalidateRecurring() {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all(
        [qk.recurringBills, qk.bills].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
    [queryClient],
  )
}

/** Insert or update a recurring bill, then create its next bill if it's due within lead_days. */
export function useSaveRecurringBill() {
  const invalidate = useInvalidateRecurring()
  return useMutation({
    mutationFn: async (input: RecurringBillInput): Promise<RecurringSaveResult> => {
      const total = input.shares.reduce((t, s) => t + s.share_cents, 0)
      if (total !== input.amountCents) throw new Error('The split doesn’t add up to the bill total.')
      const row = {
        title: input.title,
        category: input.category,
        amount_cents: input.amountCents,
        split: input.split,
        shares: input.shares,
        day_of_month: input.dayOfMonth,
        default_payer: input.defaultPayer,
        lead_days: input.leadDays,
        active: input.active,
      }
      const saved = input.id
        ? rowOf(await supabase.from('recurring_bills').update(row).eq('id', input.id).select().single())
        : rowOf(await supabase.from('recurring_bills').insert(row).select().single())
      const generation = saved.active ? await generateRecurringBills() : { generated: 0, generateError: null }
      return { saved, ...generation }
    },
    onSettled: () => invalidate(),
  })
}

/** Pause or resume a recurring bill. Resuming adds its next bill right away if it's due soon. */
export function useSetRecurringActive() {
  const invalidate = useInvalidateRecurring()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      unwrap(await supabase.from('recurring_bills').update({ active }).eq('id', id).select('id').single())
      return active ? generateRecurringBills() : { generated: 0, generateError: null }
    },
    onSettled: () => invalidate(),
  })
}

/** Delete a recurring bill. Bills it already created stay. */
export function useDeleteRecurringBill() {
  const invalidate = useInvalidateRecurring()
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('recurring_bills').delete().eq('id', id))
    },
    onSettled: () => invalidate(),
  })
}

import { Lamp, Receipt, ShoppingBasket, House, Wifi, Zap, type LucideIcon } from 'lucide-react'

export type Category = { value: string; label: string; icon: LucideIcon }

/** Stored in bills.category / recurring_bills.category as the lowercase value. */
export const CATEGORIES: Category[] = [
  { value: 'rent', label: 'Rent', icon: House },
  { value: 'utilities', label: 'Utilities', icon: Zap },
  { value: 'internet', label: 'Internet', icon: Wifi },
  { value: 'groceries', label: 'Groceries', icon: ShoppingBasket },
  { value: 'household', label: 'Household', icon: Lamp },
  { value: 'other', label: 'Other', icon: Receipt },
]

const OTHER = CATEGORIES[CATEGORIES.length - 1]

/** The category for a stored value; unknown values show as Other. */
export function categoryFor(value: string | null | undefined): Category {
  return CATEGORIES.find((c) => c.value === value?.toLowerCase()) ?? OTHER
}

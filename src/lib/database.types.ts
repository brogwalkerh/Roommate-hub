// Database types for supabase-js. Mirrors supabase/migrations.
// Regenerate from the live project with the Supabase type generator when the
// schema changes, then keep the helper exports at the bottom.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Timestamps = { created_at: string }

export type Database = {
  public: {
    Tables: {
      household: {
        Row: { id: number; name: string; timezone: string; updated_at: string }
        Insert: { id?: number; name?: string; timezone?: string; updated_at?: string }
        Update: { id?: number; name?: string; timezone?: string; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string
          color: string
          notify_reminders: boolean
          notify_bills: boolean
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: {
          display_name?: string
          color?: string
          notify_reminders?: boolean
          notify_bills?: boolean
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          title: string
          notes: string | null
          location: string | null
          owner_id: string | null
          all_day: boolean
          starts_at: string | null
          ends_at: string | null
          start_date: string | null
          end_date: string | null
          created_by: string | null
          updated_at: string
        } & Timestamps
        Insert: {
          id?: string
          title: string
          notes?: string | null
          location?: string | null
          owner_id?: string | null
          all_day?: boolean
          starts_at?: string | null
          ends_at?: string | null
          start_date?: string | null
          end_date?: string | null
        }
        Update: {
          title?: string
          notes?: string | null
          location?: string | null
          owner_id?: string | null
          all_day?: boolean
          starts_at?: string | null
          ends_at?: string | null
          start_date?: string | null
          end_date?: string | null
        }
        Relationships: []
      }
      calendar_feeds: {
        Row: {
          id: string
          name: string
          kind: Database['public']['Enums']['feed_kind']
          url_hint: string | null
          color: string
          owner_id: string | null
          privacy: Database['public']['Enums']['feed_privacy']
          last_synced_at: string | null
          last_error: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          name: string
          kind: Database['public']['Enums']['feed_kind']
          url: string
          color?: string
          owner_id?: string | null
          privacy?: Database['public']['Enums']['feed_privacy']
        }
        Update: {
          name?: string
          url?: string
          color?: string
          owner_id?: string | null
          privacy?: Database['public']['Enums']['feed_privacy']
        }
        Relationships: []
      }
      feed_events: {
        Row: {
          id: string
          feed_id: string
          uid: string
          recurrence_id: string
          summary: string | null
          description: string | null
          location: string | null
          url: string | null
          all_day: boolean
          starts_at: string | null
          ends_at: string | null
          start_date: string | null
          end_date: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'feed_events_feed_id_fkey'
            columns: ['feed_id']
            isOneToOne: false
            referencedRelation: 'calendar_feeds'
            referencedColumns: ['id']
          },
        ]
      }
      reminders: {
        Row: {
          id: string
          title: string
          notes: string | null
          due_at: string
          repeat: Database['public']['Enums']['repeat_rule']
          repeat_anchor: string
          assignee_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_by: string | null
          updated_at: string
        } & Timestamps
        Insert: {
          id?: string
          title: string
          notes?: string | null
          due_at: string
          repeat?: Database['public']['Enums']['repeat_rule']
          assignee_id?: string | null
        }
        Update: {
          title?: string
          notes?: string | null
          due_at?: string
          repeat?: Database['public']['Enums']['repeat_rule']
          assignee_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
        }
        Relationships: []
      }
      reminder_completions: {
        Row: {
          id: string
          reminder_id: string
          due_at: string
          completed_at: string
          completed_by: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'reminder_completions_reminder_id_fkey'
            columns: ['reminder_id']
            isOneToOne: false
            referencedRelation: 'reminders'
            referencedColumns: ['id']
          },
        ]
      }
      notes: {
        Row: {
          id: string
          title: string
          body: string
          pinned: boolean
          created_by: string | null
          updated_by: string | null
          updated_at: string
        } & Timestamps
        Insert: { id?: string; title?: string; body?: string; pinned?: boolean }
        Update: { title?: string; body?: string; pinned?: boolean }
        Relationships: []
      }
      recurring_bills: {
        Row: {
          id: string
          title: string
          category: string
          amount_cents: number
          split: Database['public']['Enums']['split_type']
          shares: Json
          day_of_month: number
          default_payer: string | null
          lead_days: number
          active: boolean
          created_by: string | null
          updated_at: string
        } & Timestamps
        Insert: {
          id?: string
          title: string
          category?: string
          amount_cents: number
          split?: Database['public']['Enums']['split_type']
          shares?: Json
          day_of_month: number
          default_payer?: string | null
          lead_days?: number
          active?: boolean
        }
        Update: {
          title?: string
          category?: string
          amount_cents?: number
          split?: Database['public']['Enums']['split_type']
          shares?: Json
          day_of_month?: number
          default_payer?: string | null
          lead_days?: number
          active?: boolean
        }
        Relationships: []
      }
      bills: {
        Row: {
          id: string
          title: string
          category: string
          amount_cents: number
          split: Database['public']['Enums']['split_type']
          due_on: string | null
          paid_on: string | null
          paid_by: string | null
          notes: string | null
          receipt_path: string | null
          recurring_bill_id: string | null
          created_by: string | null
          updated_at: string
        } & Timestamps
        Insert: never // use the save_bill RPC so shares stay consistent
        Update: {
          paid_on?: string | null
          paid_by?: string | null
          receipt_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bills_recurring_bill_id_fkey'
            columns: ['recurring_bill_id']
            isOneToOne: false
            referencedRelation: 'recurring_bills'
            referencedColumns: ['id']
          },
        ]
      }
      bill_shares: {
        Row: { bill_id: string; user_id: string; share_cents: number; percent: number | null }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'bill_shares_bill_id_fkey'
            columns: ['bill_id']
            isOneToOne: false
            referencedRelation: 'bills'
            referencedColumns: ['id']
          },
        ]
      }
      settlements: {
        Row: {
          id: string
          from_user: string
          to_user: string
          amount_cents: number
          paid_on: string
          note: string | null
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          from_user: string
          to_user: string
          amount_cents: number
          paid_on?: string
          note?: string | null
        }
        Update: { amount_cents?: number; paid_on?: string; note?: string | null }
        Relationships: []
      }
      files: {
        Row: {
          id: string
          storage_path: string
          name: string
          folder: string
          size_bytes: number
          mime_type: string | null
          uploaded_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          storage_path: string
          name: string
          folder?: string
          size_bytes?: number
          mime_type?: string | null
        }
        Update: { name?: string; folder?: string }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
        } & Timestamps
        Insert: { endpoint: string; p256dh: string; auth: string; user_agent?: string | null }
        Update: { p256dh?: string; auth?: string; user_agent?: string | null }
        Relationships: []
      }
    }
    Views: {
      balances: {
        Row: { user_id: string; net_cents: number }
        Relationships: []
      }
    }
    Functions: {
      is_member: { Args: Record<PropertyKey, never>; Returns: boolean }
      complete_reminder: {
        Args: { p_id: string }
        Returns: Database['public']['Tables']['reminders']['Row']
      }
      undo_complete_reminder: {
        Args: { p_id: string }
        Returns: Database['public']['Tables']['reminders']['Row']
      }
      save_bill: {
        Args: {
          p_id: string | null
          p_title: string
          p_category: string
          p_amount_cents: number
          p_split: Database['public']['Enums']['split_type']
          p_due_on: string | null
          p_paid_on: string | null
          p_paid_by: string | null
          p_notes: string | null
          p_receipt_path: string | null
          p_shares: Json
        }
        Returns: Database['public']['Tables']['bills']['Row']
      }
      generate_recurring_bills: { Args: Record<PropertyKey, never>; Returns: number }
      next_occurrence: {
        Args: {
          p_anchor: string
          p_repeat: Database['public']['Enums']['repeat_rule']
          p_after: string
          p_tz: string
        }
        Returns: string
      }
    }
    Enums: {
      feed_kind: 'airbnb' | 'ical'
      feed_privacy: 'details' | 'busy'
      repeat_rule: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'
      split_type: 'equal' | 'exact' | 'percent'
    }
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

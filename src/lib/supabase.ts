import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The shape of the `public` schema, so query results are typed instead of
 * `any`. Keep this in sync with `supabase/schema.sql`.
 */
export interface Database {
  public: {
    Tables: {
      habits: {
        Row: {
          id: string;
          name: string;
          icon: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          icon?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          icon?: string | null;
          active?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      habit_logs: {
        Row: {
          id: string;
          habit_id: string;
          date: string;
          completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          habit_id: string;
          date: string;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          completed?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey";
            columns: ["habit_id"];
            isOneToOne: false;
            referencedRelation: "habits";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_tasks: {
        Row: {
          id: string;
          date: string;
          title: string;
          description: string | null;
          completed: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          date: string;
          title: string;
          description?: string | null;
          completed?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          date?: string;
          title?: string;
          description?: string | null;
          completed?: boolean;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/**
 * Thrown when the Supabase environment variables are missing. Kept distinct
 * from network failures so the UI can tell the user to check `.env.local`
 * rather than suggesting a retry that can never succeed.
 */
export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local and restart the dev server.",
    );
    this.name = "SupabaseConfigError";
  }
}

let client: SupabaseClient<Database> | null = null;

/**
 * The one Supabase client the app shares. It is created on first use rather
 * than at import time so that a build without credentials still succeeds — the
 * missing configuration surfaces as an error state in the UI instead.
 *
 * Only the anon key is ever used here. It ships to the browser by design and is
 * safe to do so *because* row level security is enabled on every table. The
 * service role key bypasses RLS and must never appear in client code.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) return client;

  // These must be referenced as full literals: Next.js inlines `NEXT_PUBLIC_*`
  // variables at build time by substituting the exact expression.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) throw new SupabaseConfigError();

  client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

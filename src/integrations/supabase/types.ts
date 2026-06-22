export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          meta: Json
          owner_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          meta?: Json
          owner_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          meta?: Json
          owner_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          address: string | null
          config: Json
          currency: string
          email: string | null
          name: string | null
          owner_id: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          config?: Json
          currency?: string
          email?: string | null
          name?: string | null
          owner_id: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          config?: Json
          currency?: string
          email?: string | null
          name?: string | null
          owner_id?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          name: string | null
          owner_id: string
          phone: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          owner_id: string
          phone: string
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          owner_id?: string
          phone?: string
          source?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fee_settings: {
        Row: {
          id: boolean
          min_withdraw: number
          sms_price_per_credit: number
          updated_at: string
          withdraw_fee_flat: number
          withdraw_fee_pct: number
        }
        Insert: {
          id?: boolean
          min_withdraw?: number
          sms_price_per_credit?: number
          updated_at?: string
          withdraw_fee_flat?: number
          withdraw_fee_pct?: number
        }
        Update: {
          id?: boolean
          min_withdraw?: number
          sms_price_per_credit?: number
          updated_at?: string
          withdraw_fee_flat?: number
          withdraw_fee_pct?: number
        }
        Relationships: []
      }
      fee_withdrawals: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          destination: string
          id: string
          method: string
          reference: string | null
          status: string
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string
          destination: string
          id?: string
          method?: string
          reference?: string | null
          status?: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          destination?: string
          id?: string
          method?: string
          reference?: string | null
          status?: string
        }
        Relationships: []
      }
      gateways: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          owner_id: string
          provider: string
          secret_encrypted: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          owner_id: string
          provider: string
          secret_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          owner_id?: string
          provider?: string
          secret_encrypted?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hotspot_sessions: {
        Row: {
          bytes_in: number | null
          bytes_out: number | null
          ended_at: string | null
          id: string
          ip: string | null
          is_active: boolean
          mac: string | null
          raw: Json | null
          router_id: string | null
          started_at: string
          subscription_id: string | null
          uptime_seconds: number | null
          username: string | null
        }
        Insert: {
          bytes_in?: number | null
          bytes_out?: number | null
          ended_at?: string | null
          id?: string
          ip?: string | null
          is_active?: boolean
          mac?: string | null
          raw?: Json | null
          router_id?: string | null
          started_at?: string
          subscription_id?: string | null
          uptime_seconds?: number | null
          username?: string | null
        }
        Update: {
          bytes_in?: number | null
          bytes_out?: number | null
          ended_at?: string | null
          id?: string
          ip?: string | null
          is_active?: boolean
          mac?: string | null
          raw?: Json | null
          router_id?: string | null
          started_at?: string
          subscription_id?: string | null
          uptime_seconds?: number | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hotspot_sessions_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotspot_sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          due_date: string | null
          id: string
          invoice_number: string
          paid_at: string | null
          status: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          paid_at?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          method: string
          raw_payload: Json | null
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          raw_payload?: Json | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          raw_payload?: Json | null
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          data_limit_mb: number | null
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          price: number
          rate_limit_down_kbps: number | null
          rate_limit_up_kbps: number | null
          shared_users: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          data_limit_mb?: number | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          price?: number
          rate_limit_down_kbps?: number | null
          rate_limit_up_kbps?: number | null
          shared_users?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          data_limit_mb?: number | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          price?: number
          rate_limit_down_kbps?: number | null
          rate_limit_up_kbps?: number | null
          shared_users?: number
          updated_at?: string
        }
        Relationships: []
      }
      portal_settings: {
        Row: {
          business_name: string | null
          config: Json
          logo_url: string | null
          owner_id: string
          primary_color: string | null
          template: string
          updated_at: string
          video_required: boolean
          video_url: string | null
          welcome_text: string | null
        }
        Insert: {
          business_name?: string | null
          config?: Json
          logo_url?: string | null
          owner_id: string
          primary_color?: string | null
          template?: string
          updated_at?: string
          video_required?: boolean
          video_url?: string | null
          welcome_text?: string | null
        }
        Update: {
          business_name?: string | null
          config?: Json
          logo_url?: string | null
          owner_id?: string
          primary_color?: string | null
          template?: string
          updated_at?: string
          video_required?: boolean
          video_url?: string | null
          welcome_text?: string | null
        }
        Relationships: []
      }
      print_batches: {
        Row: {
          batch_id: string | null
          count: number
          created_at: string
          design: string
          id: string
          owner_id: string
          per_page: number
          size_preset: string
        }
        Insert: {
          batch_id?: string | null
          count?: number
          created_at?: string
          design?: string
          id?: string
          owner_id: string
          per_page?: number
          size_preset?: string
        }
        Update: {
          batch_id?: string | null
          count?: number
          created_at?: string
          design?: string
          id?: string
          owner_id?: string
          per_page?: number
          size_preset?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "voucher_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      routers: {
        Row: {
          created_at: string
          created_by: string | null
          host: string
          id: string
          last_seen: string | null
          name: string
          notes: string | null
          password_encrypted: string
          port: number
          status: string
          updated_at: string
          use_tls: boolean
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          host: string
          id?: string
          last_seen?: string | null
          name: string
          notes?: string | null
          password_encrypted: string
          port?: number
          status?: string
          updated_at?: string
          use_tls?: boolean
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          host?: string
          id?: string
          last_seen?: string | null
          name?: string
          notes?: string | null
          password_encrypted?: string
          port?: number
          status?: string
          updated_at?: string
          use_tls?: boolean
          username?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      sms_credit_purchases: {
        Row: {
          amount: number
          created_at: string
          credits: number
          currency: string
          id: string
          owner_id: string
          payment_method: string
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          credits: number
          currency?: string
          id?: string
          owner_id: string
          payment_method?: string
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          owner_id?: string
          payment_method?: string
          reference?: string | null
          status?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          body: string
          created_at: string
          error: string | null
          id: string
          kind: string
          name: string | null
          owner_id: string
          parts: number
          phone: string
          provider_ref: string | null
          status: string
        }
        Insert: {
          body: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          name?: string | null
          owner_id: string
          parts?: number
          phone: string
          provider_ref?: string | null
          status?: string
        }
        Update: {
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          name?: string | null
          owner_id?: string
          parts?: number
          phone?: string
          provider_ref?: string | null
          status?: string
        }
        Relationships: []
      }
      sms_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          owner_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          customer_id: string | null
          expires_at: string | null
          hotspot_password: string | null
          hotspot_username: string | null
          id: string
          plan_id: string | null
          router_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          hotspot_password?: string | null
          hotspot_username?: string | null
          id?: string
          plan_id?: string | null
          router_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          hotspot_password?: string | null
          hotspot_username?: string | null
          id?: string
          plan_id?: string | null
          router_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bots: {
        Row: {
          bot_key: string
          chat_id: string | null
          created_at: string
          enabled: boolean
          id: string
          owner_id: string
          token_encrypted: string | null
          updated_at: string
        }
        Insert: {
          bot_key: string
          chat_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id: string
          token_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          bot_key?: string
          chat_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id?: string
          token_encrypted?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_batches: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          plan_id: string | null
          quantity: number
          router_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          plan_id?: string | null
          quantity: number
          router_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          plan_id?: string | null
          quantity?: number
          router_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_batches_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_batches_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_prefix_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          owner_id: string
          plan_id: string | null
          prefix: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id: string
          plan_id?: string | null
          prefix: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          owner_id?: string
          plan_id?: string | null
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_prefix_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          batch_id: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          plan_id: string | null
          router_id: string | null
          status: string
          updated_at: string
          used_at: string | null
          used_by_customer_id: string | null
        }
        Insert: {
          batch_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          router_id?: string | null
          status?: string
          updated_at?: string
          used_at?: string | null
          used_by_customer_id?: string | null
        }
        Update: {
          batch_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          plan_id?: string | null
          router_id?: string | null
          status?: string
          updated_at?: string
          used_at?: string | null
          used_by_customer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "voucher_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_used_by_customer_id_fkey"
            columns: ["used_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          owner_id: string
          sms_credits: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          owner_id: string
          sms_credits?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          owner_id?: string
          sms_credits?: number
          updated_at?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount: number
          created_at: string
          destination: string
          fee: number
          id: string
          method: string
          net: number
          notes: string | null
          owner_id: string
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          destination: string
          fee?: number
          id?: string
          method?: string
          net: number
          notes?: string | null
          owner_id: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          destination?: string
          fee?: number
          id?: string
          method?: string
          net?: number
          notes?: string | null
          owner_id?: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operator", "viewer"],
    },
  },
} as const

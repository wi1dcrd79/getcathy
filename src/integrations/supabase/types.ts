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
      assets: {
        Row: {
          asset_tag: string
          assigned_to: string | null
          bin: string
          category: Database["public"]["Enums"]["asset_category"]
          company_id: string | null
          created_at: string
          current_location: string
          id: string
          image_url: string | null
          location: string
          make_model: string
          name: string
          owner_id: string | null
          serial_or_vin: string
          site: string
          status: string
          zone: string
        }
        Insert: {
          asset_tag: string
          assigned_to?: string | null
          bin?: string
          category?: Database["public"]["Enums"]["asset_category"]
          company_id?: string | null
          created_at?: string
          current_location?: string
          id?: string
          image_url?: string | null
          location?: string
          make_model?: string
          name: string
          owner_id?: string | null
          serial_or_vin?: string
          site?: string
          status?: string
          zone?: string
        }
        Update: {
          asset_tag?: string
          assigned_to?: string | null
          bin?: string
          category?: Database["public"]["Enums"]["asset_category"]
          company_id?: string | null
          created_at?: string
          current_location?: string
          id?: string
          image_url?: string | null
          location?: string
          make_model?: string
          name?: string
          owner_id?: string | null
          serial_or_vin?: string
          site?: string
          status?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          grace_days: number
          id: string
          name: string
          past_due_since: string | null
          seat_limit: number
          subscription_status: string
          subscription_tier: string
        }
        Insert: {
          created_at?: string
          grace_days?: number
          id?: string
          name: string
          past_due_since?: string | null
          seat_limit?: number
          subscription_status?: string
          subscription_tier?: string
        }
        Update: {
          created_at?: string
          grace_days?: number
          id?: string
          name?: string
          past_due_since?: string | null
          seat_limit?: number
          subscription_status?: string
          subscription_tier?: string
        }
        Relationships: []
      }
      company_billing: {
        Row: {
          company_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_trades: {
        Row: {
          company_id: string
          created_at: string
          id: string
          recurrence_months: number
          trade_name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          recurrence_months?: number
          trade_name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          recurrence_months?: number
          trade_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_trades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          asset_id: string
          company_id: string | null
          created_at: string
          expiration_date: string
          id: string
          inspected_by: string | null
          inspection_date: string
          inspection_type: string
          inspector_name: string
          notes: string | null
          owner_id: string | null
          result: Database["public"]["Enums"]["inspection_result"]
        }
        Insert: {
          asset_id: string
          company_id?: string | null
          created_at?: string
          expiration_date: string
          id?: string
          inspected_by?: string | null
          inspection_date?: string
          inspection_type?: string
          inspector_name: string
          notes?: string | null
          owner_id?: string | null
          result?: Database["public"]["Enums"]["inspection_result"]
        }
        Update: {
          asset_id?: string
          company_id?: string | null
          created_at?: string
          expiration_date?: string
          id?: string
          inspected_by?: string | null
          inspection_date?: string
          inspection_type?: string
          inspector_name?: string
          notes?: string | null
          owner_id?: string | null
          result?: Database["public"]["Enums"]["inspection_result"]
        }
        Relationships: [
          {
            foreignKeyName: "inspections_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      location_history: {
        Row: {
          asset_id: string
          asset_tag: string
          captured_at: string
          company_id: string | null
          created_at: string
          expected_from: string
          id: string
          local_sequence_id: string
          moved_by: string
          moved_from: string
          moved_to: string
          sync_status: string
        }
        Insert: {
          asset_id: string
          asset_tag?: string
          captured_at?: string
          company_id?: string | null
          created_at?: string
          expected_from?: string
          id?: string
          local_sequence_id?: string
          moved_by?: string
          moved_from?: string
          moved_to: string
          sync_status?: string
        }
        Update: {
          asset_id?: string
          asset_tag?: string
          captured_at?: string
          company_id?: string | null
          created_at?: string
          expected_from?: string
          id?: string
          local_sequence_id?: string
          moved_by?: string
          moved_from?: string
          moved_to?: string
          sync_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_certs: {
        Row: {
          approval_status: string
          approved_at: string | null
          cert_name: string
          cert_number: string | null
          company_id: string
          created_at: string
          expiration_date: string | null
          id: string
          issue_date: string
          personnel_id: string
          submitted_by: string | null
          verified_by: string | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          cert_name: string
          cert_number?: string | null
          company_id: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          issue_date: string
          personnel_id: string
          submitted_by?: string | null
          verified_by?: string | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          cert_name?: string
          cert_number?: string | null
          company_id?: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          issue_date?: string
          personnel_id?: string
          submitted_by?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_certs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_certs_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel_records"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_records: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          first_name: string
          id: string
          last_name: string
          status: string
          trade_title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          first_name: string
          id?: string
          last_name: string
          status?: string
          trade_title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          first_name?: string
          id?: string
          last_name?: string
          status?: string
          trade_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          is_super_admin: boolean
          plan: string
          role: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id: string
          is_super_admin?: boolean
          plan?: string
          role?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_super_admin?: boolean
          plan?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          company_id: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          company_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          company_id?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          current_session_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_session_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_session_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      welder_qualifications: {
        Row: {
          company_id: string | null
          continuity_date: string
          created_at: string
          expiration_date: string
          id: string
          owner_id: string | null
          process: Database["public"]["Enums"]["weld_process"]
          standard: string
          welder_id_stamp: string
          welder_name: string
        }
        Insert: {
          company_id?: string | null
          continuity_date: string
          created_at?: string
          expiration_date: string
          id?: string
          owner_id?: string | null
          process?: Database["public"]["Enums"]["weld_process"]
          standard: string
          welder_id_stamp: string
          welder_name: string
        }
        Update: {
          company_id?: string | null
          continuity_date?: string
          created_at?: string
          expiration_date?: string
          id?: string
          owner_id?: string | null
          process?: Database["public"]["Enums"]["weld_process"]
          standard?: string
          welder_id_stamp?: string
          welder_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "welder_qualifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      company_team_directory: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string | null
          role: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          role?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bootstrap_current_user: { Args: never; Returns: string }
      rotate_session_token: { Args: { _token: string }; Returns: undefined }
    }
    Enums: {
      asset_category: "rigging" | "welder_cert" | "heavy_equipment" | "ppe"
      inspection_result: "Pass" | "Fail" | "Needs Service"
      weld_process: "SMAW" | "GTAW" | "GMAW" | "FCAW"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      asset_category: ["rigging", "welder_cert", "heavy_equipment", "ppe"],
      inspection_result: ["Pass", "Fail", "Needs Service"],
      weld_process: ["SMAW", "GTAW", "GMAW", "FCAW"],
    },
  },
} as const

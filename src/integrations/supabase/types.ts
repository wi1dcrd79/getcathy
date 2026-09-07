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
          zone: string
        }
        Insert: {
          asset_tag: string
          assigned_to?: string | null
          bin?: string
          category?: Database["public"]["Enums"]["asset_category"]
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
          zone?: string
        }
        Update: {
          asset_tag?: string
          assigned_to?: string | null
          bin?: string
          category?: Database["public"]["Enums"]["asset_category"]
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
          zone?: string
        }
        Relationships: []
      }
      inspections: {
        Row: {
          asset_id: string
          created_at: string
          expiration_date: string
          id: string
          inspection_date: string
          inspector_name: string
          notes: string | null
          owner_id: string | null
          result: Database["public"]["Enums"]["inspection_result"]
        }
        Insert: {
          asset_id: string
          created_at?: string
          expiration_date: string
          id?: string
          inspection_date?: string
          inspector_name: string
          notes?: string | null
          owner_id?: string | null
          result?: Database["public"]["Enums"]["inspection_result"]
        }
        Update: {
          asset_id?: string
          created_at?: string
          expiration_date?: string
          id?: string
          inspection_date?: string
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
        ]
      }
      location_history: {
        Row: {
          asset_id: string
          asset_tag: string
          created_at: string
          id: string
          moved_by: string
          moved_from: string
          moved_to: string
        }
        Insert: {
          asset_id: string
          asset_tag?: string
          created_at?: string
          id?: string
          moved_by?: string
          moved_from?: string
          moved_to: string
        }
        Update: {
          asset_id?: string
          asset_tag?: string
          created_at?: string
          id?: string
          moved_by?: string
          moved_from?: string
          moved_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_history_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          plan: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          plan?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      welder_qualifications: {
        Row: {
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

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
      asset_ledger: {
        Row: {
          action_type: string
          actor_id: string | null
          asset_id: string
          company_id: string
          created_at: string
          expected_prior_event_id: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          asset_id: string
          company_id: string
          created_at?: string
          expected_prior_event_id?: string | null
          id: string
          metadata?: Json
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          asset_id?: string
          company_id?: string
          created_at?: string
          expected_prior_event_id?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "asset_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_ledger_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "asset_ledger_expected_prior_event_id_fkey"
            columns: ["expected_prior_event_id"]
            isOneToOne: false
            referencedRelation: "asset_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_tag: string
          assigned_to: string | null
          bin: string
          category: Database["public"]["Enums"]["asset_category"]
          company_id: string | null
          created_at: string
          current_ledger_event_id: string | null
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
          current_ledger_event_id?: string | null
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
          current_ledger_event_id?: string | null
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
          {
            foreignKeyName: "assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "assets_current_ledger_event_id_fkey"
            columns: ["current_ledger_event_id"]
            isOneToOne: false
            referencedRelation: "asset_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_binders: {
        Row: {
          company_id: string
          compiled_at: string | null
          content_sha256: string | null
          created_at: string
          created_by: string | null
          id: string
          pdf_storage_path: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          company_id: string
          compiled_at?: string | null
          content_sha256?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_storage_path?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          compiled_at?: string | null
          content_sha256?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_storage_path?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_binders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_binders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "audit_binders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_binders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cert_notifications: {
        Row: {
          cert_id: string
          channel: string
          company_id: string
          created_at: string
          delivery_status: string
          dispatched_at: string | null
          id: string
          notice_payload: Json
          provider_message_id: string | null
          recipient_email: string
          recipient_role: string
          resolved_at: string | null
          threshold_days: number
        }
        Insert: {
          cert_id: string
          channel?: string
          company_id: string
          created_at?: string
          delivery_status?: string
          dispatched_at?: string | null
          id?: string
          notice_payload?: Json
          provider_message_id?: string | null
          recipient_email: string
          recipient_role: string
          resolved_at?: string | null
          threshold_days: number
        }
        Update: {
          cert_id?: string
          channel?: string
          company_id?: string
          created_at?: string
          delivery_status?: string
          dispatched_at?: string | null
          id?: string
          notice_payload?: Json
          provider_message_id?: string | null
          recipient_email?: string
          recipient_role?: string
          resolved_at?: string | null
          threshold_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "cert_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cert_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_cert_notifications_cert"
            columns: ["cert_id", "company_id"]
            isOneToOne: false
            referencedRelation: "personnel_certs"
            referencedColumns: ["id", "company_id"]
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
          {
            foreignKeyName: "company_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      compliance_report_jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          period_end: string | null
          period_start: string | null
          requested_by: string | null
          status: string
          summary: Json
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          requested_by?: string | null
          status?: string
          summary?: Json
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          requested_by?: string | null
          status?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "compliance_report_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_report_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      corrective_actions: {
        Row: {
          asset_id: string | null
          assigned_to: string | null
          company_id: string
          created_at: string
          description: string
          due_date: string
          id: string
          priority: string
          resolved_at: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
          verified_by: string | null
          version: number
        }
        Insert: {
          asset_id?: string | null
          assigned_to?: string | null
          company_id: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          priority: string
          resolved_at?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
          verified_by?: string | null
          version?: number
        }
        Update: {
          asset_id?: string | null
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "corrective_actions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "corrective_actions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crash_reports: {
        Row: {
          app_build: string
          company_id: string
          created_at: string
          detail: string
          device_kind: string
          id: string
          occurrences: number
          platform: string
          problem: string
          recovery_actions: Json
          reported_by: string | null
          reviewer_notes: string | null
          route: string
          screen_label: string
          severity: string
          status: string
          updated_at: string
          viewport: string
          was_offline: boolean
        }
        Insert: {
          app_build?: string
          company_id: string
          created_at?: string
          detail: string
          device_kind?: string
          id?: string
          occurrences?: number
          platform?: string
          problem: string
          recovery_actions?: Json
          reported_by?: string | null
          reviewer_notes?: string | null
          route: string
          screen_label: string
          severity?: string
          status?: string
          updated_at?: string
          viewport?: string
          was_offline?: boolean
        }
        Update: {
          app_build?: string
          company_id?: string
          created_at?: string
          detail?: string
          device_kind?: string
          id?: string
          occurrences?: number
          platform?: string
          problem?: string
          recovery_actions?: Json
          reported_by?: string | null
          reviewer_notes?: string | null
          route?: string
          screen_label?: string
          severity?: string
          status?: string
          updated_at?: string
          viewport?: string
          was_offline?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "crash_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crash_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
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
          {
            foreignKeyName: "custom_trades_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      evidence_reviews: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          document_names: Json
          findings: Json
          id: string
          overall_status: string
          record_refs: Json
          summary: string
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          document_names?: Json
          findings?: Json
          id?: string
          overall_status: string
          record_refs?: Json
          summary: string
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          document_names?: Json
          findings?: Json
          id?: string
          overall_status?: string
          record_refs?: Json
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
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
          {
            foreignKeyName: "inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      job_failures: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          attempts: number
          company_id: string | null
          crash_report_id: string | null
          created_at: string
          error_message: string
          event_name: string
          function_id: string
          id: string
          payload: Json
          replay_count: number
          replayed_at: string | null
          replayed_by: string | null
          resolution_reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attempts?: number
          company_id?: string | null
          crash_report_id?: string | null
          created_at?: string
          error_message: string
          event_name: string
          function_id: string
          id?: string
          payload?: Json
          replay_count?: number
          replayed_at?: string | null
          replayed_by?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attempts?: number
          company_id?: string | null
          crash_report_id?: string | null
          created_at?: string
          error_message?: string
          event_name?: string
          function_id?: string
          id?: string
          payload?: Json
          replay_count?: number
          replayed_at?: string | null
          replayed_by?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_failures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_failures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "job_failures_crash_report_id_fkey"
            columns: ["crash_report_id"]
            isOneToOne: false
            referencedRelation: "crash_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_failures_replayed_by_fkey"
            columns: ["replayed_by"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_failures_replayed_by_fkey"
            columns: ["replayed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_failures_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_failures_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_locks: {
        Row: {
          holder: string
          lock_name: string
          locked_until: string
          updated_at: string
        }
        Insert: {
          holder: string
          lock_name: string
          locked_until: string
          updated_at?: string
        }
        Update: {
          holder?: string
          lock_name?: string
          locked_until?: string
          updated_at?: string
        }
        Relationships: []
      }
      ledger_conflicts: {
        Row: {
          asset_id: string
          company_id: string
          competing_actor_id: string | null
          conflicting_event_id: string | null
          created_at: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          asset_id: string
          company_id: string
          competing_actor_id?: string | null
          conflicting_event_id?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          asset_id?: string
          company_id?: string
          competing_actor_id?: string | null
          conflicting_event_id?: string | null
          created_at?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_conflicts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_conflicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_conflicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ledger_conflicts_competing_actor_id_fkey"
            columns: ["competing_actor_id"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_conflicts_competing_actor_id_fkey"
            columns: ["competing_actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_conflicts_conflicting_event_id_fkey"
            columns: ["conflicting_event_id"]
            isOneToOne: false
            referencedRelation: "asset_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "location_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
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
            foreignKeyName: "personnel_certs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "personnel_certs_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "personnel_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_certs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_certs_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_records: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          employee_id: string
          first_name: string
          id: string
          last_name: string
          status: string
          supervisor_id: string | null
          trade_title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          employee_id: string
          first_name: string
          id?: string
          last_name: string
          status?: string
          supervisor_id?: string | null
          trade_title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          employee_id?: string
          first_name?: string
          id?: string
          last_name?: string
          status?: string
          supervisor_id?: string | null
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
          {
            foreignKeyName: "personnel_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "personnel_records_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_records_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      risk_assessments: {
        Row: {
          actions: Json
          asset_tag: string | null
          company_id: string
          created_at: string
          created_by: string
          id: string
          notes: string
          overall_risk: string
          photo_count: number
          summary: string
        }
        Insert: {
          actions?: Json
          asset_tag?: string | null
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          notes: string
          overall_risk: string
          photo_count?: number
          summary: string
        }
        Update: {
          actions?: Json
          asset_tag?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string
          overall_risk?: string
          photo_count?: number
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      signatures: {
        Row: {
          audit_binder_id: string | null
          cert_verification_id: string | null
          company_id: string
          content_sha256: string
          device_metadata: Json
          id: string
          inspection_id: string | null
          ip_address: unknown
          offline_created_at: string | null
          risk_assessment_id: string | null
          signature_image_path: string | null
          signed_at: string | null
          signer_id: string
          signer_role: string
          synced_at: string
        }
        Insert: {
          audit_binder_id?: string | null
          cert_verification_id?: string | null
          company_id: string
          content_sha256: string
          device_metadata?: Json
          id?: string
          inspection_id?: string | null
          ip_address?: unknown
          offline_created_at?: string | null
          risk_assessment_id?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signer_id: string
          signer_role: string
          synced_at?: string
        }
        Update: {
          audit_binder_id?: string | null
          cert_verification_id?: string | null
          company_id?: string
          content_sha256?: string
          device_metadata?: Json
          id?: string
          inspection_id?: string | null
          ip_address?: unknown
          offline_created_at?: string | null
          risk_assessment_id?: string | null
          signature_image_path?: string | null
          signed_at?: string | null
          signer_id?: string
          signer_role?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signatures_audit_binder_id_fkey"
            columns: ["audit_binder_id"]
            isOneToOne: true
            referencedRelation: "audit_binders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_cert_verification_id_fkey"
            columns: ["cert_verification_id"]
            isOneToOne: true
            referencedRelation: "personnel_certs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "signatures_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: true
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_risk_assessment_id_fkey"
            columns: ["risk_assessment_id"]
            isOneToOne: true
            referencedRelation: "risk_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "company_team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
      telemetry_syncs: {
        Row: {
          company_id: string
          crash_occurrences: number
          critical_risks: number
          id: string
          open_crashes: number
          open_job_failures: number
          synced_at: string
          window_hours: number
        }
        Insert: {
          company_id: string
          crash_occurrences?: number
          critical_risks?: number
          id?: string
          open_crashes?: number
          open_job_failures?: number
          synced_at?: string
          window_hours?: number
        }
        Update: {
          company_id?: string
          crash_occurrences?: number
          critical_risks?: number
          id?: string
          open_crashes?: number
          open_job_failures?: number
          synced_at?: string
          window_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_syncs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telemetry_syncs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
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
          {
            foreignKeyName: "welder_qualifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Views: {
      company_compliance_rollups: {
        Row: {
          calculated_at: string | null
          chronic_asset_count: number | null
          company_id: string | null
          inspection_failure_rate_90d: number | null
          lapsed_certs_count: number | null
          mttr_p1_hours: number | null
          mttr_p2_hours: number | null
          open_p1_count: number | null
          open_p2_count: number | null
          open_p3_count: number | null
          resolution_compliance_ratio_90d: number | null
        }
        Insert: {
          calculated_at?: never
          chronic_asset_count?: never
          company_id?: string | null
          inspection_failure_rate_90d?: never
          lapsed_certs_count?: never
          mttr_p1_hours?: never
          mttr_p2_hours?: never
          open_p1_count?: never
          open_p2_count?: never
          open_p3_count?: never
          resolution_compliance_ratio_90d?: never
        }
        Update: {
          calculated_at?: never
          chronic_asset_count?: never
          company_id?: string | null
          inspection_failure_rate_90d?: never
          lapsed_certs_count?: never
          mttr_p1_hours?: never
          mttr_p2_hours?: never
          open_p1_count?: never
          open_p2_count?: never
          open_p3_count?: never
          resolution_compliance_ratio_90d?: never
        }
        Relationships: []
      }
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
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_compliance_rollups"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Functions: {
      acquire_job_lock: {
        Args: { _holder: string; _name: string; _seconds: number }
        Returns: boolean
      }
      bootstrap_current_user: { Args: never; Returns: string }
      find_certs_crossing_threshold: {
        Args: { p_threshold_days: number }
        Returns: {
          admin_fallback_email: string
          cert_id: string
          cert_name: string
          cert_number: string
          company_id: string
          expiration_date: string
          supervisor_email: string
          welder_email: string
        }[]
      }
      replay_notification_failure: {
        Args: { p_failure_id: string }
        Returns: Json
      }
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

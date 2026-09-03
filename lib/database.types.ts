// Generated from the disposable local Supabase schema on 2026-08-29.
// ORD-03 migration SHA-256: 8c12c5413d103b0d55fc2a324fcc19d0f9152f270e809fb70d6eec7babe2953f.
// Do not hand-edit. Regenerate after every database migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  private: {
    Tables: {
      assignment_change_idempotency: {
        Row: {
          actor_profile_id: string
          assignment_id: string | null
          created_at: string
          decision: string
          idempotency_key_hash: string
          lifecycle_status: string | null
          reason_code: string
          request_hash: string
        }
        Insert: {
          actor_profile_id: string
          assignment_id?: string | null
          created_at?: string
          decision: string
          idempotency_key_hash: string
          lifecycle_status?: string | null
          reason_code: string
          request_hash: string
        }
        Update: {
          actor_profile_id?: string
          assignment_id?: string | null
          created_at?: string
          decision?: string
          idempotency_key_hash?: string
          lifecycle_status?: string | null
          reason_code?: string
          request_hash?: string
        }
        Relationships: []
      }
      checkout_rate_limit_counters: {
        Row: {
          attempt_count: number
          last_attempted_at: string
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Insert: {
          attempt_count: number
          last_attempted_at: string
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Update: {
          attempt_count?: number
          last_attempted_at?: string
          scope?: string
          subject_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      engagement_access_audit_receipts: {
        Row: {
          actor_profile_id: string | null
          assignment_id: string | null
          assignment_role: string | null
          decision: string
          event_code: string
          occurred_at: string
          operation_code: string
          order_id: string | null
          reason_code: string
          receipt_id: number
          related_assignment_id: string | null
          request_hash: string | null
          resource_id: string | null
          resource_type: string
          session_id_hash: string | null
          subject_profile_id: string | null
        }
        Insert: {
          actor_profile_id?: string | null
          assignment_id?: string | null
          assignment_role?: string | null
          decision: string
          event_code: string
          occurred_at?: string
          operation_code: string
          order_id?: string | null
          reason_code: string
          receipt_id?: never
          related_assignment_id?: string | null
          request_hash?: string | null
          resource_id?: string | null
          resource_type: string
          session_id_hash?: string | null
          subject_profile_id?: string | null
        }
        Update: {
          actor_profile_id?: string | null
          assignment_id?: string | null
          assignment_role?: string | null
          decision?: string
          event_code?: string
          occurred_at?: string
          operation_code?: string
          order_id?: string | null
          reason_code?: string
          receipt_id?: never
          related_assignment_id?: string | null
          request_hash?: string | null
          resource_id?: string | null
          resource_type?: string
          session_id_hash?: string | null
          subject_profile_id?: string | null
        }
        Relationships: []
      }
      intake_rate_limit_counters: {
        Row: {
          attempt_count: number
          last_attempted_at: string
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Insert: {
          attempt_count: number
          last_attempted_at: string
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Update: {
          attempt_count?: number
          last_attempted_at?: string
          scope?: string
          subject_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      work_item_change_idempotency: {
        Row: {
          actor_profile_id: string
          created_at: string
          decision: string
          idempotency_key_hash: string
          lock_version: number | null
          reason_code: string
          request_hash: string
          work_item_id: string | null
        }
        Insert: {
          actor_profile_id: string
          created_at?: string
          decision: string
          idempotency_key_hash: string
          lock_version?: number | null
          reason_code: string
          request_hash: string
          work_item_id?: string | null
        }
        Update: {
          actor_profile_id?: string
          created_at?: string
          decision?: string
          idempotency_key_hash?: string
          lock_version?: number | null
          reason_code?: string
          request_hash?: string
          work_item_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_payment_operational_data: {
        Args: { p_as_of?: string }
        Returns: {
          abandoned_checkout_intents_deleted: number
          old_webhook_receipts_deleted: number
          old_rate_limit_counters_deleted: number
          old_cron_run_details_deleted: number
          checkout_intents_marked_expired: number
        }[]
      }
      current_session_id_hash: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      has_active_engagement_role: {
        Args: { p_order_id: string; p_allowed_roles: string[] }
        Returns: boolean
      }
      has_live_auth_session: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_active_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_owner: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      write_engagement_access_audit: {
        Args: {
          p_operation_code: string
          p_event_code: string
          p_decision: string
          p_reason_code: string
          p_actor_profile_id: string
          p_subject_profile_id: string
          p_order_id: string
          p_assignment_id: string
          p_related_assignment_id: string
          p_assignment_role: string
          p_resource_type: string
          p_resource_id: string
          p_request_hash?: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string | null
          created_at: string
          id: string
          location: string | null
          name: string
          notes: string | null
          privacy_anonymized_at: string | null
          source: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          account_type?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name: string
          notes?: string | null
          privacy_anonymized_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_type?: string | null
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          privacy_anonymized_at?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          account_id: string | null
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          message: string
          metadata_json: Json | null
          order_id: string | null
        }
        Insert: {
          account_id?: string | null
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata_json?: Json | null
          order_id?: string | null
        }
        Update: {
          account_id?: string | null
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata_json?: Json | null
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      briefs: {
        Row: {
          additional_notes: string | null
          campaign_name: string | null
          campaign_type: string | null
          channels_needed: string | null
          created_at: string
          date_time: string | null
          delivery_email: string | null
          id: string
          key_details: string | null
          location_or_link: string | null
          main_goal: string | null
          offer_or_ask: string | null
          order_id: string
          organization_name: string | null
          phrases_to_avoid: string | null
          phrases_to_include: string | null
          privacy_anonymized_at: string | null
          raw_submission_json: Json
          target_audience: string | null
          tone: string | null
          website_social_links: string | null
        }
        Insert: {
          additional_notes?: string | null
          campaign_name?: string | null
          campaign_type?: string | null
          channels_needed?: string | null
          created_at?: string
          date_time?: string | null
          delivery_email?: string | null
          id?: string
          key_details?: string | null
          location_or_link?: string | null
          main_goal?: string | null
          offer_or_ask?: string | null
          order_id: string
          organization_name?: string | null
          phrases_to_avoid?: string | null
          phrases_to_include?: string | null
          privacy_anonymized_at?: string | null
          raw_submission_json?: Json
          target_audience?: string | null
          tone?: string | null
          website_social_links?: string | null
        }
        Update: {
          additional_notes?: string | null
          campaign_name?: string | null
          campaign_type?: string | null
          channels_needed?: string | null
          created_at?: string
          date_time?: string | null
          delivery_email?: string | null
          id?: string
          key_details?: string | null
          location_or_link?: string | null
          main_goal?: string | null
          offer_or_ask?: string | null
          order_id?: string
          organization_name?: string | null
          phrases_to_avoid?: string | null
          phrases_to_include?: string | null
          privacy_anonymized_at?: string | null
          raw_submission_json?: Json
          target_audience?: string | null
          tone?: string | null
          website_social_links?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          account_id: string
          campaign_family: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          privacy_anonymized_at: string | null
          primary_action: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          campaign_family?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          privacy_anonymized_at?: string | null
          primary_action?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          campaign_family?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          privacy_anonymized_at?: string | null
          primary_action?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_intents: {
        Row: {
          amount_cents: number
          brief_json: Json
          created_at: string
          currency: string
          delivery_email: string
          id: string
          order_id: string | null
          privacy_anonymized_at: string | null
          status: string
          stripe_checkout_session_id: string | null
          terms_version: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          brief_json: Json
          created_at?: string
          currency: string
          delivery_email: string
          id?: string
          order_id?: string | null
          privacy_anonymized_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          terms_version: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          brief_json?: Json
          created_at?: string
          currency?: string
          delivery_email?: string
          id?: string
          order_id?: string | null
          privacy_anonymized_at?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          terms_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          phone: string | null
          privacy_anonymized_at: string | null
          processing_restricted_at: string | null
          role: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          privacy_anonymized_at?: string | null
          processing_restricted_at?: string | null
          role?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          privacy_anonymized_at?: string | null
          processing_restricted_at?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_assignments: {
        Row: {
          assigned_by_profile_id: string
          assignee_profile_id: string
          assignment_role: string
          created_at: string
          ended_at: string | null
          ended_by_profile_id: string | null
          expires_at: string
          id: string
          lifecycle_status: string
          order_id: string
          predecessor_assignment_id: string | null
          starts_at: string
        }
        Insert: {
          assigned_by_profile_id: string
          assignee_profile_id: string
          assignment_role: string
          created_at?: string
          ended_at?: string | null
          ended_by_profile_id?: string | null
          expires_at: string
          id?: string
          lifecycle_status?: string
          order_id: string
          predecessor_assignment_id?: string | null
          starts_at?: string
        }
        Update: {
          assigned_by_profile_id?: string
          assignee_profile_id?: string
          assignment_role?: string
          created_at?: string
          ended_at?: string | null
          ended_by_profile_id?: string | null
          expires_at?: string
          id?: string
          lifecycle_status?: string
          order_id?: string
          predecessor_assignment_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_assignments_assigned_by_profile_id_fkey"
            columns: ["assigned_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignments_assignee_profile_id_fkey"
            columns: ["assignee_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignments_ended_by_profile_id_fkey"
            columns: ["ended_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_assignments_predecessor_assignment_id_fkey"
            columns: ["predecessor_assignment_id"]
            isOneToOne: false
            referencedRelation: "engagement_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_work_items: {
        Row: {
          content_json: Json
          created_at: string
          created_by_profile_id: string
          id: string
          item_type: string
          lock_version: number
          order_id: string
          updated_at: string
          updated_by_profile_id: string
        }
        Insert: {
          content_json?: Json
          created_at?: string
          created_by_profile_id: string
          id?: string
          item_type: string
          lock_version?: number
          order_id: string
          updated_at?: string
          updated_by_profile_id: string
        }
        Update: {
          content_json?: Json
          created_at?: string
          created_by_profile_id?: string
          id?: string
          item_type?: string
          lock_version?: number
          order_id?: string
          updated_at?: string
          updated_by_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_work_items_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_work_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_work_items_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          account_id: string | null
          author_id: string
          body: string
          campaign_id: string | null
          created_at: string
          id: string
          order_id: string | null
        }
        Insert: {
          account_id?: string | null
          author_id: string
          body: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
        }
        Update: {
          account_id?: string | null
          author_id?: string
          body?: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          account_id: string
          assigned_reviewer_id: string | null
          campaign_id: string
          created_at: string
          currency: string
          delivered_at: string | null
          due_at: string | null
          id: string
          package_type: string
          paid_at: string | null
          payment_status: string
          price_cents: number
          primary_contact_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_charge_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_reviewer_id?: string | null
          campaign_id: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          due_at?: string | null
          id?: string
          package_type?: string
          paid_at?: string | null
          payment_status?: string
          price_cents?: number
          primary_contact_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_charge_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_reviewer_id?: string | null
          campaign_id?: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          due_at?: string | null
          id?: string
          package_type?: string
          paid_at?: string | null
          payment_status?: string
          price_cents?: number
          primary_contact_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_charge_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_assigned_reviewer_id_fkey"
            columns: ["assigned_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_intakes: {
        Row: {
          brief_json: Json
          created_at: string
          delivery_email: string
          id: string
          privacy_anonymized_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brief_json: Json
          created_at?: string
          delivery_email: string
          id: string
          privacy_anonymized_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brief_json?: Json
          created_at?: string
          delivery_email?: string
          id?: string
          privacy_anonymized_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          invited_by?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          checkout_session_id: string | null
          event_id: string
          event_type: string
          order_id: string | null
          processed_at: string
        }
        Insert: {
          checkout_session_id?: string | null
          event_id: string
          event_type: string
          order_id?: string | null
          processed_at?: string
        }
        Update: {
          checkout_session_id?: string | null
          event_id?: string
          event_type?: string
          order_id?: string | null
          processed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_receipts: {
        Row: {
          attempt_count: number
          charge_id: string | null
          checkout_intent_id: string | null
          checkout_session_id: string | null
          completed_at: string | null
          dispute_id: string | null
          event_id: string
          event_type: string
          first_received_at: string
          last_attempted_at: string
          last_error_code: string | null
          livemode: boolean | null
          order_id: string | null
          payment_intent_id: string | null
          processing_status: string
          stripe_customer_id: string | null
          transition_code: string | null
        }
        Insert: {
          attempt_count?: number
          charge_id?: string | null
          checkout_intent_id?: string | null
          checkout_session_id?: string | null
          completed_at?: string | null
          dispute_id?: string | null
          event_id: string
          event_type: string
          first_received_at?: string
          last_attempted_at?: string
          last_error_code?: string | null
          livemode?: boolean | null
          order_id?: string | null
          payment_intent_id?: string | null
          processing_status?: string
          stripe_customer_id?: string | null
          transition_code?: string | null
        }
        Update: {
          attempt_count?: number
          charge_id?: string | null
          checkout_intent_id?: string | null
          checkout_session_id?: string | null
          completed_at?: string | null
          dispute_id?: string | null
          event_id?: string
          event_type?: string
          first_received_at?: string
          last_attempted_at?: string
          last_error_code?: string | null
          livemode?: boolean | null
          order_id?: string | null
          payment_intent_id?: string | null
          processing_status?: string
          stripe_customer_id?: string | null
          transition_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_webhook_receipts_checkout_intent_id_fkey"
            columns: ["checkout_intent_id"]
            isOneToOne: false
            referencedRelation: "checkout_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_webhook_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_stripe_webhook_attempt: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_livemode: boolean
          p_checkout_session_id: string
        }
        Returns: undefined
      }
      complete_stripe_webhook_attempt: {
        Args: {
          p_event_id: string
          p_error_code?: string
          p_processing_status: string
          p_order_id?: string
        }
        Returns: undefined
      }
      consume_checkout_rate_limit: {
        Args: { p_scope: string; p_subject_hash: string }
        Returns: {
          retry_after_seconds: number
          allowed: boolean
        }[]
      }
      consume_intake_rate_limit: {
        Args: { p_subject_hash: string; p_scope: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      create_privacy_request: {
        Args: { p_request_type: string; p_subject_email: string }
        Returns: {
          candidate_contact_count: number
          matched_resource_count: number
          request_id: string
          request_state: string
        }[]
      }
      execute_privacy_request: {
        Args: {
          p_correction?: Json | null
          p_export_expires_at?: string | null
          p_idempotency_key: string
          p_request_id: string
        }
        Returns: {
          export_artifact_id: string | null
          outcome_code: string
          request_state: string
        }[]
      }
      finalize_stripe_checkout: {
        Args: {
          p_amount_total: number
          p_event_id: string
          p_event_type: string
          p_checkout_session_id: string
          p_payment_intent_id: string
          p_intent_id: string
          p_currency: string
          p_customer_email: string
          p_paid_at: string
        }
        Returns: string
      }
      manage_engagement_assignment: {
        Args: {
          p_expires_at: string
          p_idempotency_key: string
          p_assignment_role: string
          p_assignee_profile_id: string
          p_order_id: string
          p_action: string
        }
        Returns: {
          out_receipt_id: number
          out_decision: string
          out_reason_code: string
          out_assignment_id: string
          out_lifecycle_status: string
        }[]
      }
      payment_operations_health: {
        Args: Record<PropertyKey, never>
        Returns: {
          webhook_receipts_24h: number
          failed_webhook_receipts_24h: number
          stuck_webhook_receipts: number
          stale_unpaid_checkout_intents: number
          paid_checkout_intents_without_order: number
          paid_stripe_orders_without_intent: number
          paid_stripe_orders_without_event: number
          processed_stripe_events_without_paid_order: number
          latest_webhook_completed_at: string
          latest_webhook_received_at: string
          is_healthy: boolean
          generated_at: string
        }[]
      }
      process_stripe_payment_event: {
        Args: {
          p_amount_refunded?: number | null
          p_amount_total?: number | null
          p_charge_id?: string | null
          p_checkout_intent_id?: string | null
          p_checkout_session_id?: string | null
          p_currency?: string | null
          p_customer_email?: string | null
          p_dispute_id?: string | null
          p_event_id: string
          p_event_type: string
          p_livemode: boolean
          p_occurred_at?: string | null
          p_payment_intent_id?: string | null
          p_provider_status?: string | null
          p_stripe_customer_id?: string | null
          p_test_fail_after_business?: boolean
        }
        Returns: {
          attempt_count: number
          order_id: string | null
          processing_status: string
          transition_code: string
        }[]
      }
      read_privacy_export: {
        Args: { p_request_id: string }
        Returns: {
          expires_at: string
          payload: Json
        }[]
      }
      read_engagement_workspace: {
        Args: { p_order_id: string }
        Returns: {
          receipt_id: number
          reason_code: string
          authorized: boolean
          workspace_json: Json
        }[]
      }
      release_rejected_stripe_checkout_setup: {
        Args: { p_intent_id: string }
        Returns: string
      }
      read_intake_manager_queue: {
        Args: {
          p_limit?: number
          p_before_updated_at?: string | null
          p_before_queue_receipt_id?: string | null
        }
        Returns: {
          queue_receipt_id: string
          intake_kind: string
          intake_id: string
          queue_state: string
          payment_state: string
          order_id: string | null
          terms_version: string | null
          reconciliation_status: string
          latest_alert_code: string | null
          created_at: string
          updated_at: string
        }[]
      }
      read_service_lead_engagement: {
        Args: { p_order_id: string }
        Returns: {
          engagement_json: Json
          authorized: boolean
          reason_code: string
          receipt_id: number
        }[]
      }
      transition_order_fulfillment: {
        Args: {
          p_event_type: string
          p_expected_status: string
          p_idempotency_key: string
          p_order_id: string
        }
        Returns: string
      }
      verify_privacy_request: {
        Args: {
          p_idempotency_key: string
          p_request_id: string
          p_subject_contact_id: string | null
        }
        Returns: string
      }
      write_engagement_work_item: {
        Args: {
          p_order_id: string
          p_work_item_id: string
          p_item_type: string
          p_content_json: Json
          p_expected_lock_version: number
          p_idempotency_key: string
        }
        Returns: {
          lock_version: number
          authorized: boolean
          reason_code: string
          receipt_id: number
          work_item_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  private: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

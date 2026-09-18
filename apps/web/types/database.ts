export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      academic_periods: {
        Row: {
          calendar_year: number
          code: string
          created_at: string
          ends_on: string
          id: number
          name: string
          short_name: string
          sort_order: number
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          calendar_year: number
          code: string
          created_at?: string
          ends_on: string
          id?: never
          name: string
          short_name: string
          sort_order: number
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          calendar_year?: number
          code?: string
          created_at?: string
          ends_on?: string
          id?: never
          name?: string
          short_name?: string
          sort_order?: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_structure_directory_entries: {
        Row: {
          academic_career: string | null
          academic_year_id: number
          code: string
          created_at: string
          duration_years: number | null
          first_seen_at: string
          id: number
          is_available: boolean
          last_seen_at: string
          mode_of_delivery: string | null
          selection_rank: number | null
          short_title: string | null
          source_id: number
          source_page_id: number
          source_url: string
          structure_kind: string
          title: string
          units: number | null
          updated_at: string
        }
        Insert: {
          academic_career?: string | null
          academic_year_id: number
          code: string
          created_at?: string
          duration_years?: number | null
          first_seen_at?: string
          id?: never
          is_available?: boolean
          last_seen_at?: string
          mode_of_delivery?: string | null
          selection_rank?: number | null
          short_title?: string | null
          source_id: number
          source_page_id: number
          source_url: string
          structure_kind: string
          title: string
          units?: number | null
          updated_at?: string
        }
        Update: {
          academic_career?: string | null
          academic_year_id?: number
          code?: string
          created_at?: string
          duration_years?: number | null
          first_seen_at?: string
          id?: never
          is_available?: boolean
          last_seen_at?: string
          mode_of_delivery?: string | null
          selection_rank?: number | null
          short_title?: string | null
          source_id?: number
          source_page_id?: number
          source_url?: string
          structure_kind?: string
          title?: string
          units?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_directory_entries_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_directory_entries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_directory_entries_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      academic_structure_directory_statuses: {
        Row: {
          academic_year_id: number
          availability_checked_at: string | null
          availability_note: string | null
          created_at: string
          directory_refreshed_at: string | null
          received_count: number | null
          source_availability: string
          structure_kind: string
          unique_count: number | null
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          availability_checked_at?: string | null
          availability_note?: string | null
          created_at?: string
          directory_refreshed_at?: string | null
          received_count?: number | null
          source_availability?: string
          structure_kind: string
          unique_count?: number | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          availability_checked_at?: string | null
          availability_note?: string | null
          created_at?: string
          directory_refreshed_at?: string | null
          received_count?: number | null
          source_availability?: string
          structure_kind?: string
          unique_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_directory_statuses_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_extractions: {
        Row: {
          cached_input_tokens: number | null
          completed_at: string | null
          cost_usd: number | null
          created_at: string
          extraction_number: number
          finish_reason: string | null
          generation_id: string | null
          id: string
          input_tokens: number | null
          latency_milliseconds: number | null
          output_tokens: number | null
          prompt_version: string
          reasoning_tokens: number | null
          request_artifact_id: string
          requested_model: string
          resolved_model: string | null
          response_artifact_id: string | null
          schema_version: string
          target_id: string
          validation_status: string
          validation_summary: string | null
        }
        Insert: {
          cached_input_tokens?: number | null
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          extraction_number: number
          finish_reason?: string | null
          generation_id?: string | null
          id?: string
          input_tokens?: number | null
          latency_milliseconds?: number | null
          output_tokens?: number | null
          prompt_version: string
          reasoning_tokens?: number | null
          request_artifact_id: string
          requested_model: string
          resolved_model?: string | null
          response_artifact_id?: string | null
          schema_version: string
          target_id: string
          validation_status?: string
          validation_summary?: string | null
        }
        Update: {
          cached_input_tokens?: number | null
          completed_at?: string | null
          cost_usd?: number | null
          created_at?: string
          extraction_number?: number
          finish_reason?: string | null
          generation_id?: string | null
          id?: string
          input_tokens?: number | null
          latency_milliseconds?: number | null
          output_tokens?: number | null
          prompt_version?: string
          reasoning_tokens?: number | null
          request_artifact_id?: string
          requested_model?: string
          resolved_model?: string | null
          response_artifact_id?: string | null
          schema_version?: string
          target_id?: string
          validation_status?: string
          validation_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_extractions_request_artifact_id_fkey"
            columns: ["request_artifact_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_extractions_response_artifact_id_fkey"
            columns: ["response_artifact_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_extractions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_extractions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_fees: {
        Row: {
          amount: number | null
          audience: string
          basis: string
          currency: string | null
          fee_type: string
          fee_year: number | null
          id: number
          position: number
          snapshot_id: number
          source_label: string | null
          source_locator: string
          source_text: string
        }
        Insert: {
          amount?: number | null
          audience: string
          basis: string
          currency?: string | null
          fee_type: string
          fee_year?: number | null
          id?: never
          position: number
          snapshot_id: number
          source_label?: string | null
          source_locator: string
          source_text: string
        }
        Update: {
          amount?: number | null
          audience?: string
          basis?: string
          currency?: string | null
          fee_type?: string
          fee_year?: number | null
          id?: never
          position?: number
          snapshot_id?: number
          source_label?: string | null
          source_locator?: string
          source_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_fees_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_import_artifacts: {
        Row: {
          artifact_kind: string
          attempt_number: number
          byte_size: number
          content_sha256: string
          created_at: string
          id: string
          media_type: string
          stage_id: string | null
          storage_bucket: string
          storage_path: string
          target_id: string
        }
        Insert: {
          artifact_kind: string
          attempt_number: number
          byte_size: number
          content_sha256: string
          created_at?: string
          id?: string
          media_type: string
          stage_id?: string | null
          storage_bucket: string
          storage_path: string
          target_id: string
        }
        Update: {
          artifact_kind?: string
          attempt_number?: number
          byte_size?: number
          content_sha256?: string
          created_at?: string
          id?: string
          media_type?: string
          stage_id?: string | null
          storage_bucket?: string
          storage_path?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_import_artifacts_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_artifacts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_artifacts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_import_runs: {
        Row: {
          academic_year_id: number
          accepted_count: number
          cancelled_count: number
          completed_at: string | null
          cost_usd: number
          created_at: string
          error_summary: string | null
          failed_count: number
          heartbeat_at: string | null
          id: string
          initiated_by: string | null
          input_tokens: number
          output_tokens: number
          parser_version: string
          prompt_version: string
          queued_count: number
          rejected_count: number
          requested_model: string
          run_number: number
          running_count: number
          schema_version: string
          source_id: number
          started_at: string | null
          status: string
          structure_kind: string
          succeeded_count: number
          target_count: number
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          accepted_count?: number
          cancelled_count?: number
          completed_at?: string | null
          cost_usd?: number
          created_at?: string
          error_summary?: string | null
          failed_count?: number
          heartbeat_at?: string | null
          id?: string
          initiated_by?: string | null
          input_tokens?: number
          output_tokens?: number
          parser_version: string
          prompt_version: string
          queued_count?: number
          rejected_count?: number
          requested_model: string
          run_number?: never
          running_count?: number
          schema_version: string
          source_id: number
          started_at?: string | null
          status?: string
          structure_kind: string
          succeeded_count?: number
          target_count: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          accepted_count?: number
          cancelled_count?: number
          completed_at?: string | null
          cost_usd?: number
          created_at?: string
          error_summary?: string | null
          failed_count?: number
          heartbeat_at?: string | null
          id?: string
          initiated_by?: string | null
          input_tokens?: number
          output_tokens?: number
          parser_version?: string
          prompt_version?: string
          queued_count?: number
          rejected_count?: number
          requested_model?: string
          run_number?: never
          running_count?: number
          schema_version?: string
          source_id?: number
          started_at?: string | null
          status?: string
          structure_kind?: string
          succeeded_count?: number
          target_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_import_runs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_import_stages: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_summary: string | null
          id: string
          position: number
          stage_name: string
          started_at: string | null
          status: string
          target_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          id?: string
          position: number
          stage_name: string
          started_at?: string | null
          status?: string
          target_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          id?: string
          position?: number
          stage_name?: string
          started_at?: string | null
          status?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_import_stages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_stages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_import_targets: {
        Row: {
          academic_year_id: number
          attempt_count: number
          baseline_draft_snapshot_id: number | null
          baseline_published_snapshot_id: number | null
          candidate_snapshot_id: number | null
          change_kind: string | null
          claimed_at: string | null
          created_at: string
          directory_entry_id: number
          dispatch_error: string | null
          dispatched_at: string | null
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          lock_version: number
          position: number
          processing_status: string
          queue_message_id: string | null
          requested_model: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          source_page_id: number | null
          started_at: string | null
          structure_code: string
          structure_id: number | null
          structure_kind: string
          structure_year_id: number | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          academic_year_id: number
          attempt_count?: number
          baseline_draft_snapshot_id?: number | null
          baseline_published_snapshot_id?: number | null
          candidate_snapshot_id?: number | null
          change_kind?: string | null
          claimed_at?: string | null
          created_at?: string
          directory_entry_id: number
          dispatch_error?: string | null
          dispatched_at?: string | null
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lock_version?: number
          position: number
          processing_status?: string
          queue_message_id?: string | null
          requested_model: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id: string
          source_page_id?: number | null
          started_at?: string | null
          structure_code: string
          structure_id?: number | null
          structure_kind: string
          structure_year_id?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          academic_year_id?: number
          attempt_count?: number
          baseline_draft_snapshot_id?: number | null
          baseline_published_snapshot_id?: number | null
          candidate_snapshot_id?: number | null
          change_kind?: string | null
          claimed_at?: string | null
          created_at?: string
          directory_entry_id?: number
          dispatch_error?: string | null
          dispatched_at?: string | null
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lock_version?: number
          position?: number
          processing_status?: string
          queue_message_id?: string | null
          requested_model?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string
          source_page_id?: number | null
          started_at?: string | null
          structure_code?: string
          structure_id?: number | null
          structure_kind?: string
          structure_year_id?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_import_targets_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_baseline_draft_fkey"
            columns: ["baseline_draft_snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_baseline_published_fkey"
            columns: ["baseline_published_snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_candidate_fkey"
            columns: ["candidate_snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_directory_entry_id_fkey"
            columns: ["directory_entry_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "academic_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_structure_year_id_fkey"
            columns: ["structure_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_years"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_learning_outcomes: {
        Row: {
          id: number
          outcome_text: string
          position: number
          snapshot_id: number
          source_locator: string
          source_text: string
        }
        Insert: {
          id?: never
          outcome_text: string
          position: number
          snapshot_id: number
          source_locator: string
          source_text: string
        }
        Update: {
          id?: never
          outcome_text?: string
          position?: number
          snapshot_id?: number
          source_locator?: string
          source_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_learning_outcomes_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_requirement_conditions: {
        Row: {
          condition_kind: string
          free_text: string | null
          id: number
          maximum_level: number | null
          maximum_units: number | null
          minimum_courses: number | null
          minimum_level: number | null
          minimum_units: number | null
          position: number
          projection_key: string
          requirement_group_id: number
          snapshot_id: number
          source_locator: string
          source_text: string
          structure_kind: string | null
          subject_code: string | null
          tag: string | null
        }
        Insert: {
          condition_kind: string
          free_text?: string | null
          id?: never
          maximum_level?: number | null
          maximum_units?: number | null
          minimum_courses?: number | null
          minimum_level?: number | null
          minimum_units?: number | null
          position: number
          projection_key: string
          requirement_group_id: number
          snapshot_id: number
          source_locator: string
          source_text: string
          structure_kind?: string | null
          subject_code?: string | null
          tag?: string | null
        }
        Update: {
          condition_kind?: string
          free_text?: string | null
          id?: never
          maximum_level?: number | null
          maximum_units?: number | null
          minimum_courses?: number | null
          minimum_level?: number | null
          minimum_units?: number | null
          position?: number
          projection_key?: string
          requirement_group_id?: number
          snapshot_id?: number
          source_locator?: string
          source_text?: string
          structure_kind?: string | null
          subject_code?: string | null
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_requirement_conditions_group_fkey"
            columns: ["requirement_group_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_requirement_groups"
            referencedColumns: ["id", "snapshot_id"]
          },
          {
            foreignKeyName: "academic_structure_requirement_conditions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_requirement_groups: {
        Row: {
          description: string | null
          group_key: string
          id: number
          maximum_units: number | null
          minimum_count: number | null
          minimum_units: number | null
          operator: string
          parent_group_id: number | null
          position: number
          snapshot_id: number
          source_locator: string
          source_text: string
          title: string | null
        }
        Insert: {
          description?: string | null
          group_key: string
          id?: never
          maximum_units?: number | null
          minimum_count?: number | null
          minimum_units?: number | null
          operator: string
          parent_group_id?: number | null
          position: number
          snapshot_id: number
          source_locator: string
          source_text: string
          title?: string | null
        }
        Update: {
          description?: string | null
          group_key?: string
          id?: never
          maximum_units?: number | null
          minimum_count?: number | null
          minimum_units?: number | null
          operator?: string
          parent_group_id?: number | null
          position?: number
          snapshot_id?: number
          source_locator?: string
          source_text?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_requirement_groups_parent_fkey"
            columns: ["parent_group_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_requirement_groups"
            referencedColumns: ["id", "snapshot_id"]
          },
          {
            foreignKeyName: "academic_structure_requirement_groups_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_requirement_options: {
        Row: {
          id: number
          option_code: string
          option_kind: string
          position: number
          requirement_condition_id: number
          snapshot_id: number
          structure_kind: string | null
        }
        Insert: {
          id?: never
          option_code: string
          option_kind: string
          position: number
          requirement_condition_id: number
          snapshot_id: number
          structure_kind?: string | null
        }
        Update: {
          id?: never
          option_code?: string
          option_kind?: string
          position?: number
          requirement_condition_id?: number
          snapshot_id?: number
          structure_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_requirement_options_condition_fkey"
            columns: ["requirement_condition_id", "snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_requirement_conditions"
            referencedColumns: ["id", "snapshot_id"]
          },
          {
            foreignKeyName: "academic_structure_requirement_options_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_review_items: {
        Row: {
          created_at: string
          field_key: string
          id: string
          item_kind: string
          message: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          snapshot_id: number | null
          source_text: string | null
          status: string
          target_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          item_kind: string
          message: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          snapshot_id?: number | null
          source_text?: string | null
          status?: string
          target_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          item_kind?: string
          message?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          snapshot_id?: number | null
          source_text?: string | null
          status?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_review_items_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_review_items_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_review_items_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_snapshot_evidence: {
        Row: {
          confidence: number
          evidence_excerpt: string
          field_key: string
          id: number
          method: string
          position: number
          snapshot_id: number
          source_locator: string
        }
        Insert: {
          confidence: number
          evidence_excerpt: string
          field_key: string
          id?: never
          method: string
          position: number
          snapshot_id: number
          source_locator: string
        }
        Update: {
          confidence?: number
          evidence_excerpt?: string
          field_key?: string
          id?: never
          method?: string
          position?: number
          snapshot_id?: number
          source_locator?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_snapshot_evidence_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_snapshot_relationships: {
        Row: {
          id: number
          position: number
          relationship_kind: string
          snapshot_id: number
          source_locator: string
          source_text: string
          target_code: string
          target_kind: string
          target_title: string | null
        }
        Insert: {
          id?: never
          position: number
          relationship_kind: string
          snapshot_id: number
          source_locator: string
          source_text: string
          target_code: string
          target_kind: string
          target_title?: string | null
        }
        Update: {
          id?: never
          position?: number
          relationship_kind?: string
          snapshot_id?: number
          source_locator?: string
          source_text?: string
          target_code?: string
          target_kind?: string
          target_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_snapshot_relationships_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_snapshot_sections: {
        Row: {
          heading: string
          id: number
          markdown: string
          position: number
          section_key: string
          snapshot_id: number
          source_locator: string
          source_text: string
        }
        Insert: {
          heading: string
          id?: never
          markdown: string
          position: number
          section_key: string
          snapshot_id: number
          source_locator: string
          source_text: string
        }
        Update: {
          heading?: string
          id?: never
          markdown?: string
          position?: number
          section_key?: string
          snapshot_id?: number
          source_locator?: string
          source_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_snapshot_sections_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_snapshots: {
        Row: {
          academic_career: string | null
          academic_year_id: number
          acronym: string | null
          atar: number | null
          can_combine: boolean | null
          can_combine_vertical: boolean | null
          college: string | null
          confirmation_note: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by: string | null
          contact_text: string | null
          created_at: string
          created_by: string | null
          critical_uncertainty: boolean
          description: string | null
          duration_years: number | null
          id: number
          import_target_id: string | null
          introduction: string | null
          mode_of_delivery: string | null
          name: string
          origin: string
          overall_confidence: number | null
          parent_snapshot_id: number | null
          public_id: string
          schema_version: string
          sealed_at: string
          selection_rank: number | null
          semantic_hash: string
          short_name: string | null
          source_page_id: number | null
          structure_year_id: number
          study_as: string | null
          units: number | null
        }
        Insert: {
          academic_career?: string | null
          academic_year_id: number
          acronym?: string | null
          atar?: number | null
          can_combine?: boolean | null
          can_combine_vertical?: boolean | null
          college?: string | null
          confirmation_note?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          contact_text?: string | null
          created_at?: string
          created_by?: string | null
          critical_uncertainty?: boolean
          description?: string | null
          duration_years?: number | null
          id?: never
          import_target_id?: string | null
          introduction?: string | null
          mode_of_delivery?: string | null
          name: string
          origin: string
          overall_confidence?: number | null
          parent_snapshot_id?: number | null
          public_id?: string
          schema_version: string
          sealed_at?: string
          selection_rank?: number | null
          semantic_hash: string
          short_name?: string | null
          source_page_id?: number | null
          structure_year_id: number
          study_as?: string | null
          units?: number | null
        }
        Update: {
          academic_career?: string | null
          academic_year_id?: number
          acronym?: string | null
          atar?: number | null
          can_combine?: boolean | null
          can_combine_vertical?: boolean | null
          college?: string | null
          confirmation_note?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          contact_text?: string | null
          created_at?: string
          created_by?: string | null
          critical_uncertainty?: boolean
          description?: string | null
          duration_years?: number | null
          id?: never
          import_target_id?: string | null
          introduction?: string | null
          mode_of_delivery?: string | null
          name?: string
          origin?: string
          overall_confidence?: number | null
          parent_snapshot_id?: number | null
          public_id?: string
          schema_version?: string
          sealed_at?: string
          selection_rank?: number | null
          semantic_hash?: string
          short_name?: string | null
          source_page_id?: number | null
          structure_year_id?: number
          study_as?: string | null
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_snapshots_import_target_fkey"
            columns: ["import_target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_snapshots_import_target_fkey"
            columns: ["import_target_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_snapshots_parent_snapshot_id_fkey"
            columns: ["parent_snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_snapshots_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "academic_structure_snapshots_structure_year_fkey"
            columns: ["structure_year_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_years"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      academic_structure_source_pages: {
        Row: {
          academic_year_id: number
          byte_size: number
          canonical_url: string
          content_sha256: string
          created_at: string
          external_key: string
          fetched_at: string
          http_etag: string | null
          http_status: number
          id: number
          media_type: string
          page_kind: string
          source_id: number
          source_last_modified: string | null
          storage_bucket: string | null
          storage_path: string | null
          structure_kind: string | null
        }
        Insert: {
          academic_year_id: number
          byte_size: number
          canonical_url: string
          content_sha256: string
          created_at?: string
          external_key: string
          fetched_at?: string
          http_etag?: string | null
          http_status: number
          id?: never
          media_type: string
          page_kind: string
          source_id: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          structure_kind?: string | null
        }
        Update: {
          academic_year_id?: number
          byte_size?: number
          canonical_url?: string
          content_sha256?: string
          created_at?: string
          external_key?: string
          fetched_at?: string
          http_etag?: string | null
          http_status?: number
          id?: never
          media_type?: string
          page_kind?: string
          source_id?: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          structure_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_source_pages_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_source_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_sources: {
        Row: {
          base_url: string
          created_at: string
          id: number
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: never
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_structure_summary_fields: {
        Row: {
          field_key: string
          field_value: string
          id: number
          label: string
          position: number
          snapshot_id: number
          source_text: string
          value_position: number
        }
        Insert: {
          field_key: string
          field_value: string
          id?: never
          label: string
          position: number
          snapshot_id: number
          source_text: string
          value_position: number
        }
        Update: {
          field_key?: string
          field_value?: string
          id?: never
          label?: string
          position?: number
          snapshot_id?: number
          source_text?: string
          value_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_summary_fields_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_unmodelled_requirements: {
        Row: {
          id: number
          position: number
          snapshot_id: number
          source_locator: string | null
          source_text: string
        }
        Insert: {
          id?: never
          position: number
          snapshot_id: number
          source_locator?: string | null
          source_text: string
        }
        Update: {
          id?: never
          position?: number
          snapshot_id?: number
          source_locator?: string | null
          source_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_unmodelled_requirements_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structure_years: {
        Row: {
          academic_year_id: number
          created_at: string
          draft_snapshot_id: number | null
          id: number
          public_id: string
          published_snapshot_id: number | null
          structure_id: number
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          created_at?: string
          draft_snapshot_id?: number | null
          id?: never
          public_id?: string
          published_snapshot_id?: number | null
          structure_id: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          created_at?: string
          draft_snapshot_id?: number | null
          id?: never
          public_id?: string
          published_snapshot_id?: number | null
          structure_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_years_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_years_draft_snapshot_fkey"
            columns: ["draft_snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_years_published_snapshot_fkey"
            columns: ["published_snapshot_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_years_structure_id_fkey"
            columns: ["structure_id"]
            isOneToOne: false
            referencedRelation: "academic_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_structures: {
        Row: {
          code: string
          created_at: string
          id: number
          kind: string
          public_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          kind: string
          public_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          kind?: string
          public_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      academic_years: {
        Row: {
          availability_checked_at: string | null
          availability_note: string | null
          calendar_published_at: string | null
          created_at: string
          directory_refreshed_at: string | null
          id: number
          is_import_enabled: boolean
          source_availability: string
          updated_at: string
          year: number
        }
        Insert: {
          availability_checked_at?: string | null
          availability_note?: string | null
          calendar_published_at?: string | null
          created_at?: string
          directory_refreshed_at?: string | null
          id?: never
          is_import_enabled?: boolean
          source_availability?: string
          updated_at?: string
          year: number
        }
        Update: {
          availability_checked_at?: string | null
          availability_note?: string | null
          calendar_published_at?: string | null
          created_at?: string
          directory_refreshed_at?: string | null
          id?: never
          is_import_enabled?: boolean
          source_availability?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      app_settings: {
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
      approval_events: {
        Row: {
          actor_id: string | null
          approval_request_id: string
          details: Json
          event_kind: string
          id: number
          note: string | null
          occurred_at: string
          owner_id: string
        }
        Insert: {
          actor_id?: string | null
          approval_request_id: string
          details?: Json
          event_kind: string
          id?: never
          note?: string | null
          occurred_at?: string
          owner_id: string
        }
        Update: {
          actor_id?: string | null
          approval_request_id?: string
          details?: Json
          event_kind?: string
          id?: never
          note?: string | null
          occurred_at?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_events_request_owner_fkey"
            columns: ["approval_request_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          academic_period_id: number | null
          decision_note: string | null
          id: string
          owner_id: string
          plan_item_id: string | null
          reason: string
          request_kind: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          academic_period_id?: number | null
          decision_note?: string | null
          id?: string
          owner_id: string
          plan_item_id?: string | null
          reason: string
          request_kind: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          academic_period_id?: number | null
          decision_note?: string | null
          id?: string
          owner_id?: string
          plan_item_id?: string | null
          reason?: string
          request_kind?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_plan_item_owner_fkey"
            columns: ["plan_item_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      campus_indoor_maps: {
        Row: {
          building_place_id: string
          created_at: string
          document: Json
          id: string
          name: string
          published_at: string | null
          revision: number
          source_license: string | null
          source_provider: string | null
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          building_place_id: string
          created_at?: string
          document: Json
          id?: string
          name: string
          published_at?: string | null
          revision?: number
          source_license?: string | null
          source_provider?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          building_place_id?: string
          created_at?: string
          document?: Json
          id?: string
          name?: string
          published_at?: string | null
          revision?: number
          source_license?: string | null
          source_provider?: string | null
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_indoor_maps_building_place_id_fkey"
            columns: ["building_place_id"]
            isOneToOne: true
            referencedRelation: "campus_map_places"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_map_campuses: {
        Row: {
          boundary_geojson: Json
          created_at: string
          east: number
          id: string
          initial_latitude: number
          initial_longitude: number
          initial_zoom: number
          max_zoom: number
          min_zoom: number
          name: string
          north: number
          slug: string
          sort_order: number
          source_identifier: string
          source_license: string
          source_url: string
          south: number
          status: string
          updated_at: string
          west: number
        }
        Insert: {
          boundary_geojson: Json
          created_at?: string
          east: number
          id?: string
          initial_latitude: number
          initial_longitude: number
          initial_zoom?: number
          max_zoom?: number
          min_zoom?: number
          name: string
          north: number
          slug: string
          sort_order?: number
          source_identifier: string
          source_license: string
          source_url: string
          south: number
          status?: string
          updated_at?: string
          west: number
        }
        Update: {
          boundary_geojson?: Json
          created_at?: string
          east?: number
          id?: string
          initial_latitude?: number
          initial_longitude?: number
          initial_zoom?: number
          max_zoom?: number
          min_zoom?: number
          name?: string
          north?: number
          slug?: string
          sort_order?: number
          source_identifier?: string
          source_license?: string
          source_url?: string
          south?: number
          status?: string
          updated_at?: string
          west?: number
        }
        Relationships: []
      }
      campus_map_features: {
        Row: {
          campus_id: string
          created_at: string
          feature_kind: string
          geometry_geojson: Json
          height_metres: number
          id: string
          layer_id: string
          minimum_height_metres: number
          name: string
          place_id: string | null
          slug: string
          sort_order: number
          source_identifier: string
          source_license: string
          source_properties: Json
          source_url: string
          status: string
          updated_at: string
        }
        Insert: {
          campus_id: string
          created_at?: string
          feature_kind: string
          geometry_geojson: Json
          height_metres?: number
          id?: string
          layer_id: string
          minimum_height_metres?: number
          name: string
          place_id?: string | null
          slug: string
          sort_order?: number
          source_identifier: string
          source_license: string
          source_properties?: Json
          source_url: string
          status?: string
          updated_at?: string
        }
        Update: {
          campus_id?: string
          created_at?: string
          feature_kind?: string
          geometry_geojson?: Json
          height_metres?: number
          id?: string
          layer_id?: string
          minimum_height_metres?: number
          name?: string
          place_id?: string | null
          slug?: string
          sort_order?: number
          source_identifier?: string
          source_license?: string
          source_properties?: Json
          source_url?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_map_features_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_map_campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_map_features_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "campus_map_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campus_map_features_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "campus_map_places"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_map_layers: {
        Row: {
          campus_id: string
          colour: string
          created_at: string
          description: string | null
          id: string
          is_visible_by_default: boolean
          layer_kind: string
          name: string
          slug: string
          sort_order: number
          status: string
          style_layer_patterns: string[]
          updated_at: string
        }
        Insert: {
          campus_id: string
          colour?: string
          created_at?: string
          description?: string | null
          id?: string
          is_visible_by_default?: boolean
          layer_kind?: string
          name: string
          slug: string
          sort_order?: number
          status?: string
          style_layer_patterns?: string[]
          updated_at?: string
        }
        Update: {
          campus_id?: string
          colour?: string
          created_at?: string
          description?: string | null
          id?: string
          is_visible_by_default?: boolean
          layer_kind?: string
          name?: string
          slug?: string
          sort_order?: number
          status?: string
          style_layer_patterns?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_map_layers_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campus_map_campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_map_place_details: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          place_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          label: string
          place_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          place_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_map_place_details_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "campus_map_places"
            referencedColumns: ["id"]
          },
        ]
      }
      campus_map_places: {
        Row: {
          address: string
          created_at: string
          data_status: string
          id: string
          is_routable: boolean
          latitude: number
          layer_id: string
          longitude: number
          map_display_kind: string
          marker_label: string
          name: string
          official_url: string | null
          search_terms: string[]
          slug: string
          sort_order: number
          source_identifier: string | null
          source_license: string | null
          source_provider: string | null
          source_updated_at: string | null
          source_url: string | null
          source_version: number | null
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          data_status?: string
          id?: string
          is_routable?: boolean
          latitude: number
          layer_id: string
          longitude: number
          map_display_kind?: string
          marker_label: string
          name: string
          official_url?: string | null
          search_terms?: string[]
          slug: string
          sort_order?: number
          source_identifier?: string | null
          source_license?: string | null
          source_provider?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          source_version?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          data_status?: string
          id?: string
          is_routable?: boolean
          latitude?: number
          layer_id?: string
          longitude?: number
          map_display_kind?: string
          marker_label?: string
          name?: string
          official_url?: string | null
          search_terms?: string[]
          slug?: string
          sort_order?: number
          source_identifier?: string | null
          source_license?: string | null
          source_provider?: string | null
          source_updated_at?: string | null
          source_url?: string | null
          source_version?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campus_map_places_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "campus_map_layers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_section_reviews: {
        Row: {
          actor_id: string | null
          approved: boolean
          content_hash: string
          course_year_id: number | null
          created_at: string
          id: string
          method: string
          section_key: string
          structure_year_id: number | null
          version_id: string | null
        }
        Insert: {
          actor_id?: string | null
          approved: boolean
          content_hash: string
          course_year_id?: number | null
          created_at?: string
          id?: string
          method: string
          section_key: string
          structure_year_id?: number | null
          version_id?: string | null
        }
        Update: {
          actor_id?: string | null
          approved?: boolean
          content_hash?: string
          course_year_id?: number | null
          created_at?: string
          id?: string
          method?: string
          section_key?: string
          structure_year_id?: number | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_section_reviews_course_year_id_fkey"
            columns: ["course_year_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_year_id"]
          },
          {
            foreignKeyName: "catalogue_section_reviews_course_year_id_fkey"
            columns: ["course_year_id"]
            isOneToOne: false
            referencedRelation: "course_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_section_reviews_structure_year_id_fkey"
            columns: ["structure_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_years"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_source_pages: {
        Row: {
          academic_year_id: number
          byte_size: number | null
          canonical_url: string
          content_sha256: string
          created_at: string
          external_key: string
          fetched_at: string
          http_etag: string | null
          http_status: number | null
          id: number
          kind: string
          media_type: string
          source_id: number
          source_last_modified: string | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          academic_year_id: number
          byte_size?: number | null
          canonical_url: string
          content_sha256: string
          created_at?: string
          external_key: string
          fetched_at?: string
          http_etag?: string | null
          http_status?: number | null
          id?: never
          kind: string
          media_type?: string
          source_id: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          academic_year_id?: number
          byte_size?: number | null
          canonical_url?: string
          content_sha256?: string
          created_at?: string
          external_key?: string
          fetched_at?: string
          http_etag?: string | null
          http_status?: number | null
          id?: never
          kind?: string
          media_type?: string
          source_id?: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_source_pages_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_source_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_sources: {
        Row: {
          base_url: string
          created_at: string
          id: number
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: never
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_areas_of_interest: {
        Row: {
          course_snapshot_id: number
          created_at: string
          id: number
          name: string
          position: number
        }
        Insert: {
          course_snapshot_id: number
          created_at?: string
          id?: never
          name: string
          position: number
        }
        Update: {
          course_snapshot_id?: number
          created_at?: string
          id?: never
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_areas_of_interest_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_assessment_items: {
        Row: {
          course_snapshot_id: number
          created_at: string
          due_text: string | null
          hurdle: boolean | null
          id: number
          learning_outcomes: number[] | null
          position: number
          source_text: string
          title: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          course_snapshot_id: number
          created_at?: string
          due_text?: string | null
          hurdle?: boolean | null
          id?: never
          learning_outcomes?: number[] | null
          position: number
          source_text: string
          title: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          course_snapshot_id?: number
          created_at?: string
          due_text?: string | null
          hurdle?: boolean | null
          id?: never
          learning_outcomes?: number[] | null
          position?: number
          source_text?: string
          title?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_assessment_items_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_assessment_outcomes: {
        Row: {
          assessment_item_id: number
          course_snapshot_id: number
          created_at: string
          learning_outcome_id: number
        }
        Insert: {
          assessment_item_id: number
          course_snapshot_id: number
          created_at?: string
          learning_outcome_id: number
        }
        Update: {
          assessment_item_id?: number
          course_snapshot_id?: number
          created_at?: string
          learning_outcome_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_assessment_outcomes_assessment_snapshot_fkey"
            columns: ["assessment_item_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_assessment_items"
            referencedColumns: ["id", "course_snapshot_id"]
          },
          {
            foreignKeyName: "course_assessment_outcomes_learning_outcome_snapshot_fkey"
            columns: ["learning_outcome_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_learning_outcomes"
            referencedColumns: ["id", "course_snapshot_id"]
          },
        ]
      }
      course_attempts: {
        Row: {
          academic_period_id: number
          course_id: number
          course_snapshot_id: number
          created_at: string
          grade: string | null
          id: string
          mark: number | null
          owner_id: string
          source: string
          status: string
          units_attempted: number
          units_earned: number
          updated_at: string
        }
        Insert: {
          academic_period_id: number
          course_id: number
          course_snapshot_id: number
          created_at?: string
          grade?: string | null
          id?: string
          mark?: number | null
          owner_id: string
          source?: string
          status: string
          units_attempted: number
          units_earned?: number
          updated_at?: string
        }
        Update: {
          academic_period_id?: number
          course_id?: number
          course_snapshot_id?: number
          created_at?: string
          grade?: string | null
          id?: string
          mark?: number | null
          owner_id?: string
          source?: string
          status?: string
          units_attempted?: number
          units_earned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_attempts_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_attempts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_attempts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_attempts_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_attributes: {
        Row: {
          attribute_kind: string
          course_snapshot_id: number
          created_at: string
          id: number
          position: number
          source_text: string
          value: string
        }
        Insert: {
          attribute_kind: string
          course_snapshot_id: number
          created_at?: string
          id?: never
          position: number
          source_text: string
          value: string
        }
        Update: {
          attribute_kind?: string
          course_snapshot_id?: number
          created_at?: string
          id?: never
          position?: number
          source_text?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_attributes_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_directory_entries: {
        Row: {
          academic_career: string | null
          academic_year_id: number
          code: string
          course_id: number | null
          created_at: string
          first_seen_at: string
          id: number
          is_current: boolean
          last_seen_at: string
          mode_of_delivery: string | null
          session: string | null
          source_page_id: number
          title: string
          units: number | null
          updated_at: string
        }
        Insert: {
          academic_career?: string | null
          academic_year_id: number
          code: string
          course_id?: number | null
          created_at?: string
          first_seen_at?: string
          id?: never
          is_current?: boolean
          last_seen_at?: string
          mode_of_delivery?: string | null
          session?: string | null
          source_page_id: number
          title: string
          units?: number | null
          updated_at?: string
        }
        Update: {
          academic_career?: string | null
          academic_year_id?: number
          code?: string
          course_id?: number | null
          created_at?: string
          first_seen_at?: string
          id?: never
          is_current?: boolean
          last_seen_at?: string
          mode_of_delivery?: string | null
          session?: string | null
          source_page_id?: number
          title?: string
          units?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_directory_entries_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_directory_entries_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_directory_entries_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_directory_entries_source_page_year_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_extractions: {
        Row: {
          cached_input_tokens: number
          completed_at: string | null
          cost_source: string
          cost_usd: number
          created_at: string
          domain_valid: boolean | null
          error_count: number
          error_summary: string | null
          extraction_fingerprint: string
          extraction_number: number
          finish_reason: string | null
          id: string
          input_tokens: number
          latency_ms: number | null
          output_tokens: number
          prompt_version: string
          provider: string
          provider_request_id: string | null
          reasoning_tokens: number
          request_artifact_id: string
          requested_model: string
          resolved_model: string | null
          response_artifact_id: string | null
          reused_from_extraction_id: string | null
          schema_valid: boolean | null
          schema_version: string
          started_at: string
          target_id: string
          validated_artifact_id: string | null
          validation_status: string
          warning_count: number
        }
        Insert: {
          cached_input_tokens?: number
          completed_at?: string | null
          cost_source?: string
          cost_usd?: number
          created_at?: string
          domain_valid?: boolean | null
          error_count?: number
          error_summary?: string | null
          extraction_fingerprint: string
          extraction_number: number
          finish_reason?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          output_tokens?: number
          prompt_version: string
          provider?: string
          provider_request_id?: string | null
          reasoning_tokens?: number
          request_artifact_id: string
          requested_model: string
          resolved_model?: string | null
          response_artifact_id?: string | null
          reused_from_extraction_id?: string | null
          schema_valid?: boolean | null
          schema_version: string
          started_at: string
          target_id: string
          validated_artifact_id?: string | null
          validation_status?: string
          warning_count?: number
        }
        Update: {
          cached_input_tokens?: number
          completed_at?: string | null
          cost_source?: string
          cost_usd?: number
          created_at?: string
          domain_valid?: boolean | null
          error_count?: number
          error_summary?: string | null
          extraction_fingerprint?: string
          extraction_number?: number
          finish_reason?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          output_tokens?: number
          prompt_version?: string
          provider?: string
          provider_request_id?: string | null
          reasoning_tokens?: number
          request_artifact_id?: string
          requested_model?: string
          resolved_model?: string | null
          response_artifact_id?: string | null
          reused_from_extraction_id?: string | null
          schema_valid?: boolean | null
          schema_version?: string
          started_at?: string
          target_id?: string
          validated_artifact_id?: string | null
          validation_status?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_extractions_request_artifact_fkey"
            columns: ["request_artifact_id", "target_id"]
            isOneToOne: false
            referencedRelation: "course_import_artifacts"
            referencedColumns: ["id", "target_id"]
          },
          {
            foreignKeyName: "course_extractions_response_artifact_fkey"
            columns: ["response_artifact_id", "target_id"]
            isOneToOne: false
            referencedRelation: "course_import_artifacts"
            referencedColumns: ["id", "target_id"]
          },
          {
            foreignKeyName: "course_extractions_reused_from_extraction_id_fkey"
            columns: ["reused_from_extraction_id"]
            isOneToOne: false
            referencedRelation: "course_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_extractions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["latest_target_id"]
          },
          {
            foreignKeyName: "course_extractions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_extractions_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_extractions_validated_artifact_fkey"
            columns: ["validated_artifact_id", "target_id"]
            isOneToOne: false
            referencedRelation: "course_import_artifacts"
            referencedColumns: ["id", "target_id"]
          },
        ]
      }
      course_fees: {
        Row: {
          amount: number | null
          audience: string
          basis: string
          course_snapshot_id: number
          created_at: string
          currency: string | null
          fee_type: string
          fee_year: number | null
          id: number
          position: number
          source_label: string | null
          source_text: string | null
          student_contribution_band: number | null
        }
        Insert: {
          amount?: number | null
          audience: string
          basis?: string
          course_snapshot_id: number
          created_at?: string
          currency?: string | null
          fee_type: string
          fee_year?: number | null
          id?: never
          position: number
          source_label?: string | null
          source_text?: string | null
          student_contribution_band?: number | null
        }
        Update: {
          amount?: number | null
          audience?: string
          basis?: string
          course_snapshot_id?: number
          created_at?: string
          currency?: string | null
          fee_type?: string
          fee_year?: number | null
          id?: never
          position?: number
          source_label?: string | null
          source_text?: string | null
          student_contribution_band?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_fees_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_import_artifacts: {
        Row: {
          artifact_kind: string
          attempt_number: number
          byte_size: number
          content_sha256: string
          created_at: string
          id: string
          media_type: string
          stage_id: string | null
          storage_bucket: string
          storage_path: string
          target_id: string
        }
        Insert: {
          artifact_kind: string
          attempt_number?: number
          byte_size: number
          content_sha256: string
          created_at?: string
          id?: string
          media_type: string
          stage_id?: string | null
          storage_bucket: string
          storage_path: string
          target_id: string
        }
        Update: {
          artifact_kind?: string
          attempt_number?: number
          byte_size?: number
          content_sha256?: string
          created_at?: string
          id?: string
          media_type?: string
          stage_id?: string | null
          storage_bucket?: string
          storage_path?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_import_artifacts_stage_target_fkey"
            columns: ["stage_id", "target_id"]
            isOneToOne: false
            referencedRelation: "course_import_stages"
            referencedColumns: ["id", "target_id"]
          },
          {
            foreignKeyName: "course_import_artifacts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["latest_target_id"]
          },
          {
            foreignKeyName: "course_import_artifacts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_import_artifacts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      course_import_runs: {
        Row: {
          academic_year_id: number
          actual_cost_usd: number
          completed_at: string | null
          created_at: string
          error_summary: string | null
          extraction_count: number
          failed_count: number
          heartbeat_at: string | null
          id: string
          initiated_by: string | null
          input_tokens: number
          output_tokens: number
          parser_version: string
          processed_count: number
          prompt_version: string
          ready_for_review_count: number
          requested_model: string
          run_number: number
          schema_version: string
          source_id: number
          started_at: string | null
          status: string
          target_count: number
          unchanged_count: number
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          actual_cost_usd?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          extraction_count?: number
          failed_count?: number
          heartbeat_at?: string | null
          id?: string
          initiated_by?: string | null
          input_tokens?: number
          output_tokens?: number
          parser_version: string
          processed_count?: number
          prompt_version: string
          ready_for_review_count?: number
          requested_model: string
          run_number?: never
          schema_version: string
          source_id: number
          started_at?: string | null
          status?: string
          target_count: number
          unchanged_count?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          actual_cost_usd?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: string | null
          extraction_count?: number
          failed_count?: number
          heartbeat_at?: string | null
          id?: string
          initiated_by?: string | null
          input_tokens?: number
          output_tokens?: number
          parser_version?: string
          processed_count?: number
          prompt_version?: string
          ready_for_review_count?: number
          requested_model?: string
          run_number?: never
          schema_version?: string
          source_id?: number
          started_at?: string | null
          status?: string
          target_count?: number
          unchanged_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_import_runs_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_import_runs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "course_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      course_import_stages: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_summary: string | null
          id: string
          position: number
          stage_name: string
          started_at: string | null
          status: string
          target_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          id?: string
          position: number
          stage_name: string
          started_at?: string | null
          status?: string
          target_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_summary?: string | null
          id?: string
          position?: number
          stage_name?: string
          started_at?: string | null
          status?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_import_stages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["latest_target_id"]
          },
          {
            foreignKeyName: "course_import_stages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_import_stages_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      course_import_targets: {
        Row: {
          academic_year_id: number
          attempt_count: number
          baseline_draft_snapshot_id: number | null
          baseline_published_snapshot_id: number | null
          candidate_snapshot_id: number | null
          change_kind: string | null
          claimed_at: string | null
          course_code: string
          course_id: number | null
          course_year_id: number | null
          created_at: string
          directory_entry_id: number
          dispatch_error: string | null
          dispatched_at: string | null
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          lock_version: number
          position: number
          processing_status: string
          queue_message_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          source_id: number
          source_page_id: number | null
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          academic_year_id: number
          attempt_count?: number
          baseline_draft_snapshot_id?: number | null
          baseline_published_snapshot_id?: number | null
          candidate_snapshot_id?: number | null
          change_kind?: string | null
          claimed_at?: string | null
          course_code: string
          course_id?: number | null
          course_year_id?: number | null
          created_at?: string
          directory_entry_id: number
          dispatch_error?: string | null
          dispatched_at?: string | null
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lock_version?: number
          position: number
          processing_status?: string
          queue_message_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id: string
          source_id: number
          source_page_id?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          academic_year_id?: number
          attempt_count?: number
          baseline_draft_snapshot_id?: number | null
          baseline_published_snapshot_id?: number | null
          candidate_snapshot_id?: number | null
          change_kind?: string | null
          claimed_at?: string | null
          course_code?: string
          course_id?: number | null
          course_year_id?: number | null
          created_at?: string
          directory_entry_id?: number
          dispatch_error?: string | null
          dispatched_at?: string | null
          error_code?: string | null
          error_summary?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          lease_expires_at?: string | null
          lock_version?: number
          position?: number
          processing_status?: string
          queue_message_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string
          source_id?: number
          source_page_id?: number | null
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_import_targets_baseline_draft_fkey"
            columns: ["baseline_draft_snapshot_id", "course_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
          {
            foreignKeyName: "course_import_targets_baseline_published_fkey"
            columns: ["baseline_published_snapshot_id", "course_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
          {
            foreignKeyName: "course_import_targets_candidate_snapshot_fkey"
            columns: ["candidate_snapshot_id", "course_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
          {
            foreignKeyName: "course_import_targets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_import_targets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_import_targets_course_year_provenance_fkey"
            columns: ["course_year_id", "course_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_years"
            referencedColumns: ["id", "course_id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_import_targets_directory_provenance_fkey"
            columns: ["directory_entry_id", "academic_year_id", "course_code"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["id", "academic_year_id", "code"]
          },
          {
            foreignKeyName: "course_import_targets_directory_provenance_fkey"
            columns: ["directory_entry_id", "academic_year_id", "course_code"]
            isOneToOne: false
            referencedRelation: "course_directory_entries"
            referencedColumns: ["id", "academic_year_id", "code"]
          },
          {
            foreignKeyName: "course_import_targets_directory_year_code_fkey"
            columns: ["academic_year_id", "course_code"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["academic_year_id", "code"]
          },
          {
            foreignKeyName: "course_import_targets_directory_year_code_fkey"
            columns: ["academic_year_id", "course_code"]
            isOneToOne: false
            referencedRelation: "course_directory_entries"
            referencedColumns: ["academic_year_id", "code"]
          },
          {
            foreignKeyName: "course_import_targets_run_provenance_fkey"
            columns: ["run_id", "source_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_import_runs"
            referencedColumns: ["id", "source_id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_import_targets_source_page_year_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_learning_outcomes: {
        Row: {
          body: string
          course_snapshot_id: number
          created_at: string
          id: number
          position: number
          updated_at: string
        }
        Insert: {
          body: string
          course_snapshot_id: number
          created_at?: string
          id?: never
          position: number
          updated_at?: string
        }
        Update: {
          body?: string
          course_snapshot_id?: number
          created_at?: string
          id?: never
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_learning_outcomes_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          academic_year_id: number
          course_snapshot_id: number
          course_source_page_id: number
          created_at: string
          delivery_mode: string | null
          id: number
          location: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          course_snapshot_id: number
          course_source_page_id: number
          created_at?: string
          delivery_mode?: string | null
          id?: never
          location?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          course_snapshot_id?: number
          course_source_page_id?: number
          created_at?: string
          delivery_mode?: string | null
          id?: never
          location?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: true
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_snapshot_year_fkey"
            columns: ["course_snapshot_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_offerings_source_page_year_fkey"
            columns: ["course_source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_related_courses: {
        Row: {
          course_snapshot_id: number
          created_at: string
          id: number
          position: number
          related_course_id: number
          relation_kind: string
          source_course_code: string
          source_course_title: string | null
          source_text: string | null
        }
        Insert: {
          course_snapshot_id: number
          created_at?: string
          id?: never
          position: number
          related_course_id: number
          relation_kind: string
          source_course_code: string
          source_course_title?: string | null
          source_text?: string | null
        }
        Update: {
          course_snapshot_id?: number
          created_at?: string
          id?: never
          position?: number
          related_course_id?: number
          relation_kind?: string
          source_course_code?: string
          source_course_title?: string | null
          source_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_related_courses_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_related_courses_related_course_id_fkey"
            columns: ["related_course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_related_courses_related_course_id_fkey"
            columns: ["related_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_review_items: {
        Row: {
          assigned_to: string | null
          confidence: number | null
          course_snapshot_id: number
          created_at: string
          entity_key: string
          entity_kind: string
          field_path: string
          id: string
          importance: string
          is_blocking: boolean
          issue_code: string
          new_value: Json | null
          old_value: Json | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_excerpt: string | null
          source_locator: string | null
          status: string
          summary: string
          target_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          confidence?: number | null
          course_snapshot_id: number
          created_at?: string
          entity_key?: string
          entity_kind: string
          field_path: string
          id?: string
          importance?: string
          is_blocking?: boolean
          issue_code: string
          new_value?: Json | null
          old_value?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_excerpt?: string | null
          source_locator?: string | null
          status?: string
          summary: string
          target_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          confidence?: number | null
          course_snapshot_id?: number
          created_at?: string
          entity_key?: string
          entity_kind?: string
          field_path?: string
          id?: string
          importance?: string
          is_blocking?: boolean
          issue_code?: string
          new_value?: Json | null
          old_value?: Json | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_excerpt?: string | null
          source_locator?: string | null
          status?: string
          summary?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_review_items_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_review_items_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["latest_target_id"]
          },
          {
            foreignKeyName: "course_review_items_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_directory_latest_import_targets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_review_items_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "course_import_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      course_rule_condition_courses: {
        Row: {
          condition_id: number
          course_snapshot_id: number
          created_at: string
          id: number
          position: number
          referenced_course_id: number
          source_course_code: string
          source_text: string
        }
        Insert: {
          condition_id: number
          course_snapshot_id: number
          created_at?: string
          id?: never
          position: number
          referenced_course_id: number
          source_course_code: string
          source_text: string
        }
        Update: {
          condition_id?: number
          course_snapshot_id?: number
          created_at?: string
          id?: never
          position?: number
          referenced_course_id?: number
          source_course_code?: string
          source_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rule_condition_courses_condition_snapshot_fkey"
            columns: ["condition_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_rule_conditions"
            referencedColumns: ["id", "course_snapshot_id"]
          },
          {
            foreignKeyName: "course_rule_condition_courses_referenced_course_id_fkey"
            columns: ["referenced_course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_rule_condition_courses_referenced_course_id_fkey"
            columns: ["referenced_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_rule_conditions: {
        Row: {
          condition_kind: string
          confidence: number
          course_requirement_mode: string | null
          course_rule_id: number
          course_snapshot_id: number
          created_at: string
          free_text: string | null
          group_id: number
          hardness: string
          id: number
          maximum_course_level: number | null
          minimum_course_level: number | null
          minimum_gpa: number | null
          minimum_mark: number | null
          minimum_units: number | null
          minimum_wam: number | null
          minimum_year: number | null
          position: number
          projection_key: string
          required_course_id: number | null
          required_structure_id: number | null
          review_state: string
          source_text: string | null
          subject_code: string | null
          updated_at: string
        }
        Insert: {
          condition_kind: string
          confidence?: number
          course_requirement_mode?: string | null
          course_rule_id: number
          course_snapshot_id: number
          created_at?: string
          free_text?: string | null
          group_id: number
          hardness: string
          id?: never
          maximum_course_level?: number | null
          minimum_course_level?: number | null
          minimum_gpa?: number | null
          minimum_mark?: number | null
          minimum_units?: number | null
          minimum_wam?: number | null
          minimum_year?: number | null
          position?: number
          projection_key: string
          required_course_id?: number | null
          required_structure_id?: number | null
          review_state?: string
          source_text?: string | null
          subject_code?: string | null
          updated_at?: string
        }
        Update: {
          condition_kind?: string
          confidence?: number
          course_requirement_mode?: string | null
          course_rule_id?: number
          course_snapshot_id?: number
          created_at?: string
          free_text?: string | null
          group_id?: number
          hardness?: string
          id?: never
          maximum_course_level?: number | null
          minimum_course_level?: number | null
          minimum_gpa?: number | null
          minimum_mark?: number | null
          minimum_units?: number | null
          minimum_wam?: number | null
          minimum_year?: number | null
          position?: number
          projection_key?: string
          required_course_id?: number | null
          required_structure_id?: number | null
          review_state?: string
          source_text?: string | null
          subject_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rule_conditions_group_rule_fkey"
            columns: ["group_id", "course_rule_id"]
            isOneToOne: false
            referencedRelation: "course_rule_groups"
            referencedColumns: ["id", "course_rule_id"]
          },
          {
            foreignKeyName: "course_rule_conditions_required_course_id_fkey"
            columns: ["required_course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_rule_conditions_required_course_id_fkey"
            columns: ["required_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rule_conditions_required_structure_id_fkey"
            columns: ["required_structure_id"]
            isOneToOne: false
            referencedRelation: "academic_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rule_conditions_rule_snapshot_fkey"
            columns: ["course_rule_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_rules"
            referencedColumns: ["id", "course_snapshot_id"]
          },
        ]
      }
      course_rule_course_references: {
        Row: {
          confidence: number
          course_rule_id: number
          course_snapshot_id: number
          created_at: string
          id: number
          referenced_course_id: number
          review_state: string
          source_text: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          course_rule_id: number
          course_snapshot_id: number
          created_at?: string
          id?: never
          referenced_course_id: number
          review_state?: string
          source_text: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          course_rule_id?: number
          course_snapshot_id?: number
          created_at?: string
          id?: never
          referenced_course_id?: number
          review_state?: string
          source_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rule_course_references_course_fkey"
            columns: ["referenced_course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_rule_course_references_course_fkey"
            columns: ["referenced_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rule_course_references_rule_fkey"
            columns: ["course_rule_id"]
            isOneToOne: false
            referencedRelation: "course_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rule_course_references_rule_snapshot_fkey"
            columns: ["course_rule_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_rules"
            referencedColumns: ["id", "course_snapshot_id"]
          },
        ]
      }
      course_rule_groups: {
        Row: {
          course_rule_id: number
          course_snapshot_id: number
          created_at: string
          id: number
          minimum_count: number | null
          operator: string
          parent_group_id: number | null
          position: number
          projection_key: string
          updated_at: string
        }
        Insert: {
          course_rule_id: number
          course_snapshot_id: number
          created_at?: string
          id?: never
          minimum_count?: number | null
          operator: string
          parent_group_id?: number | null
          position?: number
          projection_key: string
          updated_at?: string
        }
        Update: {
          course_rule_id?: number
          course_snapshot_id?: number
          created_at?: string
          id?: never
          minimum_count?: number | null
          operator?: string
          parent_group_id?: number | null
          position?: number
          projection_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rule_groups_course_rule_id_fkey"
            columns: ["course_rule_id"]
            isOneToOne: false
            referencedRelation: "course_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rule_groups_parent_rule_fkey"
            columns: ["parent_group_id", "course_rule_id"]
            isOneToOne: false
            referencedRelation: "course_rule_groups"
            referencedColumns: ["id", "course_rule_id"]
          },
          {
            foreignKeyName: "course_rule_groups_rule_snapshot_fkey"
            columns: ["course_rule_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_rules"
            referencedColumns: ["id", "course_snapshot_id"]
          },
        ]
      }
      course_rules: {
        Row: {
          academic_year_id: number
          confidence: number
          course_snapshot_id: number
          course_source_page_id: number
          created_at: string
          hardness: string
          id: number
          review_state: string
          rule_kind: string
          source_text: string
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          confidence?: number
          course_snapshot_id: number
          course_source_page_id: number
          created_at?: string
          hardness?: string
          id?: never
          review_state?: string
          rule_kind: string
          source_text: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          confidence?: number
          course_snapshot_id?: number
          course_source_page_id?: number
          created_at?: string
          hardness?: string
          id?: never
          review_state?: string
          rule_kind?: string
          source_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rules_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_rules_snapshot_year_fkey"
            columns: ["course_snapshot_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_rules_source_page_year_fkey"
            columns: ["course_source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_snapshot_confirmation_items: {
        Row: {
          confirmation_id: string
          review_item_id: string
        }
        Insert: {
          confirmation_id: string
          review_item_id: string
        }
        Update: {
          confirmation_id?: string
          review_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_snapshot_confirmation_items_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "course_snapshot_confirmations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_snapshot_confirmation_items_review_item_id_fkey"
            columns: ["review_item_id"]
            isOneToOne: true
            referencedRelation: "course_review_items"
            referencedColumns: ["id"]
          },
        ]
      }
      course_snapshot_confirmations: {
        Row: {
          based_on_snapshot_id: number
          confirmation_note: string
          confirmed_at: string
          confirmed_by: string
          course_snapshot_id: number
          course_year_id: number
          id: string
        }
        Insert: {
          based_on_snapshot_id: number
          confirmation_note: string
          confirmed_at?: string
          confirmed_by: string
          course_snapshot_id: number
          course_year_id: number
          id?: string
        }
        Update: {
          based_on_snapshot_id?: number
          confirmation_note?: string
          confirmed_at?: string
          confirmed_by?: string
          course_snapshot_id?: number
          course_year_id?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_snapshot_confirmations_base_snapshot_id_fkey"
            columns: ["based_on_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_snapshot_confirmations_course_year_id_fkey"
            columns: ["course_year_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_year_id"]
          },
          {
            foreignKeyName: "course_snapshot_confirmations_course_year_id_fkey"
            columns: ["course_year_id"]
            isOneToOne: false
            referencedRelation: "course_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_snapshot_confirmations_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: true
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_snapshot_field_evidence: {
        Row: {
          academic_year_id: number
          confidence: number | null
          confidence_band: string
          course_snapshot_id: number
          created_at: string
          entity_key: string
          entity_kind: string
          evidence_excerpt: string | null
          extraction_state: string
          field_key: string
          id: number
          importance: string
          note: string | null
          source_locator: string | null
          source_page_id: number
          verification_status: string
        }
        Insert: {
          academic_year_id: number
          confidence?: number | null
          confidence_band: string
          course_snapshot_id: number
          created_at?: string
          entity_key?: string
          entity_kind: string
          evidence_excerpt?: string | null
          extraction_state: string
          field_key: string
          id?: never
          importance: string
          note?: string | null
          source_locator?: string | null
          source_page_id: number
          verification_status: string
        }
        Update: {
          academic_year_id?: number
          confidence?: number | null
          confidence_band?: string
          course_snapshot_id?: number
          created_at?: string
          entity_key?: string
          entity_kind?: string
          evidence_excerpt?: string | null
          extraction_state?: string
          field_key?: string
          id?: never
          importance?: string
          note?: string | null
          source_locator?: string | null
          source_page_id?: number
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_snapshot_field_evidence_snapshot_year_fkey"
            columns: ["course_snapshot_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_snapshot_field_evidence_source_page_year_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_snapshots: {
        Row: {
          academic_career: string | null
          academic_year_id: number
          based_on_snapshot_id: number | null
          college: string | null
          convener_text: string | null
          course_year_id: number
          created_at: string
          created_by: string | null
          delivery_summary: string | null
          description: string | null
          eftsl: number | null
          has_critical_uncertainty: boolean
          id: number
          inherent_requirements: string | null
          introduction: string | null
          level: number
          maximum_units: number | null
          minimum_units: number | null
          offering_status: string
          origin: string
          overall_confidence: number | null
          prescribed_texts: string | null
          projection_sha256: string
          public_id: string
          schema_version: string
          school: string | null
          sealed_at: string | null
          snapshot_number: number
          source_page_id: number
          source_updated_at: string | null
          subject_code: string
          subject_name: string | null
          title: string
          unit_value_kind: string
          units: number | null
          validation_status: string
          workload_hours: number | null
          workload_text: string | null
        }
        Insert: {
          academic_career?: string | null
          academic_year_id: number
          based_on_snapshot_id?: number | null
          college?: string | null
          convener_text?: string | null
          course_year_id: number
          created_at?: string
          created_by?: string | null
          delivery_summary?: string | null
          description?: string | null
          eftsl?: number | null
          has_critical_uncertainty?: boolean
          id?: never
          inherent_requirements?: string | null
          introduction?: string | null
          level: number
          maximum_units?: number | null
          minimum_units?: number | null
          offering_status?: string
          origin: string
          overall_confidence?: number | null
          prescribed_texts?: string | null
          projection_sha256: string
          public_id?: string
          schema_version?: string
          school?: string | null
          sealed_at?: string | null
          snapshot_number: number
          source_page_id: number
          source_updated_at?: string | null
          subject_code: string
          subject_name?: string | null
          title: string
          unit_value_kind?: string
          units?: number | null
          validation_status: string
          workload_hours?: number | null
          workload_text?: string | null
        }
        Update: {
          academic_career?: string | null
          academic_year_id?: number
          based_on_snapshot_id?: number | null
          college?: string | null
          convener_text?: string | null
          course_year_id?: number
          created_at?: string
          created_by?: string | null
          delivery_summary?: string | null
          description?: string | null
          eftsl?: number | null
          has_critical_uncertainty?: boolean
          id?: never
          inherent_requirements?: string | null
          introduction?: string | null
          level?: number
          maximum_units?: number | null
          minimum_units?: number | null
          offering_status?: string
          origin?: string
          overall_confidence?: number | null
          prescribed_texts?: string | null
          projection_sha256?: string
          public_id?: string
          schema_version?: string
          school?: string | null
          sealed_at?: string | null
          snapshot_number?: number
          source_page_id?: number
          source_updated_at?: string | null
          subject_code?: string
          subject_name?: string | null
          title?: string
          unit_value_kind?: string
          units?: number | null
          validation_status?: string
          workload_hours?: number | null
          workload_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_snapshots_based_on_same_course_year_fkey"
            columns: ["based_on_snapshot_id", "course_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
          {
            foreignKeyName: "course_snapshots_course_year_academic_year_fkey"
            columns: ["course_year_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_years"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_snapshots_source_page_year_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_source_pages: {
        Row: {
          academic_year_id: number
          byte_size: number | null
          canonical_url: string
          content_sha256: string
          created_at: string
          external_key: string
          fetched_at: string
          http_etag: string | null
          http_status: number | null
          id: number
          media_type: string
          page_kind: string
          source_id: number
          source_last_modified: string | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Insert: {
          academic_year_id: number
          byte_size?: number | null
          canonical_url: string
          content_sha256: string
          created_at?: string
          external_key: string
          fetched_at?: string
          http_etag?: string | null
          http_status?: number | null
          id?: never
          media_type: string
          page_kind: string
          source_id: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Update: {
          academic_year_id?: number
          byte_size?: number | null
          canonical_url?: string
          content_sha256?: string
          created_at?: string
          external_key?: string
          fetched_at?: string
          http_etag?: string | null
          http_status?: number | null
          id?: never
          media_type?: string
          page_kind?: string
          source_id?: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_source_pages_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_source_pages_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "course_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sources: {
        Row: {
          base_url: string
          created_at: string
          id: number
          is_active: boolean
          kind: string
          name: string
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          id?: never
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          id?: never
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      course_unit_options: {
        Row: {
          course_snapshot_id: number
          created_at: string
          id: number
          label: string | null
          position: number
          source_text: string
          units: number
        }
        Insert: {
          course_snapshot_id: number
          created_at?: string
          id?: never
          label?: string | null
          position: number
          source_text: string
          units: number
        }
        Update: {
          course_snapshot_id?: number
          created_at?: string
          id?: never
          label?: string | null
          position?: number
          source_text?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_unit_options_course_snapshot_id_fkey"
            columns: ["course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      course_years: {
        Row: {
          academic_year_id: number
          course_id: number
          created_at: string
          draft_snapshot_id: number | null
          id: number
          lifecycle_status: string
          public_id: string
          published_snapshot_id: number | null
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          course_id: number
          created_at?: string
          draft_snapshot_id?: number | null
          id?: never
          lifecycle_status?: string
          public_id?: string
          published_snapshot_id?: number | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          course_id?: number
          created_at?: string
          draft_snapshot_id?: number | null
          id?: never
          lifecycle_status?: string
          public_id?: string
          published_snapshot_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_years_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_years_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_years_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_years_draft_snapshot_same_year_fkey"
            columns: ["draft_snapshot_id", "id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
          {
            foreignKeyName: "course_years_published_snapshot_same_year_fkey"
            columns: ["published_snapshot_id", "id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          id: number
          public_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: never
          public_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: never
          public_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      import_models: {
        Row: {
          enabled: boolean
          id: string
          input_usd_per_million: number | null
          name: string
          output_usd_per_million: number | null
          pricing_updated_at: string | null
          provider: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          enabled?: boolean
          id: string
          input_usd_per_million?: number | null
          name: string
          output_usd_per_million?: number | null
          pricing_updated_at?: string | null
          provider: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          enabled?: boolean
          id?: string
          input_usd_per_million?: number | null
          name?: string
          output_usd_per_million?: number | null
          pricing_updated_at?: string | null
          provider?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      offering_sessions: {
        Row: {
          academic_period_code: string
          academic_period_id: number | null
          academic_period_name: string
          academic_year_id: number
          census_on: string | null
          class_number: string | null
          class_summary_url: string | null
          course_offering_id: number
          course_snapshot_id: number
          course_source_page_id: number
          created_at: string
          delivery_mode: string | null
          ends_on: string | null
          enrol_closes_on: string | null
          id: number
          location: string | null
          position: number
          source_text: string
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          academic_period_code: string
          academic_period_id?: number | null
          academic_period_name: string
          academic_year_id: number
          census_on?: string | null
          class_number?: string | null
          class_summary_url?: string | null
          course_offering_id: number
          course_snapshot_id: number
          course_source_page_id: number
          created_at?: string
          delivery_mode?: string | null
          ends_on?: string | null
          enrol_closes_on?: string | null
          id?: never
          location?: string | null
          position: number
          source_text: string
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          academic_period_code?: string
          academic_period_id?: number | null
          academic_period_name?: string
          academic_year_id?: number
          census_on?: string | null
          class_number?: string | null
          class_summary_url?: string | null
          course_offering_id?: number
          course_snapshot_id?: number
          course_source_page_id?: number
          created_at?: string
          delivery_mode?: string | null
          ends_on?: string | null
          enrol_closes_on?: string | null
          id?: never
          location?: string | null
          position?: number
          source_text?: string
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offering_sessions_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_sessions_offering_snapshot_fkey"
            columns: ["course_offering_id", "course_snapshot_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id", "course_snapshot_id"]
          },
          {
            foreignKeyName: "offering_sessions_snapshot_year_fkey"
            columns: ["course_snapshot_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "offering_sessions_source_page_year_fkey"
            columns: ["course_source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      plan_items: {
        Row: {
          academic_period_id: number | null
          academic_year_id: number
          course_id: number
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          plan_id: string
          planned_calendar_year: number | null
          planned_period_code: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          academic_period_id?: number | null
          academic_year_id: number
          course_id: number
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          plan_id: string
          planned_calendar_year?: number | null
          planned_period_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          academic_period_id?: number | null
          academic_year_id?: number
          course_id?: number
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          plan_id?: string
          planned_calendar_year?: number | null
          planned_period_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_academic_period_id_fkey"
            columns: ["academic_period_id"]
            isOneToOne: false
            referencedRelation: "academic_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_academic_year_calendar_year_fkey"
            columns: ["academic_year_id", "planned_calendar_year"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "year"]
          },
          {
            foreignKeyName: "plan_items_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_course_academic_year_fkey"
            columns: ["course_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "course_years"
            referencedColumns: ["course_id", "academic_year_id"]
          },
          {
            foreignKeyName: "plan_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_directory_admin_entries"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "plan_items_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_plan_owner_fkey"
            columns: ["plan_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      plan_structures: {
        Row: {
          academic_year_id: number
          created_at: string
          id: string
          owner_id: string
          plan_id: string
          position: number
          role: string
          structure_year_id: number
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          created_at?: string
          id?: string
          owner_id: string
          plan_id: string
          position?: number
          role: string
          structure_year_id: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          created_at?: string
          id?: string
          owner_id?: string
          plan_id?: string
          position?: number
          role?: string
          structure_year_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_structures_plan_owner_academic_year_fkey"
            columns: ["plan_id", "owner_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id", "owner_id", "academic_year_id"]
          },
          {
            foreignKeyName: "plan_structures_structure_academic_year_fkey"
            columns: ["structure_year_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_years"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      plans: {
        Row: {
          academic_year_id: number
          commencement_year: number
          created_at: string
          extension_years: number
          id: string
          is_primary: boolean
          name: string
          owner_id: string
          status: string
          study_load: string
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          commencement_year: number
          created_at?: string
          extension_years?: number
          id?: string
          is_primary?: boolean
          name: string
          owner_id: string
          status?: string
          study_load: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          commencement_year?: number
          created_at?: string
          extension_years?: number
          id?: string
          is_primary?: boolean
          name?: string
          owner_id?: string
          status?: string
          study_load?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          student_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id: string
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          student_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      university_calendar_events: {
        Row: {
          academic_year_id: number
          calendar_year: number
          created_at: string
          event_date: string
          id: number
          source_page_id: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          calendar_year: number
          created_at?: string
          event_date: string
          id?: never
          source_page_id?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          calendar_year?: number
          created_at?: string
          event_date?: string
          id?: never
          source_page_id?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_calendar_events_academic_year_fkey"
            columns: ["academic_year_id", "calendar_year"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "year"]
          },
          {
            foreignKeyName: "university_calendar_events_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      university_calendar_imports: {
        Row: {
          academic_year_id: number
          added_count: number
          archived_count: number
          changed_count: number
          checked_count: number
          diagnostics: Json
          failed_count: number
          id: string
          imported_at: string
          parser_version: string
          source_page_id: number
          status: string
          unchanged_count: number
        }
        Insert: {
          academic_year_id: number
          added_count?: number
          archived_count?: number
          changed_count?: number
          checked_count?: number
          diagnostics?: Json
          failed_count?: number
          id?: string
          imported_at?: string
          parser_version: string
          source_page_id: number
          status: string
          unchanged_count?: number
        }
        Update: {
          academic_year_id?: number
          added_count?: number
          archived_count?: number
          changed_count?: number
          checked_count?: number
          diagnostics?: Json
          failed_count?: number
          id?: string
          imported_at?: string
          parser_version?: string
          source_page_id?: number
          status?: string
          unchanged_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "university_calendar_imports_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "university_calendar_imports_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      academic_structure_directory_latest_import_targets: {
        Row: {
          academic_year_id: number | null
          change_kind: string | null
          created_at: string | null
          directory_entry_id: number | null
          error_summary: string | null
          id: string | null
          processing_status: string | null
          review_status: string | null
          run_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_import_targets_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_directory_entry_id_fkey"
            columns: ["directory_entry_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_directory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_import_targets_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "academic_structure_import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permissions: {
        Row: {
          permission_category: string | null
          permission_description: string | null
          permission_id: number | null
          permission_key: string | null
          permission_name: string | null
        }
        Insert: {
          permission_category?: string | null
          permission_description?: string | null
          permission_id?: number | null
          permission_key?: string | null
          permission_name?: string | null
        }
        Update: {
          permission_category?: string | null
          permission_description?: string | null
          permission_id?: number | null
          permission_key?: string | null
          permission_name?: string | null
        }
        Relationships: []
      }
      admin_role_permissions: {
        Row: {
          permission_id: number | null
          role_id: number | null
        }
        Insert: {
          permission_id?: number | null
          role_id?: number | null
        }
        Update: {
          permission_id?: number | null
          role_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "admin_permissions"
            referencedColumns: ["permission_id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "admin_roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          permission_keys: string[] | null
          role_description: string | null
          role_id: number | null
          role_key: string | null
          role_name: string | null
        }
        Relationships: []
      }
      admin_user_roles: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          role_key: string | null
          user_id: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          student_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          student_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          student_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      course_directory_admin_entries: {
        Row: {
          academic_career: string | null
          academic_year_id: number | null
          code: string | null
          course_id: number | null
          course_year_id: number | null
          draft_snapshot_id: number | null
          first_seen_at: string | null
          id: number | null
          is_current: boolean | null
          last_seen_at: string | null
          latest_change_kind: string | null
          latest_created_at: string | null
          latest_error_summary: string | null
          latest_processing_status: string | null
          latest_review_status: string | null
          latest_run_id: string | null
          latest_target_id: string | null
          mode_of_delivery: string | null
          published_snapshot_id: number | null
          session: string | null
          title: string | null
          units: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_directory_entries_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_years_draft_snapshot_same_year_fkey"
            columns: ["draft_snapshot_id", "course_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
          {
            foreignKeyName: "course_years_published_snapshot_same_year_fkey"
            columns: ["published_snapshot_id", "course_year_id"]
            isOneToOne: false
            referencedRelation: "course_snapshots"
            referencedColumns: ["id", "course_year_id"]
          },
        ]
      }
      course_directory_latest_import_targets: {
        Row: {
          academic_year_id: number | null
          change_kind: string | null
          created_at: string | null
          directory_entry_id: number | null
          error_summary: string | null
          id: string | null
          processing_status: string | null
          review_status: string | null
          run_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_course_import_target: {
        Args: {
          p_expected_baseline_snapshot_id: number
          p_expected_current_draft_snapshot_id: number
          p_resolution_note?: string
          p_target_id: string
        }
        Returns: {
          academic_year_id: number
          attempt_count: number
          baseline_draft_snapshot_id: number | null
          baseline_published_snapshot_id: number | null
          candidate_snapshot_id: number | null
          change_kind: string | null
          claimed_at: string | null
          course_code: string
          course_id: number | null
          course_year_id: number | null
          created_at: string
          directory_entry_id: number
          dispatch_error: string | null
          dispatched_at: string | null
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          lock_version: number
          position: number
          processing_status: string
          queue_message_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          source_id: number
          source_page_id: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "course_import_targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_current_user_plan_item: {
        Args: {
          p_academic_year: number
          p_course_code: string
          p_planned_calendar_year?: number
          p_planned_period_code?: string
        }
        Returns: string
      }
      admin_catalogue_projection: {
        Args: { p_kind: string; p_snapshot_id: number }
        Returns: Json
      }
      apply_catalogue_import_changes: {
        Args: {
          p_expected_snapshot_id: number
          p_fields: string[]
          p_kind: string
          p_target_id: string
        }
        Returns: number
      }
      archive_course_year: {
        Args: {
          p_course_year_id: number
          p_expected_draft_snapshot_id: number
          p_expected_published_snapshot_id: number
        }
        Returns: number
      }
      cancel_academic_structure_import: {
        Args: { p_run_id: string }
        Returns: undefined
      }
      catalogue_import_comparison: {
        Args: { p_kind: string; p_target_id: string }
        Returns: Json
      }
      catalogue_review_history: {
        Args: { p_kind: string; p_year_id: number }
        Returns: Json
      }
      catalogue_review_state: {
        Args: { p_kind: string; p_snapshot_id: number; p_year_id: number }
        Returns: Json
      }
      confirm_course_manual_snapshot: {
        Args: {
          p_blocking_review_item_ids: string[]
          p_confirmation_note: string
          p_course_year_id: number
          p_expected_base_snapshot_id: number
          p_projection: Json
        }
        Returns: Json
      }
      create_academic_structure_manual_snapshot: {
        Args: {
          p_expected_base_snapshot_id: number
          p_projection: Json
          p_structure_year_id: number
        }
        Returns: number
      }
      create_course_manual_snapshot: {
        Args: {
          p_course_year_id: number
          p_expected_base_snapshot_id: number
          p_projection: Json
        }
        Returns: number
      }
      current_user_course_attempt_snapshot_projections: {
        Args: { p_snapshot_ids: number[] }
        Returns: {
          projection: Json
          snapshot_id: number
        }[]
      }
      current_user_has_permission: {
        Args: { required_permission: string }
        Returns: boolean
      }
      fail_expired_course_import_targets: {
        Args: { p_run_id: string }
        Returns: {
          failed_count: number
          newly_failed_target_count: number
          processed_count: number
          run_id: string
          run_status: string
        }[]
      }
      move_current_user_plan_item: {
        Args: {
          p_before_plan_item_id?: string
          p_plan_item_id: string
          p_planned_calendar_year?: number
          p_planned_period_code?: string
        }
        Returns: undefined
      }
      publish_academic_structure_snapshot: {
        Args: { p_snapshot_id: number; p_structure_year_id: number }
        Returns: undefined
      }
      publish_course_snapshot: {
        Args: {
          p_course_year_id: number
          p_expected_published_snapshot_id: number
          p_snapshot_id: number
        }
        Returns: number
      }
      published_course_availability: {
        Args: { p_academic_year: number; p_course_code: string }
        Returns: {
          academic_year: number
          course_code: string
          course_id: number
          course_year_id: number
          is_available: boolean
          offering_status: string
          published_snapshot_id: number
        }[]
      }
      published_course_detail: {
        Args: { p_academic_year: number; p_course_code: string }
        Returns: Json
      }
      published_course_requisite_graph: {
        Args: { p_academic_year: number; p_course_code: string }
        Returns: {
          from_code: string
          from_is_available: boolean
          to_code: string
          to_is_available: boolean
        }[]
      }
      reconcile_academic_structure_import_dispatch: {
        Args: { p_run_id: string }
        Returns: {
          reconciled_target_count: number
          run_status: string
        }[]
      }
      record_current_user_course_attempt: {
        Args: {
          p_attempt_mark?: number
          p_attempt_status: string
          p_plan_item_id: string
          p_units_attempted?: number
        }
        Returns: string
      }
      reject_course_import_target: {
        Args: { p_resolution_note?: string; p_target_id: string }
        Returns: {
          academic_year_id: number
          attempt_count: number
          baseline_draft_snapshot_id: number | null
          baseline_published_snapshot_id: number | null
          candidate_snapshot_id: number | null
          change_kind: string | null
          claimed_at: string | null
          course_code: string
          course_id: number | null
          course_year_id: number | null
          created_at: string
          directory_entry_id: number
          dispatch_error: string | null
          dispatched_at: string | null
          error_code: string | null
          error_summary: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          lease_expires_at: string | null
          lock_version: number
          position: number
          processing_status: string
          queue_message_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          source_id: number
          source_page_id: number | null
          updated_at: string
          worker_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "course_import_targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_current_user_plan_item: {
        Args: { p_plan_item_id: string }
        Returns: boolean
      }
      restore_catalogue_version: {
        Args: {
          p_expected_snapshot_id: number
          p_kind: string
          p_version_id: string
          p_year_id: number
        }
        Returns: number
      }
      review_academic_structure_import_target: {
        Args: { p_decision: string; p_note?: string; p_target_id: string }
        Returns: undefined
      }
      review_catalogue_sections: {
        Args: {
          p_approved: boolean
          p_bulk?: boolean
          p_kind: string
          p_sections: string[]
          p_snapshot_id: number
          p_year_id: number
        }
        Returns: Json
      }
      save_current_user_academic_result: {
        Args: {
          p_grade?: string
          p_id: string
          p_mark?: number
          p_operation?: string
          p_units?: number
        }
        Returns: string
      }
      save_current_user_primary_plan: {
        Args: {
          p_academic_year: number
          p_commencement_year: number
          p_display_name: string
          p_major_code?: string
          p_minor_codes?: string[]
          p_programme_code: string
          p_specialisation_codes?: string[]
          p_student_number: string
          p_study_load: string
        }
        Returns: string
      }
      set_current_user_plan_extension_years: {
        Args: { p_extension_years: number }
        Returns: undefined
      }
      set_role_permission: {
        Args: { p_enabled: boolean; p_permission_id: number; p_role_id: number }
        Returns: boolean
      }
      set_user_role: {
        Args: { p_role_key: string; p_user_id: string }
        Returns: string
      }
      start_academic_structure_import: {
        Args: {
          p_academic_year: number
          p_parser_version: string
          p_prompt_version: string
          p_requested_model: string
          p_schema_version: string
          p_structure_codes: string[]
          p_structure_kind: string
        }
        Returns: {
          run_id: string
          run_number: number
          structure_code: string
          target_id: string
          target_position: number
        }[]
      }
      start_course_import: {
        Args: {
          p_academic_year: number
          p_course_codes: string[]
          p_parser_version: string
          p_prompt_version: string
          p_requested_model: string
          p_schema_version: string
        }
        Returns: {
          course_code: string
          run_id: string
          target_id: string
          target_position: number
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
  public: {
    Enums: {},
  },
} as const


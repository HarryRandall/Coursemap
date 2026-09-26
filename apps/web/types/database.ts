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
          source_label: string | null
          source_locator: string
          source_text: string
          version_id: number
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
          source_label?: string | null
          source_locator: string
          source_text: string
          version_id: number
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
          source_label?: string | null
          source_locator?: string
          source_text?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_fees_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_fees_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      academic_structure_learning_outcomes: {
        Row: {
          id: number
          outcome_text: string
          position: number
          source_locator: string
          source_text: string
          version_id: number
        }
        Insert: {
          id?: never
          outcome_text: string
          position: number
          source_locator: string
          source_text: string
          version_id: number
        }
        Update: {
          id?: never
          outcome_text?: string
          position?: number
          source_locator?: string
          source_text?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_learning_outcomes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_learning_outcomes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      academic_structure_snapshot_relationships: {
        Row: {
          id: number
          position: number
          relationship_kind: string
          source_locator: string
          source_text: string
          target_code: string
          target_kind: string
          target_title: string | null
          version_id: number
        }
        Insert: {
          id?: never
          position: number
          relationship_kind: string
          source_locator: string
          source_text: string
          target_code: string
          target_kind: string
          target_title?: string | null
          version_id: number
        }
        Update: {
          id?: never
          position?: number
          relationship_kind?: string
          source_locator?: string
          source_text?: string
          target_code?: string
          target_kind?: string
          target_title?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_snapshot_relationships_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_snapshot_relationships_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
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
          source_locator: string
          source_text: string
          version_id: number
        }
        Insert: {
          heading: string
          id?: never
          markdown: string
          position: number
          section_key: string
          source_locator: string
          source_text: string
          version_id: number
        }
        Update: {
          heading?: string
          id?: never
          markdown?: string
          position?: number
          section_key?: string
          source_locator?: string
          source_text?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "academic_structure_snapshot_sections_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_structure_snapshot_sections_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
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
      catalogue_change_events: {
        Row: {
          actor_id: string | null
          created_at: string
          draft_revision: number | null
          editing_session_id: string | null
          event_kind: string
          id: number
          origin: string
          record_id: number
          sync_change_id: number | null
          version_id: number | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          draft_revision?: number | null
          editing_session_id?: string | null
          event_kind: string
          id?: never
          origin: string
          record_id: number
          sync_change_id?: number | null
          version_id?: number | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          draft_revision?: number | null
          editing_session_id?: string | null
          event_kind?: string
          id?: never
          origin?: string
          record_id?: number
          sync_change_id?: number | null
          version_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_change_events_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_change_events_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_change_events_sync_change_id_fkey"
            columns: ["sync_change_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sync_changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_change_events_version_fkey"
            columns: ["version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
        ]
      }
      catalogue_codes: {
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
      catalogue_discovery_check_source_pages: {
        Row: {
          discovery_check_id: number
          source_page_id: number
        }
        Insert: {
          discovery_check_id: number
          source_page_id: number
        }
        Update: {
          discovery_check_id?: number
          source_page_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_discovery_check_source_pages_discovery_check_id_fkey"
            columns: ["discovery_check_id"]
            isOneToOne: false
            referencedRelation: "catalogue_discovery_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_discovery_check_source_pages_source_page_id_fkey"
            columns: ["source_page_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_discovery_checks: {
        Row: {
          academic_year_id: number
          completed_at: string | null
          discovered_count: number
          error_code: string | null
          error_message: string | null
          id: number
          is_complete: boolean
          kind: string
          source: string
          source_page_id: number | null
          started_at: string
          status: string
        }
        Insert: {
          academic_year_id: number
          completed_at?: string | null
          discovered_count?: number
          error_code?: string | null
          error_message?: string | null
          id?: never
          is_complete?: boolean
          kind: string
          source?: string
          source_page_id?: number | null
          started_at?: string
          status: string
        }
        Update: {
          academic_year_id?: number
          completed_at?: string | null
          discovered_count?: number
          error_code?: string | null
          error_message?: string | null
          id?: never
          is_complete?: boolean
          kind?: string
          source?: string
          source_page_id?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_discovery_checks_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_discovery_checks_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      catalogue_discovery_statuses: {
        Row: {
          academic_year_id: number
          entry_count: number
          kind: string
          message: string | null
          refreshed_at: string | null
          status: string
        }
        Insert: {
          academic_year_id: number
          entry_count?: number
          kind: string
          message?: string | null
          refreshed_at?: string | null
          status?: string
        }
        Update: {
          academic_year_id?: number
          entry_count?: number
          kind?: string
          message?: string | null
          refreshed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_discovery_statuses_academic_year_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_draft_provenance: {
        Row: {
          changed_at: string
          changed_by: string | null
          field_path: string
          origin: string
          record_id: number
          source_evidence_id: number | null
          source_version_id: number | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field_path: string
          origin: string
          record_id: number
          source_evidence_id?: number | null
          source_version_id?: number | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field_path?: string
          origin?: string
          record_id?: number
          source_evidence_id?: number | null
          source_version_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_draft_provenance_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_drafts"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_draft_provenance_source_evidence_fkey"
            columns: ["source_evidence_id"]
            isOneToOne: false
            referencedRelation: "catalogue_version_provenance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_draft_provenance_source_version_fkey"
            columns: ["source_version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
        ]
      }
      catalogue_drafts: {
        Row: {
          base_version_id: number | null
          content: Json
          content_hash: string
          content_schema_version: number
          created_at: string
          record_id: number
          restored_from_version_id: number | null
          revision: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_version_id?: number | null
          content: Json
          content_hash: string
          content_schema_version?: number
          created_at?: string
          record_id: number
          restored_from_version_id?: number | null
          revision?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_version_id?: number | null
          content?: Json
          content_hash?: string
          content_schema_version?: number
          created_at?: string
          record_id?: number
          restored_from_version_id?: number | null
          revision?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_drafts_base_version_fkey"
            columns: ["base_version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
          {
            foreignKeyName: "catalogue_drafts_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: true
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_drafts_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: true
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_drafts_restored_version_fkey"
            columns: ["restored_from_version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
        ]
      }
      catalogue_extractions: {
        Row: {
          cached_input_tokens: number
          completed_at: string | null
          cost_source: string
          cost_usd: number
          domain_valid: boolean | null
          error_count: number
          error_summary: string | null
          extraction_number: number
          fingerprint: string
          finish_reason: string | null
          id: string
          input_tokens: number
          latency_ms: number | null
          output_tokens: number
          prompt_version: string
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
          sync_id: string
          validated_artifact_id: string | null
          validation_status: string
          warning_count: number
        }
        Insert: {
          cached_input_tokens?: number
          completed_at?: string | null
          cost_source?: string
          cost_usd?: number
          domain_valid?: boolean | null
          error_count?: number
          error_summary?: string | null
          extraction_number: number
          fingerprint: string
          finish_reason?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          output_tokens?: number
          prompt_version: string
          provider_request_id?: string | null
          reasoning_tokens?: number
          request_artifact_id: string
          requested_model: string
          resolved_model?: string | null
          response_artifact_id?: string | null
          reused_from_extraction_id?: string | null
          schema_valid?: boolean | null
          schema_version: string
          started_at?: string
          sync_id: string
          validated_artifact_id?: string | null
          validation_status?: string
          warning_count?: number
        }
        Update: {
          cached_input_tokens?: number
          completed_at?: string | null
          cost_source?: string
          cost_usd?: number
          domain_valid?: boolean | null
          error_count?: number
          error_summary?: string | null
          extraction_number?: number
          fingerprint?: string
          finish_reason?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number | null
          output_tokens?: number
          prompt_version?: string
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
          sync_id?: string
          validated_artifact_id?: string | null
          validation_status?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_extractions_request_artifact_id_fkey"
            columns: ["request_artifact_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sync_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_extractions_response_artifact_id_fkey"
            columns: ["response_artifact_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sync_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_extractions_reused_from_extraction_id_fkey"
            columns: ["reused_from_extraction_id"]
            isOneToOne: false
            referencedRelation: "catalogue_extractions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_extractions_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "catalogue_syncs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_extractions_validated_artifact_id_fkey"
            columns: ["validated_artifact_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sync_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_field_changes: {
        Row: {
          event_id: number
          field_path: string
          new_value: Json | null
          old_value: Json | null
          position: number
        }
        Insert: {
          event_id: number
          field_path: string
          new_value?: Json | null
          old_value?: Json | null
          position: number
        }
        Update: {
          event_id?: number
          field_path?: string
          new_value?: Json | null
          old_value?: Json | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_field_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "catalogue_change_events"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_listings: {
        Row: {
          academic_year_id: number
          code: string
          code_id: number
          first_seen_at: string
          id: number
          is_current: boolean
          kind: string
          last_seen_at: string
          record_id: number
          source_page_id: number | null
          summary: Json
          title: string | null
        }
        Insert: {
          academic_year_id: number
          code: string
          code_id: number
          first_seen_at?: string
          id?: never
          is_current?: boolean
          kind: string
          last_seen_at?: string
          record_id: number
          source_page_id?: number | null
          summary?: Json
          title?: string | null
        }
        Update: {
          academic_year_id?: number
          code?: string
          code_id?: number
          first_seen_at?: string
          id?: never
          is_current?: boolean
          kind?: string
          last_seen_at?: string
          record_id?: number
          source_page_id?: number | null
          summary?: Json
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_listings_academic_year_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_listings_code_fkey"
            columns: ["code_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "catalogue_listings_record_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_listings_record_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_listings_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      catalogue_publications: {
        Row: {
          id: number
          published_at: string
          published_by: string | null
          record_id: number
          unpublished_at: string | null
          unpublished_by: string | null
          version_id: number
        }
        Insert: {
          id?: never
          published_at?: string
          published_by?: string | null
          record_id: number
          unpublished_at?: string | null
          unpublished_by?: string | null
          version_id: number
        }
        Update: {
          id?: never
          published_at?: string
          published_by?: string | null
          record_id?: number
          unpublished_at?: string | null
          unpublished_by?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_publications_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_publications_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_publications_version_record_fkey"
            columns: ["version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
        ]
      }
      catalogue_records: {
        Row: {
          academic_year_id: number
          archived_at: string | null
          code_id: number
          created_at: string
          id: number
          kind: string
          latest_source_version_id: number | null
          public_id: string
          published_version_id: number | null
          source_checked_at: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: number
          archived_at?: string | null
          code_id: number
          created_at?: string
          id?: never
          kind: string
          latest_source_version_id?: number | null
          public_id?: string
          published_version_id?: number | null
          source_checked_at?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: number
          archived_at?: string | null
          code_id?: number
          created_at?: string
          id?: never
          kind?: string
          latest_source_version_id?: number | null
          public_id?: string
          published_version_id?: number | null
          source_checked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_records_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_records_code_kind_fkey"
            columns: ["code_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "catalogue_records_latest_source_version_fkey"
            columns: ["latest_source_version_id", "id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
          {
            foreignKeyName: "catalogue_records_published_version_fkey"
            columns: ["published_version_id", "id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
        ]
      }
      catalogue_source_documents: {
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
          public_id: string
          record_id: number
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
          fetched_at: string
          http_etag?: string | null
          http_status?: number | null
          id?: never
          kind: string
          media_type?: string
          public_id?: string
          record_id: number
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
          public_id?: string
          record_id?: number
          source_id?: number
          source_last_modified?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_source_documents_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_source_documents_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_source_documents_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_source_documents_record_kind_fkey"
            columns: ["record_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "catalogue_source_documents_record_year_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_source_documents_record_year_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_source_documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sources"
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
      catalogue_sync_artifacts: {
        Row: {
          attempt_number: number
          byte_size: number
          content_sha256: string
          created_at: string
          id: string
          kind: string
          media_type: string
          stage_id: string
          storage_bucket: string
          storage_path: string
          sync_id: string
        }
        Insert: {
          attempt_number: number
          byte_size: number
          content_sha256: string
          created_at?: string
          id?: string
          kind: string
          media_type: string
          stage_id: string
          storage_bucket: string
          storage_path: string
          sync_id: string
        }
        Update: {
          attempt_number?: number
          byte_size?: number
          content_sha256?: string
          created_at?: string
          id?: string
          kind?: string
          media_type?: string
          stage_id?: string
          storage_bucket?: string
          storage_path?: string
          sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_sync_artifacts_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "catalogue_sync_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_sync_artifacts_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "catalogue_syncs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_sync_changes: {
        Row: {
          base_source_value: Json | null
          classification: string
          created_at: string
          decision: string | null
          field_path: string
          id: number
          incoming_source_value: Json | null
          local_value: Json | null
          local_value_hash: string
          position: number
          record_id: number
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_unit_kind: string
          superseded_at: string | null
          sync_id: string
        }
        Insert: {
          base_source_value?: Json | null
          classification: string
          created_at?: string
          decision?: string | null
          field_path: string
          id?: never
          incoming_source_value?: Json | null
          local_value?: Json | null
          local_value_hash: string
          position: number
          record_id: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_unit_kind: string
          superseded_at?: string | null
          sync_id: string
        }
        Update: {
          base_source_value?: Json | null
          classification?: string
          created_at?: string
          decision?: string | null
          field_path?: string
          id?: never
          incoming_source_value?: Json | null
          local_value?: Json | null
          local_value_hash?: string
          position?: number
          record_id?: number
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_unit_kind?: string
          superseded_at?: string | null
          sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_sync_changes_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_sync_changes_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_sync_changes_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "catalogue_syncs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_sync_stages: {
        Row: {
          attempt_number: number
          completed_at: string | null
          error_code: string | null
          error_summary: string | null
          id: string
          stage_name: string
          started_at: string
          status: string
          sync_id: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          error_code?: string | null
          error_summary?: string | null
          id?: string
          stage_name: string
          started_at?: string
          status?: string
          sync_id: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          error_code?: string | null
          error_summary?: string | null
          id?: string
          stage_name?: string
          started_at?: string
          status?: string
          sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_sync_stages_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "catalogue_syncs"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_syncs: {
        Row: {
          attempt_count: number
          checked_at: string | null
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          lease_expires_at: string | null
          lock_version: number
          parser_version: string
          previous_source_version_id: number | null
          prompt_version: string
          public_id: string
          queue_message_id: string | null
          record_id: number
          requested_at: string
          requested_by: string | null
          requested_model: string
          schema_version: string
          source_document_id: number | null
          source_version_id: number | null
          started_at: string | null
          status: string
          trigger: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          checked_at?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          lock_version?: number
          parser_version: string
          previous_source_version_id?: number | null
          prompt_version: string
          public_id?: string
          queue_message_id?: string | null
          record_id: number
          requested_at?: string
          requested_by?: string | null
          requested_model: string
          schema_version: string
          source_document_id?: number | null
          source_version_id?: number | null
          started_at?: string | null
          status?: string
          trigger: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          checked_at?: string | null
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_expires_at?: string | null
          lock_version?: number
          parser_version?: string
          previous_source_version_id?: number | null
          prompt_version?: string
          public_id?: string
          queue_message_id?: string | null
          record_id?: number
          requested_at?: string
          requested_by?: string | null
          requested_model?: string
          schema_version?: string
          source_document_id?: number | null
          source_version_id?: number | null
          started_at?: string | null
          status?: string
          trigger?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_syncs_previous_source_version_fkey"
            columns: ["previous_source_version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
          {
            foreignKeyName: "catalogue_syncs_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_syncs_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "catalogue_syncs_requested_model_fkey"
            columns: ["requested_model"]
            isOneToOne: false
            referencedRelation: "import_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_syncs_source_document_fkey"
            columns: ["source_document_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_documents"
            referencedColumns: ["id", "record_id"]
          },
          {
            foreignKeyName: "catalogue_syncs_source_version_fkey"
            columns: ["source_version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
        ]
      }
      catalogue_version_flags: {
        Row: {
          code: string
          field_path: string | null
          id: number
          message: string
          position: number
          severity: string
          version_id: number
        }
        Insert: {
          code: string
          field_path?: string | null
          id?: never
          message: string
          position: number
          severity: string
          version_id: number
        }
        Update: {
          code?: string
          field_path?: string | null
          id?: never
          message?: string
          position?: number
          severity?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_version_flags_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_version_flags_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      catalogue_version_provenance: {
        Row: {
          academic_year_id: number
          confidence: number | null
          created_at: string
          field_path: string
          id: number
          method: string
          source_document_id: number | null
          source_excerpt: string | null
          source_locator: string | null
          source_page_id: number | null
          version_id: number
        }
        Insert: {
          academic_year_id: number
          confidence?: number | null
          created_at?: string
          field_path: string
          id?: never
          method: string
          source_document_id?: number | null
          source_excerpt?: string | null
          source_locator?: string | null
          source_page_id?: number | null
          version_id: number
        }
        Update: {
          academic_year_id?: number
          confidence?: number | null
          created_at?: string
          field_path?: string
          id?: never
          method?: string
          source_document_id?: number | null
          source_excerpt?: string | null
          source_locator?: string | null
          source_page_id?: number | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_version_provenance_snapshot_fkey"
            columns: ["version_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_version_provenance_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_version_provenance_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      catalogue_versions: {
        Row: {
          academic_year_id: number
          based_on_version_id: number | null
          content_hash: string
          created_at: string
          created_by: string | null
          id: number
          kind: string
          origin: string
          public_id: string
          record_id: number
          sealed_at: string | null
          source_document_id: number | null
          sync_id: string | null
        }
        Insert: {
          academic_year_id: number
          based_on_version_id?: number | null
          content_hash: string
          created_at?: string
          created_by?: string | null
          id?: never
          kind: string
          origin: string
          public_id?: string
          record_id: number
          sealed_at?: string | null
          source_document_id?: number | null
          sync_id?: string | null
        }
        Update: {
          academic_year_id?: number
          based_on_version_id?: number | null
          content_hash?: string
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          origin?: string
          public_id?: string
          record_id?: number
          sealed_at?: string | null
          source_document_id?: number | null
          sync_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_versions_based_on_fkey"
            columns: ["based_on_version_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "record_id"]
          },
          {
            foreignKeyName: "catalogue_versions_item_year_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_versions_item_year_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_versions_item_year_kind_fkey"
            columns: ["record_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "catalogue_versions_source_document_fkey"
            columns: ["source_document_id", "record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_documents"
            referencedColumns: ["id", "record_id"]
          },
          {
            foreignKeyName: "catalogue_versions_sync_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "catalogue_syncs"
            referencedColumns: ["id"]
          },
        ]
      }
      course_areas_of_interest: {
        Row: {
          created_at: string
          id: number
          name: string
          position: number
          version_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          position: number
          version_id: number
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          position?: number
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_areas_of_interest_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_areas_of_interest_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_assessment_items: {
        Row: {
          created_at: string
          due_text: string | null
          hurdle: boolean | null
          id: number
          learning_outcomes: number[] | null
          position: number
          source_text: string
          title: string
          updated_at: string
          version_id: number
          weight: number | null
        }
        Insert: {
          created_at?: string
          due_text?: string | null
          hurdle?: boolean | null
          id?: never
          learning_outcomes?: number[] | null
          position: number
          source_text: string
          title: string
          updated_at?: string
          version_id: number
          weight?: number | null
        }
        Update: {
          created_at?: string
          due_text?: string | null
          hurdle?: boolean | null
          id?: never
          learning_outcomes?: number[] | null
          position?: number
          source_text?: string
          title?: string
          updated_at?: string
          version_id?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_assessment_items_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assessment_items_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_assessment_outcomes: {
        Row: {
          assessment_item_id: number
          created_at: string
          learning_outcome_id: number
          version_id: number
        }
        Insert: {
          assessment_item_id: number
          created_at?: string
          learning_outcome_id: number
          version_id: number
        }
        Update: {
          assessment_item_id?: number
          created_at?: string
          learning_outcome_id?: number
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_assessment_outcomes_assessment_snapshot_fkey"
            columns: ["assessment_item_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_assessment_items"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "course_assessment_outcomes_learning_outcome_snapshot_fkey"
            columns: ["learning_outcome_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_learning_outcomes"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "course_assessment_outcomes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assessment_outcomes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_attempts: {
        Row: {
          academic_period_id: number
          catalogue_version_id: number
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
          catalogue_version_id: number
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
          catalogue_version_id?: number
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
            foreignKeyName: "course_attempts_catalogue_version_fkey"
            columns: ["catalogue_version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_attempts_catalogue_version_fkey"
            columns: ["catalogue_version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_attributes: {
        Row: {
          attribute_kind: string
          created_at: string
          id: number
          position: number
          source_text: string
          value: string
          version_id: number
        }
        Insert: {
          attribute_kind: string
          created_at?: string
          id?: never
          position: number
          source_text: string
          value: string
          version_id: number
        }
        Update: {
          attribute_kind?: string
          created_at?: string
          id?: never
          position?: number
          source_text?: string
          value?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_attributes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_attributes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_fees: {
        Row: {
          amount: number | null
          audience: string
          basis: string
          created_at: string
          currency: string | null
          fee_type: string
          fee_year: number | null
          id: number
          position: number
          source_label: string | null
          source_text: string | null
          student_contribution_band: number | null
          version_id: number
        }
        Insert: {
          amount?: number | null
          audience: string
          basis?: string
          created_at?: string
          currency?: string | null
          fee_type: string
          fee_year?: number | null
          id?: never
          position: number
          source_label?: string | null
          source_text?: string | null
          student_contribution_band?: number | null
          version_id: number
        }
        Update: {
          amount?: number | null
          audience?: string
          basis?: string
          created_at?: string
          currency?: string | null
          fee_type?: string
          fee_year?: number | null
          id?: never
          position?: number
          source_label?: string | null
          source_text?: string | null
          student_contribution_band?: number | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_fees_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_fees_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_learning_outcomes: {
        Row: {
          body: string
          created_at: string
          id: number
          position: number
          updated_at: string
          version_id: number
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          position: number
          updated_at?: string
          version_id: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          position?: number
          updated_at?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_learning_outcomes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_learning_outcomes_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          academic_year_id: number
          created_at: string
          delivery_mode: string | null
          id: number
          location: string | null
          source_page_id: number | null
          updated_at: string
          version_id: number
        }
        Insert: {
          academic_year_id: number
          created_at?: string
          delivery_mode?: string | null
          id?: never
          location?: string | null
          source_page_id?: number | null
          updated_at?: string
          version_id: number
        }
        Update: {
          academic_year_id?: number
          created_at?: string
          delivery_mode?: string | null
          id?: never
          location?: string | null
          source_page_id?: number | null
          updated_at?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "course_offerings_snapshot_year_fkey"
            columns: ["version_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "course_offerings_source_page_year_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      course_related_courses: {
        Row: {
          created_at: string
          id: number
          position: number
          related_course_id: number
          relation_kind: string
          source_course_code: string
          source_course_title: string | null
          source_text: string | null
          version_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          position: number
          related_course_id: number
          relation_kind: string
          source_course_code: string
          source_course_title?: string | null
          source_text?: string | null
          version_id: number
        }
        Update: {
          created_at?: string
          id?: never
          position?: number
          related_course_id?: number
          relation_kind?: string
          source_course_code?: string
          source_course_title?: string | null
          source_text?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_related_courses_related_item_fkey"
            columns: ["related_course_id"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_related_courses_related_item_fkey"
            columns: ["related_course_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["code_id"]
          },
          {
            foreignKeyName: "course_related_courses_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_related_courses_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_tags: {
        Row: {
          created_at: string
          id: number
          name: string
          position: number
          version_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          position: number
          version_id: number
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          position?: number
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_tags_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_tags_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_unit_options: {
        Row: {
          created_at: string
          id: number
          label: string | null
          position: number
          source_text: string
          units: number
          version_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          label?: string | null
          position: number
          source_text: string
          units: number
          version_id: number
        }
        Update: {
          created_at?: string
          id?: never
          label?: string | null
          position?: number
          source_text?: string
          units?: number
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_unit_options_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_unit_options_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      course_version_details: {
        Row: {
          academic_career: string | null
          college: string | null
          convener_text: string | null
          delivery_summary: string | null
          description: string | null
          eftsl: number | null
          inherent_requirements: string | null
          introduction: string | null
          kind: string
          level: number
          maximum_units: number | null
          minimum_units: number | null
          offering_status: string
          prescribed_texts: string | null
          school: string | null
          source_updated_at: string | null
          subject_code: string
          subject_name: string | null
          title: string
          unit_value_kind: string
          units: number | null
          version_id: number
          workload_hours: number | null
          workload_text: string | null
        }
        Insert: {
          academic_career?: string | null
          college?: string | null
          convener_text?: string | null
          delivery_summary?: string | null
          description?: string | null
          eftsl?: number | null
          inherent_requirements?: string | null
          introduction?: string | null
          kind?: string
          level: number
          maximum_units?: number | null
          minimum_units?: number | null
          offering_status?: string
          prescribed_texts?: string | null
          school?: string | null
          source_updated_at?: string | null
          subject_code: string
          subject_name?: string | null
          title: string
          unit_value_kind?: string
          units?: number | null
          version_id: number
          workload_hours?: number | null
          workload_text?: string | null
        }
        Update: {
          academic_career?: string | null
          college?: string | null
          convener_text?: string | null
          delivery_summary?: string | null
          description?: string | null
          eftsl?: number | null
          inherent_requirements?: string | null
          introduction?: string | null
          kind?: string
          level?: number
          maximum_units?: number | null
          minimum_units?: number | null
          offering_status?: string
          prescribed_texts?: string | null
          school?: string | null
          source_updated_at?: string | null
          subject_code?: string
          subject_name?: string | null
          title?: string
          unit_value_kind?: string
          units?: number | null
          version_id?: number
          workload_hours?: number | null
          workload_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_version_details_snapshot_kind_fkey"
            columns: ["version_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "kind"]
          },
        ]
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          href: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
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
          created_at: string
          delivery_mode: string | null
          ends_on: string | null
          enrol_closes_on: string | null
          id: number
          location: string | null
          position: number
          source_page_id: number | null
          source_text: string
          starts_on: string | null
          updated_at: string
          version_id: number
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
          created_at?: string
          delivery_mode?: string | null
          ends_on?: string | null
          enrol_closes_on?: string | null
          id?: never
          location?: string | null
          position: number
          source_page_id?: number | null
          source_text: string
          starts_on?: string | null
          updated_at?: string
          version_id: number
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
          created_at?: string
          delivery_mode?: string | null
          ends_on?: string | null
          enrol_closes_on?: string | null
          id?: never
          location?: string | null
          position?: number
          source_page_id?: number | null
          source_text?: string
          starts_on?: string | null
          updated_at?: string
          version_id?: number
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
            columns: ["course_offering_id", "version_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "offering_sessions_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_sessions_snapshot_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "offering_sessions_snapshot_year_fkey"
            columns: ["version_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "offering_sessions_source_page_year_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      plan_items: {
        Row: {
          academic_period_id: number | null
          catalogue_record_id: number
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
          catalogue_record_id: number
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
          catalogue_record_id?: number
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
            foreignKeyName: "plan_items_catalogue_record_fkey"
            columns: ["catalogue_record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_items_catalogue_record_fkey"
            columns: ["catalogue_record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
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
          catalogue_record_id: number
          created_at: string
          id: string
          owner_id: string
          plan_id: string
          position: number
          role: string
          updated_at: string
        }
        Insert: {
          catalogue_record_id: number
          created_at?: string
          id?: string
          owner_id: string
          plan_id: string
          position?: number
          role: string
          updated_at?: string
        }
        Update: {
          catalogue_record_id?: number
          created_at?: string
          id?: string
          owner_id?: string
          plan_id?: string
          position?: number
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_structures_catalogue_record_fkey"
            columns: ["catalogue_record_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_structures_catalogue_record_fkey"
            columns: ["catalogue_record_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id"]
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
      requirement_condition_options: {
        Row: {
          code: string
          code_id: number | null
          condition_id: number
          id: number
          kind: string
          position: number
          source_text: string | null
          title: string | null
          version_id: number
        }
        Insert: {
          code: string
          code_id?: number | null
          condition_id: number
          id?: never
          kind: string
          position: number
          source_text?: string | null
          title?: string | null
          version_id: number
        }
        Update: {
          code?: string
          code_id?: number | null
          condition_id?: number
          id?: never
          kind?: string
          position?: number
          source_text?: string | null
          title?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_condition_options_condition_fkey"
            columns: ["condition_id", "version_id"]
            isOneToOne: false
            referencedRelation: "requirement_conditions"
            referencedColumns: ["id", "version_id"]
          },
          {
            foreignKeyName: "requirement_condition_options_item_fkey"
            columns: ["code_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      requirement_conditions: {
        Row: {
          code_id: number | null
          condition_key: string
          condition_kind: string
          confidence: number
          free_text: string | null
          group_id: number
          hardness: string
          id: number
          item_kind: string | null
          maximum_level: number | null
          maximum_units: number | null
          minimum_count: number | null
          minimum_gpa: number | null
          minimum_level: number | null
          minimum_mark: number | null
          minimum_units: number | null
          minimum_wam: number | null
          minimum_year: number | null
          position: number
          requirement_mode: string | null
          review_state: string
          rule_id: number
          source_locator: string | null
          source_text: string | null
          structure_kind: string | null
          subject_code: string | null
          tag: string | null
          version_id: number
        }
        Insert: {
          code_id?: number | null
          condition_key: string
          condition_kind: string
          confidence?: number
          free_text?: string | null
          group_id: number
          hardness?: string
          id?: never
          item_kind?: string | null
          maximum_level?: number | null
          maximum_units?: number | null
          minimum_count?: number | null
          minimum_gpa?: number | null
          minimum_level?: number | null
          minimum_mark?: number | null
          minimum_units?: number | null
          minimum_wam?: number | null
          minimum_year?: number | null
          position?: number
          requirement_mode?: string | null
          review_state?: string
          rule_id: number
          source_locator?: string | null
          source_text?: string | null
          structure_kind?: string | null
          subject_code?: string | null
          tag?: string | null
          version_id: number
        }
        Update: {
          code_id?: number | null
          condition_key?: string
          condition_kind?: string
          confidence?: number
          free_text?: string | null
          group_id?: number
          hardness?: string
          id?: never
          item_kind?: string | null
          maximum_level?: number | null
          maximum_units?: number | null
          minimum_count?: number | null
          minimum_gpa?: number | null
          minimum_level?: number | null
          minimum_mark?: number | null
          minimum_units?: number | null
          minimum_wam?: number | null
          minimum_year?: number | null
          position?: number
          requirement_mode?: string | null
          review_state?: string
          rule_id?: number
          source_locator?: string | null
          source_text?: string | null
          structure_kind?: string | null
          subject_code?: string | null
          tag?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_conditions_group_fkey"
            columns: ["group_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "requirement_groups"
            referencedColumns: ["id", "rule_id"]
          },
          {
            foreignKeyName: "requirement_conditions_item_fkey"
            columns: ["code_id", "item_kind"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "requirement_conditions_rule_fkey"
            columns: ["rule_id", "version_id"]
            isOneToOne: false
            referencedRelation: "requirement_rules"
            referencedColumns: ["id", "version_id"]
          },
        ]
      }
      requirement_groups: {
        Row: {
          description: string | null
          group_key: string
          id: number
          label: string | null
          maximum_units: number | null
          minimum_count: number | null
          minimum_units: number | null
          operator: string
          parent_group_id: number | null
          position: number
          rule_id: number
          source_locator: string | null
          source_text: string | null
          version_id: number
        }
        Insert: {
          description?: string | null
          group_key: string
          id?: never
          label?: string | null
          maximum_units?: number | null
          minimum_count?: number | null
          minimum_units?: number | null
          operator: string
          parent_group_id?: number | null
          position?: number
          rule_id: number
          source_locator?: string | null
          source_text?: string | null
          version_id: number
        }
        Update: {
          description?: string | null
          group_key?: string
          id?: never
          label?: string | null
          maximum_units?: number | null
          minimum_count?: number | null
          minimum_units?: number | null
          operator?: string
          parent_group_id?: number | null
          position?: number
          rule_id?: number
          source_locator?: string | null
          source_text?: string | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_groups_parent_fkey"
            columns: ["parent_group_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "requirement_groups"
            referencedColumns: ["id", "rule_id"]
          },
          {
            foreignKeyName: "requirement_groups_rule_fkey"
            columns: ["rule_id", "version_id"]
            isOneToOne: false
            referencedRelation: "requirement_rules"
            referencedColumns: ["id", "version_id"]
          },
        ]
      }
      requirement_item_references: {
        Row: {
          code_id: number
          confidence: number
          id: number
          review_state: string
          rule_id: number
          source_text: string
          version_id: number
        }
        Insert: {
          code_id: number
          confidence?: number
          id?: never
          review_state?: string
          rule_id: number
          source_text: string
          version_id: number
        }
        Update: {
          code_id?: number
          confidence?: number
          id?: never
          review_state?: string
          rule_id?: number
          source_text?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_item_references_item_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_item_references_item_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["code_id"]
          },
          {
            foreignKeyName: "requirement_item_references_rule_fkey"
            columns: ["rule_id", "version_id"]
            isOneToOne: false
            referencedRelation: "requirement_rules"
            referencedColumns: ["id", "version_id"]
          },
        ]
      }
      requirement_rules: {
        Row: {
          academic_year_id: number
          confidence: number
          created_at: string
          hardness: string
          id: number
          position: number
          review_state: string
          rule_kind: string
          source_locator: string | null
          source_page_id: number | null
          source_text: string
          version_id: number
        }
        Insert: {
          academic_year_id: number
          confidence?: number
          created_at?: string
          hardness?: string
          id?: never
          position?: number
          review_state?: string
          rule_kind: string
          source_locator?: string | null
          source_page_id?: number | null
          source_text: string
          version_id: number
        }
        Update: {
          academic_year_id?: number
          confidence?: number
          created_at?: string
          hardness?: string
          id?: never
          position?: number
          review_state?: string
          rule_kind?: string
          source_locator?: string | null
          source_page_id?: number | null
          source_text?: string
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "requirement_rules_snapshot_fkey"
            columns: ["version_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "requirement_rules_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      structure_snapshot_summary_fields: {
        Row: {
          field_key: string
          field_value: string
          label: string
          position: number
          source_text: string
          value_position: number
          version_id: number
        }
        Insert: {
          field_key: string
          field_value: string
          label: string
          position: number
          source_text: string
          value_position: number
          version_id: number
        }
        Update: {
          field_key?: string
          field_value?: string
          label?: string
          position?: number
          source_text?: string
          value_position?: number
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "structure_snapshot_summary_fields_snapshot_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structure_snapshot_summary_fields_snapshot_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["version_id"]
          },
        ]
      }
      structure_version_details: {
        Row: {
          academic_career: string | null
          acronym: string | null
          atar: number | null
          can_combine: boolean | null
          can_combine_vertical: boolean | null
          college: string | null
          contact_text: string | null
          description: string | null
          duration_years: number | null
          introduction: string | null
          kind: string
          mode_of_delivery: string | null
          name: string
          selection_rank: number | null
          short_name: string | null
          study_as: string | null
          units: number | null
          version_id: number
        }
        Insert: {
          academic_career?: string | null
          acronym?: string | null
          atar?: number | null
          can_combine?: boolean | null
          can_combine_vertical?: boolean | null
          college?: string | null
          contact_text?: string | null
          description?: string | null
          duration_years?: number | null
          introduction?: string | null
          kind: string
          mode_of_delivery?: string | null
          name: string
          selection_rank?: number | null
          short_name?: string | null
          study_as?: string | null
          units?: number | null
          version_id: number
        }
        Update: {
          academic_career?: string | null
          acronym?: string | null
          atar?: number | null
          can_combine?: boolean | null
          can_combine_vertical?: boolean | null
          college?: string | null
          contact_text?: string | null
          description?: string | null
          duration_years?: number | null
          introduction?: string | null
          kind?: string
          mode_of_delivery?: string | null
          name?: string
          selection_rank?: number | null
          short_name?: string | null
          study_as?: string | null
          units?: number | null
          version_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "structure_version_details_snapshot_kind_fkey"
            columns: ["version_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_versions"
            referencedColumns: ["id", "kind"]
          },
        ]
      }
      university_calendar_event_changes: {
        Row: {
          action: string
          calendar_year: number
          changed_at: string
          changed_by: string | null
          event_date: string
          event_id: number
          id: number
          previous_date: string | null
          previous_title: string | null
          title: string
        }
        Insert: {
          action: string
          calendar_year: number
          changed_at?: string
          changed_by?: string | null
          event_date: string
          event_id: number
          id?: never
          previous_date?: string | null
          previous_title?: string | null
          title: string
        }
        Update: {
          action?: string
          calendar_year?: number
          changed_at?: string
          changed_by?: string | null
          event_date?: string
          event_id?: number
          id?: never
          previous_date?: string | null
          previous_title?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_calendar_event_changes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "university_calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      university_calendar_events: {
        Row: {
          academic_year_id: number
          calendar_year: number
          created_at: string
          event_date: string
          id: number
          origin: string
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
          origin?: string
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
          origin?: string
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
      university_calendar_reviews: {
        Row: {
          academic_year_id: number
          calendar_year: number
          canonical_url: string
          content_sha256: string
          decided_at: string | null
          decided_by: string | null
          diagnostics: Json
          events: Json
          external_key: string
          fetched_at: string
          id: string
          import_id: string | null
          parser_version: string
          requested_at: string
          requested_by: string | null
          source_base_url: string
          source_kind: string
          source_name: string
          status: string
        }
        Insert: {
          academic_year_id: number
          calendar_year: number
          canonical_url: string
          content_sha256: string
          decided_at?: string | null
          decided_by?: string | null
          diagnostics?: Json
          events: Json
          external_key: string
          fetched_at: string
          id?: string
          import_id?: string | null
          parser_version: string
          requested_at?: string
          requested_by?: string | null
          source_base_url: string
          source_kind: string
          source_name: string
          status?: string
        }
        Update: {
          academic_year_id?: number
          calendar_year?: number
          canonical_url?: string
          content_sha256?: string
          decided_at?: string | null
          decided_by?: string | null
          diagnostics?: Json
          events?: Json
          external_key?: string
          fetched_at?: string
          id?: string
          import_id?: string | null
          parser_version?: string
          requested_at?: string
          requested_by?: string | null
          source_base_url?: string
          source_kind?: string
          source_name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_calendar_reviews_academic_year_fkey"
            columns: ["academic_year_id", "calendar_year"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id", "year"]
          },
          {
            foreignKeyName: "university_calendar_reviews_import_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "university_calendar_imports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
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
      catalogue_directory_entries: {
        Row: {
          academic_year_id: number | null
          code: string | null
          code_id: number | null
          first_seen_at: string | null
          id: number | null
          is_current: boolean | null
          kind: string | null
          last_seen_at: string | null
          record_id: number | null
          source_page_id: number | null
          summary: Json | null
          title: string | null
        }
        Insert: {
          academic_year_id?: number | null
          code?: string | null
          code_id?: number | null
          first_seen_at?: string | null
          id?: number | null
          is_current?: boolean | null
          kind?: string | null
          last_seen_at?: string | null
          record_id?: number | null
          source_page_id?: number | null
          summary?: Json | null
          title?: string | null
        }
        Update: {
          academic_year_id?: number | null
          code?: string | null
          code_id?: number | null
          first_seen_at?: string | null
          id?: number | null
          is_current?: boolean | null
          kind?: string | null
          last_seen_at?: string | null
          record_id?: number | null
          source_page_id?: number | null
          summary?: Json | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_listings_academic_year_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_listings_code_fkey"
            columns: ["code_id", "kind"]
            isOneToOne: false
            referencedRelation: "catalogue_codes"
            referencedColumns: ["id", "kind"]
          },
          {
            foreignKeyName: "catalogue_listings_record_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_records"
            referencedColumns: ["id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_listings_record_fkey"
            columns: ["record_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "published_course_summaries"
            referencedColumns: ["record_id", "academic_year_id"]
          },
          {
            foreignKeyName: "catalogue_listings_source_page_fkey"
            columns: ["source_page_id", "academic_year_id"]
            isOneToOne: false
            referencedRelation: "catalogue_source_pages"
            referencedColumns: ["id", "academic_year_id"]
          },
        ]
      }
      published_course_summaries: {
        Row: {
          academic_career: string | null
          academic_year: number | null
          academic_year_id: number | null
          code: string | null
          code_id: number | null
          college: string | null
          convener_text: string | null
          delivery_summary: string | null
          description: string | null
          eftsl: number | null
          inherent_requirements: string | null
          introduction: string | null
          level: number | null
          maximum_units: number | null
          minimum_units: number | null
          offering_status: string | null
          prescribed_texts: string | null
          record_id: number | null
          school: string | null
          source_updated_at: string | null
          subject_code: string | null
          subject_name: string | null
          title: string | null
          unit_value_kind: string | null
          units: number | null
          version_id: number | null
          workload_hours: number | null
          workload_text: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_records_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_current_user_plan_item: {
        Args: {
          p_academic_year: number
          p_course_code: string
          p_planned_calendar_year?: number
          p_planned_period_code?: string
        }
        Returns: string
      }
      admin_catalogue_version_projection: {
        Args: { p_version_id: number }
        Returns: Json
      }
      approve_university_calendar_review: {
        Args: { p_review_id: string }
        Returns: string
      }
      cancel_catalogue_sync: { Args: { p_sync_id: string }; Returns: boolean }
      catalogue_publish_blockers: {
        Args: { p_record_id: number }
        Returns: string[]
      }
      current_user_course_attempt_version_projections: {
        Args: { p_version_ids: number[] }
        Returns: {
          projection: Json
          version_id: number
        }[]
      }
      current_user_has_permission: {
        Args: { required_permission: string }
        Returns: boolean
      }
      discard_university_calendar_review: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      mark_notifications_read: {
        Args: { p_notification_ids?: string[] }
        Returns: number
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
      published_course_availability: {
        Args: { p_academic_year: number; p_course_code: string }
        Returns: {
          academic_year: number
          course_code: string
          course_id: number
          course_year_id: number
          is_available: boolean
          offering_status: string
          published_version_id: number
        }[]
      }
      published_course_detail: {
        Args: { p_academic_year: number; p_course_code: string }
        Returns: Json
      }
      published_requirement_graph: {
        Args: { p_academic_year: number; p_course_code: string }
        Returns: {
          from_code: string
          from_is_available: boolean
          to_code: string
          to_is_available: boolean
        }[]
      }
      published_structure_detail: {
        Args: { p_academic_year: number; p_structure_code: string }
        Returns: Json
      }
      published_structure_years: {
        Args: { p_structure_code: string }
        Returns: {
          academic_year: number
          structure_kind: string
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
      remove_current_user_plan_item: {
        Args: { p_plan_item_id: string }
        Returns: boolean
      }
      remove_university_calendar_event: {
        Args: { p_event_id: number }
        Returns: undefined
      }
      revise_university_calendar_review: {
        Args: {
          p_event_date: string
          p_new_event_date?: string
          p_new_title?: string
          p_review_id: string
          p_title: string
        }
        Returns: undefined
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
      save_university_calendar_event: {
        Args: {
          p_calendar_year: number
          p_event_date: string
          p_event_id?: number
          p_title: string
        }
        Returns: number
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
      stage_university_calendar_review: {
        Args: {
          p_calendar_year: number
          p_diagnostics: Json
          p_document: Json
          p_events: Json
          p_parser_version: string
          p_source: Json
        }
        Returns: string
      }
      start_catalogue_sync: {
        Args: {
          p_parser_version: string
          p_prompt_version: string
          p_record_id: number
          p_requested_model: string
          p_schema_version: string
          p_trigger: string
        }
        Returns: string
      }
      unpublish_catalogue_record: {
        Args: { p_record_id: number }
        Returns: undefined
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

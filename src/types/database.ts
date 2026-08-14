/**
 * Supabase の `public` スキーマに対応する TypeScript 型定義。
 * planning/mvp-plan.md 「5. データベース設計」および
 * supabase/migrations/001_initial.sql に基づく。
 *
 * @supabase/supabase-js の createClient<Database>() にそのまま渡せる形式（Row/Insert/Update）。
 */

export type Platform =
  | "tiktok"
  | "youtube_shorts"
  | "instagram_reels"
  | "youtube"
  | "instagram"
  | "twitter"
  | "note";

export type IdeaStatus = "candidate" | "selected" | "approved" | "rejected";
export type IdeaSource = "ai" | "manual";
export type RiskLevel = "low" | "medium" | "high";
export type ProductionStatus = "planning" | "script" | "producing" | "review" | "done";
export type ScheduleStatus = "planned" | "published" | "cancelled";
export type PostDataSource = "manual" | "csv";
export type RevenueSourceType = "ad_revenue" | "affiliate" | "sponsorship" | "other";
export type AiSuggestionType = "next_idea" | "pattern_analysis" | "improvement";
export type BasisConfidence = "low" | "high";
export type AiWorkflowType =
  | "daily_candidates"
  | "daily_script"
  | "daily_summary"
  | "weekly_analysis";

export interface ScriptStructureItem {
  time: string;
  content: string;
}

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      accounts: {
        Row: {
          id: string;
          user_id: string;
          platform: Platform;
          account_name: string;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: Platform;
          account_name: string;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      genres: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["genres"]["Insert"]>;
        Relationships: [];
      };
      ideas: {
        Row: {
          id: string;
          user_id: string;
          genre_id: string | null;
          title: string;
          description: string | null;
          score: number | null;
          score_reason: string | null;
          duplicate_flag: boolean;
          status: IdeaStatus;
          source: IdeaSource | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          genre_id?: string | null;
          title: string;
          description?: string | null;
          score?: number | null;
          score_reason?: string | null;
          duplicate_flag?: boolean;
          status?: IdeaStatus;
          source?: IdeaSource | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ideas"]["Insert"]>;
        Relationships: [];
      };
      scripts: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          version: number;
          hook: string | null;
          narration: string | null;
          structure: ScriptStructureItem[] | null;
          video_prompt: string | null;
          risk_level: RiskLevel;
          is_approved: boolean;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id: string;
          version?: number;
          hook?: string | null;
          narration?: string | null;
          structure?: ScriptStructureItem[] | null;
          video_prompt?: string | null;
          risk_level?: RiskLevel;
          is_approved?: boolean;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scripts"]["Insert"]>;
        Relationships: [];
      };
      production_tasks: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          status: ProductionStatus;
          assignee_memo: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id: string;
          status?: ProductionStatus;
          assignee_memo?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["production_tasks"]["Insert"]>;
        Relationships: [];
      };
      schedules: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          account_id: string;
          scheduled_at: string;
          status: ScheduleStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id: string;
          account_id: string;
          scheduled_at: string;
          status?: ScheduleStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["schedules"]["Insert"]>;
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          video_url: string | null;
          thumbnail_url: string | null;
          audio_url: string | null;
          image_urls: string[] | null;
          subtitle_text: string | null;
          rights_checked: boolean;
          is_approved: boolean;
          approved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id: string;
          video_url?: string | null;
          thumbnail_url?: string | null;
          audio_url?: string | null;
          image_urls?: string[] | null;
          subtitle_text?: string | null;
          rights_checked?: boolean;
          is_approved?: boolean;
          approved_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assets"]["Insert"]>;
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          account_id: string;
          posted_at: string | null;
          views: number;
          likes: number;
          comments: number;
          shares: number;
          saves: number;
          data_source: PostDataSource | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id: string;
          account_id: string;
          posted_at?: string | null;
          views?: number;
          likes?: number;
          comments?: number;
          shares?: number;
          saves?: number;
          data_source?: PostDataSource | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["posts"]["Insert"]>;
        Relationships: [];
      };
      revenues: {
        Row: {
          id: string;
          user_id: string;
          post_id: string | null;
          account_id: string | null;
          source_type: RevenueSourceType;
          amount: number;
          expense: number;
          record_date: string;
          memo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          post_id?: string | null;
          account_id?: string | null;
          source_type: RevenueSourceType;
          amount: number;
          expense?: number;
          record_date: string;
          memo?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["revenues"]["Insert"]>;
        Relationships: [];
      };
      ai_suggestions: {
        Row: {
          id: string;
          user_id: string;
          type: AiSuggestionType;
          content: {
            title?: string;
            description: string;
            score?: number;
            patterns?: string[];
            advice?: string[];
          };
          basis_confidence: BasisConfidence;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: AiSuggestionType;
          content: {
            title?: string;
            description: string;
            score?: number;
            patterns?: string[];
            advice?: string[];
          };
          basis_confidence?: BasisConfidence;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_suggestions"]["Insert"]>;
        Relationships: [];
      };
      ai_workflow_logs: {
        Row: {
          id: string;
          user_id: string;
          workflow_type: AiWorkflowType;
          triggered_at: string;
          result_summary: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          workflow_type: AiWorkflowType;
          triggered_at?: string;
          result_summary?: Record<string, unknown> | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_workflow_logs"]["Insert"]>;
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          user_id: string;
          ai_enabled: boolean;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ai_enabled?: boolean;
          timezone?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      note_articles: {
        Row: {
          id: string;
          user_id: string;
          idea_id: string;
          title: string;
          body: string;
          hashtags: string[];
          eye_catch_prompt: string | null;
          is_generated: boolean;
          generated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idea_id: string;
          title: string;
          body: string;
          hashtags?: string[];
          eye_catch_prompt?: string | null;
          is_generated?: boolean;
          generated_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["note_articles"]["Insert"]>;
        Relationships: [];
      };
    };
  };
}

export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type GenreRow = Database["public"]["Tables"]["genres"]["Row"];
export type IdeaRow = Database["public"]["Tables"]["ideas"]["Row"];
export type ScriptRow = Database["public"]["Tables"]["scripts"]["Row"];
export type ProductionTaskRow = Database["public"]["Tables"]["production_tasks"]["Row"];
export type ScheduleRow = Database["public"]["Tables"]["schedules"]["Row"];
export type AssetRow = Database["public"]["Tables"]["assets"]["Row"];
export type PostRow = Database["public"]["Tables"]["posts"]["Row"];
export type RevenueRow = Database["public"]["Tables"]["revenues"]["Row"];
export type AiSuggestionRow = Database["public"]["Tables"]["ai_suggestions"]["Row"];
export type AiWorkflowLogRow = Database["public"]["Tables"]["ai_workflow_logs"]["Row"];
export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type NoteArticleRow = Database["public"]["Tables"]["note_articles"]["Row"];

/**
 * Supabase DB 스키마 타입.
 * 실제 스키마가 있으면 `npx supabase gen types typescript` 출력으로 교체하면 됨.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      posts: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      comments: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      votes: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      vote_events: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      reports: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      blocked_ips: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      blocked_keywords: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      petition_comments: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      petition_agrees: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      petitions: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      comment_likes: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      likes: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      post_views: { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

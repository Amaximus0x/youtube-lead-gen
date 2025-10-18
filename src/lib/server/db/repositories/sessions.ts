import { supabase } from '../supabase';
import type { SearchSession, SearchSessionInsert, SearchSessionUpdate } from '$lib/types/models';

export class SearchSessionRepository {
  // Create new search session
  async createSession(session: SearchSessionInsert): Promise<string> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('search_sessions')
      .insert({
        ...session,
        status: session.status || 'pending',
        total_found: session.total_found || 0,
        processed: session.processed || 0,
        with_email: session.with_email || 0,
      } as any)
      .select('id')
      .single();

    if (error) {
      console.error('Error creating session:', error);
      throw error;
    }

    return (data as any).id;
  }

  // Update search session
  async updateSession(sessionId: string, updates: SearchSessionUpdate): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase
      .from('search_sessions')
      // @ts-ignore - Supabase type inference issue with generic Database type
      .update(updates)
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating session:', error);
      throw error;
    }
  }

  // Get session by ID
  async getSession(sessionId: string): Promise<SearchSession | null> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('search_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error getting session:', error);
      throw error;
    }

    return data;
  }

  // Get user's sessions
  async getUserSessions(userId: string, limit: number = 10): Promise<SearchSession[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('search_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error getting user sessions:', error);
      throw error;
    }

    return data || [];
  }

  // Get all sessions (for admin or public view)
  async getAllSessions(limit: number = 10, offset: number = 0): Promise<SearchSession[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('search_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error getting all sessions:', error);
      throw error;
    }

    return data || [];
  }

  // Get active (running) sessions
  async getActiveSessions(): Promise<SearchSession[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('search_sessions')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error getting active sessions:', error);
      throw error;
    }

    return data || [];
  }

  // Delete session
  async deleteSession(sessionId: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase.from('search_sessions').delete().eq('id', sessionId);

    if (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const searchSessionRepository = new SearchSessionRepository();

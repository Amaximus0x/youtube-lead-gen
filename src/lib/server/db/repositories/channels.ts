import { supabase } from '../supabase';
import type { Channel, ChannelInsert, ChannelUpdate } from '$lib/types/models';

export class ChannelRepository {
  // Create or update channel (upsert by channel_id)
  async upsertChannel(channel: ChannelInsert): Promise<Channel | null> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('channels')
      .upsert(channel as any, {
        onConflict: 'channel_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting channel:', error);
      throw error;
    }

    return data;
  }

  // Get channel by UUID
  async getChannel(id: string): Promise<Channel | null> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error getting channel:', error);
      throw error;
    }

    return data;
  }

  // Get channel by channel_id (YouTube ID)
  async getChannelByChannelId(channelId: string): Promise<Channel | null> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('channel_id', channelId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error getting channel by channel_id:', error);
      throw error;
    }

    return data;
  }

  // Search channels with filters
  async searchChannels(params: {
    keyword?: string;
    minSubs?: number;
    maxSubs?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Channel[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    let query = supabase.from('channels').select('*');

    if (params.keyword) {
      query = query.eq('search_keyword', params.keyword);
    }

    if (params.minSubs !== undefined) {
      query = query.gte('subscriber_count', params.minSubs);
    }

    if (params.maxSubs !== undefined) {
      query = query.lte('subscriber_count', params.maxSubs);
    }

    if (params.status) {
      query = query.eq('status', params.status);
    }

    query = query.order('created_at', { ascending: false });

    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error searching channels:', error);
      throw error;
    }

    return data || [];
  }

  // Update channel
  async updateChannel(id: string, updates: ChannelUpdate): Promise<Channel | null> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('channels')
      // @ts-ignore - Supabase type inference issue with generic Database type
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating channel:', error);
      throw error;
    }

    return data;
  }

  // Batch update channels
  async batchUpdateChannels(
    updates: Array<{
      id: string;
      data: ChannelUpdate;
    }>
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    // Supabase doesn't support batch updates directly, so we do them sequentially
    // For better performance, consider using RPC functions
    for (const update of updates) {
      await this.updateChannel(update.id, update.data);
    }
  }

  // Get channels pending email extraction
  async getChannelsPendingExtraction(limit: number = 10): Promise<Channel[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('status', 'pending')
      .is('email', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error getting channels pending extraction:', error);
      throw error;
    }

    return data || [];
  }

  // Delete channel
  async deleteChannel(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase.from('channels').delete().eq('id', id);

    if (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  // Get channels with email
  async getChannelsWithEmail(limit: number = 100): Promise<Channel[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .not('email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error getting channels with email:', error);
      throw error;
    }

    return data || [];
  }
}

// Export singleton instance
export const channelRepository = new ChannelRepository();

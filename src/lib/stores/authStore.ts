import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
	user: User | null;
	session: Session | null;
	loading: boolean;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		user: null,
		session: null,
		loading: true
	});

	return {
		subscribe,

		/**
		 * Initialize auth state and set up listener for auth changes
		 */
		initialize: async () => {
			// Get initial session
			const { data: { session } } = await supabase.auth.getSession();

			set({
				user: session?.user ?? null,
				session: session ?? null,
				loading: false
			});

			// Listen for auth changes
			const { data: { subscription } } = supabase.auth.onAuthStateChange(
				async (event, session) => {
					console.log('[AuthStore] Auth state changed:', event);

					set({
						user: session?.user ?? null,
						session: session ?? null,
						loading: false
					});
				}
			);

			// Return cleanup function
			return () => {
				subscription.unsubscribe();
			};
		},

		/**
		 * Sign up a new user with email and password
		 */
		signUp: async (email: string, password: string) => {
			update(state => ({ ...state, loading: true }));

			const { data, error } = await supabase.auth.signUp({
				email,
				password
			});

			if (error) {
				update(state => ({ ...state, loading: false }));
				throw error;
			}

			// Note: User will need to confirm email before they can sign in
			// Unless you disabled email confirmation in Supabase settings
			return data;
		},

		/**
		 * Sign in existing user with email and password
		 */
		signIn: async (email: string, password: string) => {
			update(state => ({ ...state, loading: true }));

			const { data, error } = await supabase.auth.signInWithPassword({
				email,
				password
			});

			if (error) {
				update(state => ({ ...state, loading: false }));
				throw error;
			}

			return data;
		},

		/**
		 * Sign out the current user
		 */
		signOut: async () => {
			update(state => ({ ...state, loading: true }));

			const { error } = await supabase.auth.signOut();

			if (error) {
				update(state => ({ ...state, loading: false }));
				throw error;
			}

			set({
				user: null,
				session: null,
				loading: false
			});
		},

		/**
		 * Send password reset email
		 */
		resetPassword: async (email: string) => {
			const { error } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${window.location.origin}/reset-password`
			});

			if (error) {
				throw error;
			}
		},

		/**
		 * Update user password (must be authenticated)
		 */
		updatePassword: async (newPassword: string) => {
			const { error } = await supabase.auth.updateUser({
				password: newPassword
			});

			if (error) {
				throw error;
			}
		}
	};
}

export const authStore = createAuthStore();

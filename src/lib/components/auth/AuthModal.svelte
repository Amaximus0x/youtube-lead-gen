<script lang="ts">
	import { authStore } from '$lib/stores/authStore';
	import { toastStore } from '$lib/stores/toast';

	interface Props {
		mode: 'login' | 'signup';
		onClose: () => void;
	}

	let { mode = $bindable(), onClose }: Props = $props();

	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		// Validation
		if (!email || !password) {
			error = 'Please fill in all fields';
			return;
		}

		if (mode === 'signup') {
			if (password.length < 6) {
				error = 'Password must be at least 6 characters';
				return;
			}
			if (password !== confirmPassword) {
				error = 'Passwords do not match';
				return;
			}
		}

		isLoading = true;

		try {
			if (mode === 'login') {
				await authStore.signIn(email, password);
				toastStore.show('Successfully logged in!', 'success');
				onClose();
			} else {
				await authStore.signUp(email, password);
				toastStore.show(
					'Account created! Please check your email to confirm your account.',
					'success',
					8000
				);
				onClose();
			}
		} catch (err: any) {
			console.error('[AuthModal] Error:', err);
			error = err.message || 'An error occurred. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function switchMode() {
		mode = mode === 'login' ? 'signup' : 'login';
		error = '';
		password = '';
		confirmPassword = '';
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}
</script>

<!-- Modal Backdrop -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
	onclick={handleBackdropClick}
	onkeydown={handleKeyDown}
	role="dialog"
	aria-modal="true"
	tabindex="-1"
>
	<!-- Modal Container -->
	<div class="relative w-full max-w-md p-6 bg-white rounded-lg shadow-xl">
		<!-- Close Button -->
		<button
			onclick={onClose}
			class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
			aria-label="Close"
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>

		<!-- Modal Header -->
		<div class="mb-6">
			<h2 class="text-2xl font-bold text-gray-900">
				{mode === 'login' ? 'Welcome Back' : 'Create Account'}
			</h2>
			<p class="mt-2 text-sm text-gray-600">
				{mode === 'login'
					? 'Sign in to access your search history'
					: 'Sign up to save your searches and track your leads'}
			</p>
		</div>

		<!-- Error Message -->
		{#if error}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
				<p class="text-sm text-red-800">{error}</p>
			</div>
		{/if}

		<!-- Auth Form -->
		<form onsubmit={handleSubmit} class="space-y-4">
			<!-- Email Input -->
			<div>
				<label for="email" class="block text-sm font-medium text-gray-700 mb-1">
					Email Address
				</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					required
					class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>
			</div>

			<!-- Password Input -->
			<div>
				<label for="password" class="block text-sm font-medium text-gray-700 mb-1">
					Password
				</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					required
					class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>
			</div>

			<!-- Confirm Password (Signup only) -->
			{#if mode === 'signup'}
				<div>
					<label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
						Confirm Password
					</label>
					<input
						id="confirmPassword"
						type="password"
						bind:value={confirmPassword}
						placeholder="••••••••"
						required
						class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					/>
				</div>
			{/if}

			<!-- Submit Button -->
			<button
				type="submit"
				disabled={isLoading}
				class="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
			>
				{#if isLoading}
					<span class="flex items-center justify-center gap-2">
						<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						{mode === 'login' ? 'Signing in...' : 'Creating account...'}
					</span>
				{:else}
					{mode === 'login' ? 'Sign In' : 'Create Account'}
				{/if}
			</button>
		</form>

		<!-- Switch Mode -->
		<div class="mt-6 text-center">
			<p class="text-sm text-gray-600">
				{mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
				<button
					onclick={switchMode}
					class="font-medium text-blue-600 hover:text-blue-700 transition"
				>
					{mode === 'login' ? 'Sign up' : 'Log in'}
				</button>
			</p>
		</div>
	</div>
</div>

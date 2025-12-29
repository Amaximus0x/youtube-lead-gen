<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Toast from '$lib/components/ui/Toast.svelte';
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/authStore';
	import AuthModal from '$lib/components/auth/AuthModal.svelte';

	let { children } = $props();

	let showAuthModal = $state(false);
	let authMode: 'login' | 'signup' = $state('login');
	let showUserMenu = $state(false);

	const auth = $derived($authStore);

	onMount(() => {
		// Initialize auth state
		authStore.initialize();
	});

	function openLoginModal() {
		authMode = 'login';
		showAuthModal = true;
	}

	function openSignupModal() {
		authMode = 'signup';
		showAuthModal = true;
	}

	function toggleUserMenu() {
		showUserMenu = !showUserMenu;
	}

	async function handleSignOut() {
		try {
			showUserMenu = false;
			await authStore.signOut();
		} catch (error) {
			console.error('Error signing out:', error);
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>YouTube Lead Generation</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<nav class="bg-white shadow-sm">
		<div class="container px-6 py-4 mx-auto">
			<div class="flex items-center justify-between">
				<h1 class="text-2xl font-bold text-primary-600">YouTube Lead Gen</h1>
				<div class="flex items-center gap-6">
					<a href="/" class="text-gray-600 hover:text-gray-900 transition">Home</a>
					<a href="/dashboard" class="text-gray-600 hover:text-gray-900 transition">Dashboard</a>

					{#if auth.loading}
						<div class="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
					{:else if auth.user}
						<!-- User Menu -->
						<div class="relative">
							<button
								onclick={toggleUserMenu}
								class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
								</svg>
								<span>{auth.user.email}</span>
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
								</svg>
							</button>

							{#if showUserMenu}
								<div class="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
									<button
										onclick={handleSignOut}
										class="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition rounded-lg"
									>
										Sign Out
									</button>
								</div>
							{/if}
						</div>
					{:else}
						<!-- Auth Buttons -->
						<div class="flex items-center gap-3">
							<button
								onclick={openLoginModal}
								class="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition"
							>
								Log In
							</button>
							<button
								onclick={openSignupModal}
								class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
							>
								Sign Up
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</nav>

	<main class="container py-8 mx-auto">
		{@render children?.()}
	</main>

	<!-- Global Toast Notifications -->
	<Toast />

	<!-- Auth Modal -->
	{#if showAuthModal}
		<AuthModal
			mode={authMode}
			onClose={() => (showAuthModal = false)}
		/>
	{/if}
</div>

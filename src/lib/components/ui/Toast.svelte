<script lang="ts">
  import { toastStore } from '$lib/stores/toast';
  import { fade, fly } from 'svelte/transition';

  $: toasts = $toastStore;

  function getIcon(type: string) {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
      default:
        return 'ℹ';
    }
  }

  function getColors(type: string) {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'info':
      default:
        return 'bg-blue-500 text-white';
    }
  }
</script>

<div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  {#each toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg {getColors(
        toast.type
      )} min-w-[300px] max-w-[500px]"
      transition:fly={{ x: 300, duration: 300 }}
    >
      <span class="text-xl font-bold">{getIcon(toast.type)}</span>
      <span class="flex-1 text-sm">{toast.message}</span>
      <button
        on:click={() => toastStore.dismiss(toast.id)}
        class="text-white hover:text-gray-200 text-xl leading-none"
      >
        ×
      </button>
    </div>
  {/each}
</div>

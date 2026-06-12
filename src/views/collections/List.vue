<template>
  <div>
    <div class="mb-4 flex justify-between items-center">
      <div class="flex justify-between w-full">
        <div class="flex items-center">
          <h1 class="font-bold text-xl lg:text-2xl mr-4">
            {{ $t("common_collections") }}
          </h1>
        </div>
        <!-- <StoreCart class="md:hidden" /> -->
      </div>
      <div class="flex gap-2">
        <BaseButton
          theme="tertiary"
          @click="refreshSubscriptions"
          class="refresh-button hidden"
          :loading="loadingSubs"
        >
          <template #icon>
            <RefreshIcon class="h-4 w-4" />
          </template>
          {{ $t("common_refreshSubscriptions") }}
        </BaseButton>
        <BaseButton
          v-if="productIds.length"
          @click="portal"
          theme="tertiary"
          :loading="loading"
          class="manage-button"
        >
          <template #icon>
            <CreditCardIcon class="w-4 h-4" />
          </template>
          <span class="whitespace-nowrap">
            {{ $t("common_manage") }}
            {{ $t("common_subscriptions").toLowerCase() }}
          </span>
        </BaseButton>
      </div>
    </div>
    <div
      class="gap-6 grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      v-if="collections.length"
    >
      <div
        v-for="c in collections"
        :key="c.id"
        class="flex flex-col rounded-lg overflow-hidden shadow-md relative cursor-pointer"
        @click="goToCollection(c)"
      >
        <div class="overflow-hidden min-h-[250px] bg-white dark:bg-secondary">
          <img
            loading="lazy"
            class="w-full object-cover"
            height="250"
            :src="c.image ? `${c.image}?w=300&q=50` : '/img/placeholder.png'"
            :alt="c.getName()"
          />
        </div>
        <div
          class="w-full p-4 bg-white flex flex-col flex-grow justify-between border-t border-gray-300 dark:bg-secondary dark:border-none"
        >
          <h2 class="font-bold leading-tight">{{ c.getName() }}</h2>
        </div>
      </div>
      <div
        class="bg-white dark:bg-secondary shadow-md rounded-lg overflow-hidden"
      >
        <img
          src="/img/Tutorials.png"
          alt=""
          class="w-full cursor-pointer"
          @click="$router.push({ name: 'tutorials' })"
        />
        <div
          class="border-t border-gray-300 dark:bg-secondary dark:border-none p-4"
        >
          <div class="flex gap-4 justify-between items-center">
            <h3 class="font-bold">Tutorials</h3>
          </div>
          <p class="opacity-50 mt-2 text-sm">
            Learn how to play with our free tutorials!
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { RefreshIcon, CreditCardIcon } from "@heroicons/vue/solid";
import { notify } from "@/services/notify";
import { Collection } from "@/classes";
import { storeService } from "@/services/modules";
import { appSession } from "@/services/session";
import { application } from "@/classes/application";

export default defineComponent({
  name: "collections-home",
  components: {
    RefreshIcon,
    CreditCardIcon,
  },
  data: () => ({
    loading: false,
    loadingSubs: false,
  }),
  computed: {
    collections(): Collection[] {
      return appSession.collections
        .filter((c) => c.available && c.type === "song")
        .sort((a, b) => b.priority - a.priority);
    },
    user() {
      return appSession.user;
    },
    productIds() {
      const ids: string[] = [];

      for (const s of this.user?.subscriptions ?? []) {
        for (const id in s.productIds) {
          if (!ids.includes(id)) ids.push(id);
        }
      }

      return ids;
    },
  },
  async mounted() {
    application.setTitle(null);
  },
  methods: {
    goToCollection(c: Collection) {
      if (c.key) {
        this.$router.push({
          name: "song-list",
          params: { collection: c.key },
        });
      }
    },
    async portal() {
      this.loading = true;
      window.location.href = await storeService.portal();
    },
    async refreshSubscriptions() {
      this.loadingSubs = true;
      await storeService.refreshSubscriptions();
      this.loadingSubs = false;

      notify("success", this.$t("common_subscriptionsRefreshed"), "check");
    },
  },
});
</script>

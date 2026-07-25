<template>
  <div>
    <div class="mb-4 flex justify-between items-center">
      <div class="flex justify-between w-full">
        <div class="flex items-center">
          <h1 class="font-bold text-xl lg:text-2xl mr-4">
            {{ $t("common_collections") }}
          </h1>
        </div>
      </div>
    </div>
    <div v-if="collections.length">
      <div
        v-if="featuredCollections.length"
        class="gap-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 mb-6"
      >
        <div
          v-for="c in featuredCollections"
          :key="c.id"
          class="flex flex-col rounded-lg overflow-hidden shadow-md relative cursor-pointer"
          @click="goToCollection(c)"
        >
          <div class="overflow-hidden min-h-[300px] bg-white dark:bg-secondary">
            <img
              loading="lazy"
              class="w-full object-cover"
              height="300"
              :src="c.image ? `${c.image}?w=400&q=60` : '/img/placeholder.png'"
              :alt="c.getName()"
            />
          </div>
          <div
            class="w-full p-4 bg-white flex flex-col flex-grow justify-between border-t border-gray-300 dark:bg-secondary dark:border-none"
          >
            <h2 class="font-bold leading-tight">{{ c.getName() }}</h2>
          </div>
        </div>
      </div>
      <div
        class="gap-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
      >
        <div
          v-for="c in otherCollections"
          :key="c.id"
          class="flex flex-col rounded-lg overflow-hidden shadow-md relative cursor-pointer"
          @click="goToCollection(c)"
        >
          <div class="overflow-hidden min-h-[150px] bg-white dark:bg-secondary">
            <img
              loading="lazy"
              class="w-full object-cover"
              height="150"
              :src="c.image ? `${c.image}?w=200&q=50` : '/img/placeholder.png'"
              :alt="c.getName()"
            />
          </div>
          <div
            class="w-full p-3 bg-white flex flex-col flex-grow justify-between border-t border-gray-300 dark:bg-secondary dark:border-none"
          >
            <h2 class="font-bold text-sm leading-tight">{{ c.getName() }}</h2>
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
            class="border-t border-gray-300 dark:bg-secondary dark:border-none p-3"
          >
            <div class="flex gap-4 justify-between items-center">
              <h3 class="font-bold text-sm">Tutorials</h3>
            </div>
            <p class="opacity-50 mt-1 text-xs">
              Learn how to play with our free tutorials!
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { notify } from "@/services/notify";
import { Collection } from "@/classes";
import { storeService } from "@/services/modules";
import { appSession } from "@/services/session";
import { application } from "@/classes/application";

export default defineComponent({
  name: "collections-home",
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
    featuredCollections(): Collection[] {
      const featuredKeys = ["HV", "FMB"];
      return featuredKeys
        .map((key) => this.collections.find((c) => c.getKeys().includes(key)))
        .filter((c): c is Collection => !!c);
    },
    otherCollections(): Collection[] {
      const featuredIds = this.featuredCollections.map((c) => c.id);
      return this.collections.filter((c) => !featuredIds.includes(c.id));
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

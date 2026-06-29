<template>
    <BaseModal :show="show" @close="close">
        <template #title>
            <h3 class="font-bold text-xl">{{ $t("bandSync_title") }}</h3>
        </template>

        <div class="flex flex-col gap-4 w-full max-w-md">
            <template v-if="isActive">
                <div class="rounded-xl bg-black/5 dark:bg-white/10 p-5 text-center">
                    <p class="font-semibold text-base mb-4">{{ statusLabel }}</p>
                    <p v-if="role === 'leader'" class="text-sm opacity-70 mb-4">
                        {{ $t("bandSync_shareCodeHint") }}
                    </p>
                    <p class="text-4xl font-bold tracking-widest font-mono mb-4">
                        {{ code }}
                    </p>
                    <BaseButton
                        v-if="role === 'leader'"
                        theme="secondary"
                        class="w-full"
                        @click="copyCode"
                    >
                        {{ $t("bandSync_codeLabel") }}
                    </BaseButton>
                    <BaseButton
                        v-if="showResync"
                        theme="secondary"
                        class="w-full mt-2"
                        @click="handleResync"
                    >
                        {{ $t("bandSync_resync") }}
                    </BaseButton>
                </div>
                <div class="flex flex-col gap-2">
                    <BaseButton theme="primary" @click="close">
                        {{ $t("bandSync_done") }}
                    </BaseButton>
                    <BaseButton theme="secondary" @click="leaveSession">
                        {{ role === "leader" ? $t("bandSync_endSession") : $t("bandSync_leave") }}
                    </BaseButton>
                </div>
            </template>

            <template v-else>
                <p class="text-sm leading-relaxed opacity-80">
                    {{ $t("bandSync_description") }}
                </p>

                <template v-if="canStart">
                    <BaseButton
                        theme="primary"
                        class="w-full"
                        :disabled="isProcessing"
                        @click="startSession"
                    >
                        {{ $t("bandSync_startSession") }}
                    </BaseButton>
                </template>
                <div
                    v-else
                    class="rounded-xl border border-primary/30 bg-black/5 dark:bg-white/10 p-4"
                >
                    <p class="font-semibold text-sm mb-1">
                        {{ $t("bandSync_startSession") }}
                    </p>
                    <p class="text-sm opacity-70">
                        {{ $t("bandSync_startRequiresSong") }}
                    </p>
                </div>

                <div class="flex items-center gap-3 my-2">
                    <div class="flex-1 h-px bg-black/10 dark:bg-white/20" />
                    <span class="text-xs uppercase opacity-50">Or</span>
                    <div class="flex-1 h-px bg-black/10 dark:bg-white/20" />
                </div>

                <BaseInput
                    v-model="codeInput"
                    :label="$t('bandSync_enterCode')"
                    class="uppercase"
                    @keyup.enter="joinSession"
                />
                <BaseButton
                    theme="secondary"
                    class="w-full"
                    :disabled="isProcessing || !codeInput.trim()"
                    @click="joinSession"
                >
                    {{ $t("bandSync_joinSession") }}
                </BaseButton>
            </template>

            <Loader :loading="isProcessing" position="local" />

            <p v-if="errorMessage" class="text-sm text-red-500 text-center">
                {{ errorMessage }}
            </p>
            <p v-if="loginError" class="text-sm text-red-500 text-center">
                {{ loginError }}
            </p>
        </div>
    </BaseModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { BaseModal } from "@/components";
import { BaseInput } from "@/components/inputs";
import auth from "@/services/auth";
import { useStore } from "@/store";
import { BandSyncActionTypes } from "@/store/modules/bandSync/action-types";
import { resyncBandSyncToLeader } from "@/services/bandSync/bandSyncCoordinatorRegistry";

export type BandSyncStartContext = {
    songbookId: string;
    songNumber: number;
    transposition: number;
};

export default defineComponent({
    name: "band-sync-modal",
    components: {
        BaseModal,
        BaseInput,
    },
    props: {
        show: {
            type: Boolean,
            required: true,
        },
        startContext: {
            type: Object as PropType<BandSyncStartContext | null>,
            default: null,
        },
        onResync: {
            type: Function as PropType<(() => Promise<void>) | undefined>,
            default: undefined,
        },
    },
    emits: ["close"],
    data: () => ({
        store: useStore(),
        codeInput: "",
        loginError: null as string | null,
    }),
    computed: {
        isActive() {
            return this.store.state.bandSync.role !== "none" &&
                this.store.state.bandSync.sessionId != null;
        },
        role() {
            return this.store.state.bandSync.role;
        },
        code() {
            return this.store.state.bandSync.code ?? "";
        },
        isProcessing() {
            return this.store.state.bandSync.isProcessing;
        },
        errorMessage() {
            return this.store.state.bandSync.errorMessage;
        },
        canStart() {
            return this.startContext != null;
        },
        statusLabel(): string {
            if (this.role === "leader") {
                return this.$t("bandSync_leaderLabel") as string;
            }
            if (!this.store.state.bandSync.followingLeaderUpdates) {
                return this.$t("bandSync_outOfSyncLabel") as string;
            }
            if (this.store.state.bandSync.syncStatus === "outOfSync") {
                return this.$t("bandSync_outOfSyncLabel") as string;
            }
            return this.$t("bandSync_followingLabel") as string;
        },
        showResync() {
            return (
                this.role === "member" &&
                !this.store.state.bandSync.followingLeaderUpdates
            );
        },
    },
    unmounted() {
        this.store.dispatch(BandSyncActionTypes.CANCEL_START);
    },
    methods: {
        close() {
            this.store.dispatch(BandSyncActionTypes.CANCEL_START);
            this.$emit("close");
        },
        startSession() {
            this.loginError = null;
            if (!auth.user) {
                this.loginError = this.$t("bandSync_loginRequired") as string;
                return;
            }
            const ctx = this.startContext;
            if (!ctx) return;

            this.store.dispatch(BandSyncActionTypes.CREATE_SESSION, {
                songbookId: ctx.songbookId,
                songNumber: ctx.songNumber,
                transposition: ctx.transposition,
            });
        },
        joinSession() {
            const code = this.codeInput.trim();
            if (!code) return;

            this.store.dispatch(BandSyncActionTypes.JOIN_SESSION, code);
        },
        async leaveSession() {
            await this.store.dispatch(BandSyncActionTypes.LEAVE_SESSION);
            this.close();
        },
        async handleResync() {
            if (this.onResync) {
                await this.onResync();
                return;
            }
            await resyncBandSyncToLeader();
        },
        copyCode() {
            if (this.code) {
                navigator.clipboard.writeText(this.code);
            }
        },
    },
});
</script>

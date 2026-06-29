import { bandSyncService } from "@/services/bandSync/bandSyncService";
import {
    BandSyncException,
    BandSyncRole,
    BandSyncSession,
    BandSyncSyncStatus,
} from "@/services/bandSync/bandSyncSession";
import { ActionContext, ActionTree } from "vuex";
import type { RootState } from "../..";
import { BandSyncActionTypes } from "./action-types";
import { BandSyncMutationTypes } from "./mutation-types";
import { Mutations } from "./mutations";
import { State } from "./state";
import type { Unsubscribe } from "firebase/firestore";

const START_SESSION_TIMEOUT_MS = 15_000;
const START_SESSION_TIMEOUT_ERROR =
    "Connection timed out. Check your internet and try again.";
const START_SESSION_GENERIC_ERROR =
    "Something went wrong. Please try again.";

let startSessionGeneration = 0;
let sessionUnsubscribe: Unsubscribe | null = null;

type AugmentedActionContext = {
    commit<K extends keyof Mutations>(
        key: K,
        payload?: Parameters<Mutations[K]>[1],
    ): ReturnType<Mutations[K]>;
    dispatch<K extends keyof Actions>(
        key: K,
        payload?: Parameters<Actions[K]>[1],
    ): ReturnType<Actions[K]>;
} & Omit<ActionContext<State, RootState>, "commit" | "dispatch">;

function listenToSession(
    sessionId: string,
    dispatch: AugmentedActionContext["dispatch"],
) {
    sessionUnsubscribe?.();
    sessionUnsubscribe = bandSyncService.watchSession(sessionId, (session) => {
        dispatch(BandSyncActionTypes.SESSION_SNAPSHOT, session);
    });
}

function stopListening() {
    sessionUnsubscribe?.();
    sessionUnsubscribe = null;
}

export interface Actions {
    [BandSyncActionTypes.INIT](context: AugmentedActionContext): void;
    [BandSyncActionTypes.CREATE_SESSION](
        context: AugmentedActionContext,
        payload: { songbookId: string; songNumber: number; transposition: number },
    ): Promise<void>;
    [BandSyncActionTypes.JOIN_SESSION](
        context: AugmentedActionContext,
        payload: string,
    ): Promise<void>;
    [BandSyncActionTypes.CANCEL_START](context: AugmentedActionContext): void;
    [BandSyncActionTypes.LEAVE_SESSION](context: AugmentedActionContext): Promise<void>;
    [BandSyncActionTypes.LEADER_PUBLISH](
        context: AugmentedActionContext,
        payload: { songbookId: string; songNumber: number; transposition: number },
    ): Promise<void>;
    [BandSyncActionTypes.SET_MEMBER_SYNC_STATUS](
        context: AugmentedActionContext,
        payload: BandSyncSyncStatus,
    ): void;
    [BandSyncActionTypes.MEMBER_SYNCED](context: AugmentedActionContext): void;
    [BandSyncActionTypes.SET_FOLLOWING_LEADER_UPDATES](
        context: AugmentedActionContext,
        payload: boolean,
    ): void;
    [BandSyncActionTypes.SESSION_SNAPSHOT](
        context: AugmentedActionContext,
        payload: BandSyncSession | null,
    ): void;
    [BandSyncActionTypes.SESSION_ENDED](context: AugmentedActionContext): Promise<void>;
}

async function startSession(
    context: AugmentedActionContext,
    createOrJoin: () => Promise<BandSyncSession>,
    role: BandSyncRole,
) {
    const operationId = ++startSessionGeneration;
    context.commit(BandSyncMutationTypes.SET_PROCESSING, true);
    context.commit(BandSyncMutationTypes.SET_ERROR, null);

    try {
        const session = await Promise.race([
            createOrJoin(),
            new Promise<never>((_, reject) => {
                setTimeout(
                    () => reject(new BandSyncException(START_SESSION_TIMEOUT_ERROR)),
                    START_SESSION_TIMEOUT_MS,
                );
            }),
        ]);

        if (operationId !== startSessionGeneration) return;

        bandSyncService.savePersistedSession({
            sessionId: session.sessionId,
            code: session.code,
            role,
            songbookId: session.songbookId,
        });

        if (operationId !== startSessionGeneration) return;

        context.commit(BandSyncMutationTypes.SET_ACTIVE, {
            role,
            sessionId: session.sessionId,
            code: session.code,
            songbookId: session.songbookId,
            session,
        });

        listenToSession(session.sessionId, context.dispatch);
    } catch (error) {
        if (operationId !== startSessionGeneration) return;

        if (error instanceof BandSyncException) {
            context.commit(BandSyncMutationTypes.SET_ERROR, error.message);
        } else {
            context.commit(BandSyncMutationTypes.SET_ERROR, START_SESSION_GENERIC_ERROR);
        }
    }
}

export const actions: ActionTree<State, RootState> & Actions = {
    [BandSyncActionTypes.INIT]({ commit, dispatch }) {
        const persisted = bandSyncService.readPersistedSession();
        if (!persisted || persisted.role === "none") {
            return;
        }

        commit(BandSyncMutationTypes.SET_ACTIVE, {
            role: persisted.role,
            sessionId: persisted.sessionId,
            code: persisted.code,
            songbookId: persisted.songbookId,
        });

        listenToSession(persisted.sessionId, dispatch);
    },

    async [BandSyncActionTypes.CREATE_SESSION](context, payload) {
        await startSession(
            context,
            () => bandSyncService.createSession(payload),
            "leader",
        );
    },

    async [BandSyncActionTypes.JOIN_SESSION](context, code) {
        await startSession(
            context,
            () => bandSyncService.joinSession(code),
            "member",
        );
    },

    [BandSyncActionTypes.CANCEL_START]({ commit }) {
        startSessionGeneration++;
        commit(BandSyncMutationTypes.SET_PROCESSING, false);
        commit(BandSyncMutationTypes.SET_ERROR, null);
    },

    async [BandSyncActionTypes.LEAVE_SESSION]({ state, commit }) {
        stopListening();

        if (state.role === "leader" && state.sessionId && state.code) {
            try {
                await bandSyncService.endSession({
                    sessionId: state.sessionId,
                    code: state.code,
                });
            } catch {
                // swallow errors
            }
        }

        bandSyncService.clearPersistedSession();
        commit(BandSyncMutationTypes.RESET);
    },

    async [BandSyncActionTypes.LEADER_PUBLISH]({ state, commit }, payload) {
        if (state.role !== "leader" || !state.sessionId) {
            return;
        }

        try {
            await bandSyncService.updateSession({
                sessionId: state.sessionId,
                ...payload,
            });

            if (state.session) {
                commit(BandSyncMutationTypes.SET_SESSION, {
                    ...state.session,
                    songbookId: payload.songbookId,
                    songNumber: payload.songNumber,
                    transposition: payload.transposition,
                    updatedAt: new Date(),
                });
            }
        } catch (error) {
            if (error instanceof BandSyncException) {
                commit(BandSyncMutationTypes.SET_ERROR, error.message);
            }
        }
    },

    [BandSyncActionTypes.SET_MEMBER_SYNC_STATUS]({ state, commit }, syncStatus) {
        if (state.role !== "member" || state.syncStatus === syncStatus) {
            return;
        }
        commit(BandSyncMutationTypes.SET_SYNC_STATUS, syncStatus);
    },

    [BandSyncActionTypes.MEMBER_SYNCED]({ state, commit }) {
        if (state.role !== "member" || state.syncStatus === "inSync") {
            return;
        }
        commit(BandSyncMutationTypes.SET_SYNC_STATUS, "inSync");
    },

    [BandSyncActionTypes.SET_FOLLOWING_LEADER_UPDATES]({ state, commit }, enabled) {
        if (state.role !== "member") {
            return;
        }

        commit(BandSyncMutationTypes.SET_FOLLOWING_LEADER_UPDATES, enabled);

        if (!enabled) {
            commit(BandSyncMutationTypes.SET_SYNC_STATUS, "outOfSync");
        }
    },

    [BandSyncActionTypes.SESSION_SNAPSHOT]({ dispatch, commit }, session) {
        if (!session) {
            dispatch(BandSyncActionTypes.SESSION_ENDED);
            return;
        }
        commit(BandSyncMutationTypes.SET_SESSION, session);
    },

    async [BandSyncActionTypes.SESSION_ENDED]({ commit }) {
        stopListening();
        bandSyncService.clearPersistedSession();
        commit(BandSyncMutationTypes.RESET);
    },
};

export function resetBandSyncStartGenerationForTests(): void {
    startSessionGeneration = 0;
}

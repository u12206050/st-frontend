import { BandSyncSession, BandSyncRole, BandSyncSyncStatus } from "@/services/bandSync/bandSyncSession";

export type State = {
    role: BandSyncRole;
    syncStatus: BandSyncSyncStatus;
    sessionId: string | null;
    code: string | null;
    songbookId: string | null;
    session: BandSyncSession | null;
    isProcessing: boolean;
    errorMessage: string | null;
};

export const initialState = (): State => ({
    role: "none",
    syncStatus: "inSync",
    sessionId: null,
    code: null,
    songbookId: null,
    session: null,
    isProcessing: false,
    errorMessage: null,
});

export const state: State = initialState();

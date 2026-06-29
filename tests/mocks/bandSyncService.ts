import { BandSyncSession } from "@/services/bandSync/bandSyncSession";

export const bandSyncService = {
    watchSession: (
        _sessionId: string,
        _onChange: (session: BandSyncSession | null) => void,
    ) => () => undefined,
    createSession: async (): Promise<BandSyncSession> => {
        throw new Error("not implemented in test mock");
    },
    joinSession: async (): Promise<BandSyncSession> => {
        throw new Error("not implemented in test mock");
    },
    updateSession: async (): Promise<void> => undefined,
    endSession: async (): Promise<void> => undefined,
    savePersistedSession: (): void => undefined,
    readPersistedSession: () => null,
    clearPersistedSession: (): void => undefined,
    normalizeCode: (code: string) => code.trim().toUpperCase(),
    generateCode: () => "ABC123",
};

import { expect } from "chai";
import sinon from "sinon";
import { createStore } from "vuex";
import { store as bandSyncModule, resetBandSyncStartGenerationForTests } from "@/store/modules/bandSync";
import { BandSyncActionTypes } from "@/store/modules/bandSync/action-types";
import { BandSyncMutationTypes } from "@/store/modules/bandSync/mutation-types";
import { BandSyncException } from "@/services/bandSync/bandSyncSession";
import { bandSyncService } from "@/services/bandSync/bandSyncService";

const mockSession = {
    sessionId: "session-1",
    code: "ABC123",
    leaderId: "leader-1",
    songbookId: "book-1",
    songNumber: 10,
    transposition: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    expireAt: new Date(Date.now() + 86400000),
};

function createBandSyncStore() {
    return createStore({
        modules: {
            bandSync: bandSyncModule,
        },
    });
}

describe("bandSync actions", () => {
    beforeEach(() => {
        resetBandSyncStartGenerationForTests();
        sinon.stub(bandSyncService, "watchSession").returns(() => undefined);
        sinon.stub(bandSyncService, "readPersistedSession").returns(null);
        sinon.stub(bandSyncService, "savePersistedSession");
        sinon.stub(bandSyncService, "clearPersistedSession");
    });

    afterEach(() => {
        sinon.restore();
    });

    it("createSession sets active state on success", async () => {
        sinon.stub(bandSyncService, "createSession").resolves(mockSession);
        const store = createBandSyncStore();

        await store.dispatch(BandSyncActionTypes.CREATE_SESSION, {
            songbookId: "book-1",
            songNumber: 10,
            transposition: 0,
        });

        expect(store.state.bandSync.role).to.equal("leader");
        expect(store.state.bandSync.sessionId).to.equal("session-1");
        expect(store.state.bandSync.code).to.equal("ABC123");
        expect((bandSyncService.savePersistedSession as sinon.SinonStub).called).to.equal(true);
    });

    it("cancelStart clears processing and error state", () => {
        const store = createBandSyncStore();
        store.commit(BandSyncMutationTypes.SET_PROCESSING, true);
        store.commit(BandSyncMutationTypes.SET_ERROR, "Session not found.");

        store.dispatch(BandSyncActionTypes.CANCEL_START);

        expect(store.state.bandSync.isProcessing).to.equal(false);
        expect(store.state.bandSync.errorMessage).to.equal(null);
    });

    it("createSession surfaces timeout error message", async function () {
        this.timeout(20_000);
        sinon.stub(bandSyncService, "createSession").callsFake(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => resolve(mockSession), 20_000);
                }),
        );

        const store = createBandSyncStore();
        await store.dispatch(BandSyncActionTypes.CREATE_SESSION, {
            songbookId: "book-1",
            songNumber: 10,
            transposition: 0,
        });

        expect(store.state.bandSync.errorMessage).to.equal(
            "Connection timed out. Check your internet and try again.",
        );
    });

    it("session snapshot null ends session", async () => {
        const store = createBandSyncStore();
        store.commit(BandSyncMutationTypes.SET_ACTIVE, {
            role: "member",
            sessionId: "session-1",
            code: "ABC123",
            songbookId: "book-1",
            session: mockSession,
        });

        await store.dispatch(BandSyncActionTypes.SESSION_SNAPSHOT, null);

        expect(store.state.bandSync.role).to.equal("none");
        expect((bandSyncService.clearPersistedSession as sinon.SinonStub).called).to.equal(true);
    });

    it("joinSession surfaces BandSyncException message", async () => {
        sinon.stub(bandSyncService, "joinSession").rejects(
            new BandSyncException("Session not found."),
        );
        const store = createBandSyncStore();

        await store.dispatch(BandSyncActionTypes.JOIN_SESSION, "BADCODE");

        expect(store.state.bandSync.errorMessage).to.equal("Session not found.");
    });
});

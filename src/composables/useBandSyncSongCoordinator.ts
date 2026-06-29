import { Collection, transposer } from "@/classes";
import {
    BandSyncSession,
    hasLeaderStateChangedComparedTo,
    matchesSongState,
} from "@/services/bandSync/bandSyncSession";
import { appSession } from "@/services/session";
import { RootState, Store } from "@/store";
import { BandSyncActionTypes } from "@/store/modules/bandSync/action-types";
import { SongsActionTypes } from "@/store/modules/songs/action-types";
import { SongsMutationTypes } from "@/store/modules/songs/mutation-types";
import { Router } from "vue-router";

export type BandSyncSongCoordinatorOptions = {
    onAfterApply?: () => Promise<void>;
};

export class BandSyncSongCoordinator {
    private isApplying = false;
    private lastSeenRemoteSession: BandSyncSession | null = null;
    private unwatch: (() => void) | null = null;

    constructor(
        private store: Store,
        private router: Router,
        private options: BandSyncSongCoordinatorOptions = {},
    ) {}

    start(): void {
        this.unwatch = this.store.watch(
            (state: RootState) => ({
                role: state.bandSync.role,
                syncStatus: state.bandSync.syncStatus,
                sessionId: state.bandSync.sessionId,
                sessionTransposition: state.bandSync.session?.transposition,
                sessionSongNumber: state.bandSync.session?.songNumber,
                sessionSongbookId: state.bandSync.session?.songbookId,
                sessionUpdatedAt: state.bandSync.session?.updatedAt?.getTime(),
                collectionId: state.songs.collectionId,
                songId: state.songs.songId,
                transposition: state.songs.transposition,
                sheetMusicTransposition: state.songs.sheetMusic?.transposition,
            }),
            () => {
                this.onLocalChange();
                this.onBandSyncState();
            },
        );

        const bandSync = this.store.state.bandSync;
        const session = bandSync.session;
        if (
            session &&
            bandSync.role !== "none" &&
            bandSync.sessionId != null &&
            !this.matchesLocal(session)
        ) {
            const shouldCatchUp =
                bandSync.role === "leader" ||
                (bandSync.role === "member" && bandSync.syncStatus === "inSync");
            if (shouldCatchUp) {
                void this.applySession(session).then(() => {
                    if (bandSync.role === "member") {
                        this.store.dispatch(BandSyncActionTypes.MEMBER_SYNCED);
                    }
                });
            }
        }

        this.onBandSyncState();
        this.onLocalChange();
    }

    dispose(): void {
        this.unwatch?.();
        this.unwatch = null;
        this.lastSeenRemoteSession = null;
    }

    async resyncToLeader(): Promise<void> {
        const { role, session } = this.store.state.bandSync;
        if (!session || role !== "member") {
            return;
        }

        await this.applySession(session);
        this.store.dispatch(BandSyncActionTypes.MEMBER_SYNCED);
    }

    private getLocalState() {
        const collection = this.store.getters.collection as Collection | undefined;
        const song = collection?.songs.find(
            (s) => s.id === this.store.state.songs.songId,
        );
        const songbookId = collection?.id ?? "";
        const songNumber =
            song && collection ? song.getNumber(collection.id) ?? 0 : 0;
        const transposition = this.store.state.songs.transposition ?? 0;
        return { songbookId, songNumber, transposition, collection, song };
    }

    private onBandSyncState(): void {
        const bandSync = this.store.state.bandSync;
        const isActive =
            bandSync.role !== "none" && bandSync.sessionId != null;

        if (!isActive || !bandSync.session) {
            this.lastSeenRemoteSession = null;
            return;
        }

        if (bandSync.role === "leader") {
            this.lastSeenRemoteSession = bandSync.session;
            return;
        }

        const session = bandSync.session;
        const leaderChanged = hasLeaderStateChangedComparedTo(
            session,
            this.lastSeenRemoteSession,
        );

        const shouldApply =
            leaderChanged && bandSync.syncStatus === "inSync";

        this.lastSeenRemoteSession = session;

        if (!shouldApply || this.matchesLocal(session)) {
            return;
        }

        void this.applySession(session).then(() => {
            this.store.dispatch(BandSyncActionTypes.MEMBER_SYNCED);
        });
    }

    private onLocalChange(): void {
        if (this.isApplying) return;

        const bandSync = this.store.state.bandSync;
        const isActive =
            bandSync.role !== "none" && bandSync.sessionId != null;

        if (!isActive || !bandSync.session) return;

        const { songbookId, songNumber, transposition } = this.getLocalState();

        if (bandSync.role === "leader") {
            if (
                matchesSongState(
                    bandSync.session,
                    songbookId,
                    songNumber,
                    transposition,
                )
            ) {
                return;
            }

            this.store.dispatch(BandSyncActionTypes.LEADER_PUBLISH, {
                songbookId,
                songNumber,
                transposition,
            });
            return;
        }

        if (bandSync.role === "member") {
            const inSync = matchesSongState(
                bandSync.session,
                songbookId,
                songNumber,
                transposition,
            );
            this.store.dispatch(
                BandSyncActionTypes.SET_MEMBER_SYNC_STATUS,
                inSync ? "inSync" : "outOfSync",
            );
        }
    }

    private matchesLocal(session: BandSyncSession): boolean {
        const { songbookId, songNumber, transposition } = this.getLocalState();
        return matchesSongState(session, songbookId, songNumber, transposition);
    }

    private async applySession(session: BandSyncSession): Promise<void> {
        if (this.isApplying) {
            return;
        }
        this.isApplying = true;

        try {
            const { songbookId, songNumber, transposition } = this.getLocalState();

            if (
                session.songbookId !== songbookId ||
                session.songNumber !== songNumber
            ) {
                const col = appSession.collections.find(
                    (c) => c.id === session.songbookId,
                );
                if (col) {
                    const routeKey = col.key ?? col.id;
                    await this.router.push({
                        name: "song",
                        params: {
                            collection: routeKey,
                            number: session.songNumber,
                        },
                    });
                    await this.store.dispatch(
                        SongsActionTypes.SELECT_COLLECTION,
                        routeKey,
                    );
                    await this.store.dispatch(
                        SongsActionTypes.SELECT_SONG,
                        session.songNumber,
                    );
                }
            }

            if (session.transposition !== transposition) {
                this.store.commit(
                    SongsMutationTypes.SET_TRANSPOSITION,
                    session.transposition,
                );
            }

            const sheetMusic = this.store.state.songs.sheetMusic;
            if (sheetMusic) {
                const userKeyTransposition = transposer.getRelativeTransposition(
                    appSession.user?.settings?.defaultTransposition ?? "C",
                    true,
                );
                const apiTransposition =
                    (session.transposition + userKeyTransposition) % 12;
                this.store.commit(SongsMutationTypes.SET_SHEETMUSIC_OPTIONS, {
                    ...sheetMusic,
                    transposition: apiTransposition,
                });
            }

            if (this.options.onAfterApply) {
                await this.options.onAfterApply();
            }
        } finally {
            this.isApplying = false;
            this.onLocalChange();
        }
    }
}

export function createBandSyncSongCoordinator(
    store: Store,
    router: Router,
    options?: BandSyncSongCoordinatorOptions,
): BandSyncSongCoordinator {
    return new BandSyncSongCoordinator(store, router, options);
}

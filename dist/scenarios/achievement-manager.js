const ACHIEVEMENTS = [
    {
        id: 'ACH_FIRST_STEP',
        title: 'Primeiro Passo',
        description: 'Execute seu primeiro tick',
        check: (state) => state.getMetadata().currentTick >= 1,
    },
    {
        id: 'ACH_TUTORIAL_COMPLETED',
        title: 'Aluno Nota 10',
        description: 'Complete o tutorial guiado',
        check: () => false, // unlocked by frontend via localStorage
    },
    {
        id: 'ACH_HEGEMONY',
        title: 'Hegemonia Global',
        description: 'Uma única nação controla mais de 50% das províncias',
        check: (state) => {
            const provinceCounts = new Map();
            let total = 0;
            for (const eid of state.getEntityIds()) {
                const entity = state.getEntity(eid);
                if (!entity)
                    continue;
                const provComponent = entity.getComponent('geo.province');
                if (!provComponent)
                    continue;
                for (const prov of provComponent.provinces) {
                    provinceCounts.set(prov.ownerId, (provinceCounts.get(prov.ownerId) ?? 0) + 1);
                    total++;
                }
            }
            if (total === 0)
                return false;
            const max = Math.max(...provinceCounts.values());
            return max / total > 0.5;
        },
    },
    {
        id: 'ACH_RESOURCE_CRISIS',
        title: 'Crise de Recursos',
        description: 'Preço de energia ultrapassa 200',
        check: (state) => {
            for (const eid of state.getEntityIds()) {
                const entity = state.getEntity(eid);
                if (!entity)
                    continue;
                const market = entity.getComponent('economy.market');
                if (market && market.currentPrice > 200)
                    return true;
            }
            return false;
        },
    },
    {
        id: 'ACH_DIPLOMAT',
        title: 'Mestre da Diplomacia',
        description: 'Estabeleça 5 rotas comerciais ativas',
        check: (state) => {
            let count = 0;
            for (const eid of state.getEntityIds()) {
                const entity = state.getEntity(eid);
                if (!entity)
                    continue;
                const trade = entity.getComponent('economy.trade-route');
                if (trade && trade.active)
                    count++;
            }
            return count >= 5;
        },
    },
    {
        id: 'ACH_WARMONGER',
        title: 'Belicista',
        description: 'Emita 50 ações militares',
        check: (_state) => false, // tracked via event counter
    },
    {
        id: 'ACH_PACIFIST',
        title: 'Pacificador',
        description: 'Nenhuma ação militar emitida em 100 ticks',
        check: (_state) => false, // tracked via event counter
    },
    {
        id: 'ACH_CRISIS_AVERTED',
        title: 'Crise Evitada',
        description: 'Tensão reduzida de >0.9 para <0.3 em 10 ticks',
        check: (_state) => false, // complex state tracking
    },
];
export class AchievementManager {
    descriptor = {
        id: 'achievement.manager',
        name: 'Achievement Manager',
        priority: 700,
        requiredComponents: [],
        subscribedEvents: [],
        emittedEvents: ['achievement.unlocked'],
    };
    unlocked = new Set();
    defs;
    constructor(defs) {
        this.defs = defs ?? ACHIEVEMENTS;
    }
    unlockFromFrontend(id) {
        this.unlocked.add(id);
    }
    execute(state, eventBus) {
        for (const def of this.defs) {
            if (this.unlocked.has(def.id))
                continue;
            if (def.check(state)) {
                this.unlocked.add(def.id);
                eventBus.publish('achievement.unlocked', { achievementId: def.id, title: def.title, description: def.description }, 'achievement.manager');
            }
        }
    }
}
//# sourceMappingURL=achievement-manager.js.map
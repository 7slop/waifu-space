import { createSignal, Show, For, lazy, Suspense, onMount } from 'solid-js';
import {
  state,
  COSMETIC_CATALOG,
  AFFECTION_MILESTONES,
  claimAffectionReward,
  getUnlockedCosmeticsCount,
  getBondExpNeeded
} from '../lib/store';
import { WaifuDefenseGame } from './WaifuDefenseGame';
import { LootboxModal } from './LootboxModal';
import { t, getMilestoneTitle, getMilestoneDesc, getMilestoneRewardLabel } from '../lib/i18n';
import { defenseGameActive, pendingDefenseTab, setPendingDefenseTab } from '../lib/defense-bridge';
import {
  PhGameController,
  PhGift,
  PhHeart,
  PhSword,
  PhLightning,
  PhSparkle,
  PhBuildings,
  PhDiceFive,
  PhCoins,
  PhCheckCircle,
  PhLock,
  PhWarningCircle,
  PhRunning
} from './icons';

const WaifuStrikeGame = lazy(() =>
  import('./WaifuStrikeGame').then((m) => ({ default: m.WaifuStrikeGame }))
);

const StrikeMapEditor = lazy(() =>
  import('./StrikeMapEditor').then((m) => ({ default: m.StrikeMapEditor }))
);

export function RpgHub() {
  const [activeTab, setActiveTab] = createSignal<'games' | 'gacha' | 'affection'>('games');
  const [selectedGame, setSelectedGame] = createSignal<'defense' | 'strike' | 'future'>('defense');
  const [editMode, setEditMode] = createSignal(false);

  // The map editor is a launch-time feature: `bun run dev --edit` enables it,
  // and selecting Waifu Strike opens the editor instead of the match.
  onMount(() => {
    fetch('/api/strike/edit-mode')
      .then((res) => res.json())
      .then((data) => setEditMode(Boolean(data?.editEnabled)))
      .catch(() => setEditMode(false));
  });

  // Intercept tab switches while a defense run is in progress so the game
  // (and the player's progress) is never silently discarded.
  const handleTabSwitch = (next: 'games' | 'gacha' | 'affection') => {
    if (next === activeTab()) return;
    if (next !== 'games' && activeTab() === 'games' && selectedGame() === 'defense' && defenseGameActive()) {
      setPendingDefenseTab(next);
      return;
    }
    setActiveTab(next);
  };

  const confirmLeaveDefense = () => {
    const next = pendingDefenseTab();
    if (next) {
      setActiveTab(next as any);
      setPendingDefenseTab(null);
    }
  };

  return (
    <div class="rpg-hub-container">
      {/* RPG NAVIGATION TABS */}
      <div class="rpg-navigation-tabs">
        <button
          class={`rpg-tab-btn ${activeTab() === 'games' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('games')}
        >
          <span><PhGameController /></span>
          <span>{t('rpg.tabs.games')}</span>
        </button>

        <button
          class={`rpg-tab-btn ${activeTab() === 'gacha' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('gacha')}
        >
          <span><PhGift /></span>
          <span>{t('rpg.tabs.gacha')}</span>
        </button>

        <button
          class={`rpg-tab-btn ${activeTab() === 'affection' ? 'active' : ''}`}
          onClick={() => handleTabSwitch('affection')}
        >
          <span><PhHeart /></span>
          <span>{t('rpg.tabs.affection')}</span>
        </button>
      </div>

      {/* TAB CONTENT */}
      <div class="rpg-content-body">
        {/* 1. GAMES TAB */}
        <Show when={activeTab() === 'games'}>
          <div class="tab-pane games-mode-pane">
            {/* Gamemode Submenu Selector */}
            <div class="gamemode-selector-bar">
              <button
                class={`gamemode-chip-btn ${selectedGame() === 'defense' ? 'active' : ''}`}
                onClick={() => setSelectedGame('defense')}
              >
                <span><PhSword /></span>
                <span>{t('rpg.tabs.defense')}</span>
                <span class="gamemode-badge">Live</span>
              </button>

              <button
                class={`gamemode-chip-btn ${selectedGame() === 'strike' ? 'active' : ''}`}
                onClick={() => setSelectedGame('strike')}
              >
                <span><PhLightning /></span>
                <span>{t('strike.title') || 'Waifu Strike 3D'}</span>
                <span class="gamemode-badge" style={{ background: '#ff7597' }}>New</span>
              </button>

              <button
                class={`gamemode-chip-btn coming-soon ${selectedGame() === 'future' ? 'active' : ''}`}
                onClick={() => setSelectedGame('future')}
              >
                <span><PhSparkle /></span>
                <span>{t('rpg.tabs.moreModes')}</span>
                <span class="gamemode-badge soon">{t('rpg.gamemodes.soon')}</span>
              </button>
            </div>

            {/* Selected Gamemode View */}
            <Show when={selectedGame() === 'defense'}>
              <WaifuDefenseGame />
            </Show>

            <Show when={selectedGame() === 'strike'}>
              <Show
                when={editMode()}
                fallback={
                  <Suspense
                    fallback={
                      <div
                        style={{
                          height: '600px',
                          display: 'flex',
                          'flex-direction': 'column',
                          'align-items': 'center',
                          'justify-content': 'center',
                          background: '#0c1017',
                          'border-radius': '16px',
                          color: '#ff7597',
                          gap: '12px'
                        }}
                      >
                        <div style={{ 'font-size': '2.5rem' }}><PhBuildings /></div>
                        <div style={{ 'font-weight': 'bold', 'font-size': '1.1rem' }}>Loading Cyber Shrine Arena...</div>
                      </div>
                    }
                  >
                    <WaifuStrikeGame onExit={() => setSelectedGame('defense')} />
                  </Suspense>
                }
              >
                <Suspense
                  fallback={
                    <div
                      style={{
                        height: '600px',
                        display: 'flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        background: '#0c1017',
                        'border-radius': '16px',
                        color: '#6fb4ff'
                      }}
                    >
                      Loading Map Editor...
                    </div>
                  }
                >
                  <StrikeMapEditor onExit={() => setSelectedGame('defense')} />
                </Suspense>
              </Show>
            </Show>

            <Show when={selectedGame() === 'future'}>
              <div class="future-games-card">
                <div class="future-icon"><PhDiceFive /></div>
                <h3>{t('rpg.gamemodes.newModesTitle')}</h3>
                <p>{t('rpg.gamemodes.newModesDesc')}</p>
                <button class="btn-primary" onClick={() => setSelectedGame('defense')}>
                  <PhSword /> {t('rpg.gamemodes.playDefense')}
                </button>
              </div>
            </Show>
          </div>
        </Show>

        {/* 2. GACHA & CHESTS */}
        <Show when={activeTab() === 'gacha'}>
          <div class="tab-pane">
            <LootboxModal />
          </div>
        </Show>

        {/* 3. AFFECTION ROAD */}
        <Show when={activeTab() === 'affection'}>
          <div class="tab-pane">
            <div class="affection-road-container">
              <div class="road-header">
                <h2><PhHeart /> {t('rpg.affectionRoad.title')}</h2>
                <p>
                  {t('rpg.affectionRoad.subtitle', { name: state.waifu?.name || 'your companion' })}
                </p>
              </div>

              <div class="milestones-track">
                <For each={AFFECTION_MILESTONES}>
                  {milestone => {
                    const isClaimed = () => (state.rpg?.claimedAffectionMilestones || []).includes(milestone.level);
                    const canClaim = () => !isClaimed() && (state.waifu?.bondLevel || 1) >= milestone.level;
                    const isLocked = () => (state.waifu?.bondLevel || 1) < milestone.level;

                    return (
                      <div class={`milestone-card ${isClaimed() ? 'claimed' : canClaim() ? 'can-claim' : 'locked'}`}>
                        <div class="milestone-badge">
                          <span class="badge-icon">{milestone.icon}</span>
                          <span class="badge-lvl">Lv {milestone.level}</span>
                        </div>

                        <div class="milestone-content">
                          <h4 class="milestone-title">{getMilestoneTitle(milestone.level, milestone.title)}</h4>
                          <p class="milestone-desc">{getMilestoneDesc(milestone.level, { name: state.waifu?.name || 'Waifu' }, milestone.description)}</p>
                          <div class="milestone-reward-tags">
                            <Show when={milestone.rewardType === 'coins'}>
                              <span class="tag-coin"><PhCoins /> +{milestone.rewardValue} {t('rpg.dashboard.goldCoins')}</span>
                            </Show>
                            <Show when={milestone.rewardType === 'cosmetic'}>
                              <span class="tag-cosmetic">
                                <PhSparkle /> {getMilestoneRewardLabel(milestone.level, milestone.rewardLabel)}
                              </span>
                            </Show>
                          </div>
                        </div>

                        <div class="milestone-actions">
                          <Show when={isClaimed()}>
                            <span class="status-claimed"><PhCheckCircle /> {t('rpg.affectionRoad.claimed')}</span>
                          </Show>
                          <Show when={canClaim()}>
                            <button
                              class="btn-claim"
                              onClick={() => claimAffectionReward(milestone.level)}
                            >
                              <PhGift /> {t('rpg.affectionRoad.claimBtn')}
                            </button>
                          </Show>
                          <Show when={isLocked()}>
                            <span class="status-locked"><PhLock /> {t('rpg.affectionRoad.needsLevel', { level: milestone.level })}</span>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* TAB-SWITCH WARNING: an active defense run would be lost */}
      <Show when={pendingDefenseTab()}>
        <div class="defense-leave-overlay" data-testid="defense-leave-modal">
          <div class="defense-leave-modal">
            <h3><PhWarningCircle /> {t('defense.confirmLeaveTitle')}</h3>
            <p>{t('defense.confirmLeaveDesc')}</p>
            <div class="defense-leave-actions">
              <button class="btn-stay" onClick={() => setPendingDefenseTab(null)}>
                <PhGameController /> {t('defense.stayInGame')}
              </button>
              <button class="btn-leave" onClick={confirmLeaveDefense}>
                <PhRunning /> {t('defense.leaveAnyway')}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

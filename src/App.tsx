import { Game } from './Game';
import { GameHUD, Tooltip, Notification, PausedOverlay, SaveDialog, LoadDialog, SettingsDialog, SplashScreen } from './ui';
import { useUIStore } from './store';
import './index.css';

/**
 * Root application component
 */
function App() {
  const hasGameStarted = useUIStore((state) => state.hasGameStarted);
  const isScreensaverMode = useUIStore((state) => state.isScreensaverMode);

  return (
    <div className="app">
      {/* Splash screen shown before game starts (and not in screensaver) */}
      {!hasGameStarted && !isScreensaverMode && <SplashScreen />}

      {/* Game and HUD shown after game starts */}
      {hasGameStarted && (
        <>
          <Game />
          {/* HUD elements hidden in screensaver mode */}
          {!isScreensaverMode && (
            <>
              <GameHUD />
              <Tooltip />
              <Notification />
              <PausedOverlay />
              <SaveDialog />
            </>
          )}
          {/* Screensaver exit hint */}
          {isScreensaverMode && (
            <div className="screensaver-hint">
              Click anywhere or press <kbd>ESC</kbd> to exit
            </div>
          )}
        </>
      )}
      
      {/* Dialogs available from both splash screen and in-game */}
      <LoadDialog />
      <SettingsDialog />
    </div>
  );
}

export default App;

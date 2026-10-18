// @ts-check
/**
 * Back guard: while a match is on, the browser's Back button, a phone's back
 * swipe or gesture, and a trackpad's two-finger swipe do not leave the page.
 *
 * Arming adds one history entry for this same page; Back then only steps onto
 * the entry below, the guard puts its entry back and reports it (the game
 * pauses). Closing or reloading the tab asks first. Disarmed, nothing is
 * intercepted; the guard entry is left in place (one extra Back on the menu),
 * which is simpler and safer than racing the browser's own history traversal.
 */

const MARK = 'cfGuard';

/** @param {() => void} onBack  called each time Back is pressed while armed */
export function createBackGuard(onBack) {
  let armed = false;
  const push = () => { if (!history.state?.[MARK]) history.pushState({ ...(history.state ?? {}), [MARK]: true }, ''); };
  const onPop = () => {
    if (!armed) return;
    push();
    onBack();
  };
  /** @param {BeforeUnloadEvent} e */
  const onUnload = (e) => {
    if (!armed) return;
    e.preventDefault();
    e.returnValue = ''; // older browsers need it set to show the prompt
  };
  addEventListener('popstate', onPop);
  addEventListener('beforeunload', onUnload);
  return {
    arm() { armed = true; push(); },
    disarm() { armed = false; },
    get armed() { return armed; },
    destroy() { armed = false; removeEventListener('popstate', onPop); removeEventListener('beforeunload', onUnload); },
  };
}

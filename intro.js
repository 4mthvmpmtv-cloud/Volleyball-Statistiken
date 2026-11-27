(() => {
  const preferencesKey = 'volleyball-intro-v1';
  const bootBudget = 1200;
  const previewBudget = 1800;
  const playbackBudget = 6400;
  const fadeDuration = 250;
  const dialog = document.getElementById('app-intro');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const dismiss = dialog.querySelector('button');
  const video = dialog.querySelector('video');
  const enabled = document.getElementById('intro-enabled');
  const sound = document.getElementById('intro-sound');
  const preview = document.getElementById('intro-preview');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let run;

  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey));
    enabled.checked = saved?.enabled !== false;
    sound.checked = saved?.sound === true;
  } catch {
    // Keep the HTML defaults when storage is unavailable.
  }

  function save() {
    try {
      localStorage.setItem(preferencesKey, JSON.stringify({
        enabled: enabled.checked,
        sound: sound.checked
      }));
    } catch {
      // The settings still apply to the current document.
    }
  }

  function reducedMotion() {
    return motion.matches || document.documentElement.dataset.motion === 'off';
  }

  function close(session, immediate = false) {
    if (run !== session || session.closing) return;
    session.closing = true;
    clearTimeout(session.timer);
    session.events.abort();
    video.pause();
    function release() {
      dialog.close();
      dialog.classList.remove('is-closing', 'has-frame', 'keyboard-navigation');
      video.removeAttribute('src');
      video.load();
      run = undefined;
    }
    if (immediate || reducedMotion()) {
      release();
    } else {
      dialog.classList.add('is-closing');
      setTimeout(release, fadeDuration);
    }
  }

  function open(isPreview) {
    if (run || document.hidden) return;
    const session = { events: new AbortController() };
    const { signal } = session.events;
    run = session;
    dialog.showModal();

    const hide = () => close(session);
    dismiss.addEventListener('click', hide, { signal });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab') dialog.classList.add('keyboard-navigation');
    }, { signal });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      hide();
    }, { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) close(session, true);
    }, { signal });
    window.addEventListener('pagehide', () => close(session, true), { signal });
    motion.addEventListener('change', () => {
      if (reducedMotion()) close(session, true);
    }, { signal });

    session.timer = setTimeout(hide, isPreview ? previewBudget : bootBudget);
    const showFrame = () => {
      if (run !== session || session.closing) return;
      dialog.classList.add('has-frame');
      clearTimeout(session.timer);
      session.timer = setTimeout(hide, playbackBudget);
    };
    video.addEventListener('playing', () => {
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(showFrame);
      } else {
        showFrame();
      }
    }, { once: true, signal });
    video.addEventListener('ended', hide, { once: true, signal });
    video.addEventListener('error', hide, { once: true, signal });

    video.defaultMuted = !sound.checked;
    video.muted = !sound.checked;
    video.src = video.dataset.src;
    video.play()?.catch(error => {
      if (run !== session || session.closing) return;
      if (!video.muted && error.name === 'NotAllowedError') {
        video.muted = true;
        video.play()?.catch(hide);
      } else {
        hide();
      }
    });
  }

  enabled.addEventListener('change', save);
  sound.addEventListener('change', save);
  preview.addEventListener('click', () => open(true));

  // Only a new visible document starts the film. A back/forward restore
  // and a previously hidden document becoming visible never start it.
  const navigation = performance.getEntriesByType('navigation')[0];
  if (enabled.checked && !reducedMotion() && navigation?.type !== 'back_forward') {
    open(false);
  }

  // A separate, optional precache keeps a media failure from blocking the app shell.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.active?.postMessage({ type: 'cache-intro' });
    });
  }
})();

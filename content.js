(() => {
  if (globalThis.__screenerInstalled) return;
  globalThis.__screenerInstalled = true;
  let session = null;
  let outerHidden = null;
  let cancelSelection = null;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const localDimensions = (doc = document, win = window) => {
    const root = doc.documentElement, body = doc.body, bodyBox = body?.getBoundingClientRect();
    let renderedRight = bodyBox?.right || 0, renderedBottom = bodyBox?.bottom || 0;
    // A number of SPAs set html/body to 100vh and put the real content in
    // positioned children. Include those rendered children in the page size.
    for (const element of doc.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect();
      if (box.width || box.height) {
        renderedRight = Math.max(renderedRight, box.right + win.scrollX);
        renderedBottom = Math.max(renderedBottom, box.bottom + win.scrollY);
      }
    }
    return { width: Math.ceil(Math.max(root.scrollWidth, body?.scrollWidth || 0, root.clientWidth, renderedRight)), height: Math.ceil(Math.max(root.scrollHeight, body?.scrollHeight || 0, root.clientHeight, renderedBottom)), viewportWidth: root.clientWidth, viewportHeight: root.clientHeight, innerWidth: win.innerWidth, innerHeight: win.innerHeight, dpr: win.devicePixelRatio };
  };
  const scrollHost = (doc = document) => {
    const win = doc.defaultView || window;
    const candidates = [doc.scrollingElement, doc.body, ...doc.querySelectorAll('*')].filter(Boolean).filter((element, index, all) => {
      if (all.indexOf(element) !== index) return false;
      const css = win.getComputedStyle(element);
      return element.scrollHeight > element.clientHeight + 20 && /(auto|scroll|overlay)/.test(css.overflowY);
    });
    return candidates.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
  };
  const frameRect = frame => {
    let x = 0, y = 0, current = frame;
    while (current) {
      const rect = current.getBoundingClientRect();
      x += rect.left; y += rect.top;
      current = current.ownerDocument.defaultView?.frameElement || null;
    }
    return { x, y, width: frame.getBoundingClientRect().width, height: frame.getBoundingClientRect().height };
  };
  const currentTarget = () => {
    let frame = null;
    try { frame = window.frameElement; } catch { /* Cross-origin frames expose no frame element. */ }
    return { doc: document, win: window, frame };
  };
  const targetInfo = target => {
    const info = localDimensions(target.doc, target.win);
    const host = scrollHost(target.doc);
    const effectiveHost = host && host !== target.doc.scrollingElement ? host : null;
    const hostBox = effectiveHost?.getBoundingClientRect();
    const offset = target.frame ? frameRect(target.frame) : { x: 0, y: 0 };
    if (effectiveHost) {
      info.width = Math.max(info.width, effectiveHost.scrollWidth);
      info.height = Math.max(info.height, effectiveHost.scrollHeight);
      info.viewportWidth = effectiveHost.clientWidth;
      info.viewportHeight = effectiveHost.clientHeight;
      info.captureRect = hostBox ? { x: offset.x + hostBox.left, y: offset.y + hostBox.top, width: hostBox.width, height: hostBox.height } : null;
    } else if (target.frame) {
      const rect = frameRect(target.frame);
      info.captureRect = rect;
    }
    info.screenInnerWidth = target.win.innerWidth;
    info.screenInnerHeight = target.win.innerHeight;
    info.frameUrl = target.win.location.href;
    info.frameKnown = Boolean(target.frame);
    info.frame = Boolean(target.frame);
    return { info, host: effectiveHost };
  };
  const firstData = (element, names) => {
    for (const name of names) {
      const value = element.getAttribute?.(`data-${name}`) || element.dataset?.[name];
      if (value) return value.trim();
    }
    return '';
  };
  const walkElements = (root, visit) => {
    for (const element of root.querySelectorAll?.('*') || []) {
      visit(element);
      if (element.shadowRoot) walkElements(element.shadowRoot, visit);
    }
  };
  const collectImages = doc => {
    const images = [];
    walkElements(doc, element => { if (element.localName === 'img') images.push(element); });
    return images;
  };
  const rememberAttribute = (sessionState, element, name) => {
    if (!sessionState.attributeChanges.some(change => change[0] === element && change[1] === name)) {
      sessionState.attributeChanges.push([element, name, element.getAttribute(name)]);
    }
  };
  const rememberStyle = (sessionState, element) => {
    if (!sessionState.styleChanges.some(change => change[0] === element)) {
      sessionState.styleChanges.push([element, element.getAttribute('style')]);
    }
  };
  const releaseStickyContent = sessionState => {
    walkElements(sessionState.doc, element => {
      if (sessionState.win.getComputedStyle(element).position !== 'sticky') return;
      rememberStyle(sessionState, element);
      // Keep the element's layout slot and containing block, but stop it
      // following the viewport between tiles. Hiding it would lose content.
      element.style.setProperty('position', 'relative', 'important');
      for (const edge of ['top', 'right', 'bottom', 'left', 'inset-block', 'inset-inline']) {
        element.style.setProperty(edge, 'auto', 'important');
      }
    });
  };
  const activateLazyImage = (image, sessionState) => {
    const src = firstData(image, ['src', 'lazySrc', 'original', 'url', 'image']);
    const srcset = firstData(image, ['srcset', 'lazySrcset']);
    if (src) {
      rememberAttribute(sessionState, image, 'src');
      // Replace placeholders as well as empty sources. Checking currentSrc
      // alone leaves common data-src/lqip implementations pointing at the
      // placeholder forever.
      image.setAttribute('src', src);
    }
    if (srcset) { rememberAttribute(sessionState, image, 'srcset'); image.setAttribute('srcset', srcset); }
    if (image.getAttribute('loading') !== 'eager') { rememberAttribute(sessionState, image, 'loading'); image.setAttribute('loading', 'eager'); }
    if (image.getAttribute('fetchpriority') !== 'high') { rememberAttribute(sessionState, image, 'fetchpriority'); image.setAttribute('fetchpriority', 'high'); }
  };
  const activateLazySources = (doc, sessionState) => {
    const images = collectImages(doc);
    for (const image of images) activateLazyImage(image, sessionState);
    const sources = [];
    walkElements(doc, element => { if (element.localName === 'source' && element.parentElement?.localName === 'picture') sources.push(element); });
    for (const source of sources) {
      const srcset = firstData(source, ['srcset', 'lazySrcset']);
      if (srcset) { rememberAttribute(sessionState, source, 'srcset'); source.setAttribute('srcset', srcset); }
    }
    const backgroundElements = [];
    walkElements(doc, element => {
      if (element.matches?.('[data-background-image],[data-bg],[data-bg-src],[data-background]')) backgroundElements.push(element);
    });
    for (const element of backgroundElements) {
      const source = firstData(element, ['backgroundImage', 'bg', 'bgSrc', 'background']);
      if (!source) continue;
      rememberStyle(sessionState, element);
      element.style.setProperty('background-image', `url("${source.replaceAll('"', '%22')}")`, 'important');
    }
    return images;
  };
  const preloadBackgrounds = async (doc, win, sessionState) => {
    const urls = new Set();
    walkElements(doc, element => {
      const background = win.getComputedStyle(element).backgroundImage || '';
      for (const match of background.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/gi)) {
        const url = (match[1] || match[2] || match[3] || '').trim();
        if (url && url !== 'none') urls.add(url);
      }
    });
    const preloads = [...urls].map(url => new Promise(resolve => {
      const image = new win.Image();
      sessionState.preloads.push(image);
      image.onload = image.onerror = () => resolve();
      image.src = url;
    }));
    await Promise.all(preloads);
  };
  const waitForImages = async images => {
    await Promise.all(images.map(async image => {
      if (!image.currentSrc && !image.src) return;
      try { await image.decode?.(); } catch { /* Broken images should not abort the entire capture. */ }
    }));
    await delay(80);
  };
  const scrollTarget = (state, x, y) => {
    if (state.host) state.host.scrollTo(x, y); else state.win.scrollTo(x, y);
  };
  const captureTarget = () => {
    const top = { doc: document, win: window, frame: null };
    const candidates = [top];
    for (const frame of document.querySelectorAll('iframe')) {
      try {
        const doc = frame.contentDocument, win = frame.contentWindow;
        if (doc?.documentElement && win) candidates.push({ doc, win, frame });
      } catch { /* Cross-origin frames cannot be inspected from the outer page. */ }
    }
    const measured = candidates.map(target => ({ target, ...targetInfo(target) }));
    const scrollRatio = item => Math.max(item.info.width / Math.max(1, item.info.viewportWidth), item.info.height / Math.max(1, item.info.viewportHeight));
    return measured.sort((a, b) => scrollRatio(b) - scrollRatio(a) || b.info.height - a.info.height)[0];
  };
  function restore() {
    if (!session) return;
    clearTimeout(session.timer);
    session.style.remove();
    for (const [element, value, priority] of session.hidden) {
      if (value) element.style.setProperty('visibility', value, priority);
      else element.style.removeProperty('visibility');
    }
    for (const [element, name, value] of session.attributeChanges.reverse()) {
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
    for (const [element, value] of session.styleChanges.reverse()) {
      if (value === null) element.removeAttribute('style');
      else element.setAttribute('style', value);
    }
    // Keep scroll-behavior disabled until the original position has been restored.
    const resetStyle = session.doc.createElement('style');
    resetStyle.textContent = 'html,body{scroll-behavior:auto!important;scroll-snap-type:none!important}';
    session.doc.documentElement.append(resetStyle);
    if (session.host) session.host.scrollTo(session.hostX, session.hostY);
    else session.win.scrollTo(session.x, session.y);
    resetStyle.remove();
    removeEventListener('wheel', block, true);
    removeEventListener('touchmove', block, true);
    removeEventListener('keydown', blockKeys, true);
    session = null;
  }
  function block(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function blockKeys(event) {
    if (event.key === 'Escape') { restore(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) block(event);
  }
  function hideOuterChrome(frameUrl = '') {
    if (outerHidden) return;
    outerHidden = [];
    let frame = null;
    if (frameUrl) frame = [...document.querySelectorAll('iframe')].find(item => {
      let href = '';
      try { href = item.contentWindow?.location.href || ''; } catch { /* Cross-origin frame URL is unavailable here. */ }
      const src = item.getAttribute('src') || '';
      return (href && href === frameUrl) || (src && frameUrl.endsWith(src));
    });
    const frameTop = frame?.getBoundingClientRect().top ?? 120;
    const candidates = new Set(document.querySelectorAll('*'));
    // Viewer toolbars are sometimes rendered in an open or closed shadow
    // root, where querySelectorAll('*') cannot reach them. Hit-testing the
    // visible top strip still gives us the actual toolbar/host element.
    for (let y = 0; y < Math.min(innerHeight, frameTop + 80, 180); y += 8) {
      for (const x of [8, innerWidth / 2, Math.max(8, innerWidth - 8)]) {
        let element = document.elementFromPoint(x, y);
        while (element && element !== document.body && element !== document.documentElement) {
          candidates.add(element);
          element = element.parentElement;
        }
      }
    }
    for (const element of candidates) {
      if (frame && (element === frame || element.contains(frame))) continue;
      const rect = element.getBoundingClientRect();
      const position = getComputedStyle(element).position;
      const largeScroller = rect.width >= innerWidth * .9 && rect.height >= innerHeight * .8 && (element.scrollHeight > element.clientHeight + 20 || element === document.scrollingElement || element === document.body);
      if (largeScroller) continue;
      // Only top chrome should be hidden between tiles. A sticky image,
      // sidebar, or illustration is page content and must remain capturable.
      const fixedChrome = ['fixed', 'sticky'].includes(position) && rect.width >= innerWidth * .75 && rect.height > 0 && rect.height <= 160 && rect.top < frameTop + 80 && rect.bottom > -20;
      if (!fixedChrome) continue;
      outerHidden.push([element, element.style.getPropertyValue('visibility'), element.style.getPropertyPriority('visibility')]);
      element.style.setProperty('visibility', 'hidden', 'important');
    }
  }
  function restoreOuterFixed() {
    if (!outerHidden) return;
    for (const [element, value, priority] of outerHidden) {
      if (value) element.style.setProperty('visibility', value, priority);
      else element.style.removeProperty('visibility');
    }
    outerHidden = null;
  }
  function touch() {
    clearTimeout(session.timer);
    session.timer = setTimeout(restore, 15000);
  }
  function select() {
    cancelSelection?.();
    return new Promise(resolve => {
      const host = document.createElement('div');
      host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;';
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `<style>:host{color-scheme:dark}.surface{position:fixed;inset:0;cursor:crosshair;touch-action:none;background:rgba(14,16,24,.25);font:14px system-ui}.hint{position:absolute;top:24px;left:50%;transform:translateX(-50%);padding:12px 20px;border:1px solid #ffffff25;border-radius:30px;background:#171921;color:#fff;pointer-events:none;white-space:nowrap}.box{display:none;position:absolute;border:2px solid #b8abff;box-sizing:border-box;background:transparent;box-shadow:0 0 0 100000px #10121c66;pointer-events:none}.size{position:absolute;bottom:8px;left:8px;padding:4px 8px;border-radius:6px;color:#fff;background:#171921;white-space:nowrap}</style><div class="surface"><div class="hint">Drag to capture an area · Esc to cancel</div><div class="box"><span class="size"></span></div></div>`;
      document.documentElement.append(host);
      const surface = shadow.querySelector('.surface'), box = shadow.querySelector('.box');
      let start = null, rect = null, done = false;
      const clamp = event => ({ x: Math.max(0, Math.min(innerWidth, event.clientX)), y: Math.max(0, Math.min(innerHeight, event.clientY)) });
      const stop = async result => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        host.remove();
        removeEventListener('keydown', key, true);
        removeEventListener('wheel', block, true);
        cancelSelection = null;
        await delay(120);
        resolve(result);
      };
      const key = event => { block(event); if (event.key === 'Escape') stop({}); };
      const timer = setTimeout(() => stop({ error: 'Selection timed out. Please try again.' }), 25000);
      cancelSelection = () => stop({});
      addEventListener('keydown', key, true);
      addEventListener('wheel', block, { capture: true, passive: false });
      surface.onpointerdown = event => {
        if (event.button !== 0) return;
        event.preventDefault();
        surface.setPointerCapture(event.pointerId);
        start = clamp(event);
        box.style.display = 'block';
        surface.style.background = 'transparent';
        shadow.querySelector('.hint').style.display = 'none';
      };
      surface.onpointermove = event => {
        if (!start) return;
        const end = clamp(event);
        rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
        Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        box.querySelector('.size').textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      };
      surface.onpointerup = event => {
        if (!start) return;
        surface.onpointermove(event);
        if (rect && rect.width >= 4 && rect.height >= 4) stop({ rect: { ...rect, viewportWidth: innerWidth, viewportHeight: innerHeight } });
        else stop({ error: 'The selected area is too small. Drag a larger rectangle.' });
      };
      surface.onpointercancel = () => stop({});
    });
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.target !== 'screener-page') return;
    (async () => {
      switch (message.action) {
        case 'select': return select();
        case 'cancel': cancelSelection?.(); restore(); return { ok: true };
        case 'prepare': {
          restore();
          const selected = message.frameOnly ? targetInfo(currentTarget()) : captureTarget();
          const target = message.frameOnly ? currentTarget() : selected.target;
          let info = selected.info;
          const host = message.frameOnly ? scrollHost(target.doc) : selected.host;
          const style = target.doc.createElement('style');
          style.textContent = '*{scroll-behavior:auto!important;scroll-snap-type:none!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}';
          const viewportWidth = host?.clientWidth || info.viewportWidth || target.win.innerWidth;
          const viewportHeight = host?.clientHeight || info.viewportHeight || target.win.innerHeight;
          const persistent = [...target.doc.querySelectorAll('*')].filter(element => {
            const css = target.win.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            const largeScroller = rect.width >= viewportWidth * .9 && rect.height >= viewportHeight * .8 && (element === host || element.scrollHeight > element.clientHeight + 20 || element === target.doc.scrollingElement || element === target.doc.body);
            if (largeScroller) return false;
            // Normal-flow headings and sticky content must remain visible.
            // Only genuinely fixed top chrome is hidden on later rows.
            return css.position === 'fixed' && rect.width >= viewportWidth * .75 && rect.height > 0 && rect.height <= 160 && rect.top < 160 && rect.bottom > -20;
          });
          session = { x: target.win.scrollX, y: target.win.scrollY, win: target.win, doc: target.doc, host, hostX: host?.scrollLeft || 0, hostY: host?.scrollTop || 0, captureRect: info.captureRect || null, style, hidden: [], fixed: persistent, images: [], preloads: [], attributeChanges: [], styleChanges: [] };
          target.doc.documentElement.append(style);
          releaseStickyContent(session);
          activateLazySources(target.doc, session);
          await preloadBackgrounds(target.doc, target.win, session);
          info = targetInfo(target).info;
          session.captureRect = info.captureRect || null;
          addEventListener('wheel', block, { capture: true, passive: false });
          addEventListener('touchmove', block, { capture: true, passive: false });
          addEventListener('keydown', blockKeys, true);
          touch();
          return info;
        }
        case 'measure': return targetInfo(currentTarget()).info;
        case 'hideOuterChrome': hideOuterChrome(message.frameUrl); return { ok: true };
        case 'restoreOuterFixed': restoreOuterFixed(); return { ok: true };
        case 'frameMap': {
          const frames = [];
          const visit = root => {
            for (const element of root.querySelectorAll?.('*') || []) {
              if (element.localName === 'iframe') frames.push(element);
              if (element.shadowRoot) visit(element.shadowRoot);
            }
          };
          visit(document);
          return frames.map(frame => {
            const rect = frame.getBoundingClientRect();
            let href = '';
            try { href = frame.contentWindow?.location.href || ''; } catch { /* Cross-origin frame URL is unavailable here. */ }
            // HTMLIFrameElement.src is resolved by the browser and remains
            // readable cross-origin, unlike contentWindow.location.href.
            const rawSrc = frame.getAttribute('src') || '';
            let src = frame.src || rawSrc;
            try { src = new URL(src || 'about:blank', document.baseURI).href; } catch { /* Keep the readable source string. */ }
            return { id: frame.id, name: frame.name, src, rawSrc, href, rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
          });
        }
        case 'move': {
          if (!session) throw new Error('Capture cancelled or the page was reloaded.');
          touch();
          // Fixed/sticky navigation belongs to every viewport tile, but it
          // should appear only in the first vertical row. Later tiles skip
          // the overlapped top strip, so hiding it there exposes the content
          // underneath instead of duplicating the navigation bar.
          if (message.hideFixed && !session.didHide) {
            for (const element of session.fixed) {
              session.hidden.push([element, element.style.getPropertyValue('visibility'), element.style.getPropertyPriority('visibility')]);
              element.style.setProperty('visibility', 'hidden', 'important');
            }
            session.didHide = true;
          }
          if (session.host) session.host.scrollTo(message.x, message.y);
          else session.win.scrollTo(message.x, message.y);
          await delay(220);
          // Activate resources after the real scroll. This keeps the page to
          // one traversal instead of doing a separate warm-up traversal.
          activateLazySources(session.doc, session);
          let visibleImages = collectImages(session.doc).filter(image => {
            const rect = image.getBoundingClientRect();
            return rect.bottom > -300 && rect.top < session.win.innerHeight + 300;
          });
          session.images = [...new Set([...session.images, ...visibleImages])];
          await waitForImages(visibleImages);
          // IntersectionObserver-driven components may mount just after the
          // first layout pass. Rescan once without moving to another page
          // position so newly-mounted images enter this tile.
          await delay(120);
          activateLazySources(session.doc, session);
          visibleImages = collectImages(session.doc).filter(image => {
            const rect = image.getBoundingClientRect();
            return rect.bottom > -300 && rect.top < session.win.innerHeight + 300;
          });
          session.images = [...new Set([...session.images, ...visibleImages])];
          await waitForImages(visibleImages);
          // Lazy components can add new sticky elements during scrolling.
          releaseStickyContent(session);
          const measured = localDimensions(session.doc, session.win);
          if (session.host) {
            measured.width = Math.max(measured.width, session.host.scrollWidth);
            measured.height = Math.max(measured.height, session.host.scrollHeight);
            measured.viewportWidth = session.host.clientWidth;
            measured.viewportHeight = session.host.clientHeight;
          }
          return { ...measured, x: session.host ? session.host.scrollLeft : session.win.scrollX, y: session.host ? session.host.scrollTop : session.win.scrollY, captureRect: session.captureRect, screenInnerWidth: innerWidth, screenInnerHeight: innerHeight, frame: Boolean(session.captureRect) };
        }
        case 'restore': restore(); return { ok: true };
      }
    })().then(respond, error => { restore(); respond({ error: error.message }); });
    return true;
  });
})();

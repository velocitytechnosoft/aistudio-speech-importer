(() => {
  // Clean up any previous UI instances if re-injected
  document
    .querySelectorAll(
      '.aisi-fab-btn, .aisi-inline-btn, .aisi-modal-backdrop, .aisi-toast'
    )
    .forEach((el) => el.remove());

  const DEFAULT_SAMPLE_SCRIPT = `Speaker 1 (Girl): [Curious, slightly confused, bright and clear] "Who is JSON? <short pause> Is that a person?"
Speaker 2 (Claude): [Lighthearted, matter-of-fact, warm] "<chuckle> Nope. JSON doesn't have a face. <short pause> Or a birthday."
Speaker 1 (Girl): [Playfully demanding, upbeat] "Okay, then explain it like I'm five."
Speaker 2 (Claude): [Enthusiastic, authoritative newscaster, fast-paced] "<throat-clearing> Sure! It's a lightweight data interchange format—"
Speaker 1 (Girl): [Interrupting, deadpan, flat] "Okay, I'm already six words behind."
Speaker 2 (Claude): [Adjusting tone, calm, trying to simplify] "<sigh> Right. It stores key-value pairs."
Speaker 1 (Girl): [Firm, slightly exasperated but friendly, slow and deliberate] "Claude. <long pause> Five."
Speaker 2 (Claude): [Conceding, soothing audiobook narrator, gentle] "Okay. You've got a toy bear. <short pause> Let's make it a little information card."
Speaker 2 (Claude): [Rhythmic, measured, listing items clearly] "Name: Teddy. <short pause> Color: brown. <short pause> Age: three."
Speaker 1 (Girl): [Excited, sudden epiphany] "<gasp> Oh! A label, <short pause> then the answer."
Speaker 2 (Claude): [Encouraging, warm and friendly] "Exactly. Now write the card like this. <short pause> Same information, just with a few rules."
Speaker 2 (Claude): [Clear, instructive, measured pace] "Quotes around words. <short pause> Commas between the pairs. <short pause> Curly braces keep this card together."
Speaker 1 (Girl): [Confident, connecting the dots] "So JSON is a way to write down information?"
Speaker 2 (Claude): [Affirming, upbeat] "Yep. In a format computers can read and share."
Speaker 1 (Girl): [Teasing, dry humor] "<snicker> You could've started with Teddy."
Speaker 2 (Claude): [Warm, agreeable] "<laughter> Yeah. Teddy's a better teacher."`;

  const VOCAL_TAGS = [
    '<short pause>',
    '<long pause>',
    '<sigh>',
    '<laughter>',
    '<gasp>',
    '<snicker>',
    '<throat-clearing>',
    '<cough>',
    '<breath>',
    '<chuckle>',
    '<cackle>',
    '<cheer>',
    '<argh>'
  ];

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeInlineExpressions(dialogueText) {
    return dialogueText.replace(/\[([^\]]+)\]/g, (_full, inner) => {
      const lower = inner.trim().toLowerCase();
      if (lower === 'pause' || lower === 'short pause' || lower === 'brief pause') {
        return '<short pause>';
      }
      if (
        lower === 'deliberate pause' ||
        lower === 'long pause' ||
        lower === 'dramatic pause' ||
        lower === 'beat'
      ) {
        return '<long pause>';
      }
      if (lower === 'laugh' || lower === 'laughter' || lower === 'laughs') {
        return '<laughter>';
      }
      if (lower.includes('chuckl')) {
        return '<chuckle>';
      }
      if (lower.includes('snicker')) {
        return '<snicker>';
      }
      if (lower.includes('cackle')) {
        return '<cackle>';
      }
      if (lower.includes('gasp')) {
        return '<gasp>';
      }
      if (lower.includes('throat') || lower === 'ahem') {
        return '<throat-clearing>';
      }
      if (lower.includes('cough')) {
        return '<cough>';
      }
      if (lower.includes('sigh')) {
        return '<sigh>';
      }
      if (lower.includes('breath')) {
        return '<breath>';
      }
      if (lower.includes('cheer')) {
        return '<cheer>';
      }
      return `<${lower}>`;
    });
  }

  function stripOuterQuotes(str) {
    let s = str.trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith('\u201C') && s.endsWith('\u201D'))
    ) {
      s = s.slice(1, -1).trim();
    }
    // Strip markdown bold/italic markers if present
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
    return s;
  }

  function splitInlineSpeakerTurns(rawText) {
    const withBreaks = rawText.replace(
      /([^\r\n])\s+(?=Speaker\s*\d+\s*(?:\([^)]*\))?\s*(?:\[[^\]]*\])?\s*:)/gi,
      '$1\n'
    );
    return withBreaks
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !/^read aloud in a\b/i.test(l));
  }

  function parseScript(
    rawText,
    speakerMode = 'auto',
    convertTags = true,
    mergeSameSpeaker = true
  ) {
    const rawLines = splitInlineSpeakerTurns(rawText);
    const speakerMap = new Map();
    const rawTurns = [];

    const lineRegex =
      /^(?:([A-Za-z0-9 _.-]{1,30}?)\s*(?:\(([^)]*)\))?\s*(?:\[([^\]]*)\])?\s*:\s*)(?:\[([^\]]*)\]\s*)?(.+)$/;

    let lastSpeakerIndex = 1;
    let lastSpeakerLabel = 'Speaker 1';
    let lastRawSpeaker = '';

    rawLines.forEach((line, idx) => {
      let speakerLabel = lastSpeakerLabel;
      let speakerIndex = lastSpeakerIndex;
      let rawSpeaker = lastRawSpeaker;
      let style = '';
      let text = line;

      const match = line.match(lineRegex);
      if (match && speakerMode !== 'none') {
        rawSpeaker = match[1].trim();
        const parenPart = (match[2] || '').trim();
        const preColonBracket = (match[3] || '').trim();
        const postColonBracket = (match[4] || '').trim();
        text = match[5].trim();

        const numMatch = rawSpeaker.match(/speaker\s*(\d+)/i);
        if (numMatch) {
          speakerIndex = parseInt(numMatch[1], 10);
          speakerLabel = parenPart
            ? `Speaker ${speakerIndex} (${parenPart})`
            : `Speaker ${speakerIndex}`;
          style = postColonBracket || preColonBracket;
        } else {
          const key = rawSpeaker.toLowerCase();
          if (!speakerMap.has(key)) {
            speakerMap.set(key, (speakerMap.size % 2) + 1);
          }
          speakerIndex = speakerMap.get(key);
          speakerLabel = `${rawSpeaker} (Speaker ${speakerIndex})`;
          style = postColonBracket || preColonBracket || parenPart;
        }
        lastSpeakerIndex = speakerIndex;
        lastSpeakerLabel = speakerLabel;
        lastRawSpeaker = rawSpeaker;
      } else if (speakerMode === 'alternate') {
        speakerIndex = (idx % 2) + 1;
        speakerLabel = `Speaker ${speakerIndex}`;
      } else if (speakerMode === 'none') {
        speakerIndex = 1;
        speakerLabel = 'Speaker 1';
      }

      text = stripOuterQuotes(text);
      if (convertTags) {
        text = normalizeInlineExpressions(text);
      }

      style = style.replace(/\s+tone$/i, '').trim();

      rawTurns.push({
        speakerIndex,
        speakerRawName: rawSpeaker,
        speakerLabel,
        style,
        text
      });
    });

    if (!mergeSameSpeaker) {
      return rawTurns;
    }

    // Merge consecutive lines belonging to the same speaker into a single speech block
    const mergedTurns = [];
    for (const turn of rawTurns) {
      const prev = mergedTurns[mergedTurns.length - 1];
      if (prev && prev.speakerIndex === turn.speakerIndex) {
        prev.text = `${prev.text} <short pause> ${turn.text}`;
        if (turn.style && !prev.style.toLowerCase().includes(turn.style.toLowerCase())) {
          prev.style = prev.style ? `${prev.style}; ${turn.style}` : turn.style;
        }
      } else {
        mergedTurns.push({ ...turn });
      }
    }

    return mergedTurns;
  }

  function findAddBlockButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(
      (b) => b.textContent && b.textContent.toLowerCase().includes('add speech block')
    );
  }

  function simulateUserClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1
    };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  function isTrulyVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) < 0.05
    ) {
      return false;
    }
    return true;
  }

  function getOpenStyleInputs() {
    return Array.from(document.querySelectorAll('textarea, input')).filter((el) => {
      if (el.closest('.aisi-modal')) return false;
      if (!isTrulyVisible(el)) return false;
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      const r = el.getBoundingClientRect();
      return (
        placeholder.includes('voice style') ||
        placeholder.includes('tone, mood') ||
        (r.width > 70 && r.width <= 270 && r.height > 14)
      );
    });
  }

  async function closeAllOpenPopovers(triggerBtn, fallbackClickEl) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const openInputs = getOpenStyleInputs();
      if (openInputs.length === 0) break;

      const activeInput = openInputs[openInputs.length - 1];
      activeInput.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true
        })
      );
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true
        })
      );

      const backdrops = Array.from(
        document.querySelectorAll('.cdk-overlay-backdrop, [class*="backdrop"]')
      ).filter((b) => !b.closest('.aisi-modal-backdrop') && isTrulyVisible(b));
      if (backdrops.length > 0) {
        simulateUserClick(backdrops[backdrops.length - 1]);
      } else if (triggerBtn && attempt === 0) {
        simulateUserClick(triggerBtn);
      } else if (fallbackClickEl) {
        simulateUserClick(fallbackClickEl);
      }

      await sleep(110);
    }
  }

  function getSpeechBlocks() {
    const allInputs = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"]')
    ).filter((el) => {
      if (el.closest('.aisi-modal')) return false;
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      if (placeholder.includes('voice style') || placeholder.includes('tone, mood')) {
        return false;
      }
      if (
        el.closest(
          '.cdk-overlay-container, .cdk-overlay-pane, [role="menu"], [role="listbox"], .mat-mdc-menu-panel'
        )
      ) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 270 && rect.height > 20;
    });

    return allInputs.map((inputEl) => {
      let container = inputEl.parentElement;
      while (container && container !== document.body) {
        const btns = Array.from(
          container.querySelectorAll('button, [role="combobox"], mat-select')
        );
        const hasSpeakerBtn = btns.some((b) => /speaker\s*\d/i.test(b.textContent));
        const hasExpressionBtn = btns.some((b) => /expression/i.test(b.textContent));
        if (hasSpeakerBtn && hasExpressionBtn) {
          break;
        }
        container = container.parentElement;
      }

      const blockRoot =
        container && container !== document.body ? container : inputEl.parentElement;
      const buttons = blockRoot
        ? Array.from(
            blockRoot.querySelectorAll('button, [role="combobox"], mat-select')
          )
        : [];

      const speakerBtn = buttons.find((b) => /speaker\s*\d/i.test(b.textContent));
      const expressionBtn = buttons.find((b) => /expression/i.test(b.textContent));

      let styleBtn = null;
      if (speakerBtn && expressionBtn) {
        const spkIdx = buttons.indexOf(speakerBtn);
        const expIdx = buttons.indexOf(expressionBtn);
        if (expIdx > spkIdx + 1) {
          styleBtn = buttons[spkIdx + 1];
        }
      }

      // Find the rightmost "✕" delete button in the block's top header bar
      let deleteBtn = null;
      if (speakerBtn && buttons.length > 2) {
        const headerY = speakerBtn.getBoundingClientRect().top;
        const headerBtns = buttons.filter(
          (b) =>
            b !== speakerBtn &&
            b !== styleBtn &&
            b !== expressionBtn &&
            Math.abs(b.getBoundingClientRect().top - headerY) < 30
        );
        if (headerBtns.length > 0) {
          deleteBtn = headerBtns[headerBtns.length - 1];
        }
      }

      return {
        root: blockRoot,
        inputEl,
        speakerBtn,
        styleBtn,
        expressionBtn,
        deleteBtn
      };
    });
  }

  // Delete all blocks after Block #1 so "+ Add speech block" natively alternates Speaker 1 -> Speaker 2
  async function resetToSingleFirstBlock(delayMs, onProgress) {
    let blocks = getSpeechBlocks();
    let safety = 0;
    while (blocks.length > 1 && safety < 50) {
      const lastBlock = blocks[blocks.length - 1];
      if (!lastBlock || !lastBlock.root) break;

      // Hover the block so its header action icons (▶ 🎤 ✕) become active
      lastBlock.root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      lastBlock.root.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(50);

      const refreshed = getSpeechBlocks();
      const target = refreshed[refreshed.length - 1];
      if (!target || !target.deleteBtn) break;

      onProgress(`Clearing initial template block ${refreshed.length}...`);
      simulateUserClick(target.deleteBtn);
      await sleep(Math.max(100, Math.floor(delayMs * 0.6)));

      const nextBlocks = getSpeechBlocks();
      if (nextBlocks.length >= blocks.length) {
        // Delete button didn't remove the block; stop trying to delete
        break;
      }
      blocks = nextBlocks;
      safety++;
    }
  }

  function discoverSpeakerVoiceNames(blocks) {
    const voiceMap = {};
    blocks.forEach((b) => {
      if (!b.speakerBtn) return;
      const m = b.speakerBtn.textContent.match(
        /speaker\s*(\d+)\s*[-–:]\s*([A-Za-z0-9_]+)/i
      );
      if (m) {
        voiceMap[parseInt(m[1], 10)] = m[2].trim().toLowerCase();
      }
    });
    return voiceMap;
  }

  function setElementText(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
    );
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  async function selectSpeakerForBlock(block, turn, voiceMap, delayMs) {
    if (!block.speakerBtn) return;
    const targetSpeakerNum = `speaker ${turn.speakerIndex}`;
    const otherSpeakerNum = `speaker ${turn.speakerIndex === 1 ? 2 : 1}`;
    const targetVoiceName = voiceMap[turn.speakerIndex] || '';
    const otherVoiceName = voiceMap[turn.speakerIndex === 1 ? 2 : 1] || '';

    const currentText = block.speakerBtn.textContent.trim().toLowerCase();
    if (currentText.includes(targetSpeakerNum)) {
      return;
    }

    simulateUserClick(block.speakerBtn);
    await sleep(delayMs);

    const btnRect = block.speakerBtn.getBoundingClientRect();
    const scanX = btnRect.left + Math.min(55, btnRect.width / 2);

    const hitCandidates = [];
    const offsets = [
      16, 26, 36, 46, 56, 68, 80, 95, 110, 130, -18, -32, -48, -64, -80
    ];
    for (const dy of offsets) {
      const y = dy > 0 ? btnRect.bottom + dy : btnRect.top + dy;
      if (y < 5 || y > window.innerHeight - 5) continue;
      const hitEl = document.elementFromPoint(scanX, y);
      if (
        hitEl &&
        hitEl !== block.speakerBtn &&
        !block.speakerBtn.contains(hitEl) &&
        hitEl !== block.inputEl &&
        !block.inputEl.contains(hitEl) &&
        !hitEl.closest('.aisi-toast')
      ) {
        if (!hitCandidates.includes(hitEl)) {
          hitCandidates.push(hitEl);
        }
      }
    }

    const nearbyEls = Array.from(document.querySelectorAll('*')).filter((el) => {
      if (
        el === block.speakerBtn ||
        block.speakerBtn.contains(el) ||
        el === block.inputEl ||
        el.closest('.aisi-toast')
      ) {
        return false;
      }
      if (!isTrulyVisible(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 12 || r.height > 56) return false;
      const horizClose = Math.abs(r.left - btnRect.left) < 160;
      const vertClose =
        r.top >= btnRect.top - 160 && r.top <= btnRect.bottom + 200;
      return horizClose && vertClose;
    });

    const combinedPool = [...hitCandidates, ...nearbyEls].filter((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      if (!txt) return false;
      if (
        txt.includes('setting') ||
        txt.includes('add ') ||
        txt.includes('new voice') ||
        txt.includes('expression')
      ) {
        return false;
      }
      if (txt.includes(targetSpeakerNum) && txt.includes(otherSpeakerNum)) return false;
      if (
        targetVoiceName &&
        otherVoiceName &&
        txt.includes(targetVoiceName) &&
        txt.includes(otherVoiceName)
      ) {
        return false;
      }
      return true;
    });

    const matchingEls = combinedPool.filter((el) => {
      const txt = (el.textContent || '').trim().toLowerCase();
      return (
        txt.includes(targetSpeakerNum) ||
        (targetVoiceName && txt.includes(targetVoiceName))
      );
    });

    let targetEl = null;
    if (matchingEls.length > 0) {
      targetEl =
        matchingEls.find((el) => hitCandidates.includes(el)) ||
        matchingEls[matchingEls.length - 1];
    }

    if (targetEl) {
      simulateUserClick(targetEl);
      await sleep(120);

      const switched = block.speakerBtn.textContent
        .trim()
        .toLowerCase()
        .includes(targetSpeakerNum);
      if (!switched) {
        const rowParent =
          targetEl.closest(
            '[role="menuitem"], [role="option"], mat-option, .mat-mdc-menu-item, button, li'
          ) || targetEl.parentElement;
        if (rowParent && rowParent !== document.body) {
          simulateUserClick(rowParent);
          await sleep(110);
        }
      }
    } else {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          bubbles: true
        })
      );
      await sleep(80);
    }
  }

  async function selectStyleForBlock(block, turn, delayMs) {
    if (!turn.style || !block.styleBtn) return;
    const currentStyle = block.styleBtn.textContent.trim().toLowerCase();
    if (currentStyle.includes(turn.style.toLowerCase().slice(0, 10))) return;

    await closeAllOpenPopovers(null, block.inputEl);

    simulateUserClick(block.styleBtn);
    await sleep(delayMs);

    const openInputs = getOpenStyleInputs();
    const styleInput = openInputs[openInputs.length - 1];

    if (styleInput) {
      setElementText(styleInput, turn.style);
      await sleep(90);
    }

    await closeAllOpenPopovers(block.styleBtn, block.inputEl);
  }

  async function populateBlocks(turns, options, onProgress) {
    const { mode = 'overwrite', delayMs = 220 } = options;

    await closeAllOpenPopovers();

    // In Overwrite mode, clear extra pre-filled template blocks down to Block #1 first
    // so Google AI Studio's "+ Add speech block" natively alternates Speaker 1 -> Speaker 2!
    if (mode === 'overwrite') {
      await resetToSingleFirstBlock(delayMs, onProgress);
    }

    let currentBlocks = getSpeechBlocks();
    const startIndex = mode === 'append' ? currentBlocks.length : 0;
    const totalNeeded = startIndex + turns.length;

    let safetyCounter = 0;
    while (currentBlocks.length < totalNeeded && safetyCounter < 200) {
      const addBtn = findAddBlockButton();
      if (!addBtn) break;
      onProgress(`Adding speech block ${currentBlocks.length + 1} of ${totalNeeded}...`);
      simulateUserClick(addBtn);
      await sleep(delayMs);
      currentBlocks = getSpeechBlocks();
      safetyCounter++;
    }

    currentBlocks = getSpeechBlocks();
    const voiceMap = discoverSpeakerVoiceNames(currentBlocks);

    for (let i = 0; i < turns.length; i++) {
      const targetIdx = startIndex + i;
      const block = currentBlocks[targetIdx];
      const turn = turns[i];
      if (!block) continue;

      block.root?.scrollIntoView({ behavior: 'instant', block: 'center' });
      await sleep(50);

      onProgress(`Filling block ${i + 1} of ${turns.length} (${turn.speakerLabel})...`);

      // 1. Set spoken dialogue text
      setElementText(block.inputEl, turn.text);
      await sleep(50);

      // 2. Select Speaker 1 / Speaker 2 if needed
      await selectSpeakerForBlock(block, turn, voiceMap, delayMs);

      // 3. Set Style / Tone and guarantee popover closes
      if (turn.style) {
        await selectStyleForBlock(block, turn, delayMs);
      }

      await sleep(60);
    }

    await closeAllOpenPopovers();
    onProgress(`✅ Successfully populated ${turns.length} speech blocks!`);
  }

  function showProgressToast(initialText) {
    let toast = document.querySelector('.aisi-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'aisi-toast';
      toast.style.cssText =
        'position:fixed;bottom:24px;right:24px;z-index:99999;background:#1e1f22;color:#8ab4f8;border:1px solid #8ab4f8;border-radius:12px;padding:12px 18px;font-family:"Google Sans",Roboto,sans-serif;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.6);';
      document.body.appendChild(toast);
    }
    toast.textContent = initialText;
    return toast;
  }

  function openImporterModal() {
    const existing = document.querySelector('.aisi-modal-backdrop');
    if (existing) {
      existing.remove();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'aisi-modal-backdrop';

    const tagButtonsHtml = VOCAL_TAGS.map(
      (tag) =>
        `<button type="button" class="aisi-tag-chip" data-tag="${tag.replace(/"/g, '&quot;')}" style="background:#23272e;color:#8ab4f8;border:1px solid #3c4043;border-radius:999px;padding:3px 9px;font-size:11px;cursor:pointer;font-family:monospace;">${tag.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</button>`
    ).join('');

    backdrop.innerHTML = `
      <div class="aisi-modal" role="dialog" aria-modal="true">
        <div class="aisi-modal-header">
          <div class="aisi-modal-title">
            <span>🎙️</span>
            <span>Import Full Script into Speech Blocks (v1.7)</span>
          </div>
          <button class="aisi-close-btn" title="Close">&times;</button>
        </div>
        <div class="aisi-modal-body">
          <div class="aisi-format-hint">
            <strong>Format:</strong> <code>Speaker 1 (Girl): [Style / Emotion] "Spoken text with &lt;short pause&gt; tags."</code><br/>
            • Automatically merges consecutive lines from the <strong>same speaker</strong> into a single speech block so Speaker 1 &amp; Speaker 2 stay 100% in sync!
          </div>

          <div class="aisi-controls-row">
            <label class="aisi-control-group">
              <span>Mode:</span>
              <select class="aisi-select" id="aisi-fill-mode">
                <option value="overwrite">Fill from Block #1 (Overwrite existing)</option>
                <option value="append">Append at the end (+ Add new blocks)</option>
              </select>
            </label>

            <label class="aisi-control-group">
              <span>Speaker Detection:</span>
              <select class="aisi-select" id="aisi-speaker-mode">
                <option value="auto">Auto-detect Speaker 1 / Speaker 2</option>
                <option value="alternate">Alternate Speaker 1 / Speaker 2</option>
                <option value="none">Keep current speaker</option>
              </select>
            </label>

            <label class="aisi-control-group" style="cursor:pointer;">
              <input type="checkbox" id="aisi-merge-same" checked />
              <span><strong>Merge consecutive same-speaker lines</strong></span>
            </label>

            <label class="aisi-control-group" style="cursor:pointer;">
              <input type="checkbox" id="aisi-convert-tags" checked />
              <span>Convert <code>[...]</code> to <code>&lt;...&gt;</code></span>
            </label>

            <label class="aisi-control-group">
              <span>Delay (ms):</span>
              <input type="number" class="aisi-input" id="aisi-delay" value="220" min="100" max="1000" step="20" style="width: 64px;" />
            </label>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
            <span style="font-size:11.5px;color:#9aa0a6;margin-right:4px;">Insert Tag at Cursor:</span>
            ${tagButtonsHtml}
          </div>

          <textarea class="aisi-textarea" id="aisi-script-input" placeholder="Paste your full script here..."></textarea>

          <div class="aisi-preview-header">
            <span id="aisi-preview-count">Preview (0 blocks)</span>
            <button class="aisi-btn-secondary" id="aisi-load-sample" style="padding: 3px 10px; font-size: 11.5px;">Reset to JSON Teddy Script</button>
          </div>
          <div class="aisi-preview-list" id="aisi-preview-list"></div>
        </div>

        <div class="aisi-modal-footer">
          <div class="aisi-status" id="aisi-status-text">Ready to import</div>
          <div class="aisi-footer-actions">
            <button class="aisi-btn-secondary" id="aisi-cancel-btn">Cancel</button>
            <button class="aisi-btn-primary" id="aisi-run-btn">⚡ Create Speech Blocks</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const textarea = backdrop.querySelector('#aisi-script-input');
    const fillModeSelect = backdrop.querySelector('#aisi-fill-mode');
    const speakerModeSelect = backdrop.querySelector('#aisi-speaker-mode');
    const mergeSameCheckbox = backdrop.querySelector('#aisi-merge-same');
    const convertTagsCheckbox = backdrop.querySelector('#aisi-convert-tags');
    const delayInput = backdrop.querySelector('#aisi-delay');
    const previewCount = backdrop.querySelector('#aisi-preview-count');
    const previewList = backdrop.querySelector('#aisi-preview-list');
    const statusText = backdrop.querySelector('#aisi-status-text');
    const runBtn = backdrop.querySelector('#aisi-run-btn');

    backdrop.querySelectorAll('.aisi-tag-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.getAttribute('data-tag');
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        textarea.value =
          textarea.value.slice(0, start) + tag + ' ' + textarea.value.slice(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + tag.length + 1;
        updatePreview();
      });
    });

    if (chrome?.storage?.local) {
      chrome.storage.local.get(
        ['savedScript', 'speakerMode', 'fillMode', 'mergeSame'],
        (res) => {
          textarea.value = res.savedScript || DEFAULT_SAMPLE_SCRIPT;
          if (res.speakerMode) speakerModeSelect.value = res.speakerMode;
          if (res.fillMode) fillModeSelect.value = res.fillMode;
          if (typeof res.mergeSame === 'boolean') {
            mergeSameCheckbox.checked = res.mergeSame;
          }
          updatePreview();
        }
      );
    } else {
      textarea.value = DEFAULT_SAMPLE_SCRIPT;
    }

    function updatePreview() {
      const raw = textarea.value;
      const speakerMode = speakerModeSelect.value;
      const convertTags = convertTagsCheckbox.checked;
      const mergeSame = mergeSameCheckbox.checked;
      const turns = parseScript(raw, speakerMode, convertTags, mergeSame);

      if (chrome?.storage?.local) {
        chrome.storage.local.set({
          savedScript: raw,
          speakerMode,
          fillMode: fillModeSelect.value,
          mergeSame
        });
      }

      previewCount.textContent = `Preview (${turns.length} speech block${
        turns.length === 1 ? '' : 's'
      } will be created)`;
      previewList.innerHTML = '';

      turns.forEach((t, idx) => {
        const item = document.createElement('div');
        item.className = 'aisi-preview-item';
        const spkClass = t.speakerIndex === 2 ? 'speaker-2' : '';
        const styleBadge = t.style
          ? `<span class="aisi-badge-style">${escapeHtml(t.style)}</span>`
          : '';
        item.innerHTML = `
          <div class="aisi-preview-badges">
            <span style="color:#9aa0a6; font-size:11px;">#${idx + 1}</span>
            <span class="aisi-badge-speaker ${spkClass}">${escapeHtml(
              t.speakerLabel
            )}</span>
            ${styleBadge}
          </div>
          <div class="aisi-preview-text">${escapeHtml(t.text)}</div>
        `;
        previewList.appendChild(item);
      });
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    textarea.addEventListener('input', updatePreview);
    speakerModeSelect.addEventListener('change', updatePreview);
    fillModeSelect.addEventListener('change', updatePreview);
    mergeSameCheckbox.addEventListener('change', updatePreview);
    convertTagsCheckbox.addEventListener('change', updatePreview);

    backdrop.querySelector('#aisi-load-sample').addEventListener('click', () => {
      textarea.value = DEFAULT_SAMPLE_SCRIPT;
      updatePreview();
    });

    const closeModal = () => backdrop.remove();
    backdrop.querySelector('.aisi-close-btn').addEventListener('click', closeModal);
    backdrop.querySelector('#aisi-cancel-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    runBtn.addEventListener('click', async () => {
      const turns = parseScript(
        textarea.value,
        speakerModeSelect.value,
        convertTagsCheckbox.checked,
        mergeSameCheckbox.checked
      );
      if (turns.length === 0) {
        statusText.textContent = '⚠️ Please paste at least one line of script.';
        return;
      }

      const fillMode = fillModeSelect.value;
      const delayMs = parseInt(delayInput.value, 10) || 220;

      closeModal();
      const toast = showProgressToast('🎙️ Starting script import...');

      try {
        await populateBlocks(turns, { mode: fillMode, delayMs }, (msg) => {
          toast.textContent = msg;
        });
        setTimeout(() => toast.remove(), 2500);
      } catch (err) {
        console.error(err);
        toast.textContent = `❌ Error: ${err.message}`;
        setTimeout(() => toast.remove(), 4000);
      }
    });

    updatePreview();
    textarea.focus();
  }

  function ensureButtonsInjected() {
    const isSpeechPage =
      window.location.href.includes('generate-speech') || Boolean(findAddBlockButton());

    let fab = document.querySelector('.aisi-fab-btn');
    if (isSpeechPage && !fab) {
      fab = document.createElement('button');
      fab.className = 'aisi-fab-btn';
      fab.innerHTML = '<span>📋</span><span>Import Full Script</span>';
      fab.title = 'Paste a full script and automatically create all speech blocks';
      fab.addEventListener('click', openImporterModal);
      document.body.appendChild(fab);
    } else if (!isSpeechPage && fab) {
      fab.remove();
    }

    const addBtn = findAddBlockButton();
    if (addBtn && !document.querySelector('.aisi-inline-btn')) {
      const inlineBtn = document.createElement('button');
      inlineBtn.type = 'button';
      inlineBtn.className = 'aisi-inline-btn';
      inlineBtn.innerHTML = '<span>📋</span><span>Paste Full Script</span>';
      inlineBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openImporterModal();
      });
      addBtn.insertAdjacentElement('afterend', inlineBtn);
    }
  }

  if (!window.__aisiMessageListenerRegistered && chrome?.runtime?.onMessage) {
    window.__aisiMessageListenerRegistered = true;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.action === 'OPEN_IMPORTER_MODAL') {
        openImporterModal();
        sendResponse({ ok: true });
      }
    });
  }

  if (!window.__aisiObserver) {
    window.__aisiObserver = new MutationObserver(() => {
      ensureButtonsInjected();
    });
    window.__aisiObserver.observe(document.body, { childList: true, subtree: true });
  }
  ensureButtonsInjected();
})();

/**
 * Reviewer Interactions — Unified Dock System
 *
 * Single dock that morphs between states:
 *   QUESTION  → Input top, [Show Answer SPACE | MC ↵] bottom
 *   ANSWER    → Timer/Rating top, [Weiter SPACE | Nachfragen ↵] bottom
 *   EVALUATED → Result top, [Weiter SPACE | Nachfragen ↵] bottom
 *   MC_ACTIVE → MC options (no action row)
 *   CHAT open → Dock hides, chat panel takes over
 */

(function() {
    'use strict';

    const S = {
        QUESTION:   'question',
        EVALUATING: 'evaluating',
        EVALUATED:  'evaluated',
        MC_LOADING: 'mc-loading',
        MC_ACTIVE:  'mc-active',
        MC_RESULT:  'mc-result',
        ANSWER:     'answer',
    };

    let current = S.QUESTION;
    let transitioning = false;
    let mcAttempts = 0;
    let mcCorrectIndex = -1;
    let mcOptions = [];      // Store full options with explanations
    let mcWrongPicks = [];    // Track which wrong options were picked
    let autoRateEase = 0;
    let questionStartTime = Date.now();
    let chatOpen = false;
    let aiSteps = [];         // ThoughtStream steps
    let lastUserAnswer = '';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);


    // ═══════════════════════════════════════════════
    //   UNIFIED DOCK — State Management
    // ═══════════════════════════════════════════════

    /**
     * Build action row HTML for the bottom of the dock.
     * Each action: { label, shortcut, onclick, color?, weight? }
     */
    function setActions(left, right) {
        const el = $('#dock-actions');
        if (!el) return;

        if (!left && !right) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'flex';

        // Build buttons with explicit inline border-radius (no pseudo-selectors).
        // Matches ChatInput.jsx exactly — clean hover fills to container edges.
        const btn = (a, position) => {
            const color = a.color || 'rgba(255,255,255,0.35)';
            const weight = a.weight || '500';
            let radius = 'border-radius:0;';
            if (position === 'left' || position === 'only') radius += 'border-bottom-left-radius:16px;';
            if (position === 'right' || position === 'only') radius += 'border-bottom-right-radius:16px;';
            return (
                `<button class="dock-action" onclick="${a.onclick}" style="color:${color};font-weight:${weight};${radius}">`
                + `${a.label}`
                + `<span class="shortcut">${a.shortcut}</span>`
                + `</button>`
            );
        };

        if (right) {
            const divider = '<div style="width:1px;height:16px;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>';
            el.innerHTML = btn(left, 'left') + divider + btn(right, 'right');
        } else {
            el.innerHTML = btn(left, 'only');
        }
    }

    function showSection(id) {
        $$('.dock-section').forEach(s => s.classList.remove('active'));
        const el = $('#' + id);
        if (el) el.classList.add('active');
    }

    function setState(newState) {
        current = newState;

        const dock = $('#unified-dock');

        // Hide dock when chat is open (except during question state for quick return)
        if (chatOpen) {
            if (dock) dock.classList.add('dock-hidden');
        } else {
            if (dock) dock.classList.remove('dock-hidden');
        }

        // Answer/Question visibility
        const answerEl = $('#answer-section');
        const questionEl = $('.question');
        const divider = $('#card-divider');

        if (newState === S.ANSWER || newState === S.EVALUATED || newState === S.MC_RESULT) {
            if (answerEl) { answerEl.classList.remove('hidden'); answerEl.style.opacity = '1'; }
            if (questionEl) questionEl.classList.add('hidden');
            if (divider) divider.classList.remove('opacity-100');
        } else {
            if (answerEl) answerEl.classList.add('hidden');
            if (questionEl) questionEl.classList.remove('hidden');
            if (divider) divider.classList.remove('opacity-100');
        }

        // Update dock content + actions per state
        switch (newState) {
            case S.QUESTION: {
                // Reset dock border tint from previous MC result
                const dockInner = document.querySelector('#unified-dock > div');
                if (dockInner) dockInner.style.borderColor = '';
                showSection('dc-input');
                setActions(
                    { label: 'Show Answer', shortcut: 'SPACE', onclick: 'showAnswer()', color: 'rgba(255,255,255,0.88)', weight: '600' },
                    { label: 'Multiple Choice', shortcut: '↵', onclick: 'startMCMode()' }
                );
                break;
            }

            case S.EVALUATING:
                showSection('dc-loading');
                $('#loading-text') && ($('#loading-text').textContent = 'KI bewertet');
                setActions(null, null); // hide actions during loading
                break;

            case S.MC_LOADING:
                showSection('dc-loading');
                $('#loading-text') && ($('#loading-text').textContent = 'Generiere Optionen');
                setActions(null, null);
                break;

            case S.MC_ACTIVE:
                showSection('dc-mc');
                buildStars();
                setActions(
                    { label: 'Auflösen', shortcut: 'SPACE', onclick: 'revealAnswer()' },
                    { label: 'Auflösen & Nachfragen', shortcut: '↵', onclick: 'revealAndChat()' }
                );
                break;

            case S.EVALUATED:
            case S.MC_RESULT:
                showSection('dc-eval');
                setActions(
                    { label: 'Weiter', shortcut: 'SPACE', onclick: 'proceedAfterEval()', color: 'rgba(255,255,255,0.88)', weight: '600' },
                    { label: chatOpen ? 'Schließen' : 'Nachfragen', shortcut: chatOpen ? 'ESC' : '↵', onclick: 'openFollowUp()' }
                );
                break;

            case S.ANSWER:
                showSection('dc-timer');
                setActions(
                    { label: 'Weiter', shortcut: 'SPACE', onclick: 'rateCard(autoRateEase||3)', color: 'rgba(255,255,255,0.88)', weight: '600' },
                    { label: chatOpen ? 'Schließen' : 'Nachfragen', shortcut: chatOpen ? 'ESC' : '↵', onclick: 'openFollowUp()' }
                );
                break;
        }
    }


    // ═══════════════════════════════════════════════
    //   HELPERS
    // ═══════════════════════════════════════════════

    function getTextContent(selector) {
        let el = $(selector);
        // Fallback: if .answer not found, try #answer-section
        if (!el && selector === '.answer') el = $('#answer-section');
        if (!el) return '';
        const clone = el.cloneNode(true);
        clone.querySelectorAll('script, style').forEach(e => e.remove());
        return clone.textContent.trim().substring(0, 2000);
    }


    // ═══ Timer System ═══

    function getQuestionCharCount() {
        return getTextContent('.question').length;
    }

    function getTimeThresholds() {
        const chars = getQuestionCharCount();
        const bonus = Math.floor(chars / 50);
        const goodThreshold = Math.min(6 + bonus, 20);
        const hardThreshold = Math.min(15 + bonus * 2, 45);
        return { good: goodThreshold, hard: hardThreshold };
    }

    function getRatingForTime(elapsedSec) {
        const thresholds = getTimeThresholds();
        if (elapsedSec <= thresholds.good) return { ease: 3, label: 'Good', color: 'text-success', hex: '#30d158' };
        if (elapsedSec <= thresholds.hard) return { ease: 2, label: 'Hard', color: 'text-warning', hex: '#ffd60a' };
        return { ease: 1, label: 'Again', color: 'text-error', hex: '#ff453a' };
    }

    const ratingOptions = [
        { ease: 1, label: 'Again', color: 'text-error', hex: '#ff453a' },
        { ease: 2, label: 'Hard', color: 'text-warning', hex: '#ffd60a' },
        { ease: 3, label: 'Good', color: 'text-success', hex: '#30d158' },
        { ease: 4, label: 'Easy', color: 'text-primary', hex: '#0a84ff' },
    ];

    function updateTimerDisplay(elapsedSec) {
        const secEl = $('#timer-seconds');
        const ratingEl = $('#timer-rating');
        if (!secEl || !ratingEl) return;

        const rating = getRatingForTime(elapsedSec);
        secEl.textContent = Math.round(elapsedSec) + 's';
        secEl.style.color = rating.hex;
        ratingEl.textContent = rating.label;
        ratingEl.className = 'text-xs font-semibold uppercase tracking-wide ' + rating.color;
    }

    function refreshRatingDisplay() {
        const secEl = $('#timer-seconds');
        const ratingEl = $('#timer-rating');
        if (!secEl || !ratingEl) return;

        const opt = ratingOptions.find(o => o.ease === autoRateEase) || ratingOptions[2];
        secEl.style.color = opt.hex;
        ratingEl.textContent = opt.label;
        ratingEl.className = 'text-xs font-semibold uppercase tracking-wide ' + opt.color;
    }

    window.cycleRating = function() {
        if (current !== S.ANSWER) return;
        const max = window.buttonCount || 4;
        autoRateEase = (autoRateEase % max) + 1;
        refreshRatingDisplay();
    };


    // ═══ Textarea Auto-Resize + Send Button ═══

    function setupTextarea() {
        const ta = $('#user-answer');
        const send = $('#send-btn');
        if (!ta) return;

        function autoResize() {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        }

        function toggleSend() {
            if (!send) return;
            if (ta.value.trim().length > 0) {
                send.classList.remove('opacity-0', 'scale-75', 'pointer-events-none');
                send.classList.add('opacity-100', 'scale-100');
            } else {
                send.classList.add('opacity-0', 'scale-75', 'pointer-events-none');
                send.classList.remove('opacity-100', 'scale-100');
            }
        }

        ta.addEventListener('input', () => { autoResize(); toggleSend(); });

        ta.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                submitTextAnswer();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (ta.value.trim()) {
                    submitTextAnswer();
                } else {
                    startMCMode();
                }
            }
        });
    }


    // ═══════════════════════════════════════════════
    //   CORE ACTIONS
    // ═══════════════════════════════════════════════

    window.submitTextAnswer = function() {
        if (current !== S.QUESTION) return;
        const ta = $('#user-answer');
        if (!ta) return;

        const text = ta.value.trim();
        if (!text) {
            ta.focus();
            return;
        }

        lastUserAnswer = text;
        ta.disabled = true;
        ta.classList.add('opacity-40');
        aiSteps = [];
        renderThoughtStream();
        setState(S.EVALUATING);

        pycmd('evaluate:' + JSON.stringify({
            question: getTextContent('.question'),
            userAnswer: text,
            correctAnswer: getTextContent('.answer')
        }));
    };

    window.startMCMode = function() {
        if (current !== S.QUESTION) return;
        aiSteps = [];
        renderThoughtStream();
        setState(S.MC_LOADING);
        mcAttempts = 0;
        mcCorrectIndex = -1;

        const cardId = window.cardInfo ? window.cardInfo.cardId : null;
        pycmd('mc:generate:' + JSON.stringify({
            question: getTextContent('.question'),
            correctAnswer: getTextContent('.answer'),
            cardId: cardId
        }));
    };

    window.showAnswer = function() {
        if (current !== S.QUESTION || transitioning) return;
        transitioning = true;

        const elapsed = (Date.now() - questionStartTime) / 1000;
        const rating = getRatingForTime(elapsed);
        autoRateEase = rating.ease;

        setState(S.ANSWER);
        pycmd('ans');

        updateTimerDisplay(elapsed);

        requestAnimationFrame(() => {
            const ans = $('#answer-section');
            if (ans) {
                setTimeout(() => {
                    ans.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    transitioning = false;
                }, 50);
            } else {
                transitioning = false;
            }
        });
    };

    window.rateCard = function(ease) {
        if (current !== S.ANSWER) return;
        const max = window.buttonCount || 4;
        if (ease < 1 || ease > max) return;
        console.log('[AnkiPlus] rateCard ease=' + ease + ' state=' + current);
        pycmd('ease' + ease);
    };

    window.proceedAfterEval = function() {
        if (autoRateEase > 0) {
            console.log('[AnkiPlus] proceedAfterEval ease=' + autoRateEase);
            pycmd('ease' + autoRateEase);
        }
    };



    // ═══════════════════════════════════════════════
    //   CALLBACKS FROM BACKEND
    // ═══════════════════════════════════════════════

    window.onEvaluationResult = function(result) {
        if (result.error) {
            showAnswer();
            return;
        }

        setState(S.EVALUATED);
        const score = result.score || 0;
        const feedback = result.feedback || '';
        const missing = result.missing || '';

        if (score >= 90)      autoRateEase = 4;
        else if (score >= 70) autoRateEase = 3;
        else if (score >= 40) autoRateEase = 2;
        else                  autoRateEase = 1;

        const labels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
        const colors = { 1: 'text-error', 2: 'text-warning', 3: 'text-success', 4: 'text-primary' };
        const barColors = { 1: '#ff453a', 2: '#ffd60a', 3: '#30d158', 4: '#0a84ff' };

        const combinedFeedback = feedback + (missing && score < 70 ? ' ' + missing : '');

        const el = $('#eval-result');
        if (el) {
            el.innerHTML = `
                <div class="w-full h-[3px] bg-base-content/6 rounded-full overflow-hidden mb-2">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${score}%; background: ${barColors[autoRateEase]}"></div>
                </div>
                <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="flex items-baseline gap-2">
                        <span class="font-mono text-xl font-bold ${colors[autoRateEase]}">${score}%</span>
                        <span class="text-xs font-semibold uppercase tracking-wide ${colors[autoRateEase]}">${labels[autoRateEase]}</span>
                    </div>
                    <button onclick="document.getElementById('eval-user-ans').classList.toggle('hidden')"
                            class="btn btn-xs btn-ghost text-base-content/30 font-normal">
                        Meine Antwort
                    </button>
                </div>
                <div id="eval-user-ans" class="hidden mb-2 text-[11px] text-base-content/40 italic leading-relaxed px-1 pb-1" style="border-bottom: 1px solid rgba(255,255,255,0.05);">${lastUserAnswer}</div>
                <div style="border-left: 2px solid ${barColors[autoRateEase]}40; padding: 5px 10px; border-radius: 0 4px 4px 0; color: rgba(255,255,255,0.55); font-size: 12px; line-height: 1.5;">
                    ${combinedFeedback}
                </div>
            `;
        }
    };

    window.onMCOptions = function(options) {
        if (!Array.isArray(options) || options.length === 0) {
            showAnswer();
            return;
        }

        mcAttempts = 0;
        mcOptions = options;
        mcWrongPicks = [];
        mcCorrectIndex = options.findIndex(o => o.correct);
        aiSteps = [];

        const area = document.getElementById('mc-card-area');
        if (area) {
            area.classList.remove('hidden');
            area.innerHTML = options.map((opt, i) => `
                <button class="mc-opt" data-index="${i}" data-wrong="false"
                        onclick="selectMCOption(${i})"
                        style="display:flex;flex-direction:column;width:100%;border-radius:9px;border:1px solid rgba(255,255,255,0.07);background:none;padding:0;cursor:pointer;text-align:left;">
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;">
                        <div class="mc-badge" style="width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,0.13);display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(255,255,255,0.38);flex-shrink:0;">${String.fromCharCode(65 + i)}</div>
                        <span class="mc-text" style="font-size:15px;color:rgba(255,255,255,0.75);flex:1;">${opt.text}</span>
                        <span class="mc-icon" style="font-size:14px;font-weight:700;margin-left:auto;display:none;"></span>
                    </div>
                    <div class="mc-exp" style="display:none;background:rgba(0,0,0,0.25);padding:8px 12px 10px 46px;font-size:11.5px;color:rgba(255,255,255,0.45);line-height:1.5;"></div>
                </button>
            `).join('');
        }

        setState(S.MC_ACTIVE); // called AFTER mcOptions is populated
    };

    function lockAllOptions() {
        const all = document.querySelectorAll('#mc-card-area .mc-opt');
        all.forEach(btn => { btn.disabled = true; btn.style.cursor = 'default'; });
    }

    window.selectMCOption = function(index) {
        if (current !== S.MC_ACTIVE) return;
        if (index < 0 || index >= mcOptions.length) return;

        const btn = document.querySelector(`#mc-card-area .mc-opt[data-index="${index}"]`);
        if (!btn) return;

        // Re-click guard — do not re-process an already-wrong option
        if (btn.dataset.wrong === 'true') return;

        mcAttempts++;

        const badge = btn.querySelector('.mc-badge');
        const text = btn.querySelector('.mc-text');
        const icon = btn.querySelector('.mc-icon');
        const exp = btn.querySelector('.mc-exp');

        if (index === mcCorrectIndex) {
            // ── Correct (C3) ──
            btn.style.border = '1px solid rgba(48,209,88,0.45)';
            btn.style.background = 'rgba(48,209,88,0.12)';
            if (badge) { badge.style.background = 'rgba(48,209,88,0.25)'; badge.style.border = '1px solid rgba(48,209,88,0.65)'; badge.style.color = 'rgb(48,209,88)'; }
            if (icon) { icon.textContent = '✓'; icon.style.color = 'rgb(48,209,88)'; icon.style.display = 'block'; }
            if (exp && mcOptions[index].explanation) { exp.textContent = mcOptions[index].explanation; exp.style.display = 'block'; }
            lockAllOptions();
            finishMC(true);
        } else {
            // ── Wrong (W3) ──
            btn.style.border = '1px solid rgba(255,69,58,0.4)';
            btn.style.background = 'rgba(255,69,58,0.12)';
            if (badge) { badge.style.background = 'rgba(255,69,58,0.25)'; badge.style.border = '1px solid rgba(255,69,58,0.6)'; badge.style.color = 'rgb(255,80,65)'; }
            if (text) { text.style.textDecoration = 'line-through'; text.style.textDecorationColor = 'rgba(255,69,58,0.4)'; }
            if (icon) { icon.textContent = '✗'; icon.style.color = 'rgb(255,69,58)'; icon.style.display = 'block'; }
            if (exp && mcOptions[index].explanation) { exp.textContent = mcOptions[index].explanation; exp.style.display = 'block'; }
            mcWrongPicks.push(index);
            degradeStar();
            btn.dataset.wrong = 'true';

            if (mcWrongPicks.length >= 3) {
                revealAnswer(); // auto-reveal after 3 wrong attempts
            }
        }
    };

    function finishMC(wasCorrect) {
        // Set autoRateEase centrally — callers must NOT set it before calling here
        autoRateEase = wasCorrect
            ? (mcAttempts === 1 ? 3 : mcAttempts === 2 ? 2 : 1)
            : 1;

        updateStarsRevealed(autoRateEase);
        setState(S.MC_RESULT);
    }

    function revealAnswer() {
        if (current !== S.MC_ACTIVE) return;

        // Apply C3 to correct option
        const correct = document.querySelector(`#mc-card-area .mc-opt[data-index="${mcCorrectIndex}"]`);
        if (correct) {
            correct.style.border = '1px solid rgba(48,209,88,0.45)';
            correct.style.background = 'rgba(48,209,88,0.12)';
            const badge = correct.querySelector('.mc-badge');
            if (badge) { badge.style.background = 'rgba(48,209,88,0.25)'; badge.style.border = '1px solid rgba(48,209,88,0.65)'; badge.style.color = 'rgb(48,209,88)'; }
            const icon = correct.querySelector('.mc-icon');
            if (icon) { icon.textContent = '✓'; icon.style.color = 'rgb(48,209,88)'; icon.style.display = 'block'; }
            const exp = correct.querySelector('.mc-exp');
            if (exp && mcOptions[mcCorrectIndex] && mcOptions[mcCorrectIndex].explanation) {
                exp.textContent = mcOptions[mcCorrectIndex].explanation;
                exp.style.display = 'block';
            }
        }

        // Dim unchosen options
        document.querySelectorAll('#mc-card-area .mc-opt').forEach(btn => {
            const idx = parseInt(btn.dataset.index, 10);
            if (idx === mcCorrectIndex) return; // already styled green
            if (btn.dataset.wrong === 'true') {
                btn.style.opacity = '0.75'; // keep W3 style visible but slightly faded
            } else {
                btn.style.opacity = '0.35'; // never-selected options
            }
        });

        lockAllOptions();
        finishMC(false); // wasCorrect=false → autoRateEase=1 (Wiederholen)
    }
    window.revealAnswer = revealAnswer;

    function revealAndChat() {
        revealAnswer();    // sets state to MC_RESULT
        openFollowUp();    // opens chat with MC context (state is now MC_RESULT)
    }
    window.revealAndChat = revealAndChat;

    // ═══ MC Stars ═══

    function buildStars() {
        const row = document.getElementById('mc-stars-row');
        if (!row) return;
        row.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const s = document.createElement('span');
            s.className = 'mc-star';
            s.textContent = '★';
            s.style.cssText = 'font-size:22px;line-height:1;color:rgba(255,255,255,0.85);';
            row.appendChild(s);
        }
    }

    function degradeStar() {
        // Called AFTER mcWrongPicks.push() so length already reflects new pick
        const stars = document.querySelectorAll('#mc-stars-row .mc-star');
        const idx = mcWrongPicks.length - 1;
        if (stars[idx]) {
            stars[idx].style.color = 'rgba(255,255,255,0.12)';
            stars[idx].dataset.dimmed = 'true';
        }
    }

    function updateStarsRevealed(ease) {
        const colorMap = { 3: 'rgb(48,209,88)', 2: 'rgb(255,159,10)', 1: 'rgb(255,69,58)' };
        const labelMap = { 3: 'Gut', 2: 'Schwierig', 1: 'Wiederholen' };
        const color = colorMap[ease];

        const row = document.getElementById('mc-stars-row');
        if (!row) return;

        // Color non-dimmed stars
        row.querySelectorAll('.mc-star').forEach(s => {
            if (s.dataset.dimmed !== 'true') s.style.color = color;
        });

        // Append arrow + label
        row.insertAdjacentHTML('beforeend',
            `<span style="font-size:13px;color:rgba(255,255,255,0.3);margin:0 4px;">→</span>`
            + `<span style="font-size:14px;font-weight:600;color:${color};">${labelMap[ease]}</span>`
        );

        // Move row to eval-result
        const evalResult = document.getElementById('eval-result');
        if (evalResult) {
            evalResult.innerHTML = '';
            evalResult.appendChild(row);
        }

        // Dock border tint
        const dockInner = document.querySelector('#unified-dock > div');
        if (dockInner) {
            const borderMap = { 3: 'rgba(48,209,88,0.2)', 2: 'rgba(255,159,10,0.2)', 1: 'rgba(255,69,58,0.2)' };
            dockInner.style.borderColor = borderMap[ease];
        }
    }


    // ═══ Mini-ThoughtStream ═══

    window.onAIStep = function(step) {
        if (!step || !step.phase || !step.label) return;
        // Mark previous steps as done
        aiSteps.forEach(s => { s.status = 'done'; });
        aiSteps.push({ phase: step.phase, label: step.label, status: 'loading' });
        renderThoughtStream();
    };

    function renderThoughtStream() {
        const container = $('#thought-stream');
        if (!container) return;
        const fallback = $('#loading-fallback');
        if (aiSteps.length === 0) {
            container.innerHTML = '';
            if (fallback) fallback.style.display = 'flex';
            return;
        }
        if (fallback) fallback.style.display = 'none';

        const activeStep = aiSteps[aiSteps.length - 1];
        if (!activeStep) return;
        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
                <span class="loading loading-spinner loading-xs" style="width:10px;height:10px;opacity:0.5;"></span>
                <span style="font-size:12px;color:rgba(255,255,255,0.45);">${activeStep.label}</span>
            </div>`;
    }


    // ═══ Chat / Follow-up ═══

    window.openFollowUp = function() {
        if (chatOpen) {
            // Chat is already open — close it
            pycmd('chat:close');
            setChatOpen(false);
            return;
        }
        const mcContext = current === S.MC_RESULT ? {
            wrongPicks: mcWrongPicks.map(i => ({
                text: mcOptions[i]?.text || '',
                explanation: mcOptions[i]?.explanation || ''
            })),
            correctOption: mcOptions[mcCorrectIndex] ? {
                text: mcOptions[mcCorrectIndex].text,
                explanation: mcOptions[mcCorrectIndex].explanation
            } : null,
            attempts: mcAttempts
        } : null;

        pycmd('chat:context:' + JSON.stringify({
            question: getTextContent('.question'),
            userAnswer: $('#user-answer')?.value || '',
            correctAnswer: getTextContent('.answer'),
            mode: current === S.MC_RESULT ? 'mc' : (current === S.EVALUATED ? 'text' : 'show'),
            mcContext
        }));
        pycmd('chat:open');
        setChatOpen(true);
    };

    window.setChatOpen = function(isOpen) {
        chatOpen = isOpen;
        const dock = $('#unified-dock');
        if (dock) {
            if (isOpen) {
                dock.classList.add('dock-hidden');
            } else {
                dock.classList.remove('dock-hidden');
            }
        }
        // Re-render action row to update Nachfragen/Schließen label
        setState(current);
    };


    // ═══ Anki Actions ═══

    // Clear session entry flag when navigating away — so animation plays again on re-entry
    function clearSessionFlag() {
        try { sessionStorage.removeItem('ap_session_active'); } catch(e) {}
    }

    window.editCard = function() { pycmd('edit'); };
    window.toggleMark = function() { pycmd('mark'); };
    window.undoCard = function() { pycmd('undo'); };
    window.replayAudio = function() { pycmd('replay'); };
    window.recordVoice = function() { pycmd('record'); };
    window.suspendCard = function() { pycmd('suspend'); };
    window.buryCard = function() { pycmd('bury'); };


    // ═══ Keyboard ═══

    function onKeydown(e) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'input' || e.target.isContentEditable) return;

        // ESC closes chat if open
        if (e.key === 'Escape' && chatOpen) {
            e.preventDefault();
            pycmd('chat:close');
            setChatOpen(false);
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undoCard(); return; }
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        // ArrowLeft/Right: Navigate review trail (previous/next card)
        if (e.key === 'ArrowLeft') { e.preventDefault(); pycmd('navigate:prev'); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); pycmd('navigate:next'); return; }

        const handlers = {
            'Space': () => {
                if (current === S.QUESTION) showAnswer();
                else if (current === S.MC_ACTIVE) revealAnswer();
                else if (current === S.ANSWER) rateCard(autoRateEase || 3);
                else if (current === S.EVALUATED || current === S.MC_RESULT) proceedAfterEval();
            },
            'Enter': () => {
                if (current === S.QUESTION) startMCMode();
                else if (current === S.MC_ACTIVE) revealAndChat();
                else if (current === S.ANSWER || current === S.EVALUATED || current === S.MC_RESULT) openFollowUp();
            },
            '1': () => { if (current === S.ANSWER) rateCard(1); else if (current === S.MC_ACTIVE) selectMCOption(0); },
            '2': () => { if (current === S.ANSWER) rateCard(2); else if (current === S.MC_ACTIVE) selectMCOption(1); },
            '3': () => { if (current === S.ANSWER) rateCard(3); else if (current === S.MC_ACTIVE) selectMCOption(2); },
            '4': () => { if (current === S.ANSWER) rateCard(4); else if (current === S.MC_ACTIVE) selectMCOption(3); },
            '5': () => current === S.MC_ACTIVE && selectMCOption(4),
            'a': () => current === S.MC_ACTIVE && selectMCOption(0),
            'b': () => current === S.MC_ACTIVE && selectMCOption(1),
            'c': () => current === S.MC_ACTIVE && selectMCOption(2),
            'd': () => current === S.MC_ACTIVE && selectMCOption(3),
            'A': () => current === S.MC_ACTIVE && selectMCOption(0),
            'B': () => current === S.MC_ACTIVE && selectMCOption(1),
            'C': () => current === S.MC_ACTIVE && selectMCOption(2),
            'D': () => current === S.MC_ACTIVE && selectMCOption(3),
            'e': editCard, 'E': editCard,
            'm': toggleMark, 'M': toggleMark, '*': toggleMark,
            'z': undoCard, 'Z': undoCard,
            'r': replayAudio, 'R': replayAudio, 'F5': replayAudio,
            '-': suspendCard, '=': buryCard,
        };

        const handler = handlers[e.code] || handlers[e.key];
        if (handler) { e.preventDefault(); handler(); }
    }


    // ═══ Touch ═══

    let touchY = 0, touchTime = 0;

    function onTouchStart(e) { touchY = e.touches[0].clientY; touchTime = Date.now(); }
    function onTouchEnd(e) {
        const dy = e.changedTouches[0].clientY - touchY;
        const dt = Date.now() - touchTime;
        if (Math.abs(dy) < 10 && dt < 300 && !e.target.closest('button, textarea, input, .btn') && current === S.QUESTION) showAnswer();
        if (dy < -50 && dt < 500 && current === S.QUESTION) showAnswer();
    }


    // ═══ Init ═══

    function init() {
        questionStartTime = Date.now();
        setupTextarea();
        setState(S.QUESTION);
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchend', onTouchEnd, { passive: true });

        document.body.tabIndex = -1;
        document.body.focus();
        window.focus();

        document.addEventListener('click', (e) => {
            const tag = e.target.tagName.toLowerCase();
            if (tag !== 'textarea' && tag !== 'input' && !e.target.isContentEditable) {
                setTimeout(() => { document.body.focus(); }, 10);
            }
        });

        // Session entry animation — only on first card (tab switch), not subsequent cards
        try {
            const isFirstCard = !sessionStorage.getItem('ap_session_active');
            if (isFirstCard) {
                sessionStorage.setItem('ap_session_active', '1');
                const canvas = document.querySelector('.canvas-content');
                const dock = document.getElementById('unified-dock');
                if (canvas) {
                    canvas.style.opacity = '0';
                    canvas.style.transform = 'translateY(6px)';
                    canvas.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
                    requestAnimationFrame(() => {
                        canvas.style.opacity = '1';
                        canvas.style.transform = 'translateY(0)';
                    });
                }
                if (dock) {
                    dock.style.opacity = '0';
                    dock.style.transform = 'translateX(-50%) translateY(12px)';
                    dock.style.transition = 'opacity 0.35s ease 0.1s, transform 0.35s ease 0.1s';
                    requestAnimationFrame(() => {
                        dock.style.opacity = '1';
                        dock.style.transform = 'translateX(-50%) translateY(0)';
                    });
                }
            }
        } catch(e) {}
    }

    window.addEventListener('load', () => {
        current = S.QUESTION;
        mcAttempts = 0;
        mcCorrectIndex = -1;
        mcOptions = [];
        mcWrongPicks = [];
        aiSteps = [];
        autoRateEase = 0;
        questionStartTime = Date.now();
        chatOpen = false;
        setState(S.QUESTION);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window._state = { get: () => current };
    Object.defineProperty(window, 'autoRateEase', {
        get: () => autoRateEase,
        set: (v) => { autoRateEase = v; }
    });
})();

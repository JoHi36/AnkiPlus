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
            case S.QUESTION:
                showSection('dc-input');
                setActions(
                    { label: 'Show Answer', shortcut: 'SPACE', onclick: 'showAnswer()', color: 'rgba(255,255,255,0.88)', weight: '600' },
                    { label: 'Multiple Choice', shortcut: '↵', onclick: 'startMCMode()' }
                );
                break;

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
                setActions(null, null); // no action row — user picks from MC options
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

        let missingHtml = '';
        if (missing && score < 70) {
            missingHtml = `<p class="text-xs text-base-content/40 leading-relaxed mt-1" style="border-left:2px solid rgba(255,255,255,0.08);padding-left:8px;">${missing}</p>`;
        }

        const el = $('#eval-result');
        if (el) {
            el.innerHTML = `
                <div class="w-full h-[3px] bg-base-content/6 rounded-full overflow-hidden mb-2">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${score}%; background: ${barColors[autoRateEase]}"></div>
                </div>
                <div class="flex items-baseline gap-2 mb-1">
                    <span class="font-mono text-xl font-bold ${colors[autoRateEase]}">${score}%</span>
                    <span class="text-xs font-semibold uppercase tracking-wide ${colors[autoRateEase]}">${labels[autoRateEase]}</span>
                </div>
                <p class="text-xs text-base-content/55 leading-relaxed">${feedback}</p>
                ${missingHtml}
            `;
        }
    };

    window.onMCOptions = function(options) {
        if (!Array.isArray(options) || options.length === 0) {
            showAnswer();
            return;
        }

        setState(S.MC_ACTIVE);
        mcAttempts = 0;
        mcOptions = options;
        mcWrongPicks = [];
        mcCorrectIndex = options.findIndex(o => o.correct);
        aiSteps = [];

        const area = $('#mc-area');
        if (area) {
            area.innerHTML = options.map((opt, i) => `
                <div class="mc-option-wrapper" data-index="${i}">
                    <button class="btn btn-ghost justify-start gap-3 h-auto py-3 px-4 rounded-xl text-left font-normal text-sm text-base-content no-animation w-full"
                            data-index="${i}" onclick="selectMCOption(${i})">
                        <span class="badge badge-sm badge-ghost font-mono font-semibold">${String.fromCharCode(65 + i)}</span>
                        <span class="flex-1">${opt.text}</span>
                    </button>
                    <div class="mc-explanation hidden" data-exp-index="${i}"></div>
                </div>
            `).join('');
        }
    };

    function showExplanation(index) {
        const opt = mcOptions[index];
        if (!opt || !opt.explanation) return;
        const expEl = $(`[data-exp-index="${index}"]`);
        if (expEl) {
            expEl.innerHTML = `<p class="text-xs text-base-content/45 px-4 pb-2 pl-12 leading-relaxed">${opt.explanation}</p>`;
            expEl.classList.remove('hidden');
        }
    }

    window.selectMCOption = function(index) {
        if (current !== S.MC_ACTIVE) return;
        mcAttempts++;

        const all = $$('#mc-area .btn');
        const sel = $(`#mc-area .btn[data-index="${index}"]`);

        if (index === mcCorrectIndex) {
            sel.classList.remove('btn-ghost');
            sel.classList.add('btn-success', 'text-success-content');
            sel.querySelector('.badge')?.classList.add('badge-success');
            all.forEach(o => o.disabled = true);
            autoRateEase = mcAttempts === 1 ? 3 : 2;
            showExplanation(index);
            finishMC(true);
        } else {
            mcWrongPicks.push(index);
            sel.classList.remove('btn-ghost');
            sel.classList.add('btn-error', 'opacity-40');
            sel.querySelector('.badge')?.classList.add('badge-error');
            sel.disabled = true;
            // Show explanation for the wrong pick
            showExplanation(index);

            if (mcAttempts >= 2) {
                autoRateEase = 1;
                const correct = $(`#mc-area .btn[data-index="${mcCorrectIndex}"]`);
                if (correct) {
                    correct.classList.remove('btn-ghost');
                    correct.classList.add('btn-success', 'text-success-content');
                    correct.querySelector('.badge')?.classList.add('badge-success');
                }
                showExplanation(mcCorrectIndex);
                all.forEach(o => o.disabled = true);
                finishMC(false);
            }
        }
    };

    function finishMC(wasCorrect) {
        setState(S.MC_RESULT);
        const labels = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
        const colors = { 1: 'text-error', 2: 'text-warning', 3: 'text-success', 4: 'text-primary' };

        const el = $('#eval-result');
        if (el) {
            const icon = wasCorrect ? '✓' : '✗';
            const msg = wasCorrect
                ? (mcAttempts === 1 ? 'Beim ersten Versuch richtig!' : 'Beim zweiten Versuch richtig.')
                : 'Nicht richtig.';

            let wrongSummary = '';
            if (!wasCorrect && mcWrongPicks.length > 0) {
                const wrongExps = mcWrongPicks
                    .map(i => mcOptions[i])
                    .filter(o => o && o.explanation)
                    .map(o => `<span class="text-base-content/35">${o.text}:</span> ${o.explanation}`)
                    .join('<br>');
                if (wrongExps) {
                    wrongSummary = `<div class="text-xs text-base-content/40 mt-2 leading-relaxed">${wrongExps}</div>`;
                }
            }

            el.innerHTML = `
                <div class="flex items-center justify-center gap-2 py-1">
                    <span class="text-lg ${colors[autoRateEase]}">${icon}</span>
                    <span class="text-xs font-semibold uppercase tracking-wide ${colors[autoRateEase]}">${labels[autoRateEase]}</span>
                    <span class="text-xs text-base-content/55">${msg}</span>
                </div>
                ${wrongSummary}
            `;
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

        container.innerHTML = aiSteps.map((step, idx) => {
            const isLast = idx === aiSteps.length - 1;
            const isLoading = step.status === 'loading';
            const isError = step.phase === 'error';
            const dot = isLoading
                ? '<span class="loading loading-spinner loading-xs text-base-content/30" style="width:10px;height:10px;"></span>'
                : isError
                ? '<div style="width:6px;height:6px;border-radius:50%;background:rgba(255,69,58,0.6);"></div>'
                : '<div style="width:5px;height:5px;border-radius:50%;background:rgba(48,209,88,0.4);"></div>';
            const line = !isLast
                ? '<div style="flex:1;width:1px;background:rgba(255,255,255,0.06);min-height:8px;"></div>'
                : '';
            const color = isError ? 'rgba(255,69,58,0.6)' : `rgba(255,255,255,${isLoading ? '0.5' : '0.3'})`;

            return `<div style="display:flex;gap:8px;">
                <div style="display:flex;flex-direction:column;align-items:center;width:14px;padding-top:5px;">
                    ${dot}${line}
                </div>
                <div style="flex:1;padding-bottom:${isLast ? '0' : '4px'};">
                    <span style="font-size:12px;color:${color};">${step.label}</span>
                </div>
            </div>`;
        }).join('');
    }


    // ═══ Chat / Follow-up ═══

    window.openFollowUp = function() {
        if (chatOpen) {
            // Chat is already open — close it
            pycmd('chat:close');
            setChatOpen(false);
            return;
        }
        pycmd('chat:context:' + JSON.stringify({
            question: getTextContent('.question'),
            userAnswer: $('#user-answer')?.value || '',
            correctAnswer: getTextContent('.answer'),
            mode: current === S.MC_RESULT ? 'mc' : (current === S.EVALUATED ? 'text' : 'show')
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

        const handlers = {
            'Space': () => {
                if (current === S.QUESTION) showAnswer();
                else if (current === S.ANSWER) rateCard(autoRateEase || 3);
                else if (current === S.EVALUATED || current === S.MC_RESULT) proceedAfterEval();
            },
            'Enter': () => {
                if (current === S.QUESTION) startMCMode();
                else if (current === S.ANSWER || current === S.EVALUATED || current === S.MC_RESULT) openFollowUp();
            },
            '1': () => current === S.ANSWER && rateCard(1),
            '2': () => current === S.ANSWER && rateCard(2),
            '3': () => current === S.ANSWER && rateCard(3),
            '4': () => current === S.ANSWER && rateCard(4),
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

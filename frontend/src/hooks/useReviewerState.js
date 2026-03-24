import { useReducer, useEffect, useCallback, useRef } from 'react';
import { bridgeAction } from '../actions';

/**
 * useReviewerState — State machine for the card reviewer.
 * Extracted from ReviewerView so App.jsx can use it for the unified ChatInput.
 */

const S = {
  QUESTION: 'question',
  EVALUATING: 'evaluating',
  EVALUATED: 'evaluated',
  MC_LOADING: 'mc_loading',
  MC_ACTIVE: 'mc_active',
  MC_RESULT: 'mc_result',
  ANSWER: 'answer',
};

const initialState = {
  mode: S.QUESTION,
  userAnswer: '',
  evalResult: null,
  mcOptions: null,
  mcAttempts: 0,
  mcStars: 3,
  mcCorrect: null,
  mcSelected: {},
  questionStartTime: Date.now(),
  frozenElapsed: 0,
  selectedRating: 3,
  aiSteps: [],
};

function getAutoRating(ms, chars) {
  const bonus = Math.floor((chars || 50) / 50);
  const s = ms / 1000;
  if (s <= Math.min(6 + bonus, 20)) return 3;
  if (s <= Math.min(15 + bonus * 2, 45)) return 2;
  return 1;
}

function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return { ...initialState, questionStartTime: Date.now() };
    case 'FLIP': {
      const elapsed = Date.now() - state.questionStartTime;
      const rating = getAutoRating(elapsed, action.charCount || 50);
      return { ...state, mode: S.ANSWER, frozenElapsed: elapsed, selectedRating: rating };
    }
    case 'START_EVALUATE':
      return { ...state, mode: S.EVALUATING, aiSteps: [], userAnswer: action.text };
    case 'AI_STEP':
      return { ...state, aiSteps: [...state.aiSteps, action.step] };
    case 'EVAL_RESULT': {
      const score = action.data?.score || 0;
      const rating = score >= 90 ? 4 : score >= 70 ? 3 : score >= 40 ? 2 : 1;
      return { ...state, mode: S.EVALUATED, evalResult: action.data, selectedRating: rating };
    }
    case 'START_MC':
      return { ...state, mode: S.MC_LOADING, aiSteps: [], mcAttempts: 0, mcStars: 3, mcOptions: null, mcCorrect: null, mcSelected: {} };
    case 'MC_OPTIONS':
      return action.data?.length > 0
        ? { ...state, mode: S.MC_ACTIVE, mcOptions: action.data }
        : { ...state, mode: S.QUESTION, aiSteps: [] };
    case 'MC_ATTEMPT': {
      const n = state.mcAttempts + 1;
      const sel = { ...state.mcSelected, [action.index]: action.isCorrect ? 'correct' : 'wrong' };
      if (action.isCorrect) return { ...state, mode: S.MC_RESULT, mcAttempts: n, mcCorrect: true, mcSelected: sel, selectedRating: n === 1 ? 3 : n === 2 ? 2 : 1 };
      const stars = Math.max(0, state.mcStars - 1);
      if (stars === 0) return { ...state, mode: S.MC_RESULT, mcAttempts: n, mcStars: 0, mcCorrect: false, mcSelected: sel, selectedRating: 1 };
      return { ...state, mcAttempts: n, mcStars: stars, mcSelected: sel };
    }
    case 'SET_RATING':
      return { ...state, selectedRating: action.rating };
    default:
      return state;
  }
}

function getPlainText(cd, field) {
  if (field === 'front') return cd.frontField || (cd.frontHtml || '').replace(/<[^>]+>/g, ' ').trim();
  return cd.backField || (cd.backHtml || '').replace(/<[^>]+>/g, ' ').trim();
}

export { S, getPlainText };

export default function useReviewerState(cardData) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cardIdRef = useRef(null);

  // Reset on new card
  useEffect(() => {
    if (cardData?.cardId !== cardIdRef.current) {
      cardIdRef.current = cardData?.cardId;
      dispatch({ type: 'RESET' });
    }
  }, [cardData?.cardId]);

  // When Python sends card.answerShown → FLIP
  useEffect(() => {
    if (cardData && !cardData.isQuestion && state.mode === S.QUESTION) {
      dispatch({ type: 'FLIP', charCount: getPlainText(cardData, 'front').length });
    }
  }, [cardData?.isQuestion]);

  // Listen for Python events
  useEffect(() => {
    const onEval = (e) => dispatch({ type: 'EVAL_RESULT', data: e.detail });
    const onMC = (e) => dispatch({ type: 'MC_OPTIONS', data: e.detail });
    const onStep = (e) => dispatch({ type: 'AI_STEP', step: e.detail });
    window.addEventListener('reviewer.evaluationResult', onEval);
    window.addEventListener('reviewer.mcOptions', onMC);
    window.addEventListener('reviewer.aiStep', onStep);
    return () => {
      window.removeEventListener('reviewer.evaluationResult', onEval);
      window.removeEventListener('reviewer.mcOptions', onMC);
      window.removeEventListener('reviewer.aiStep', onStep);
    };
  }, []);

  // Actions
  const handleFlip = useCallback(() => bridgeAction('card.flip'), []);
  const handleRate = useCallback((ease) => bridgeAction('card.rate', { ease }), []);

  const handleEvaluate = useCallback((text) => {
    if (!cardData) return;
    dispatch({ type: 'START_EVALUATE', text });
    bridgeAction('card.flip');
    bridgeAction('card.evaluate', {
      question: getPlainText(cardData, 'front'),
      userAnswer: text,
      correctAnswer: getPlainText(cardData, 'back'),
    });
  }, [cardData]);

  const handleStartMC = useCallback(() => {
    if (!cardData) return;
    dispatch({ type: 'START_MC' });
    bridgeAction('card.mc.generate', {
      question: getPlainText(cardData, 'front'),
      correctAnswer: getPlainText(cardData, 'back'),
      cardId: cardData.cardId,
    });
  }, [cardData]);

  const handleMCSelect = useCallback((i, ok) => dispatch({ type: 'MC_ATTEMPT', index: i, isCorrect: ok }), []);

  const handleCycleRating = useCallback(() => {
    dispatch({ type: 'SET_RATING', rating: state.selectedRating >= 4 ? 1 : state.selectedRating + 1 });
  }, [state.selectedRating]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (state.mode === S.QUESTION) handleFlip();
        else if ([S.ANSWER, S.EVALUATED, S.MC_RESULT].includes(state.mode)) handleRate(state.selectedRating);
      }
      if ([S.ANSWER, S.EVALUATED, S.MC_RESULT].includes(state.mode) && '1234'.includes(e.key))
        dispatch({ type: 'SET_RATING', rating: +e.key });
      if (state.mode === S.MC_ACTIVE && state.mcOptions) {
        const idx = 'abcd'.indexOf(e.key.toLowerCase());
        if (idx >= 0 && idx < state.mcOptions.length && !state.mcSelected[idx])
          handleMCSelect(idx, state.mcOptions[idx].correct || state.mcOptions[idx].isCorrect || false);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [state.mode, state.selectedRating, state.mcOptions, state.mcSelected, handleFlip, handleRate, handleMCSelect]);

  // Derived
  const showBack = [S.ANSWER, S.EVALUATING, S.EVALUATED].includes(state.mode);
  const isLoading = state.mode === S.EVALUATING || state.mode === S.MC_LOADING;
  const isRateable = [S.ANSWER, S.EVALUATED, S.MC_RESULT].includes(state.mode);

  return {
    state, dispatch, S,
    showBack, isLoading, isRateable,
    handleFlip, handleRate, handleEvaluate, handleStartMC, handleMCSelect, handleCycleRating,
  };
}

import '@testing-library/jest-dom';

// Mock the Anki bridge for all tests
Object.defineProperty(window, 'ankiBridge', {
  value: {
    addMessage: () => {},
    jsError: () => {},
  },
  writable: true,
});

// Mock window.ankiReceive
Object.defineProperty(window, 'ankiReceive', {
  value: () => {},
  writable: true,
});

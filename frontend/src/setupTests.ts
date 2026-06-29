import '@testing-library/r extends-expect';

// Mock next/router if needed
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '',
      pathname: '',
      query: {},
      asPath: '',
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
      events: {
        on: () => {},
        off: () => {}
      }
    };
  }
}));

// ResizeObserver mock for testing
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// MatchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }))
});
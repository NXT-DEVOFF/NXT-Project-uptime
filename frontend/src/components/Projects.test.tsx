import { render, screen, waitFor } from '@testing-library/react';
import { Projects } from './Projects';

// Mock the fetch API
global.fetch = jest.fn();

describe('Projects Component', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('displays loading state initially', async () => {
    // Mock fetch to return a promise that resolves after a delay
    fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    );

    render(<Projects />);

    // Should show loading indicator
    expect(await screen.findByText(/loading projects/i)).toBeInTheDocument();
  });

  test('displays projects when data is loaded', async () => {
    const mockProjects = [
      { id: 1, name: 'Test Project', description: 'A test project', status: 'planning', created_at: new Date().toISOString() }
    ];

    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProjects)
      })
    );

    render(<Projects />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText(/test project/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/test.getByText(/test project/i)).toBeInTheDocument();
    expect(screen.getByText(/a test project/i)).toBeInTheDocument();
  });

  test('displays error message when fetch fails', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 500
      })
    );

    render(<Projects />);

    // Wait for error to appear
    expect(await screen.findByText(/failed to fetch projects/i)).toBeInTheDocument();
  });

  test('displays no projects message when list is empty', async () => {
    fetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      })
    );

    render(<Projects />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });
});
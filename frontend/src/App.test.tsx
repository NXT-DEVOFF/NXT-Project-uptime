// src/App.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock fetch for API calls
global.fetch = jest.fn();

describe('App Component Interactions', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('should submit form with valid data', async () => {
    render(<App />);

    // Fill out the form
    await userEvent.type(screen.getByLabelText(/project name/i), 'Test Project');
    await userEvent.type(screen.getByLabelText(/description/i), 'A test project');
    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'planning');

    // Mock successful API response
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 1, name: 'Test Project', description: 'A test project', status: 'planning' })
    });

    // Submit the form
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    // Check that submit button was disabled during request
    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled();

    // Wait for success message
    await waitFor(() => {
      expect(screen.getByText(/project created successfully/i)).toBeInTheDocument();
    });

    // Verify API was called with correct data
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Project',
          description: 'A test project',
          status: 'planning'
        })
      })
    );
  });

  test('should show error when project name is missing', async () => {
    render(<App />);

    // Try to submit empty form
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    // Should show validation error
    expect(await screen.findByText(/project name is required/i)).toBeInTheDocument();
  });

  test('should show error when project name is too long', async () => {
    render(<App />);

    // Fill name with 256 characters (max is 255)
    const longName = 'a'.repeat(256);
    await userEvent.type(screen.getByLabelText(/project name/i), longName);

    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    // Should show validation error
    expect(await screen.findByText(/project name is too long/i)).toBeInTheDocument();
  });

  test('should show error when description is too long', async () => {
    render(<App />);

    // Fill description with 1001 characters (max is 1000)
    const longDesc = 'a'.repeat(1001);
    await userEvent.type(screen.getByLabelText(/description/i), longDesc);

    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    // Should show validation error
    expect(await screen.findByText(/description is too long/i)).toBeInTheDocument();
  });
});
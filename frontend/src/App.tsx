import { useState } from 'react';
import { motion } from 'framer-motion';
import { Projects } from './components/Projects';

function App() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planning' as const
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMessage(null);

    // Basic client-side validation
    if (!formData.name.trim()) {
      setSubmitMessage('Project name is required');
      setSubmitting(false);
      return;
    }

    if (formData.name.length > 255) {
      setSubmitMessage('Project name is too long (max 255 characters)');
      setSubmitting(false);
      return;
    }

    if (formData.description.length > 1000) {
      setSubmitMessage('Description is too long (max 1000 characters)');
      setSubmitting(false);
      return;
    }

    // Validate status
    const validStatuses = ['planning', 'in_progress', 'review', 'completed', 'on_hold'];
    if (!validStatuses.includes(formData.status)) {
      setSubmitMessage('Invalid project status');
      setSubmitting(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }

      const response = await fetch(`${apiUrl}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to create project: ${response.status}`);
      }

      const newProject = await response.json();
      setSubmitMessage('Project created successfully!');

      // Reset form
      setFormData({ name: '', description: '', status: 'planning' });

      // Refresh projects list by triggering a refetch in Projects component
      // In a real app, we might use state management or refetch here
      // For simplicity, we'll just show the success message
    } catch (err) {
      setSubmitMessage(err instanceof Error ? err.message : 'An error occurred while creating the project');
      console.error('Error creating project:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-b from-blue-50 to-indigo-100"
    >
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="bg-white/80 backdrop-blur-sm shadow-md sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center">
            <span className="mr-3">🚀</span> NXT Project Tracker
          </h1>
          <p className="mt-2 text-gray-600">
            Share your project progress with friends and teammates
          </p>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="space-y-8">
          {/* Project Form */}
          <motion.section
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Add New Project</h2>
            {submitMessage && (
              <div className={`mb-4 p-3 rounded-lg ${
                submitMessage.includes('successfully') || submitMessage.includes('Success')
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {submitMessage}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Project Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  maxLength="255"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  maxLength="1000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="planning">Planning</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-md transition-transform duration-200 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Project'}
              </button>
            </form>
          </motion.section>

          {/* Projects List */}
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 flex items-center">
              <span className="mr-3">📊</span> Your Projects
            </h2>
            <Projects />
          </motion.section>
        </div>
      </main>

      <motion.footer
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="bg-white/80 backdrop-blur-sm shadow-md mt-12"
      >
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600">
          <p>&copy; {new Date().getFullYear()} NXT Project Tracker. Built with React, Vite, Tailwind, Framer Motion, Express, MySQL, and Redis.</p>
        </div>
      </motion.footer>
    </motion.div>
  );
}

export default App;
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
}

export const Projects = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        // Validate API URL is set
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) {
          throw new Error('API URL not configured');
        }

        const response = await fetch(`${apiUrl}/projects`);
        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }
        const data = await response.json();

        // Basic validation of received data
        if (!Array.isArray(data)) {
          throw new Error('Invalid data format received from API');
        }

        setProjects(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error('Error fetching projects:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12"
      >
        <div className="inline-block animate-pulse">
          <svg className="h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 6v6l4 2"></path>
          </svg>
        </div>
        <p className="mt-4 text-gray-500">Loading projects...</p>
      </motion.div>
    );
  }

  if (error message
  {error
</parameter
>{/* </parameter
>/* Error display with motion animation */}
    { /* }}  className="   }}initial="0, opacity:="0
  : {{:, y:"20
  animate {{:
    animation:="1,
    y:="0
    }}
  transition className=
{{  duration: background="0.5
  border
  border-red-=
  border-l-4="  text-red-700
   px-4
    p-4
    mb-6
  ">
   p

    >Error: {error}</p

  </motion.div      );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="space-y-6"
    >
      {projects.length === 0 ? (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-gray-500 py-8"
        >
          No projects yet. Add your first project!
        </motion.p>
      ) : (
        <motion.ul
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, staggerChildren: 0.1 }}
          className="divide-y divide-gray-200"
        >
          {projects.map((project) => (
            <motion.li
              key={project.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex justify-between items-center p-4"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{project.name}</h3>
                <p className="text-gray-600 mt-1">{project.description || 'No description'}</p>
                <div className="mt-2 flex items-center text-sm">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    project.status === 'in_progress'
                      ? 'bg-blue-100 text-blue-800'
                      : project.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : project.status === 'planning'
                      ? 'bg-yellow-100 text-yellow-800'
                      : project.status === 'review'
                      ? 'bg-purple-100 text-purple-800'
                      : project.status === 'on_hold'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <time dateTime={project.created_at}>
                  {new Date(project.created_at).toLocaleDateString()}
                </time>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </motion.div>
  );
};
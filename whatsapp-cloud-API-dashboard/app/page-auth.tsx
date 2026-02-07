'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LoginForm from '@/components/LoginForm';

interface Message {
  sid: string;
  from: string;
  to: string;
  body: string;
  date_sent: string;
  status: string;
  direction: string;
}

interface Conversation {
  phoneNumber: string;
  messages: Message[];
  lastMessage: Message;
}

interface Analytics {
  totalConversations: number;
  totalMessages: number;
  aiMessages: number;
  humanMessages: number;
  avgResponseTime: number;
  messagesLast24h: number;
  messagesLast7d: number;
}

type FilterType = 'all' | '4h' | '8h' | '24h' | 'old';
type SortType = 'newest' | 'oldest' | 'active';

function WhatsAppDashboardContent() {
  const { signOut } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  // Add your existing functions here (fetchMessages, sendMessage, etc.)
  const fetchMessages = async () => {
    try {
      const response = await fetch('/api/messages/fetch');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      // Your existing message processing logic...
      setLoading(false);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch messages');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-1/3 bg-white border-r border-gray-300 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-green-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">CustomCX</h1>
              <p className="text-sm text-green-100">WhatsApp Dashboard</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className="px-3 py-1 bg-blue-600 rounded text-sm hover:bg-blue-700"
              >
                📊 Analytics
              </button>
              <button
                onClick={fetchMessages}
                className="px-3 py-1 bg-green-700 rounded text-sm hover:bg-green-800"
              >
                Refresh
              </button>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`px-3 py-1 rounded text-sm ${
                  autoRefresh 
                    ? 'bg-yellow-600 hover:bg-yellow-700' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {autoRefresh ? 'Auto ON' : 'Auto OFF'}
              </button>
              <button
                onClick={signOut}
                className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Rest of your dashboard content */}
        <div className="flex-1 p-4">
          <div className="text-center text-gray-500">
            Dashboard content will be here...
            <br />
            <small>Copy your existing dashboard JSX here</small>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-6xl mb-4">💬</div>
            <div className="text-xl">Select a conversation to start messaging</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppDashboard() {
  const { user, loading: authLoading } = useAuth();

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return <LoginForm />;
  }

  // Show dashboard if authenticated
  return <WhatsAppDashboardContent />;
}

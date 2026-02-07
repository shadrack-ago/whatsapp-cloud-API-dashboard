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

export default function WhatsAppDashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
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

  const fetchMessages = async () => {
    try {
      const response = await fetch('/api/messages/fetch');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch messages');
      }

      // Group messages by phone number
      const messageGroups: { [key: string]: Message[] } = {};
      
      data.messages.forEach((message: Message) => {
        const phoneNumber = message.direction === 'inbound' 
          ? message.from.replace('whatsapp:', '') 
          : message.to.replace('whatsapp:', '');
        
        if (!messageGroups[phoneNumber]) {
          messageGroups[phoneNumber] = [];
        }
        messageGroups[phoneNumber].push(message);
      });

      // Convert to conversations array and sort by most recent message
      const conversationList: Conversation[] = Object.entries(messageGroups).map(([phoneNumber, messages]) => {
        const sortedMessages = messages.sort((a, b) => 
          new Date(b.date_sent).getTime() - new Date(a.date_sent).getTime()
        );
        return {
          phoneNumber,
          messages: sortedMessages,
          lastMessage: sortedMessages[0]
        };
      }).sort((a, b) => 
        new Date(b.lastMessage.date_sent).getTime() - new Date(a.lastMessage.date_sent).getTime()
      );

      setConversations(conversationList);
      calculateAnalytics(conversationList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;

    setSending(true);
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: selectedConversation.phoneNumber,
          body: newMessage.trim(),
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('Send message error:', data);
        // Show more detailed error information
        const errorMsg = data.error || 'Failed to send message';
        const details = data.details ? ` (Code: ${data.details.code})` : '';
        throw new Error(errorMsg + details);
      }

      setNewMessage('');
      setError(null); // Clear any previous errors
      // Refresh messages to show the sent message
      await fetchMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const isOutside24HourWindow = (conversation: Conversation) => {
    if (!conversation.lastMessage) return false;
    
    const lastMessageTime = new Date(conversation.lastMessage.date_sent).getTime();
    const now = new Date().getTime();
    const hoursDiff = (now - lastMessageTime) / (1000 * 60 * 60);
    
    // Only check for inbound messages (customer messages)
    return conversation.lastMessage.direction === 'inbound' && hoursDiff > 24;
  };


  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPhoneNumber = (phoneNumber: string) => {
    return phoneNumber.replace('whatsapp:', '');
  };

  const calculateAnalytics = (conversations: Conversation[]) => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let totalMessages = 0;
    let aiMessages = 0;
    let humanMessages = 0;
    let messagesLast24h = 0;
    let messagesLast7d = 0;
    let totalResponseTime = 0;
    let responseCount = 0;
    
    conversations.forEach(conv => {
      conv.messages.forEach((message, index) => {
        totalMessages++;
        const messageDate = new Date(message.date_sent);
        
        if (messageDate > last24h) messagesLast24h++;
        if (messageDate > last7d) messagesLast7d++;
        
        // Detect AI vs Human messages (AI messages are typically faster)
        if (message.direction === 'outbound-api') {
          const prevMessage = conv.messages[index + 1];
          if (prevMessage && prevMessage.direction === 'inbound') {
            const responseTime = new Date(message.date_sent).getTime() - new Date(prevMessage.date_sent).getTime();
            totalResponseTime += responseTime;
            responseCount++;
            
            // AI typically responds within 30 seconds, humans take longer
            if (responseTime < 30000) {
              aiMessages++;
            } else {
              humanMessages++;
            }
          } else {
            humanMessages++; // Assume human for business-initiated messages
          }
        }
      });
    });
    
    setAnalytics({
      totalConversations: conversations.length,
      totalMessages,
      aiMessages,
      humanMessages,
      avgResponseTime: responseCount > 0 ? totalResponseTime / responseCount : 0,
      messagesLast24h,
      messagesLast7d
    });
  };

  const filterConversations = (conversations: Conversation[], filter: FilterType, searchTerm: string) => {
    const now = new Date();
    let filtered = conversations;
    
    // Apply time filter
    if (filter !== 'all') {
      filtered = conversations.filter(conv => {
        const lastMessageTime = new Date(conv.lastMessage.date_sent);
        const hoursDiff = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60 * 60);
        
        switch (filter) {
          case '4h': return hoursDiff <= 4;
          case '8h': return hoursDiff <= 8;
          case '24h': return hoursDiff <= 24;
          case 'old': return hoursDiff > 24;
          default: return true;
        }
      });
    }
    
    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(conv => 
        conv.phoneNumber.includes(searchTerm) ||
        conv.messages.some(msg => msg.body.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      const aTime = new Date(a.lastMessage.date_sent).getTime();
      const bTime = new Date(b.lastMessage.date_sent).getTime();
      
      switch (sortBy) {
        case 'newest': return bTime - aTime;
        case 'oldest': return aTime - bTime;
        case 'active': {
          const aRecent = (new Date().getTime() - aTime) / (1000 * 60 * 60);
          const bRecent = (new Date().getTime() - bTime) / (1000 * 60 * 60);
          return aRecent - bRecent;
        }
        default: return bTime - aTime;
      }
    });
    
    return filtered;
  };

  const isAIMessage = (message: Message, allMessages: Message[], index: number) => {
    if (message.direction !== 'outbound-api') return false;
    
    const prevMessage = allMessages[index + 1];
    if (prevMessage && prevMessage.direction === 'inbound') {
      const responseTime = new Date(message.date_sent).getTime() - new Date(prevMessage.date_sent).getTime();
      return responseTime < 30000; // AI responds within 30 seconds
    }
    return false;
  };

  const formatResponseTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getFilterLabel = (filter: FilterType) => {
    switch (filter) {
      case '4h': return 'Last 4 hours';
      case '8h': return 'Last 8 hours';
      case '24h': return 'Last 24 hours';
      case 'old': return 'Older than 24h';
      default: return 'All conversations';
    }
  };

  // All useEffect hooks must come after function definitions but before any conditional returns
  useEffect(() => {
    fetchMessages();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    const filtered = filterConversations(conversations, filter, searchTerm);
    setFilteredConversations(filtered);
  }, [conversations, filter, searchTerm, sortBy]);

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Loading conversations...</div>
      </div>
    );
  }

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
                    ? 'bg-green-700 hover:bg-green-800' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                Auto: {autoRefresh ? 'ON' : 'OFF'}
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

        {/* Analytics Panel */}
        {showAnalytics && analytics && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">📊 Analytics Dashboard</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-white p-3 rounded border">
                <div className="text-gray-600">Total Conversations</div>
                <div className="text-xl font-bold text-blue-600">{analytics.totalConversations}</div>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="text-gray-600">Messages (24h)</div>
                <div className="text-xl font-bold text-green-600">{analytics.messagesLast24h}</div>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="text-gray-600">Avg Response Time</div>
                <div className="text-xl font-bold text-orange-600">{formatResponseTime(analytics.avgResponseTime)}</div>
              </div>
              <div className="bg-white p-3 rounded border">
                <div className="text-gray-600">AI vs Human</div>
                <div className="text-sm">
                  <span className="text-purple-600 font-bold">{analytics.aiMessages} AI</span> / 
                  <span className="text-blue-600 font-bold">{analytics.humanMessages} Human</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search conversations or messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-green-500 text-gray-900"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', '4h', '8h', '24h', 'old'] as FilterType[]).map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={`px-3 py-1 rounded text-sm ${
                  filter === filterType
                    ? 'bg-green-600 text-white'
                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {getFilterLabel(filterType)}
              </button>
            ))}
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Showing {filteredConversations.length} of {conversations.length} conversations
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-100 border-b border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-4 text-gray-500 text-center">
              {searchTerm ? 'No conversations match your search' : 'No conversations found'}
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.phoneNumber}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                  selectedConversation?.phoneNumber === conversation.phoneNumber 
                    ? 'bg-green-50 border-l-4 border-l-green-600' 
                    : ''
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-gray-900">
                        {formatPhoneNumber(conversation.phoneNumber)}
                      </div>
                      {isOutside24HourWindow(conversation) && (
                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">24h+</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 truncate mt-1">
                      {conversation.lastMessage.body}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 ml-2">
                    {formatTime(conversation.lastMessage.date_sent)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Chat header */}
            <div className="p-4 bg-green-600 text-white border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">
                  {formatPhoneNumber(selectedConversation.phoneNumber)}
                </h2>
                <div className="text-sm text-green-100">CustomCX Agent</div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedConversation.messages
                .slice()
                .reverse()
                .map((message) => (
                <div
                  key={message.sid}
                  className={`flex ${
                    message.direction === 'outbound-api' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div className="flex flex-col items-end max-w-xs lg:max-w-md">
                    {message.direction === 'outbound-api' && (
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        {isAIMessage(message, selectedConversation.messages.slice().reverse(), selectedConversation.messages.slice().reverse().indexOf(message)) ? (
                          <><span className="text-purple-600">🤖</span> AI Response</>
                        ) : (
                          <><span className="text-blue-600">👤</span> Manual Reply</>
                        )}
                      </div>
                    )}
                    <div
                      className={`px-4 py-2 rounded-lg ${
                        message.direction === 'outbound-api'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 border border-gray-400'
                      }`}
                    >
                      <div className={`text-sm ${
                        message.direction === 'outbound-api' ? 'text-white' : 'text-gray-900'
                      }`}>{message.body}</div>
                      <div
                        className={`text-xs mt-1 ${
                          message.direction === 'outbound-api' 
                            ? 'text-green-100' 
                            : 'text-gray-700'
                        }`}
                      >
                        {formatTime(message.date_sent)} • {message.status}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Message input */}
            <div className="p-4 bg-white border-t border-gray-300">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:border-green-500 text-gray-900 placeholder-gray-500"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <div className="text-xl">Select a conversation to start messaging</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
